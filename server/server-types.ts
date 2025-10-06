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

// Category interface
export interface Category {
  id: string;
  familyId: string;
  name: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

// Item interface
export interface Item {
  id: string;
  familyId: string;
  name: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

// Item-Category assignment
export interface ItemCategory {
  item_id: string;
  category_id: string;
}

// Item-Member assignment
export interface ItemMember {
  item_id: string;
  member_id: string;
}

// Template interface
export interface Template {
  id: string;
  family_id: string;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

// Template-Category assignment
export interface TemplateCategory {
  template_id: string;
  category_id: string;
}

// Template-Item assignment
export interface TemplateItem {
  template_id: string;
  item_id: string;
}

// Packing List interface
export interface PackingList {
  id: string;
  family_id: string;
  name: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

// Packing List Item interface
export interface PackingListItem {
  id: string;
  packing_list_id: string;
  item_id: string;
  checked: boolean;
  added_during_packing: boolean;
  created_at: string;
}

// Item assigned to whole family
export interface ItemWholeFamily {
  item_id: string;
  family_id: string;
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