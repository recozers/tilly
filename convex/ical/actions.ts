import { httpAction } from "../_generated/server";
import { api, internal } from "../_generated/api";

interface ParsedEvent {
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
function parseICalDate(dateStr: string): { date: Date; isAllDay: boolean } {
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
 */
function unfoldIcalLines(icalData: string): string[] {
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
function parseICalData(icalData: string): ParsedEvent[] {
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
 * Format date for iCal
 */
function formatICalDate(date: Date, isAllDay: boolean = false): string {
  if (isAllDay) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
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
 * Generate RFC 7986 compliant UID (deterministic from event ID)
 * Format: hex-encoded with domain suffix for global uniqueness
 */
function generateUID(eventId: string, domain: string = "tilly.app"): string {
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
function computeETag(events: Array<{ _id: string; startTime: number; endTime: number; title: string }>): string {
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
function getLastModified(events: Array<{ startTime: number; endTime: number }>): Date {
  if (events.length === 0) return new Date();
  // Use the latest event time as a proxy for last modified
  const maxTime = Math.max(...events.map(e => Math.max(e.startTime, e.endTime)));
  return new Date(Math.max(maxTime, Date.now() - 86400000)); // At least within last day
}

/**
 * Escape iCal text
 */
function escapeICalText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

/**
 * Generate iCal data from events
 * Follows RFC 5545 (iCalendar) and RFC 7986 (extensions)
 */
function generateICalData(
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
    lines.push(`DTSTART${isAllDay ? ";VALUE=DATE" : ""}:${formatICalDate(new Date(event.startTime), isAllDay)}`);
    lines.push(`DTEND${isAllDay ? ";VALUE=DATE" : ""}:${formatICalDate(new Date(event.endTime), isAllDay)}`);
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

/**
 * Import iCal file
 */
export const importIcal = httpAction(async (ctx, request) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const contentType = request.headers.get("content-type") || "";

    let icalData: string;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File;
      if (!file) {
        return new Response(JSON.stringify({ error: "No file provided" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      icalData = await file.text();
    } else {
      const body = await request.json();
      icalData = body.icalData;
    }

    if (!icalData) {
      return new Response(JSON.stringify({ error: "No iCal data provided" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const parsedEvents = parseICalData(icalData);

    const result = await ctx.runMutation(api.events.mutations.importBatch, {
      events: parsedEvents.map((e) => ({
        title: e.title,
        startTime: e.start.getTime(),
        endTime: e.end.getTime(),
        description: e.description,
        location: e.location,
        sourceEventUid: e.uid,
        rrule: e.rrule,
        allDay: e.allDay,
      })),
    });

    return new Response(
      JSON.stringify({
        success: true,
        imported: result.imported,
        skipped: result.skipped,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

/**
 * Export calendar to iCal
 */
export const exportIcal = httpAction(async (ctx, request) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const url = new URL(request.url);
    const startTime = url.searchParams.get("start");
    const endTime = url.searchParams.get("end");

    const events = await ctx.runQuery(api.events.queries.listForExport, {
      startTime: startTime ? new Date(startTime).getTime() : undefined,
      endTime: endTime ? new Date(endTime).getTime() : undefined,
    });

    const icalData = generateICalData(events);

    return new Response(icalData, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": "attachment; filename=tilly-calendar.ics",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

/**
 * Public feed endpoint (no auth required)
 * Implements proper HTTP caching per RFC 7232 (Conditional Requests)
 * - ETag for content-based validation
 * - If-None-Match for conditional GET
 * - Last-Modified / If-Modified-Since for time-based validation
 * - Proper Cache-Control for feed subscribers
 */
export const publicFeed = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const pathParts = url.pathname.split("/");
  const token = pathParts[pathParts.length - 1];

  if (!token) {
    return new Response("Invalid token", { status: 400 });
  }

  try {
    const feedToken = await ctx.runQuery(internal.feeds.queries.getByToken, {
      token,
    });

    if (!feedToken) {
      return new Response("Invalid or expired token", { status: 404 });
    }

    // Get user's events
    const events = await ctx.runQuery(api.events.queries.listForExport, {});

    // Compute ETag from events data for cache validation
    const etag = computeETag(events);
    const lastModified = getLastModified(events);
    const lastModifiedStr = lastModified.toUTCString();

    // Check If-None-Match header (ETag-based caching)
    const clientEtag = request.headers.get("If-None-Match");
    if (clientEtag && clientEtag === etag) {
      // Content hasn't changed - return 304 Not Modified
      // This saves bandwidth, especially for calendar apps that poll frequently
      return new Response(null, {
        status: 304,
        headers: {
          "ETag": etag,
          "Last-Modified": lastModifiedStr,
          "Cache-Control": "private, must-revalidate, max-age=300",
        },
      });
    }

    // Check If-Modified-Since header (time-based caching)
    const ifModifiedSince = request.headers.get("If-Modified-Since");
    if (ifModifiedSince) {
      const clientDate = new Date(ifModifiedSince);
      if (lastModified <= clientDate) {
        return new Response(null, {
          status: 304,
          headers: {
            "ETag": etag,
            "Last-Modified": lastModifiedStr,
            "Cache-Control": "private, must-revalidate, max-age=300",
          },
        });
      }
    }

    // Record access (only for full fetches, not 304s)
    await ctx.runMutation(internal.feeds.mutations.recordAccess, { token });

    const icalData = generateICalData(events, feedToken.name);

    return new Response(icalData, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `inline; filename="${feedToken.name}.ics"`,
        // Cache headers per best practices for calendar feeds:
        // - private: Only browser/client should cache, not CDNs
        // - must-revalidate: Check with server before using cached copy
        // - max-age=300: Cache for 5 minutes before revalidating
        "Cache-Control": "private, must-revalidate, max-age=300",
        "ETag": etag,
        "Last-Modified": lastModifiedStr,
        // CORS headers for cross-origin calendar subscriptions
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "ETag, Last-Modified",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(message, { status: 500 });
  }
});
