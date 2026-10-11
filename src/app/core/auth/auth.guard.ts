import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { TokenStorageService } from '@core/auth/token-storage.service';

/**
 * Blocks unauthenticated access. Redirects to /login, preserving the
 * intended URL as returnUrl so we can bounce back after login.
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const storage = inject(TokenStorageService);
  const router = inject(Router);

  if (storage.isAuthenticated()) {
    return true;
  }

  return router.createUrlTree(['/login'], {
    queryParams: { returnUrl: state.url },
  });
};