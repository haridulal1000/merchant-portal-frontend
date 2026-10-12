import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, type PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import {
  Observable,
  catchError,
  combineLatest,
  map,
  of,
  shareReplay,
  startWith,
  switchMap,
} from 'rxjs';
import { UsersApi } from '@core/api/users.api';
import { AuthService } from '@core/auth/auth.service';
import type { Paginated } from '@core/models/pagination.model';
import type { User, UserRole } from '@core/models/user.model';

type ViewState =
  | { kind: 'loading' }
  | { kind: 'success'; payload: Paginated<User> }
  | { kind: 'error'; message: string };

/**
 * Admin-only user management page.
 *
 * Capabilities:
 *   - List all users (paginated).
 *   - Change another user's role via an inline dropdown.
 *   - Delete another user, gated behind an inline confirm step.
 *
 * Safety rules are enforced by the backend (self-action, last-admin,
 * owning-resources). The UI reflects the same rules to avoid dead-end
 * clicks: the current admin's own row disables both actions.
 */
@Component({
  selector: 'app-users',
  imports: [
    DatePipe,
    MatButtonModule,
    MatIconModule,
    MatPaginatorModule,
    MatProgressBarModule,
     MatSelectModule,
  ],
  templateUrl: './users.component.html',
})
export class UsersComponent {
  private readonly api = inject(UsersApi);
  private readonly auth = inject(AuthService);

  readonly currentUser = this.auth.user;

  readonly roleOptions: UserRole[] = ['SALES', 'REVIEWER', 'ADMIN'];

  // -----------------------------------------------------------------------
  // Pagination + fetch
  // -----------------------------------------------------------------------

  readonly pageIndex = signal(0);
  readonly pageSize = signal(20);
  private readonly reload = signal(0);

  private readonly state$: Observable<ViewState> = combineLatest([
    toObservable(this.pageIndex),
    toObservable(this.pageSize),
    toObservable(this.reload),
  ]).pipe(
    switchMap(([page, limit]) =>
      this.api.list({ page: page + 1, limit }).pipe(
        map((payload) => ({ kind: 'success' as const, payload })),
        catchError((error: unknown) =>
          of({ kind: 'error' as const, message: describeError(error) }),
        ),
        startWith({ kind: 'loading' as const }),
      ),
    ),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  readonly state = toSignal(this.state$, {
    initialValue: { kind: 'loading' } as ViewState,
  });

  readonly rows = computed<User[]>(() => {
    const s = this.state();
    return s.kind === 'success' ? s.payload.data : [];
  });

  readonly total = computed<number>(() => {
    const s = this.state();
    return s.kind === 'success' ? s.payload.meta.total : 0;
  });

  readonly isLoading = computed(() => this.state().kind === 'loading');

  readonly errorMessage = computed<string | null>(() => {
    const s = this.state();
    return s.kind === 'error' ? s.message : null;
  });

  // -----------------------------------------------------------------------
  // Row-level action state
  // -----------------------------------------------------------------------

  /** User ID currently in "confirm delete" state. Null when not confirming. */
  readonly pendingDelete = signal<string | null>(null);

  /** User ID currently being mutated (role change or delete). */
  readonly busyUser = signal<string | null>(null);

  /** Error from a role change or delete action. */
  readonly actionError = signal<string | null>(null);

  isCurrentUser(user: User): boolean {
    return this.currentUser()?.id === user.id;
  }

  onPageChange(event: PageEvent): void {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
  }

  // -----------------------------------------------------------------------
  // Actions
  // -----------------------------------------------------------------------

  changeRole(user: User, newRole: string): void {
    const role = newRole as UserRole;
    if (user.role === role || this.busyUser() === user.id) return;

    this.busyUser.set(user.id);
    this.actionError.set(null);

    this.api.updateRole(user.id, role).subscribe({
      next: () => this.reload.update((n) => n + 1),
      error: (error: unknown) => {
        this.busyUser.set(null);
        this.actionError.set(describeActionError(error));
      },
      complete: () => this.busyUser.set(null),
    });
  }

  requestDelete(user: User): void {
    this.pendingDelete.set(user.id);
    this.actionError.set(null);
  }

  cancelDelete(): void {
    this.pendingDelete.set(null);
  }

  confirmDelete(user: User): void {
    if (this.busyUser() === user.id) return;

    this.busyUser.set(user.id);
    this.actionError.set(null);

    this.api.delete(user.id).subscribe({
      next: () => {
        this.pendingDelete.set(null);
        this.reload.update((n) => n + 1);
      },
      error: (error: unknown) => {
        this.busyUser.set(null);
        this.pendingDelete.set(null);
        this.actionError.set(describeActionError(error));
      },
      complete: () => this.busyUser.set(null),
    });
  }
}

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

function describeError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) return 'Cannot reach the server.';
    if (error.status === 403) return 'You do not have permission to view users.';
    return error.error?.detail ?? `Request failed (${error.status}).`;
  }
  return 'Something went wrong loading users.';
}

function describeActionError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) return 'Cannot reach the server.';
    if (error.status === 403) return 'You do not have permission to perform this action.';
    if (error.status === 404) return 'That user no longer exists.';
    const detail = error.error?.detail;
    if (typeof detail === 'string') return detail;
    return `Action failed (${error.status}).`;
  }
  return 'Something went wrong.';
}