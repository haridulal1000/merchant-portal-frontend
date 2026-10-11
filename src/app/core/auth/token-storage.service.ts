import { Injectable, computed, signal } from '@angular/core';
import { User } from '@core/models/user.model';


/**
 * Shape of the persisted session object.
 * Stored under a single key so we can read/write atomically.
 */
interface StoredSession {
  accessToken: string;
  refreshToken: string;
  user: User;
}

const STORAGE_KEY = 'mp.session';

/**
 * Persists the current auth session (tokens + user) and exposes it as signals.
 *
 * This service is deliberately HTTP-free. It only owns the storage concern so
 * that the HTTP interceptor can depend on it without creating a cycle with
 * AuthService.
 */
@Injectable({ providedIn: 'root' })
export class TokenStorageService {
  /** Backing signal; the single source of truth for the session. */
  private readonly session = signal<StoredSession | null>(this.readFromStorage());

  readonly accessToken = computed(() => this.session()?.accessToken ?? null);
  readonly refreshToken = computed(() => this.session()?.refreshToken ?? null);
  readonly user = computed(() => this.session()?.user ?? null);
  readonly isAuthenticated = computed(() => this.session() !== null);

  /** Persist a full session (used on login / signup / refresh). */
  save(session: StoredSession): void {
    this.session.set(session);
    this.writeToStorage(session);
  }

  /**
   * Update only the token pair while keeping the user.
   * Used by the interceptor after a successful refresh.
   */
  updateTokens(accessToken: string, refreshToken: string): void {
    const current = this.session();
    if (!current) return;
    this.save({ ...current, accessToken, refreshToken });
  }

  /** Wipe the session. Called on logout or unrecoverable 401. */
  clear(): void {
    this.session.set(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage can throw in private mode; in-memory state is already cleared.
    }
  }

  private readFromStorage(): StoredSession | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as StoredSession) : null;
    } catch {
      return null;
    }
  }

  private writeToStorage(session: StoredSession): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch {
      // Ignore quota / private-mode errors; in-memory session still works.
    }
  }
}