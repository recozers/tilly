import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";
import { streamChat } from "./ai/actions";
import { importIcal, exportIcal, publicFeed } from "./ical/actions";

const http = httpRouter();

// Auth routes (handles OAuth callbacks, etc.)
auth.addHttpRoutes(http);

// CORS preflight handler for AI chat endpoint
const chatCorsHandler = httpAction(async (_, request) => {
  const origin = request.headers.get("Origin") || "*";
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Max-Age": "86400",
    },
  });
});

http.route({
  path: "/api/ai/chat",
  method: "OPTIONS",
  handler: chatCorsHandler,
});

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
