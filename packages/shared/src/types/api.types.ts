/**
 * Standard API response wrapper
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * Pagination parameters
 */
export interface PaginationParams {
  page?: number;
  limit?: number;
  offset?: number;
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

/**
 * Date range query parameters
 */
export interface DateRangeParams {
  startDate: string | Date;
  endDate: string | Date;
}

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
