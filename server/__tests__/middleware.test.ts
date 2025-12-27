import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { authMiddleware } from '../middleware';
import { JWT_SECRET } from '../auth';
import { USER_ROLES } from '../constants';
import { v4 as uuidv4 } from 'uuid';

describe('Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRequest = {
      headers: {}
    };
    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };
    mockNext = vi.fn();
  });

  describe('authMiddleware', () => {
    it('should authenticate valid token', () => {
      const mockUser = {
        id: uuidv4(),
        username: 'testuser',
        role: USER_ROLES.FAMILY_MEMBER,
        familyId: uuidv4()
      };

      const token = jwt.sign(mockUser, JWT_SECRET, { expiresIn: '7d' });
      mockRequest.headers = {
        authorization: `Bearer ${token}`
      };

      authMiddleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRequest.user).toBeDefined();
      expect(mockRequest.user?.username).toBe('testuser');
      expect(mockRequest.user?.role).toBe(USER_ROLES.FAMILY_MEMBER);
    });

    it('should reject request without authorization header', () => {
      mockRequest.headers = {}; // No authorization header

      authMiddleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'No token provided' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject request with malformed authorization header', () => {
      mockRequest.headers = {
        authorization: 'InvalidFormat'
      };

      authMiddleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Invalid token' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject expired token', () => {
      const mockUser = {
        id: uuidv4(),
        username: 'testuser',
        role: USER_ROLES.FAMILY_MEMBER,
        familyId: uuidv4()
      };

      // Create an expired token (expired 1 hour ago)
      const expiredToken = jwt.sign({
        ...mockUser,
        exp: Math.floor(Date.now() / 1000) - (60 * 60)
      }, JWT_SECRET);

      mockRequest.headers = {
        authorization: `Bearer ${expiredToken}`
      };

      authMiddleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Invalid token' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject token with invalid signature', () => {
      const mockUser = {
        id: uuidv4(),
        username: 'testuser',
        role: USER_ROLES.FAMILY_MEMBER,
        familyId: uuidv4()
      };

      // Create token with wrong secret
      const invalidToken = jwt.sign(mockUser, 'wrong-secret', { expiresIn: '7d' });
      mockRequest.headers = {
        authorization: `Bearer ${invalidToken}`
      };

      authMiddleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Invalid token' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject completely invalid token', () => {
      mockRequest.headers = {
        authorization: 'Bearer totally-invalid-token'
      };

      authMiddleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Invalid token' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle different user roles correctly', () => {
      const roles = [USER_ROLES.SYSTEM_ADMIN, USER_ROLES.FAMILY_ADMIN, USER_ROLES.FAMILY_MEMBER];

      roles.forEach(role => {
        const mockUser = {
          id: uuidv4(),
          username: `user-${role}`,
          role: role,
          familyId: uuidv4()
        };

        const token = jwt.sign(mockUser, JWT_SECRET, { expiresIn: '7d' });
        mockRequest.headers = {
          authorization: `Bearer ${token}`
        };

        // Reset mocks
        vi.clearAllMocks();
        mockNext = vi.fn();

        authMiddleware(mockRequest as Request, mockResponse as Response, mockNext);

        expect(mockNext).toHaveBeenCalled();
        expect(mockRequest.user?.role).toBe(role);
      });
    });

    it('should preserve all user data from token', () => {
      const mockUser = {
        id: uuidv4(),
        username: 'testuser',
        role: USER_ROLES.FAMILY_ADMIN,
        familyId: uuidv4()
      };

      const token = jwt.sign(mockUser, JWT_SECRET, { expiresIn: '7d' });
      mockRequest.headers = {
        authorization: `Bearer ${token}`
      };

      authMiddleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRequest.user).toMatchObject({
        id: mockUser.id,
        username: mockUser.username,
        role: mockUser.role,
        familyId: mockUser.familyId
      });
    });
  });
});