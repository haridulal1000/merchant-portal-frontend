import { CurrencyPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
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
import { environment } from '@env/environment';
import { extractApiErrorMessage } from '@core/http/api-error';
import type { MerchantApplication } from '@core/models/application.model';
import { SaveStatusComponent, type SaveStatus } from '@shared/components/save-status/save-status.component';
import { strictEmail } from '@shared/validators/strict-email.validator';

/** Time to wait after the last keystroke before firing an autosave. */
const AUTOSAVE_DEBOUNCE_MS = 1200;

/** Business type options shown in the wizard. */
const BUSINESS_TYPES = [
  'Retail',
  'E-commerce',
  'Hospitality',
  'Professional Services',
  'Food & Beverage',
  'Other',
] as const;

/**
 * Multi-step merchant application wizard.
 *
 * Form structure:
 *   form (root)
 *     ├── merchant (sub-group)   — step 1: name, business type, revenue
 *     └── contact  (sub-group)   — step 2: email, phone
 *
 * Each sub-group is bound to a mat-step via [stepControl], so the stepper
 * naturally gates navigation until that step's fields are valid.
 *
 * Autosave pipeline:
 *   form.valueChanges
 *     → debounceTime(AUTOSAVE_DEBOUNCE_MS)
 *     → filter(form.valid)
 *     → distinctUntilChanged
 *     → switchMap(save)
 *     → catchError → status 'error' (never resets the form)
 *
 * Save semantics:
 *   - First valid save: POST /applications  → id captured in a signal
 *   - Every subsequent save: PATCH /applications/:id
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
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly businessTypes = BUSINESS_TYPES;

  private readonly applicationId = signal<string | null>(null);
  readonly saveStatus = signal<SaveStatus>('idle');
  readonly submitting = signal(false);
  readonly submitError = signal<string | null>(null);

  // -----------------------------------------------------------------------
  // Form definition
  // -----------------------------------------------------------------------

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
  readonly isPristine = computed(() => !this.form.dirty);

  constructor() {
    this.form.statusChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((status) => this.formValid.set(status === 'VALID'));

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
              return EMPTY;
            }),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  // -----------------------------------------------------------------------
  // Submit
  // -----------------------------------------------------------------------

  submit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.submitError.set(null);

    const value = this.flatten();
    const save$: Observable<MerchantApplication> = this.applicationId()
      ? this.http.patch<MerchantApplication>(
          `${environment.apiUrl}/applications/${this.applicationId()}`,
          value,
        )
      : this.http
          .post<MerchantApplication>(`${environment.apiUrl}/applications`, value)
          .pipe(tap((created) => this.applicationId.set(created.id)));

    save$
      .pipe(
        switchMap((app) =>
          this.http.patch<MerchantApplication>(
            `${environment.apiUrl}/applications/${app.id}/submit`,
            {},
          ),
        ),
      )
      .subscribe({
        next: (app) => void this.router.navigate(['/applications', app.id]),
        error: (error: unknown) => {
          this.submitting.set(false);
          this.submitError.set(extractApiErrorMessage(error));
        },
        complete: () => this.submitting.set(false),
      });
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private flatten(): {
    merchant_name: string;
    business_type: string;
    annual_revenue: number;
    contact_email: string;
    contact_phone: string;
  } {
    const raw = this.form.getRawValue();
    return {
      merchant_name: raw.merchant.merchant_name,
      business_type: raw.merchant.business_type,
      annual_revenue: raw.merchant.annual_revenue,
      contact_email: raw.contact.contact_email,
      contact_phone: raw.contact.contact_phone,
    };
  }

  private persist(
    value: ReturnType<WizardComponent['flatten']>,
  ): Observable<MerchantApplication> {
    const id = this.applicationId();
    if (id === null) {
      return this.http
        .post<MerchantApplication>(`${environment.apiUrl}/applications`, value)
        .pipe(tap((created) => this.applicationId.set(created.id)));
    }
    return this.http.patch<MerchantApplication>(
      `${environment.apiUrl}/applications/${id}`,
      value,
    );
  }
}

/** Structural equality for the flattened form value. */
function deepEqual(
  a: ReturnType<WizardComponent['flatten']>,
  b: ReturnType<WizardComponent['flatten']>,
): boolean {
  return (
    a.merchant_name === b.merchant_name &&
    a.business_type === b.business_type &&
    a.annual_revenue === b.annual_revenue &&
    a.contact_email === b.contact_email &&
    a.contact_phone === b.contact_phone
  );
}

/** Example validator kept for reference. */
export const noLeadingWhitespace: ValidatorFn = (
  control: AbstractControl,
): ValidationErrors | null => {
  const value = control.value;
  if (typeof value !== 'string') return null;
  return value !== value.trimStart() ? { leadingWhitespace: true } : null;
};