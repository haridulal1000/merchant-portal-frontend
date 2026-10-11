import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { provideZonelessChangeDetection } from '@angular/core';
import { UserRole } from '@core/models/user.model';
import { describe, beforeEach, afterEach, it, expect } from 'vitest';
import { roleGuard } from './role.guard';
import { TokenStorageService } from './token-storage.service';

describe('roleGuard', () => {
  let storage: TokenStorageService;

  const route = {} as ActivatedRouteSnapshot;
  const state = { url: '/dashboard' } as RouterStateSnapshot;

  function seedSession(role: UserRole): void {
    storage.save({
      accessToken: 'at',
      refreshToken: 'rt',
      user: {
        id: 'u1',
        email: 'x@y.z',
        name: 'X',
        role,
        created_at: '2026-01-01T00:00:00Z',
      },
    });
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
      ],
    });
    storage = TestBed.inject(TokenStorageService);
    storage.clear();
  });

  afterEach(() => storage.clear());

  it('allows a user whose role is in the allowed list', () => {
    seedSession('REVIEWER');
    const guard = roleGuard('REVIEWER', 'ADMIN');
    const result = TestBed.runInInjectionContext(() => guard(route, state));
    expect(result).toBe(true);
  });

  it('redirects an authenticated user with the wrong role to /dashboard', () => {
    seedSession('SALES');
    const guard = roleGuard('REVIEWER', 'ADMIN');
    const result = TestBed.runInInjectionContext(() => guard(route, state));

    expect(result).toBeInstanceOf(UrlTree);
    expect(String(result)).toContain('/dashboard');
  });

  it('redirects unauthenticated users to /login with returnUrl', () => {
    const guard = roleGuard('ADMIN');
    const result = TestBed.runInInjectionContext(() => guard(route, state));

    expect(result).toBeInstanceOf(UrlTree);
    const tree = result as UrlTree;
    expect(tree.toString()).toContain('/login');
    expect(tree.queryParams['returnUrl']).toBe('/dashboard');
  });
});
