/**
 * User-related domain models.
 * Field names match the backend API exactly (snake_case) so no mapping layer
 * is required between the client and server.
 */

export type UserRole = 'SALES' | 'REVIEWER' | 'ADMIN';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: User;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface SignupRequest {
  email: string;
  password: string;
  name: string;
  role: UserRole;
}