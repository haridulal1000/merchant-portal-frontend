import {
  ApplicationConfig,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import {
  provideHttpClient,
  withFetch,
  withInterceptors,
} from '@angular/common/http';
import { routes } from './app.routes';
import { errorInterceptor } from './core/http/error.interceptor';
import { authInterceptor } from './core/http/auth.interceptor';

/**
 * Application-wide providers.
 *
 * Interceptor order:
 *   - On the request, they run top-to-bottom.
 *   - On the response, they run bottom-up.
 * The order below wraps the auth interceptor inside the error logger,
 * so recoverable 401s never reach the error log.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideAnimationsAsync(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(
      withFetch(),
      withInterceptors([errorInterceptor, authInterceptor]),
    ),
  ],
};