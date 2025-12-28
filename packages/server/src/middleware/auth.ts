import { Request, Response, NextFunction } from 'express';
import { SupabaseClient } from '@supabase/supabase-js';
import { createAuthenticatedClient } from '../config/database.js';
import { authCache } from '../utils/cache.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('AuthMiddleware');

/**
 * Extended Request with authentication info
 */
export interface AuthenticatedRequest extends Request {
  userId: string;
  userEmail: string;
  supabase: SupabaseClient;
  accessToken: string;
}

/**
 * Authentication middleware - validates JWT and attaches user info
 */
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'No authentication token provided' });
      return;
    }

    const token = authHeader.substring(7);

    if (!token || token.length < 10) {
      res.status(401).json({ error: 'Invalid authentication token' });
      return;
    }

    // Check cache first
    const cached = authCache.get(token);
    if (cached) {
      const authReq = req as AuthenticatedRequest;
      authReq.userId = cached.userId;
      authReq.userEmail = cached.email;
      authReq.supabase = createAuthenticatedClient(token);
      authReq.accessToken = token;
      return next();
    }

    // Verify token with Supabase
    const supabase = createAuthenticatedClient(token);
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      logger.warn({ error: error?.message }, 'Authentication failed');
      res.status(401).json({ error: 'Invalid authentication token' });
      return;
    }

    // Cache the result
    authCache.set(token, { userId: user.id, email: user.email || '' });

    // Attach to request
    const authReq = req as AuthenticatedRequest;
    authReq.userId = user.id;
    authReq.userEmail = user.email || '';
    authReq.supabase = supabase;
    authReq.accessToken = token;

    next();
  } catch (error) {
    logger.error({ error }, 'Authentication error');
    res.status(401).json({ error: 'Authentication failed' });
  }
}
