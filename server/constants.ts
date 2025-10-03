// Server-side constants to avoid circular dependencies with frontend
// These should be kept in sync with src/shared/constants.ts

export const ERROR_CODES = {
  // Authentication errors
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  PASSWORD_CHANGE_REQUIRED: 'PASSWORD_CHANGE_REQUIRED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  UNAUTHORIZED: 'UNAUTHORIZED',
  
  // Password errors
  PASSWORD_TOO_WEAK: 'PASSWORD_TOO_WEAK',
  PASSWORD_SAME_AS_OLD: 'PASSWORD_SAME_AS_OLD',
  
  // User management errors
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  USERNAME_TAKEN: 'USERNAME_TAKEN',
  
  // General errors
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  FORBIDDEN: 'FORBIDDEN'
} as const;

export const USER_ROLES = {
  SYSTEM_ADMIN: 'SystemAdmin',
  FAMILY_ADMIN: 'FamilyAdmin',
  FAMILY_MEMBER: 'FamilyMember'
} as const;

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_ERROR: 500
} as const;

// Type definitions
export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];
export type UserRole = typeof USER_ROLES[keyof typeof USER_ROLES];
export type HttpStatus = typeof HTTP_STATUS[keyof typeof HTTP_STATUS];