/**
 * Calendar utility functions
 * Extracted for testability
 */

// Convex event type
export interface CalendarEvent {
  _id: string;
  title: string;
  startTime: number;
  endTime: number;
  color: string;
  description?: string;
  location?: string;
  allDay?: boolean;
  isRecurringInstance?: boolean;
  type: 'event';
}

export interface EventWithLayout extends CalendarEvent {
  width: number;
  left: number;
  zIndex: number;
}

export function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day;
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function formatHour(hour: number): string {
  if (hour === 0 || hour === 24) return '12 AM';
  if (hour === 12) return '12 PM';
  if (hour < 12) return `${hour} AM`;
  return `${hour - 12} PM`;
}

export function getAllDayEvents(events: CalendarEvent[], dayStart: Date): CalendarEvent[] {
  return events.filter(e => {
    if (!e.allDay) return false;
    const eventStart = new Date(e.startTime);
    const eventEnd = new Date(e.endTime);

    // Normalize to date-only comparisons (ignore time)
    const eventStartDate = new Date(eventStart.getFullYear(), eventStart.getMonth(), eventStart.getDate());
    const eventEndDate = new Date(eventEnd.getFullYear(), eventEnd.getMonth(), eventEnd.getDate());
    const dayDate = new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate());

    // Check if the day falls within the event's date range (inclusive)
    return dayDate >= eventStartDate && dayDate <= eventEndDate;
  });
}

export function calculateEventLayout(events: CalendarEvent[], dayStart: Date): EventWithLayout[] {
  // Filter out all-day events - they're shown separately
  const dayEvents = events.filter(e => {
    if (e.allDay) return false;
    const start = new Date(e.startTime);
    return isSameDay(start, dayStart);
  });

  // Sort by start time, then by duration (longer first)
  dayEvents.sort((a, b) => {
    const startDiff = a.startTime - b.startTime;
    if (startDiff !== 0) return startDiff;
    const aDuration = a.endTime - a.startTime;
    const bDuration = b.endTime - b.startTime;
    return bDuration - aDuration;
  });

  const columns: CalendarEvent[][] = [];

  for (const event of dayEvents) {
    const eventStart = event.startTime;

    // Find first column where this event fits
    let placed = false;
    for (let i = 0; i < columns.length; i++) {
      const lastInColumn = columns[i][columns[i].length - 1];
      const lastEnd = lastInColumn.endTime;
      if (eventStart >= lastEnd) {
        columns[i].push(event);
        placed = true;
        break;
      }
    }

    if (!placed) {
      columns.push([event]);
    }
  }

  // Calculate width and position for each event
  const result: EventWithLayout[] = [];
  const numColumns = columns.length;

  for (let colIndex = 0; colIndex < columns.length; colIndex++) {
    for (const event of columns[colIndex]) {
      result.push({
        ...event,
        width: numColumns > 0 ? 100 / numColumns : 100,
        left: numColumns > 0 ? (colIndex / numColumns) * 100 : 0,
        zIndex: colIndex + 1,
      });
    }
  }

  return result;
}
