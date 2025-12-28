/**
 * AI Chat message
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  name?: string;
}

/**
 * AI Tool call
 */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * AI Chat request
 */
export interface ChatRequest {
  message: string;
  chatHistory?: ChatMessage[];
  timezone?: string;
}

/**
 * AI Chat response
 */
export interface ChatResponse {
  response: string;
  toolCalls?: ToolCall[];
  events?: unknown[];
}
