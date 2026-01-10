import { httpAction } from "../_generated/server";
import { api, internal } from "../_generated/api";
import {
  parseICalData,
  generateICalData,
  computeETag,
  getLastModified,
} from "./parser";

/**
 * Import iCal file
 */
export const importIcal = httpAction(async (ctx, request) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const contentType = request.headers.get("content-type") || "";

    let icalData: string;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File;
      if (!file) {
        return new Response(JSON.stringify({ error: "No file provided" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      icalData = await file.text();
    } else {
      const body = await request.json();
      icalData = body.icalData;
    }

    if (!icalData) {
      return new Response(JSON.stringify({ error: "No iCal data provided" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const parsedEvents = parseICalData(icalData);

    const result = await ctx.runMutation(api.events.mutations.importBatch, {
      events: parsedEvents.map((e) => ({
        title: e.title,
        startTime: e.start.getTime(),
        endTime: e.end.getTime(),
        description: e.description,
        location: e.location,
        sourceEventUid: e.uid,
        rrule: e.rrule,
        allDay: e.allDay,
      })),
    });

    return new Response(
      JSON.stringify({
        success: true,
        imported: result.imported,
        skipped: result.skipped,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

/**
 * Export calendar to iCal
 */
export const exportIcal = httpAction(async (ctx, request) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const url = new URL(request.url);
    const startTime = url.searchParams.get("start");
    const endTime = url.searchParams.get("end");

    const events = await ctx.runQuery(api.events.queries.listForExport, {
      startTime: startTime ? new Date(startTime).getTime() : undefined,
      endTime: endTime ? new Date(endTime).getTime() : undefined,
    });

    const icalData = generateICalData(events);

    return new Response(icalData, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": "attachment; filename=tilly-calendar.ics",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

/**
 * Public feed endpoint (no auth required)
 * Implements proper HTTP caching per RFC 7232 (Conditional Requests)
 * - ETag for content-based validation
 * - If-None-Match for conditional GET
 * - Last-Modified / If-Modified-Since for time-based validation
 * - Proper Cache-Control for feed subscribers
 */
export const publicFeed = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const pathParts = url.pathname.split("/");
  const token = pathParts[pathParts.length - 1];

  if (!token) {
    return new Response("Invalid token", { status: 400 });
  }

  try {
    const feedToken = await ctx.runQuery(internal.feeds.queries.getByToken, {
      token,
    });

    if (!feedToken) {
      return new Response("Invalid or expired token", { status: 404 });
    }

    // Get user's events using internal query (no auth required)
    const events = await ctx.runQuery(internal.events.queries.listForUser, {
      userId: feedToken.userId,
      includePrivate: feedToken.includePrivate,
    });

    // Compute ETag from events data for cache validation
    const etag = computeETag(events);
    const lastModified = getLastModified(events);
    const lastModifiedStr = lastModified.toUTCString();

    // Check If-None-Match header (ETag-based caching)
    const clientEtag = request.headers.get("If-None-Match");
    if (clientEtag && clientEtag === etag) {
      // Content hasn't changed - return 304 Not Modified
      // This saves bandwidth, especially for calendar apps that poll frequently
      return new Response(null, {
        status: 304,
        headers: {
          "ETag": etag,
          "Last-Modified": lastModifiedStr,
          "Cache-Control": "private, must-revalidate, max-age=300",
        },
      });
    }

    // Check If-Modified-Since header (time-based caching)
    const ifModifiedSince = request.headers.get("If-Modified-Since");
    if (ifModifiedSince) {
      const clientDate = new Date(ifModifiedSince);
      if (lastModified <= clientDate) {
        return new Response(null, {
          status: 304,
          headers: {
            "ETag": etag,
            "Last-Modified": lastModifiedStr,
            "Cache-Control": "private, must-revalidate, max-age=300",
          },
        });
      }
    }

    // Record access (only for full fetches, not 304s)
    await ctx.runMutation(internal.feeds.mutations.recordAccess, { token });

    const icalData = generateICalData(events, feedToken.name);

    return new Response(icalData, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `inline; filename="${feedToken.name}.ics"`,
        // Cache headers per best practices for calendar feeds:
        // - private: Only browser/client should cache, not CDNs
        // - must-revalidate: Check with server before using cached copy
        // - max-age=300: Cache for 5 minutes before revalidating
        "Cache-Control": "private, must-revalidate, max-age=300",
        "ETag": etag,
        "Last-Modified": lastModifiedStr,
        // CORS headers for cross-origin calendar subscriptions
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "ETag, Last-Modified",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(message, { status: 500 });
  }
});
