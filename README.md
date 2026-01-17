# Tilly - AI-Powered Calendar Assistant

A modern React calendar application with AI-powered natural language event scheduling, real-time sync, and social features.

## Screenshot

<img src='screenshots/Screenshot 2026-01-17 at 10.10.35.png' alt='Tilly Calendar Application' height='400' width='800' />

## Features

### Core Calendar Features
- **AI Chat Integration**: Natural language event creation using OpenAI with timezone-aware processing
- **Drag & Drop**: Move events between time slots and days with visual feedback
- **Event Resizing**: Drag event edges to change duration
- **Inline Editing**: Click event titles to edit in place
- **Recurring Events**: Support for daily, weekly, monthly, and yearly recurrence with RRULE
- **All-Day Events**: Full support for all-day events
- **Reminders**: Configurable event reminders
- **Real-time Sync**: Instant updates across all connected clients

### AI Assistant "Tilly"
- **Tool-Based AI**: OpenAI integration with custom tools for calendar operations
- **Conflict Detection**: Automatic scheduling conflict resolution
- **Natural Language**: Understands complex scheduling requests
- **Event Management**: Create, move, and delete events via chat
- **Friends Integration**: Query friends list through AI

### Social Features
- **Friends System**: Add friends by email with request/accept workflow
- **Meeting Requests**: Propose meeting times to friends with multiple time slots
- **Shared Calendars**: View friends' calendars (with permission)

### Calendar Subscriptions
- **iCal Import**: Subscribe to external iCal feeds (Google Calendar, Outlook, etc.)
- **Auto-Sync**: Automatic periodic synchronization with external calendars
- **Calendar Feeds**: Generate iCal feed URLs to share your calendar
- **Visibility Control**: Show/hide subscribed calendars

### Authentication
- **Email OTP**: Passwordless login via email one-time codes
- **Password Auth**: Traditional email/password authentication
- **Password Reset**: Email-based password reset flow

## Technology Stack

- **Frontend**: React 18, Vite 5, TypeScript
- **Backend**: Convex (serverless functions with real-time sync)
- **Authentication**: Convex Auth with Resend for email delivery
- **AI**: OpenAI API with function calling
- **iCal**: Custom iCal parser for calendar subscriptions
- **Testing**: Vitest with React Testing Library
- **Monorepo**: npm workspaces

## Quick Start

### Prerequisites
- Node.js 18.x or higher
- npm 8.0.0 or higher
- Convex account
- OpenAI API key (for AI features)
- Resend API key (for email authentication)

### Environment Setup

1. Clone the repository:
```bash
git clone [repository-url]
cd tilly
npm install
```

2. Set up Convex:
```bash
npx convex dev
```
This will prompt you to create a Convex project and set up your deployment.

3. Configure environment variables in the Convex dashboard:
```
OPENAI_API_KEY=sk-your-openai-api-key
AUTH_RESEND_KEY=re_your-resend-api-key
```

4. Create `packages/client/.env.local`:
```env
VITE_CONVEX_URL=https://your-deployment.convex.cloud
```

### Running the Application

```bash
# Run both Convex backend and Vite frontend
npm run dev
```

This starts:
- Convex dev server with real-time sync
- Frontend dev server on `http://localhost:5173`

#### Other Commands
```bash
# Run only the frontend
npm run dev:client

# Run only Convex
npm run dev:convex

# Build for production
npm run build

# Deploy Convex functions
npm run deploy

# Type checking
npm run typecheck

# Linting
npm run lint
```

## Testing

```bash
# Run all tests
npm test

# Run tests once
npm run test:run

# Run with coverage
npm run test:coverage

# Run with UI
npm run test:ui
```

## AI Usage Examples

Tilly understands natural language requests:

```
"Schedule a meeting tomorrow at 2pm"
"Book dentist appointment Friday 3pm for 1 hour"
"Lunch with Sarah next Tuesday from 12-1pm"
"Move my 3pm meeting to 4pm today"
"Check if I'm free Wednesday at 10am"
"Cancel my gym session on Monday"
"Create a weekly standup every Monday at 9am"
"Add a birthday reminder on March 15 that repeats yearly"
```

The AI assistant:
- Checks for scheduling conflicts before creating events
- Supports recurring events with flexible patterns
- Handles all-day events
- Can move and delete existing events
- Provides conversational, helpful responses

## Project Structure

```
tilly/
├── packages/
│   ├── client/                  # React frontend application
│   │   ├── src/
│   │   │   ├── components/     # React components
│   │   │   │   ├── Auth/       # Authentication modal
│   │   │   │   ├── Calendar/   # Calendar grid and events
│   │   │   │   ├── Chat/       # AI chat interface
│   │   │   │   ├── EventModal/ # Event creation/editing
│   │   │   │   └── Settings/   # User settings tabs
│   │   │   ├── contexts/       # React contexts (Auth)
│   │   │   ├── hooks/          # Custom React hooks
│   │   │   └── utils/          # Utility functions
│   │   └── package.json
│   └── shared/                  # Shared types and constants
│       ├── src/
│       │   ├── types/          # TypeScript type definitions
│       │   └── constants/      # Shared constants
│       └── package.json
├── convex/                      # Convex backend
│   ├── _generated/             # Auto-generated Convex files
│   ├── ai/                     # AI chat actions and tools
│   ├── events/                 # Event queries and mutations
│   ├── feeds/                  # Calendar feed management
│   ├── friends/                # Friends system
│   ├── ical/                   # iCal parser and actions
│   ├── meetings/               # Meeting requests
│   ├── subscriptions/          # Calendar subscriptions
│   ├── users/                  # User management
│   ├── auth.ts                 # Authentication config
│   ├── crons.ts                # Scheduled tasks
│   ├── http.ts                 # HTTP endpoints (iCal feeds)
│   └── schema.ts               # Database schema
└── package.json                # Root package with workspaces
```

## Database Schema

### Core Tables
- **events**: Calendar events with recurrence support
- **calendarSubscriptions**: External iCal feed subscriptions
- **calendarFeedTokens**: Tokens for sharing calendar as iCal feed
- **friendships**: Friend relationships
- **friendRequests**: Pending friend requests
- **meetingRequests**: Meeting proposals between friends

## Deployment

### Vercel (Frontend)

The client package includes `vercel.json` for deployment:

```bash
cd packages/client
vercel
```

### Convex (Backend)

```bash
npm run deploy
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Run the test suite: `npm test`
4. Make your changes
5. Ensure all tests pass and types check: `npm run typecheck`
6. Submit a pull request

## License

Private project - All rights reserved.