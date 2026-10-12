# Merchant Portal Frontend — Technical Overview

This document is the single source of truth for the frontend codebase. Any AI or human reading it should be able to understand the architecture, conventions, and backend contract without opening a single source file.

---

## 1. Purpose

An Angular 20 frontend for a merchant payments portal. Three roles (SALES, REVIEWER, ADMIN) across:
- a multi-step merchant application wizard (create + edit) with autosave
- a paginated dashboard with server-side filtering
- a review workflow with assignment and reviewer decisions
- an admin user management page

---

## 2. Demo notice

This is a **demonstration build**. Mechanisms a production release would require are deliberately simplified:

- **Tokens stored in `localStorage`.** Production moves the refresh token to an HttpOnly cookie and keeps the access token in memory only.
- **No CSRF protection.** Bearer tokens are inherently CSRF-resistant, but once the refresh token moves to a cookie a synchronizer-token pattern must be added.
- **No CSP is served.** The policy documented in §6 is what production should apply at the reverse proxy.
- **No rate limiting** on auth endpoints.
- **No server-side token revocation on logout** beyond deleting the refresh token locally.

Everything else — routing, guards, form validation, RBAC enforcement, data flow, and test coverage — is production-grade.

---

## 3. Tech Stack

- Angular 20, standalone components, zoneless change detection
- Signals + computed + effect for state; RxJS for streams
- Reactive Forms (typed, with custom validators)
- Angular Material for UI components
- Tailwind CSS v4 for layout utilities (`@theme` in `styles.scss`, no config file)
- SCSS for global tokens and Material theming only
- Vitest + Angular TestBed for unit tests
- TypeScript strict mode
- Path aliases: `@core/*`, `@shared/*`, `@features/*`, `@layout/*`, `@env/*` (in `tsconfig.json` and mirrored in `vitest.config.ts`)

---

## 4. Backend Contract

**Base URL:** `http://localhost:3000/api` (set in `src/environments/environment.ts`)

### Auth

- `POST /auth/signup` → `{ access_token, refresh_token, user }`
- `POST /auth/login` → `{ access_token, refresh_token, user }`
- `POST /auth/refresh` → `{ access_token, refresh_token, user }`
- `GET  /auth/me` → `User`

Access tokens expire in 15 min. Refresh tokens expire in 7 days and rotate on every use. Concurrent 401s trigger **exactly one** refresh; queued requests retry with the new token.

### Roles

- **SALES** — creates and edits their own applications; sees only their own.
- **REVIEWER** — sees only applications **assigned to them**; records decisions.
- **ADMIN** — sees everything, assigns reviewers, deletes applications, manages users.

### Applications

- `GET    /applications` — paginated; role-scoped
- `GET    /applications/:id`
- `POST   /applications` — SALES, ADMIN
- `PATCH  /applications/:id` — SALES, ADMIN (DRAFT only for SALES)
- `PATCH  /applications/:id/submit` — SALES, ADMIN
- `PATCH  /applications/:id/assign` — ADMIN (body: `{ reviewer_id: string | null }`)
- `DELETE /applications/:id` — ADMIN

Responses embed `sales_rep` and `assigned_reviewer` as compact `UserSummary` objects.

### Reviews

- `GET  /applications/:id/reviews`
- `POST /applications/:id/reviews` — REVIEWER (assigned only), ADMIN

A review carries two fields:
- **`action`** — `APPROVE` | `REJECT` | `UNDER_REVIEW`, which drives the resulting status.
- **`decision`** — `LOW` | `MEDIUM` | `HIGH` | `REJECTED`, the risk assessment.

### Users (ADMIN only)

- `GET    /users` — paginated, filter by `role`
- `PATCH  /users/:id/role` — change another user's role
- `DELETE /users/:id` — delete another user (guarded)

### Pagination envelope

```json
{
  "data": [ ...items ],
  "meta": { "total", "page", "limit", "total_pages", "has_next", "has_prev" }
}
```

