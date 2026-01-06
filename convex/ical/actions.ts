"use node";

import { httpAction } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";

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
 * Parse iCal data into events
 */
async function parseICalData(icalData: string): Promise<ParsedEvent[]> {
  const ICAL = await import("ical.js");
  const events: ParsedEvent[] = [];

  const jcalData = ICAL.default.parse(icalData);
  const comp = new ICAL.default.Component(jcalData);
  const vevents = comp.getAllSubcomponents("vevent");

  for (const vevent of vevents) {
    const event = new ICAL.default.Event(vevent);

    const startDate = event.startDate?.toJSDate();
    const endDate = event.endDate?.toJSDate();

    if (!startDate) continue;

    const isAllDay = event.startDate?.isDate || false;
    const calculatedEnd =
      endDate ||
      (isAllDay
        ? new Date(startDate.getTime() + 24 * 60 * 60 * 1000)
        : new Date(startDate.getTime() + 60 * 60 * 1000));

    let rrule: string | undefined;
    const rruleProp = vevent.getFirstProperty("rrule");
    if (rruleProp) {
      rrule = rruleProp.toICALString();
    }

    events.push({
      uid:
        event.uid ||
        `imported-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      title: event.summary || "Untitled Event",
      start: startDate,
      end: calculatedEnd,
      description: event.description,
      location: event.location,
      rrule,
      allDay: isAllDay,
    });
  }

  return events;
}

/**
 * Generate iCal data from events
 */
async function generateICalData(
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
): Promise<string> {
  const ICAL = await import("ical.js");

  const cal = new ICAL.default.Component(["vcalendar", [], []]);
  cal.updatePropertyWithValue("version", "2.0");
  cal.updatePropertyWithValue("prodid", "-//Tilly//Calendar//EN");
  cal.updatePropertyWithValue("calscale", "GREGORIAN");
  cal.updatePropertyWithValue("method", "PUBLISH");
  cal.updatePropertyWithValue("x-wr-calname", "Tilly Calendar");

  for (const event of events) {
    const vevent = new ICAL.default.Component("vevent");

    const uid = event.sourceEventUid || `tilly-${event._id}@tilly.app`;
    vevent.updatePropertyWithValue("uid", uid);

    const dtstart = ICAL.default.Time.fromJSDate(
      new Date(event.startTime),
      true
    );
    const dtend = ICAL.default.Time.fromJSDate(new Date(event.endTime), true);

    if (event.allDay) {
      dtstart.isDate = true;
      dtend.isDate = true;
    }

    vevent.updatePropertyWithValue("dtstart", dtstart);
    vevent.updatePropertyWithValue("dtend", dtend);
    vevent.updatePropertyWithValue("summary", event.title);

    if (event.description) {
      vevent.updatePropertyWithValue("description", event.description);
    }
    if (event.location) {
      vevent.updatePropertyWithValue("location", event.location);
    }

    if (event.rrule) {
      const rruleProp = ICAL.default.Property.fromString(event.rrule);
      vevent.addProperty(rruleProp);
    }

    const now = ICAL.default.Time.fromJSDate(new Date(), true);
    vevent.updatePropertyWithValue("dtstamp", now);

    cal.addSubcomponent(vevent);
  }

  return cal.toString();
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

    const parsedEvents = await parseICalData(icalData);

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

    const icalData = await generateICalData(events);

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

    const icalData = await generateICalData(events);

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
