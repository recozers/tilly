import { SupabaseClient } from '@supabase/supabase-js';
import { createLogger } from '../utils/logger.js';

/**
 * Base repository with common database operations
 */
export abstract class BaseRepository<TRow, TEntity> {
  protected logger;

  constructor(
    protected supabase: SupabaseClient,
    protected tableName: string
  ) {
    this.logger = createLogger(`${this.constructor.name}`);
  }

  /**
   * Map database row to entity
   */
  protected abstract mapToEntity(row: TRow): TEntity;

  /**
   * Find a single record by ID
   */
  protected async findById(id: number | string, userId: string): Promise<TEntity | null> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      this.logger.error({ error, id, userId }, 'Error finding by ID');
      throw error;
    }

    return this.mapToEntity(data as TRow);
  }

  /**
   * Find many records with optional filters
   */
  protected async findMany(
    userId: string,
    options?: {
      filters?: Record<string, unknown>;
      orderBy?: { column: string; ascending?: boolean };
      limit?: number;
      offset?: number;
    }
  ): Promise<TEntity[]> {
    let query = this.supabase
      .from(this.tableName)
      .select('*')
      .eq('user_id', userId);

    if (options?.filters) {
      for (const [key, value] of Object.entries(options.filters)) {
        query = query.eq(key, value);
      }
    }

    if (options?.orderBy) {
      query = query.order(options.orderBy.column, {
        ascending: options.orderBy.ascending ?? true,
      });
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    if (options?.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 100) - 1);
    }

    const { data, error } = await query;

    if (error) {
      this.logger.error({ error, userId }, 'Error finding many');
      throw error;
    }

    return (data as TRow[]).map(row => this.mapToEntity(row));
  }

  /**
   * Delete a record by ID
   */
  protected async deleteById(id: number | string, userId: string): Promise<boolean> {
    const { error, count } = await this.supabase
      .from(this.tableName)
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      this.logger.error({ error, id, userId }, 'Error deleting');
      throw error;
    }

    return (count ?? 0) > 0;
  }
}
