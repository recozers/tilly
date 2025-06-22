# Tilly - AI-Powered Calendar Assistant

A modern React calendar application with AI-powered natural language event scheduling, secure multi-user authentication, and comprehensive testing infrastructure.

## Screenshot

<img src='screenshots/Screenshot 2025-06-17 at 12.36.02.png' alt='Tilly Calendar Application' height='400' width='800' />

## Features

### Core Calendar Features
- **AI Chat Integration**: Natural language event creation using Claude API with timezone-aware processing
- **Drag & Drop**: Move events between time slots and days with visual feedback
- **Event Resizing**: Drag event edges to change duration
- **Inline Editing**: Click event titles to edit in place
- **Multi-User Support**: Secure user authentication and data isolation
- **Real-time Updates**: Instant visual feedback for all calendar interactions

### AI Assistant "Tilly"
- **Tool-Based AI**: Advanced Claude integration with custom tools for calendar operations
- **Conflict Detection**: Automatic scheduling conflict resolution
- **Natural Language**: Understands complex scheduling requests
- **Timezone Aware**: Handles DST and timezone conversions accurately
- **Multi-Round Conversations**: Supports follow-up questions and clarifications

### Data & Security
- **Supabase Backend**: Secure PostgreSQL database with Row Level Security (RLS)
- **User Authentication**: Email/password and OAuth provider support
- **Data Isolation**: Users can only access their own calendar events
- **Input Sanitization**: Protection against XSS and SQL injection
- **Comprehensive Testing**: Mock and integration test suites

### Import/Export
- **iCal Support**: Import and export calendar events in standard format
- **Email Invitations**: Send calendar invites via email with iCal attachments
- **Calendar Subscriptions**: Subscribe to external iCal feeds

## Technology Stack

- **Frontend**: React 18, Vite 5, Modern CSS
- **Backend**: Node.js 22, Express.js 4
- **Database**: Supabase (PostgreSQL with real-time features)
- **Authentication**: Supabase Auth with Row Level Security
- **AI**: Anthropic Claude API with custom tool integration
- **Testing**: Jest with comprehensive mock and integration tests
- **Deployment**: AWS Elastic Beanstalk ready

## Quick Start

### Prerequisites
- Node.js 22.x or higher
- npm 8.0.0 or higher
- Supabase account and project
- Anthropic API key (for AI features)

### Environment Setup

1. Clone the repository:
```bash
git clone [repository-url]
cd tilly
npm install
```

2. Create a `.env` file in the root directory:
```env
# Supabase Configuration (Required)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Anthropic API (Required for AI features)
ANTHROPIC_API_KEY=sk-ant-your-api-key

# Frontend Environment Variables
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key

# Email Configuration (Optional - for calendar invitations)
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
```

3. Set up your Supabase database:
   - Create a new Supabase project
   - The application will automatically create required tables
   - Ensure Row Level Security (RLS) is enabled

### Running the Application

#### Full Stack Development (Recommended)
```bash
# Run both frontend and backend together
npm run dev:full
```

This starts:
- Frontend dev server on `http://localhost:3000`
- Backend API server on `http://localhost:8080`

#### Separate Services
```bash
# Terminal 1: Backend server
npm run server

# Terminal 2: Frontend development server
npm run dev
```

#### Frontend Only
```bash
# Frontend only (limited AI functionality)
npm run dev
```

## Testing

Tilly includes comprehensive testing infrastructure:

### Test Commands
```bash
# Run all mock tests (fast, no external dependencies)
npm test

# Run integration tests (requires real Supabase connection)
npm run test:real

# Run with coverage reporting
npm run test:coverage

# Watch mode for development
npm run test:watch
```

### Test Coverage
- **Mock Tests**: 36 tests covering business logic, security, and utilities
- **Integration Tests**: Real database and API endpoint testing
- **Security Tests**: Input sanitization, authentication, and authorization
- **Timezone Tests**: DST handling and timezone conversion validation

## AI Usage Examples

Tilly understands natural language requests:

```
"Schedule a meeting tomorrow at 2pm"
"Book dentist appointment Friday 3pm for 1 hour"
"Lunch with Sarah next Tuesday from 12-1pm"
"Move my 3pm meeting to 4pm today"
"Check if I'm free Wednesday at 10am"
"Cancel my gym session on Monday"
```

The AI assistant:
- Checks for scheduling conflicts
- Suggests alternative times when conflicts exist
- Handles timezone conversions automatically
- Supports follow-up questions and modifications
- Provides conversational, helpful responses

## Environment Variables

### Required
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_ANON_KEY` - Supabase anonymous key
- `VITE_SUPABASE_URL` - Frontend Supabase URL
- `VITE_SUPABASE_ANON_KEY` - Frontend Supabase key
- `ANTHROPIC_API_KEY` - Anthropic Claude API key

### Optional
- `SUPABASE_SERVICE_ROLE_KEY` - For advanced database operations
- `EMAIL_USER` - SMTP email for calendar invitations
- `EMAIL_PASS` - SMTP password (use app passwords for Gmail)
- `NODE_ENV` - Set to 'production' for production builds
- `PORT` - Server port (default: 8080)

## Deployment

### AWS Elastic Beanstalk

1. Build the deployment package:
```bash
./create-deployment-zip.sh
```

2. Upload `tilly-deployment.zip` to Elastic Beanstalk

3. Set environment variables in the EB console

4. Deploy and access your application

The deployment script automatically:
- Builds the frontend (`npm run build`)
- Packages all necessary files
- Includes production configuration
- Sets up proper Node.js environment

## Security Features

- **Row Level Security**: Database-level access control
- **User Isolation**: Users can only access their own data
- **Input Sanitization**: Protection against XSS and injection attacks
- **Authentication Middleware**: Secure API endpoint protection
- **Environment Variable Protection**: Sensitive data properly configured
- **CORS Configuration**: Proper cross-origin request handling

## Project Structure

```
tilly/
├── src/                          # Frontend React application
│   ├── components/              # React components
│   ├── contexts/               # React contexts (Auth)
│   ├── hooks/                  # Custom React hooks
│   └── lib/                    # Supabase client configuration
├── tests/                       # Comprehensive test suites
│   ├── real-*.test.js          # Integration tests
│   └── *.test.js               # Mock/unit tests
├── server.js                    # Express.js backend server
├── supabase.js                 # Database operations
├── package.json                # Dependencies and scripts
└── create-deployment-zip.sh    # Deployment packaging script
```

## API Documentation

### Authentication Required Endpoints
- `GET /api/events` - Get user's calendar events
- `POST /api/events` - Create new event
- `PUT /api/events/:id` - Update existing event
- `DELETE /api/events/:id` - Delete event
- `POST /api/ai/chat` - AI chat with calendar tools
- `POST /api/tools/*` - Calendar tool endpoints

### Public Endpoints
- `GET /health` - Health check
- `POST /api/auth/*` - Authentication endpoints

## Contributing

1. Fork the repository
2. Create a feature branch
3. Run the test suite: `npm test && npm run test:real`
4. Make your changes
5. Ensure all tests pass
6. Submit a pull request

## License

Private project - All rights reserved.