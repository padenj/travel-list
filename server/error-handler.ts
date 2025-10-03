import { Request, Response, NextFunction } from 'express';
import { HTTP_STATUS, ERROR_CODES } from './constants';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
  isOperational?: boolean;
}

// Create custom error class
export class ApiError extends Error implements AppError {
  public statusCode: number;
  public code: string;
  public isOperational: boolean;

  constructor(message: string, statusCode: number = HTTP_STATUS.INTERNAL_ERROR, code: string = ERROR_CODES.INTERNAL_ERROR) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

// Async wrapper to catch promise rejections and sync errors
export const asyncHandler = (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
  try {
    Promise.resolve(fn(req, res, next)).catch(next);
  } catch (error) {
    next(error);
  }
};

// Global error handler middleware
export const errorHandler = (err: AppError, req: Request, res: Response, next: NextFunction): Response | void => {
  let { statusCode = HTTP_STATUS.INTERNAL_ERROR, message, code = ERROR_CODES.INTERNAL_ERROR } = err;

  // Handle specific error types
  if (err.name === 'ValidationError') {
    statusCode = HTTP_STATUS.BAD_REQUEST;
    code = ERROR_CODES.VALIDATION_ERROR;
  } else if (err.name === 'CastError') {
    statusCode = HTTP_STATUS.BAD_REQUEST;
    message = 'Invalid data format';
  } else if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    statusCode = HTTP_STATUS.CONFLICT;
    code = ERROR_CODES.USERNAME_TAKEN;
    message = 'Username already exists';
  } else if (err.code === 'SQLITE_CONSTRAINT') {
    statusCode = HTTP_STATUS.BAD_REQUEST;
    code = ERROR_CODES.VALIDATION_ERROR;
    message = 'Data constraint violation';
  }

  // Log error for debugging
  if (statusCode >= 500) {
    console.error('💥 Server Error:', {
      message: err.message,
      stack: err.stack,
      url: req.url,
      method: req.method,
      user: req.user?.username
    });
  } else {
    console.warn('⚠️  Client Error:', {
      message,
      code,
      url: req.url,
      method: req.method,
      user: req.user?.username
    });
  }

  // Don't leak error details in production
  if (process.env.NODE_ENV === 'production' && !err.isOperational) {
    message = 'Something went wrong';
    code = ERROR_CODES.INTERNAL_ERROR;
  }

  return res.status(statusCode).json({
    error: code,
    message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
};

// 404 handler
export const notFoundHandler = (req: Request, res: Response): Response => {
  return res.status(HTTP_STATUS.NOT_FOUND).json({
    error: ERROR_CODES.NOT_FOUND,
    message: `Route ${req.originalUrl} not found`
  });
};