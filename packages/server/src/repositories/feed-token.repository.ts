import { SupabaseClient } from '@supabase/supabase-js';
import { BaseRepository } from './base.repository.js';
import type {
  CalendarFeedToken,
  CalendarFeedTokenRow,
  CreateFeedTokenDto,
} from '@tilly/shared';
import crypto from 'crypto';

/**
 * Feed token repository for iCal feed tokens
 */
export class FeedTokenRepository extends BaseRepository<CalendarFeedTokenRow, CalendarFeedToken> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'calendar_feed_tokens');
  }

  protected mapToEntity(row: CalendarFeedTokenRow): CalendarFeedToken {
    return {
      id: row.id,
      userId: row.user_id,
      token: row.token,
      name: row.name,
      isActive: row.is_active,
      includePrivate: row.include_private,
      lastAccessedAt: row.last_accessed_at ? new Date(row.last_accessed_at) : undefined,
      accessCount: row.access_count,
      createdAt: new Date(row.created_at),
      expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
    };
  }

  /**
   * Get all feed tokens for a user
   */
  async getAll(userId: string): Promise<CalendarFeedToken[]> {
    return this.findMany(userId, {
      orderBy: { column: 'created_at', ascending: false },
    });
  }

  /**
   * Get a feed token by ID
   */
  async getById(id: number, userId: string): Promise<CalendarFeedToken | null> {
    return this.findById(id, userId);
  }

  /**
   * Create a new feed token
   */
  async create(dto: CreateFeedTokenDto, userId: string): Promise<CalendarFeedToken> {
    const token = this.generateSecureToken();
    const expiresAt = dto.expiresInDays
      ? new Date(Date.now() + dto.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    const insertData = {
      user_id: userId,
      token,
      name: dto.name,
      is_active: true,
      include_private: dto.includePrivate ?? false,
      access_count: 0,
      expires_at: expiresAt?.toISOString() ?? null,
    };

    const { data, error } = await this.supabase
      .from(this.tableName)
      .insert([insertData])
      .select()
      .single();

    if (error) {
      this.logger.error({ error, userId }, 'Error creating feed token');
      throw error;
    }

    this.logger.info({ tokenId: data.id, name: dto.name }, 'Feed token created');
    return this.mapToEntity(data as CalendarFeedTokenRow);
  }

  /**
   * Find a token by its value (for public feed access)
   * Note: This doesn't filter by user_id since tokens are accessed publicly
   */
  async findByToken(token: string): Promise<CalendarFeedToken | null> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('token', token)
      .eq('is_active', true)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      this.logger.error({ error }, 'Error finding by token');
      throw error;
    }

    const feedToken = this.mapToEntity(data as CalendarFeedTokenRow);

    // Check if token is expired
    if (feedToken.expiresAt && feedToken.expiresAt < new Date()) {
      return null;
    }

    return feedToken;
  }

  /**
   * Update access statistics for a token
   */
  async recordAccess(token: string): Promise<void> {
    const { error } = await this.supabase
      .from(this.tableName)
      .update({
        last_accessed_at: new Date().toISOString(),
        access_count: this.supabase.rpc('increment_access_count', { token_value: token }),
      })
      .eq('token', token);

    // Use raw SQL for increment since rpc might not exist
    if (error) {
      // Fallback: just update last_accessed_at
      await this.supabase
        .from(this.tableName)
        .update({ last_accessed_at: new Date().toISOString() })
        .eq('token', token);
    }
  }

  /**
   * Increment access count manually
   */
  async incrementAccessCount(tokenId: number): Promise<void> {
    const { data: current } = await this.supabase
      .from(this.tableName)
      .select('access_count')
      .eq('id', tokenId)
      .single();

    const newCount = (current?.access_count ?? 0) + 1;

    await this.supabase
      .from(this.tableName)
      .update({
        access_count: newCount,
        last_accessed_at: new Date().toISOString(),
      })
      .eq('id', tokenId);
  }

  /**
   * Revoke a feed token (soft delete by deactivating)
   */
  async revoke(id: number, userId: string): Promise<boolean> {
    const { error, count } = await this.supabase
      .from(this.tableName)
      .update({ is_active: false })
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      this.logger.error({ error, id, userId }, 'Error revoking token');
      throw error;
    }

    if ((count ?? 0) > 0) {
      this.logger.info({ tokenId: id }, 'Feed token revoked');
    }

    return (count ?? 0) > 0;
  }

  /**
   * Delete a feed token permanently
   */
  async delete(id: number, userId: string): Promise<boolean> {
    const result = await this.deleteById(id, userId);
    if (result) {
      this.logger.info({ tokenId: id }, 'Feed token deleted');
    }
    return result;
  }

  /**
   * Generate a cryptographically secure token
   */
  private generateSecureToken(): string {
    return crypto.randomBytes(32).toString('base64url');
  }
}
