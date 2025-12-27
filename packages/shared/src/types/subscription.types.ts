/**
 * Calendar subscription for external calendar feeds
 */
export interface CalendarSubscription {
  id: number;
  userId: string;
  name: string;
  url: string;
  color: string;
  autoSync: boolean;
  syncIntervalMinutes: number;
  lastSyncAt?: Date;
  lastSyncError?: string;
  etag?: string;
  lastModified?: string;
  createdAt: Date;
  updatedAt?: Date;
}

/**
 * Database row representation of a calendar subscription
 */
export interface CalendarSubscriptionRow {
  id: number;
  user_id: string;
  name: string;
  url: string;
  color: string;
  auto_sync: boolean;
  sync_interval_minutes: number;
  last_sync_at?: string;
  last_sync_error?: string;
  etag?: string;
  last_modified?: string;
  created_at: string;
  updated_at?: string;
}

/**
 * DTO for creating a calendar subscription
 */
export interface CreateSubscriptionDto {
  name: string;
  url: string;
  color?: string;
  autoSync?: boolean;
  syncIntervalMinutes?: number;
}

/**
 * DTO for updating a calendar subscription
 */
export interface UpdateSubscriptionDto {
  name?: string;
  url?: string;
  color?: string;
  autoSync?: boolean;
  syncIntervalMinutes?: number;
}

/**
 * Sync result for a calendar subscription
 */
export interface SyncResult {
  success: boolean;
  eventsAdded: number;
  eventsUpdated: number;
  eventsDeleted: number;
  error?: string;
}
