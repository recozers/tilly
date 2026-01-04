import type { Event } from '@tilly/shared';

interface ToolCall {
  id: string;
  name: string;
  status: 'pending' | 'executing' | 'success' | 'error';
  result?: unknown;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  events?: Event[];
  toolCalls?: ToolCall[];
}

interface ChatMessageProps {
  message: Message;
}

function formatToolName(name: string): string {
  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function ChatMessage({ message }: ChatMessageProps): JSX.Element {
  const isUser = message.role === 'user';

  return (
    <div className={`chat-message ${isUser ? 'user' : 'assistant'}`}>
      <div className="message-avatar">
        {isUser ? '👤' : '🌱'}
      </div>
      <div className="message-content">
        <div className="message-header">
          <span className="message-sender">{isUser ? 'You' : 'Tilly'}</span>
          <span className="message-time">{formatTime(new Date(message.timestamp))}</span>
        </div>
        <div className="message-text">
          {message.content}
          {message.isStreaming && <span className="typing-cursor">▌</span>}
        </div>

        {/* Tool calls display */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="message-tool-calls">
            {message.toolCalls.map((tc) => (
              <div key={tc.id} className={`tool-call ${tc.status}`}>
                <span className="tool-call-icon">
                  {tc.status === 'executing' ? '⏳' :
                   tc.status === 'success' ? '✓' :
                   tc.status === 'error' ? '✗' : '○'}
                </span>
                <span className="tool-call-name">{formatToolName(tc.name)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Created events display */}
        {message.events && message.events.length > 0 && (
          <div className="message-events">
            {message.events.map((event) => (
              <div key={event.id} className="created-event">
                <span className="event-icon">📅</span>
                <div className="event-details">
                  <span className="event-title">{event.title}</span>
                  <span className="event-time">
                    {new Date(event.start).toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}
                    {' at '}
                    {new Date(event.start).toLocaleTimeString('en-US', {
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true,
                    })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
