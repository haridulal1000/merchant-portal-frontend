import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '@core/auth/auth.service';
import { UserRole } from '@core/models/user.model';


interface RoleOption {
  value: UserRole;
  label: string;
  hint: string;
}

/**
 * Signup page. Creates a user with a chosen role.
 *
 * - Reactive Form with cross-field validation (password confirmation).
 * - Role is selectable so reviewers can create test accounts for any role.
 * - On success, redirects to /dashboard.
 */
@Component({
  selector: 'app-signup',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatProgressBarModule,
  ],
  templateUrl: './signup.component.html',
})
export class SignupComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly passwordVisible = signal(false);

  /** Role dropdown options. */
  readonly roleOptions: RoleOption[] = [
    { value: 'SALES', label: 'Sales', hint: 'Create and manage your own applications' },
    { value: 'REVIEWER', label: 'Reviewer', hint: 'Review applications and record decisions' },
    { value: 'ADMIN', label: 'Admin', hint: 'Full access to all applications and users' },
  ];

  /**
   * Typed form. Password confirmation is validated by the `passwordsMatch`
   * validator below, which lives at the group level.
   */
  readonly form = this.fb.nonNullable.group(
    {
      name: ['', [Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]],
      role: ['SALES' as UserRole, [Validators.required]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: [passwordsMatch] },
  );

  submit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);

    const { confirmPassword: _ignored, ...payload } = this.form.getRawValue();

    this.auth.signup(payload).subscribe({
      next: () => void this.router.navigateByUrl('/dashboard'),
      error: (error: unknown) => {
        this.submitting.set(false);
        this.errorMessage.set(this.describeError(error));
      },
      complete: () => this.submitting.set(false),
    });
  }

  togglePassword(): void {
    this.passwordVisible.update((v) => !v);
  }

  private describeError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 400) return 'That email is already registered.';
      if (error.status === 422) return 'Please check your details and try again.';
      if (error.status === 0) return 'Cannot reach the server. Is the backend running?';
      return error.error?.detail ?? `Signup failed (${error.status}).`;
    }
    return 'Something went wrong. Please try again.';
  }
}

/**
 * Group-level validator: the two password fields must match.
 * Attached to the FormGroup so the error surfaces on the confirm field.
 */
function passwordsMatch(group: {
  get: (name: string) => { value: unknown } | null;
}): Record<string, boolean> | null {
  const password = group.get('password')?.value;
  const confirm = group.get('confirmPassword')?.value;
  if (password === confirm) return null;
  return { passwordsMismatch: true };
}