import { useState, useCallback, useRef, useEffect } from 'react';
import type {
  WSClientMessage,
  WSServerMessage,
  WSStreamChunkMessage,
  WSToolCallStartMessage,
  WSToolCallResultMessage,
  WSEventCreatedMessage,
  Event,
} from '@tilly/shared';
import { supabase } from '../api/client.js';

interface StreamingMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  events?: Event[];
  toolCalls?: Array<{
    id: string;
    name: string;
    status: 'pending' | 'executing' | 'success' | 'error';
    result?: unknown;
  }>;
}

interface UseWebSocketChatReturn {
  messages: StreamingMessage[];
  isConnected: boolean;
  isStreaming: boolean;
  currentToolCall: string | null;
  loopIteration: number;
  error: Error | null;
  sendMessage: (content: string) => void;
  clearHistory: () => void;
  connect: () => void;
  disconnect: () => void;
}

/**
 * WebSocket-based chat hook with streaming and tool loop support
 */
export function useWebSocketChat(): UseWebSocketChatReturn {
  const [messages, setMessages] = useState<StreamingMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentToolCall, setCurrentToolCall] = useState<string | null>(null);
  const [loopIteration, setLoopIteration] = useState(0);
  const [error, setError] = useState<Error | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const currentMessageIdRef = useRef<string | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Generate WebSocket URL
  const getWsUrl = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws`;
  }, []);

  // Handle incoming WebSocket messages
  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const message = JSON.parse(event.data) as WSServerMessage;

      switch (message.type) {
        case 'pong':
          // Heartbeat response, connection is alive
          break;

        case 'auth_result':
          if (message.payload.success) {
            setIsConnected(true);
            setError(null);
          } else {
            setError(new Error(message.payload.error || 'Authentication failed'));
          }
          break;

        case 'stream_start':
          setIsStreaming(true);
          setLoopIteration(message.payload.loopIteration);
          break;

        case 'stream_chunk': {
          const chunkMsg = message as WSStreamChunkMessage;
          setMessages(prev => {
            const lastMsg = prev[prev.length - 1];
            if (lastMsg?.id === `assistant-${chunkMsg.id}` && lastMsg.isStreaming) {
              return [
                ...prev.slice(0, -1),
                { ...lastMsg, content: lastMsg.content + chunkMsg.payload.content },
              ];
            }
            // Create new streaming message
            return [
              ...prev,
              {
                id: `assistant-${chunkMsg.id}`,
                role: 'assistant',
                content: chunkMsg.payload.content,
                timestamp: new Date(),
                isStreaming: true,
                toolCalls: [],
              },
            ];
          });
          break;
        }

        case 'stream_end':
          setMessages(prev => {
            const lastMsg = prev[prev.length - 1];
            if (lastMsg?.isStreaming) {
              return [...prev.slice(0, -1), { ...lastMsg, isStreaming: false }];
            }
            return prev;
          });
          if (!message.payload.hasMoreToolCalls) {
            setIsStreaming(false);
          }
          break;

        case 'tool_call_start': {
          const toolStartMsg = message as WSToolCallStartMessage;
          setCurrentToolCall(toolStartMsg.payload.toolName);
          setMessages(prev => {
            const lastMsg = prev[prev.length - 1];
            if (lastMsg?.role === 'assistant') {
              const existingCalls = lastMsg.toolCalls || [];
              return [
                ...prev.slice(0, -1),
                {
                  ...lastMsg,
                  toolCalls: [
                    ...existingCalls,
                    {
                      id: toolStartMsg.payload.toolCallId,
                      name: toolStartMsg.payload.toolName,
                      status: 'executing' as const,
                    },
                  ],
                },
              ];
            }
            return prev;
          });
          break;
        }

        case 'tool_call_result': {
          const toolResultMsg = message as WSToolCallResultMessage;
          setCurrentToolCall(null);
          setMessages(prev => {
            const lastMsg = prev[prev.length - 1];
            if (lastMsg?.role === 'assistant' && lastMsg.toolCalls) {
              return [
                ...prev.slice(0, -1),
                {
                  ...lastMsg,
                  toolCalls: lastMsg.toolCalls.map(tc =>
                    tc.id === toolResultMsg.payload.toolCallId
                      ? {
                          ...tc,
                          status: toolResultMsg.payload.success ? 'success' as const : 'error' as const,
                          result: toolResultMsg.payload.result,
                        }
                      : tc
                  ),
                },
              ];
            }
            return prev;
          });
          break;
        }

        case 'tool_loop_status':
          setLoopIteration(message.payload.iteration);
          if (message.payload.status === 'complete') {
            setIsStreaming(false);
            setCurrentToolCall(null);
          }
          break;

        case 'event_created': {
          const eventMsg = message as WSEventCreatedMessage;
          setMessages(prev => {
            const lastMsg = prev[prev.length - 1];
            if (lastMsg?.role === 'assistant') {
              const existingEvents = lastMsg.events || [];
              return [
                ...prev.slice(0, -1),
                {
                  ...lastMsg,
                  events: [...existingEvents, eventMsg.payload.event],
                },
              ];
            }
            return prev;
          });
          break;
        }

        case 'error':
          setError(new Error(message.payload.message));
          setIsStreaming(false);
          setCurrentToolCall(null);
          break;
      }
    } catch (err) {
      console.error('Failed to parse WebSocket message:', err);
    }
  }, []);

  // Connect to WebSocket
  const connect = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError(new Error('Not authenticated'));
        return;
      }

      const ws = new WebSocket(getWsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        // Authenticate immediately after connection
        const authMessage: WSClientMessage = {
          type: 'auth',
          payload: { token: session.access_token },
        };
        ws.send(JSON.stringify(authMessage));

        // Start heartbeat
        heartbeatIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 25000);
      };

      ws.onmessage = handleMessage;

      ws.onclose = () => {
        setIsConnected(false);
        setIsStreaming(false);
        setCurrentToolCall(null);

        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
        }

        // Attempt reconnect after 5 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 5000);
      };

      ws.onerror = (event) => {
        console.error('WebSocket error:', event);
        setError(new Error('WebSocket connection error'));
      };
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to connect'));
    }
  }, [getWsUrl, handleMessage]);

  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  }, []);

  // Send a chat message
  const sendMessage = useCallback((content: string) => {
    if (!content.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    const messageId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    currentMessageIdRef.current = messageId;

    // Add user message to state
    const userMessage: StreamingMessage = {
      id: `user-${messageId}`,
      role: 'user',
      content,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);
    setError(null);

    // Build chat history for context
    const chatHistory = messages.map(m => ({
      role: m.role,
      content: m.content,
    }));

    // Send via WebSocket
    const wsMessage: WSClientMessage = {
      type: 'chat',
      id: messageId,
      payload: {
        message: content,
        chatHistory,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    };

    wsRef.current.send(JSON.stringify(wsMessage));
  }, [messages]);

  // Clear chat history
  const clearHistory = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    messages,
    isConnected,
    isStreaming,
    currentToolCall,
    loopIteration,
    error,
    sendMessage,
    clearHistory,
    connect,
    disconnect,
  };
}
