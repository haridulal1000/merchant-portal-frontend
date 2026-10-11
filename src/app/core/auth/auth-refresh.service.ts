import { Injectable, inject } from '@angular/core';
import {
  HttpBackend,
  HttpErrorResponse,
  HttpEvent,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import {
  Observable,
  catchError,
  filter,
  finalize,
  map,
  shareReplay,
  take,
  tap,
  throwError,
} from 'rxjs';
import { environment } from '@env/environment';
import type { TokenResponse } from '@core/models/user.model';
import { TokenStorageService } from './token-storage.service';

interface RefreshRequestBody {
  refresh_token: string;
}

/**
 * Coordinates refresh-token exchange across the whole app.
 *
 * Why this exists separately from AuthService:
 *   - AuthService uses HttpClient, which runs through interceptors.
 *   - If the interceptor called AuthService to refresh, we would recurse.
 *   - HttpBackend bypasses interceptors entirely, so we call it directly.
 *
 * HttpBackend emits a stream of HttpEvents (Sent, HeaderResponse, Response).
 * We filter down to the final HttpResponse, take the first one, and use
 * only its body. Reading events with `map` (as opposed to `filter + take`)
 * would throw on the first intermediate event and silently drop the actual
 * response.
 *
 * The single-flight pattern guarantees that N concurrent 401s trigger
 * exactly ONE POST /auth/refresh.
 */
@Injectable({ providedIn: 'root' })
export class AuthRefreshService {
  private readonly backend = inject(HttpBackend);
  private readonly storage = inject(TokenStorageService);

  private inFlight$: Observable<string> | null = null;

  refresh(): Observable<string> {
    if (this.inFlight$) {
      return this.inFlight$;
    }

    const refreshToken = this.storage.refreshToken();
    if (!refreshToken) {
      return throwError(
        () =>
          new HttpErrorResponse({
            status: 401,
            statusText: 'Unauthorized',
            error: { detail: 'No refresh token available' },
          }),
      );
    }

    const request = new HttpRequest<RefreshRequestBody>(
      'POST',
      `${environment.apiUrl}/auth/refresh`,
      { refresh_token: refreshToken },
    );

    const source$ = this.backend.handle(request).pipe(
      // HttpBackend emits Sent / HeaderResponse / Response.
      // We only want the final HttpResponse, and we only want one.
      filter(
        (event: HttpEvent<unknown>): event is HttpResponse<TokenResponse> =>
          event instanceof HttpResponse,
      ),
      take(1),
      map((response) => {
        const body = response.body;
        if (!body?.access_token || !body?.refresh_token) {
          throw new HttpErrorResponse({
            status: 500,
            statusText: 'Internal Server Error',
            error: { detail: 'Malformed refresh response' },
          });
        }
        return body;
      }),
      tap((tokens) => {
        this.storage.updateTokens(tokens.access_token, tokens.refresh_token);
      }),
      map((tokens) => tokens.access_token),
      // Normalize anything that isn't already an HttpErrorResponse so
      // downstream consumers can rely on the standard Angular shape.
      catchError((error: unknown) => {
        if (error instanceof HttpErrorResponse) {
          return throwError(() => error);
        }
        return throwError(
          () =>
            new HttpErrorResponse({
              status: 0,
              statusText: 'Unknown Error',
              error: { detail: String(error) },
            }),
        );
      }),
    );

    this.inFlight$ = source$.pipe(
      shareReplay({ bufferSize: 1, refCount: false }),
      finalize(() => {
        this.inFlight$ = null;
      }),
    );

    return this.inFlight$;
  }
}