import { query, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

/**
 * List all events for the current user within a date range
 */
export const list = query({
  args: {
    startTime: v.optional(v.number()),
    endTime: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    // Default to 6 months before/after now
    const now = Date.now();
    const sixMonths = 6 * 30 * 24 * 60 * 60 * 1000;
    const startTime = args.startTime ?? now - sixMonths;
    const endTime = args.endTime ?? now + sixMonths;

    const events = await ctx.db
      .query("events")
      .withIndex("by_user_and_time", (q) =>
        q.eq("userId", userId).gte("startTime", startTime).lte("startTime", endTime)
      )
      .collect();

    return events.map((event) => ({
      ...event,
      type: "event" as const,
    }));
  },
});

/**
 * Get a single event by ID
 */
export const getById = query({
  args: { id: v.id("events") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }

    const event = await ctx.db.get(args.id);
    if (!event || event.userId !== userId) {
      return null;
    }

    return event;
  },
});

/**
 * Get events by date range
 */
export const getByRange = query({
  args: {
    startTime: v.number(),
    endTime: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    const events = await ctx.db
      .query("events")
      .withIndex("by_user_and_time", (q) =>
        q
          .eq("userId", userId)
          .gte("startTime", args.startTime)
          .lte("startTime", args.endTime)
      )
      .collect();

    return events.map((event) => ({
      ...event,
      type: "event" as const,
    }));
  },
});

/**
 * Get upcoming events (next N days)
 */
export const getUpcoming = query({
  args: { days: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    const now = Date.now();
    const daysMs = (args.days ?? 7) * 24 * 60 * 60 * 1000;
    const endTime = now + daysMs;

    const events = await ctx.db
      .query("events")
      .withIndex("by_user_and_time", (q) =>
        q.eq("userId", userId).gte("startTime", now).lte("startTime", endTime)
      )
      .collect();

    return events;
  },
});

/**
 * Search events by title
 */
export const search = query({
  args: { query: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    const events = await ctx.db
      .query("events")
      .withSearchIndex("search_title", (q) =>
        q.search("title", args.query).eq("userId", userId)
      )
      .take(50);

    return events;
  },
});

/**
 * Check for time conflicts
 */
export const checkConflicts = query({
  args: {
    startTime: v.number(),
    endTime: v.number(),
    excludeEventId: v.optional(v.id("events")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return { hasConflicts: false, conflicts: [] };
    }

    // Get all events that could potentially conflict
    // An event conflicts if it starts before our end AND ends after our start
    const allUserEvents = await ctx.db
      .query("events")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const conflicts = allUserEvents.filter((event) => {
      if (args.excludeEventId && event._id === args.excludeEventId) {
        return false;
      }
      // Overlap check: event.start < args.end AND event.end > args.start
      return event.startTime < args.endTime && event.endTime > args.startTime;
    });

    return {
      hasConflicts: conflicts.length > 0,
      conflicts,
    };
  },
});

/**
 * Get events by source calendar (subscription)
 */
export const getBySourceCalendar = query({
  args: { sourceCalendarId: v.id("calendarSubscriptions") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    const events = await ctx.db
      .query("events")
      .withIndex("by_source", (q) =>
        q.eq("userId", userId).eq("sourceCalendarId", args.sourceCalendarId)
      )
      .collect();

    return events;
  },
});

/**
 * Get events for export (used by iCal export)
 */
export const listForExport = query({
  args: {
    startTime: v.optional(v.number()),
    endTime: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    let eventsQuery = ctx.db
      .query("events")
      .withIndex("by_user", (q) => q.eq("userId", userId));

    const events = await eventsQuery.collect();

    // Filter by date range if provided
    if (args.startTime || args.endTime) {
      return events.filter((event) => {
        if (args.startTime && event.startTime < args.startTime) return false;
        if (args.endTime && event.startTime > args.endTime) return false;
        return true;
      });
    }

    return events;
  },
});

/**
 * Internal query to get events for a specific user (used by public feed)
 */
export const listForUser = internalQuery({
  args: {
    userId: v.id("users"),
    includePrivate: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query("events")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    // If includePrivate is false, filter out private events or mark them as "Busy"
    // For now, return all events (includePrivate handling can be added later)
    return events;
  },
});
