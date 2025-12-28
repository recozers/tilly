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

/**
 * Calendar feed token for sharing calendar via iCal URL
 */
export interface CalendarFeedToken {
  id: number;
  userId: string;
  token: string;
  name: string;
  isActive: boolean;
  includePrivate: boolean;
  lastAccessedAt?: Date;
  accessCount: number;
  createdAt: Date;
  expiresAt?: Date;
}

/**
 * Database row for calendar feed token
 */
export interface CalendarFeedTokenRow {
  id: number;
  user_id: string;
  token: string;
  name: string;
  is_active: boolean;
  include_private: boolean;
  last_accessed_at?: string;
  access_count: number;
  created_at: string;
  expires_at?: string;
}

/**
 * DTO for creating a feed token
 */
export interface CreateFeedTokenDto {
  name: string;
  includePrivate?: boolean;
  expiresInDays?: number;
}
