"use node";

import { httpAction } from "../_generated/server";
import { api } from "../_generated/api";
import { CALENDAR_TOOLS, ToolCall, ToolName } from "./tools";
import { Id } from "../_generated/dataModel";

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

interface SSEEvent {
  type: string;
  [key: string]: unknown;
}

/**
 * Write an SSE event to the stream
 */
function sseEncode(event: SSEEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/**
 * Format date for AI consumption
 */
function formatDate(timestamp: number, timezone: string): string {
  return new Date(timestamp).toLocaleString("en-US", {
    timeZone: timezone,
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * Build system prompt with calendar context
 */
function buildSystemPrompt(
  context: {
    todayEvents: Array<{ title: string; startTime: number; endTime: number }>;
    upcomingEvents: Array<{ title: string; startTime: number; endTime: number }>;
  },
  timezone: string
): string {
  const now = new Date();
  const currentDate = now.toLocaleDateString("en-US", {
    timeZone: timezone,
    dateStyle: "full",
  });
  const currentTime = now.toLocaleTimeString("en-US", {
    timeZone: timezone,
    timeStyle: "short",
  });
  const currentDay = now.toLocaleDateString("en-US", {
    timeZone: timezone,
    weekday: "long",
  });

  const todayEventsSummary =
    context.todayEvents.length > 0
      ? context.todayEvents
          .map(
            (e) =>
              `- ${e.title} (${formatDate(e.startTime, timezone)} - ${formatDate(e.endTime, timezone)})`
          )
          .join("\n")
      : "No events scheduled for today.";

  const upcomingSummary = context.upcomingEvents
    .slice(0, 5)
    .map((e) => `- ${e.title} on ${formatDate(e.startTime, timezone)}`)
    .join("\n");

  return `You are Tilly, a helpful and friendly calendar assistant.

Current Information:
- Date: ${currentDate}
- Time: ${currentTime}
- Day: ${currentDay}
- Timezone: ${timezone}

Today's Schedule:
${todayEventsSummary}

Upcoming Events (next 7 days):
${upcomingSummary || "No upcoming events."}

Guidelines:
1. When creating events, always check for conflicts first using check_time_conflicts.
2. Use the user's timezone for all time references.
3. Be concise but friendly in your responses.
4. When moving events, confirm the new time with the user.
5. Always format times in a human-readable way.
6. You can use multiple tools in sequence to complete complex tasks.
7. If a task requires multiple steps, complete all steps before responding to the user.`;
}

/**
 * Execute a tool call
 */
async function executeTool(
  ctx: any,
  toolName: ToolName,
  args: Record<string, unknown>,
  userId: Id<"users">,
  timezone: string
): Promise<{ data: unknown; event?: any }> {
  switch (toolName) {
    case "get_calendar_events": {
      const startDate = args.start_date
        ? new Date(args.start_date as string).getTime()
        : undefined;
      const endDate = args.end_date
        ? new Date(args.end_date as string).getTime()
        : undefined;

      const events = await ctx.runQuery(api.events.queries.list, {
        startTime: startDate,
        endTime: endDate,
      });

      return {
        data: {
          events: events.map((e: any) => ({
            id: e._id,
            title: e.title,
            start: formatDate(e.startTime, timezone),
            end: formatDate(e.endTime, timezone),
            description: e.description,
          })),
        },
      };
    }

    case "create_event": {
      const startTime = new Date(args.start_time as string).getTime();
      const endTime = new Date(args.end_time as string).getTime();

      const event = await ctx.runMutation(api.events.mutations.create, {
        title: args.title as string,
        startTime,
        endTime,
        description: args.description as string | undefined,
      });

      return {
        data: {
          success: true,
          event: {
            id: event._id,
            title: event.title,
            start: formatDate(event.startTime, timezone),
            end: formatDate(event.endTime, timezone),
          },
        },
        event,
      };
    }

    case "move_event": {
      const eventId = args.event_id as Id<"events">;
      const startTime = new Date(args.new_start_time as string).getTime();
      const endTime = new Date(args.new_end_time as string).getTime();

      const event = await ctx.runMutation(api.events.mutations.update, {
        id: eventId,
        startTime,
        endTime,
        title: args.new_title as string | undefined,
      });

      return {
        data: {
          success: true,
          event: event
            ? {
                id: event._id,
                title: event.title,
                start: formatDate(event.startTime, timezone),
                end: formatDate(event.endTime, timezone),
              }
            : null,
        },
        event,
      };
    }

    case "check_time_conflicts": {
      const startTime = new Date(args.start_time as string).getTime();
      const endTime = new Date(args.end_time as string).getTime();

      const result = await ctx.runQuery(api.events.queries.checkConflicts, {
        startTime,
        endTime,
        excludeEventId: args.exclude_event_id as Id<"events"> | undefined,
      });

      return {
        data: {
          hasConflicts: result.hasConflicts,
          conflicts: result.conflicts.map((e: any) => ({
            id: e._id,
            title: e.title,
            start: formatDate(e.startTime, timezone),
            end: formatDate(e.endTime, timezone),
          })),
        },
      };
    }

    case "delete_event": {
      await ctx.runMutation(api.events.mutations.remove, {
        id: args.event_id as Id<"events">,
      });

      return { data: { success: true, deleted: true } };
    }

    case "get_friends_list": {
      const friends = await ctx.runQuery(api.friends.queries.list, {});

      return {
        data: {
          friends: friends.map((f: any) => ({
            id: f.friendId,
            name: f.name,
            email: f.email,
          })),
        },
      };
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

/**
 * Streaming AI chat endpoint
 */
export const streamChat = httpAction(async (ctx, request) => {
  // Get the user identity from the auth token
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const userId = identity.subject as Id<"users">;
  const body = await request.json();
  const { message, chatHistory = [], timezone = "America/New_York" } = body;

  if (!message) {
    return new Response(JSON.stringify({ error: "Message required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Create streaming response
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  // Process in background
  (async () => {
    try {
      // Get calendar context
      const now = Date.now();
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date();
      dayEnd.setHours(23, 59, 59, 999);
      const weekEnd = new Date(now + 7 * 24 * 60 * 60 * 1000);

      const [todayEvents, upcomingEvents] = await Promise.all([
        ctx.runQuery(api.events.queries.getByRange, {
          startTime: dayStart.getTime(),
          endTime: dayEnd.getTime(),
        }),
        ctx.runQuery(api.events.queries.getByRange, {
          startTime: now,
          endTime: weekEnd.getTime(),
        }),
      ]);

      const systemPrompt = buildSystemPrompt(
        { todayEvents, upcomingEvents },
        timezone
      );

      // Build messages
      const messages: ChatMessage[] = [
        { role: "system", content: systemPrompt },
        ...chatHistory.map((m: any) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
        { role: "user", content: message },
      ];

      const maxIterations = 10;
      let iteration = 0;
      let hasMoreToolCalls = true;

      // Tool loop
      while (hasMoreToolCalls && iteration < maxIterations) {
        iteration++;

        await writer.write(
          encoder.encode(sseEncode({ type: "loop_start", iteration }))
        );

        // Call OpenAI
        const openaiResponse = await fetch(
          "https://api.openai.com/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
              model: process.env.OPENAI_MODEL || "gpt-4o",
              messages,
              temperature: 0.3,
              max_tokens: 2000,
              stream: true,
              tools: CALENDAR_TOOLS,
              tool_choice: "auto",
            }),
          }
        );

        if (!openaiResponse.ok) {
          throw new Error(`OpenAI API error: ${openaiResponse.status}`);
        }

        const reader = openaiResponse.body!.getReader();
        const decoder = new TextDecoder();
        let fullContent = "";
        const toolCalls: Map<
          number,
          { id: string; function: { name: string; arguments: string } }
        > = new Map();

        // Stream the response
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));

          for (const line of lines) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta;

              if (delta?.content) {
                fullContent += delta.content;
                await writer.write(
                  encoder.encode(
                    sseEncode({ type: "chunk", content: delta.content })
                  )
                );
              }

              // Accumulate tool calls
              if (delta?.tool_calls) {
                for (const tc of delta.tool_calls) {
                  const index = tc.index;
                  if (!toolCalls.has(index)) {
                    toolCalls.set(index, {
                      id: tc.id || "",
                      function: { name: "", arguments: "" },
                    });
                  }
                  const existing = toolCalls.get(index)!;
                  if (tc.id) existing.id = tc.id;
                  if (tc.function?.name) existing.function.name = tc.function.name;
                  if (tc.function?.arguments)
                    existing.function.arguments += tc.function.arguments;
                }
              }
            } catch {
              // Ignore parse errors
            }
          }
        }

        const toolCallsArray = Array.from(toolCalls.values()).filter(
          (tc) => tc.id && tc.function.name
        );

        if (toolCallsArray.length > 0) {
          // Add assistant message with tool calls
          messages.push({
            role: "assistant",
            content: fullContent || "",
            tool_calls: toolCallsArray.map((tc) => ({
              id: tc.id,
              type: "function" as const,
              function: tc.function,
            })),
          });

          // Execute tool calls
          for (const toolCall of toolCallsArray) {
            const args = JSON.parse(toolCall.function.arguments || "{}");

            await writer.write(
              encoder.encode(
                sseEncode({
                  type: "tool_start",
                  name: toolCall.function.name,
                  args,
                })
              )
            );

            try {
              const result = await executeTool(
                ctx,
                toolCall.function.name as ToolName,
                args,
                userId,
                timezone
              );

              await writer.write(
                encoder.encode(
                  sseEncode({
                    type: "tool_result",
                    name: toolCall.function.name,
                    result: result.data,
                    success: true,
                  })
                )
              );

              if (result.event) {
                await writer.write(
                  encoder.encode(
                    sseEncode({ type: "event_created", event: result.event })
                  )
                );
              }

              messages.push({
                role: "tool",
                content: JSON.stringify(result.data),
                tool_call_id: toolCall.id,
              });
            } catch (error) {
              const errorMsg =
                error instanceof Error ? error.message : "Unknown error";

              await writer.write(
                encoder.encode(
                  sseEncode({
                    type: "tool_result",
                    name: toolCall.function.name,
                    result: { error: errorMsg },
                    success: false,
                  })
                )
              );

              messages.push({
                role: "tool",
                content: JSON.stringify({ error: errorMsg }),
                tool_call_id: toolCall.id,
              });
            }
          }

          hasMoreToolCalls = true;
        } else {
          hasMoreToolCalls = false;
        }
      }

      await writer.write(encoder.encode(sseEncode({ type: "done" })));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      await writer.write(
        encoder.encode(sseEncode({ type: "error", message: errorMsg }))
      );
    } finally {
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});
