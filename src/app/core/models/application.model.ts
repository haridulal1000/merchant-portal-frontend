import type { UserRole } from './user.model';

export type ApplicationStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'REJECTED';

export type RiskDecision = 'LOW' | 'MEDIUM' | 'HIGH' | 'REJECTED';

/**
 * Compact user representation embedded inside an application response.
 * Matches the backend `UserSummary` Pydantic model.
 */
export interface UserSummary {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface MerchantApplication {
  id: string;
  merchant_name: string;
  business_type: string;
  annual_revenue: number;
  contact_email: string;
  contact_phone: string;
  status: ApplicationStatus;
  risk_score: number | null;
  risk_decision: RiskDecision | null;
  submitted_at: string | null;
  assigned_at: string | null;

  /** The sales rep who created the application. Always present. */
  sales_rep: UserSummary;

  /** The reviewer this application is assigned to, if any. */
  assigned_reviewer: UserSummary | null;

  created_at: string;
  updated_at: string;
}

export interface CreateApplicationRequest {
  merchant_name: string;
  business_type: string;
  annual_revenue: number;
  contact_email: string;
  contact_phone: string;
}

export type UpdateApplicationRequest = Partial<CreateApplicationRequest>;

export interface ListApplicationsQuery {
  page?: number;
  limit?: number;
  status?: ApplicationStatus;
  search?: string;
}