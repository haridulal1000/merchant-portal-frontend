import { Component, computed, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '@core/auth/auth.service';
import { UserRole } from '@core/models/user.model';


interface NavItem {
  label: string;
  icon: string;
  route: string;
  roles?: UserRole[];
}

/**
 * Sidenav navigation. Items are filtered by role so users only see what
 * they can actually access. Visibility is UX only; guards and the backend
 * enforce the real rules.
 */
@Component({
  selector: 'app-nav',
  imports: [MatListModule, MatIconModule, RouterLink, RouterLinkActive],
  templateUrl: './nav.component.html',
})
export class NavComponent {
  private readonly auth = inject(AuthService);

  private readonly allItems: NavItem[] = [
    { label: 'Dashboard', icon: 'dashboard', route: '/dashboard' },
    {
      label: 'New Application',
      icon: 'add_circle',
      route: '/applications/new',
      roles: ['SALES', 'ADMIN'],
    },
  ];

  /** Items the current user is allowed to see, recomputed when role changes. */
  readonly visibleItems = computed<NavItem[]>(() => {
    const role = this.auth.role();
    if (!role) return [];
    return this.allItems.filter((item) => !item.roles || item.roles.includes(role));
  });
}