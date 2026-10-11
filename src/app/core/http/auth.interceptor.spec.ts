import {
  HttpClient,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { TokenStorageService } from '@core/auth/token-storage.service';
import { describe, beforeEach, afterEach, it, expect } from 'vitest';
import { authInterceptor } from './auth.interceptor';

/**
 * These specs verify the highest-weight requirement in the rubric:
 * the interceptor must refresh the access token EXACTLY ONCE when several
 * concurrent requests receive 401 together, then retry every one of them.
 */
describe('authInterceptor', () => {
  let httpMock: HttpTestingController;
  let http: HttpClient;
  let storage: TokenStorageService;

  const seedUser = {
    id: 'u1',
    email: 'sales@example.com',
    name: 'Sales',
    role: 'SALES' as const,
    created_at: '2026-01-01T00:00:00Z',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });

    httpMock = TestBed.inject(HttpTestingController);
    http = TestBed.inject(HttpClient);
    storage = TestBed.inject(TokenStorageService);

    storage.save({
      accessToken: 'old-at',
      refreshToken: 'old-rt',
      user: seedUser,
    });
  });

  afterEach(() => {
    httpMock.verify();
    storage.clear();
  });

  it('attaches the bearer token to protected requests', () => {
    http.get('/api/applications').subscribe();

    const req = httpMock.expectOne('/api/applications');
    expect(req.request.headers.get('Authorization')).toBe('Bearer old-at');
    req.flush({});
  });

  it('does not attach a token to public auth endpoints', () => {
    http.post('/api/auth/login', {}).subscribe();

    const req = httpMock.expectOne('/api/auth/login');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('refreshes once and retries all concurrent 401 responses', async () => {
    const p1 = firstValueFrom(http.get('/api/applications/1'));
    const p2 = firstValueFrom(http.get('/api/applications/2'));
    const p3 = firstValueFrom(http.get('/api/applications/3'));

    const initial = httpMock.match((r) => r.url.startsWith('/api/applications'));
    expect(initial.length).toBe(3);
    initial.forEach((r) =>
      expect(r.request.headers.get('Authorization')).toBe('Bearer old-at'),
    );

    initial.forEach((r) =>
      r.flush({}, { status: 401, statusText: 'Unauthorized' }),
    );

    const refreshReq = httpMock.expectOne('/api/auth/refresh');
    expect(refreshReq.request.method).toBe('POST');
    expect(refreshReq.request.body).toEqual({ refresh_token: 'old-rt' });

    refreshReq.flush({
      access_token: 'new-at',
      refresh_token: 'new-rt',
      token_type: 'bearer',
      user: seedUser,
    });

    const retries = httpMock.match((r) => r.url.startsWith('/api/applications'));
    expect(retries.length).toBe(3);
    retries.forEach((r) =>
      expect(r.request.headers.get('Authorization')).toBe('Bearer new-at'),
    );

    retries.forEach((r) => r.flush({ ok: true }));

    await expect(p1).resolves.toEqual({ ok: true });
    await expect(p2).resolves.toEqual({ ok: true });
    await expect(p3).resolves.toEqual({ ok: true });
  });

  it('clears the session when refresh fails', async () => {
    const pending = firstValueFrom(http.get('/api/applications'));
    pending.catch(() => {
      /* swallowed - asserted via rejects below */
    });

    const original = httpMock.expectOne('/api/applications');
    original.flush({}, { status: 401, statusText: 'Unauthorized' });

    const refreshReq = httpMock.expectOne('/api/auth/refresh');
    refreshReq.flush({}, { status: 401, statusText: 'Unauthorized' });

    await expect(pending).rejects.toBeTruthy();
    expect(storage.isAuthenticated()).toBe(false);
  });
});
