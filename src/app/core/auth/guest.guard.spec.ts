import { TestBed } from '@angular/core/testing';
import { UrlTree, provideRouter } from '@angular/router';
import { provideZonelessChangeDetection } from '@angular/core';
import { TokenStorageService } from './token-storage.service';
import { guestGuard } from './guest.guard';
import { describe, beforeEach, afterEach, it, expect } from 'vitest';

describe('guestGuard', () => {
  let storage: TokenStorageService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    });
    storage = TestBed.inject(TokenStorageService);
    storage.clear();
  });

  afterEach(() => storage.clear());

  it('allows unauthenticated users through', () => {
    const result = TestBed.runInInjectionContext(() =>
      guestGuard({} as never, {} as never),
    );
    expect(result).toBe(true);
  });

  it('redirects authenticated users to /dashboard', () => {
    storage.save({
      accessToken: 'at',
      refreshToken: 'rt',
      user: {
        id: 'u1',
        email: 'x@y.z',
        name: 'X',
        role: 'SALES',
        created_at: '2026-01-01T00:00:00Z',
      },
    });

    const result = TestBed.runInInjectionContext(() =>
      guestGuard({} as never, {} as never),
    );

    expect(result).toBeInstanceOf(UrlTree);
    expect(String(result)).toContain('/dashboard');
  });
});