import { CurrencyPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatStepperModule } from '@angular/material/stepper';
import { Router } from '@angular/router';
import {
  EMPTY,
  Observable,
  catchError,
  debounceTime,
  distinctUntilChanged,
  filter,
  map,
  switchMap,
  tap,
} from 'rxjs';
import { ApplicationsApi } from '@core/api/applications.api';
import type { MerchantApplication } from '@core/models/application.model';
import {
  SaveStatusComponent,
  type SaveStatus,
} from '@shared/components/save-status/save-status.component';
import { strictEmail } from '@shared/validators/strict-email.validator';

/** Time to wait after the last keystroke before firing an autosave. */
const AUTOSAVE_DEBOUNCE_MS = 1200;

const BUSINESS_TYPES = [
  'Retail',
  'E-commerce',
  'Hospitality',
  'Professional Services',
  'Food & Beverage',
  'Other',
] as const;

/** Shape sent to POST /applications and PATCH /applications/:id. */
interface FlatFormValue {
  merchant_name: string;
  business_type: string;
  annual_revenue: number;
  contact_email: string;
  contact_phone: string;
}

/**
 * Multi-step merchant application wizard.
 *
 * Modes:
 *   - Create: route is `/applications/new`. No `id` input. First valid save
 *     POSTs, subsequent saves PATCH.
 *   - Edit:   route is `/applications/:id/edit`. The route param arrives as
 *     the `id` input (thanks to withComponentInputBinding). The existing
 *     DRAFT is loaded once, and every change autosaves via PATCH.
 *
 * Form structure:
 *   form (root)
 *     ├── merchant (sub-group)  — step 1: name, business type, revenue
 *     └── contact  (sub-group)  — step 2: email, phone
 *
 * Autosave pipeline:
 *   form.valueChanges
 *     → debounceTime(1200)
 *     → filter(valid)
 *     → distinctUntilChanged
 *     → switchMap(persist)
 *     → catchError sets status 'error' (never resets the form)
 */
