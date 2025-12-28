import type { Event, ToolCall } from '@tilly/shared';
import { config } from '../config/index.js';
import { createLogger } from '../utils/logger.js';
import { getTimezoneInfo, formatDateInTimezone, getCurrentDateInTimezone } from '../utils/timezone.js';
import { EventService } from './event.service.js';
import { FriendRepository } from '../repositories/friend.repository.js';
import { MeetingRepository } from '../repositories/meeting.repository.js';
import { CALENDAR_TOOLS, ToolName, ToolResult } from './ai/tools.js';
import { safeJsonParse } from '../middleware/validation.js';

const logger = createLogger('StreamingAIService');

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

interface StreamingCallbacks {
  messageId: string;
  message: string;
  chatHistory: Array<{ role: string; content: string }>;
  userId: string;
  timezone: string;
  onStreamStart: (loopIteration: number) => void;
  onStreamChunk: (content: string, loopIteration: number) => void;
  onStreamEnd: (fullContent: string, loopIteration: number, hasMoreToolCalls: boolean) => void;
  onToolCallStart: (toolCallId: string, toolName: string, args: Record<string, unknown>, loopIteration: number) => void;
  onToolCallResult: (toolCallId: string, toolName: string, result: unknown, success: boolean, loopIteration: number) => void;
  onToolLoopStatus: (iteration: number, maxIterations: number, status: 'starting' | 'processing' | 'complete', toolCalls?: ToolCall[]) => void;
  onEventCreated: (event: Event, loopIteration: number) => void;
  onError: (code: string, message: string, details?: unknown) => void;
}

interface CalendarContext {
  currentDate: string;
  currentTime: string;
  currentDay: string;
  timezone: string;
  todayEvents: Event[];
  upcomingEvents: Event[];
}

/**
 * Streaming AI Service with tool loop support
 * Allows the AI to use multiple tools across multiple iterations until complete
 */
export class StreamingAIService {
  constructor(
    private eventService: EventService,
    private friendRepository: FriendRepository,
    private meetingRepository: MeetingRepository
  ) {}

