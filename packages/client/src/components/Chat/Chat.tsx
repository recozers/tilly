import { useState, useRef, useEffect } from 'react';
import { useChat } from '../../hooks/useChat.js';
import { ChatMessage } from './ChatMessage.js';
import { ToolCallIndicator } from './ToolCallIndicator.js';
import './Chat.css';

interface ChatProps {
  onEventCreated?: () => void;
}

export function Chat({ onEventCreated }: ChatProps): JSX.Element {
  const {
    messages,
    isLoading,
    error,
    sendMessage,
    clearHistory,
  } = useChat();

  // With fetch-based streaming, we're always "connected"
  const isConnected = true;
  const isStreaming = isLoading || messages.some(m => m.isStreaming);
  const currentToolCall = null; // Tool calls are handled differently now
  const loopIteration = 0;

  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  // Notify parent when events are created
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.events && lastMessage.events.length > 0) {
      onEventCreated?.();
    }
  }, [messages, onEventCreated]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || !isConnected || isStreaming) return;

    sendMessage(inputValue.trim());
    setInputValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="chat">
      <div className="chat-header">
        <h2 className="chat-title">Chat with Tilly</h2>
        <div className="chat-status">
          <span className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`} />
          <span className="status-text">
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
        {messages.length > 0 && (
          <button
            className="chat-clear-btn"
            onClick={clearHistory}
            disabled={isStreaming}
            aria-label="Clear chat history"
          >
            Clear
          </button>
        )}
      </div>

      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty">
            <div className="chat-empty-icon">🌱</div>
            <h3>Hi, I'm Tilly!</h3>
            <p>I can help you manage your calendar. Try asking me to:</p>
            <ul>
              <li>"Schedule a meeting with Sarah tomorrow at 2pm"</li>
              <li>"What's on my calendar this week?"</li>
              <li>"Move my dentist appointment to Friday"</li>
              <li>"Delete the team standup event"</li>
            </ul>
          </div>
        )}

        {messages.map((message) => (
          <ChatMessage key={message.id} message={message} />
        ))}

        {isStreaming && currentToolCall && (
          <ToolCallIndicator
            toolName={currentToolCall}
            iteration={loopIteration}
          />
        )}

        {error && (
          <div className="chat-error">
            <span className="error-icon">⚠️</span>
            <span>{error.message}</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <form className="chat-input-form" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          type="text"
          className="chat-input"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isConnected ? 'Ask Tilly...' : 'Connecting...'}
          disabled={!isConnected || isStreaming}
          aria-label="Chat message input"
        />
        <button
          type="submit"
          className="chat-send-btn"
          disabled={!isConnected || isStreaming || !inputValue.trim()}
        >
          {isStreaming ? (
            <span className="send-loading">●●●</span>
          ) : (
            <span className="send-icon">→</span>
          )}
        </button>
      </form>
    </div>
  );
}
