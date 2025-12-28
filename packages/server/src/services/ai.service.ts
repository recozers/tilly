import type { Event } from '@tilly/shared';
import { config } from '../config/index.js';
import { createLogger } from '../utils/logger.js';
import { getTimezoneInfo, formatDateInTimezone, getCurrentDateInTimezone } from '../utils/timezone.js';
import { EventService } from './event.service.js';
import { FriendRepository } from '../repositories/friend.repository.js';
import { MeetingRepository } from '../repositories/meeting.repository.js';
import { CALENDAR_TOOLS, ToolCall, ToolResult, ToolName } from './ai/tools.js';
import { safeJsonParse } from '../middleware/validation.js';

const logger = createLogger('AIService');

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
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
 * AI Service - handles OpenAI/Claude integration for calendar assistant
 */
export class AIService {
  constructor(
    private eventService: EventService,
    private friendRepository: FriendRepository,
    private meetingRepository: MeetingRepository
  ) {}

  /**
   * Process a chat message and return a response
   */
  async processChat(
    message: string,
    userId: string,
    chatHistory: ChatMessage[] = [],
    userTimezone = 'America/New_York'
  ): Promise<{
    response: string;
    events?: Event[];
    toolCalls?: ToolCall[];
  }> {
    logger.info({ userId }, 'Processing chat message');

    // Build context
    const context = await this.buildContext(userId, userTimezone);
    const systemPrompt = this.buildSystemPrompt(context);

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...chatHistory,
      { role: 'user', content: message },
    ];

    // Make initial API call
    const response = await this.callOpenAI(messages, true);

    // If there are tool calls, execute them
    if (response.tool_calls && response.tool_calls.length > 0) {
      return this.handleToolCalls(response.tool_calls, messages, userId, userTimezone);
    }

    return {
      response: response.content || 'I apologize, but I could not generate a response.',
    };
  }

  /**
   * Handle tool calls from the AI
   */
  private async handleToolCalls(
    toolCalls: ToolCall[],
    messages: ChatMessage[],
    userId: string,
    userTimezone: string
  ): Promise<{ response: string; events?: Event[]; toolCalls?: ToolCall[] }> {
    const toolResults: ToolResult[] = [];
    const createdEvents: Event[] = [];

    for (const toolCall of toolCalls) {
      try {
        const args = safeJsonParse(toolCall.function.arguments, {});
        const result = await this.executeTool(
          toolCall.function.name as ToolName,
          args,
          userId,
          userTimezone
        );

        if (result.event) {
          createdEvents.push(result.event);
        }

        toolResults.push({
          tool_call_id: toolCall.id,
          role: 'tool',
          content: JSON.stringify(result.data),
        });
      } catch (error) {
        logger.error({ error, toolCall }, 'Tool execution failed');
        toolResults.push({
          tool_call_id: toolCall.id,
          role: 'tool',
          content: JSON.stringify({ error: (error as Error).message }),
        });
      }
    }

    // Add assistant message with tool calls and tool results to messages
    const updatedMessages: ChatMessage[] = [
      ...messages,
      {
        role: 'assistant',
        content: '',
        tool_calls: toolCalls,
      },
      ...toolResults.map(r => ({
        role: 'tool' as const,
        content: r.content,
        tool_call_id: r.tool_call_id,
      })),
    ];

    // Get final response from AI
    const finalResponse = await this.callOpenAI(updatedMessages, false);

    return {
      response: finalResponse.content || 'I have processed your request.',
      events: createdEvents.length > 0 ? createdEvents : undefined,
      toolCalls,
    };
  }

  /**
   * Execute a tool call
   */
  private async executeTool(
    name: ToolName,
    args: Record<string, unknown>,
    userId: string,
    userTimezone: string
  ): Promise<{ data: unknown; event?: Event }> {
    logger.debug({ name, args }, 'Executing tool');

    switch (name) {
      case 'get_calendar_events': {
        const startDate = args.start_date
          ? new Date(args.start_date as string)
          : undefined;
        const endDate = args.end_date
          ? new Date(args.end_date as string)
          : undefined;

        if (startDate && endDate) {
          const events = await this.eventService.getEventsByDateRange(startDate, endDate, userId);
          return { data: { events: this.formatEventsForAI(events, userTimezone) } };
        }

        const events = await this.eventService.getAllEvents(userId);
        return { data: { events: this.formatEventsForAI(events, userTimezone) } };
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
          data: { success: true, event: this.formatEventForAI(event, userTimezone) },
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
          data: { success: true, event: this.formatEventForAI(event, userTimezone) },
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
            conflicts: this.formatEventsForAI(result.conflicts, userTimezone),
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
        // Simplified implementation - would need more complex logic in production
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
   * Call the OpenAI API
   */
  private async callOpenAI(
    messages: ChatMessage[],
    withTools: boolean
  ): Promise<{ content: string; tool_calls?: ToolCall[] }> {
    const requestBody: Record<string, unknown> = {
      model: config.openai.model,
      messages,
      temperature: 0.3,
      max_tokens: 2000,
    };

    if (withTools) {
      requestBody.tools = CALENDAR_TOOLS;
      requestBody.tool_choice = 'auto';
    }

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

    const data = await response.json() as {
      choices?: Array<{
        message?: {
          content?: string;
          tool_calls?: ToolCall[];
        };
      }>;
    };
    const choice = data.choices?.[0];

    return {
      content: choice?.message?.content || '',
      tool_calls: choice?.message?.tool_calls,
    };
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
   * Build the system prompt for the AI
   */
  private buildSystemPrompt(context: CalendarContext): string {
    const todayEventsSummary = context.todayEvents.length > 0
      ? context.todayEvents.map(e => `- ${e.title} (${formatDateInTimezone(e.start, context.timezone, { timeStyle: 'short' })} - ${formatDateInTimezone(e.end, context.timezone, { timeStyle: 'short' })})`).join('\n')
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
6. Always format times in a human-readable way.`;
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
