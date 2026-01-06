/**
 * OpenAI tool definitions for calendar operations
 */

export const CALENDAR_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "get_calendar_events",
      description:
        "Get calendar events for a specific date range or all events if no range provided.",
      parameters: {
        type: "object",
        properties: {
          start_date: {
            type: "string",
            description: "Start date in ISO format (YYYY-MM-DD) - optional",
          },
          end_date: {
            type: "string",
            description: "End date in ISO format (YYYY-MM-DD) - optional",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_event",
      description: "Create a new calendar event. Always check for conflicts first.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Event title" },
          start_time: {
            type: "string",
            description:
              "Start time in local timezone format (YYYY-MM-DDTHH:MM:SS)",
          },
          end_time: {
            type: "string",
            description:
              "End time in local timezone format (YYYY-MM-DDTHH:MM:SS)",
          },
          description: {
            type: "string",
            description: "Optional event description",
          },
        },
        required: ["title", "start_time", "end_time"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "move_event",
      description: "Move/reschedule an existing event to a new time.",
      parameters: {
        type: "object",
        properties: {
          event_id: { type: "string", description: "ID of the event to move" },
          new_start_time: {
            type: "string",
            description: "New start time in local timezone format",
          },
          new_end_time: {
            type: "string",
            description: "New end time in local timezone format",
          },
          new_title: {
            type: "string",
            description: "Optional new title for the event",
          },
        },
        required: ["event_id", "new_start_time", "new_end_time"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "check_time_conflicts",
      description:
        "Check if a proposed time slot conflicts with existing events.",
      parameters: {
        type: "object",
        properties: {
          start_time: { type: "string", description: "Proposed start time" },
          end_time: { type: "string", description: "Proposed end time" },
          exclude_event_id: {
            type: "string",
            description: "Event ID to exclude from conflict check",
          },
        },
        required: ["start_time", "end_time"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "delete_event",
      description: "Delete/cancel an existing event by ID.",
      parameters: {
        type: "object",
        properties: {
          event_id: { type: "string", description: "ID of the event to delete" },
        },
        required: ["event_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_friends_list",
      description: "Get the list of friends for the current user.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
] as const;

export type ToolName = (typeof CALENDAR_TOOLS)[number]["function"]["name"];

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}
