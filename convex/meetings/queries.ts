import { query } from "../_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

/**
 * Get meeting requests received by the current user
 */
export const getReceived = query({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    let requestsQuery = ctx.db
      .query("meetingRequests")
      .withIndex("by_friend", (q) => {
        if (args.status) {
          return q
            .eq("friendId", userId)
            .eq(
              "status",
              args.status as "pending" | "accepted" | "declined" | "cancelled"
            );
        }
        return q.eq("friendId", userId);
      });

    const requests = await requestsQuery.collect();

    // Get requester details
    const requestsWithRequester = await Promise.all(
      requests.map(async (r) => {
        const requester = await ctx.db.get(r.requesterId);
        return {
          ...r,
          requesterEmail: requester?.email,
          requesterName: requester?.name,
        };
      })
    );

    return requestsWithRequester;
  },
});

/**
 * Get meeting requests sent by the current user
 */
export const getSent = query({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    let requests = await ctx.db
      .query("meetingRequests")
      .withIndex("by_requester", (q) => q.eq("requesterId", userId))
      .collect();

    if (args.status) {
      requests = requests.filter((r) => r.status === args.status);
    }

    // Get friend details
    const requestsWithFriend = await Promise.all(
      requests.map(async (r) => {
        const friend = await ctx.db.get(r.friendId);
        return {
          ...r,
          friendEmail: friend?.email,
          friendName: friend?.name,
        };
      })
    );

    return requestsWithFriend;
  },
});

/**
 * Get a single meeting request by ID
 */
export const getById = query({
  args: { id: v.id("meetingRequests") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }

    const request = await ctx.db.get(args.id);
    if (!request) {
      return null;
    }

    // Only allow access if user is requester or friend
    if (request.requesterId !== userId && request.friendId !== userId) {
      return null;
    }

    // Get both user details
    const requester = await ctx.db.get(request.requesterId);
    const friend = await ctx.db.get(request.friendId);

    return {
      ...request,
      requesterEmail: requester?.email,
      requesterName: requester?.name,
      friendEmail: friend?.email,
      friendName: friend?.name,
    };
  },
});

/**
 * Get all pending meeting requests for calendar display
 */
export const getPendingForCalendar = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    // Get received pending requests
    const received = await ctx.db
      .query("meetingRequests")
      .withIndex("by_friend", (q) => q.eq("friendId", userId).eq("status", "pending"))
      .collect();

    // Get sent pending requests
    const sent = await ctx.db
      .query("meetingRequests")
      .withIndex("by_requester", (q) => q.eq("requesterId", userId))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();

    // Mark which are received vs sent
    const allPending = [
      ...received.map((r) => ({ ...r, isReceived: true })),
      ...sent.map((r) => ({ ...r, isReceived: false })),
    ];

    return allPending;
  },
});
