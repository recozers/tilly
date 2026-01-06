import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

/**
 * Create a new meeting request
 */
export const create = mutation({
  args: {
    friendId: v.id("users"),
    title: v.string(),
    message: v.optional(v.string()),
    durationMinutes: v.number(),
    proposedTimes: v.array(
      v.object({
        start: v.number(),
        end: v.optional(v.number()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    // Verify they are friends
    const friendship = await ctx.db
      .query("friendships")
      .withIndex("by_pair", (q) =>
        q.eq("userId", userId).eq("friendId", args.friendId)
      )
      .first();

    if (!friendship || friendship.status !== "accepted") {
      throw new Error("You can only request meetings with friends");
    }

    const requestId = await ctx.db.insert("meetingRequests", {
      requesterId: userId,
      friendId: args.friendId,
      title: args.title,
      message: args.message,
      durationMinutes: args.durationMinutes,
      proposedTimes: args.proposedTimes,
      status: "pending",
    });

    return await ctx.db.get(requestId);
  },
});

/**
 * Respond to a meeting request (accept or decline)
 */
export const respond = mutation({
  args: {
    id: v.id("meetingRequests"),
    accept: v.boolean(),
    selectedTime: v.optional(
      v.object({
        start: v.number(),
        end: v.optional(v.number()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const request = await ctx.db.get(args.id);
    if (!request || request.friendId !== userId) {
      throw new Error("Meeting request not found");
    }

    if (request.status !== "pending") {
      throw new Error("Meeting request already processed");
    }

    if (args.accept) {
      if (!args.selectedTime) {
        throw new Error("Must select a time when accepting");
      }

      // Update the request
      await ctx.db.patch(args.id, {
        status: "accepted",
        selectedTime: args.selectedTime,
      });

      // Create events for both users
      const endTime =
        args.selectedTime.end ??
        args.selectedTime.start + request.durationMinutes * 60 * 1000;

      // Event for the requester
      await ctx.db.insert("events", {
        userId: request.requesterId,
        title: request.title,
        startTime: args.selectedTime.start,
        endTime,
        color: "#4A7C2A",
        description: request.message,
        meetingRequestId: args.id,
      });

      // Event for the friend (accepter)
      await ctx.db.insert("events", {
        userId,
        title: request.title,
        startTime: args.selectedTime.start,
        endTime,
        color: "#4A7C2A",
        description: request.message,
        meetingRequestId: args.id,
      });

      return { success: true, status: "accepted" };
    } else {
      await ctx.db.patch(args.id, { status: "declined" });
      return { success: true, status: "declined" };
    }
  },
});

/**
 * Cancel a meeting request (only by requester)
 */
export const cancel = mutation({
  args: { id: v.id("meetingRequests") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const request = await ctx.db.get(args.id);
    if (!request || request.requesterId !== userId) {
      throw new Error("Meeting request not found");
    }

    if (request.status !== "pending") {
      throw new Error("Can only cancel pending requests");
    }

    await ctx.db.patch(args.id, { status: "cancelled" });
    return { success: true };
  },
});
