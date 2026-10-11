import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { CurrencyPipe, DatePipe } from '@angular/common';
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
import { AuthService } from '@core/auth/auth.service';
import { MerchantApplication, ApplicationStatus } from '@core/models/application.model';
import { Paginated } from '@core/models/pagination.model';
import { environment } from '@env/environment';
import { StatusBadgeComponent } from '@shared/components/status-badge/status-badge.component';
import { HasRoleDirective } from '@shared/directives/has-role.directive';


/**
 * Discriminated union describing the dashboard's read state.
 * Only one of these is active at a time, and the template switches on `kind`.
 */
type ViewState =
  | { kind: 'loading' }
  | { kind: 'success'; payload: Paginated<MerchantApplication> }
  | { kind: 'error'; message: string };

interface StatusOption {
  value: ApplicationStatus | null;
  label: string;
}

/**
 * Dashboard — paginated list of merchant applications.
 *
 * Data flow:
 *   pageIndex / pageSize / statusFilter / searchInput (signals)
 *     -> debounced search via toObservable + debounceTime
 *     -> combineLatest into a single fetch stream
 *     -> switchMap to HTTP, mapping success/error to ViewState
 *     -> toSignal back into the template
 *
 * Filters reset the page to 0 to avoid landing on an empty page.
 */
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
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  readonly user = this.auth.user;

  // -----------------------------------------------------------------------
  // Filter state
  // -----------------------------------------------------------------------

  /** Material paginator uses zero-indexed pages; the API uses one-indexed. */
  readonly pageIndex = signal(0);
  readonly pageSize = signal(10);
  readonly statusFilter = signal<ApplicationStatus | null>(null);
  readonly searchInput = signal('');

  /** Incremented by the Retry button to force a refetch. */
  private readonly reload = signal(0);

  // -----------------------------------------------------------------------
  // Debounced search: signal -> observable -> debounce -> signal
  // -----------------------------------------------------------------------

  private readonly debouncedSearch = toSignal(
    toObservable(this.searchInput).pipe(
      debounceTime(300),
      distinctUntilChanged(),
      startWith(''),
    ),
    { initialValue: '' },
  );

  // -----------------------------------------------------------------------
  // Fetch pipeline
  // -----------------------------------------------------------------------

  private readonly state$: Observable<ViewState> = combineLatest([
    toObservable(this.pageIndex),
    toObservable(this.pageSize),
    toObservable(this.statusFilter),
    toObservable(this.debouncedSearch),
    toObservable(this.reload),
  ]).pipe(
    switchMap(([pageIndex, pageSize, status, search]) => {
      const params: Record<string, string> = {
        page: String(pageIndex + 1),
        limit: String(pageSize),
      };
      if (status) params['status'] = status;
      if (search.trim()) params['search'] = search.trim();

      return this.http
        .get<Paginated<MerchantApplication>>(
          `${environment.apiUrl}/applications`,
          { params },
        )
        .pipe(
          map((payload) => ({ kind: 'success' as const, payload })),
          catchError((error: unknown) =>
            of({ kind: 'error' as const, message: describeError(error) }),
          ),
          startWith({ kind: 'loading' as const }),
        );
    }),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  /** The single source of truth consumed by the template. */
  readonly state = toSignal(this.state$, {
    initialValue: { kind: 'loading' } as ViewState,
  });

  // -----------------------------------------------------------------------
  // Derived values for the template
  // -----------------------------------------------------------------------

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

  // -----------------------------------------------------------------------
  // Actions
  // -----------------------------------------------------------------------

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
}

/** Human-friendly message for a failed list request. */
function describeError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) return 'Cannot reach the server. Is the backend running?';
    return error.error?.detail ?? `Request failed (${error.status}).`;
  }
  return 'Something went wrong loading applications.';
}