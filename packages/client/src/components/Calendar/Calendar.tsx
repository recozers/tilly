import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { EventCard } from './EventCard.js';
import { CalendarHeader } from './CalendarHeader.js';
import './Calendar.css';

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
}

interface EventWithLayout extends CalendarEvent {
  width: number;
  left: number;
  zIndex: number;
}

interface CalendarProps {
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
  onTimeSlotClick?: (date: Date) => void;
  onEventDrop?: (eventId: string, newStartTime: number, newEndTime: number) => void;
}

// Drag state tracking for timed events
interface DragState {
  eventId: string;
  originalEventId?: string;
  startY: number;
  startDayIndex: number;
  originalStartTime: number;
  originalEndTime: number;
  duration: number;
}

// Drag state for all-day events (horizontal only)
interface AllDayDragState {
  eventId: string;
  originalEventId?: string;
  startDayIndex: number;
  originalStartTime: number;
  originalEndTime: number;
}

// Full 24-hour view with scrolling
const HOURS_IN_DAY = 24;
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
  if (hour === 0 || hour === 24) return '12 AM';
  if (hour === 12) return '12 PM';
  if (hour < 12) return `${hour} AM`;
  return `${hour - 12} PM`;
}

function getAllDayEvents(events: CalendarEvent[], dayStart: Date): CalendarEvent[] {
  return events.filter(e => {
    if (!e.allDay) return false;
    const eventStart = new Date(e.startTime);
    const eventEnd = new Date(e.endTime);

    // All-day events are stored in UTC, so use UTC getters to avoid timezone shifting
    // This ensures Jan 15 UTC stays as Jan 15 regardless of local timezone
    const eventStartDate = Date.UTC(eventStart.getUTCFullYear(), eventStart.getUTCMonth(), eventStart.getUTCDate());
    const eventEndDate = Date.UTC(eventEnd.getUTCFullYear(), eventEnd.getUTCMonth(), eventEnd.getUTCDate());

    // The display day should also be compared as a UTC date
    // dayStart is a local date representing "which calendar day the user is looking at"
    // We compare against the local date components to match user expectation
    const dayDate = Date.UTC(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate());

    // Check if the day falls within the event's date range (inclusive)
    return dayDate >= eventStartDate && dayDate <= eventEndDate;
  });
}

