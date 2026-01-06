import { query, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

/**
 * List all calendar subscriptions for the current user
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    const subscriptions = await ctx.db
      .query("calendarSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    return subscriptions;
  },
});

/**
 * Get a single subscription by ID
 */
export const getById = query({
  args: { id: v.id("calendarSubscriptions") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }

    const subscription = await ctx.db.get(args.id);
    if (!subscription || subscription.userId !== userId) {
      return null;
    }

    return subscription;
  },
});

/**
 * Get subscriptions due for sync (internal query for cron job)
 */
export const getDueForSync = internalQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // Get all auto-sync enabled subscriptions
    const subscriptions = await ctx.db
      .query("calendarSubscriptions")
      .withIndex("by_auto_sync", (q) => q.eq("autoSync", true))
      .collect();

    // Filter to those that need syncing
    return subscriptions.filter((sub) => {
      if (!sub.lastSyncAt) return true;
      const intervalMs = sub.syncIntervalMinutes * 60 * 1000;
      return now - sub.lastSyncAt >= intervalMs;
    });
  },
});

/**
 * Get a subscription by ID (internal - no auth check)
 */
export const getByIdInternal = internalQuery({
  args: { id: v.id("calendarSubscriptions") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});
