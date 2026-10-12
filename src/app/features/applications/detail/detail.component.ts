import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, input, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';
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
import { environment } from '@env/environment';
import { AuthService } from '@core/auth/auth.service';
import type {
  MerchantApplication,
  RiskDecision,
} from '@core/models/application.model';
import type { Review, ReviewAction } from '@core/models/review.model';
import { MaskedFieldComponent } from '@shared/components/masked-field/masked-field.component';
import { StatusBadgeComponent } from '@shared/components/status-badge/status-badge.component';
import { HasRoleDirective } from '@shared/directives/has-role.directive';

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

/**
 * Application detail view.
 *
 * Reviewer workflow:
 *   - SUBMITTED and UNDER_REVIEW applications expose a decision panel
 *     to REVIEWER/ADMIN with two dropdowns: an action (which drives the
 *     status) and a risk level (the reviewer's assessment).
 *   - APPROVED and REJECTED applications are terminal; the panel is hidden.
 *   - SALES users never see the panel (UI + backend enforcement).
 */
@Component({
  selector: 'app-detail',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    CurrencyPipe,
    DatePipe,
    MatCardModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
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
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);

  readonly id = input.required<string>();

  private readonly reload = signal(0);

  readonly currentUser = this.auth.user;

  // -----------------------------------------------------------------------
  // Fetch pipeline
  // -----------------------------------------------------------------------

  private readonly state$: Observable<ViewState> = combineLatest([
    toObservable(this.id),
    toObservable(this.reload),
  ]).pipe(
    switchMap(([id]) =>
      forkJoin({
        application: this.http.get<MerchantApplication>(
          `${environment.apiUrl}/applications/${id}`,
        ),
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

  /** The reviewer panel is only shown to REVIEWER/ADMIN. */
  readonly canReview = computed(() => this.auth.hasRole('REVIEWER', 'ADMIN'));

  /**
   * The action form is only shown while the application is in an
   * actionable state. Terminal states (APPROVED, REJECTED) hide it.
   */
  readonly isActionable = computed<boolean>(() => {
    const app = this.application();
    if (!app) return false;
    return app.status === 'SUBMITTED' || app.status === 'UNDER_REVIEW';
  });

  // -----------------------------------------------------------------------
  // Options for the reviewer dropdowns
  // -----------------------------------------------------------------------

  readonly actionOptions: SelectOption<ReviewAction>[] = [
    {
      value: 'APPROVE',
      label: 'Approve application',
      hint: 'Status becomes Approved',
    },
    {
      value: 'REJECT',
      label: 'Reject application',
      hint: 'Status becomes Rejected',
    },
    {
      value: 'UNDER_REVIEW',
      label: 'Escalate to Under Review',
      hint: 'Keeps the application open for a second opinion',
    },
  ];

  readonly decisionOptions: SelectOption<RiskDecision>[] = [
    { value: 'LOW', label: 'Low risk' },
    { value: 'MEDIUM', label: 'Medium risk' },
    { value: 'HIGH', label: 'High risk' },
    { value: 'REJECTED', label: 'Unacceptable risk' },
  ];

  // -----------------------------------------------------------------------
  // Review form
  // -----------------------------------------------------------------------

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
          this.reviewForm.reset({
            action: 'APPROVE',
            decision: 'LOW',
            comment: '',
          });
          this.reload.update((n) => n + 1);
        },
        error: (error: unknown) => {
          this.submittingReview.set(false);
          this.reviewError.set(describeError(error));
        },
        complete: () => this.submittingReview.set(false),
      });
  }

  goBack(): void {
    void this.router.navigate(['/dashboard']);
  }

  /** User-friendly label for a review action. */
  actionLabel(action: ReviewAction): string {
    switch (action) {
      case 'APPROVE':
        return 'Approved';
      case 'REJECT':
        return 'Rejected';
      case 'UNDER_REVIEW':
        return 'Escalated to Under Review';
    }
  }
}

function describeError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return 'Cannot reach the server. Is the backend running?';
    }
    if (error.status === 403) {
      return 'You do not have permission to view this application.';
    }
    if (error.status === 404) {
      return 'This application could not be found.';
    }

    const body = error.error;
    if (body && typeof body.detail === 'string') {
      return body.detail;
    }

    return `Request failed (${error.status}).`;
  }
  return 'Something went wrong.';
}