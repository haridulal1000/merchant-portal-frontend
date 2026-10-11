import {
  HttpErrorResponse,
  HttpInterceptorFn,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { NotificationService } from '@shared/services/notification.service';

/** Endpoints where the UI already renders the error inline. */
const AUTH_FORM_ENDPOINTS = /\/auth\/(login|signup)/;
/** The refresh endpoint is called internally; its failures surface as session expiry. */
const REFRESH_ENDPOINT = /\/auth\/refresh$/;

/**
 * Global HTTP error handler.
 *
 * Detection strategy:
 *   - Prefer `instanceof HttpErrorResponse`.
 *   - Fall back to duck-typing (object with a numeric `status`) so wrapped
 *     or cross-realm errors are still classified correctly.
 *   - Anything still unclassified is wrapped and shown as a generic toast.
 *
 * Toast policy:
 *   - 401 on /auth/login or /auth/signup  -> toast ("Invalid email or password")
 *   - 401 elsewhere                       -> no toast (session-expiry redirect)
 *   - 400/422 with FastAPI detail         -> toast (parsed field message)
 *   - 403/404/409/429                     -> toast (specific message)
 *   - 5xx                                 -> toast ("Server error")
 *   - status 0 (network)                  -> toast ("Cannot reach the server")
 *   - Request cancelled by navigation     -> no toast
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const notify = inject(NotificationService);

  return next(req).pipe(
    catchError((error: unknown) => {
      const httpError = toHttpError(error);

      logToConsole(req.method, req.urlWithParams, httpError);
      maybeNotify(notify, req.url, httpError);

      return throwError(() => httpError);
    }),
  );
};

// ---------------------------------------------------------------------------
// Detection helpers
// ---------------------------------------------------------------------------

/**
 * Coerce any thrown value into an HttpErrorResponse so the rest of this
 * interceptor can work with one type. Uses duck-typing as a fallback so
 * errors that cross module boundaries or come from wrapped sources are
 * still recognized.
 */
function toHttpError(error: unknown): HttpErrorResponse {
  if (error instanceof HttpErrorResponse) return error;

  if (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof (error as { status: unknown }).status === 'number'
  ) {
    const e = error as {
      status: number;
      statusText?: string;
      url?: string | null;
      error?: unknown;
    };
    return new HttpErrorResponse({
      status: e.status,
      statusText: e.statusText ?? '',
      url: e.url ?? '',
      error: e.error,
    });
  }

  // Last resort: wrap so downstream consumers still see a typed error.
  return new HttpErrorResponse({
    status: 0,
    statusText: 'Unknown Error',
    error: { detail: String(error) },
  });
}

// ---------------------------------------------------------------------------
// Toast policy
// ---------------------------------------------------------------------------

function maybeNotify(
  notify: NotificationService,
  url: string,
  error: HttpErrorResponse,
): void {
  if (isCancelled(error)) return;
  if (REFRESH_ENDPOINT.test(url)) return;

  const message = humanMessage(url, error);
  if (message === null) return;

  notify.error(message);
}

/** Detect Angular's client-side cancellation error (status 0, no body). */
function isCancelled(error: HttpErrorResponse): boolean {
  return (
    error.status === 0 &&
    error.error == null &&
    error.statusText.toLowerCase().includes('unknown')
  );
}

/**
 * Map an HttpErrorResponse to a user-readable string, or null to suppress
 * the toast for this particular combination of URL and status.
 */
function humanMessage(
  url: string,
  error: HttpErrorResponse,
): string | null {
  // Auth forms render their own inline errors for validation failures.
  // We still toast 401 on those endpoints so a toast appears when the
  // inline UI misses it (e.g., redirect races).
  if (AUTH_FORM_ENDPOINTS.test(url)) {
    if (error.status === 401) return 'Invalid email or password.';
    if (error.status === 400) return 'That email is already registered.';
    if (error.status === 422) return 'Please check your details and try again.';
    return extractDetail(error) ?? 'Sign in failed. Please try again.';
  }

  // Session expiry is handled by authInterceptor (redirect to /login).
  if (error.status === 401) return null;

  if (error.status === 0) {
    return 'Cannot reach the server. Check your connection and try again.';
  }

  const detail = extractDetail(error);
  if (detail) return detail;

  switch (error.status) {
    case 400:
      return 'The request could not be processed. Please review your input.';
    case 403:
      return 'You do not have permission to perform this action.';
    case 404:
      return 'The requested resource was not found.';
    case 409:
      return 'This action conflicts with the current state. Please refresh.';
    case 429:
      return 'Too many requests. Please wait a moment and try again.';
    default:
      if (error.status >= 500) {
        return 'Server error. Please try again shortly.';
      }
      return `Request failed (${error.status}).`;
  }
}

/**
 * Extract a human-readable message from FastAPI error bodies.
 * Handles the simple shape `{ detail: "..." }` and the validation shape
 * `{ detail: [{ loc: [...], msg: "..." }] }`.
 */
function extractDetail(error: HttpErrorResponse): string | null {
  const body = error.error;
  if (!body) return null;

  if (typeof body.detail === 'string') {
    return body.detail;
  }

  if (Array.isArray(body.detail) && body.detail.length > 0) {
    const first = body.detail[0] as { loc?: unknown[]; msg?: string };
    const field =
      Array.isArray(first?.loc) && first.loc.length > 0
        ? String(first.loc[first.loc.length - 1]).replace(/_/g, ' ')
        : 'field';
    return `Invalid ${field}: ${first?.msg ?? 'check your input'}`;
  }

  return null;
}

function logToConsole(method: string, url: string, error: HttpErrorResponse): void {
  console.error(
    `[HTTP ${error.status}] ${method} ${url}`,
    error.error ?? error.message,
  );
}