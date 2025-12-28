import { useAuthContext } from './contexts/AuthContext.js';
import { useEvents } from './hooks/useEvents.js';
import { useChat } from './hooks/useChat.js';
import { AuthModal } from './components/Auth/AuthModal.js';

/**
 * Main App component
 * Note: This is a minimal implementation - the full component splitting
 * from the original App.jsx will be done in subsequent updates
 */
export default function App(): JSX.Element {
  const { user, isLoading: authLoading, isAuthenticated } = useAuthContext();
  const { events, isLoading: eventsLoading } = useEvents();
  const { messages, isLoading: chatLoading, sendMessage } = useChat();

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
        <h1>Tilly</h1>
        <p>Welcome, {user?.email}</p>
      </header>

      <main className="app-main">
        <section className="calendar-section">
          <h2>Your Calendar</h2>
          <p>Events: {events.length}</p>
          {/* Calendar component will be added here */}
        </section>

        <section className="chat-section">
          <h2>Chat with Tilly</h2>
          <div className="messages">
            {messages.map(msg => (
              <div key={msg.id} className={`message ${msg.role}`}>
                <p>{msg.content}</p>
              </div>
            ))}
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const input = e.currentTarget.querySelector('input');
              if (input?.value) {
                await sendMessage(input.value);
                input.value = '';
              }
            }}
          >
            <input type="text" placeholder="Ask Tilly..." disabled={chatLoading} />
            <button type="submit" disabled={chatLoading}>
              {chatLoading ? 'Thinking...' : 'Send'}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
