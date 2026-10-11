# Merchant Portal Frontend — Technical Overview

This document is the single source of truth for the codebase. Any AI or human reading it should be able to understand the architecture, conventions, and backend contract without opening a single source file.

---

## 1. Purpose

A merchant payments portal frontend built with Angular 20. Supports three user roles (SALES, REVIEWER, ADMIN) across a multi-step merchant application wizard, a review workflow, and a paginated dashboard.

---

## 2. Demo notice

This is a **demonstration build**, not a hardened production deployment. Several security mechanisms that a production release would require have been deliberately simplified so the app can run without a backend that owns HttpOnly cookies, CSRF tokens, or a CSP delivery pipeline.

**Not implemented in this demo:**

- Tokens are stored in `localStorage`, not in `HttpOnly`, `Secure`, `SameSite=Strict` cookies. An attacker who achieves XSS could read them. In production, the refresh token belongs in an HttpOnly cookie, and the access token should live in memory only.
- No CSRF protection. The current auth scheme is bearer-token based, which is inherently CSRF-resistant, but once the refresh token moves to a cookie, a double-submit or synchronizer-token pattern must be added.
- No Content Security Policy is served. The CSP that should be enforced in production is documented in section 6 so it can be applied at the reverse proxy or via the backend's response headers.
- No rate limiting, brute-force protection, or account lockout on the auth endpoints. Those belong at the API gateway or backend.
- No token revocation on logout server-side beyond deleting the refresh token from the local session. A production logout should invalidate the token family on the backend.

Everything else — routing, guards, form validation, RBAC enforcement, data flow, and test coverage — is implemented to production standards.

---

## 3. Tech Stack

- Angular 20, standalone components, zoneless change detection
- Signals + computed + effect for state; RxJS for streams
- Reactive Forms (typed, with custom validators)
- Angular Material for UI components (toolbar, sidenav, buttons, icons, menus, form fields, tables, dialogs, snackbars, chips)
- Tailwind CSS v4 for layout utilities (config via `@theme` in `styles.scss`; no `tailwind.config.js`)
- SCSS only for global theme tokens and Material theming
- Vitest + Angular TestBed for unit tests
- TypeScript strict mode
- Path aliases (`@core/*`, `@shared/*`, `@features/*`, `@layout/*`, `@env/*`) declared in `tsconfig.json` and mirrored in `vitest.config.ts`

---

## 4. Backend Contract

The frontend talks to a FastAPI backend. Summary below.

**Base URL:** `http://localhost:3000/api` (set in `src/environments/environment.ts`)

### Auth

- `POST /auth/signup` → `{ access_token, refresh_token, user }`
- `POST /auth/login` → `{ access_token, refresh_token, user }`
- `POST /auth/refresh` → `{ access_token, refresh_token, user }`
- `GET  /auth/me` → `User` (Bearer required)

Access tokens expire in 15 minutes. Refresh tokens expire in 7 days and are rotated on every use (single-use). Concurrent 401s must trigger exactly one refresh call; queued requests retry with the new token.

### Roles

- **SALES** — creates and edits their own applications; sees only their own
- **REVIEWER** — views all applications; records risk decisions
- **ADMIN** — full access

### Applications

- `GET    /applications` (paginated, filter by status + search)
- `GET    /applications/:id`
- `POST   /applications` (SALES/ADMIN)
- `PATCH  /applications/:id` (SALES/ADMIN, DRAFT only)
- `PATCH  /applications/:id/submit` (SALES/ADMIN, DRAFT → SUBMITTED)

### Reviews

- `GET  /applications/:id/reviews`
- `POST /applications/:id/reviews` (REVIEWER/ADMIN)

### Pagination envelope

All list endpoints return:

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
UserRole:          SALES | REVIEWER | ADMIN
```

---

## 5. Architecture

### Folder layout

```
src/
  environments/            API base URL config
  app/
    app.ts                 root component (router-outlet only)
    app.config.ts          providers: router, http, interceptors, animations
    app.routes.ts          top-level routes (lazy-loaded features)
    core/                  singletons: auth, http, api clients, models
    shared/                reusable UI: components, directives, pipes, validators
    layout/                app shell: header, nav, shell
    features/              lazy-loaded feature areas
