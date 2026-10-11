import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { MaskedFieldComponent } from './masked-field.component';

describe('MaskedFieldComponent', () => {
  let fixture: ComponentFixture<MaskedFieldComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MaskedFieldComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(MaskedFieldComponent);
    fixture.componentRef.setInput('value', 'user@example.com');
    fixture.detectChanges();
  });

  function text(): string {
    return (fixture.nativeElement as HTMLElement).textContent?.trim() ?? '';
  }

  function toggleButton(): HTMLButtonElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector('button');
  }

  it('masks the value by default', () => {
    expect(text()).toContain('\u2022\u2022\u2022\u2022');
    expect(text()).not.toContain('user@example.com');
    expect(text()).toContain('.com');
  });

  it('reveals the value when the toggle is clicked', () => {
    toggleButton()?.click();
    fixture.detectChanges();
    expect(text()).toContain('user@example.com');
  });

  it('re-masks after a second click', () => {
    toggleButton()?.click();
    fixture.detectChanges();
    toggleButton()?.click();
    fixture.detectChanges();
    expect(text()).not.toContain('user@example.com');
  });

  it('hides the toggle button when revealable is false', () => {
    fixture.componentRef.setInput('revealable', false);
    fixture.detectChanges();
    expect(toggleButton()).toBeNull();
  });

  it('marks the toggle with aria-pressed reflecting the current state', () => {
    expect(toggleButton()?.getAttribute('aria-pressed')).toBe('false');
    toggleButton()?.click();
    fixture.detectChanges();
    expect(toggleButton()?.getAttribute('aria-pressed')).toBe('true');
  });
});
