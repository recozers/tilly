import { useState, useCallback } from 'react';
import { aiApi } from '../api/ai.api.js';
import type { ChatMessage, Event } from '@tilly/shared';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  events?: Event[];
}

interface UseChatReturn {
  messages: Message[];
  isLoading: boolean;
  error: Error | null;
  sendMessage: (content: string) => Promise<void>;
  clearHistory: () => void;
}

/**
 * Hook for managing AI chat
 */
export function useChat(): UseChatReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim()) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    setError(null);

    try {
      // Build chat history for context
      const chatHistory: ChatMessage[] = messages.map(m => ({
        role: m.role,
        content: m.content,
      }));

      const response = await aiApi.chat(content, chatHistory);

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: response.response,
        timestamp: new Date(),
        events: response.events,
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to send message'));
    } finally {
      setIsLoading(false);
    }
  }, [messages]);

  const clearHistory = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    clearHistory,
  };
}
