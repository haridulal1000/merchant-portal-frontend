import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found',
  imports: [MatButtonModule, RouterLink],
  template: `
    <section class="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <h1 class="text-4xl font-semibold">404</h1>
      <p class="text-surface-800">That page does not exist.</p>
      <a mat-flat-button color="primary" routerLink="/dashboard">Back to dashboard</a>
    </section>
  `,
})
export class NotFoundComponent {}