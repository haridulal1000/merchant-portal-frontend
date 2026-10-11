import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { TokenStorageService } from './token-storage.service';

/**
 * Prevents authenticated users from visiting public-only routes
 * (login, signup). Redirects them to /dashboard.
 *
 * Handles the common case where a logged-in user clicks a stale bookmark,
 * types /login manually, or comes back to the tab after a page refresh.
 *
 * Note: TokenStorageService.isAuthenticated() only checks whether a session
 * object exists in storage — it does not validate the token. If the token
 * has expired, the user is redirected to /dashboard, the first API call
 * returns 401, the interceptor attempts a refresh, and on failure the user
 * is sent back to /login. That round-trip is intentional: it keeps the
 * guard synchronous and lets the interceptor own the refresh lifecycle.
 */
export const guestGuard: CanActivateFn = () => {
  const storage = inject(TokenStorageService);
  const router = inject(Router);

  if (storage.isAuthenticated()) {
    return router.createUrlTree(['/dashboard']);
  }

  return true;
};