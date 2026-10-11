import { Injectable, inject } from '@angular/core';
import {
  HttpBackend,
  HttpErrorResponse,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import {
  Observable,
  catchError,
  finalize,
  map,
  shareReplay,
  tap,
  throwError,
} from 'rxjs';
import { TokenStorageService } from '@core/auth/token-storage.service';
import { TokenResponse } from '@core/models/user.model';
import { environment } from '@env/environment';


/** Request body sent to POST /auth/refresh. */
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
 * The single-flight pattern guarantees that N concurrent 401s trigger
 * exactly ONE POST /auth/refresh. The first 401 starts the refresh; every
 * subsequent 401 subscribes to the same in-flight observable.
 */
@Injectable({ providedIn: 'root' })
export class AuthRefreshService {
  private readonly backend = inject(HttpBackend);
  private readonly storage = inject(TokenStorageService);

  /** Holds the in-flight refresh while it is running; null otherwise. */
  private inFlight$: Observable<string> | null = null;

  /**
   * Returns an observable that emits the NEW access token once refresh
   * succeeds. Concurrent callers share the same underlying HTTP request.
   */
  refresh(): Observable<string> {
    if (this.inFlight$) {
      return this.inFlight$;
    }

    const refreshToken = this.storage.refreshToken();
    if (!refreshToken) {
      return throwError(
        () =>
          new HttpErrorResponse({ status: 401, statusText: 'No refresh token' }),
      );
    }

    // HttpRequest<T> is generic over the REQUEST BODY type, not the response.
    const request = new HttpRequest<RefreshRequestBody>(
      'POST',
      `${environment.apiUrl}/auth/refresh`,
      { refresh_token: refreshToken },
    );

    const source$ = this.backend.handle(request).pipe(
      map((event) => {
        if (!(event instanceof HttpResponse)) {
          throw new Error('Unexpected non-response event from refresh endpoint');
        }
        // HttpBackend is untyped; we assert the known backend contract here.
        return event.body as TokenResponse;
      }),
      tap((tokens) => {
        // Persist the new pair before any retry uses it.
        this.storage.updateTokens(tokens.access_token, tokens.refresh_token);
      }),
      map((tokens) => tokens.access_token),
    );

    this.inFlight$ = source$.pipe(
      // Buffer the final value so late subscribers get the token even
      // after the source has completed.
      shareReplay({ bufferSize: 1, refCount: false }),
      // Clear the cache when the refresh terminates (success or error),
      // so the NEXT 401 starts a fresh refresh.
      finalize(() => {
        this.inFlight$ = null;
      }),
      catchError((error) => throwError(() => error)),
    );

    return this.inFlight$;
  }
}