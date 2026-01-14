import { query, internalQuery } from "../_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "../_generated/dataModel";
import { v } from "convex/values";

// Internal query to fetch data without auth context filtering
export const _internalGetPendingRequests = internalQuery({
  args: { receiverId: v.id("users") },
  handler: async (ctx, { receiverId }) => {
    const requests = await ctx.db
      .query("friendRequests")
      .withIndex("by_receiver", (q) =>
        q.eq("receiverId", receiverId).eq("status", "pending")
      )
      .collect();

    const requestsWithSender = await Promise.all(
      requests.map(async (r) => {
        const sender = await ctx.db.get(r.senderId);
        return {
          _id: r._id,
          senderId: r.senderId,
          senderEmail: sender?.email,
          senderName: sender?.name,
          status: r.status,
          _creationTime: r._creationTime,
        };
      })
    );

    return requestsWithSender;
  },
});

/**
 * Helper to get user ID from auth context
 */
async function getUserId(ctx: any): Promise<Id<"users"> | null> {
  const userId = await getAuthUserId(ctx);
  return userId;
}

/**
 * Get all accepted friends for the current user
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    if (!userId) {
      return [];
    }

    const friendships = await ctx.db
      .query("friendships")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("status"), "accepted"))
      .collect();

    // Get friend user details
    const friends = await Promise.all(
      friendships.map(async (f) => {
        const friend = await ctx.db.get(f.friendId);
        // Use name if set, otherwise derive from email
        const displayName = friend?.name || (friend?.email ? friend.email.split("@")[0] : undefined);
        return {
          friendshipId: f._id,
          friendId: f.friendId,
          email: friend?.email,
          name: displayName,
          status: f.status,
        };
      })
    );

    return friends;
  },
});

/**
 * Get pending friend requests received by the current user
 */
export const getPendingRequests = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    if (!userId) {
      return [];
    }

    const requests = await ctx.db
      .query("friendRequests")
      .withIndex("by_receiver", (q) =>
        q.eq("receiverId", userId).eq("status", "pending")
      )
      .collect();

    // Get sender details
    const requestsWithSender = await Promise.all(
      requests.map(async (r) => {
        const sender = await ctx.db.get(r.senderId);
        const displayName = sender?.name || (sender?.email ? sender.email.split("@")[0] : undefined);
        return {
          _id: r._id,
          senderId: r.senderId,
          senderEmail: sender?.email,
          senderName: displayName,
          status: r.status,
          _creationTime: r._creationTime,
        };
      })
    );

    return requestsWithSender;
  },
});

/**
 * Get sent friend requests by the current user (only pending ones)
 */
export const getSentRequests = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    if (!userId) {
      return [];
    }

    const requests = await ctx.db
      .query("friendRequests")
      .withIndex("by_sender", (q) => q.eq("senderId", userId))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();

    // Get receiver details
    const requestsWithReceiver = await Promise.all(
      requests.map(async (r) => {
        const receiver = await ctx.db.get(r.receiverId);
        const displayName = receiver?.name || (receiver?.email ? receiver.email.split("@")[0] : undefined);
        return {
          _id: r._id,
          receiverId: r.receiverId,
          receiverEmail: receiver?.email,
          receiverName: displayName,
          status: r.status,
          _creationTime: r._creationTime,
        };
      })
    );

    return requestsWithReceiver;
  },
});
