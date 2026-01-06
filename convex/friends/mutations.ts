import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

/**
 * Send a friend request
 */
export const sendRequest = mutation({
  args: { receiverEmail: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    // Find receiver by email
    const receiver = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("email"), args.receiverEmail))
      .first();

    if (!receiver) {
      throw new Error("User not found");
    }

    if (receiver._id === userId) {
      throw new Error("Cannot send friend request to yourself");
    }

    // Check if already friends
    const existingFriendship = await ctx.db
      .query("friendships")
      .withIndex("by_pair", (q) =>
        q.eq("userId", userId).eq("friendId", receiver._id)
      )
      .first();

    if (existingFriendship) {
      throw new Error("Already friends or request pending");
    }

    // Check if request already exists
    const existingRequest = await ctx.db
      .query("friendRequests")
      .withIndex("by_sender", (q) => q.eq("senderId", userId))
      .filter((q) => q.eq(q.field("receiverId"), receiver._id))
      .first();

    if (existingRequest) {
      throw new Error("Friend request already sent");
    }

    // Check if they sent us a request (auto-accept)
    const reverseRequest = await ctx.db
      .query("friendRequests")
      .withIndex("by_sender", (q) => q.eq("senderId", receiver._id))
      .filter((q) =>
        q.and(
          q.eq(q.field("receiverId"), userId),
          q.eq(q.field("status"), "pending")
        )
      )
      .first();

    if (reverseRequest) {
      // Auto-accept the reverse request
      await ctx.db.patch(reverseRequest._id, { status: "accepted" });

      // Create bidirectional friendships
      await ctx.db.insert("friendships", {
        userId,
        friendId: receiver._id,
        status: "accepted",
      });
      await ctx.db.insert("friendships", {
        userId: receiver._id,
        friendId: userId,
        status: "accepted",
      });

      return { autoAccepted: true };
    }

    // Create new friend request
    const requestId = await ctx.db.insert("friendRequests", {
      senderId: userId,
      receiverId: receiver._id,
      status: "pending",
    });

    return { requestId, autoAccepted: false };
  },
});

/**
 * Accept a friend request
 */
export const acceptRequest = mutation({
  args: { requestId: v.id("friendRequests") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const request = await ctx.db.get(args.requestId);
    if (!request || request.receiverId !== userId) {
      throw new Error("Request not found");
    }

    if (request.status !== "pending") {
      throw new Error("Request already processed");
    }

    // Update request status
    await ctx.db.patch(args.requestId, { status: "accepted" });

    // Create bidirectional friendships
    await ctx.db.insert("friendships", {
      userId,
      friendId: request.senderId,
      status: "accepted",
    });
    await ctx.db.insert("friendships", {
      userId: request.senderId,
      friendId: userId,
      status: "accepted",
    });

    return { success: true };
  },
});

/**
 * Decline a friend request
 */
export const declineRequest = mutation({
  args: { requestId: v.id("friendRequests") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const request = await ctx.db.get(args.requestId);
    if (!request || request.receiverId !== userId) {
      throw new Error("Request not found");
    }

    await ctx.db.patch(args.requestId, { status: "declined" });
    return { success: true };
  },
});

/**
 * Remove a friend
 */
export const removeFriend = mutation({
  args: { friendId: v.id("users") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    // Delete both directions of the friendship
    const friendship1 = await ctx.db
      .query("friendships")
      .withIndex("by_pair", (q) =>
        q.eq("userId", userId).eq("friendId", args.friendId)
      )
      .first();

    const friendship2 = await ctx.db
      .query("friendships")
      .withIndex("by_pair", (q) =>
        q.eq("userId", args.friendId).eq("friendId", userId)
      )
      .first();

    if (friendship1) await ctx.db.delete(friendship1._id);
    if (friendship2) await ctx.db.delete(friendship2._id);

    return { success: true };
  },
});

/**
 * Block a user
 */
export const blockUser = mutation({
  args: { blockedId: v.id("users") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    // Remove existing friendship if any
    const existingFriendship = await ctx.db
      .query("friendships")
      .withIndex("by_pair", (q) =>
        q.eq("userId", userId).eq("friendId", args.blockedId)
      )
      .first();

    if (existingFriendship) {
      await ctx.db.patch(existingFriendship._id, { status: "blocked" });
    } else {
      await ctx.db.insert("friendships", {
        userId,
        friendId: args.blockedId,
        status: "blocked",
      });
    }

    // Also remove the reverse friendship
    const reverseFriendship = await ctx.db
      .query("friendships")
      .withIndex("by_pair", (q) =>
        q.eq("userId", args.blockedId).eq("friendId", userId)
      )
      .first();

    if (reverseFriendship) {
      await ctx.db.delete(reverseFriendship._id);
    }

    return { success: true };
  },
});