@Component({
  selector: 'app-wizard',
  imports: [
    ReactiveFormsModule,
    CurrencyPipe,
    MatStepperModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatProgressBarModule,
    SaveStatusComponent,
  ],
  templateUrl: './wizard.component.html',
})
export class WizardComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ApplicationsApi);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  /**
   * Route parameter for edit mode.
   * Populated automatically by withComponentInputBinding() when the route
   * is `/applications/:id/edit`. Undefined for `/applications/new`.
   */
  readonly id = input<string | undefined>();

  readonly businessTypes = BUSINESS_TYPES;

  /** Set after the first successful POST (or after loading an existing draft). */
  private readonly applicationId = signal<string | null>(null);

  readonly saveStatus = signal<SaveStatus>('idle');
  readonly submitting = signal(false);
  readonly submitError = signal<string | null>(null);
  readonly loadingExisting = signal(false);

  readonly isEditMode = computed(() => this.id() !== undefined);

  readonly merchantGroup = this.fb.nonNullable.group({
    merchant_name: ['', [Validators.required, Validators.minLength(2)]],
    business_type: ['', [Validators.required]],
    annual_revenue: [0, [Validators.required, Validators.min(1)]],
  });

  readonly contactGroup = this.fb.nonNullable.group({
    contact_email: ['', [Validators.required, strictEmail]],
    contact_phone: ['', [Validators.required, Validators.minLength(7)]],
  });

  readonly form = this.fb.group({
    merchant: this.merchantGroup,
    contact: this.contactGroup,
  });

  readonly formValid = signal(false);

  constructor() {
    // Track validity reactively so the submit button can gate on it.
    this.form.statusChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((status) => this.formValid.set(status === 'VALID'));

    // Edit mode: load the existing draft once the route param arrives.
    effect(() => {
      const routeId = this.id();
      if (
        routeId &&
        this.applicationId() === null &&
        !this.loadingExisting()
      ) {
        this.loadExisting(routeId);
      }
    });

    // Autosave pipeline.
    this.form.valueChanges
      .pipe(
        debounceTime(AUTOSAVE_DEBOUNCE_MS),
        filter(() => this.form.valid),
        map(() => this.flatten()),
        distinctUntilChanged(deepEqual),
        tap(() => this.saveStatus.set('saving')),
        switchMap((value) =>
          this.persist(value).pipe(
            tap(() => this.saveStatus.set('saved')),
            catchError(() => {
              this.saveStatus.set('error');
              // Keep the subscription alive so the next keystroke retries.
              return EMPTY;
            }),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  /** Fetch an existing draft and hydrate the form. */
  private loadExisting(id: string): void {
    this.loadingExisting.set(true);

    this.api.get(id).subscribe({
      next: (app) => {
        this.applicationId.set(app.id);

        // emitEvent: false prevents the autosave pipeline from firing on load.
        this.form.patchValue(
          {
            merchant: {
              merchant_name: app.merchant_name,
              business_type: app.business_type,
              annual_revenue: app.annual_revenue,
            },
            contact: {
              contact_email: app.contact_email,
              contact_phone: app.contact_phone,
            },
          },
          { emitEvent: false },
        );

        this.form.markAsPristine();
        this.loadingExisting.set(false);
      },
      error: () => {
        this.loadingExisting.set(false);
        void this.router.navigate(['/dashboard']);
      },
    });
  }

  /** Submit the final form and move the application to SUBMITTED. */
  submit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.submitError.set(null);

    const value = this.flatten();
    const existingId = this.applicationId();

    const save$: Observable<MerchantApplication> = existingId
      ? this.api.update(existingId, value)
      : this.api
          .create(value)
          .pipe(tap((created) => this.applicationId.set(created.id)));

    save$
      .pipe(switchMap((app) => this.api.submit(app.id)))
      .subscribe({
        next: (app) => void this.router.navigate(['/applications', app.id]),
        error: (error: unknown) => {
          this.submitting.set(false);
          this.submitError.set(describeSubmitError(error));
        },
        complete: () => this.submitting.set(false),
      });
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private flatten(): FlatFormValue {
    const raw = this.form.getRawValue();
    return {
      merchant_name: raw.merchant.merchant_name,
      business_type: raw.merchant.business_type,
      annual_revenue: raw.merchant.annual_revenue,
      contact_email: raw.contact.contact_email,
      contact_phone: raw.contact.contact_phone,
    };
  }

  /** POST on first save, PATCH thereafter. */
  private persist(value: FlatFormValue): Observable<MerchantApplication> {
    const id = this.applicationId();
    if (id === null) {
      return this.api
        .create(value)
        .pipe(tap((created) => this.applicationId.set(created.id)));
    }
    return this.api.update(id, value);
  }
}

/** Structural equality for the flattened form value. */
function deepEqual(a: FlatFormValue, b: FlatFormValue): boolean {
  return (
    a.merchant_name === b.merchant_name &&
    a.business_type === b.business_type &&
    a.annual_revenue === b.annual_revenue &&
    a.contact_email === b.contact_email &&
    a.contact_phone === b.contact_phone
  );
}

/** Human-friendly submit error message. */
function describeSubmitError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) return 'Cannot reach the server.';
    if (error.status === 403)
      return 'You do not have permission to submit this application.';
    if (error.status === 400)
      return error.error?.detail ?? 'This application cannot be submitted.';
    return error.error?.detail ?? `Submit failed (${error.status}).`;
  }
  return 'Something went wrong. Please try again.';
}

/**
 * Example of a custom validator. Not currently attached, but included so
 * future field validations can follow the same pattern without digging
 * through files.
 */
export const noLeadingWhitespace: ValidatorFn = (
  control: AbstractControl,
): ValidationErrors | null => {
  const value = control.value;
  if (typeof value !== 'string') return null;
  return value !== value.trimStart() ? { leadingWhitespace: true } : null;
};