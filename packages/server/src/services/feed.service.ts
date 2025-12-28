import type { CalendarFeedToken, CreateFeedTokenDto } from '@tilly/shared';
import { FeedTokenRepository } from '../repositories/feed-token.repository.js';
import { ICalService } from './ical.service.js';
import { createLogger } from '../utils/logger.js';
import { config } from '../config/index.js';

const logger = createLogger('FeedService');

/**
 * Feed service - manages iCal feed tokens and public feed access
 */
export class FeedService {
  constructor(
    private feedTokenRepository: FeedTokenRepository,
    private icalService: ICalService
  ) {}

  /**
   * Get all feed tokens for a user
   */
  async getTokens(userId: string): Promise<CalendarFeedToken[]> {
    return this.feedTokenRepository.getAll(userId);
  }

  /**
   * Get a specific token by ID
   */
  async getToken(id: number, userId: string): Promise<CalendarFeedToken | null> {
    return this.feedTokenRepository.getById(id, userId);
  }

  /**
   * Create a new feed token
   */
  async createToken(dto: CreateFeedTokenDto, userId: string): Promise<{
    token: CalendarFeedToken;
    feedUrl: string;
  }> {
    const token = await this.feedTokenRepository.create(dto, userId);
    const feedUrl = this.generateFeedUrl(token.token);

    logger.info({ tokenId: token.id, name: token.name, userId }, 'Feed token created');

    return { token, feedUrl };
  }

  /**
   * Revoke a feed token
   */
  async revokeToken(id: number, userId: string): Promise<boolean> {
    return this.feedTokenRepository.revoke(id, userId);
  }

  /**
   * Delete a feed token permanently
   */
  async deleteToken(id: number, userId: string): Promise<boolean> {
    return this.feedTokenRepository.delete(id, userId);
  }

  /**
   * Get calendar feed by token (for public access)
   */
  async getFeedByToken(tokenValue: string): Promise<{
    icalData: string;
    token: CalendarFeedToken;
  } | null> {
    const token = await this.feedTokenRepository.findByToken(tokenValue);

    if (!token) {
      logger.warn({ tokenValue: tokenValue.slice(0, 8) + '...' }, 'Invalid or expired feed token');
      return null;
    }

    // Get events for the user
    // If includePrivate is false, we should filter out private events
    // For now, we export all events (privacy filtering can be added later)
    const icalData = await this.icalService.exportEvents(token.userId);

    // Record access
    await this.feedTokenRepository.incrementAccessCount(token.id);

    logger.debug({ tokenId: token.id, accessCount: token.accessCount + 1 }, 'Feed accessed');

    return { icalData, token };
  }

  /**
   * Generate the full URL for a feed token
   */
  generateFeedUrl(tokenValue: string): string {
    // Construct the URL based on config
    const baseUrl = config.isProduction
      ? process.env.PUBLIC_URL || `https://localhost:${config.port}`
      : `http://localhost:${config.port}`;

    return `${baseUrl}/api/feed/${tokenValue}`;
  }

  /**
   * Validate a token without getting the feed
   */
  async validateToken(tokenValue: string): Promise<boolean> {
    const token = await this.feedTokenRepository.findByToken(tokenValue);
    return token !== null;
  }
}
