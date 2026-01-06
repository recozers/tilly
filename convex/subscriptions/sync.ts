import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";

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
 * Parse iCal date string to Date object
 * Handles: YYYYMMDD, YYYYMMDDTHHmmss, YYYYMMDDTHHmmssZ
 */
function parseICalDate(dateStr: string): { date: Date; isAllDay: boolean } {
  // Remove any TZID prefix
  const cleanStr = dateStr.replace(/^TZID=[^:]+:/, "");

  // Check if it's an all-day event (no time component)
  if (/^\d{8}$/.test(cleanStr)) {
    const year = parseInt(cleanStr.slice(0, 4));
    const month = parseInt(cleanStr.slice(4, 6)) - 1;
    const day = parseInt(cleanStr.slice(6, 8));
    return { date: new Date(year, month, day), isAllDay: true };
  }

  // Parse datetime format: YYYYMMDDTHHmmss or YYYYMMDDTHHmmssZ
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

  // Fallback - try Date.parse
  return { date: new Date(dateStr), isAllDay: false };
}

/**
 * Unfold iCal lines (lines starting with space/tab are continuations)
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
 * Parse iCal data without external library
 * This is a simple parser that handles common cases
 */
function parseICalData(icalData: string): ParsedICalEvent[] {
  const events: ParsedICalEvent[] = [];
  const lines = unfoldIcalLines(icalData);

  let currentEvent: Partial<ParsedICalEvent> & { isAllDay?: boolean } | null = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      currentEvent = {};
      continue;
    }

    if (line === "END:VEVENT" && currentEvent) {
      // Validate required fields
      if (currentEvent.start) {
        const event: ParsedICalEvent = {
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

    // Parse property
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;

    const propPart = line.slice(0, colonIndex);
    const value = line.slice(colonIndex + 1);

    // Get property name (before any parameters)
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
 * Background sync action - runs via cron job
 */
export const runBackgroundSync = internalAction({
  args: {},
  handler: async (ctx) => {
    // Get subscriptions due for sync
    const subscriptions = await ctx.runQuery(
      internal.subscriptions.queries.getDueForSync
    );

    console.log(`Syncing ${subscriptions.length} subscriptions`);

    for (const sub of subscriptions) {
      try {
        // Fetch the iCal data
        const response = await fetch(sub.url, {
          headers: {
            Accept: "text/calendar, application/calendar+xml, application/ics",
            ...(sub.etag && { "If-None-Match": sub.etag }),
          },
        });

        // Not modified - nothing to do
        if (response.status === 304) {
          await ctx.runMutation(
            internal.subscriptions.mutations.updateSyncStatus,
            {
              id: sub._id,
              success: true,
              eventsAdded: 0,
              eventsUpdated: 0,
            }
          );
          continue;
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const icalData = await response.text();
        const parsedEvents = parseICalData(icalData);

        // Upsert events
        const result = await ctx.runMutation(
          internal.events.mutations.upsertFromSubscription,
          {
            subscriptionId: sub._id,
            userId: sub.userId,
            events: parsedEvents.map((e) => ({
              title: e.title,
              startTime: e.start.getTime(),
              endTime: e.end.getTime(),
              uid: e.uid,
              rrule: e.rrule,
              description: e.description,
              location: e.location,
              allDay: e.allDay,
              color: sub.color,
            })),
          }
        );

        // Remove events no longer in the feed
        const currentUids = parsedEvents.map((e) => e.uid);
        await ctx.runMutation(
          internal.events.mutations.removeDeletedFromSubscription,
          {
            subscriptionId: sub._id,
            userId: sub.userId,
            currentUids,
          }
        );

        // Update sync status
        await ctx.runMutation(
          internal.subscriptions.mutations.updateSyncStatus,
          {
            id: sub._id,
            success: true,
            etag: response.headers.get("etag") ?? undefined,
            lastModified: response.headers.get("last-modified") ?? undefined,
            eventsAdded: result.added,
            eventsUpdated: result.updated,
          }
        );

        console.log(
          `Synced subscription ${sub.name}: +${result.added} ~${result.updated}`
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        console.error(`Failed to sync subscription ${sub.name}: ${errorMessage}`);

        await ctx.runMutation(
          internal.subscriptions.mutations.updateSyncStatus,
          {
            id: sub._id,
            success: false,
            error: errorMessage,
          }
        );
      }
    }
  },
});

/**
 * Sync a single subscription (triggered by user)
 */
export const syncOne = internalAction({
  args: {
    subscriptionId: v.id("calendarSubscriptions"),
  },
  handler: async (ctx, args): Promise<{ success: boolean; eventsAdded?: number; eventsUpdated?: number; eventsDeleted?: number; error?: string }> => {
    const sub = await ctx.runQuery(internal.subscriptions.queries.getByIdInternal, {
      id: args.subscriptionId,
    });

    if (!sub) {
      throw new Error("Subscription not found");
    }

    try {
      const response = await fetch(sub.url, {
        headers: {
          Accept: "text/calendar, application/calendar+xml, application/ics",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const icalData = await response.text();
      const parsedEvents = parseICalData(icalData);

      const result = await ctx.runMutation(
        internal.events.mutations.upsertFromSubscription,
        {
          subscriptionId: sub._id,
          userId: sub.userId,
          events: parsedEvents.map((e) => ({
            title: e.title,
            startTime: e.start.getTime(),
            endTime: e.end.getTime(),
            uid: e.uid,
            rrule: e.rrule,
            description: e.description,
            location: e.location,
            allDay: e.allDay,
            color: sub.color,
          })),
        }
      );

      const currentUids = parsedEvents.map((e) => e.uid);
      const deleteResult = await ctx.runMutation(
        internal.events.mutations.removeDeletedFromSubscription,
        {
          subscriptionId: sub._id,
          userId: sub.userId,
          currentUids,
        }
      );

      await ctx.runMutation(internal.subscriptions.mutations.updateSyncStatus, {
        id: sub._id,
        success: true,
        etag: response.headers.get("etag") ?? undefined,
        lastModified: response.headers.get("last-modified") ?? undefined,
        eventsAdded: result.added,
        eventsUpdated: result.updated,
      });

      return {
        success: true,
        eventsAdded: result.added,
        eventsUpdated: result.updated,
        eventsDeleted: deleteResult.deleted,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      await ctx.runMutation(internal.subscriptions.mutations.updateSyncStatus, {
        id: sub._id,
        success: false,
        error: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  },
});
