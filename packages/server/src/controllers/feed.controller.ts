import { Request, Response } from 'express';
import { FeedService } from '../services/feed.service.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error-handler.js';
import { createLogger } from '../utils/logger.js';
import { BadRequestError, NotFoundError } from '../middleware/error-handler.js';
import type { CreateFeedTokenDto } from '@tilly/shared';

const logger = createLogger('FeedController');

/**
 * Feed controller - manages iCal feed tokens and public feed access
 */
export class FeedController {
  constructor(private feedService: FeedService) {}

  /**
   * GET /api/feed/tokens - Get all feed tokens for the authenticated user
   */
  getTokens = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tokens = await this.feedService.getTokens(req.userId);

    res.json({
      success: true,
      tokens: tokens.map(t => ({
        id: t.id,
        name: t.name,
        isActive: t.isActive,
        includePrivate: t.includePrivate,
        accessCount: t.accessCount,
        lastAccessedAt: t.lastAccessedAt,
        createdAt: t.createdAt,
        expiresAt: t.expiresAt,
        feedUrl: this.feedService.generateFeedUrl(t.token),
      })),
    });
  });

  /**
   * POST /api/feed/tokens - Create a new feed token
   */
  createToken = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const dto = req.body as CreateFeedTokenDto;

    if (!dto.name || typeof dto.name !== 'string') {
      throw new BadRequestError('Token name is required');
    }

    logger.info({ userId: req.userId, name: dto.name }, 'Creating feed token');

    const { token, feedUrl } = await this.feedService.createToken(dto, req.userId);

    res.status(201).json({
      success: true,
      token: {
        id: token.id,
        name: token.name,
        isActive: token.isActive,
        includePrivate: token.includePrivate,
        accessCount: token.accessCount,
        createdAt: token.createdAt,
        expiresAt: token.expiresAt,
        feedUrl,
      },
      // Include the raw token value only on creation
      tokenValue: token.token,
    });
  });

  /**
   * DELETE /api/feed/tokens/:id - Revoke a feed token
   */
  revokeToken = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      throw new BadRequestError('Invalid token ID');
    }

    logger.info({ userId: req.userId, tokenId: id }, 'Revoking feed token');

    const revoked = await this.feedService.revokeToken(id, req.userId);

    if (!revoked) {
      throw new NotFoundError('Feed token not found');
    }

    res.json({
      success: true,
      message: 'Token revoked successfully',
    });
  });

  /**
   * DELETE /api/feed/tokens/:id/permanent - Permanently delete a feed token
   */
  deleteToken = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      throw new BadRequestError('Invalid token ID');
    }

    logger.info({ userId: req.userId, tokenId: id }, 'Deleting feed token');

    const deleted = await this.feedService.deleteToken(id, req.userId);

    if (!deleted) {
      throw new NotFoundError('Feed token not found');
    }

    res.json({
      success: true,
      message: 'Token deleted permanently',
    });
  });

  /**
   * GET /api/feed/:token - Public endpoint to get calendar feed by token
   * This endpoint does NOT require authentication
   */
  getPublicFeed = asyncHandler(async (req: Request, res: Response) => {
    const { token } = req.params;

    if (!token || typeof token !== 'string') {
      throw new BadRequestError('Invalid token');
    }

    const result = await this.feedService.getFeedByToken(token);

    if (!result) {
      throw new NotFoundError('Invalid or expired feed token');
    }

    // Set appropriate headers for iCal
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="${result.token.name.replace(/[^a-z0-9]/gi, '-')}.ics"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    // Add standard iCal headers
    res.setHeader('X-WR-CALNAME', `Tilly - ${result.token.name}`);

    res.send(result.icalData);
  });
}
