import { Component, computed, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

/**
 * Masks a sensitive string by default and reveals it on user request.
 *
 * Design decisions:
 *   - Masking is on by default; there is no "remember reveal" behavior.
 *   - Reveal is per-instance, not persisted, so the value re-hides on
 *     navigation or refresh.
 *   - Reveal requires an explicit click — the button is keyboard accessible
 *     and carries an aria-label describing the state.
 *
 * This is UI-only. Sensitive data still travels over the API; the mask
 * prevents shoulder-surfing and casual screenshots, not exfiltration.
 */
@Component({
  selector: 'app-masked-field',
  imports: [MatButtonModule, MatIconModule],
  template: `
    <span class="inline-flex items-center gap-2">
      <span class="font-mono">{{ display() }}</span>
      @if (revealable()) {
        <button
          mat-icon-button
          type="button"
          class="!h-7 !w-7"
          [attr.aria-label]="revealed() ? 'Hide value' : 'Reveal value'"
          [attr.aria-pressed]="revealed()"
          (click)="toggle()"
        >
          <mat-icon class="!text-base">
            {{ revealed() ? 'visibility_off' : 'visibility' }}
          </mat-icon>
        </button>
      }
    </span>
  `,
})
export class MaskedFieldComponent {
  readonly value = input.required<string>();

  /** When false, the value is always masked and no toggle is shown. */
  readonly revealable = input<boolean>(true);

  /**
   * Optional custom masker. Defaults to showing only the last 4 characters
   * with a fixed-length prefix, which keeps the mask shape consistent and
   * avoids leaking the exact length of short values.
   */
  readonly masker = input<(value: string) => string>(defaultMask);

  protected readonly revealed = signal(false);

  readonly display = computed<string>(() =>
    this.revealed() ? this.value() : this.masker()(this.value()),
  );

  toggle(): void {
    this.revealed.update((v) => !v);
  }
}

/** Default masker: fixed 8-dot prefix + last 4 characters. */
function defaultMask(value: string): string {
  if (!value) return '••••••••';
  const tail = value.length <= 4 ? value : value.slice(-4);
  return `••••••••${tail}`;
}