```

### Layer responsibilities

- **core/** — No UI. Services, guards, interceptors, API clients, models.
- **shared/** — No business logic. Reusable, presentational, standalone.
- **layout/** — The persistent shell around routed views.
- **features/** — One folder per user-facing area. Each has its own routes file.

### Data flow (read)

```
HTTP response (RxJS stream)
  -> toSignal() or resource()
  -> signal consumed by template
  -> template renders via @if / @for
```

### Data flow (write)

```
Form value
  -> debounced stream (autosave) or explicit submit
  -> API client
  -> HttpClient
  -> interceptor adds Bearer token
  -> response updates a signal / store
```

### Declarative conventions

- Signals for state: `signal()`, `computed()`, `effect()`, `linkedSignal()`
- RxJS only where streams earn their place: HTTP, debounce, pagination
- No manual subscriptions in components; use `toSignal()` or the `async` pipe
- Functional guards (`CanActivateFn`), functional resolvers, functional interceptors
- `input()`, `output()`, `model()` for component I/O — no `@Input`/`@Output` decorators
- `inject()` in field initializers — no constructor injection
- `@if` / `@for` / `@switch` in templates — no `*ngIf` / `*ngFor`
- No imperative `ngOnInit` glue where a signal or `resource()` can express the same intent

---

## 6. Security

### Token storage (demo limitation)

Tokens are stored in `localStorage` under a single key (`mp.session`). This is the pragmatic choice for a self-contained demo where the backend does not yet issue HttpOnly cookies. In production:

- The refresh token belongs in an `HttpOnly`, `Secure`, `SameSite=Strict` cookie set by the backend, with a short expiry and rotation on use.
- The access token belongs in memory only (a signal, not storage), with a silent refresh on page load driven by the cookie.
- The backend should revoke the entire token family on logout.

The rest of the auth pipeline is already designed to support this migration — only `TokenStorageService` would change.

### Role gating

Two layers:

1. **UI gating** — the `*appHasRole` structural directive hides elements.
2. **Route gating** — functional `roleGuard('REVIEWER', 'ADMIN')` on routes, plus `authGuard` on the shell and `guestGuard` on public routes.

Both are UX only. The backend enforces authorization on every request. A user who tampers with `localStorage` sees the wrong UI but cannot perform any action the backend rejects.

### Sensitive field masking

The `MaskedFieldComponent` masks values by default. Reveal requires clicking a button; the reveal is not persisted. Roles with permission see masked values and can reveal individually. Reveal state is per-instance, so navigating away or refreshing re-masks everything.

### Content Security Policy

The production build should ship with a CSP header. This app is compatible with:

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

`style-src 'unsafe-inline'` is required because Tailwind injects style tags in dev. In production with a compiled stylesheet this can be tightened to `style-src 'self'`.

---

## 7. Running the app

```
npm install
npm start        # dev server on http://localhost:4200
```

The backend must be running at `http://localhost:3000/api` before the frontend will function.

User accounts are created via the signup page or the backend's user provisioning mechanism. Roles are assigned at signup time.

---

## 8. Testing

Vitest + Angular TestBed. Spec files sit beside the code they test.

```bash
npm test           # single run
npm run test:watch # watch mode
```

### What is covered

| Spec                                       | What it verifies                                                                                                                |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `core/http/auth.interceptor.spec.ts`       | Bearer attachment, public-endpoint bypass, **single-flight refresh across 3 concurrent 401s**, session clear on refresh failure |
| `core/auth/role.guard.spec.ts`             | Allows correct role, redirects wrong role to `/dashboard`, redirects unauthenticated to `/login` with `returnUrl`               |
| `core/auth/guest.guard.spec.ts`            | Allows unauthenticated users, redirects authenticated users away from public routes                                             |
| `shared/components/masked-field/*.spec.ts` | Masked by default, reveals on click, re-masks, hides toggle when `revealable=false`, `aria-pressed` reflects state              |
| `shared/components/save-status/*.spec.ts`  | Correct label per status, `aria-live` region present                                                                            |

### The single-flight refresh test

The highest-value test in the suite. It fires 3 concurrent GET requests, mocks all three returning 401, and asserts:

