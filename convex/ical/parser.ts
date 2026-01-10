/**
 * Shared iCal parsing utilities
 * Used by both import (actions.ts) and subscription sync (sync.ts)
 */

export interface ParsedEvent {
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
 * Parse iCal date string to Date object
 *
 * For all-day events (DATE values without time):
 * - Use UTC midnight to avoid timezone shifting
 * - iCal DTEND for all-day events is EXCLUSIVE (day after event ends)
 */
export function parseICalDate(dateStr: string): { date: Date; isAllDay: boolean } {
  const cleanStr = dateStr.replace(/^TZID=[^:]+:/, "");

  // All-day event: YYYYMMDD format (no time component)
  if (/^\d{8}$/.test(cleanStr)) {
    const year = parseInt(cleanStr.slice(0, 4));
    const month = parseInt(cleanStr.slice(4, 6)) - 1;
    const day = parseInt(cleanStr.slice(6, 8));
    // Use UTC to prevent timezone shifting of all-day events
    return { date: new Date(Date.UTC(year, month, day, 0, 0, 0)), isAllDay: true };
  }

  const match = cleanStr.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (match) {
    const [, year, month, day, hour, min, sec, isUtc] = match;
    if (isUtc) {
      return {
        date: new Date(Date.UTC(
          parseInt(year),
          parseInt(month) - 1,
          parseInt(day),
          parseInt(hour),
          parseInt(min),
          parseInt(sec)
        )),
        isAllDay: false,
      };
    }
    return {
      date: new Date(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day),
        parseInt(hour),
        parseInt(min),
        parseInt(sec)
      ),
      isAllDay: false,
    };
  }

  return { date: new Date(dateStr), isAllDay: false };
}

/**
 * Unfold iCal lines
 * RFC 5545: Lines starting with space/tab are continuations of previous line
 */