Query params: `page` (≥ 1, default 1), `limit` (1–100, default 10).

### Enums

```
ApplicationStatus: DRAFT | SUBMITTED | UNDER_REVIEW | APPROVED | REJECTED
RiskDecision:      LOW | MEDIUM | HIGH | REJECTED
ReviewAction:      APPROVE | REJECT | UNDER_REVIEW
UserRole:          SALES | REVIEWER | ADMIN
```

### Status transitions

| From | Trigger | To |
|---|---|---|
| DRAFT | SALES submits | SUBMITTED |
| SUBMITTED | Action APPROVE | APPROVED |
| SUBMITTED | Action REJECT | REJECTED |
| SUBMITTED | Action UNDER_REVIEW | UNDER_REVIEW |
| UNDER_REVIEW | Action APPROVE | APPROVED |
| UNDER_REVIEW | Action REJECT | REJECTED |
| UNDER_REVIEW | Action UNDER_REVIEW | UNDER_REVIEW |

Every status is reachable through user action. None are seed-only.

---

## 5. Architecture

### Folder layout

```
src/
  environments/            API base URL config
  app/
    app.ts                 root component
    app.config.ts          providers: router, http, interceptors, animations
    app.routes.ts          top-level routes (lazy-loaded features)
    core/                  singletons: auth, http, api clients, models
    shared/                reusable UI: components, directives, validators
    layout/                app shell: header, nav, shell
    features/              lazy-loaded feature areas
      admin/users/           user management (ADMIN)
      applications/
        wizard/              multi-step create + edit
        detail/              sectioned view, assignment, reviewer panel
      auth/                  login, signup
      dashboard/             paginated list
```

### Layer responsibilities

