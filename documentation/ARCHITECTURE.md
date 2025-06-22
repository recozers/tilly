# Architecture Documentation

## System Overview

Tilly is a full-stack calendar application built with a modern architecture that emphasizes security, scalability, and AI integration. The system follows a client-server architecture with clear separation of concerns and robust security measures.

## High-Level Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   React Client  │    │  Express Server │    │   Supabase DB   │
│                 │    │                 │    │                 │
│ • User Interface│◄──►│ • API Endpoints │◄──►│ • PostgreSQL    │
│ • State Mgmt    │    │ • Authentication│    │ • Row Level Sec │
│ • AI Chat UI    │    │ • AI Integration│    │ • Real-time     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │  Claude AI API  │
                       │                 │
                       │ • Tool-based AI │
                       │ • Event Planning│
                       │ • NL Processing │
                       └─────────────────┘
```

## Technology Stack

### Frontend
- **React 18**: Modern component-based UI framework
- **Vite 5**: Fast build tool and development server
- **Modern CSS**: Custom styling with CSS Grid and Flexbox
- **Context API**: State management for authentication
- **Custom Hooks**: Reusable logic for event layout and management

### Backend
- **Node.js 22**: Runtime environment
- **Express.js 4**: Web application framework
- **Supabase JavaScript Client**: Database interaction
- **CORS**: Cross-origin resource sharing
- **Multer**: File upload handling
- **Nodemailer**: Email functionality

### Database
- **Supabase (PostgreSQL)**: Primary database with real-time features
- **Row Level Security (RLS)**: Database-level access control
- **Automatic migrations**: Schema management
- **Real-time subscriptions**: Live data updates

### AI Integration
- **Anthropic Claude API**: Natural language processing
- **Tool-based architecture**: Structured AI interactions
- **Custom tool definitions**: Calendar-specific operations

### Testing
- **Jest**: Testing framework
- **Supertest**: HTTP testing
- **Mock implementations**: Isolated unit testing
- **Integration tests**: End-to-end API testing

### Deployment
- **AWS Elastic Beanstalk**: Application hosting
- **Automated deployment**: Script-based packaging
- **Environment configuration**: Production settings

## Component Architecture

### Frontend Components

```
src/
├── App.jsx                 # Main application component
├── components/
│   ├── Auth/
│   │   ├── AuthModal.jsx   # Authentication modal
│   │   └── UserProfile.jsx # User profile management
│   └── CalendarAI.jsx      # AI chat interface
├── contexts/
│   └── AuthContext.jsx     # Authentication state management
├── hooks/
│   └── useEventLayout.js   # Event positioning logic
└── lib/
    └── supabase.js         # Supabase client configuration
