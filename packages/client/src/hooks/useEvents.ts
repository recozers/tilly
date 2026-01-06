import { useCallback } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';

interface Event {
  _id: Id<"events">;
  title: string;
  startTime: number;
  endTime: number;
  color: string;
  description?: string;
  location?: string;
  type: 'event';
}

interface CreateEventDto {
  title: string;
  startTime: number;
  endTime: number;
  color?: string;
  description?: string;
  location?: string;
}

interface UpdateEventDto {
  title?: string;
  startTime?: number;
  endTime?: number;
  color?: string;
  description?: string;
  location?: string;
}

interface UseEventsReturn {
  events: Event[];
  isLoading: boolean;
  error: Error | null;
  createEvent: (dto: CreateEventDto) => Promise<any>;
  updateEvent: (id: Id<"events">, dto: UpdateEventDto) => Promise<any>;
  deleteEvent: (id: Id<"events">) => Promise<void>;
  refetch: () => void;
}

/**
 * Hook for managing calendar events with Convex
 * Events automatically update in real-time!
 */
export function useEvents(): UseEventsReturn {
  // Real-time query - automatically updates when data changes
  const eventsData = useQuery(api.events.queries.list, {});

  // Mutations
  const createMutation = useMutation(api.events.mutations.create);
  const updateMutation = useMutation(api.events.mutations.update);
  const deleteMutation = useMutation(api.events.mutations.remove);

  const events: Event[] = (eventsData ?? []).map(e => ({
    ...e,
    type: 'event' as const,
  }));

  const createEvent = useCallback(async (dto: CreateEventDto) => {
    return await createMutation({
      title: dto.title,
      startTime: dto.startTime,
      endTime: dto.endTime,
      color: dto.color,
      description: dto.description,
      location: dto.location,
    });
  }, [createMutation]);

  const updateEvent = useCallback(async (id: Id<"events">, dto: UpdateEventDto) => {
    return await updateMutation({
      id,
      ...dto,
    });
  }, [updateMutation]);

  const deleteEvent = useCallback(async (id: Id<"events">) => {
    await deleteMutation({ id });
  }, [deleteMutation]);

  // No need to manually refetch - Convex handles real-time updates
  const refetch = useCallback(() => {
    // No-op - Convex automatically keeps data in sync
  }, []);

  return {
    events,
    isLoading: eventsData === undefined,
    error: null, // Convex handles errors differently
    createEvent,
    updateEvent,
    deleteEvent,
    refetch,
  };
}
