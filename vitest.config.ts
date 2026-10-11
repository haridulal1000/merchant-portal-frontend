/// <reference types="vitest" />
import path from 'node:path';
import { defineConfig } from 'vitest/config';
import angular from '@analogjs/vite-plugin-angular';

/**
 * Vitest configuration for the Angular app.
 *
 * - @analogjs/vite-plugin-angular compiles Angular components on the fly.
 * - resolve.alias mirrors the `paths` map in tsconfig.json so tests resolve
 *   `@core/*`, `@shared/*` etc. the same way the app does at build time.
 * - jsdom is the test environment (no browser install required).
 */
export default defineConfig({
  plugins: [angular()],
  resolve: {
    alias: {
      '@core':     path.resolve(__dirname, 'src/app/core'),
      '@shared':   path.resolve(__dirname, 'src/app/shared'),
      '@features': path.resolve(__dirname, 'src/app/features'),
      '@layout':   path.resolve(__dirname, 'src/app/layout'),
      '@env':      path.resolve(__dirname, 'src/environments'),
    },
    mainFields: ['module'],
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
    include: ['src/**/*.spec.ts'],
    reporters: ['default'],
  },
});