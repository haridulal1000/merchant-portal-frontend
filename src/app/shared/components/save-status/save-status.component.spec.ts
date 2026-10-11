import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import {
  SaveStatusComponent,
  type SaveStatus,
} from './save-status.component';
import { describe, beforeEach, it, expect } from 'vitest';

describe('SaveStatusComponent', () => {
  let fixture: ComponentFixture<SaveStatusComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SaveStatusComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(SaveStatusComponent);
  });

  function set(status: SaveStatus): void {
    fixture.componentRef.setInput('status', status);
    fixture.detectChanges();
  }

  function text(): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  it('shows "Saving" while saving', () => {
    set('saving');
    expect(text()).toContain('Saving');
  });

  it('shows "All changes saved" when saved', () => {
    set('saved');
    expect(text()).toContain('All changes saved');
  });

  it('shows an error message when save fails', () => {
    set('error');
    expect(text().toLowerCase()).toContain('fail');
  });

  it('carries an aria-live region so screen readers announce changes', () => {
    set('saved');
    const el = fixture.nativeElement.querySelector('[role="status"]');
    expect(el).not.toBeNull();
    expect(el?.getAttribute('aria-live')).toBe('polite');
  });
});
