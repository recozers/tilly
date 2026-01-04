import type { CSSProperties } from 'react';
import type { EventWithLayout, TypedEvent } from '@tilly/shared';

interface EventCardProps {
  event: EventWithLayout | TypedEvent;
  style?: CSSProperties;
  onClick?: () => void;
}

function getContrastColor(hexColor: string): string {
  // Remove # if present
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  // Calculate relative luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#1b1f1e' : '#ffffff';
}

function formatEventTime(start: Date, end: Date): string {
  const startTime = start.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  const endTime = end.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return `${startTime} - ${endTime}`;
}

export function EventCard({ event, style, onClick }: EventCardProps): JSX.Element {
  const bgColor = event.color || '#4A7C2A';
  const textColor = getContrastColor(bgColor);
  const start = new Date(event.start);
  const end = new Date(event.end);

  const typeIndicator = event.type === 'meeting_request' ? '📩 ' :
                        event.type === 'sent_meeting_request' ? '📤 ' : '';

  return (
    <div
      className="event-card"
      style={{
        ...style,
        backgroundColor: bgColor,
        color: textColor,
        borderLeft: `3px solid ${textColor}40`,
      }}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
    >
      <div className="event-card-title">
        {typeIndicator}{event.title}
      </div>
      <div className="event-card-time">
        {formatEventTime(start, end)}
      </div>
      {event.location && (
        <div className="event-card-location">📍 {event.location}</div>
      )}
    </div>
  );
}
