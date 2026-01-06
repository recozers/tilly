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
 */
function parseICalDate(dateStr: string): { date: Date; isAllDay: boolean } {
  const cleanStr = dateStr.replace(/^TZID=[^:]+:/, "");

  if (/^\d{8}$/.test(cleanStr)) {
    const year = parseInt(cleanStr.slice(0, 4));
    const month = parseInt(cleanStr.slice(4, 6)) - 1;
    const day = parseInt(cleanStr.slice(6, 8));
    return { date: new Date(year, month, day), isAllDay: true };
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
        const event: ParsedEvent = {
          uid:
            currentEvent.uid ||
            `imported-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          title: currentEvent.title || "Untitled Event",
          start: currentEvent.start,
          end:
            currentEvent.end ||
            (currentEvent.isAllDay
              ? new Date(currentEvent.start.getTime() + 24 * 60 * 60 * 1000)
              : new Date(currentEvent.start.getTime() + 60 * 60 * 1000)),
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
  }>
): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Tilly//Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Tilly Calendar",
  ];

  for (const event of events) {
    const uid = event.sourceEventUid || `tilly-${event._id}@tilly.app`;
    const isAllDay = event.allDay || false;

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${formatICalDate(new Date())}`);
    lines.push(`DTSTART${isAllDay ? ";VALUE=DATE" : ""}:${formatICalDate(new Date(event.startTime), isAllDay)}`);
    lines.push(`DTEND${isAllDay ? ";VALUE=DATE" : ""}:${formatICalDate(new Date(event.endTime), isAllDay)}`);
    lines.push(`SUMMARY:${escapeICalText(event.title)}`);

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

    // Record access
    await ctx.runMutation(internal.feeds.mutations.recordAccess, { token });

    // Get user's events
    const events = await ctx.runQuery(api.events.queries.listForExport, {});

    const icalData = generateICalData(events);

    return new Response(icalData, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `inline; filename="${feedToken.name}.ics"`,
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(message, { status: 500 });
  }
});
