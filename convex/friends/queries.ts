import { query } from "../_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "../_generated/dataModel";

/**
 * Helper to get user ID with fallback to identity email lookup
 * Also validates that the user actually exists in the database
 */
async function getUserId(ctx: any): Promise<Id<"users"> | null> {
  // Get the identity first - we need this for both approaches
  const identity = await ctx.auth.getUserIdentity();
  console.log("[getUserId] identity:", JSON.stringify(identity));

  if (!identity) {
    console.log("[getUserId] No identity, user not authenticated");
    return null;
  }

  // Try the standard auth method first
  const authUserId = await getAuthUserId(ctx);
  console.log("[getUserId] getAuthUserId returned:", authUserId);

  if (authUserId) {
    // IMPORTANT: Verify this user actually exists in the database
    // The token might contain a stale/phantom user ID
    const user = await ctx.db.get(authUserId);
    if (user) {
      console.log("[getUserId] User exists, returning authUserId");
      return authUserId;
    }
    console.log("[getUserId] WARNING: authUserId does not exist in database!");
  }

  // Fallback: look up user by email from the identity
  if (identity.email) {
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q: any) => q.eq("email", identity.email))
      .first();
    console.log("[getUserId] user lookup by email result:", user?._id);
    if (user) {
      return user._id;
    }
  }

  return null;
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
    const userId = await getUserId(ctx);
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