  /**
   * Process a chat message with streaming and tool loop support
   */
  async processStreamingChat(callbacks: StreamingCallbacks): Promise<void> {
    const { messageId, message, chatHistory, userId, timezone } = callbacks;
    const maxIterations = config.toolLoop.maxIterations;
    const startTime = Date.now();

    logger.info({ messageId, userId }, 'Starting streaming chat');

    try {
      // Build context
      const context = await this.buildContext(userId, timezone);
      const systemPrompt = this.buildSystemPrompt(context);

      // Build initial messages
      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        ...chatHistory.map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
        { role: 'user', content: message },
      ];

      let iteration = 0;
      let hasMoreToolCalls = true;

      // Tool loop - continue until no more tool calls or max iterations
      while (hasMoreToolCalls && iteration < maxIterations) {
        // Check timeout
        if (Date.now() - startTime > config.toolLoop.timeoutMs) {
          callbacks.onError('TIMEOUT', 'Tool loop timeout exceeded');
          return;
        }

        iteration++;
        callbacks.onToolLoopStatus(iteration, maxIterations, iteration === 1 ? 'starting' : 'processing');

        // Stream the AI response
        const result = await this.streamOpenAIResponse(
          messages,
          iteration,
          callbacks
        );

        // If we have tool calls, execute them
        if (result.toolCalls && result.toolCalls.length > 0) {
          callbacks.onToolLoopStatus(iteration, maxIterations, 'processing', result.toolCalls);

          // Add assistant message with tool calls
          messages.push({
            role: 'assistant',
            content: result.content || '',
            tool_calls: result.toolCalls,
          });

          // Execute each tool call
          const toolResults = await this.executeToolCalls(
            result.toolCalls,
            userId,
            timezone,
            iteration,
            callbacks
          );

          // Add tool results to messages
          for (const toolResult of toolResults) {
            messages.push({
              role: 'tool',
              content: toolResult.content,
              tool_call_id: toolResult.tool_call_id,
            });
          }

          hasMoreToolCalls = true;
        } else {
          // No tool calls, we're done
          hasMoreToolCalls = false;
          callbacks.onToolLoopStatus(iteration, maxIterations, 'complete');
        }
      }

      if (iteration >= maxIterations && hasMoreToolCalls) {
        logger.warn({ messageId, iterations: iteration }, 'Max iterations reached');
        callbacks.onError('MAX_ITERATIONS', 'Maximum tool iterations reached');
      }

      logger.info(
        { messageId, iterations: iteration, durationMs: Date.now() - startTime },
        'Streaming chat completed'
      );
    } catch (error) {
      logger.error({ error, messageId }, 'Streaming chat failed');
      callbacks.onError(
        'PROCESSING_ERROR',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Stream a response from OpenAI with tool support
   */
  private async streamOpenAIResponse(
    messages: ChatMessage[],
    loopIteration: number,
    callbacks: StreamingCallbacks
  ): Promise<{ content: string; toolCalls?: ToolCall[] }> {
    callbacks.onStreamStart(loopIteration);

    const requestBody = {
      model: config.openai.model,
      messages,
      temperature: 0.3,
      max_tokens: 2000,
      stream: true,
      tools: CALENDAR_TOOLS,
      tool_choice: 'auto',
    };

    const response = await fetch(`${config.openai.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.openai.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error({ status: response.status, error: errorText }, 'OpenAI API error');
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let fullContent = '';
    const toolCalls: Map<number, { id: string; type: 'function'; function: { name: string; arguments: string } }> = new Map();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim() !== '');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta;

              if (delta?.content) {
                fullContent += delta.content;
                callbacks.onStreamChunk(delta.content, loopIteration);
              }

              // Handle tool calls
              if (delta?.tool_calls) {
                for (const tc of delta.tool_calls) {
                  const index = tc.index;
                  if (!toolCalls.has(index)) {
                    toolCalls.set(index, {
                      id: tc.id || '',
                      type: 'function',
                      function: { name: '', arguments: '' },
                    });
                  }

                  const existing = toolCalls.get(index)!;
                  if (tc.id) existing.id = tc.id;
                  if (tc.function?.name) existing.function.name = tc.function.name;
                  if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
                }
              }
            } catch {
              // Ignore parse errors for incomplete chunks
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    const toolCallsArray = Array.from(toolCalls.values()).filter(tc => tc.id && tc.function.name);
    const hasToolCalls = toolCallsArray.length > 0;

    callbacks.onStreamEnd(fullContent, loopIteration, hasToolCalls);

    return {
      content: fullContent,
      toolCalls: hasToolCalls ? toolCallsArray : undefined,
    };
  }

  /**
   * Execute tool calls in parallel
   */
  private async executeToolCalls(
    toolCalls: ToolCall[],
    userId: string,
    timezone: string,
    loopIteration: number,
    callbacks: StreamingCallbacks
  ): Promise<ToolResult[]> {
    const results: ToolResult[] = [];

    // Execute tools sequentially for better UX feedback
    for (const toolCall of toolCalls) {
      const args = safeJsonParse(toolCall.function.arguments, {});

      callbacks.onToolCallStart(
        toolCall.id,
        toolCall.function.name,
        args,
        loopIteration
      );

      try {
        const result = await this.executeTool(
          toolCall.function.name as ToolName,
          args,
          userId,
          timezone
        );

        // Notify of created events
        if (result.event) {
          callbacks.onEventCreated(result.event, loopIteration);
        }

        callbacks.onToolCallResult(
          toolCall.id,
          toolCall.function.name,
          result.data,
          true,
          loopIteration
        );

        results.push({
          tool_call_id: toolCall.id,
          role: 'tool',
          content: JSON.stringify(result.data),
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        callbacks.onToolCallResult(
          toolCall.id,
          toolCall.function.name,
          { error: errorMessage },
          false,
          loopIteration
        );

        results.push({
          tool_call_id: toolCall.id,
          role: 'tool',
          content: JSON.stringify({ error: errorMessage }),
        });
      }
    }

    return results;
  }

  /**
   * Execute a single tool
   */
  private async executeTool(
    name: ToolName,
    args: Record<string, unknown>,
    userId: string,
    timezone: string
  ): Promise<{ data: unknown; event?: Event }> {
    logger.debug({ name, args }, 'Executing tool');

    switch (name) {
      case 'get_calendar_events': {
        const startDate = args.start_date ? new Date(args.start_date as string) : undefined;
        const endDate = args.end_date ? new Date(args.end_date as string) : undefined;

        if (startDate && endDate) {
          const events = await this.eventService.getEventsByDateRange(startDate, endDate, userId);
          return { data: { events: this.formatEventsForAI(events, timezone) } };
        }

        const events = await this.eventService.getAllEvents(userId);
        return { data: { events: this.formatEventsForAI(events, timezone) } };
      }

      case 'create_event': {
        const event = await this.eventService.createEvent(
          {
            title: args.title as string,
            start: args.start_time as string,
            end: args.end_time as string,
            description: args.description as string | undefined,
          },
          userId
        );
        return {
          data: { success: true, event: this.formatEventForAI(event, timezone) },
          event,
        };
      }

      case 'move_event': {
        const event = await this.eventService.moveEvent(
          args.event_id as number,
          args.new_start_time as string,
          args.new_end_time as string,
          userId,
          args.new_title as string | undefined
        );
        return {
          data: { success: true, event: this.formatEventForAI(event, timezone) },
          event,
        };
      }

      case 'check_time_conflicts': {
        const result = await this.eventService.checkTimeConflicts(
          new Date(args.start_time as string),
          new Date(args.end_time as string),
          userId,
          args.exclude_event_id as number | undefined
        );
        return {
          data: {
            hasConflicts: result.hasConflicts,
            conflicts: this.formatEventsForAI(result.conflicts, timezone),
          },
        };
      }

      case 'delete_event': {
        await this.eventService.deleteEvent(args.event_id as number, userId);
        return { data: { success: true, deleted: true } };
      }

      case 'get_friends_list': {
        const friends = await this.friendRepository.getFriends(userId);
        return {
          data: {
            friends: friends.map(f => ({
              id: f.friendId,
              name: f.friend?.displayName,
              email: f.friend?.email,
            })),
          },
        };
      }

      case 'request_meeting_with_friend': {
        const friend = await this.friendRepository.findFriendByNameOrEmail(
          userId,
          args.friend_name as string
        );

        if (!friend) {
          return { data: { success: false, error: 'Friend not found' } };
        }

        const meeting = await this.meetingRepository.create(
          {
            friendId: friend.friendId,
            title: args.meeting_title as string,
            message: args.message as string | undefined,
            durationMinutes: (args.duration_minutes as number) || 30,
            proposedTimes: (args.proposed_times as Array<{ start: string; end?: string }>).map(t => ({
              start: t.start,
              end: t.end,
            })),
          },
          userId
        );

        return { data: { success: true, meetingRequest: meeting } };
      }

      case 'find_mutual_free_time': {
        const friend = await this.friendRepository.findFriendByNameOrEmail(
          userId,
          args.friend_name as string
        );

        if (!friend) {
          return { data: { success: false, error: 'Friend not found' } };
        }

        return {
          data: {
            success: true,
            message: 'Finding mutual free time requires checking both calendars. Please use the meeting request feature.',
          },
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  /**
   * Build calendar context for the AI
   */
  private async buildContext(userId: string, timezone: string): Promise<CalendarContext> {
    const now = getCurrentDateInTimezone(timezone);
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const [todayEvents, upcomingEvents] = await Promise.all([
      this.eventService.getEventsByDateRange(todayStart, todayEnd, userId),
      this.eventService.getUpcomingEvents(userId, 7),
    ]);

    const tzInfo = getTimezoneInfo(timezone);

    return {
      currentDate: formatDateInTimezone(now, timezone, { dateStyle: 'full' }),
      currentTime: formatDateInTimezone(now, timezone, { timeStyle: 'short' }),
      currentDay: now.toLocaleDateString('en-US', { weekday: 'long', timeZone: timezone }),
      timezone: tzInfo.name,
      todayEvents,
      upcomingEvents,
    };
  }

  /**
   * Build the system prompt
   */
  private buildSystemPrompt(context: CalendarContext): string {
    const todayEventsSummary = context.todayEvents.length > 0
      ? context.todayEvents.map(e =>
          `- ${e.title} (${formatDateInTimezone(e.start, context.timezone, { timeStyle: 'short' })} - ${formatDateInTimezone(e.end, context.timezone, { timeStyle: 'short' })})`
        ).join('\n')
      : 'No events scheduled for today.';

    const upcomingSummary = context.upcomingEvents.slice(0, 5).map(e =>
      `- ${e.title} on ${formatDateInTimezone(e.start, context.timezone, { dateStyle: 'medium', timeStyle: 'short' })}`
    ).join('\n');

    return `You are Tilly, a helpful and friendly calendar assistant.

Current Information:
- Date: ${context.currentDate}
- Time: ${context.currentTime}
- Day: ${context.currentDay}
- Timezone: ${context.timezone}

Today's Schedule:
${todayEventsSummary}

Upcoming Events (next 7 days):
${upcomingSummary || 'No upcoming events.'}

Guidelines:
1. When creating events, always check for conflicts first using check_time_conflicts.
2. Use the user's timezone for all time references.
3. Be concise but friendly in your responses.
4. When moving events, confirm the new time with the user.
5. For meeting requests with friends, use request_meeting_with_friend.
6. Always format times in a human-readable way.
7. You can use multiple tools in sequence to complete complex tasks - for example, check conflicts, then create an event.
8. If a task requires multiple steps, complete all steps before responding to the user.`;
  }

  /**
   * Format an event for AI consumption
   */
  private formatEventForAI(event: Event, timezone: string): Record<string, unknown> {
    return {
      id: event.id,
      title: event.title,
      start: formatDateInTimezone(event.start, timezone),
      end: formatDateInTimezone(event.end, timezone),
      description: event.description,
    };
  }

  /**
   * Format multiple events for AI consumption
   */
  private formatEventsForAI(events: Event[], timezone: string): Array<Record<string, unknown>> {
    return events.map(e => this.formatEventForAI(e, timezone));
  }
}
