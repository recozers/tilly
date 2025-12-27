import { apiClient } from './client.js';
import type { Event, ChatMessage, ToolCall } from '@tilly/shared';

interface ChatResponse {
  response: string;
  events?: Event[];
  toolCalls?: ToolCall[];
}

/**
 * AI API client
 */
export const aiApi = {
  /**
   * Send a chat message to the AI assistant
   */
  async chat(
    message: string,
    chatHistory: ChatMessage[] = [],
    timezone?: string
  ): Promise<ChatResponse> {
    return apiClient.post<ChatResponse>('/ai/chat', {
      message,
      chatHistory,
      timezone: timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  },

  /**
   * Legacy proxy endpoint for direct OpenAI calls
   */
  async proxy(options: {
    model?: string;
    messages: ChatMessage[];
    temperature?: number;
    max_tokens?: number;
  }): Promise<{ choices: Array<{ message: { content: string } }> }> {
    return apiClient.post('/ai/proxy', options);
  },
};
