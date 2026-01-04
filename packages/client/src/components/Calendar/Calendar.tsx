import { useMemo, useState } from 'react';
import type { TypedEvent, EventWithLayout } from '@tilly/shared';
import { EventCard } from './EventCard.js';
import { CalendarHeader } from './CalendarHeader.js';
import './Calendar.css';

interface CalendarProps {
  events: TypedEvent[];
  onEventClick?: (event: TypedEvent) => void;
  onTimeSlotClick?: (date: Date) => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DAYS_IN_WEEK = 7;
const HOUR_HEIGHT = 60; // pixels per hour

function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day;
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatHour(hour: number): string {
  if (hour === 0) return '12 AM';
  if (hour === 12) return '12 PM';
  if (hour < 12) return `${hour} AM`;
  return `${hour - 12} PM`;
}

function calculateEventLayout(events: TypedEvent[], dayStart: Date): EventWithLayout[] {
  const dayEvents = events.filter(e => {
    const start = new Date(e.start);
    return isSameDay(start, dayStart);
  });

  // Sort by start time, then by duration (longer first)
  dayEvents.sort((a, b) => {
    const startDiff = new Date(a.start).getTime() - new Date(b.start).getTime();
    if (startDiff !== 0) return startDiff;
    const aDuration = new Date(a.end).getTime() - new Date(a.start).getTime();
    const bDuration = new Date(b.end).getTime() - new Date(b.start).getTime();
    return bDuration - aDuration;
  });

  const columns: TypedEvent[][] = [];

  for (const event of dayEvents) {
    const eventStart = new Date(event.start).getTime();

    // Find first column where this event fits
    let placed = false;
    for (let i = 0; i < columns.length; i++) {
      const lastInColumn = columns[i][columns[i].length - 1];
      const lastEnd = new Date(lastInColumn.end).getTime();
      if (eventStart >= lastEnd) {
        columns[i].push(event);
        placed = true;
        break;
      }
    }

    if (!placed) {
      columns.push([event]);
    }
  }

  // Calculate width and position for each event
  const result: EventWithLayout[] = [];
  const numColumns = columns.length;

  for (let colIndex = 0; colIndex < columns.length; colIndex++) {
    for (const event of columns[colIndex]) {
      result.push({
        ...event,
        width: 100 / numColumns,
        left: (colIndex / numColumns) * 100,
        zIndex: colIndex + 1,
      });
    }
  }

  return result;
}

export function Calendar({ events, onEventClick, onTimeSlotClick }: CalendarProps): JSX.Element {
  const [currentDate, setCurrentDate] = useState(new Date());

  const weekStart = useMemo(() => getStartOfWeek(currentDate), [currentDate]);

  const weekDays = useMemo(() => {
    return Array.from({ length: DAYS_IN_WEEK }, (_, i) => addDays(weekStart, i));
  }, [weekStart]);

  const eventsByDay = useMemo(() => {
    return weekDays.map(day => calculateEventLayout(events, day));
  }, [events, weekDays]);

  const handlePrevWeek = () => {
    setCurrentDate(prev => addDays(prev, -7));
  };

  const handleNextWeek = () => {
    setCurrentDate(prev => addDays(prev, 7));
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const handleTimeSlotClick = (dayIndex: number, hour: number) => {
    if (onTimeSlotClick) {
      const date = new Date(weekDays[dayIndex]);
      date.setHours(hour, 0, 0, 0);
      onTimeSlotClick(date);
    }
  };

  const today = new Date();

  return (
    <div className="calendar">
      <CalendarHeader
        weekStart={weekStart}
        onPrevWeek={handlePrevWeek}
        onNextWeek={handleNextWeek}
        onToday={handleToday}
      />

      <div className="calendar-grid">
        {/* Time column */}
        <div className="calendar-time-column">
          <div className="calendar-corner" />
          {HOURS.map(hour => (
            <div key={hour} className="calendar-time-slot">
              <span className="calendar-time-label">{formatHour(hour)}</span>
            </div>
          ))}
        </div>

        {/* Day columns */}
        {weekDays.map((day, dayIndex) => {
          const isToday = isSameDay(day, today);
          return (
            <div key={dayIndex} className="calendar-day-column">
              <div className={`calendar-day-header ${isToday ? 'today' : ''}`}>
                <span className="calendar-day-name">
                  {day.toLocaleDateString('en-US', { weekday: 'short' })}
                </span>
                <span className={`calendar-day-number ${isToday ? 'today' : ''}`}>
                  {day.getDate()}
                </span>
              </div>
              <div className="calendar-day-body">
                {HOURS.map(hour => (
                  <div
                    key={hour}
                    className="calendar-hour-slot"
                    onClick={() => handleTimeSlotClick(dayIndex, hour)}
                  />
                ))}
                {/* Events overlay */}
                <div className="calendar-events-container">
                  {eventsByDay[dayIndex].map(event => {
                    const start = new Date(event.start);
                    const end = new Date(event.end);
                    const startMinutes = start.getHours() * 60 + start.getMinutes();
                    const endMinutes = end.getHours() * 60 + end.getMinutes();
                    const duration = Math.max(endMinutes - startMinutes, 30);
                    const top = (startMinutes / 60) * HOUR_HEIGHT;
                    const height = (duration / 60) * HOUR_HEIGHT;

                    return (
                      <EventCard
                        key={event.id}
                        event={event}
                        style={{
                          top: `${top}px`,
                          height: `${Math.max(height, 24)}px`,
                          left: `${event.left}%`,
                          width: `calc(${event.width}% - 4px)`,
                          zIndex: event.zIndex,
                        }}
                        onClick={() => onEventClick?.(event)}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
