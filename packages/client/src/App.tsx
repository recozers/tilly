import { useState, useCallback } from 'react';
import { useAuthContext } from './contexts/AuthContext.js';
import { useEvents } from './hooks/useEvents.js';
import { AuthModal } from './components/Auth/AuthModal.js';
import { Calendar } from './components/Calendar/index.js';
import { Chat } from './components/Chat/index.js';
import { EventModal } from './components/EventModal/index.js';
import { Settings } from './components/Settings/Settings.js';
import type { Id } from '../../../convex/_generated/dataModel';

// Local types that match Convex schema
// _id can be either Id<"events"> or string (for recurring event instances)
interface CalendarEvent {
  _id: Id<"events"> | string;
  title: string;
  startTime: number;
  endTime: number;
  color: string;
  description?: string;
  location?: string;
  allDay?: boolean;
  timezone?: string;
  reminders?: number[];
  isRecurringInstance?: boolean;
  originalEventId?: string;
  type: 'event';
}

interface CreateEventData {
  title: string;
  startTime: number;
  endTime: number;
  color?: string;
  description?: string;
  location?: string;
  allDay?: boolean;
  timezone?: string;
  reminders?: number[];
}

interface UpdateEventData {
  title?: string;
  startTime?: number;
  endTime?: number;
  color?: string;
  description?: string;
  location?: string;
  allDay?: boolean;
  timezone?: string;
  reminders?: number[];
}

/**
 * Main App component - Tilly Calendar Application
 */
export default function App(): JSX.Element {
  const { user, isLoading: authLoading, isAuthenticated, signOut } = useAuthContext();
  const { events, isLoading: eventsLoading, createEvent, updateEvent, deleteEvent, refetch } = useEvents();

  // Modal state
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [newEventDate, setNewEventDate] = useState<Date | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Handle event click from calendar
  const handleEventClick = useCallback((event: CalendarEvent) => {
    setSelectedEvent(event);
    setNewEventDate(null);
    setIsModalOpen(true);
  }, []);

  // Handle time slot click from calendar (create new event)
  const handleTimeSlotClick = useCallback((date: Date) => {
    setSelectedEvent(null);
    setNewEventDate(date);
    setIsModalOpen(true);
  }, []);

  // Handle save event (create or update)
  const handleSaveEvent = useCallback(async (data: CreateEventData | UpdateEventData) => {
    if (selectedEvent) {
      // For recurring instances, use the original event ID
      const eventId = selectedEvent.originalEventId ?? selectedEvent._id;
      await updateEvent(eventId as Id<"events">, data as UpdateEventData);
    } else {
      await createEvent(data as CreateEventData);
    }
  }, [selectedEvent, createEvent, updateEvent]);

  // Handle delete event
  const handleDeleteEvent = useCallback(async (id: Id<"events"> | string) => {
    await deleteEvent(id as Id<"events">);
  }, [deleteEvent]);

  // Handle drag-and-drop event reschedule
  const handleEventDrop = useCallback(async (eventId: string, newStartTime: number, newEndTime: number) => {
    await updateEvent(eventId as Id<"events">, {
      startTime: newStartTime,
      endTime: newEndTime,
    });
  }, [updateEvent]);

  // Close modal
  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setSelectedEvent(null);
    setNewEventDate(null);
  }, []);

  // Refresh events when chat creates new ones
  const handleEventCreated = useCallback(() => {
    refetch();
  }, [refetch]);

  // Show auth modal if not authenticated
  if (!authLoading && !isAuthenticated) {
    return <AuthModal />;
  }

  // Show loading state
  if (authLoading || eventsLoading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner" />
        <p>Loading Tilly...</p>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-left">
          <h1 className="app-logo">
            <span className="logo-icon">🌱</span>
            Tilly
          </h1>
        </div>
        <div className="header-right">
          {user?.email && <span className="user-email">{user.email}</span>}
          <button className="btn-new-event" onClick={() => handleTimeSlotClick(new Date())}>
            + New Event
          </button>
          <button className="btn-settings" onClick={() => setIsSettingsOpen(true)} aria-label="Settings">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          <button className="btn-logout" onClick={signOut}>
            Sign Out
          </button>
        </div>
      </header>

      <main className="app-main">
        <section className="calendar-section">
          <Calendar
            events={events as CalendarEvent[]}
            onEventClick={handleEventClick}
            onTimeSlotClick={handleTimeSlotClick}
            onEventDrop={handleEventDrop}
          />
        </section>

        <aside className="chat-section">
          <Chat onEventCreated={handleEventCreated} />
        </aside>
      </main>

      {isModalOpen && (
        <EventModal
          event={selectedEvent}
          initialDate={newEventDate}
          onSave={handleSaveEvent}
          onDelete={selectedEvent ? () => handleDeleteEvent(selectedEvent.originalEventId ?? selectedEvent._id) : undefined}
          onClose={handleCloseModal}
        />
      )}

      <Settings isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  );
}
