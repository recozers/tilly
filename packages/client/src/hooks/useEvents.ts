import { useCallback, useMemo } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import { expandRecurringEvents } from '../utils/recurrence.js';

interface Event {
  _id: Id<"events"> | string;
  title: string;
  startTime: number;
  endTime: number;
  color: string;
  description?: string;
  location?: string;
  allDay?: boolean;
  timezone?: string;
  reminders?: number[];
  rrule?: string;
  isRecurringInstance?: boolean;
  originalEventId?: string;
  sourceCalendarId?: Id<"calendarSubscriptions">;
  type: 'event';
}

interface CreateEventDto {
  title: string;
  startTime: number;
  endTime: number;
  color?: string;
  description?: string;
  location?: string;
  allDay?: boolean;
  timezone?: string;
  reminders?: number[];
}

interface UpdateEventDto {
  title?: string;
  startTime?: number;
  endTime?: number;
  color?: string;
  description?: string;
  location?: string;
  allDay?: boolean;
  timezone?: string;
  reminders?: number[];
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
  // Query subscriptions to filter by visibility
  const subscriptions = useQuery(api.subscriptions.queries.list, {});

  // Mutations
  const createMutation = useMutation(api.events.mutations.create);
  const updateMutation = useMutation(api.events.mutations.update);
  const deleteMutation = useMutation(api.events.mutations.remove);

  // Build a set of hidden subscription IDs for fast lookup
  const hiddenSubscriptionIds = useMemo(() => {
    if (!subscriptions) return new Set<string>();
    return new Set(
      subscriptions
        .filter(sub => sub.visible === false)
        .map(sub => sub._id)
    );
  }, [subscriptions]);

  // Expand recurring events for display and filter by visibility
  // Default to 6 months before/after now to match server query
  const events: Event[] = useMemo(() => {
    const rawEvents = (eventsData ?? [])
      // Filter out events from hidden subscriptions
      .filter(e => !e.sourceCalendarId || !hiddenSubscriptionIds.has(e.sourceCalendarId))
      .map(e => ({
        ...e,
        type: 'event' as const,
      }));

    const now = Date.now();
    const sixMonths = 6 * 30 * 24 * 60 * 60 * 1000;
    const rangeStart = now - sixMonths;
    const rangeEnd = now + sixMonths;

    return expandRecurringEvents(rawEvents, rangeStart, rangeEnd) as Event[];
  }, [eventsData, hiddenSubscriptionIds]);

  const createEvent = useCallback(async (dto: CreateEventDto) => {
    return await createMutation({
      title: dto.title,
      startTime: dto.startTime,
      endTime: dto.endTime,
      color: dto.color,
      description: dto.description,
      location: dto.location,
      allDay: dto.allDay,
      timezone: dto.timezone,
      reminders: dto.reminders,
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
