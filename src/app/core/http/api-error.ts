import { HttpErrorResponse } from '@angular/common/http';

/**
 * Extracts a human-readable message from an HTTP error.
 *
 * FastAPI has two error shapes:
 *   1. Simple:       { detail: "Invalid credentials" }
 *   2. Validation:   { detail: [{ loc: ["body","field"], msg: "...", type: "..." }] }
 *
 * The FastAPI validation shape is what produces the "value is not a valid
 * email address" payload the frontend was failing to render.
 */
export function extractApiErrorMessage(error: unknown): string {
  if (!(error instanceof HttpErrorResponse)) {
    return 'Something went wrong. Please try again.';
  }

  if (error.status === 0) {
    return 'Cannot reach the server. Is the backend running?';
  }

  const body = error.error;

  // FastAPI validation errors — array of { loc, msg, type }
  if (body && Array.isArray(body.detail)) {
    return body.detail
      .map((item: { loc?: unknown[]; msg?: string }) => {
        const field =
          Array.isArray(item.loc) && item.loc.length > 0
            ? String(item.loc[item.loc.length - 1])
            : 'field';
        return `${humanizeField(field)}: ${item.msg ?? 'invalid'}`;
      })
      .join(' • ');
  }

  // Simple string detail
  if (body && typeof body.detail === 'string') {
    return body.detail;
  }

  return `Request failed (${error.status}).`;
}

/** `contact_email` → `Contact email` */
function humanizeField(field: string): string {
  return field
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/^./, (c) => c.toUpperCase());
}