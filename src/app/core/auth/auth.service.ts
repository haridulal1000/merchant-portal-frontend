import { Injectable, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, map, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { TokenStorageService } from './token-storage.service';
import { UserRole, LoginRequest, User, TokenResponse, SignupRequest } from '../models/user.model';


/**
 * Public authentication API. Delegates storage concerns to
 * TokenStorageService and exposes the current user/role as signals.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly storage = inject(TokenStorageService);
  private readonly router = inject(Router);

  /** Current user, or null if not authenticated. Reactive. */
  readonly user = this.storage.user;

  /** Current role, or null if not authenticated. Reactive. */
  readonly role = computed<UserRole | null>(() => this.user()?.role ?? null);

  /** True when a session is present (not necessarily valid). Reactive. */
  readonly isAuthenticated = this.storage.isAuthenticated;

  login(payload: LoginRequest): Observable<User> {
    return this.http
      .post<TokenResponse>(`${environment.apiUrl}/auth/login`, payload)
      .pipe(
        tap((response) => this.persistSession(response)),
        map((response) => response.user),
      );
  }

  signup(payload: SignupRequest): Observable<User> {
    return this.http
      .post<TokenResponse>(`${environment.apiUrl}/auth/signup`, payload)
      .pipe(
        tap((response) => this.persistSession(response)),
        map((response) => response.user),
      );
  }

  /** Fetch the current user from the backend (verifies the token). */
  me(): Observable<User> {
    return this.http.get<User>(`${environment.apiUrl}/auth/me`);
  }

  /** Clear the session and navigate to login. */
  logout(): void {
    this.storage.clear();
    void this.router.navigate(['/login']);
  }

  /** Convenience check used by the *appHasRole directive. */
  hasRole(...roles: UserRole[]): boolean {
    const current = this.role();
    return current !== null && roles.includes(current);
  }

  private persistSession(response: TokenResponse): void {
    this.storage.save({
      accessToken: response.access_token,
      refreshToken: response.refresh_token,
      user: response.user,
    });
  }
}