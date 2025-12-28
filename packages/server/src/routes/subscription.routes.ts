import { Router } from 'express';
import { SubscriptionController } from '../controllers/subscription.controller.js';
import { authenticate } from '../middleware/auth.js';

/**
 * Create subscription routes
 */
export function createSubscriptionRouter(subscriptionController: SubscriptionController): Router {
  const router = Router();

  // All routes require authentication
  router.use(authenticate);

  // CRUD operations
  router.get('/', subscriptionController.getAll);
  router.get('/:id', subscriptionController.getById);
  router.post('/', subscriptionController.create);
  router.put('/:id', subscriptionController.update);
  router.delete('/:id', subscriptionController.delete);

  // Sync operations
  router.post('/sync-all', subscriptionController.syncAll);
  router.post('/:id/sync', subscriptionController.sync);
  router.get('/:id/status', subscriptionController.getStatus);

  return router;
}
