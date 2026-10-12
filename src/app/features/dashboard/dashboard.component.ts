import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, type PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { RouterLink } from '@angular/router';
import {
  Observable,
  catchError,
  combineLatest,
  debounceTime,
  distinctUntilChanged,
  map,
  of,
  shareReplay,
  startWith,
  switchMap,
} from 'rxjs';
import { ApplicationsApi } from '@core/api/applications.api';
import { AuthService } from '@core/auth/auth.service';

import type { Paginated } from '@core/models/pagination.model';
import { StatusBadgeComponent } from '@shared/components/status-badge/status-badge.component';
import { HasRoleDirective } from '@shared/directives/has-role.directive';
import { MerchantApplication, ApplicationStatus } from '@core/models/application.model';

// NOTE: the import path above is `@core/models/application.model`
// (singular), not `.models`. Fix on paste.

type ViewState =
  | { kind: 'loading' }
  | { kind: 'success'; payload: Paginated<MerchantApplication> }
  | { kind: 'error'; message: string };

interface StatusOption {
  value: ApplicationStatus | null;
  label: string;
}

@Component({
  selector: 'app-dashboard',
  imports: [
    FormsModule,
    RouterLink,
    CurrencyPipe,
    DatePipe,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatPaginatorModule,
    MatIconModule,
    MatProgressBarModule,
    HasRoleDirective,
    StatusBadgeComponent,
  ],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent {
  private readonly api = inject(ApplicationsApi);
  private readonly auth = inject(AuthService);

  readonly user = this.auth.user;
  readonly canCreate = computed(() => this.auth.hasRole('SALES', 'ADMIN'));
  readonly canAdmin = computed(() => this.auth.hasRole('ADMIN'));

  readonly pageIndex = signal(0);
  readonly pageSize = signal(10);
  readonly statusFilter = signal<ApplicationStatus | null>(null);
  readonly searchInput = signal('');

  /** Rows with pending delete confirmation (admin only). */
  readonly pendingDelete = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);

  private readonly reload = signal(0);

  private readonly debouncedSearch = toSignal(
    toObservable(this.searchInput).pipe(
      debounceTime(300),
      distinctUntilChanged(),
      startWith(''),
    ),
    { initialValue: '' },
  );

  private readonly state$: Observable<ViewState> = combineLatest([
    toObservable(this.pageIndex),
    toObservable(this.pageSize),
    toObservable(this.statusFilter),
    toObservable(this.debouncedSearch),
    toObservable(this.reload),
  ]).pipe(
    switchMap(([pageIndex, pageSize, status, search]) =>
      this.api
        .list({
          page: pageIndex + 1,
          limit: pageSize,
          status: status ?? undefined,
          search: search.trim() || undefined,
        })
        .pipe(
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

  readonly statusOptions: StatusOption[] = [
    { value: null, label: 'All statuses' },
    { value: 'DRAFT', label: 'Draft' },
    { value: 'SUBMITTED', label: 'Submitted' },
    { value: 'UNDER_REVIEW', label: 'Under Review' },
    { value: 'APPROVED', label: 'Approved' },
    { value: 'REJECTED', label: 'Rejected' },
  ];

  readonly rows = computed<MerchantApplication[]>(() => {
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

  onPageChange(event: PageEvent): void {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
  }

  onStatusChange(value: ApplicationStatus | null): void {
    this.statusFilter.set(value);
    this.pageIndex.set(0);
  }

  onSearchChange(value: string): void {
    this.searchInput.set(value);
    this.pageIndex.set(0);
  }

  retry(): void {
    this.reload.update((n) => n + 1);
  }

  isEditableByCurrentUser(app: MerchantApplication): boolean {
    if (app.status !== 'DRAFT') return false;
    const role = this.auth.role();
    if (role === 'ADMIN') return true;
    if (role === 'SALES') return app.sales_rep.id === this.user()?.id;
    return false;
  }

  requestDelete(app: MerchantApplication): void {
    this.pendingDelete.set(app.id);
    this.actionError.set(null);
  }

  cancelDelete(): void {
    this.pendingDelete.set(null);
  }

  confirmDelete(app: MerchantApplication): void {
    this.api.delete(app.id).subscribe({
      next: () => {
        this.pendingDelete.set(null);
        this.reload.update((n) => n + 1);
      },
      error: (error: unknown) => {
        this.pendingDelete.set(null);
        this.actionError.set(describeError(error));
      },
    });
  }
}

function describeError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) return 'Cannot reach the server. Is the backend running?';
    if (error.status === 403) return 'You do not have permission to perform this action.';
    return error.error?.detail ?? `Request failed (${error.status}).`;
  }
  return 'Something went wrong loading applications.';
}