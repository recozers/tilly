import { RRule } from 'rrule';

interface BaseEvent {
  _id: string;
  title: string;
  startTime: number;
  endTime: number;
  color: string;
  description?: string;
  location?: string;
  allDay?: boolean;
  rrule?: string;
  dtstart?: number;
  duration?: number;
}

interface ExpandedEvent extends Omit<BaseEvent, 'rrule' | 'dtstart' | 'duration'> {
  isRecurringInstance?: boolean;
  originalEventId?: string;
  recurrenceIndex?: number;
}

/**
 * Expand recurring events within a date range
 */
export function expandRecurringEvents<T extends BaseEvent>(
  events: T[],
  rangeStart: Date | number,
  rangeEnd: Date | number
): (T | (Omit<T, 'rrule' | 'dtstart' | 'duration'> & ExpandedEvent))[] {
  const startDate = rangeStart instanceof Date ? rangeStart : new Date(rangeStart);
  const endDate = rangeEnd instanceof Date ? rangeEnd : new Date(rangeEnd);

  const result: (T | (Omit<T, 'rrule' | 'dtstart' | 'duration'> & ExpandedEvent))[] = [];

  for (const event of events) {
    if (!event.rrule) {
      result.push(event);
      continue;
    }

    try {
      const duration = event.duration ?? (event.endTime - event.startTime);
      const dtstart = event.dtstart ? new Date(event.dtstart) : new Date(event.startTime);
      const rruleStr = event.rrule.replace(/^RRULE:/i, '');

      const rule = RRule.fromString(`DTSTART:${formatRRuleDatetime(dtstart)}\nRRULE:${rruleStr}`);

      const bufferStart = new Date(startDate.getTime() - duration);
      const occurrences = rule.between(bufferStart, endDate, true);
      const limitedOccurrences = occurrences.slice(0, 100);

      for (let i = 0; i < limitedOccurrences.length; i++) {
        const occStart = limitedOccurrences[i];
        const occEnd = new Date(occStart.getTime() + duration);

        const expandedEvent = {
          ...event,
          _id: `${event._id}_occ_${i}`,
          startTime: occStart.getTime(),
          endTime: occEnd.getTime(),
          isRecurringInstance: true,
          originalEventId: event._id,
          recurrenceIndex: i,
        };

        delete (expandedEvent as any).rrule;
        delete (expandedEvent as any).dtstart;
        delete (expandedEvent as any).duration;

        result.push(expandedEvent as any);
      }
    } catch (error) {
      console.warn(`Failed to parse RRULE for event "${event.title}":`, error);
      result.push(event);
    }
  }

  return result;
}

function formatRRuleDatetime(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hour = String(date.getUTCHours()).padStart(2, '0');
  const minute = String(date.getUTCMinutes()).padStart(2, '0');
  const second = String(date.getUTCSeconds()).padStart(2, '0');
  return `${year}${month}${day}T${hour}${minute}${second}Z`;
}

export function isRecurringInstance(event: { isRecurringInstance?: boolean }): boolean {
  return event.isRecurringInstance === true;
}

export function getOriginalEventId(event: { originalEventId?: string; _id: string }): string {
  return event.originalEventId ?? event._id;
}

export function describeRecurrence(rrule: string): string {
  try {
    const rruleStr = rrule.replace(/^RRULE:/i, '');
    const rule = RRule.fromString(`RRULE:${rruleStr}`);
    return rule.toText();
  } catch {
    return 'Recurring event';
  }
}
