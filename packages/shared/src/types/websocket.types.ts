import type { Event } from './event.types.js';
import type { ToolCall } from './api.types.js';

/**
 * WebSocket message types for streaming AI responses
 */

// Client -> Server messages
export type WSClientMessage =
  | WSChatMessage
  | WSPingMessage
  | WSAuthMessage;

export interface WSChatMessage {
  type: 'chat';
  id: string; // Client-generated message ID for correlation
  payload: {
    message: string;
    chatHistory?: Array<{ role: string; content: string }>;
    timezone?: string;
  };
}

export interface WSPingMessage {
  type: 'ping';
}

export interface WSAuthMessage {
  type: 'auth';
  payload: {
    token: string;
  };
}

// Server -> Client messages
export type WSServerMessage =
  | WSStreamStartMessage
  | WSStreamChunkMessage
  | WSStreamEndMessage
  | WSToolCallStartMessage
  | WSToolCallResultMessage
  | WSToolLoopStatusMessage
  | WSErrorMessage
  | WSPongMessage
  | WSAuthResultMessage
  | WSEventCreatedMessage;

export interface WSStreamStartMessage {
  type: 'stream_start';
  id: string; // Correlates to client message ID
  payload: {
    loopIteration: number;
  };
}

export interface WSStreamChunkMessage {
  type: 'stream_chunk';
  id: string;
  payload: {
    content: string;
    loopIteration: number;
  };
}

export interface WSStreamEndMessage {
  type: 'stream_end';
  id: string;
  payload: {
    fullContent: string;
    loopIteration: number;
    hasMoreToolCalls: boolean;
  };
}

export interface WSToolCallStartMessage {
  type: 'tool_call_start';
  id: string;
  payload: {
    toolCallId: string;
    toolName: string;
    arguments: Record<string, unknown>;
    loopIteration: number;
  };
}

export interface WSToolCallResultMessage {
  type: 'tool_call_result';
  id: string;
  payload: {
    toolCallId: string;
    toolName: string;
    result: unknown;
    success: boolean;
    loopIteration: number;
  };
}

export interface WSToolLoopStatusMessage {
  type: 'tool_loop_status';
  id: string;
  payload: {
    iteration: number;
    maxIterations: number;
    status: 'starting' | 'processing' | 'complete';
    toolCalls?: ToolCall[];
  };
}

export interface WSEventCreatedMessage {
  type: 'event_created';
  id: string;
  payload: {
    event: Event;
    loopIteration: number;
  };
}

export interface WSErrorMessage {
  type: 'error';
  id?: string;
  payload: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface WSPongMessage {
  type: 'pong';
}

export interface WSAuthResultMessage {
  type: 'auth_result';
  payload: {
    success: boolean;
    userId?: string;
    error?: string;
  };
}

/**
 * Connection state for WebSocket clients
 */
export interface WSConnectionState {
  authenticated: boolean;
  userId?: string;
  connectedAt: Date;
  lastPingAt?: Date;
}

/**
 * Configuration for tool loop behavior
 */
export interface ToolLoopConfig {
  maxIterations: number;
  timeoutMs: number;
}

export const DEFAULT_TOOL_LOOP_CONFIG: ToolLoopConfig = {
  maxIterations: 10,
  timeoutMs: 60000, // 60 seconds total timeout
};
