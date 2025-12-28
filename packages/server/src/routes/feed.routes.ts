import { Router } from 'express';
import { FeedController } from '../controllers/feed.controller.js';
import { authenticate } from '../middleware/auth.js';

/**
 * Create feed routes
 *
 * Two types of routes:
 * 1. Protected routes for managing feed tokens (require auth)
 * 2. Public route for accessing the calendar feed (no auth, uses token)
 */
export function createFeedRouter(feedController: FeedController): Router {
  const router = Router();

  // ==========================================
  // Public route - NO authentication required
  // This is the actual iCal feed endpoint
  // ==========================================
  router.get('/:token', feedController.getPublicFeed);

  // ==========================================
  // Protected routes - require authentication
  // These are for managing feed tokens
  // ==========================================
  router.use('/tokens', authenticate);

  // List all tokens for the user
  router.get('/tokens', feedController.getTokens);

  // Create a new feed token
  router.post('/tokens', feedController.createToken);

  // Revoke a token (soft delete)
  router.delete('/tokens/:id', feedController.revokeToken);

  // Permanently delete a token
  router.delete('/tokens/:id/permanent', feedController.deleteToken);

  return router;
}
