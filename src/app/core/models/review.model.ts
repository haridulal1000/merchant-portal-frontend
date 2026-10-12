import type { RiskDecision } from './application.model';

/**
 * What the reviewer decided to do with the application.
 * Drives the resulting ApplicationStatus:
 *   APPROVE      -> APPROVED
 *   REJECT       -> REJECTED
 *   UNDER_REVIEW -> UNDER_REVIEW (escalated)
 */
export type ReviewAction = 'APPROVE' | 'REJECT' | 'UNDER_REVIEW';

export interface Review {
  id: string;
  application_id: string;
  reviewer_id: string;
  action: ReviewAction;
  decision: RiskDecision;
  comment: string | null;
  created_at: string;
}

export interface CreateReviewRequest {
  action: ReviewAction;
  decision: RiskDecision;
  comment?: string;
}