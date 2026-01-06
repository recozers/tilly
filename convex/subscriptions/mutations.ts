import { mutation, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

/**
 * Create a new calendar subscription
 */
export const create = mutation({
  args: {
    name: v.string(),
    url: v.string(),
    color: v.string(),
    autoSync: v.optional(v.boolean()),
    syncIntervalMinutes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    // Check for duplicate URL
    const existing = await ctx.db
      .query("calendarSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("url"), args.url))
      .first();

    if (existing) {
      throw new Error("A subscription with this URL already exists");
    }

    const subscriptionId = await ctx.db.insert("calendarSubscriptions", {
      userId,
      name: args.name,
      url: args.url,
      color: args.color,
      autoSync: args.autoSync ?? true,
      syncIntervalMinutes: args.syncIntervalMinutes ?? 60,
    });

    return await ctx.db.get(subscriptionId);
  },
});

/**
 * Update a calendar subscription
 */
export const update = mutation({
  args: {
    id: v.id("calendarSubscriptions"),
    name: v.optional(v.string()),
    color: v.optional(v.string()),
    autoSync: v.optional(v.boolean()),
    syncIntervalMinutes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const subscription = await ctx.db.get(args.id);
    if (!subscription || subscription.userId !== userId) {
      throw new Error("Subscription not found");
    }

    const updates: Partial<{
      name: string;
      color: string;
      autoSync: boolean;
      syncIntervalMinutes: number;
    }> = {};

    if (args.name !== undefined) updates.name = args.name;
    if (args.color !== undefined) updates.color = args.color;
    if (args.autoSync !== undefined) updates.autoSync = args.autoSync;
    if (args.syncIntervalMinutes !== undefined)
      updates.syncIntervalMinutes = args.syncIntervalMinutes;

    await ctx.db.patch(args.id, updates);
    return await ctx.db.get(args.id);
  },
});

/**
 * Delete a calendar subscription and its events
 */
export const remove = mutation({
  args: { id: v.id("calendarSubscriptions") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const subscription = await ctx.db.get(args.id);
    if (!subscription || subscription.userId !== userId) {
      throw new Error("Subscription not found");
    }

    // Delete all events from this subscription
    const events = await ctx.db
      .query("events")
      .withIndex("by_source", (q) =>
        q.eq("userId", userId).eq("sourceCalendarId", args.id)
      )
      .collect();

    for (const event of events) {
      await ctx.db.delete(event._id);
    }

    // Delete the subscription
    await ctx.db.delete(args.id);
    return { success: true };
  },
});

/**
 * Update sync status (internal mutation for sync process)
 */
export const updateSyncStatus = internalMutation({
  args: {
    id: v.id("calendarSubscriptions"),
    success: v.boolean(),
    error: v.optional(v.string()),
    etag: v.optional(v.string()),
    lastModified: v.optional(v.string()),
    eventsAdded: v.optional(v.number()),
    eventsUpdated: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const updates: Partial<{
      lastSyncAt: number;
      lastSyncError: string | undefined;
      etag: string | undefined;
      lastModified: string | undefined;
    }> = {
      lastSyncAt: Date.now(),
    };

    if (args.success) {
      updates.lastSyncError = undefined;
      if (args.etag) updates.etag = args.etag;
      if (args.lastModified) updates.lastModified = args.lastModified;
    } else {
      updates.lastSyncError = args.error;
    }

    await ctx.db.patch(args.id, updates);
  },
});
