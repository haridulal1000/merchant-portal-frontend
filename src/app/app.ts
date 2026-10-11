import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/**
 * Root component. Intentionally minimal: routing decides what renders.
 * The persistent shell (header, nav) is a separate layout component.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
export class App {}