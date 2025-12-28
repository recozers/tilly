import type {
  CalendarSubscription,
  CreateSubscriptionDto,
  UpdateSubscriptionDto,
  SyncResult,
} from '@tilly/shared';
import { SubscriptionRepository } from '../repositories/subscription.repository.js';
import { EventRepository } from '../repositories/event.repository.js';
import { ICalService } from './ical.service.js';
import { createLogger } from '../utils/logger.js';
import { NotFoundError, BadRequestError } from '../middleware/error-handler.js';

const logger = createLogger('SubscriptionService');

/**
 * Subscription service - manages external calendar subscriptions and sync
 */
export class SubscriptionService {
  private icalService: ICalService;

  constructor(
    private subscriptionRepository: SubscriptionRepository,
    private eventRepository: EventRepository
  ) {
    this.icalService = new ICalService(eventRepository);
  }

  /**
   * Get all subscriptions for a user
   */
  async getAllSubscriptions(userId: string): Promise<CalendarSubscription[]> {
    return this.subscriptionRepository.getAll(userId);
  }

  /**
   * Get a subscription by ID
   */
  async getSubscription(id: number, userId: string): Promise<CalendarSubscription> {
    const subscription = await this.subscriptionRepository.getById(id, userId);
    if (!subscription) {
      throw new NotFoundError('Subscription');
    }
    return subscription;
  }

  /**
   * Create a new calendar subscription
   */
  async createSubscription(
    dto: CreateSubscriptionDto,
    userId: string
  ): Promise<{ subscription: CalendarSubscription; syncResult: SyncResult }> {
    // Validate URL is accessible and is valid iCal
    await this.validateSubscriptionUrl(dto.url);

    // Create the subscription
    const subscription = await this.subscriptionRepository.create(dto, userId);

    // Perform initial sync
    const syncResult = await this.syncSubscription(subscription.id, userId);

    logger.info(
      { subscriptionId: subscription.id, name: dto.name },
      'Subscription created and synced'
    );

    return { subscription, syncResult };
  }

  /**
   * Update a subscription
   */
  async updateSubscription(
    id: number,
    dto: UpdateSubscriptionDto,
    userId: string
  ): Promise<CalendarSubscription> {
    const existing = await this.subscriptionRepository.getById(id, userId);
    if (!existing) {
      throw new NotFoundError('Subscription');
    }

    // If URL is being updated, validate it
    if (dto.url && dto.url !== existing.url) {
      await this.validateSubscriptionUrl(dto.url);
    }

    return this.subscriptionRepository.update(id, dto, userId);
  }

  /**
   * Delete a subscription and its events
   */
  async deleteSubscription(id: number, userId: string): Promise<void> {
    const subscription = await this.subscriptionRepository.getById(id, userId);
    if (!subscription) {
      throw new NotFoundError('Subscription');
    }

    // Delete all events from this subscription
    const events = await this.eventRepository.getBySourceCalendar(id, userId);
    for (const event of events) {
      await this.eventRepository.delete(event.id, userId);
    }

    // Delete the subscription
    await this.subscriptionRepository.delete(id, userId);

    logger.info(
      { subscriptionId: id, eventsDeleted: events.length },
      'Subscription and events deleted'
    );
  }

  /**
   * Sync a single subscription
   */
  async syncSubscription(id: number, userId: string): Promise<SyncResult> {
    const subscription = await this.subscriptionRepository.getById(id, userId);
    if (!subscription) {
      throw new NotFoundError('Subscription');
    }

    logger.info({ subscriptionId: id, name: subscription.name }, 'Starting sync');

    try {
      const result = await this.icalService.syncFromUrl(subscription, userId);

      // Update sync status
      await this.subscriptionRepository.updateSyncStatus(id, userId, {
        success: result.success,
        error: result.error,
      });

      logger.info(
        {
          subscriptionId: id,
          added: result.eventsAdded,
          updated: result.eventsUpdated,
          deleted: result.eventsDeleted,
        },
        'Sync completed'
      );

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      await this.subscriptionRepository.updateSyncStatus(id, userId, {
        success: false,
        error: errorMessage,
      });

      logger.error({ error, subscriptionId: id }, 'Sync failed');

      return {
        success: false,
        eventsAdded: 0,
        eventsUpdated: 0,
        eventsDeleted: 0,
        error: errorMessage,
      };
    }
  }

