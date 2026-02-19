import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,

  // Calendar events
  events: defineTable({
    userId: v.id("users"),
    title: v.string(),
    startTime: v.number(), // Unix timestamp (ms)
    endTime: v.number(),
    color: v.string(),
    description: v.optional(v.string()),
    location: v.optional(v.string()),
    timezone: v.optional(v.string()), // IANA timezone (e.g., "America/New_York")
    sourceCalendarId: v.optional(v.id("calendarSubscriptions")),
    sourceEventUid: v.optional(v.string()),
    rrule: v.optional(v.string()),
    dtstart: v.optional(v.number()),
    duration: v.optional(v.number()),
    exdates: v.optional(v.array(v.number())), // Excluded occurrence timestamps (ms) for recurring events
    allDay: v.optional(v.boolean()),
    meetingRequestId: v.optional(v.id("meetingRequests")),
    // Reminders: array of minutes before event to remind (e.g., [15, 60] = 15min and 1hr before)
    reminders: v.optional(v.array(v.number())),
    // Track which reminders have been sent
    remindersSent: v.optional(v.array(v.number())),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_time", ["userId", "startTime"])
    .index("by_source", ["userId", "sourceCalendarId"])
    .index("by_source_uid", ["userId", "sourceEventUid"])
    .searchIndex("search_title", {
      searchField: "title",
      filterFields: ["userId"],
    }),

  // Calendar subscriptions (external iCal feeds)
  calendarSubscriptions: defineTable({
    userId: v.id("users"),
    name: v.string(),
    url: v.string(),
    color: v.string(),
    autoSync: v.boolean(),
    syncIntervalMinutes: v.number(),
    lastSyncAt: v.optional(v.number()),
    lastSyncError: v.optional(v.string()),
    etag: v.optional(v.string()),
    lastModified: v.optional(v.string()),
    visible: v.optional(v.boolean()), // Show/hide calendar events (defaults to true)
  })
    .index("by_user", ["userId"])
    .index("by_auto_sync", ["autoSync", "lastSyncAt"]),

  // Calendar feed tokens (for public sharing)
  calendarFeedTokens: defineTable({
    userId: v.id("users"),
    token: v.string(),
    name: v.string(),
    isActive: v.boolean(),
    includePrivate: v.boolean(),
    lastAccessedAt: v.optional(v.number()),
    accessCount: v.number(),
    expiresAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_token", ["token"]),

  // Friendships (bidirectional)
  friendships: defineTable({
    userId: v.id("users"),
    friendId: v.id("users"),
    status: v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("declined"),
      v.literal("blocked")
    ),
  })
    .index("by_user", ["userId"])
    .index("by_friend", ["friendId"])
    .index("by_pair", ["userId", "friendId"]),

  // Friend requests
  friendRequests: defineTable({
    senderId: v.id("users"),
    receiverId: v.id("users"),
    status: v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("declined")
    ),
  })
    .index("by_sender", ["senderId"])
    .index("by_receiver", ["receiverId", "status"]),

  // Meeting requests
  meetingRequests: defineTable({
    requesterId: v.id("users"),
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
    status: v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("declined"),
      v.literal("cancelled")
    ),
    selectedTime: v.optional(
      v.object({
        start: v.number(),
        end: v.optional(v.number()),
      })
    ),
  })
    .index("by_requester", ["requesterId"])
    .index("by_friend", ["friendId", "status"]),
});
