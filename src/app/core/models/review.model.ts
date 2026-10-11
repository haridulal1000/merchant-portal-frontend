/**
 * Review (risk decision) domain models.
 */

import { RiskDecision } from "./application.model";

export interface Review {
  id: string;
  application_id: string;
  reviewer_id: string;
  decision: RiskDecision;
  comment: string | null;
  created_at: string;
}

export interface CreateReviewRequest {
  decision: RiskDecision;
  comment?: string;
}