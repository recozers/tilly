import { mutation, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { Id } from "../_generated/dataModel";

// Calendar colors
const CALENDAR_COLORS = ["#4A7C2A", "#F4F1E8"] as const;

function getRandomEventColor(): string {
  return CALENDAR_COLORS[Math.floor(Math.random() * CALENDAR_COLORS.length)];
}

/**
 * Create a new event
 */
export const create = mutation({
  args: {
    title: v.string(),
    startTime: v.number(),
    endTime: v.number(),
    color: v.optional(v.string()),
    description: v.optional(v.string()),
    location: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const eventId = await ctx.db.insert("events", {
      userId,
      title: args.title,
      startTime: args.startTime,
      endTime: args.endTime,
      color: args.color ?? getRandomEventColor(),
      description: args.description,
      location: args.location,
    });

    return await ctx.db.get(eventId);
  },
});

/**
 * Update an existing event
 */
export const update = mutation({
  args: {
    id: v.id("events"),
    title: v.optional(v.string()),
    startTime: v.optional(v.number()),
    endTime: v.optional(v.number()),
    color: v.optional(v.string()),
    description: v.optional(v.string()),
    location: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const event = await ctx.db.get(args.id);
    if (!event || event.userId !== userId) {
      throw new Error("Event not found");
    }

    const updates: Partial<{
      title: string;
      startTime: number;
      endTime: number;
      color: string;
      description: string;
      location: string;
    }> = {};

    if (args.title !== undefined) updates.title = args.title;
    if (args.startTime !== undefined) updates.startTime = args.startTime;
    if (args.endTime !== undefined) updates.endTime = args.endTime;
    if (args.color !== undefined) updates.color = args.color;
    if (args.description !== undefined) updates.description = args.description;
    if (args.location !== undefined) updates.location = args.location;

    await ctx.db.patch(args.id, updates);
    return await ctx.db.get(args.id);
  },
});

/**
 * Delete an event
 */
export const remove = mutation({
  args: { id: v.id("events") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const event = await ctx.db.get(args.id);
    if (!event || event.userId !== userId) {
      throw new Error("Event not found");
    }

    await ctx.db.delete(args.id);
    return { success: true };
  },
});

/**
 * Import batch of events (for iCal import)
 */
export const importBatch = mutation({
  args: {
    events: v.array(
      v.object({
        title: v.string(),
        startTime: v.number(),
        endTime: v.number(),
        description: v.optional(v.string()),
        location: v.optional(v.string()),
        sourceEventUid: v.optional(v.string()),
        rrule: v.optional(v.string()),
        allDay: v.optional(v.boolean()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    let imported = 0;
    let skipped = 0;

    for (const event of args.events) {
      // Check if event with same UID already exists
      if (event.sourceEventUid) {
        const existing = await ctx.db
          .query("events")
          .withIndex("by_source_uid", (q) =>
            q.eq("userId", userId).eq("sourceEventUid", event.sourceEventUid)
          )
          .first();

        if (existing) {
          skipped++;
          continue;
        }
      }

      await ctx.db.insert("events", {
        userId,
        title: event.title,
        startTime: event.startTime,
        endTime: event.endTime,
        color: getRandomEventColor(),
        description: event.description,
        location: event.location,
        sourceEventUid: event.sourceEventUid,
        rrule: event.rrule,
        allDay: event.allDay,
      });
      imported++;
    }

    return { imported, skipped };
  },
});

/**
 * Upsert events from subscription (internal mutation for sync)
 */
export const upsertFromSubscription = internalMutation({
  args: {
    subscriptionId: v.id("calendarSubscriptions"),
    userId: v.id("users"),
    events: v.array(
      v.object({
        title: v.string(),
        startTime: v.number(),
        endTime: v.number(),
        uid: v.string(),
        rrule: v.optional(v.string()),
        color: v.optional(v.string()),
        description: v.optional(v.string()),
        location: v.optional(v.string()),
        allDay: v.optional(v.boolean()),
      })
    ),
  },
  handler: async (ctx, args) => {
    let added = 0;
    let updated = 0;

    for (const event of args.events) {
      const existing = await ctx.db
        .query("events")
        .withIndex("by_source_uid", (q) =>
          q.eq("userId", args.userId).eq("sourceEventUid", event.uid)
        )
        .filter((q) => q.eq(q.field("sourceCalendarId"), args.subscriptionId))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          title: event.title,
          startTime: event.startTime,
          endTime: event.endTime,
          rrule: event.rrule,
          description: event.description,
          location: event.location,
          allDay: event.allDay,
        });
        updated++;
      } else {
        await ctx.db.insert("events", {
          userId: args.userId,
          title: event.title,
          startTime: event.startTime,
          endTime: event.endTime,
          color: event.color ?? getRandomEventColor(),
          sourceCalendarId: args.subscriptionId,
          sourceEventUid: event.uid,
          rrule: event.rrule,
          description: event.description,
          location: event.location,
          allDay: event.allDay,
        });
        added++;
      }
    }

    return { added, updated };
  },
});

/**
 * Remove events from subscription that are no longer in the feed
 */
export const removeDeletedFromSubscription = internalMutation({
  args: {
    subscriptionId: v.id("calendarSubscriptions"),
    userId: v.id("users"),
    currentUids: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query("events")
      .withIndex("by_source", (q) =>
        q.eq("userId", args.userId).eq("sourceCalendarId", args.subscriptionId)
      )
      .collect();

    const uidSet = new Set(args.currentUids);
    let deleted = 0;

    for (const event of events) {
      if (event.sourceEventUid && !uidSet.has(event.sourceEventUid)) {
        await ctx.db.delete(event._id);
        deleted++;
      }
    }

    return { deleted };
  },
});