function calculateEventLayout(events: CalendarEvent[], dayStart: Date): EventWithLayout[] {
  // Filter out all-day events - they're shown separately
  const dayEvents = events.filter(e => {
    if (e.allDay) return false;
    const start = new Date(e.startTime);
    return isSameDay(start, dayStart);
  });

  // Sort by start time, then by duration (longer first)
  dayEvents.sort((a, b) => {
    const startDiff = a.startTime - b.startTime;
    if (startDiff !== 0) return startDiff;
    const aDuration = a.endTime - a.startTime;
    const bDuration = b.endTime - b.startTime;
    return bDuration - aDuration;
  });

  const columns: CalendarEvent[][] = [];

  for (const event of dayEvents) {
    const eventStart = event.startTime;

    // Find first column where this event fits
    let placed = false;
    for (let i = 0; i < columns.length; i++) {
      const lastInColumn = columns[i][columns[i].length - 1];
      const lastEnd = lastInColumn.endTime;
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

export function Calendar({ events, onEventClick, onTimeSlotClick, onEventDrop }: CalendarProps): JSX.Element {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentTime, setCurrentTime] = useState(new Date());
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const hasScrolledRef = useRef(false);

  // Drag-and-drop state for timed events
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dragPreview, setDragPreview] = useState<{ dayIndex: number; top: number } | null>(null);
  const dayBodiesRef = useRef<HTMLDivElement>(null);

  // Drag-and-drop state for all-day events
  const [allDayDragState, setAllDayDragState] = useState<AllDayDragState | null>(null);
  const [allDayDragPreview, setAllDayDragPreview] = useState<number | null>(null); // dayIndex
  const allDayRowRef = useRef<HTMLDivElement>(null);

  const weekStart = useMemo(() => getStartOfWeek(currentDate), [currentDate]);

  const weekDays = useMemo(() => {
    return Array.from({ length: DAYS_IN_WEEK }, (_, i) => addDays(weekStart, i));
  }, [weekStart]);

  const eventsByDay = useMemo(() => {
    return weekDays.map(day => calculateEventLayout(events, day));
  }, [events, weekDays]);

  const allDayEventsByDay = useMemo(() => {
    return weekDays.map(day => getAllDayEvents(events, day));
  }, [events, weekDays]);

  // Check if there are any all-day events this week
  const hasAllDayEvents = allDayEventsByDay.some(dayEvents => dayEvents.length > 0);
  const maxAllDayEvents = Math.max(...allDayEventsByDay.map(dayEvents => dayEvents.length), 0);

  // All 24 hours
  const hoursToShow = useMemo(() => {
    return Array.from({ length: HOURS_IN_DAY }, (_, i) => i);
  }, []);

  // Update current time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Scroll to current time on mount
  const scrollToCurrentTime = useCallback(() => {
    if (scrollContainerRef.current) {
      const now = new Date();
      const currentHour = now.getHours();
      const currentMinutes = now.getMinutes();

      // Calculate scroll position to center current time in view
      const scrollPosition = (currentHour * HOUR_HEIGHT) + (currentMinutes * HOUR_HEIGHT / 60);
      const containerHeight = scrollContainerRef.current.clientHeight;
      const targetScroll = Math.max(0, scrollPosition - containerHeight / 3);

      scrollContainerRef.current.scrollTo({
        top: targetScroll,
        behavior: hasScrolledRef.current ? 'smooth' : 'auto'
      });
      hasScrolledRef.current = true;
    }
  }, []);

  // Scroll to current time on initial load
  useEffect(() => {
    const timer = setTimeout(scrollToCurrentTime, 100);
    return () => clearTimeout(timer);
  }, [scrollToCurrentTime]);

  const handlePrevWeek = () => {
    setCurrentDate(prev => addDays(prev, -7));
  };

  const handleNextWeek = () => {
    setCurrentDate(prev => addDays(prev, 7));
  };

  const handleToday = () => {
    setCurrentDate(new Date());
    setTimeout(scrollToCurrentTime, 50);
  };

  const handleTimeSlotClick = (dayIndex: number, hour: number) => {
    if (onTimeSlotClick) {
      const date = new Date(weekDays[dayIndex]);
      date.setHours(hour, 0, 0, 0);
      onTimeSlotClick(date);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if not in an input field
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === 'ArrowLeft' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handlePrevWeek();
      } else if (e.key === 'ArrowRight' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleNextWeek();
      } else if (e.key === 't' && !e.metaKey && !e.ctrlKey) {
        // Press 't' to go to today (like Google Calendar)
        handleToday();
      } else if (e.key === 'Escape' && (dragState || allDayDragState)) {
        // Cancel drag on Escape
        setDragState(null);
        setDragPreview(null);
        setAllDayDragState(null);
        setAllDayDragPreview(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dragState, allDayDragState]);

  // Drag-and-drop handlers
  const handleDragStart = useCallback((
    e: React.MouseEvent,
    event: CalendarEvent,
    dayIndex: number
  ) => {
    // Don't start drag if clicking on recurring instance (edit original instead)
    // Or if no drop handler provided
    if (!onEventDrop) return;

    e.preventDefault();
    e.stopPropagation();

    const rect = dayBodiesRef.current?.getBoundingClientRect();
    if (!rect) return;

    const duration = event.endTime - event.startTime;

    setDragState({
      eventId: event._id,
      originalEventId: (event as CalendarEvent & { originalEventId?: string }).originalEventId,
      startY: e.clientY,
      startDayIndex: dayIndex,
      originalStartTime: event.startTime,
      originalEndTime: event.endTime,
      duration,
    });

    // Calculate initial preview position
    const start = new Date(event.startTime);
    const startMinutes = start.getHours() * 60 + start.getMinutes();
    const top = (startMinutes / 60) * HOUR_HEIGHT;
    setDragPreview({ dayIndex, top });
  }, [onEventDrop]);

  const handleDragMove = useCallback((e: MouseEvent) => {
    if (!dragState || !dayBodiesRef.current) return;

    const rect = dayBodiesRef.current.getBoundingClientRect();
    const dayWidth = rect.width / DAYS_IN_WEEK;

    // Calculate which day column we're over
    const relativeX = e.clientX - rect.left;
    const dayIndex = Math.max(0, Math.min(DAYS_IN_WEEK - 1, Math.floor(relativeX / dayWidth)));

    // Calculate vertical position (with snapping to 15-min intervals)
    // getBoundingClientRect() returns viewport-relative coords, which already
    // accounts for the scroll offset of the parent container, so no need to add scrollTop.
    const relativeY = e.clientY - rect.top;
    const rawMinutes = (relativeY / HOUR_HEIGHT) * 60;
    const snappedMinutes = Math.round(rawMinutes / 15) * 15; // Snap to 15-min
    const top = (snappedMinutes / 60) * HOUR_HEIGHT;

    // Clamp to valid range
    const maxTop = (24 * 60 - dragState.duration / 60000) / 60 * HOUR_HEIGHT;
    const clampedTop = Math.max(0, Math.min(maxTop, top));

    setDragPreview({ dayIndex, top: clampedTop });
  }, [dragState]);

  const handleDragEnd = useCallback((_e: MouseEvent) => {
    if (!dragState || !dragPreview || !onEventDrop || !dayBodiesRef.current) {
      setDragState(null);
      setDragPreview(null);
      return;
    }

    // Calculate new times
    const newDay = weekDays[dragPreview.dayIndex];
    const newMinutes = (dragPreview.top / HOUR_HEIGHT) * 60;
    const newHours = Math.floor(newMinutes / 60);
    const newMins = Math.round(newMinutes % 60);

    const newStart = new Date(newDay);
    newStart.setHours(newHours, newMins, 0, 0);
    const newStartTime = newStart.getTime();
    const newEndTime = newStartTime + dragState.duration;

    // Only update if actually moved
    if (newStartTime !== dragState.originalStartTime) {
      // Use original event ID for recurring instances
      const idToUpdate = dragState.originalEventId || dragState.eventId;
      onEventDrop(idToUpdate, newStartTime, newEndTime);
    }

    setDragState(null);
    setDragPreview(null);
  }, [dragState, dragPreview, onEventDrop, weekDays]);

  // Global mouse event listeners for timed event dragging
  useEffect(() => {
    if (!dragState) return;

    window.addEventListener('mousemove', handleDragMove);
    window.addEventListener('mouseup', handleDragEnd);
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';

    return () => {
      window.removeEventListener('mousemove', handleDragMove);
      window.removeEventListener('mouseup', handleDragEnd);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [dragState, handleDragMove, handleDragEnd]);

  // All-day event drag handlers
  const handleAllDayDragStart = useCallback((
    e: React.MouseEvent,
    event: CalendarEvent,
    dayIndex: number
  ) => {
    if (!onEventDrop) return;

    e.preventDefault();
    e.stopPropagation();

    setAllDayDragState({
      eventId: event._id,
      originalEventId: (event as CalendarEvent & { originalEventId?: string }).originalEventId,
      startDayIndex: dayIndex,
      originalStartTime: event.startTime,
      originalEndTime: event.endTime,
    });
    setAllDayDragPreview(dayIndex);
  }, [onEventDrop]);

  const handleAllDayDragMove = useCallback((e: MouseEvent) => {
    if (!allDayDragState || !allDayRowRef.current) return;

    const rect = allDayRowRef.current.getBoundingClientRect();
    const dayWidth = rect.width / DAYS_IN_WEEK;

    const relativeX = e.clientX - rect.left;
    const dayIndex = Math.max(0, Math.min(DAYS_IN_WEEK - 1, Math.floor(relativeX / dayWidth)));

    setAllDayDragPreview(dayIndex);
  }, [allDayDragState]);

  const handleAllDayDragEnd = useCallback((_e: MouseEvent) => {
    if (!allDayDragState || allDayDragPreview === null || !onEventDrop) {
      setAllDayDragState(null);
      setAllDayDragPreview(null);
      return;
    }

    // Calculate day difference
    const dayDiff = allDayDragPreview - allDayDragState.startDayIndex;

    if (dayDiff !== 0) {
      // Shift both start and end by the same number of days
      const msPerDay = 24 * 60 * 60 * 1000;
      const newStartTime = allDayDragState.originalStartTime + (dayDiff * msPerDay);
      const newEndTime = allDayDragState.originalEndTime + (dayDiff * msPerDay);

      const idToUpdate = allDayDragState.originalEventId || allDayDragState.eventId;
      onEventDrop(idToUpdate, newStartTime, newEndTime);
    }

    setAllDayDragState(null);
    setAllDayDragPreview(null);
  }, [allDayDragState, allDayDragPreview, onEventDrop]);

  // Global mouse event listeners for all-day dragging
  useEffect(() => {
    if (!allDayDragState) return;

    window.addEventListener('mousemove', handleAllDayDragMove);
    window.addEventListener('mouseup', handleAllDayDragEnd);
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';

    return () => {
      window.removeEventListener('mousemove', handleAllDayDragMove);
      window.removeEventListener('mouseup', handleAllDayDragEnd);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [allDayDragState, handleAllDayDragMove, handleAllDayDragEnd]);

  const today = new Date();

  // Calculate current time indicator position in pixels
  const currentTimePosition = useMemo(() => {
    const hours = currentTime.getHours();
    const minutes = currentTime.getMinutes();
    return (hours * HOUR_HEIGHT) + (minutes * HOUR_HEIGHT / 60);
  }, [currentTime]);

  // Find which day column is today
  const todayColumnIndex = weekDays.findIndex(day => isSameDay(day, today));

  return (
    <div className="calendar">
      <CalendarHeader
        weekStart={weekStart}
        onPrevWeek={handlePrevWeek}
        onNextWeek={handleNextWeek}
        onToday={handleToday}
      />

      <div className="calendar-grid-wrapper" ref={scrollContainerRef}>
        <div className="calendar-grid">
          {/* Time column */}
          <div className="calendar-time-column">
            <div className="calendar-time-header" />
            {hasAllDayEvents && (
              <div
                className="calendar-time-allday"
                style={{ minHeight: `${Math.max(maxAllDayEvents * 26 + 4, 30)}px` }}
              >
                <span className="calendar-time-allday-label">All day</span>
              </div>
            )}
            <div className="calendar-time-slots">
              {hoursToShow.map(hour => (
                <div key={hour} className="calendar-time-slot">
                  <span className="calendar-time-label">{formatHour(hour)}</span>
                </div>
              ))}
              {/* End label for the last hour boundary */}
              <div className="calendar-time-slot calendar-time-slot-end">
                <span className="calendar-time-label">{formatHour(hoursToShow[hoursToShow.length - 1] + 1)}</span>
              </div>
            </div>
          </div>

          {/* Day columns */}
          <div className="calendar-days-container">
            {/* Day headers row */}
            <div className="calendar-day-headers">
              {weekDays.map((day, dayIndex) => {
                const isToday = isSameDay(day, today);
                return (
                  <div key={dayIndex} className={`calendar-day-header ${isToday ? 'today' : ''}`}>
                    <span className="calendar-day-name">
                      {day.toLocaleDateString('en-US', { weekday: 'short' })}
                    </span>
                    <span className={`calendar-day-number ${isToday ? 'today' : ''}`}>
                      {day.getDate()}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* All-day events row */}
            {hasAllDayEvents && (
              <div className="calendar-allday-row" ref={allDayRowRef}>
                {weekDays.map((day, dayIndex) => {
                  const isToday = isSameDay(day, today);
                  const dayAllDayEvents = allDayEventsByDay[dayIndex];
                  const isDragPreviewDay = allDayDragPreview === dayIndex;
                  return (
                    <div
                      key={dayIndex}
                      className={`calendar-allday-cell ${isToday ? 'is-today' : ''}`}
                      style={{ minHeight: `${Math.max(maxAllDayEvents * 26 + 4, 30)}px` }}
                    >
                      {dayAllDayEvents.map((event, eventIndex) => {
                        const isDragging = allDayDragState?.eventId === event._id;
                        return (
                          <div
                            key={event._id}
                            className={`calendar-allday-event ${isDragging ? 'dragging' : ''}`}
                            style={{
                              backgroundColor: event.color,
                              top: `${eventIndex * 26 + 2}px`,
                              opacity: isDragging ? 0.5 : 1,
                              cursor: onEventDrop ? 'grab' : 'pointer',
                            }}
                            onClick={() => !allDayDragState && onEventClick?.(event)}
                            onMouseDown={(e) => handleAllDayDragStart(e, event, dayIndex)}
                          >
                            <span className="calendar-allday-event-title">{event.title}</span>
                          </div>
                        );
                      })}
                      {/* Drag preview for all-day events */}
                      {allDayDragState && isDragPreviewDay && (
                        <div
                          className="calendar-allday-event calendar-allday-event-preview"
                          style={{
                            backgroundColor: events.find(e => e._id === allDayDragState.eventId)?.color || '#4A7C2A',
                            top: '2px',
                          }}
                        >
                          <span className="calendar-allday-event-title">
                            {events.find(e => e._id === allDayDragState.eventId)?.title}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Day bodies container - with current time indicator */}
            <div className="calendar-day-bodies" ref={dayBodiesRef}>
              {/* Current time indicator (spans all days) */}
              {todayColumnIndex !== -1 && (
                <div
                  className="calendar-current-time-line"
                  style={{ top: `${currentTimePosition}px` }}
                >
                  <div
                    className="calendar-current-time-dot"
                    style={{ left: `calc(${(todayColumnIndex / DAYS_IN_WEEK) * 100}% + ${100 / DAYS_IN_WEEK / 2}%)` }}
                  />
                </div>
              )}

              {weekDays.map((day, dayIndex) => {
                const isToday = isSameDay(day, today);
                return (
                  <div key={dayIndex} className={`calendar-day-body ${isToday ? 'is-today' : ''}`}>
                    {hoursToShow.map(hour => (
                      <div
                        key={hour}
                        className={`calendar-hour-slot ${hour === currentTime.getHours() && isToday ? 'current-hour' : ''}`}
                        onClick={() => handleTimeSlotClick(dayIndex, hour)}
                      />
                    ))}
                    {/* Events overlay */}
                    <div className="calendar-events-container">
                      {eventsByDay[dayIndex].map(event => {
                        const start = new Date(event.startTime);
                        const end = new Date(event.endTime);
                        const startMinutes = start.getHours() * 60 + start.getMinutes();
                        const endMinutes = end.getHours() * 60 + end.getMinutes();
                        const duration = Math.max(endMinutes - startMinutes, 30);
                        // Pixel-based positioning
                        const top = (startMinutes / 60) * HOUR_HEIGHT;
                        const height = (duration / 60) * HOUR_HEIGHT;
                        const isDragging = dragState?.eventId === event._id;

                        return (
                          <EventCard
                            key={event._id}
                            event={event}
                            style={{
                              top: `${top}px`,
                              height: `${Math.max(height, 24)}px`,
                              left: `${event.left}%`,
                              width: `calc(${event.width}% - 4px)`,
                              zIndex: isDragging ? 1000 : event.zIndex,
                              opacity: isDragging ? 0.5 : 1,
                              cursor: onEventDrop ? 'grab' : 'pointer',
                            }}
                            onClick={() => !dragState && onEventClick?.(event)}
                            onMouseDown={(e) => handleDragStart(e, event, dayIndex)}
                          />
                        );
                      })}

                      {/* Drag preview ghost */}
                      {dragState && dragPreview && dragPreview.dayIndex === dayIndex && (
                        <div
                          className="event-card event-card-drag-preview"
                          style={{
                            top: `${dragPreview.top}px`,
                            height: `${(dragState.duration / 60000 / 60) * HOUR_HEIGHT}px`,
                            left: '0',
                            width: 'calc(100% - 4px)',
                            zIndex: 999,
                            backgroundColor: events.find(e => e._id === dragState.eventId)?.color || '#4A7C2A',
                          }}
                        >
                          <div className="event-card-title">
                            {events.find(e => e._id === dragState.eventId)?.title}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