- **core/** — No UI. Services, guards, interceptors, API clients, models.
- **shared/** — No business logic. Reusable, presentational, standalone.
- **layout/** — The persistent shell around routed views.
- **features/** — One folder per user-facing area. Each has its own routes file.

### Declarative conventions

- Signals for state: `signal()`, `computed()`, `effect()`
- RxJS only where streams earn their place: HTTP, debounce, pagination
- No manual subscriptions; use `toSignal()` or the `async` pipe
- Functional guards and interceptors
- `input()`, `output()`, `model()` for component I/O
- `inject()` in field initializers — no constructor injection
- `@if` / `@for` / `@switch` in templates — no `*ngIf` / `*ngFor`

---

## 6. Security

### Token storage (demo limitation)

Tokens are stored in `localStorage` under `mp.session`. This is documented as a demo simplification. In production:

- Refresh token → `HttpOnly`, `Secure`, `SameSite=Strict` cookie
- Access token → in memory only (signal)
- Silent refresh on page load driven by the cookie
- Backend revokes the token family on logout

Only `TokenStorageService` needs to change to support the migration.

### Role gating

Two layers:

1. **UI gating** — `*appHasRole` structural directive hides elements.
2. **Route gating** — `roleGuard(...)` on routes, `authGuard` on the shell, `guestGuard` on public routes.

Both are UX only. The backend enforces the same rules on every request. Tampering with `localStorage` produces the wrong UI but no unauthorized action.

### Sensitive field masking

`MaskedFieldComponent` masks values by default. Reveal is per-instance and not persisted; refresh re-masks.

### Content Security Policy

Production should serve:

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data:;
connect-src 'self' https://api.example.com;
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
```

`unsafe-inline` for styles is required in dev because Tailwind injects `<style>` tags; production can tighten to `'self'`.

---

## 7. Running the app

```
npm install
npm start        # dev server on http://localhost:4200
```

The backend must be running at `http://localhost:3000/api`.

User accounts are created via the signup page or the backend's seed. Roles are assigned at signup time.

---

## 8. Testing

Vitest + Angular TestBed.

```bash
npm test           # single run
npm run test:watch # watch mode
```

### What is covered

| Spec | What it verifies |
|---|---|
| `core/http/auth.interceptor.spec.ts` | Bearer attachment, public-endpoint bypass, single-flight refresh across 3 concurrent 401s, session clear on refresh failure |
| `core/auth/role.guard.spec.ts` | Allows correct role, redirects wrong role, redirects unauthenticated with returnUrl |
| `core/auth/guest.guard.spec.ts` | Allows unauthenticated, redirects authenticated away from public routes |
| `shared/components/masked-field/*.spec.ts` | Masked by default, reveals on click, re-masks, hides toggle when `revealable=false`, aria-pressed state |
| `shared/components/save-status/*.spec.ts` | Correct label per status, aria-live region |

### The single-flight refresh test

Fires 3 concurrent GET requests, mocks all three returning 401, asserts exactly one `POST /auth/refresh`, all three retries carry the new token, all three promises resolve.

### Setup notes

- Config: `vitest.config.ts` (uses `@analogjs/vite-plugin-angular`).
- Bootstrap: `src/test-setup.ts`.
- Tests run in **jsdom**.
- Specs use `provideZonelessChangeDetection()` to match the runtime.

---

## 9. UI Layer — Material + Tailwind

- **Angular Material** — toolbar, sidenav, buttons, icons, menus, form fields, tables, dialogs, snackbars, autocomplete, chips. Accessibility (focus management, ARIA, keyboard nav) is handled by Material.
- **Tailwind CSS** — layout only: flex, grid, spacing, responsive breakpoints, design tokens.

The theme is defined once in `styles.scss` via Material's M3 API (Azure primary, density `-1`).

**Rule of thumb:** components = Material, layout = Tailwind.

### Layout shell

- `app-header` — `mat-toolbar` with user menu and hamburger toggle
- `app-nav` — `mat-sidenav` with role-filtered links
- `<router-outlet>` — routed feature content

Sidebar is persistent above the `md:` breakpoint, overlays below it.

### Permission-aware UI

- `*appHasRole="['SALES','ADMIN']"` — structural directive that renders its host only when the user's role is in the list.
- `roleGuard('SALES','ADMIN')` — functional route guard; wrong role → `/dashboard`.

Both UX only. Backend enforces.

### Responsive design

- Single-column on mobile, multi-column at `sm:` and `md:`.
- Sidenav overlays below `md:`.
- Tables drop columns on narrow viewports rather than scrolling.
- All interactive elements keyboard-accessible.

---

## 10. Auth Pipeline

### TokenStorageService (`core/auth/token-storage.service.ts`)

HTTP-free. Owns `localStorage` persistence and exposes session signals: `accessToken`, `refreshToken`, `user`, `isAuthenticated`. Separated from `AuthService` so the interceptor can depend on it without creating a cycle.

### AuthService (`core/auth/auth.service.ts`)

Public API for login/signup/logout/me. Exposes `user`, `role`, `isAuthenticated` signals. Delegates persistence to `TokenStorageService`.

### AuthRefreshService (`core/auth/auth-refresh.service.ts`)

Concurrent-401 coordinator. Uses `HttpBackend` directly (bypassing interceptors, so no recursion) to `POST /auth/refresh`. `HttpBackend` emits a stream of `HttpEvent`s; the pipeline uses `filter(event => event instanceof HttpResponse)` and `take(1)` to extract only the final body.

Holds an `inFlight$` observable. The first 401 starts the refresh; every other 401 subscribes to the same observable via `shareReplay({ bufferSize: 1, refCount: false })`. `finalize` clears the cache so the next 401 starts a fresh refresh. All failures are normalized to `HttpErrorResponse`.

### authInterceptor (`core/http/auth.interceptor.ts`)

On every non-public request:

1. Attach `Authorization: Bearer <access>` if a token exists.
2. On 401: call `AuthRefreshService.refresh()`.
3. On success: retry the original request with the new token.
4. On failure: clear session, navigate to `/login?reason=session-expired`.

Public endpoints (`/auth/login`, `/auth/signup`, `/auth/refresh`) bypass both token attachment and refresh retry.

### errorInterceptor (`core/http/error.interceptor.ts`)

Runs first in the chain so it wraps `authInterceptor` on the response side. Normalizes any thrown error into an `HttpErrorResponse` (via `instanceof`, duck-typing, then a fallback wrapper) and surfaces a toast through `NotificationService`.

Toast policy:

- 401 on `/auth/login` or `/auth/signup` → "Invalid email or password."
- 401 elsewhere → suppressed (session-expiry redirect owns the UX)
- 400/422 with FastAPI detail → parsed field message
- 403 / 404 / 409 / 429 → status-specific messages
- 5xx → "Server error. Please try again shortly."
- status 0 → "Cannot reach the server."
- request cancelled → suppressed

### Guards

- `authGuard` — session required; else `/login` with `returnUrl`.
- `roleGuard(...roles)` — unauthenticated → `/login`; wrong role → `/dashboard`.
- `guestGuard` — authenticated users away from `/login` and `/signup`.

### Validation alignment

`strictEmail` mirrors the backend's Pydantic `EmailStr` rules so invalid emails are caught before a 422. Backend validation errors are parsed by `core/http/api-error.ts` for both FastAPI's simple `{ detail: string }` and structured array shapes.

### NotificationService (`shared/services/notification.service.ts`)

Thin wrapper around `MatSnackBar` exposing `error()`, `info()`, `success()`. `errorInterceptor` calls `notify.error()` before re-throwing; component-level handlers still run.

---

## 11. Feature Walkthroughs

### Dashboard (`features/dashboard/`)

**Fetch pipeline:**

```
combineLatest([
  pageIndex$, pageSize$, statusFilter$, debouncedSearch$, reload$
])
  → switchMap(api.list)
  → ViewState (loading | success | error)
  → toSignal
```

**Columns:** merchant name, contact email, created by, assigned to, status badge, updated date. Columns are hidden on narrow viewports via Tailwind breakpoints.

**Role-aware:**

- SALES sees only their own; the "New application" button is visible.
- REVIEWER sees only assigned; the "New application" button is hidden.
- ADMIN sees all; row actions include edit (DRAFT only) and delete.

**Actions:**

- Edit (pencil) — visible for DRAFT rows the current user can edit.
- Delete — ADMIN only; inline confirmation, then calls `DELETE /applications/:id`.

**States:** loading bar, inline error alert with Retry button, empty state with role-appropriate copy.

### Wizard (`features/applications/wizard/`)

**Two modes:**

- Create: route `/applications/new`. No `id` input. First valid save POSTs; subsequent saves PATCH.
- Edit: route `/applications/:id/edit`. The route param arrives as the `id` input (via `withComponentInputBinding`). The existing DRAFT is loaded with `emitEvent: false` so the load doesn't trigger a save. Every change autosaves via PATCH.

**Structure:** two typed sub-groups (`merchant`, `contact`) bound to `mat-step`s via `[stepControl]`, so per-step validation gates navigation.

**Autosave:**

```
form.valueChanges
  → debounceTime(1200)
  → filter(valid)
  → distinctUntilChanged(deepEqual)
  → tap(set 'saving')
  → switchMap(create | update)
  → tap(set 'saved')
  → catchError → set 'error', return EMPTY
```

On error the form is left untouched; the next keystroke retries.

**Submit:** PATCHes the final value (or POSTs on first save), then calls `/submit`, then navigates to the detail page.

### Detail (`features/applications/detail/`)

Sectioned layout:

- **Assignment** — ADMIN only. Autocomplete over REVIEWER users, backed by `UsersApi.list({ role: 'REVIEWER' })`. Assign or unassign. Disabled for DRAFT applications.
- **Merchant details** — name, business type, revenue, created by, submitted date, assigned reviewer, current risk level.
- **Contact details** — email and phone, masked with per-field reveal.
- **Decision history** — chronological list showing action, risk level, comment, timestamp.
- **Review panel** — REVIEWER/ADMIN only, only when status is SUBMITTED or UNDER_REVIEW. Two dropdowns (**Action**, **Risk level**) and a comment field.
  - REVIEWER sees the form only when the application is assigned to them; otherwise an informational card explains why.
  - ADMIN sees the form on any actionable application.
- **Terminal notice** — replaces the review panel for APPROVED/REJECTED.
- **Delete** — ADMIN only, inline confirmation.

**Fetch:** `combineLatest([id$, reload$]) → switchMap(forkJoin([application$, reviews$]))`. After a review or assignment, `reload` is bumped to refetch both.

### Users (`features/admin/users/`)

ADMIN only.

- Paginated list of users with role dropdown and delete button.
- Role dropdown: Material `mat-select` bound via `[value]`/`(valueChange)`. Disabled on the current user's own row.
- Delete: inline confirm. Disabled on own row.
- Backend guards (self-action, last-admin, owning-resources) surface as inline red alerts.

### Auth (`features/auth/login`, `features/auth/signup`)

Reactive Forms with Material fields. Login supports `returnUrl` redirect. Signup has a role selector. Password reveal toggles with `aria-pressed`. Both use `strictEmail`.

---

## 12. File Index

### Root

- `info.md`, `README.md`
- `package.json`, `angular.json`, `tsconfig*.json`, `.postcssrc.json`
- `vitest.config.ts`
- `src/styles.scss`, `src/index.html`, `src/test-setup.ts`

### Environments

- `src/environments/environment.ts`

### Core — Models

- `core/models/user.model.ts`
- `core/models/application.model.ts`
- `core/models/review.model.ts`
- `core/models/pagination.model.ts`

### Core — Auth

- `core/auth/token-storage.service.ts`
- `core/auth/auth.service.ts`
- `core/auth/auth-refresh.service.ts`
- `core/auth/auth.guard.ts`
- `core/auth/guest.guard.ts` + spec
- `core/auth/role.guard.ts` + spec

### Core — HTTP

- `core/http/auth.interceptor.ts` + spec
- `core/http/error.interceptor.ts`
- `core/http/api-error.ts`

### Core — API clients

- `core/api/applications.api.ts`
- `core/api/users.api.ts`

### Shared

- `shared/directives/has-role.directive.ts`
- `shared/validators/strict-email.validator.ts`
- `shared/services/notification.service.ts`
- `shared/components/status-badge/*`
- `shared/components/masked-field/*` + spec
- `shared/components/save-status/*` + spec

### Layout

- `layout/shell/*`
- `layout/header/*`
- `layout/nav/*`

### Features

- `features/auth/login/*`
- `features/auth/signup/*`
- `features/dashboard/*`
- `features/applications/wizard/*`
- `features/applications/detail/*`
- `features/admin/users/*`
- `features/not-found/*`

### Routes

- `app.routes.ts` — public auth routes (guestGuard) + guarded shell with lazy-loaded children. `roleGuard('SALES','ADMIN')` on wizard routes; `roleGuard('ADMIN')` on `/admin/users`.

---

## 13. Roadmap

1. **Move refresh token to HttpOnly cookie** — backend change + small `TokenStorageService` update.
2. **Serve a strict CSP** — reverse proxy or backend header.
3. **Server-side logout** — `POST /auth/logout` revoking the token family.
4. **Real-time updates** — WebSocket/SSE for status changes; the dashboard could subscribe and patch its list signal.
5. **Dark mode** — Material M3 dark token block + UI toggle.
6. **Export to CSV** — dashboard list export.
7. **i18n** — `@angular/localize` with a language switcher.
8. **Optimistic concurrency** — `If-Unmodified-Since` or a version column to prevent stale writes when multiple admins act.