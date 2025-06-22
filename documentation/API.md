# API Documentation

## Overview

The Tilly Calendar API provides RESTful endpoints for calendar management and AI-powered event scheduling. All authenticated endpoints require a valid Bearer token from Supabase authentication.

## Base URL

- **Development**: `http://localhost:8080`
- **Production**: `https://your-eb-url.amazonaws.com`

## Authentication

### Authentication Method
All protected endpoints require a Bearer token in the Authorization header:

```
Authorization: Bearer <supabase-jwt-token>
```

### Authentication Flow
1. User authenticates via Supabase Auth (email/password or OAuth)
2. Client receives JWT access token
3. Include token in Authorization header for API requests
4. Server validates token and extracts user ID for data isolation

## Public Endpoints

### Health Check
**GET** `/health`

Returns server status and basic information.

**Response:**
```json
{
  "status": "OK",
  "message": "Proxy server is running",
  "timestamp": "2025-01-20T10:30:00.000Z"
}
```

## Authentication Required Endpoints

### Events API

#### Get All Events
**GET** `/api/events`

Retrieves all calendar events for the authenticated user.

**Query Parameters:**
- `start` (optional): ISO date string for range start
- `end` (optional): ISO date string for range end

**Response:**
```json
[
  {
    "id": 123,
    "title": "Team Meeting",
    "start": "2025-01-20T14:00:00.000Z",
    "end": "2025-01-20T15:00:00.000Z",
    "color": "#4A7C2A",
    "user_id": "user-uuid"
  }
]
```

#### Create Event
**POST** `/api/events`

Creates a new calendar event.

**Request Body:**
```json
{
  "title": "New Meeting",
  "start": "2025-01-20T14:00:00.000Z",
  "end": "2025-01-20T15:00:00.000Z",
  "color": "#4A7C2A"
}
```

**Response:**
```json
{
  "id": 124,
  "title": "New Meeting",
  "start": "2025-01-20T14:00:00.000Z",
  "end": "2025-01-20T15:00:00.000Z",
  "color": "#4A7C2A",
  "user_id": "user-uuid"
}
```

#### Update Event
**PUT** `/api/events/:id`

Updates an existing calendar event.

**Request Body:**
```json
{
  "title": "Updated Meeting",
  "start": "2025-01-20T15:00:00.000Z",
  "end": "2025-01-20T16:00:00.000Z",
  "color": "#FF0000"
}
```

#### Delete Event
**DELETE** `/api/events/:id`

Deletes a calendar event.

**Response:**
```json
{
  "message": "Event deleted successfully",
  "deletedId": 124
}
```

### AI Chat API

#### AI Chat with Tools
**POST** `/api/ai/chat`

Interacts with the AI assistant using natural language for calendar operations.

**Request Body:**
```json
{
  "message": "Schedule a meeting tomorrow at 2pm",
  "conversation_history": []
}
```

**Response:**
```json
{
  "response": "I'll schedule a meeting for tomorrow at 2:00 PM. Let me check for conflicts first.",
  "tool_results": [
    {
      "tool": "create_event",
      "success": true,
      "event": {
        "id": 125,
        "title": "Meeting",
        "start": "2025-01-21T14:00:00.000Z",
        "end": "2025-01-21T15:00:00.000Z"
      }
    }
  ]
}
```

### Calendar Tools

#### Get Calendar Events (Tool)
**POST** `/api/tools/get_calendar_events`

Retrieves events for AI assistant context.

**Request Body:**
```json
{
  "start_date": "2025-01-20",
  "end_date": "2025-01-27"
}
```

#### Create Event (Tool)
**POST** `/api/tools/create_event`

Creates event via AI assistant.

**Request Body:**
```json
{
  "title": "AI Created Event",
  "start_time": "2025-01-21T14:00:00",
  "end_time": "2025-01-21T15:00:00"
}
```

#### Move Event (Tool)
**POST** `/api/tools/move_event`

Reschedules an existing event.

**Request Body:**
```json
{
  "event_id": 123,
  "new_start_time": "2025-01-21T15:00:00",
  "new_end_time": "2025-01-21T16:00:00"
}
```

#### Check Time Conflicts (Tool)
**POST** `/api/tools/check_time_conflicts`

Checks for scheduling conflicts.

**Request Body:**
```json
{
  "start_time": "2025-01-21T14:00:00",
  "end_time": "2025-01-21T15:00:00",
  "exclude_event_id": 123
}
```

**Response:**
```json
{
  "success": true,
  "has_conflicts": false,
  "conflicts": [],
  "conflict_count": 0
}
```

#### Search Events (Tool)
**POST** `/api/tools/search_events`

Searches events by title.

**Request Body:**
```json
{
  "search_term": "meeting",
  "start_date": "2025-01-01",
  "end_date": "2025-12-31"
}
```

### Import/Export API

#### Import iCal File
**POST** `/api/events/import`

Imports events from an iCal file.

**Request:** Multipart form data with `icalFile` field

**Response:**
```json
{
  "imported": 5,
  "failed": 0,
  "total": 5,
  "message": "Successfully imported 5 events"
}
```

#### Import from URL
**POST** `/api/events/import-url`

Imports events from an iCal URL.

**Request Body:**
```json
{
  "url": "https://example.com/calendar.ics",
  "subscribe": false
}
```

#### Export Events
**GET** `/api/events/export`

Exports user events as iCal format.

**Query Parameters:**
- `start` (optional): Start date for export range
- `end` (optional): End date for export range

**Response:** iCal formatted text file

### Calendar Subscriptions

#### Get Subscriptions
**GET** `/api/calendar-subscriptions`

Retrieves all calendar subscriptions.

#### Add Subscription
**POST** `/api/calendar-subscriptions`

Adds a new calendar subscription.

**Request Body:**
```json
{
  "name": "External Calendar",
  "url": "https://example.com/calendar.ics",
  "color": "#FF0000",
  "sync_enabled": true
}
```

#### Sync All Subscriptions
**POST** `/api/calendar-subscriptions/sync-all`

Triggers synchronization of all subscriptions.

## Error Handling

### Error Response Format
```json
{
  "error": "Error description",
  "details": "Additional error details",
  "code": "ERROR_CODE"
}
```

### Common HTTP Status Codes
- **200**: Success
- **201**: Created
- **400**: Bad Request (invalid input)
- **401**: Unauthorized (missing/invalid token)
- **403**: Forbidden (insufficient permissions)
- **404**: Not Found
- **429**: Too Many Requests (rate limited)
- **500**: Internal Server Error

### Error Handling Features
- **Exponential Backoff**: Automatic retry with 1s, 2s, 4s delays
- **Graceful Fallbacks**: AI service provides fallback responses
- **Input Validation**: Comprehensive validation with detailed error messages
- **Rate Limiting**: Protection against abuse

## Rate Limiting

- **AI Chat API**: 60 requests per minute per user
- **Events API**: 1000 requests per minute per user
- **Import API**: 10 requests per minute per user

## Data Formats

### Date/Time Format
All timestamps use ISO 8601 format: `YYYY-MM-DDTHH:mm:ss.sssZ`

### Color Format
Event colors use hex format: `#RRGGBB`

### File Upload Limits
- **iCal files**: Maximum 5MB
- **Supported formats**: `.ics` files only

## Security Considerations

- **Row Level Security**: Database-level access control
- **Input Sanitization**: All inputs validated and sanitized
- **CORS Configuration**: Proper cross-origin request handling
- **Authentication Required**: All sensitive operations require valid JWT
- **User Isolation**: Users can only access their own data 