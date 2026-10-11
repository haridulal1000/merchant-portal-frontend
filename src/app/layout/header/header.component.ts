import { Component, inject, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatToolbarModule } from '@angular/material/toolbar';
import { Router } from '@angular/router';
import { AuthService } from '@core/auth/auth.service';

/**
 * Persistent top bar. Shows the app name, the current user's name and role,
 * and a menu with logout. Emits a toggle event the shell uses to open the
 * sidenav on small screens.
 */
@Component({
  selector: 'app-header',
  imports: [MatToolbarModule, MatButtonModule, MatIconModule, MatMenuModule],
  templateUrl: './header.component.html',
})
export class HeaderComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly user = this.auth.user;

  /** Fires when the hamburger is clicked. Shell handles opening the sidenav. */
  readonly menuToggled = output<void>();

  logout(): void {
    this.auth.logout();
  }

  goToProfile(): void {
    void this.router.navigate(['/dashboard']);
  }
}