export function unfoldIcalLines(icalData: string): string[] {
  return icalData
    .replace(/\r\n[ \t]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((line) => line.trim());
}

/**
 * Parse iCal data into events
 */
export function parseICalData(icalData: string): ParsedEvent[] {
  const events: ParsedEvent[] = [];
  const lines = unfoldIcalLines(icalData);

  let currentEvent: Partial<ParsedEvent> & { isAllDay?: boolean } | null = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      currentEvent = {};
      continue;
    }

    if (line === "END:VEVENT" && currentEvent) {
      if (currentEvent.start) {
        let endDate = currentEvent.end;

        if (currentEvent.isAllDay) {
          // iCal all-day DTEND is EXCLUSIVE (the day after the event ends)
          // For display, we want the end to be 23:59:59 of the LAST day of the event
          if (endDate) {
            // Subtract 1 day from DTEND, then set to end of that day
            const lastDay = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);
            endDate = new Date(Date.UTC(
              lastDay.getUTCFullYear(),
              lastDay.getUTCMonth(),
              lastDay.getUTCDate(),
              23, 59, 59, 999
            ));
          } else {
            // No DTEND provided - single day event, end at 23:59:59 of start day
            endDate = new Date(Date.UTC(
              currentEvent.start.getUTCFullYear(),
              currentEvent.start.getUTCMonth(),
              currentEvent.start.getUTCDate(),
              23, 59, 59, 999
            ));
          }
        } else if (!endDate) {
          // Non-all-day without end: default to 1 hour duration
          endDate = new Date(currentEvent.start.getTime() + 60 * 60 * 1000);
        }

        const event: ParsedEvent = {
          uid:
            currentEvent.uid ||
            `imported-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          title: currentEvent.title || "Untitled Event",
          start: currentEvent.start,
          end: endDate,
          description: currentEvent.description,
          location: currentEvent.location,
          rrule: currentEvent.rrule,
          allDay: currentEvent.isAllDay,
        };
        events.push(event);
      }
      currentEvent = null;
      continue;
    }

    if (!currentEvent) continue;

    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;

    const propPart = line.slice(0, colonIndex);
    const value = line.slice(colonIndex + 1);
    const propName = propPart.split(";")[0].toUpperCase();

    switch (propName) {
      case "UID":
        currentEvent.uid = value;
        break;
      case "SUMMARY":
        currentEvent.title = value;
        break;
      case "DESCRIPTION":
        currentEvent.description = value.replace(/\\n/g, "\n").replace(/\\,/g, ",");
        break;
      case "LOCATION":
        currentEvent.location = value.replace(/\\,/g, ",");
        break;
      case "DTSTART": {
        const { date, isAllDay } = parseICalDate(value);
        currentEvent.start = date;
        currentEvent.isAllDay = isAllDay;
        break;
      }
      case "DTEND": {
        const { date } = parseICalDate(value);
        currentEvent.end = date;
        break;
      }
      case "RRULE":
        currentEvent.rrule = value;
        break;
    }
  }

  return events;
}

/**
 * Format date for iCal export
 * Uses UTC getters for consistent behavior
 */
export function formatICalDate(date: Date, isAllDay: boolean = false): string {
  if (isAllDay) {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    return `${year}${month}${day}`;
  }

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const min = String(date.getUTCMinutes()).padStart(2, "0");
  const sec = String(date.getUTCSeconds()).padStart(2, "0");
  return `${year}${month}${day}T${hour}${min}${sec}Z`;
}

/**
 * Escape iCal text per RFC 5545
 */
export function escapeICalText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

/**
 * Generate RFC 7986 compliant UID (deterministic from event ID)
 * Format: hex-encoded with domain suffix for global uniqueness
 */
export function generateUID(eventId: string, domain: string = "tilly.app"): string {
  // Convert event ID to hex to create a stable, unique identifier
  const hex = eventId.split('').map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
  const padded = hex.padEnd(32, '0').slice(0, 32);
  // Format as UUID-like: 8-4-4-4-12 for RFC compliance
  const uuid = `${padded.slice(0,8)}-${padded.slice(8,12)}-${padded.slice(12,16)}-${padded.slice(16,20)}-${padded.slice(20,32)}`;
  return `${uuid}@${domain}`;
}

/**
 * Compute ETag from events data for caching
 * Per RFC 7232, ETags enable conditional requests to save bandwidth
 */
export function computeETag(events: Array<{ _id: string; startTime: number; endTime: number; title: string }>): string {
  // Create a deterministic hash from event data
  const data = events
    .map(e => `${e._id}:${e.startTime}:${e.endTime}:${e.title}`)
    .sort()
    .join('|');

  // FNV-1a hash for good distribution
  let hash = 2166136261;
  for (let i = 0; i < data.length; i++) {
    hash ^= data.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `"${(hash >>> 0).toString(16)}"`;
}

/**
 * Find the most recent modification timestamp from events
 */
export function getLastModified(events: Array<{ startTime: number; endTime: number }>): Date {
  if (events.length === 0) return new Date();
  // Use the latest event time as a proxy for last modified
  const maxTime = Math.max(...events.map(e => Math.max(e.startTime, e.endTime)));
  return new Date(Math.max(maxTime, Date.now() - 86400000)); // At least within last day
}

/**
 * Generate iCal data from events
 * Follows RFC 5545 (iCalendar) and RFC 7986 (extensions)
 */
export function generateICalData(
  events: Array<{
    _id: string;
    title: string;
    startTime: number;
    endTime: number;
    description?: string;
    location?: string;
    sourceEventUid?: string;
    rrule?: string;
    allDay?: boolean;
  }>,
  calendarName: string = "Tilly Calendar"
): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Tilly//Calendar v1.0//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeICalText(calendarName)}`,
    // RFC 7986: Refresh interval hint for subscribers (1 hour)
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    // Timezone definition for local times
    "BEGIN:VTIMEZONE",
    "TZID:UTC",
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:+0000",
    "TZOFFSETTO:+0000",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];

  for (const event of events) {
    // Use RFC 7986 compliant UID format, or preserve source UID
    const uid = event.sourceEventUid || generateUID(event._id);
    const isAllDay = event.allDay || false;

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${formatICalDate(new Date())}`);
    // SEQUENCE tracks revisions - important for calendar apps to detect changes
    lines.push("SEQUENCE:0");
    // CREATED timestamp - using start time as proxy since we don't track creation
    lines.push(`CREATED:${formatICalDate(new Date(event.startTime))}`);
    // LAST-MODIFIED - calendar apps use this for sync decisions
    lines.push(`LAST-MODIFIED:${formatICalDate(new Date())}`);

    // DTSTART
    lines.push(`DTSTART${isAllDay ? ";VALUE=DATE" : ""}:${formatICalDate(new Date(event.startTime), isAllDay)}`);

    // DTEND - for all-day events, add 1 day because iCal DTEND is exclusive
    if (isAllDay) {
      const endDate = new Date(event.endTime);
      // Move to next day at midnight UTC (exclusive end)
      const exclusiveEnd = new Date(Date.UTC(
        endDate.getUTCFullYear(),
        endDate.getUTCMonth(),
        endDate.getUTCDate() + 1,
        0, 0, 0
      ));
      lines.push(`DTEND;VALUE=DATE:${formatICalDate(exclusiveEnd, true)}`);
    } else {
      lines.push(`DTEND:${formatICalDate(new Date(event.endTime), false)}`);
    }

    lines.push(`SUMMARY:${escapeICalText(event.title)}`);
    // STATUS helps calendar apps understand the event state
    lines.push("STATUS:CONFIRMED");
    // TRANSP indicates if this blocks time (OPAQUE) or not (TRANSPARENT)
    lines.push("TRANSP:OPAQUE");

    if (event.description) {
      lines.push(`DESCRIPTION:${escapeICalText(event.description)}`);
    }
    if (event.location) {
      lines.push(`LOCATION:${escapeICalText(event.location)}`);
    }
    if (event.rrule) {
      lines.push(`RRULE:${event.rrule}`);
    }

    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
