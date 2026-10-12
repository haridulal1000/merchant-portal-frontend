import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, input, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import {
  FormBuilder,
  FormControl,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { Router } from '@angular/router';
import {
  Observable,
  catchError,
  combineLatest,
  forkJoin,
  map,
  of,
  shareReplay,
  startWith,
  switchMap,
} from 'rxjs';
import { ApplicationsApi } from '@core/api/applications.api';
import { UsersApi } from '@core/api/users.api';
import { AuthService } from '@core/auth/auth.service';
import type {
  MerchantApplication,
  RiskDecision,
} from '@core/models/application.model';
import type { Review, ReviewAction } from '@core/models/review.model';
import type { UserSummary } from '@core/models/application.model';
import { MaskedFieldComponent } from '@shared/components/masked-field/masked-field.component';
import { StatusBadgeComponent } from '@shared/components/status-badge/status-badge.component';
import { HasRoleDirective } from '@shared/directives/has-role.directive';
import { HttpClient } from '@angular/common/http';
import { environment } from '@env/environment';

interface DetailPayload {
  application: MerchantApplication;
  reviews: Review[];
}

type ViewState =
  | { kind: 'loading' }
  | { kind: 'success'; payload: DetailPayload }
  | { kind: 'error'; message: string };

interface SelectOption<T> {
  value: T;
  label: string;
  hint?: string;
}

@Component({
  selector: 'app-detail',
  imports: [
    ReactiveFormsModule,
    CurrencyPipe,
    DatePipe,
    MatCardModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatAutocompleteModule,
    MatIconModule,
    MatProgressBarModule,
    MaskedFieldComponent,
    StatusBadgeComponent,
    HasRoleDirective,
  ],
  templateUrl: './detail.component.html',
})
export class DetailComponent {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApplicationsApi);
  private readonly usersApi = inject(UsersApi);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);

  readonly id = input.required<string>();

  private readonly reload = signal(0);
  readonly currentUser = this.auth.user;

  readonly canReview = computed(() => this.auth.hasRole('REVIEWER', 'ADMIN'));
  readonly canAssign = computed(() => this.auth.hasRole('ADMIN'));
  readonly canDelete = computed(() => this.auth.hasRole('ADMIN'));

  // -----------------------------------------------------------------------
  // Fetch
  // -----------------------------------------------------------------------

  private readonly state$: Observable<ViewState> = combineLatest([
    toObservable(this.id),
    toObservable(this.reload),
  ]).pipe(
    switchMap(([id]) =>
      forkJoin({
        application: this.api.get(id),
        reviews: this.http.get<Review[]>(
          `${environment.apiUrl}/applications/${id}/reviews`,
        ),
      }).pipe(
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

  readonly application = computed<MerchantApplication | null>(() => {
    const s = this.state();
    return s.kind === 'success' ? s.payload.application : null;
  });

  readonly reviews = computed<Review[]>(() => {
    const s = this.state();
    return s.kind === 'success' ? s.payload.reviews : [];
  });

  readonly isLoading = computed(() => this.state().kind === 'loading');

  readonly errorMessage = computed<string | null>(() => {
    const s = this.state();
    return s.kind === 'error' ? s.message : null;
  });

  readonly isActionable = computed<boolean>(() => {
    const app = this.application();
    if (!app) return false;
    return app.status === 'SUBMITTED' || app.status === 'UNDER_REVIEW';
  });

  /** Reviewer action panel is only visible when the app is actionable AND
   *  (the current user is admin OR the app is assigned to them). */
  readonly canActOnThisApplication = computed<boolean>(() => {
    const app = this.application();
    const me = this.currentUser();
    if (!app || !me) return false;
    if (!this.isActionable()) return false;
    if (me.role === 'ADMIN') return true;
    if (me.role === 'REVIEWER') {
      return app.assigned_reviewer?.id === me.id;
    }
    return false;
  });

  // -----------------------------------------------------------------------
  // Review form
  // -----------------------------------------------------------------------

  readonly actionOptions: SelectOption<ReviewAction>[] = [
    { value: 'APPROVE', label: 'Approve application', hint: 'Status → Approved' },
    { value: 'REJECT', label: 'Reject application', hint: 'Status → Rejected' },
    { value: 'UNDER_REVIEW', label: 'Escalate to Under Review', hint: 'Keeps the application open' },
  ];

  readonly decisionOptions: SelectOption<RiskDecision>[] = [
    { value: 'LOW', label: 'Low risk' },
    { value: 'MEDIUM', label: 'Medium risk' },
    { value: 'HIGH', label: 'High risk' },
    { value: 'REJECTED', label: 'Unacceptable risk' },
  ];

  readonly reviewForm = this.fb.nonNullable.group({
    action: ['APPROVE' as ReviewAction, [Validators.required]],
    decision: ['LOW' as RiskDecision, [Validators.required]],
    comment: ['', [Validators.maxLength(2000)]],
  });

  readonly submittingReview = signal(false);
  readonly reviewError = signal<string | null>(null);

  submitReview(): void {
    if (this.reviewForm.invalid || this.submittingReview()) {
      this.reviewForm.markAllAsTouched();
      return;
    }
    this.submittingReview.set(true);
    this.reviewError.set(null);

    this.http
      .post<Review>(
        `${environment.apiUrl}/applications/${this.id()}/reviews`,
        this.reviewForm.getRawValue(),
      )
      .subscribe({
        next: () => {
          this.reviewForm.reset({ action: 'APPROVE', decision: 'LOW', comment: '' });
          this.reload.update((n) => n + 1);
        },
        error: (error: unknown) => {
          this.submittingReview.set(false);
          this.reviewError.set(describeError(error));
        },
        complete: () => this.submittingReview.set(false),
      });
  }

  // -----------------------------------------------------------------------
  // Assignment (ADMIN)
  // -----------------------------------------------------------------------

  readonly reviewerControl = new FormControl<UserSummary | string | null>(null);
  readonly reviewers = signal<UserSummary[]>([]);
  readonly assigning = signal(false);
  readonly assignError = signal<string | null>(null);

  /** Load the list of reviewers once. Called from the template when the
   *  assign panel is rendered so we don't fetch for non-admins. */
  loadReviewersIfNeeded(): void {
    if (this.reviewers().length > 0) return;
    this.usersApi.list({ role: 'REVIEWER', limit: 100 }).subscribe({
      next: (page) => this.reviewers.set(page.data),
      error: () => this.reviewers.set([]),
    });
  }

  readonly filteredReviewers = computed<UserSummary[]>(() => {
    const q = this.reviewerControl.value;
    const term = typeof q === 'string' ? q.toLowerCase() : '';
    if (!term) return this.reviewers();
    return this.reviewers().filter(
      (r) =>
        r.name.toLowerCase().includes(term) ||
        r.email.toLowerCase().includes(term),
    );
  });

  displayReviewer(value: UserSummary | string | null): string {
    if (!value) return '';
    if (typeof value === 'string') return value;
    return `${value.name} (${value.email})`;
  }

  assignSelected(): void {
    const value = this.reviewerControl.value;
    if (!value || typeof value === 'string') {
      this.assignError.set('Pick a reviewer from the list.');
      return;
    }
    this.assigning.set(true);
    this.assignError.set(null);

    this.api.assign(this.id(), value.id).subscribe({
      next: () => {
        this.reviewerControl.reset(null);
        this.reload.update((n) => n + 1);
      },
      error: (error: unknown) => {
        this.assigning.set(false);
        this.assignError.set(describeError(error));
      },
      complete: () => this.assigning.set(false),
    });
  }

  unassign(): void {
    this.assigning.set(true);
    this.assignError.set(null);

    this.api.assign(this.id(), null).subscribe({
      next: () => this.reload.update((n) => n + 1),
      error: (error: unknown) => {
        this.assigning.set(false);
        this.assignError.set(describeError(error));
      },
      complete: () => this.assigning.set(false),
    });
  }

  // -----------------------------------------------------------------------
  // Delete (ADMIN)
  // -----------------------------------------------------------------------

  readonly confirmingDelete = signal(false);
  readonly deleting = signal(false);
  readonly deleteError = signal<string | null>(null);

  confirmDelete(): void {
    this.deleting.set(true);
    this.deleteError.set(null);
    this.api.delete(this.id()).subscribe({
      next: () => void this.router.navigate(['/dashboard']),
      error: (error: unknown) => {
        this.deleting.set(false);
        this.deleteError.set(describeError(error));
      },
    });
  }

  // -----------------------------------------------------------------------

  goBack(): void {
    void this.router.navigate(['/dashboard']);
  }

  actionLabel(action: ReviewAction): string {
    switch (action) {
      case 'APPROVE': return 'Approved';
      case 'REJECT': return 'Rejected';
      case 'UNDER_REVIEW': return 'Escalated to Under Review';
    }
  }
}

function describeError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) return 'Cannot reach the server.';
    if (error.status === 403) return 'You do not have permission to perform this action.';
    if (error.status === 404) return 'This application could not be found.';
    const body = error.error;
    if (body && typeof body.detail === 'string') return body.detail;
    return `Request failed (${error.status}).`;
  }
  return 'Something went wrong.';
}