import { useState, useCallback } from 'react';
import { useAuthContext } from './contexts/AuthContext.js';
import { useEvents } from './hooks/useEvents.js';
import { AuthModal } from './components/Auth/AuthModal.js';
import { Calendar } from './components/Calendar/index.js';
import { Chat } from './components/Chat/index.js';
import { EventModal } from './components/EventModal/index.js';
import type { TypedEvent, CreateEventDto, UpdateEventDto } from '@tilly/shared';

/**
 * Main App component - Tilly Calendar Application
 */
export default function App(): JSX.Element {
  const { user, isLoading: authLoading, isAuthenticated, signOut } = useAuthContext();
  const { events, isLoading: eventsLoading, createEvent, updateEvent, deleteEvent, refetch } = useEvents();

  // Modal state
  const [selectedEvent, setSelectedEvent] = useState<TypedEvent | null>(null);
  const [newEventDate, setNewEventDate] = useState<Date | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Handle event click from calendar
  const handleEventClick = useCallback((event: TypedEvent) => {
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
  const handleSaveEvent = useCallback(async (data: CreateEventDto | UpdateEventDto) => {
    if (selectedEvent) {
      await updateEvent(selectedEvent.id, data as UpdateEventDto);
    } else {
      await createEvent(data as CreateEventDto);
    }
  }, [selectedEvent, createEvent, updateEvent]);

  // Handle delete event
  const handleDeleteEvent = useCallback(async (id: number) => {
    await deleteEvent(id);
  }, [deleteEvent]);

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
          <span className="user-email">{user?.email}</span>
          <button className="btn-new-event" onClick={() => handleTimeSlotClick(new Date())}>
            + New Event
          </button>
          <button className="btn-logout" onClick={signOut}>
            Sign Out
          </button>
        </div>
      </header>

      <main className="app-main">
        <section className="calendar-section">
          <Calendar
            events={events}
            onEventClick={handleEventClick}
            onTimeSlotClick={handleTimeSlotClick}
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
          onDelete={selectedEvent ? handleDeleteEvent : undefined}
          onClose={handleCloseModal}
        />
      )}
    </div>
  );
}
