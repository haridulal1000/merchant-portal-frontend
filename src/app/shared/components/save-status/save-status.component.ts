import { Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

/**
 * Small inline indicator that reports the state of a background save.
 * Reused by the wizard autosave and any future background-save feature.
 *
 * Never hides itself while saving — the user should see that work is in
 * progress and that a failure has occurred.
 */
@Component({
  selector: 'app-save-status',
  imports: [MatIconModule],
  template: `
    <span
      class="inline-flex items-center gap-1 text-xs"
      [class]="toneClass()"
      role="status"
      aria-live="polite"
    >
      <mat-icon class="!h-4 !w-4 !text-base">{{ icon() }}</mat-icon>
      {{ label() }}
    </span>
  `,
})
export class SaveStatusComponent {
  readonly status = input.required<SaveStatus>();
  /** Optional override label; falls back to a default per status. */
  readonly labelOverride = input<string | null>(null);

  label(): string {
    if (this.labelOverride()) return this.labelOverride()!;
    return DEFAULT_LABELS[this.status()];
  }

  icon(): string {
    return ICONS[this.status()];
  }

  toneClass(): string {
    return TONE_CLASSES[this.status()];
  }
}

const DEFAULT_LABELS: Record<SaveStatus, string> = {
  idle: 'Draft not saved yet',
  pending: 'Waiting for more info…',
  saving: 'Saving…',
  saved: 'All changes saved',
  error: 'Save failed — retrying',
};

const ICONS: Record<SaveStatus, string> = {
  idle: 'edit_note',
  pending: 'hourglass_empty',
  saving: 'sync',
  saved: 'cloud_done',
  error: 'cloud_off',
};

const TONE_CLASSES: Record<SaveStatus, string> = {
  idle: 'text-surface-800',
  pending: 'text-surface-800',
  saving: 'text-blue-700',
  saved: 'text-emerald-700',
  error: 'text-red-700',
};