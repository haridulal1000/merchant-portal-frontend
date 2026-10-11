import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

/**
 * Global HTTP error logger. Runs late in the response chain so that any
 * recoverable 401s handled by the auth interceptor do NOT reach this log.
 *
 * The single console.error here is the extension point for a future toast
 * service — swap it for `toast.error(...)` when the notification layer lands.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse) {
        console.error(
          `[HTTP ${error.status}] ${req.method} ${req.urlWithParams}`,
          error.error,
        );
      } else {
        console.error('[HTTP unknown error]', error);
      }
      return throwError(() => error);
    }),
  );
};