import { useState, useEffect, useCallback } from 'react';
import { eventsApi } from '../api/events.api.js';
import type { Event, CreateEventDto, UpdateEventDto, TypedEvent } from '@tilly/shared';

interface UseEventsReturn {
  events: TypedEvent[];
  isLoading: boolean;
  error: Error | null;
  createEvent: (dto: CreateEventDto) => Promise<Event>;
  updateEvent: (id: number, dto: UpdateEventDto) => Promise<Event>;
  deleteEvent: (id: number) => Promise<void>;
  refetch: () => Promise<void>;
}

/**
 * Hook for managing calendar events
 */
export function useEvents(): UseEventsReturn {
  const [events, setEvents] = useState<TypedEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchEvents = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await eventsApi.getAll();
      setEvents(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch events'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const createEvent = useCallback(async (dto: CreateEventDto): Promise<Event> => {
    const event = await eventsApi.create(dto);
    setEvents(prev => [...prev, { ...event, type: 'event' }]);
    return event;
  }, []);

  const updateEvent = useCallback(async (id: number, dto: UpdateEventDto): Promise<Event> => {
    const event = await eventsApi.update(id, dto);
    setEvents(prev => prev.map(e => (e.id === id ? { ...event, type: e.type } : e)));
    return event;
  }, []);

  const deleteEvent = useCallback(async (id: number): Promise<void> => {
    await eventsApi.delete(id);
    setEvents(prev => prev.filter(e => e.id !== id));
  }, []);

  return {
    events,
    isLoading,
    error,
    createEvent,
    updateEvent,
    deleteEvent,
    refetch: fetchEvents,
  };
}
