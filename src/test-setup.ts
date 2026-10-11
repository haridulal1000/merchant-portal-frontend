/**
 * Global Vitest setup.
 *
 * The @analogjs/vitest-angular plugin wires up the Angular TestBed
 * environment automatically. We only need to import its setup helper so
 * that spec files can call TestBed.configureTestingModule() without any
 * additional bootstrap.
 *
 * No zone.js import — the app runs zoneless and each spec provides
 * provideZonelessChangeDetection() in its TestBed providers.
 */
import '@analogjs/vitest-angular/setup-zone';