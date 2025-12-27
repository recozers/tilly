import { Request, Response, NextFunction } from 'express';
import { z, ZodError, ZodSchema } from 'zod';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('ValidationMiddleware');

/**
 * Validation error response
 */
interface ValidationErrorResponse {
  error: string;
  details: Array<{
    field: string;
    message: string;
  }>;
}

/**
 * Create validation middleware for a Zod schema
 */
export function validate<T extends ZodSchema>(
  schema: T,
  source: 'body' | 'query' | 'params' = 'body'
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const data = source === 'body' ? req.body : source === 'query' ? req.query : req.params;
      const parsed = schema.parse(data);

      // Replace the source with parsed data
      if (source === 'body') {
        req.body = parsed;
      } else if (source === 'query') {
        (req as Request & { validatedQuery: z.infer<T> }).validatedQuery = parsed;
      } else {
        (req as Request & { validatedParams: z.infer<T> }).validatedParams = parsed;
      }

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const response: ValidationErrorResponse = {
          error: 'Validation error',
          details: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        };
        logger.warn({ details: response.details }, 'Validation failed');
        res.status(400).json(response);
        return;
      }

      logger.error({ error }, 'Unexpected validation error');
      res.status(500).json({ error: 'Internal validation error' });
    }
  };
}

/**
 * Validate request body manually (for use in controllers)
 */
export function validateBody<T extends ZodSchema>(
  schema: T,
  data: unknown
): z.infer<T> {
  return schema.parse(data);
}

/**
 * Safe JSON parse with error handling
 */
export function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}
