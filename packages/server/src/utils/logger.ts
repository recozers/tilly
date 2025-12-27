import pino from 'pino';
import { config } from '../config/index.js';

/**
 * Structured logger using Pino
 * Replaces 284+ console.log statements with proper logging
 */
export const logger = pino({
  level: config.logging.level,
  transport: config.logging.pretty && !config.isProduction
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  base: {
    env: config.env,
  },
});

/**
 * Create a child logger with a specific context
 */
export function createLogger(context: string): pino.Logger {
  return logger.child({ context });
}

/**
 * Request logger for Express middleware
 */
export const requestLogger = {
  log: (req: { method: string; url: string }, res: { statusCode: number }, responseTime: number) => {
    logger.info({
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      responseTime: `${responseTime}ms`,
    }, 'request completed');
  },
};
