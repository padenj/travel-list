"use strict";
// Server-side constants to avoid circular dependencies with frontend
// These should be kept in sync with src/shared/constants.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.HTTP_STATUS = exports.USER_ROLES = exports.ERROR_CODES = void 0;
exports.ERROR_CODES = {
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
};
exports.USER_ROLES = {
    SYSTEM_ADMIN: 'SystemAdmin',
    FAMILY_ADMIN: 'FamilyAdmin',
    FAMILY_MEMBER: 'FamilyMember'
};
exports.HTTP_STATUS = {
    OK: 200,
    CREATED: 201,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    INTERNAL_ERROR: 500
};
