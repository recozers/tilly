import { useState, useCallback } from 'react';
import { useAuthContext } from './contexts/AuthContext.js';
import { useEvents } from './hooks/useEvents.js';
import { AuthModal } from './components/Auth/AuthModal.js';
import { Calendar } from './components/Calendar/index.js';
import { Chat } from './components/Chat/index.js';
import { EventModal } from './components/EventModal/index.js';
import { Settings } from './components/Settings/Settings.js';
import { HeaderMenu } from './components/HeaderMenu/index.js';
import type { MenuTab } from './components/HeaderMenu/index.js';
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
  const { events, isLoading: eventsLoading, createEvent, updateEvent, deleteEvent, addExdateAndCreateException, refetch } = useEvents();

  // Modal state
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [newEventDate, setNewEventDate] = useState<Date | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<MenuTab>('friends');

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
  const handleEventDrop = useCallback(async (
    eventId: string,
    newStartTime: number,
    newEndTime: number,
    isRecurringInstance?: boolean,
    originalEventId?: string,
    originalStartTime?: number,
  ) => {
    if (isRecurringInstance && originalEventId && originalStartTime !== undefined) {
      const editAll = window.confirm(
        'Move all events in this series?\n\nOK = All events\nCancel = This event only'
      );

      if (editAll) {
        // Shift entire recurrence by the same delta
        const delta = newStartTime - originalStartTime;
        const parentEvent = events.find(e => e._id === originalEventId);
        if (parentEvent) {
          await updateEvent(originalEventId as Id<"events">, {
            startTime: parentEvent.startTime + delta,
            endTime: parentEvent.endTime + delta,
            dtstart: (parentEvent.startTime + delta),
          });
        }
      } else {
        // Move this instance only: exclude from parent + create standalone copy
        await addExdateAndCreateException(
          originalEventId as Id<"events">,
          originalStartTime,
          newStartTime,
          newEndTime,
        );
      }
    } else {
      await updateEvent(eventId as Id<"events">, {
        startTime: newStartTime,
        endTime: newEndTime,
      });
    }
  }, [updateEvent, addExdateAndCreateException, events]);

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
          <HeaderMenu
            onOpenTab={(tab) => {
              setSettingsTab(tab);
              setIsSettingsOpen(true);
            }}
            onSignOut={signOut}
          />
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

      <Settings isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} initialTab={settingsTab} />
    </div>
  );
}
