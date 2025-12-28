import { SupabaseClient } from '@supabase/supabase-js';
import { BaseRepository } from './base.repository.js';
import type {
  CalendarSubscription,
  CalendarSubscriptionRow,
  CreateSubscriptionDto,
  UpdateSubscriptionDto,
} from '@tilly/shared';
import { getRandomEventColor } from '@tilly/shared';

/**
 * Subscription repository for external calendar subscriptions
 */
export class SubscriptionRepository extends BaseRepository<CalendarSubscriptionRow, CalendarSubscription> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'calendar_subscriptions');
  }

  protected mapToEntity(row: CalendarSubscriptionRow): CalendarSubscription {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      url: row.url,
      color: row.color,
      autoSync: row.auto_sync,
      syncIntervalMinutes: row.sync_interval_minutes,
      lastSyncAt: row.last_sync_at ? new Date(row.last_sync_at) : undefined,
      lastSyncError: row.last_sync_error,
      etag: row.etag,
      lastModified: row.last_modified,
      createdAt: new Date(row.created_at),
      updatedAt: row.updated_at ? new Date(row.updated_at) : undefined,
    };
  }

  /**
   * Get all subscriptions for a user
   */
  async getAll(userId: string): Promise<CalendarSubscription[]> {
    return this.findMany(userId, {
      orderBy: { column: 'name', ascending: true },
    });
  }

  /**
   * Get a subscription by ID
   */
  async getById(id: number, userId: string): Promise<CalendarSubscription | null> {
    return this.findById(id, userId);
  }

  /**
   * Create a new subscription
   */
  async create(dto: CreateSubscriptionDto, userId: string): Promise<CalendarSubscription> {
    const insertData = {
      user_id: userId,
      name: dto.name,
      url: dto.url,
      color: dto.color || getRandomEventColor(),
      auto_sync: dto.autoSync ?? true,
      sync_interval_minutes: dto.syncIntervalMinutes ?? 60,
    };

    const { data, error } = await this.supabase
      .from(this.tableName)
      .insert([insertData])
      .select()
      .single();

    if (error) {
      this.logger.error({ error, userId }, 'Error creating subscription');
      throw error;
    }

    this.logger.info({ subscriptionId: data.id, name: dto.name }, 'Subscription created');
    return this.mapToEntity(data as CalendarSubscriptionRow);
  }

  /**
   * Update a subscription
   */
  async update(id: number, dto: UpdateSubscriptionDto, userId: string): Promise<CalendarSubscription> {
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.url !== undefined) updateData.url = dto.url;
    if (dto.color !== undefined) updateData.color = dto.color;
    if (dto.autoSync !== undefined) updateData.auto_sync = dto.autoSync;
    if (dto.syncIntervalMinutes !== undefined) updateData.sync_interval_minutes = dto.syncIntervalMinutes;

    const { data, error } = await this.supabase
      .from(this.tableName)
      .update(updateData)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      this.logger.error({ error, id, userId }, 'Error updating subscription');
      throw error;
    }

    this.logger.info({ subscriptionId: id }, 'Subscription updated');
    return this.mapToEntity(data as CalendarSubscriptionRow);
  }

  /**
   * Delete a subscription
   */
  async delete(id: number, userId: string): Promise<boolean> {
    const result = await this.deleteById(id, userId);
    if (result) {
      this.logger.info({ subscriptionId: id }, 'Subscription deleted');
    }
    return result;
  }

  /**
   * Update sync status after a sync operation
   */
  async updateSyncStatus(
    id: number,
    userId: string,
    result: {
      success: boolean;
      error?: string;
      etag?: string;
      lastModified?: string;
    }
  ): Promise<void> {
    const updateData: Record<string, unknown> = {
      last_sync_at: new Date().toISOString(),
      last_sync_error: result.success ? null : result.error,
      updated_at: new Date().toISOString(),
    };

    if (result.etag) updateData.etag = result.etag;
    if (result.lastModified) updateData.last_modified = result.lastModified;

    const { error } = await this.supabase
      .from(this.tableName)
      .update(updateData)
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      this.logger.error({ error, id }, 'Error updating sync status');
      throw error;
    }
  }

  /**
   * Get subscriptions that need syncing
   * (auto_sync enabled and last sync was before the interval)
   */
  async getSubscriptionsDueForSync(): Promise<CalendarSubscription[]> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('auto_sync', true)
      .or(`last_sync_at.is.null,last_sync_at.lt.${new Date(Date.now() - 5 * 60 * 1000).toISOString()}`);

    if (error) {
      this.logger.error({ error }, 'Error getting subscriptions due for sync');
      throw error;
    }

    // Filter by sync interval
    const now = Date.now();
    return (data as CalendarSubscriptionRow[])
      .map(row => this.mapToEntity(row))
      .filter(sub => {
        if (!sub.lastSyncAt) return true;
        const nextSyncTime = sub.lastSyncAt.getTime() + sub.syncIntervalMinutes * 60 * 1000;
        return now >= nextSyncTime;
      });
  }
}
