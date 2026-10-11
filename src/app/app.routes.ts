import { Routes } from '@angular/router';
import { authGuard } from '@core/auth/auth.guard';
import { guestGuard } from '@core/auth/guest.guard';
import { roleGuard } from '@core/auth/role.guard';

/**
 * Top-level route table.
 *
 *  - /login, /signup are public (no shell) and use guestGuard so a
 *    logged-in user is redirected away from them.
 *  - The shell wraps authenticated routes and hosts the header + sidenav.
 *  - Feature areas are lazy-loaded via loadComponent.
 */
export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('@features/auth/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'signup',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('@features/auth/signup/signup.component').then((m) => m.SignupComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('@layout/shell/shell.component').then((m) => m.ShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('@features/dashboard/dashboard.component').then(
            (m) => m.DashboardComponent,
          ),
      },
      {
        path: 'applications/new',
        canActivate: [roleGuard('SALES', 'ADMIN')],
        loadComponent: () =>
          import('@features/applications/wizard/wizard.component').then(
            (m) => m.WizardComponent,
          ),
      },
      {
        path: 'applications/:id',
        loadComponent: () =>
          import('@features/applications/detail/detail.component').then(
            (m) => m.DetailComponent,
          ),
      },
      {
        path: 'not-found',
        loadComponent: () =>
          import('@features/not-found/not-found.component').then(
            (m) => m.NotFoundComponent,
          ),
      },
    ],
  },
  { path: '**', redirectTo: 'not-found' },
];