```

### Backend Structure

```
server.js                   # Main Express server
supabase.js                # Database operations layer
├── Authentication middleware
├── API route handlers
├── AI integration logic
├── File upload handling
├── Email services
└── Error handling
```

## Database Schema

### Tables

#### events
```sql
CREATE TABLE events (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE NOT NULL,
  color TEXT DEFAULT '#4A7C2A',
  user_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### calendar_subscriptions
```sql
CREATE TABLE calendar_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  color TEXT DEFAULT '#4A7C2A',
  sync_enabled BOOLEAN DEFAULT true,
  last_sync TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Row Level Security (RLS)

```sql
-- Events table RLS
CREATE POLICY "Users can only access their own events" ON events
  FOR ALL USING (auth.uid() = user_id);

-- Calendar subscriptions RLS  
CREATE POLICY "Users can only access their own subscriptions" ON calendar_subscriptions
  FOR ALL USING (auth.uid() = user_id);
```

## Authentication Flow

```
1. User Registration/Login
   │
   ▼
2. Supabase Auth Service
   │
   ▼
3. JWT Token Generation
   │
   ▼
4. Client Stores Token
   │
   ▼
5. API Requests with Bearer Token
   │
   ▼
6. Server Token Validation
   │
   ▼
7. User ID Extraction
   │
   ▼
8. Database Query with User Filter
```

## AI Integration Architecture

### Tool-Based AI System

The AI integration uses a sophisticated tool-based architecture:

1. **User Input**: Natural language request
2. **AI Processing**: Claude analyzes intent and available tools
3. **Tool Selection**: AI chooses appropriate calendar tools
4. **Tool Execution**: Server executes tools with user context
5. **Response Generation**: AI formulates human-readable response

### Available AI Tools

```javascript
{
  "get_calendar_events": "Retrieve user's calendar events",
  "create_event": "Create new calendar event",
  "move_event": "Reschedule existing event", 
  "check_time_conflicts": "Check for scheduling conflicts",
  "search_events": "Search events by title"
}
```

### AI Safety Measures

- **Input Validation**: All AI-generated data validated before execution
- **User Context**: AI operates only within user's data scope
- **Fallback Responses**: Graceful degradation when AI unavailable
- **Rate Limiting**: Protection against AI API abuse

## Security Architecture

### Multi-Layer Security

1. **Database Level**: Row Level Security (RLS)
2. **Application Level**: Authentication middleware
3. **API Level**: Input validation and sanitization
4. **Transport Level**: HTTPS encryption
5. **Client Level**: Secure token storage

### Data Isolation

```
User A Data ─┐
             ├─ RLS Filter ─ Database
User B Data ─┘
```

Each user's data is completely isolated through:
- Database-level RLS policies
- Server-side user ID validation
- Client-side authentication state

### Input Sanitization

- **XSS Protection**: HTML/JS injection prevention
- **SQL Injection Prevention**: Parameterized queries
- **File Upload Validation**: Type and size restrictions
- **Color Code Validation**: Hex format enforcement

## Performance Considerations

### Algorithmic Complexity Analysis

The following Big O complexity analysis covers the core algorithms and operations in Tilly:

#### Event Layout Algorithm
- **Worst Case**: O(n²) when multiple events overlap significantly
- **Typical Case**: O(n) for most real-world calendar layouts
- **Space Complexity**: O(n) for storing position calculations
- **Optimization**: Uses column-based layout to minimize overlap calculations

#### Calendar Rendering
- **Time Slot Rendering**: O(1) - Fixed 48 time slots (30-min intervals)
- **Event Filtering**: O(n) where n = total events for date range
- **Event Positioning**: O(n) for non-overlapping events, O(n²) for complex overlaps
- **DOM Updates**: O(k) where k = visible events on screen

#### Database Operations
- **Event Queries**: 
  - With proper indexing: O(log n) for date range queries
  - Without indexing: O(n) for full table scans
  - RLS filtering: O(1) additional overhead per row
- **Event Creation**: O(1) for single event insertion
- **Bulk Operations**: O(m log n) for m events with conflict checking

#### AI Processing
- **Tool-based AI**: O(r × t × n) where:
  - r = number of AI reasoning rounds
  - t = number of tools executed per round  
  - n = events processed per tool call
- **Typical scenarios**: O(1) to O(n) for most user requests
- **Complex planning**: O(n²) when checking multiple date/time conflicts

#### Import/Export Operations
- **Calendar Parsing**: O(m + e) where m = file size, e = events parsed
- **Event Validation**: O(e) for e events
- **Bulk Creation**: O(e × log n) for e new events with existing conflict checks
- **Export Generation**: O(e) for e events to export

#### Authentication & Security
- **JWT Validation**: O(1) - Constant time token verification
- **RLS Policy Evaluation**: O(1) per query with proper database indexing
- **Session Management**: O(1) for token-based authentication

#### Memory Complexity
- **Frontend State**: O(n) where n = events in current view
- **Backend Caching**: O(u × e) where u = users, e = average events per user
- **AI Context**: O(c) where c = conversation history tokens

#### Scalability Considerations
- **Current Optimal Range**: 100-10,000 events per user
- **Performance Bottleneck**: Event layout algorithm at high overlap density
- **Scaling Strategy**: Implement virtual scrolling and event pagination
- **Database Scaling**: Supabase handles auto-scaling transparently

### Frontend Optimizations

- **React Optimization**: Proper component memoization
- **Event Layout Algorithm**: Efficient overlap calculation
- **Lazy Loading**: On-demand component loading
- **Build Optimization**: Vite bundling and minification

### Backend Optimizations

- **Database Indexing**: Optimized queries with proper indexes
- **Connection Pooling**: Efficient database connections
- **Response Caching**: Appropriate cache headers
- **Gzip Compression**: Reduced response sizes

### Scalability Features

- **Stateless Server**: Horizontal scaling capability
- **Database Scaling**: Supabase auto-scaling
- **CDN Ready**: Static asset optimization
- **Load Balancer Compatible**: Multiple instance support

## Error Handling Strategy

### Client-Side Error Handling

```javascript
try {
  // API call
} catch (error) {
  if (error.status === 401) {
    // Redirect to login
  } else if (error.status >= 500) {
    // Show retry option
  } else {
    // Display error message
  }
}
```

### Server-Side Error Handling

- **Global Error Middleware**: Centralized error processing
- **Structured Error Responses**: Consistent error format
- **Logging**: Comprehensive error logging
- **Graceful Degradation**: Fallback functionality

## Deployment Architecture

### AWS Elastic Beanstalk Deployment

```
GitHub Repository
│
├── create-deployment-zip.sh (Build Script)
│
▼
┌─────────────────────────────────┐
│      Elastic Beanstalk         │
│                                 │
│  ┌─────────────────────────┐   │
│  │     Node.js Server      │   │
│  │   ├── Express App      │   │
│  │   ├── Static Files     │   │
│  │   └── Environment Vars │   │
│  └─────────────────────────┘   │
└─────────────────────────────────┘
│
▼
External Services:
├── Supabase Database
├── Claude AI API
└── SMTP Email Service
```

### Environment Configuration

- **Development**: Local environment with hot reload
- **Production**: Optimized build with environment variables
- **Testing**: Isolated test environment with mocks

## Monitoring and Maintenance

### Health Monitoring

- **Health Check Endpoint**: `/health` for service monitoring
- **Error Logging**: Comprehensive error tracking
- **Performance Metrics**: Response time monitoring

### Backup and Recovery

- **Database Backups**: Automatic Supabase backups
- **Configuration Backup**: Environment variable documentation
- **Code Repository**: Git-based version control

## Future Scalability

### Horizontal Scaling Readiness

- **Stateless Design**: No server-side session state
- **Database Scaling**: Supabase handles scaling automatically
- **Load Balancer Ready**: Multiple instance deployment capable

### Performance Monitoring

- **Database Query Optimization**: Index usage monitoring
- **API Response Times**: Endpoint performance tracking
- **Error Rate Monitoring**: System health indicators

This architecture provides a solid foundation for a production-ready calendar application with room for future enhancements and scaling. 