  /**
   * Sync all subscriptions for a user
   */
  async syncAllSubscriptions(userId: string): Promise<Map<number, SyncResult>> {
    const subscriptions = await this.subscriptionRepository.getAll(userId);
    const results = new Map<number, SyncResult>();

    for (const subscription of subscriptions) {
      if (subscription.autoSync) {
        const result = await this.syncSubscription(subscription.id, userId);
        results.set(subscription.id, result);
      }
    }

    return results;
  }

  /**
   * Run background sync for all due subscriptions
   * This should be called periodically (e.g., every 5 minutes)
   */
  async runBackgroundSync(): Promise<{ synced: number; failed: number }> {
    const subscriptions = await this.subscriptionRepository.getSubscriptionsDueForSync();

    let synced = 0;
    let failed = 0;

    for (const subscription of subscriptions) {
      try {
        const result = await this.icalService.syncFromUrl(subscription, subscription.userId);

        await this.subscriptionRepository.updateSyncStatus(
          subscription.id,
          subscription.userId,
          {
            success: result.success,
            error: result.error,
          }
        );

        if (result.success) {
          synced++;
        } else {
          failed++;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        await this.subscriptionRepository.updateSyncStatus(
          subscription.id,
          subscription.userId,
          {
            success: false,
            error: errorMessage,
          }
        );

        failed++;
        logger.error({ error, subscriptionId: subscription.id }, 'Background sync failed');
      }
    }

    if (synced > 0 || failed > 0) {
      logger.info({ synced, failed }, 'Background sync completed');
    }

    return { synced, failed };
  }

  /**
   * Validate that a URL is accessible and contains valid iCal data
   */
  private async validateSubscriptionUrl(url: string): Promise<void> {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'text/calendar, application/calendar+xml, application/ics',
        },
      });

      if (!response.ok) {
        throw new BadRequestError(`Unable to fetch calendar: HTTP ${response.status}`);
      }

      const contentType = response.headers.get('content-type') || '';
      if (
        !contentType.includes('text/calendar') &&
        !contentType.includes('application/ics') &&
        !contentType.includes('text/plain')
      ) {
        // Try to parse it anyway - some servers don't set correct content type
      }

      const data = await response.text();

      if (!data.includes('BEGIN:VCALENDAR')) {
        throw new BadRequestError('URL does not contain valid iCalendar data');
      }

      // Try to parse it
      this.icalService.parseICalData(data);
    } catch (error) {
      if (error instanceof BadRequestError) {
        throw error;
      }
      throw new BadRequestError(
        `Unable to validate calendar URL: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get sync status for a subscription
   */
  async getSyncStatus(id: number, userId: string): Promise<{
    lastSyncAt: Date | null;
    lastSyncError: string | null;
    eventCount: number;
    nextSyncAt: Date | null;
  }> {
    const subscription = await this.subscriptionRepository.getById(id, userId);
    if (!subscription) {
      throw new NotFoundError('Subscription');
    }

    const events = await this.eventRepository.getBySourceCalendar(id, userId);

    let nextSyncAt: Date | null = null;
    if (subscription.autoSync && subscription.lastSyncAt) {
      nextSyncAt = new Date(
        subscription.lastSyncAt.getTime() + subscription.syncIntervalMinutes * 60 * 1000
      );
    }

    return {
      lastSyncAt: subscription.lastSyncAt || null,
      lastSyncError: subscription.lastSyncError || null,
      eventCount: events.length,
      nextSyncAt,
    };
  }
}
