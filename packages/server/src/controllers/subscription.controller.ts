import { Response } from 'express';
import { SubscriptionService } from '../services/subscription.service.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error-handler.js';
import { createLogger } from '../utils/logger.js';
import {
  createSubscriptionSchema,
  updateSubscriptionSchema,
} from '../validators/subscription.validator.js';

const logger = createLogger('SubscriptionController');

/**
 * Subscription controller - handles calendar subscription management
 */
export class SubscriptionController {
  constructor(private subscriptionService: SubscriptionService) {}

  /**
   * GET /api/subscriptions - Get all subscriptions
   */
  getAll = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const subscriptions = await this.subscriptionService.getAllSubscriptions(req.userId);
    res.json({ subscriptions });
  });

  /**
   * GET /api/subscriptions/:id - Get a single subscription
   */
  getById = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const id = parseInt(req.params.id, 10);
    const subscription = await this.subscriptionService.getSubscription(id, req.userId);
    res.json({ subscription });
  });

  /**
   * POST /api/subscriptions - Create a new subscription
   */
  create = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const dto = createSubscriptionSchema.parse(req.body);

    logger.info({ userId: req.userId, name: dto.name }, 'Creating subscription');

    const { subscription, syncResult } = await this.subscriptionService.createSubscription(
      dto,
      req.userId
    );

    res.status(201).json({
      subscription,
      syncResult,
    });
  });

  /**
   * PUT /api/subscriptions/:id - Update a subscription
   */
  update = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const id = parseInt(req.params.id, 10);
    const dto = updateSubscriptionSchema.parse(req.body);

    const subscription = await this.subscriptionService.updateSubscription(
      id,
      dto,
      req.userId
    );

    res.json({ subscription });
  });

  /**
   * DELETE /api/subscriptions/:id - Delete a subscription
   */
  delete = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const id = parseInt(req.params.id, 10);

    await this.subscriptionService.deleteSubscription(id, req.userId);

    res.status(204).send();
  });

  /**
   * POST /api/subscriptions/:id/sync - Manually trigger sync
   */
  sync = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const id = parseInt(req.params.id, 10);

    logger.info({ userId: req.userId, subscriptionId: id }, 'Manual sync triggered');

    const result = await this.subscriptionService.syncSubscription(id, req.userId);

    res.json({ result });
  });

  /**
   * POST /api/subscriptions/sync-all - Sync all subscriptions
   */
  syncAll = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    logger.info({ userId: req.userId }, 'Syncing all subscriptions');

    const results = await this.subscriptionService.syncAllSubscriptions(req.userId);

    // Convert Map to object for JSON response
    const resultsObject: Record<number, unknown> = {};
    results.forEach((value, key) => {
      resultsObject[key] = value;
    });

    res.json({ results: resultsObject });
  });

  /**
   * GET /api/subscriptions/:id/status - Get sync status
   */
  getStatus = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const id = parseInt(req.params.id, 10);

    const status = await this.subscriptionService.getSyncStatus(id, req.userId);

    res.json({ status });
  });
}
