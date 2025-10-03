// Server-side type definitions to avoid circular dependencies
// These should be kept in sync with src/shared/types.ts

import { UserRole, ErrorCode, HttpStatus } from './constants';

// User interface
export interface User {
  id: string;
  name: string;
  username?: string;
  password_hash?: string;
  role?: UserRole;
  must_change_password?: boolean;
  email?: string;
  familyId?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

// Family interface
export interface Family {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

// API Response interfaces
export interface LoginResponse {
  token?: string;
  role?: UserRole;
  error?: ErrorCode;
  username?: string;
}

export interface ApiError {
  error: ErrorCode;
  message?: string;
}

// Request interfaces
export interface LoginRequest {
  username: string;
  password: string;
}

export interface ChangePasswordRequest {
  username: string;
  oldPassword: string;
  newPassword: string;
}

// Note: Express Request extension is handled in types.ts to avoid duplicates