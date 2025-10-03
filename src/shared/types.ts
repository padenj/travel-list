// Shared TypeScript types and interfaces
import { ERROR_CODES, USER_ROLES, HTTP_STATUS } from './constants';

// Type definitions
export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];
export type UserRole = typeof USER_ROLES[keyof typeof USER_ROLES];
export type HttpStatus = typeof HTTP_STATUS[keyof typeof HTTP_STATUS];

// User interface
export interface User {
  id: string;
  username: string;
  password_hash: string;
  role: UserRole;
  must_change_password: boolean;
  email: string;
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