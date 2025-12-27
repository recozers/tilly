import { apiClient } from './client.js';
import type { Event, CreateEventDto, UpdateEventDto, TypedEvent } from '@tilly/shared';

/**
 * Events API client
 */
export const eventsApi = {
  /**
   * Get all events
   */
  async getAll(): Promise<TypedEvent[]> {
    return apiClient.get<TypedEvent[]>('/events');
  },

  /**
   * Get events by date range
   */
  async getByRange(start: Date, end: Date): Promise<TypedEvent[]> {
    return apiClient.get<TypedEvent[]>('/events/range', {
      params: {
        start: start.toISOString(),
        end: end.toISOString(),
      },
    });
  },

  /**
   * Get upcoming events
   */
  async getUpcoming(days = 7): Promise<Event[]> {
    return apiClient.get<Event[]>('/events/upcoming', {
      params: { days: days.toString() },
    });
  },

  /**
   * Search events
   */
  async search(query: string): Promise<Event[]> {
    return apiClient.get<Event[]>('/events/search', {
      params: { q: query },
    });
  },

  /**
   * Get event by ID
   */
  async getById(id: number): Promise<Event> {
    return apiClient.get<Event>(`/events/${id}`);
  },

  /**
   * Create a new event
   */
  async create(data: CreateEventDto): Promise<Event> {
    return apiClient.post<Event>('/events', data);
  },

  /**
   * Update an event
   */
  async update(id: number, data: UpdateEventDto): Promise<Event> {
    return apiClient.put<Event>(`/events/${id}`, data);
  },

  /**
   * Delete an event
   */
  async delete(id: number): Promise<void> {
    return apiClient.delete(`/events/${id}`);
  },

  /**
   * Check for time conflicts
   */
  async checkConflicts(
    start: Date,
    end: Date,
    excludeEventId?: number
  ): Promise<{ hasConflicts: boolean; conflicts: Event[] }> {
    return apiClient.post('/events/check-conflicts', {
      start: start.toISOString(),
      end: end.toISOString(),
      excludeEventId,
    });
  },

  /**
   * Get calendar statistics
   */
  async getStats(): Promise<{
    totalEvents: number;
    upcomingEvents: number;
    thisWeekEvents: number;
  }> {
    return apiClient.get('/events/stats');
  },
};
