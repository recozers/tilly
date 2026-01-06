import { query, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

/**
 * List all feed tokens for the current user
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    const tokens = await ctx.db
      .query("calendarFeedTokens")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    // Don't return the actual token values for security
    return tokens.map((t) => ({
      _id: t._id,
      _creationTime: t._creationTime,
      name: t.name,
      isActive: t.isActive,
      includePrivate: t.includePrivate,
      lastAccessedAt: t.lastAccessedAt,
      accessCount: t.accessCount,
      expiresAt: t.expiresAt,
      // Only show partial token for identification
      tokenPreview: t.token.slice(0, 8) + "...",
    }));
  },
});

/**
 * Get a feed token by its value (internal, for public feed access)
 */
export const getByToken = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const feedToken = await ctx.db
      .query("calendarFeedTokens")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (!feedToken) {
      return null;
    }

    // Check if expired
    if (feedToken.expiresAt && feedToken.expiresAt < Date.now()) {
      return null;
    }

    // Check if active
    if (!feedToken.isActive) {
      return null;
    }

    return feedToken;
  },
});