1. Exactly **one** `POST /auth/refresh` fires.
2. All three original requests are retried with the new access token.
3. All three promises resolve after the retry succeeds.

### Setup notes

- Config: `vitest.config.ts` (uses `@analogjs/vite-plugin-angular`).
- Bootstrap: `src/test-setup.ts`.
- Tests run in **jsdom** — no browser installation required.
- Specs use `provideZonelessChangeDetection()` to match the runtime.

---

## 9. UI Layer — Angular Material + Tailwind

We use both, on purpose.

- **Angular Material** — components: toolbar, sidenav, buttons, icons, menus, form fields, tables, dialogs, snackbars, chips. Ships accessibility (focus management, ARIA, keyboard nav) out of the box.
- **Tailwind CSS** — layout utilities only: flex, grid, spacing, responsive breakpoints, and the occasional design token (`bg-surface-50`). No Tailwind component kits; Material is the component layer.

The theme is defined once in `styles.scss` using Material's M3 API with the Azure primary palette and density `-1` (tighter spacing for data-dense tables).

**Rule of thumb:** components = Material, layout = Tailwind. Never reach for a Tailwind button class when a Material button exists; never reach for a Material layout primitive when a Tailwind flex will do.

### Material imports pattern

Each standalone component imports only the Material modules it needs:

```typescript
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
```

No shared Material barrel module. Tree-shaking stays clean and each component's dependencies are visible at the top of the file.

### Layout shell

The persistent shell (`src/app/layout/shell`) hosts:

- `app-header` — `mat-toolbar` with user menu and a hamburger toggle
- `app-nav` — `mat-sidenav` with role-filtered links
- `<router-outlet>` — the routed feature content

On desktop the sidenav is always visible; on mobile it overlays and closes when a link is tapped.

### Permission-aware UI

Two mechanisms:

1. `*appHasRole="['SALES','ADMIN']"` — a structural directive that renders its host only when the current user's role is in the list.
2. `roleGuard('SALES','ADMIN')` — functional route guard that redirects authenticated users with the wrong role to `/dashboard`.

Both are UX only. The backend enforces authorization server-side on every request.

### Responsive design

- Single-column on mobile, multi-column at `sm:` and `md:` breakpoints.
- Sidenav overlays below `md:` and is persistent above it.
- Tables collapse into cards on narrow viewports.
- All interactive elements are keyboard-accessible; Material components provide correct ARIA attributes out of the box.

---

## 10. Auth Pipeline

The auth flow splits into four cooperating pieces plus three guards.

### TokenStorageService (`core/auth/token-storage.service.ts`)

HTTP-free. Owns the `localStorage` persistence and exposes the session as signals: `accessToken`, `refreshToken`, `user`, `isAuthenticated`. The distinction matters because the interceptor depends on this service, and if it depended on `AuthService` (which uses `HttpClient`) we would get a circular dependency.

### AuthService (`core/auth/auth.service.ts`)

Public API consumed by the login/signup pages and the header. Provides `login()`, `signup()`, `logout()`, `me()`, and the signals `user`, `role`, `isAuthenticated`. Delegates persistence to `TokenStorageService`.

### AuthRefreshService (`core/auth/auth-refresh.service.ts`)

The concurrent-401 coordinator. Uses `HttpBackend` directly (bypassing
interceptors, so no recursion) to `POST /auth/refresh`. `HttpBackend`
emits a stream of `HttpEvent`s (Sent, HeaderResponse, Response), so the
pipeline uses `filter(event => event instanceof HttpResponse)` and
`take(1)` to extract only the final response body — reading the stream
with `map` would throw on the first intermediate event and silently drop
the real response.

Holds an `inFlight$` observable. The first 401 starts the refresh; every
other 401 subscribes to the same observable via
`shareReplay({ bufferSize: 1, refCount: false })`. `finalize` clears
`inFlight$` so the NEXT 401 starts a fresh refresh. All failures are
normalized to `HttpErrorResponse` before leaving the service.

### authInterceptor (`core/http/auth.interceptor.ts`)

Functional interceptor. On every non-public request:

1. Attach `Authorization: Bearer <access>` if a token exists.
2. Pass through.
3. On 401: call `AuthRefreshService.refresh()`.
4. On refresh success: retry the original request with the new token.
5. On refresh failure: clear the session and navigate to `/login` with `?reason=session-expired`.

Public endpoints (`/auth/login`, `/auth/signup`, `/auth/refresh`) bypass both the token attachment and the refresh retry.

### errorInterceptor (`core/http/error.interceptor.ts`)

Runs late in the response chain (registered first) so recoverable 401s never reach the log. Currently a `console.error` logger; the extension point for a future snackbar-based toast service.

### Guards

- `authGuard` — allows access when a session exists, otherwise redirects to `/login` with `returnUrl`.
- `roleGuard(...roles)` — factory producing a guard that allows only the listed roles. Unauthenticated → `/login`. Authenticated with wrong role → `/dashboard`.
- `guestGuard` — redirects authenticated users away from `/login` and `/signup` to `/dashboard`. Keeps logged-in users from landing on public-only pages via stale bookmarks or manual URL entry.

### Validation alignment

Angular's built-in `Validators.email` accepts `user@host`, which the backend's Pydantic `EmailStr` rejects. A custom `strictEmail` validator in `shared/validators/` enforces the same rules client-side so validation errors surface before a network round-trip. Backend validation errors are parsed by `core/http/api-error.ts`, which understands both FastAPI's simple `{ detail: "..." }` shape and its structured validation array shape.

---

## 11. File Index

### Root

- `info.md` — this file
- `README.md` — quick-start commands
- `package.json`, `angular.json`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.spec.json`, `.postcssrc.json`
- `vitest.config.ts`
- `src/styles.scss` — Material theme + Tailwind tokens + base layer
- `src/index.html` — Material Icons + Roboto font links
- `src/test-setup.ts` — Vitest + TestBed bootstrap

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
- `core/auth/guest.guard.ts` + `guest.guard.spec.ts`
- `core/auth/role.guard.ts` + `role.guard.spec.ts`

### Core — HTTP

- `core/http/auth.interceptor.ts` + `auth.interceptor.spec.ts`
- `core/http/error.interceptor.ts`
- `core/http/api-error.ts` — FastAPI error parser

### Shared

- `shared/directives/has-role.directive.ts`
- `shared/validators/strict-email.validator.ts`
- `shared/components/status-badge/status-badge.component.ts`
- `shared/components/masked-field/masked-field.component.ts` + `.spec.ts`
- `shared/components/save-status/save-status.component.ts` + `.spec.ts`

### Layout

- `layout/shell/shell.component.ts` + `.html`
- `layout/header/header.component.ts` + `.html`
- `layout/nav/nav.component.ts` + `.html`

### Features

- `features/auth/login/login.component.ts` + `.html`
- `features/auth/signup/signup.component.ts` + `.html`
- `features/dashboard/dashboard.component.ts` + `.html`
- `features/applications/wizard/wizard.component.ts` + `.html`
- `features/applications/detail/detail.component.ts` + `.html`
- `features/not-found/not-found.component.ts`

### Routes

- `app.routes.ts` — public auth routes (`guestGuard`) + guarded shell with lazy-loaded children; `roleGuard('SALES','ADMIN')` on the wizard route.

---

## 12. Roadmap

Ordered by impact for a production release.

1. **Move refresh token to HttpOnly cookie** — backend change plus a small update to `TokenStorageService`. Keep the access token in memory only.
2. **Serve a strict CSP** — reverse proxy or backend response header. The policy in section 6 is compatible with this codebase.
3. **Toast / snackbar notifications** — replace the `console.error` in `errorInterceptor` with a Material snackbar service.
4. **Server-driven revoke on logout** — a `POST /auth/logout` that invalidates the refresh token family.
5. **Dark mode** — Material's M3 API supports it; the theme in `styles.scss` just needs a dark token block and a UI toggle.
6. **Real-time status updates** — WebSocket or SSE channel for application status changes; the dashboard could subscribe and patch its list signal.
7. **Export to CSV** — dashboard list export, straightforward with the existing pagination envelope.
8. **i18n** — Angular's built-in `@angular/localize` with a language switcher in the header.
