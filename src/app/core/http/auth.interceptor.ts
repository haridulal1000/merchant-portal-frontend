import {
  HttpErrorResponse,
  HttpInterceptorFn,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthRefreshService } from '../auth/auth-refresh.service';
import { TokenStorageService } from '../auth/token-storage.service';

/** Endpoints that must NOT receive an Authorization header. */
const PUBLIC_ENDPOINTS = /\/auth\/(login|signup|refresh)/;

/**
 * Attaches the access token to outgoing requests. On 401:
 *   1. If no refresh is in flight, start one via AuthRefreshService.
 *   2. If a refresh is already in flight, wait for it.
 *   3. Retry the original request with the new access token.
 *   4. If refresh fails, clear the session and redirect to /login.
 *
 * Concurrency guarantee: N simultaneous 401s trigger exactly ONE refresh call.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const storage = inject(TokenStorageService);
  const refresh = inject(AuthRefreshService);
  const router = inject(Router);

  // Public endpoints skip both token attachment and refresh retry.
  if (PUBLIC_ENDPOINTS.test(req.url)) {
    return next(req);
  }

  const accessToken = storage.accessToken();
  const authorizedReq = accessToken
    ? req.clone({ setHeaders: { Authorization: `Bearer ${accessToken}` } })
    : req;

  return next(authorizedReq).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
        return throwError(() => error);
      }

      // No refresh token means we cannot recover; surface the 401.
      if (!storage.refreshToken()) {
        return throwError(() => error);
      }

      return refresh.refresh().pipe(
        switchMap((newToken) =>
          next(
            req.clone({ setHeaders: { Authorization: `Bearer ${newToken}` } }),
          ),
        ),
        catchError((refreshError) => {
          // Refresh failed: clear session and send the user to login.
          storage.clear();
          void router.navigate(['/login'], {
            queryParams: { reason: 'session-expired' },
          });
          return throwError(() => refreshError);
        }),
      );
    }),
  );
};