import ICAL from 'ical.js';
import type { Event, CreateEventDto, CalendarSubscription, SyncResult } from '@tilly/shared';
import { EventRepository } from '../repositories/event.repository.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('ICalService');

interface ParsedICalEvent {
  uid: string;
  title: string;
  start: Date;
  end: Date;
  description?: string;
  location?: string;
  rrule?: string;
  allDay?: boolean;
}

/**
 * iCal Service - handles iCalendar import/export
 */
export class ICalService {
  constructor(private eventRepository: EventRepository) {}

  /**
   * Parse an iCalendar string and extract events
   */
  parseICalData(icalData: string): ParsedICalEvent[] {
    const events: ParsedICalEvent[] = [];

    try {
      const jcalData = ICAL.parse(icalData);
      const comp = new ICAL.Component(jcalData);
      const vevents = comp.getAllSubcomponents('vevent');

      for (const vevent of vevents) {
        const event = new ICAL.Event(vevent);

        // Get start and end dates
        const startDate = event.startDate?.toJSDate();
        const endDate = event.endDate?.toJSDate();

        if (!startDate) {
          logger.warn({ uid: event.uid }, 'Skipping event without start date');
          continue;
        }

        // Check if all-day event
        const isAllDay = event.startDate?.isDate || false;

        // Handle end date - if missing, use start date + 1 hour (or same day for all-day)
        const calculatedEnd = endDate || (isAllDay
          ? new Date(startDate.getTime() + 24 * 60 * 60 * 1000)
          : new Date(startDate.getTime() + 60 * 60 * 1000));

        // Get recurrence rule if present
        let rrule: string | undefined;
        const rruleProp = vevent.getFirstProperty('rrule');
        if (rruleProp) {
          rrule = rruleProp.toICALString();
        }

        events.push({
          uid: event.uid || `imported-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          title: event.summary || 'Untitled Event',
          start: startDate,
          end: calculatedEnd,
          description: event.description,
          location: event.location,
          rrule,
          allDay: isAllDay,
        });
      }

      logger.info({ eventCount: events.length }, 'Parsed iCal data');
    } catch (error) {
      logger.error({ error }, 'Failed to parse iCal data');
      throw new Error('Invalid iCalendar format');
    }

    return events;
  }

  /**
   * Import events from iCalendar data
   */
  async importEvents(
    icalData: string,
    userId: string,
    sourceCalendarId?: number
  ): Promise<{ imported: number; skipped: number; errors: number }> {
    const parsedEvents = this.parseICalData(icalData);
    let imported = 0;
    let skipped = 0;
    let errors = 0;

    for (const event of parsedEvents) {
      try {
        // Check if event already exists by UID
        const existing = await this.eventRepository.findBySourceUid(event.uid, userId);

        if (existing) {
          // Update existing event
          await this.eventRepository.update(existing.id, {
            title: event.title,
            start: event.start,
            end: event.end,
            description: event.description,
            location: event.location,
          }, userId);
          skipped++;
        } else {
          // Create new event
          const dto: CreateEventDto = {
            title: event.title,
            start: event.start,
            end: event.end,
            description: event.description,
            location: event.location,
          };

          await this.eventRepository.createWithSource(dto, userId, {
            sourceCalendarId,
            sourceEventUid: event.uid,
            rrule: event.rrule,
            allDay: event.allDay,
          });
          imported++;
        }
      } catch (error) {
        logger.error({ error, eventUid: event.uid }, 'Failed to import event');
        errors++;
      }
    }

    logger.info({ imported, skipped, errors, userId }, 'Import completed');
    return { imported, skipped, errors };
  }

  /**
   * Export events to iCalendar format
   */
  async exportEvents(userId: string, startDate?: Date, endDate?: Date): Promise<string> {
    // Get events to export
    const events = startDate && endDate
      ? await this.eventRepository.getByDateRange(startDate, endDate, userId)
      : await this.eventRepository.getAll(userId);

    // Create calendar component
    const cal = new ICAL.Component(['vcalendar', [], []]);
    cal.updatePropertyWithValue('version', '2.0');
    cal.updatePropertyWithValue('prodid', '-//Tilly//Calendar//EN');
    cal.updatePropertyWithValue('calscale', 'GREGORIAN');
    cal.updatePropertyWithValue('method', 'PUBLISH');
    cal.updatePropertyWithValue('x-wr-calname', 'Tilly Calendar');

    for (const event of events) {
      const vevent = new ICAL.Component('vevent');

      // Generate UID if not present
      const uid = event.sourceEventUid || `tilly-${event.id}@tilly.app`;
      vevent.updatePropertyWithValue('uid', uid);

      // Set timestamps
      const dtstart = ICAL.Time.fromJSDate(new Date(event.start), true);
      const dtend = ICAL.Time.fromJSDate(new Date(event.end), true);

      if (event.allDay) {
        dtstart.isDate = true;
        dtend.isDate = true;
      }

      vevent.updatePropertyWithValue('dtstart', dtstart);
      vevent.updatePropertyWithValue('dtend', dtend);

      // Set summary (title)
      vevent.updatePropertyWithValue('summary', event.title);

      // Set optional fields
      if (event.description) {
        vevent.updatePropertyWithValue('description', event.description);
      }
      if (event.location) {
        vevent.updatePropertyWithValue('location', event.location);
      }

      // Add recurrence rule if present
      if (event.rrule) {
        const rruleProp = ICAL.Property.fromString(event.rrule);
        vevent.addProperty(rruleProp);
      }

      // Set timestamps
      const now = ICAL.Time.fromJSDate(new Date(), true);
      vevent.updatePropertyWithValue('dtstamp', now);

      cal.addSubcomponent(vevent);
    }

    const icalString = cal.toString();
    logger.info({ eventCount: events.length, userId }, 'Exported calendar to iCal');

    return icalString;
  }

  /**
   * Sync events from an external iCal URL
   */
  async syncFromUrl(
    subscription: CalendarSubscription,
    userId: string
  ): Promise<SyncResult> {
    try {
      // Fetch the iCal data
      const response = await fetch(subscription.url, {
        headers: {
          'Accept': 'text/calendar, application/calendar+xml, application/ics',
          ...(subscription.etag && { 'If-None-Match': subscription.etag }),
          ...(subscription.lastModified && { 'If-Modified-Since': subscription.lastModified }),
        },
      });

      // Check if not modified
      if (response.status === 304) {
        return {
          success: true,
          eventsAdded: 0,
          eventsUpdated: 0,
          eventsDeleted: 0,
        };
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch calendar: HTTP ${response.status}`);
      }

      const icalData = await response.text();

      // Get existing events from this source
      const existingEvents = await this.eventRepository.getBySourceCalendar(subscription.id, userId);
      const existingUids = new Set(existingEvents.map(e => e.sourceEventUid));

      // Parse new events
      const parsedEvents = this.parseICalData(icalData);
      const newUids = new Set(parsedEvents.map(e => e.uid));

      let eventsAdded = 0;
      let eventsUpdated = 0;
      let eventsDeleted = 0;

      // Import/update events
      for (const event of parsedEvents) {
        const existing = existingEvents.find(e => e.sourceEventUid === event.uid);

        if (existing) {
          // Update existing event
          await this.eventRepository.update(existing.id, {
            title: event.title,
            start: event.start,
            end: event.end,
            description: event.description,
            location: event.location,
          }, userId);
          eventsUpdated++;
        } else {
          // Create new event
          await this.eventRepository.createWithSource(
            {
              title: event.title,
              start: event.start,
              end: event.end,
              description: event.description,
              location: event.location,
              color: subscription.color,
            },
            userId,
            {
              sourceCalendarId: subscription.id,
              sourceEventUid: event.uid,
              rrule: event.rrule,
              allDay: event.allDay,
            }
          );
          eventsAdded++;
        }
      }

      // Delete events that no longer exist in the source
      for (const uid of existingUids) {
        if (uid && !newUids.has(uid)) {
          const eventToDelete = existingEvents.find(e => e.sourceEventUid === uid);
          if (eventToDelete) {
            await this.eventRepository.delete(eventToDelete.id, userId);
            eventsDeleted++;
          }
        }
      }

      logger.info(
        { subscriptionId: subscription.id, eventsAdded, eventsUpdated, eventsDeleted },
        'Calendar sync completed'
      );

      return {
        success: true,
        eventsAdded,
        eventsUpdated,
        eventsDeleted,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ error, subscriptionId: subscription.id }, 'Calendar sync failed');

      return {
        success: false,
        eventsAdded: 0,
        eventsUpdated: 0,
        eventsDeleted: 0,
        error: errorMessage,
      };
    }
  }

