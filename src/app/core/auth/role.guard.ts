import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import type { UserRole } from '../models/user.model';
import { TokenStorageService } from '@core/auth/token-storage.service';

/**
 * Factory that produces a guard allowing only the given roles.
 *
 * Example:
 *   { path: 'admin', canActivate: [roleGuard(['ADMIN'])] }
 *
 * Unauthenticated users go to /login. Authenticated users with the wrong
 * role go to /dashboard — the backend would reject them anyway, but this
 * keeps the UX honest.
 */
export const roleGuard = (...allowedRoles: UserRole[]): CanActivateFn => {
  return (_route, state) => {
    const storage = inject(TokenStorageService);
    const router = inject(Router);

    const user = storage.user();
    if (!user) {
      return router.createUrlTree(['/login'], {
        queryParams: { returnUrl: state.url },
      });
    }

    if (allowedRoles.includes(user.role)) {
      return true;
    }

    return router.createUrlTree(['/dashboard']);
  };
};