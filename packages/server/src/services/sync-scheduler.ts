import { SubscriptionService } from './subscription.service.js';
import { createLogger } from '../utils/logger.js';
import { config } from '../config/index.js';

const logger = createLogger('SyncScheduler');

/**
 * Background sync scheduler for calendar subscriptions
 */
export class SyncScheduler {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(private subscriptionService: SubscriptionService) {}

  /**
   * Start the background sync scheduler
   */
  start(): void {
    if (this.intervalId) {
      logger.warn('Sync scheduler already running');
      return;
    }

    const intervalMs = config.sync?.intervalMs ?? 5 * 60 * 1000; // Default: 5 minutes

    logger.info({ intervalMs }, 'Starting sync scheduler');

    // Run immediately on start
    this.runSync();

    // Schedule periodic sync
    this.intervalId = setInterval(() => {
      this.runSync();
    }, intervalMs);
  }

  /**
   * Stop the background sync scheduler
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Sync scheduler stopped');
    }
  }

  /**
   * Run a sync cycle
   */
  private async runSync(): Promise<void> {
    if (this.isRunning) {
      logger.debug('Sync already in progress, skipping');
      return;
    }

    this.isRunning = true;

    try {
      const result = await this.subscriptionService.runBackgroundSync();

      if (result.synced > 0 || result.failed > 0) {
        logger.info(result, 'Background sync completed');
      }
    } catch (error) {
      logger.error({ error }, 'Background sync error');
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Check if scheduler is running
   */
  isSchedulerRunning(): boolean {
    return this.intervalId !== null;
  }
}
