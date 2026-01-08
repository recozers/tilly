import type { CSSProperties } from 'react';

// Convex event type
interface CalendarEvent {
  _id: string;
  title: string;
  startTime: number;
  endTime: number;
  color: string;
  description?: string;
  location?: string;
  allDay?: boolean;
  isRecurringInstance?: boolean;
  type: 'event';
  width?: number;
  left?: number;
  zIndex?: number;
}

interface EventCardProps {
  event: CalendarEvent;
  style?: CSSProperties;
  onClick?: () => void;
  onMouseDown?: (e: React.MouseEvent) => void;
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

export function EventCard({ event, style, onClick, onMouseDown }: EventCardProps): JSX.Element {
  const bgColor = event.color || '#4A7C2A';
  const textColor = getContrastColor(bgColor);
  const start = new Date(event.startTime);
  const end = new Date(event.endTime);

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
      onMouseDown={onMouseDown}
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
        {event.isRecurringInstance && <span className="event-recurring-icon" title="Recurring event">↻ </span>}
        {event.title}
      </div>
      {event.allDay ? (
        <div className="event-card-time">All day</div>
      ) : (
        <div className="event-card-time">
          {formatEventTime(start, end)}
        </div>
      )}
      {event.location && (
        <div className="event-card-location">📍 {event.location}</div>
      )}
    </div>
  );
}
