import { Component, computed, input } from '@angular/core';
import { ApplicationStatus } from '@core/models/application.model';

/**
 * Presentational badge for an application status.
 * Color mapping is centralized here so every view renders statuses consistently.
 */
@Component({
  selector: 'app-status-badge',
  template: `
    <span
      class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
      [class]="classes()"
    >
      {{ label() }}
    </span>
  `,
})
export class StatusBadgeComponent {
  readonly status = input.required<ApplicationStatus>();

  readonly label = computed<string>(() => LABELS[this.status()]);
  readonly classes = computed<string>(() => CLASSES[this.status()]);
}

const LABELS: Record<ApplicationStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under Review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};

const CLASSES: Record<ApplicationStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-800',
  SUBMITTED: 'bg-blue-100 text-blue-800',
  UNDER_REVIEW: 'bg-amber-100 text-amber-800',
  APPROVED: 'bg-emerald-100 text-emerald-800',
  REJECTED: 'bg-red-100 text-red-800',
};