  /**
   * Generate an iCal file for a single event (for calendar invitations)
   */
  generateEventICS(event: Event): string {
    const cal = new ICAL.Component(['vcalendar', [], []]);
    cal.updatePropertyWithValue('version', '2.0');
    cal.updatePropertyWithValue('prodid', '-//Tilly//Calendar//EN');
    cal.updatePropertyWithValue('calscale', 'GREGORIAN');
    cal.updatePropertyWithValue('method', 'REQUEST');

    const vevent = new ICAL.Component('vevent');
    const uid = event.sourceEventUid || `tilly-${event.id}@tilly.app`;
    vevent.updatePropertyWithValue('uid', uid);

    const dtstart = ICAL.Time.fromJSDate(new Date(event.start), true);
    const dtend = ICAL.Time.fromJSDate(new Date(event.end), true);

    if (event.allDay) {
      dtstart.isDate = true;
      dtend.isDate = true;
    }

    vevent.updatePropertyWithValue('dtstart', dtstart);
    vevent.updatePropertyWithValue('dtend', dtend);
    vevent.updatePropertyWithValue('summary', event.title);

    if (event.description) {
      vevent.updatePropertyWithValue('description', event.description);
    }
    if (event.location) {
      vevent.updatePropertyWithValue('location', event.location);
    }

    const now = ICAL.Time.fromJSDate(new Date(), true);
    vevent.updatePropertyWithValue('dtstamp', now);
    vevent.updatePropertyWithValue('sequence', 0);
    vevent.updatePropertyWithValue('status', 'CONFIRMED');

    cal.addSubcomponent(vevent);

    return cal.toString();
  }
}
