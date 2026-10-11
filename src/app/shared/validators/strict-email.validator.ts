import type { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Email validator that matches the backend's Pydantic EmailStr rules more
 * closely than Angular's built-in Validators.email.
 *
 * The built-in accepts `user@host` (no dot), which Pydantic rejects. This
 * version requires:
 *   - a non-empty local part (no spaces)
 *   - an @ separator
 *   - a domain with at least one dot
 *   - a TLD of 2+ characters
 *
 * Empty values pass through (Validators.required handles that case).
 */
export const strictEmail: ValidatorFn = (
  control: AbstractControl,
): ValidationErrors | null => {
  const value = control.value;
  if (typeof value !== 'string' || value.length === 0) return null;

  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
  return valid ? null : { strictEmail: true };
};