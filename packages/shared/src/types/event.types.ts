import type { CalendarColor } from '../constants/colors.js';

/**
 * Base event interface representing a calendar event
 */
export interface Event {
  id: number;
  title: string;
  start: Date;
  end: Date;
  color: CalendarColor | string;
  description?: string;
  location?: string;
  userId: string;
  sourceCalendarId?: number;
  sourceEventUid?: string;
  rrule?: string;
  dtstart?: Date;
  duration?: number;
  allDay?: boolean;
  meetingRequestId?: number;
}

/**
 * Event type discriminator
 */
export type EventType = 'event' | 'meeting_request' | 'sent_meeting_request';

/**
 * Event with type for frontend display
 */
export interface TypedEvent extends Event {
  type: EventType;
}

/**
 * Event with layout information for calendar rendering
 */
export interface EventWithLayout extends TypedEvent {
  width: number;
  left: number;
  zIndex: number;
}

/**
 * DTO for creating a new event
 */
export interface CreateEventDto {
  title: string;
  start: Date | string;
  end: Date | string;
  color?: string;
  description?: string;
  location?: string;
}

/**
 * DTO for updating an existing event
 */
export interface UpdateEventDto {
  title?: string;
  start?: Date | string;
  end?: Date | string;
  color?: string;
  description?: string;
  location?: string;
}

/**
 * Database row representation of an event
 */
export interface EventRow {
  id: number;
  user_id: string;
  title: string;
  start_time: string;
  end_time: string;
  color: string;
  description?: string;
  location?: string;
  source_calendar_id?: number;
  source_event_uid?: string;
  rrule?: string;
  dtstart?: string;
  duration?: number;
  all_day?: boolean;
  created_at?: string;
  updated_at?: string;
}
