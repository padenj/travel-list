import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { ApiError, errorHandler, notFoundHandler, asyncHandler } from '../error-handler';
import { HTTP_STATUS, ERROR_CODES } from '../constants';
import { v4 as uuidv4 } from 'uuid';

describe('Error Handler', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRequest = {
      url: '/test-url',
      method: 'GET',
      originalUrl: '/api/test-url',
      user: {
        id: uuidv4(),
        name: 'Test User',
        username: 'testuser',
        password_hash: 'hash',
        role: 'FamilyMember',
        must_change_password: false,
        email: 'test@example.com',
        familyId: uuidv4(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    };
    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };
    mockNext = vi.fn();

    // Mock console methods to avoid noise in tests
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('ApiError Class', () => {
    it('should create ApiError with default values', () => {
      const error = new ApiError('Test error');
      
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(HTTP_STATUS.INTERNAL_ERROR);
      expect(error.code).toBe(ERROR_CODES.INTERNAL_ERROR);
      expect(error.isOperational).toBe(true);
    });

    it('should create ApiError with custom values', () => {
      const error = new ApiError('Not found', HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND);
      
      expect(error.message).toBe('Not found');
      expect(error.statusCode).toBe(HTTP_STATUS.NOT_FOUND);
      expect(error.code).toBe(ERROR_CODES.NOT_FOUND);
      expect(error.isOperational).toBe(true);
    });
  });

  describe('errorHandler', () => {
    it('should handle ApiError correctly', () => {
      const error = new ApiError('Test API error', HTTP_STATUS.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR);
      
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(mockResponse.status).toHaveBeenCalledWith(HTTP_STATUS.BAD_REQUEST);
      expect(mockResponse.json).toHaveBeenCalledWith(expect.objectContaining({
        error: ERROR_CODES.VALIDATION_ERROR,
        message: 'Test API error'
      }));
    });

    it('should handle ValidationError', () => {
      const error = new Error('Validation failed');
      error.name = 'ValidationError';
      
      errorHandler(error as any, mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(mockResponse.status).toHaveBeenCalledWith(HTTP_STATUS.BAD_REQUEST);
      expect(mockResponse.json).toHaveBeenCalledWith(expect.objectContaining({
        error: ERROR_CODES.VALIDATION_ERROR,
        message: 'Validation failed'
      }));
    });

    it('should handle CastError', () => {
      const error = new Error('Cast failed');
      error.name = 'CastError';
      
      errorHandler(error as any, mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(mockResponse.status).toHaveBeenCalledWith(HTTP_STATUS.BAD_REQUEST);
      expect(mockResponse.json).toHaveBeenCalledWith(expect.objectContaining({
        error: ERROR_CODES.INTERNAL_ERROR,
        message: 'Invalid data format'
      }));
    });

    it('should handle SQLite constraint unique error', () => {
      const error = new Error('UNIQUE constraint failed');
      (error as any).code = 'SQLITE_CONSTRAINT_UNIQUE';
      
      errorHandler(error as any, mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(mockResponse.status).toHaveBeenCalledWith(HTTP_STATUS.CONFLICT);
      expect(mockResponse.json).toHaveBeenCalledWith(expect.objectContaining({
        error: ERROR_CODES.USERNAME_TAKEN,
        message: 'Username already exists'
      }));
    });

    it('should handle general SQLite constraint error', () => {
      const error = new Error('CONSTRAINT failed');
      (error as any).code = 'SQLITE_CONSTRAINT';
      
      errorHandler(error as any, mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(mockResponse.status).toHaveBeenCalledWith(HTTP_STATUS.BAD_REQUEST);
      expect(mockResponse.json).toHaveBeenCalledWith(expect.objectContaining({
        error: ERROR_CODES.VALIDATION_ERROR,
        message: 'Data constraint violation'
      }));
    });

    it('should log server errors (5xx)', () => {
      const error = new ApiError('Server error', HTTP_STATUS.INTERNAL_ERROR);
      
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(console.error).toHaveBeenCalledWith('💥 Server Error:', expect.objectContaining({
        message: 'Server error',
        url: '/test-url',
        method: 'GET',
        user: 'testuser'
      }));
    });

    it('should log client errors (4xx) as warnings', () => {
      const error = new ApiError('Client error', HTTP_STATUS.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR);
      
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(console.warn).toHaveBeenCalledWith('⚠️  Client Error:', expect.objectContaining({
        message: 'Client error',
        code: ERROR_CODES.VALIDATION_ERROR,
        url: '/test-url',
        method: 'GET',
        user: 'testuser'
      }));
    });

    it('should not leak error details in production for non-operational errors', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      const error = new Error('Internal system error');
      (error as any).isOperational = false;
      
      errorHandler(error as any, mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: ERROR_CODES.INTERNAL_ERROR,
        message: 'Something went wrong'
      });
      
      process.env.NODE_ENV = originalEnv;
    });

    it('should include stack trace in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      
      const error = new ApiError('Development error');
      
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: ERROR_CODES.INTERNAL_ERROR,
        message: 'Development error',
        stack: expect.any(String)
      });
      
      process.env.NODE_ENV = originalEnv;
    });

    it('should handle errors without user context', () => {
      mockRequest.user = undefined;
      const error = new ApiError('Error without user');
      
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(console.error).toHaveBeenCalledWith('💥 Server Error:', expect.objectContaining({
        user: undefined
      }));
    });
  });

  describe('notFoundHandler', () => {
    it('should return 404 with proper error structure', () => {
      notFoundHandler(mockRequest as Request, mockResponse as Response);
      
      expect(mockResponse.status).toHaveBeenCalledWith(HTTP_STATUS.NOT_FOUND);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: ERROR_CODES.NOT_FOUND,
        message: 'Route /api/test-url not found'
      });
    });
  });

  describe('asyncHandler', () => {
    it('should handle successful async operations', async () => {
      const asyncOperation = vi.fn().mockResolvedValue('success');
      const wrappedHandler = asyncHandler(asyncOperation);
      
      await wrappedHandler(mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(asyncOperation).toHaveBeenCalledWith(mockRequest, mockResponse, mockNext);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should catch and forward async errors', async () => {
      const error = new Error('Async operation failed');
      const asyncOperation = vi.fn().mockRejectedValue(error);
      const wrappedHandler = asyncHandler(asyncOperation);
      
      await wrappedHandler(mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(asyncOperation).toHaveBeenCalledWith(mockRequest, mockResponse, mockNext);
      expect(mockNext).toHaveBeenCalledWith(error);
    });

    it('should handle non-async functions', async () => {
      const syncOperation = vi.fn().mockReturnValue('success');
      const wrappedHandler = asyncHandler(syncOperation);
      
      await wrappedHandler(mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(syncOperation).toHaveBeenCalledWith(mockRequest, mockResponse, mockNext);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should catch sync errors too', async () => {
      const error = new Error('Sync operation failed');
      const syncOperation = vi.fn().mockImplementation(() => {
        throw error;
      });
      const wrappedHandler = asyncHandler(syncOperation);
      
      // Call the wrapped handler - it should catch the sync error and call next()
      wrappedHandler(mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(syncOperation).toHaveBeenCalledWith(mockRequest, mockResponse, mockNext);
      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });
});