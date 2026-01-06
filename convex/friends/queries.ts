import { query } from "../_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

/**
 * Get all accepted friends for the current user
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
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
        return {
          friendshipId: f._id,
          friendId: f.friendId,
          email: friend?.email,
          name: friend?.name,
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
    const userId = await getAuthUserId(ctx);
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
 * Get sent friend requests by the current user
 */
export const getSentRequests = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    const requests = await ctx.db
      .query("friendRequests")
      .withIndex("by_sender", (q) => q.eq("senderId", userId))
      .collect();

    // Get receiver details
    const requestsWithReceiver = await Promise.all(
      requests.map(async (r) => {
        const receiver = await ctx.db.get(r.receiverId);
        return {
          _id: r._id,
          receiverId: r.receiverId,
          receiverEmail: receiver?.email,
          receiverName: receiver?.name,
          status: r.status,
          _creationTime: r._creationTime,
        };
      })
    );

    return requestsWithReceiver;
  },
});
