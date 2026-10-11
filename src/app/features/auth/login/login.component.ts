import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '@core/auth/auth.service';
import { extractApiErrorMessage } from '@core/http/api-error';
import { strictEmail } from '@shared/validators/strict-email.validator';

/**
 * Login page.
 *
 * - Typed Reactive Form with email + password.
 * - On success, redirects to `returnUrl` (set by authGuard) or /dashboard.
 * - Server errors (401, network) surface as an inline alert.
 *
 * State lives in signals; the form itself is an RxJS-backed FormGroup.
 */
@Component({
  selector: 'app-login',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
  ],
  templateUrl: './login.component.html',
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /** True while the login request is in flight. Disables the submit button. */
  readonly submitting = signal(false);

  /** Error message shown above the form. Null when there is no error. */
  readonly errorMessage = signal<string | null>(null);

  /** True while the password field's visibility is toggled on. */
  readonly passwordVisible = signal(false);

  /** Typed form. Field names match the backend `LoginRequest` contract. */
  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, strictEmail]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  submit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);

    this.auth.login(this.form.getRawValue()).subscribe({
      next: () => {
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') ?? '/dashboard';
        void this.router.navigateByUrl(returnUrl);
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        this.errorMessage.set(extractApiErrorMessage(error));
      },
      complete: () => this.submitting.set(false),
    });
  }

  togglePassword(): void {
    this.passwordVisible.update((v) => !v);
  }

  /** Human-friendly message for a failed login attempt. */
  private describeError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 401) return 'Invalid email or password.';
      if (error.status === 0) return 'Cannot reach the server. Is the backend running?';
      return error.error?.detail ?? `Login failed (${error.status}).`;
    }
    return 'Something went wrong. Please try again.';
  }
}
