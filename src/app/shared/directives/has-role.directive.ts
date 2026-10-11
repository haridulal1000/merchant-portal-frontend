import { Directive, TemplateRef, ViewContainerRef, effect, inject, input } from '@angular/core';
import { AuthService } from '@core/auth/auth.service';
import { UserRole } from '@core/models/user.model';


/**
 * Structural directive that renders its host element only when the current
 * user has one of the given roles.
 *
 * Usage:
 *   <button *appHasRole="['SALES', 'ADMIN']">New application</button>
 *
 * Purely a UX concern. The backend enforces authorization on every request.
 * Do not rely on this directive for security.
 */
@Directive({
  selector: '[appHasRole]',
})
export class HasRoleDirective {
  private readonly auth = inject(AuthService);
  private readonly templateRef = inject(TemplateRef<unknown>);
  private readonly viewContainer = inject(ViewContainerRef);

  /** Roles allowed to see the host element. Accepts a signal or a literal array. */
  readonly appHasRole = input.required<UserRole[]>();

  /** Tracks whether the element is currently rendered to avoid redundant work. */
  private isRendered = false;

  constructor() {
    effect(() => {
      const allowed = this.appHasRole();
      const currentRole = this.auth.role();

      const shouldRender = currentRole !== null && allowed.includes(currentRole);

      if (shouldRender && !this.isRendered) {
        this.viewContainer.createEmbeddedView(this.templateRef);
        this.isRendered = true;
      } else if (!shouldRender && this.isRendered) {
        this.viewContainer.clear();
        this.isRendered = false;
      }
    });
  }
}