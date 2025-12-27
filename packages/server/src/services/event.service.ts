import type { Event, CreateEventDto, UpdateEventDto, TypedEvent } from '@tilly/shared';
import { EventRepository } from '../repositories/event.repository.js';
import { MeetingRepository } from '../repositories/meeting.repository.js';
import { createLogger } from '../utils/logger.js';
import { BadRequestError, NotFoundError } from '../middleware/error-handler.js';

const logger = createLogger('EventService');

/**
 * Event service - business logic for calendar events
 */
export class EventService {
  constructor(
    private eventRepository: EventRepository,
    private meetingRepository: MeetingRepository
  ) {}

  /**
   * Get all events for the user including meeting requests
   */
  async getAllEvents(userId: string): Promise<TypedEvent[]> {
    logger.debug({ userId }, 'Getting all events');

    const [events, pendingMeetings] = await Promise.all([
      this.eventRepository.getAll(userId),
      this.meetingRepository.getPendingForCalendar(userId),
    ]);

    // Convert pending meeting requests to calendar events
    const meetingEvents: TypedEvent[] = [];
    for (const meeting of pendingMeetings) {
      const isReceived = meeting.friendId === userId;

      for (let i = 0; i < meeting.proposedTimes.length; i++) {
        const proposedTime = meeting.proposedTimes[i];
        const start = new Date(proposedTime.start);
        const end = proposedTime.end
          ? new Date(proposedTime.end)
          : new Date(start.getTime() + meeting.durationMinutes * 60000);

        meetingEvents.push({
          id: parseInt(`${meeting.id.slice(-8)}${i}`, 16) || i, // Generate numeric ID
          title: `${meeting.title}${isReceived ? '' : ' (pending)'}`,
          start,
          end,
          color: '#e8f5e9',
          userId,
          type: isReceived ? 'meeting_request' : 'sent_meeting_request',
          meetingRequestId: parseInt(meeting.id.slice(-8), 16) || 0,
        });
      }
    }

    return [...events, ...meetingEvents];
  }

  /**
   * Get events within a date range
   */
  async getEventsByDateRange(
    startDate: Date,
    endDate: Date,
    userId: string
  ): Promise<TypedEvent[]> {
    logger.debug({ userId, startDate, endDate }, 'Getting events by date range');
    return this.eventRepository.getByDateRange(startDate, endDate, userId);
  }

  /**
   * Get a single event by ID
   */
  async getEventById(id: number, userId: string): Promise<Event> {
    const event = await this.eventRepository.getById(id, userId);
    if (!event) {
      throw new NotFoundError('Event');
    }
    return event;
  }

  /**
   * Create a new event
   */
  async createEvent(dto: CreateEventDto, userId: string): Promise<Event> {
    // Validate dates
    const startDate = dto.start instanceof Date ? dto.start : new Date(dto.start);
    const endDate = dto.end instanceof Date ? dto.end : new Date(dto.end);

    if (isNaN(startDate.getTime())) {
      throw new BadRequestError('Invalid start date');
    }
    if (isNaN(endDate.getTime())) {
      throw new BadRequestError('Invalid end date');
    }
    if (startDate >= endDate) {
      throw new BadRequestError('Start time must be before end time');
    }

    logger.info({ title: dto.title, userId }, 'Creating event');
    return this.eventRepository.create(dto, userId);
  }

  /**
   * Update an existing event
   */
  async updateEvent(id: number, dto: UpdateEventDto, userId: string): Promise<Event> {
    // Verify event exists and belongs to user
    const existing = await this.eventRepository.getById(id, userId);
    if (!existing) {
      throw new NotFoundError('Event');
    }

    // Validate dates if provided
    if (dto.start && dto.end) {
      const startDate = dto.start instanceof Date ? dto.start : new Date(dto.start);
      const endDate = dto.end instanceof Date ? dto.end : new Date(dto.end);

      if (startDate >= endDate) {
        throw new BadRequestError('Start time must be before end time');
      }
    }

    logger.info({ eventId: id, userId }, 'Updating event');
    return this.eventRepository.update(id, dto, userId);
  }

  /**
   * Move an event to a new time
   */
  async moveEvent(
    id: number,
    newStart: Date | string,
    newEnd: Date | string,
    userId: string,
    newTitle?: string
  ): Promise<Event> {
    const existing = await this.eventRepository.getById(id, userId);
    if (!existing) {
      throw new NotFoundError('Event');
    }

    const updateDto: UpdateEventDto = {
      start: newStart,
      end: newEnd,
    };

    if (newTitle) {
      updateDto.title = newTitle;
    }

    logger.info({ eventId: id, newStart, newEnd, userId }, 'Moving event');
    return this.eventRepository.update(id, updateDto, userId);
  }

  /**
   * Delete an event
   */
  async deleteEvent(id: number, userId: string): Promise<void> {
    const deleted = await this.eventRepository.delete(id, userId);
    if (!deleted) {
      throw new NotFoundError('Event');
    }
    logger.info({ eventId: id, userId }, 'Event deleted');
  }

  /**
   * Check for time conflicts
   */
  async checkTimeConflicts(
    startTime: Date,
    endTime: Date,
    userId: string,
    excludeEventId?: number
  ): Promise<{ hasConflicts: boolean; conflicts: Event[] }> {
    const conflicts = await this.eventRepository.checkConflicts(
      startTime,
      endTime,
      userId,
      excludeEventId
    );

    return {
      hasConflicts: conflicts.length > 0,
      conflicts,
    };
  }

  /**
   * Search events by title
   */
  async searchEvents(query: string, userId: string): Promise<Event[]> {
    if (!query || query.length < 2) {
      throw new BadRequestError('Search query must be at least 2 characters');
    }

    return this.eventRepository.search(query, userId);
  }

  /**
   * Get upcoming events
   */
  async getUpcomingEvents(userId: string, days = 7): Promise<Event[]> {
    return this.eventRepository.getUpcoming(userId, days);
  }

  /**
   * Get calendar statistics
   */
  async getCalendarStats(userId: string): Promise<{
    totalEvents: number;
    upcomingEvents: number;
    thisWeekEvents: number;
  }> {
    const [allEvents, upcoming] = await Promise.all([
      this.eventRepository.getAll(userId),
      this.eventRepository.getUpcoming(userId, 7),
    ]);

    return {
      totalEvents: allEvents.length,
      upcomingEvents: upcoming.length,
      thisWeekEvents: upcoming.length,
    };
  }
}
