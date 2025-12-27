import { SupabaseClient } from '@supabase/supabase-js';
import type { UserProfile, UserProfileRow } from '@tilly/shared';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('UserRepository');

/**
 * User repository for user profile operations
 */
export class UserRepository {
  constructor(private supabase: SupabaseClient) {}

  private mapToEntity(row: UserProfileRow): UserProfile {
    return {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      createdAt: row.created_at ? new Date(row.created_at) : undefined,
      updatedAt: row.updated_at ? new Date(row.updated_at) : undefined,
    };
  }

  /**
   * Get a user profile by ID
   */
  async getById(userId: string): Promise<UserProfile | null> {
    const { data, error } = await this.supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      logger.error({ error, userId }, 'Error getting user profile');
      throw error;
    }

    return this.mapToEntity(data as UserProfileRow);
  }

  /**
   * Get a user profile by email
   */
  async getByEmail(email: string): Promise<UserProfile | null> {
    const { data, error } = await this.supabase
      .from('user_profiles')
      .select('*')
      .eq('email', email)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      logger.error({ error, email }, 'Error getting user by email');
      throw error;
    }

    return this.mapToEntity(data as UserProfileRow);
  }

  /**
   * Update a user profile
   */
  async update(
    userId: string,
    data: { displayName?: string; avatarUrl?: string }
  ): Promise<UserProfile> {
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (data.displayName !== undefined) updateData.display_name = data.displayName;
    if (data.avatarUrl !== undefined) updateData.avatar_url = data.avatarUrl;

    const { data: updated, error } = await this.supabase
      .from('user_profiles')
      .update(updateData)
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      logger.error({ error, userId }, 'Error updating user profile');
      throw error;
    }

    logger.info({ userId }, 'User profile updated');
    return this.mapToEntity(updated as UserProfileRow);
  }

  /**
   * Search users by name or email
   */
  async search(query: string, excludeUserId?: string): Promise<UserProfile[]> {
    let queryBuilder = this.supabase
      .from('user_profiles')
      .select('*')
      .or(`display_name.ilike.%${query}%,email.ilike.%${query}%`)
      .limit(20);

    if (excludeUserId) {
      queryBuilder = queryBuilder.neq('id', excludeUserId);
    }

    const { data, error } = await queryBuilder;

    if (error) {
      logger.error({ error, query }, 'Error searching users');
      throw error;
    }

    return (data as UserProfileRow[]).map(row => this.mapToEntity(row));
  }

  /**
   * Get multiple users by IDs
   */
  async getByIds(userIds: string[]): Promise<UserProfile[]> {
    if (userIds.length === 0) return [];

    const { data, error } = await this.supabase
      .from('user_profiles')
      .select('*')
      .in('id', userIds);

    if (error) {
      logger.error({ error }, 'Error getting users by IDs');
      throw error;
    }

    return (data as UserProfileRow[]).map(row => this.mapToEntity(row));
  }

  /**
   * Ensure a user profile exists (create if not)
   */
  async ensureExists(userId: string, email: string): Promise<UserProfile> {
    const existing = await this.getById(userId);
    if (existing) return existing;

    const { data, error } = await this.supabase
      .from('user_profiles')
      .insert({
        id: userId,
        email,
        display_name: email.split('@')[0],
      })
      .select()
      .single();

    if (error) {
      // Might be a race condition - try to fetch again
      const retry = await this.getById(userId);
      if (retry) return retry;

      logger.error({ error, userId }, 'Error creating user profile');
      throw error;
    }

    logger.info({ userId }, 'User profile created');
    return this.mapToEntity(data as UserProfileRow);
  }
}
