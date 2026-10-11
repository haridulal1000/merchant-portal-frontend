import { Injectable, inject } from '@angular/core';
import { MatSnackBar, MatSnackBarConfig } from '@angular/material/snack-bar';

/**
 * Thin wrapper around MatSnackBar for consistent, app-wide notifications.
 *
 * Why a wrapper instead of using MatSnackBar directly:
 *   - One place to tune durations, positions, and styling.
 *   - Callers express intent (`notify.error(...)`) instead of configuring
 *     snackbars.
 *   - Makes it trivial to swap the mechanism later (toast library, banner,
 *     notification center) without touching call sites.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly snackBar = inject(MatSnackBar);

  private readonly baseConfig: MatSnackBarConfig = {
    duration: 5000,
    horizontalPosition: 'end',
    verticalPosition: 'bottom',
  };

  /** Error message. Longer duration; caller should pass a user-readable string. */
  error(message: string, action = 'Dismiss'): void {
    this.snackBar.open(message, action, {
      ...this.baseConfig,
      duration: 8000,
      panelClass: ['app-snack-error'],
    });
  }

  /** Informational message. */
  info(message: string, action = 'OK'): void {
    this.snackBar.open(message, action, {
      ...this.baseConfig,
      panelClass: ['app-snack-info'],
    });
  }

  /** Success confirmation. */
  success(message: string, action = 'OK'): void {
    this.snackBar.open(message, action, {
      ...this.baseConfig,
      duration: 3000,
      panelClass: ['app-snack-success'],
    });
  }

  /** Manually dismiss the current snackbar, if any. */
  dismiss(): void {
    this.snackBar.dismiss();
  }
}
