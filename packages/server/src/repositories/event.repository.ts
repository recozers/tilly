import { SupabaseClient } from '@supabase/supabase-js';
import { BaseRepository } from './base.repository.js';
import type { Event, EventRow, CreateEventDto, UpdateEventDto, TypedEvent } from '@tilly/shared';
import { getRandomEventColor } from '@tilly/shared';
import { config } from '../config/index.js';

/**
 * Event repository for calendar event operations
 */
export class EventRepository extends BaseRepository<EventRow, Event> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'events');
  }

  protected mapToEntity(row: EventRow): Event {
    return {
      id: row.id,
      title: row.title,
      start: new Date(row.start_time),
      end: new Date(row.end_time),
      color: row.color,
      userId: row.user_id,
      description: row.description,
      location: row.location,
      sourceCalendarId: row.source_calendar_id,
      sourceEventUid: row.source_event_uid,
      rrule: row.rrule,
      dtstart: row.dtstart ? new Date(row.dtstart) : undefined,
      duration: row.duration,
      allDay: row.all_day,
    };
  }

  /**
   * Get all events for a user within the default date range
   */
  async getAll(userId: string): Promise<TypedEvent[]> {
    const rangeMonths = config.events.rangeMonths;
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - rangeMonths);
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + rangeMonths);

    return this.getByDateRange(startDate, endDate, userId);
  }

  /**
   * Get events within a date range
   */
  async getByDateRange(startDate: Date, endDate: Date, userId: string): Promise<TypedEvent[]> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('user_id', userId)
      .gte('start_time', startDate.toISOString())
      .lte('start_time', endDate.toISOString())
      .order('start_time', { ascending: true });

    if (error) {
      this.logger.error({ error, userId }, 'Error getting events by date range');
      throw error;
    }

    return (data as EventRow[]).map(row => ({
      ...this.mapToEntity(row),
      type: 'event' as const,
    }));
  }

  /**
   * Get a single event by ID
   */
  async getById(id: number, userId: string): Promise<Event | null> {
    return this.findById(id, userId);
  }

  /**
   * Create a new event
   */
  async create(dto: CreateEventDto, userId: string): Promise<Event> {
    const startDate = dto.start instanceof Date ? dto.start : new Date(dto.start);
    const endDate = dto.end instanceof Date ? dto.end : new Date(dto.end);

    const insertData = {
      title: dto.title,
      start_time: startDate.toISOString(),
      end_time: endDate.toISOString(),
      color: dto.color || getRandomEventColor(),
      description: dto.description,
      location: dto.location,
      user_id: userId,
    };

    const { data, error } = await this.supabase
      .from(this.tableName)
      .insert([insertData])
      .select()
      .single();

    if (error) {
      this.logger.error({ error, userId }, 'Error creating event');
      throw error;
    }

    this.logger.info({ eventId: data.id, title: dto.title }, 'Event created');
    return this.mapToEntity(data as EventRow);
  }

  /**
   * Update an existing event
   */
  async update(id: number, dto: UpdateEventDto, userId: string): Promise<Event> {
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (dto.title !== undefined) updateData.title = dto.title;
    if (dto.color !== undefined) updateData.color = dto.color;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.location !== undefined) updateData.location = dto.location;

    if (dto.start !== undefined) {
      const startDate = dto.start instanceof Date ? dto.start : new Date(dto.start);
      updateData.start_time = startDate.toISOString();
    }

    if (dto.end !== undefined) {
      const endDate = dto.end instanceof Date ? dto.end : new Date(dto.end);
      updateData.end_time = endDate.toISOString();
    }

    const { data, error } = await this.supabase
      .from(this.tableName)
      .update(updateData)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      this.logger.error({ error, id, userId }, 'Error updating event');
      throw error;
    }

    this.logger.info({ eventId: id }, 'Event updated');
    return this.mapToEntity(data as EventRow);
  }

  /**
   * Delete an event
   */
  async delete(id: number, userId: string): Promise<boolean> {
    const result = await this.deleteById(id, userId);
    if (result) {
      this.logger.info({ eventId: id }, 'Event deleted');
    }
    return result;
  }

  /**
   * Search events by title
   */
  async search(query: string, userId: string): Promise<Event[]> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('user_id', userId)
      .ilike('title', `%${query}%`)
      .order('start_time', { ascending: true })
      .limit(50);

    if (error) {
      this.logger.error({ error, query, userId }, 'Error searching events');
      throw error;
    }

    return (data as EventRow[]).map(row => this.mapToEntity(row));
  }

  /**
   * Get upcoming events (next 7 days)
   */
  async getUpcoming(userId: string, days = 7): Promise<Event[]> {
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days);

    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('user_id', userId)
      .gte('start_time', startDate.toISOString())
      .lte('start_time', endDate.toISOString())
      .order('start_time', { ascending: true });

    if (error) {
      this.logger.error({ error, userId }, 'Error getting upcoming events');
      throw error;
    }

    return (data as EventRow[]).map(row => this.mapToEntity(row));
  }

  /**
   * Check for time conflicts
   */
  async checkConflicts(
    startTime: Date,
    endTime: Date,
    userId: string,
    excludeEventId?: number
  ): Promise<Event[]> {
    let query = this.supabase
      .from(this.tableName)
      .select('*')
      .eq('user_id', userId)
      .lt('start_time', endTime.toISOString())
      .gt('end_time', startTime.toISOString());

    if (excludeEventId) {
      query = query.neq('id', excludeEventId);
    }

    const { data, error } = await query;

    if (error) {
      this.logger.error({ error, userId }, 'Error checking conflicts');
      throw error;
    }

    return (data as EventRow[]).map(row => this.mapToEntity(row));
  }

  /**
   * Upsert events from external calendar
   */
  async upsertFromSubscription(
    events: Array<{
      title: string;
      start: Date;
      end: Date;
      uid: string;
      rrule?: string;
    }>,
    userId: string,
    subscriptionId: number
  ): Promise<{ added: number; updated: number }> {
    let added = 0;
    let updated = 0;

    for (const event of events) {
      const { data: existing } = await this.supabase
        .from(this.tableName)
        .select('id')
        .eq('user_id', userId)
        .eq('source_calendar_id', subscriptionId)
        .eq('source_event_uid', event.uid)
        .single();

      if (existing) {
        await this.supabase
          .from(this.tableName)
          .update({
            title: event.title,
            start_time: event.start.toISOString(),
            end_time: event.end.toISOString(),
            rrule: event.rrule,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
        updated++;
      } else {
        await this.supabase.from(this.tableName).insert({
          title: event.title,
          start_time: event.start.toISOString(),
          end_time: event.end.toISOString(),
          color: getRandomEventColor(),
          user_id: userId,
          source_calendar_id: subscriptionId,
          source_event_uid: event.uid,
          rrule: event.rrule,
        });
        added++;
      }
    }

    this.logger.info({ added, updated, subscriptionId }, 'Events upserted from subscription');
    return { added, updated };
  }

  /**
   * Delete events from a subscription that are no longer present
   */
  async removeDeletedFromSubscription(
    currentUids: string[],
    userId: string,
    subscriptionId: number
  ): Promise<number> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .delete()
      .eq('user_id', userId)
      .eq('source_calendar_id', subscriptionId)
      .not('source_event_uid', 'in', `(${currentUids.map(u => `"${u}"`).join(',')})`)
      .select('id');

    if (error) {
      this.logger.error({ error, subscriptionId }, 'Error removing deleted events');
      throw error;
    }

    return data?.length ?? 0;
  }
}
