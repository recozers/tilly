import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { createLogger } from '../utils/logger.js';
import { config } from '../config/index.js';

const logger = createLogger('ErrorHandler');

/**
 * Application-specific error with status code
 */
export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public isOperational = true
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Not found error
 */
export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(404, `${resource} not found`);
    this.name = 'NotFoundError';
  }
}

/**
 * Unauthorized error
 */
export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(401, message);
    this.name = 'UnauthorizedError';
  }
}

/**
 * Forbidden error
 */
export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(403, message);
    this.name = 'ForbiddenError';
  }
}

/**
 * Bad request error
 */
export class BadRequestError extends AppError {
  constructor(message: string) {
    super(400, message);
    this.name = 'BadRequestError';
  }
}

/**
 * Global error handler middleware
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log the error
  logger.error({
    error: err.message,
    stack: config.isDevelopment ? err.stack : undefined,
    path: req.path,
    method: req.method,
  }, 'Request error');

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validation error',
      details: err.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    });
    return;
  }

  // Handle known operational errors
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
    });
    return;
  }

  // Handle unknown errors
  const statusCode = 500;
  const message = config.isProduction
    ? 'Internal server error'
    : err.message;

  res.status(statusCode).json({
    error: message,
  });
}

/**
 * Async handler wrapper to catch errors in async route handlers
 */
export function asyncHandler<T>(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<T>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * 404 handler for unknown routes
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: `Route ${req.method} ${req.path} not found`,
  });
}
