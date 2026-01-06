import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { streamChat } from "./ai/actions";
import { importIcal, exportIcal, publicFeed } from "./ical/actions";

const http = httpRouter();

// Auth routes (handles OAuth callbacks, etc.)
auth.addHttpRoutes(http);

// AI streaming endpoint
http.route({
  path: "/api/ai/chat",
  method: "POST",
  handler: streamChat,
});

// iCal endpoints
http.route({
  path: "/api/ical/import",
  method: "POST",
  handler: importIcal,
});

http.route({
  path: "/api/ical/export",
  method: "GET",
  handler: exportIcal,
});

// Public feed (no auth required)
http.route({
  path: "/feed/{token}",
  method: "GET",
  handler: publicFeed,
});

export default http;
