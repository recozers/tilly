import { mutation, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

/**
 * Generate a secure random token
 */
function generateToken(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

/**
 * Create a new feed token
 */
export const create = mutation({
  args: {
    name: v.string(),
    includePrivate: v.optional(v.boolean()),
    expiresInDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const token = generateToken();
    const expiresAt = args.expiresInDays
      ? Date.now() + args.expiresInDays * 24 * 60 * 60 * 1000
      : undefined;

    const tokenId = await ctx.db.insert("calendarFeedTokens", {
      userId,
      token,
      name: args.name,
      isActive: true,
      includePrivate: args.includePrivate ?? false,
      accessCount: 0,
      expiresAt,
    });

    // Return the token only on creation (won't be shown again)
    return {
      _id: tokenId,
      token,
      name: args.name,
      expiresAt,
    };
  },
});

/**
 * Revoke (soft-delete) a feed token
 */
export const revoke = mutation({
  args: { id: v.id("calendarFeedTokens") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const feedToken = await ctx.db.get(args.id);
    if (!feedToken || feedToken.userId !== userId) {
      throw new Error("Token not found");
    }

    await ctx.db.patch(args.id, { isActive: false });
    return { success: true };
  },
});

/**
 * Permanently delete a feed token
 */
export const remove = mutation({
  args: { id: v.id("calendarFeedTokens") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const feedToken = await ctx.db.get(args.id);
    if (!feedToken || feedToken.userId !== userId) {
      throw new Error("Token not found");
    }

    await ctx.db.delete(args.id);
    return { success: true };
  },
});

/**
 * Record access to a feed token (internal mutation)
 */
export const recordAccess = internalMutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const feedToken = await ctx.db
      .query("calendarFeedTokens")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (!feedToken) {
      return;
    }

    await ctx.db.patch(feedToken._id, {
      lastAccessedAt: Date.now(),
      accessCount: feedToken.accessCount + 1,
    });
  },
});
