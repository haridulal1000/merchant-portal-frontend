import { Component, signal, viewChild } from '@angular/core';
import { MatSidenavModule, MatSidenav } from '@angular/material/sidenav';
import { RouterOutlet } from '@angular/router';
import { HeaderComponent } from '@layout/header/header.component';
import { NavComponent } from '@layout/nav/nav.component';

/**
 * Persistent app shell: header on top, sidenav on the left, routed content
 * in the remaining space. The sidenav is opened/closed imperatively via a
 * template ref triggered by the header's menu toggle event.
 */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, HeaderComponent, NavComponent, MatSidenavModule],
  templateUrl: './shell.component.html',
})
export class ShellComponent {
  private readonly sidenav = viewChild.required(MatSidenav);

  /** Whether the sidenav is expanded. Only relevant on small screens. */
  readonly sidenavOpened = signal(false);

  toggleSidenav(): void {
    this.sidenavOpened.update((open) => !open);
  }
}
