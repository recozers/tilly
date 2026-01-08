import { useState, useCallback } from 'react';
import { useAuthToken } from '@convex-dev/auth/react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  events?: any[];
  isStreaming?: boolean;
}

interface UseChatReturn {
  messages: Message[];
  isLoading: boolean;
  error: Error | null;
  sendMessage: (content: string) => Promise<void>;
  clearHistory: () => void;
}

/**
 * Hook for managing AI chat with streaming via Convex HTTP actions
 */
export function useChat(): UseChatReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const authToken = useAuthToken();

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim()) return;

    const messageId = Date.now().toString();
    const userMessage: Message = {
      id: `user-${messageId}`,
      role: 'user',
      content,
      timestamp: new Date(),
    };

    // Add user message
    setMessages(prev => [...prev, userMessage]);

    // Add placeholder for assistant response
    const assistantId = `assistant-${messageId}`;
    setMessages(prev => [...prev, {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
    }]);

    setIsLoading(true);
    setError(null);

    try {
      // Build chat history for context
      const chatHistory = messages.map(m => ({
        role: m.role,
        content: m.content,
      }));

      // Get timezone
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      // Get the Convex URL and convert to site URL for HTTP actions
      const convexUrl = import.meta.env.VITE_CONVEX_URL as string;
      const siteUrl = convexUrl.replace('.cloud', '.site');

      // Stream from Convex HTTP action
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      const response = await fetch(`${siteUrl}/api/ai/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: content,
          chatHistory,
          timezone,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let fullContent = '';
      const createdEvents: any[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(l => l.startsWith('data: '));

        for (const line of lines) {
          try {
            const data = JSON.parse(line.slice(6));

            switch (data.type) {
              case 'chunk':
                fullContent += data.content;
                setMessages(prev => prev.map(m =>
                  m.id === assistantId
                    ? { ...m, content: fullContent }
                    : m
                ));
                break;

              case 'event_created':
                createdEvents.push(data.event);
                break;

              case 'done':
                setMessages(prev => prev.map(m =>
                  m.id === assistantId
                    ? { ...m, isStreaming: false, events: createdEvents.length > 0 ? createdEvents : undefined }
                    : m
                ));
                break;

              case 'error':
                throw new Error(data.message);
            }
          } catch (parseError) {
            // Ignore parse errors for incomplete chunks
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to send message'));
      // Remove the failed assistant message
      setMessages(prev => prev.filter(m => m.id !== `assistant-${messageId}`));
    } finally {
      setIsLoading(false);
    }
  }, [messages, authToken]);

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
