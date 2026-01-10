import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { parseICalData } from "../ical/parser";

/**
 * Background sync action - runs via cron job
 */
export const runBackgroundSync = internalAction({
  args: {},
  handler: async (ctx) => {
    // Get subscriptions due for sync
    const subscriptions = await ctx.runQuery(
      internal.subscriptions.queries.getDueForSync
    );

    console.log(`Syncing ${subscriptions.length} subscriptions`);

    for (const sub of subscriptions) {
      try {
        // Fetch the iCal data
        const response = await fetch(sub.url, {
          headers: {
            Accept: "text/calendar, application/calendar+xml, application/ics",
            ...(sub.etag && { "If-None-Match": sub.etag }),
          },
        });

        // Not modified - nothing to do
        if (response.status === 304) {
          await ctx.runMutation(
            internal.subscriptions.mutations.updateSyncStatus,
            {
              id: sub._id,
              success: true,
              eventsAdded: 0,
              eventsUpdated: 0,
            }
          );
          continue;
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const icalData = await response.text();
        const parsedEvents = parseICalData(icalData);

        // Upsert events
        const result = await ctx.runMutation(
          internal.events.mutations.upsertFromSubscription,
          {
            subscriptionId: sub._id,
            userId: sub.userId,
            events: parsedEvents.map((e) => ({
              title: e.title,
              startTime: e.start.getTime(),
              endTime: e.end.getTime(),
              uid: e.uid,
              rrule: e.rrule,
              description: e.description,
              location: e.location,
              allDay: e.allDay,
              color: sub.color,
            })),
          }
        );

        // Remove events no longer in the feed
        const currentUids = parsedEvents.map((e) => e.uid);
        await ctx.runMutation(
          internal.events.mutations.removeDeletedFromSubscription,
          {
            subscriptionId: sub._id,
            userId: sub.userId,
            currentUids,
          }
        );

        // Update sync status
        await ctx.runMutation(
          internal.subscriptions.mutations.updateSyncStatus,
          {
            id: sub._id,
            success: true,
            etag: response.headers.get("etag") ?? undefined,
            lastModified: response.headers.get("last-modified") ?? undefined,
            eventsAdded: result.added,
            eventsUpdated: result.updated,
          }
        );

        console.log(
          `Synced subscription ${sub.name}: +${result.added} ~${result.updated}`
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        console.error(`Failed to sync subscription ${sub.name}: ${errorMessage}`);

        await ctx.runMutation(
          internal.subscriptions.mutations.updateSyncStatus,
          {
            id: sub._id,
            success: false,
            error: errorMessage,
          }
        );
      }
    }
  },
});

/**
 * Sync a single subscription (triggered by user)
 */
export const syncOne = internalAction({
  args: {
    subscriptionId: v.id("calendarSubscriptions"),
  },
  handler: async (ctx, args): Promise<{ success: boolean; eventsAdded?: number; eventsUpdated?: number; eventsDeleted?: number; error?: string }> => {
    const sub = await ctx.runQuery(internal.subscriptions.queries.getByIdInternal, {
      id: args.subscriptionId,
    });

    if (!sub) {
      throw new Error("Subscription not found");
    }

    try {
      const response = await fetch(sub.url, {
        headers: {
          Accept: "text/calendar, application/calendar+xml, application/ics",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const icalData = await response.text();
      const parsedEvents = parseICalData(icalData);

      const result = await ctx.runMutation(
        internal.events.mutations.upsertFromSubscription,
        {
          subscriptionId: sub._id,
          userId: sub.userId,
          events: parsedEvents.map((e) => ({
            title: e.title,
            startTime: e.start.getTime(),
            endTime: e.end.getTime(),
            uid: e.uid,
            rrule: e.rrule,
            description: e.description,
            location: e.location,
            allDay: e.allDay,
            color: sub.color,
          })),
        }
      );

      const currentUids = parsedEvents.map((e) => e.uid);
      const deleteResult = await ctx.runMutation(
        internal.events.mutations.removeDeletedFromSubscription,
        {
          subscriptionId: sub._id,
          userId: sub.userId,
          currentUids,
        }
      );

      await ctx.runMutation(internal.subscriptions.mutations.updateSyncStatus, {
        id: sub._id,
        success: true,
        etag: response.headers.get("etag") ?? undefined,
        lastModified: response.headers.get("last-modified") ?? undefined,
        eventsAdded: result.added,
        eventsUpdated: result.updated,
      });

      return {
        success: true,
        eventsAdded: result.added,
        eventsUpdated: result.updated,
        eventsDeleted: deleteResult.deleted,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      await ctx.runMutation(internal.subscriptions.mutations.updateSyncStatus, {
        id: sub._id,
        success: false,
        error: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  },
});
