/**
 * Merchant application domain models.
 */

export type ApplicationStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'REJECTED';

export type RiskDecision = 'LOW' | 'MEDIUM' | 'HIGH' | 'REJECTED';

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
  sales_rep_id: string;
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