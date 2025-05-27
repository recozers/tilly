const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
require('dotenv').config();

// Import database functions
const {
  initDatabase,
  getAllEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  getEventsByDateRange,
  closeDatabase,
  searchEvents,
  getUpcomingEvents,
  getEventsForPeriod,
  isTimeSlotFree,
  getCalendarStats
} = require('./database');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize database on server start
initDatabase().catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});

// Anthropic API proxy endpoint
app.post('/api/claude', async (req, res) => {
  try {
    console.log('Proxying request to Anthropic API...');
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(req.body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Anthropic API error:', response.status, errorText);
      return res.status(response.status).json({ 
        error: `API request failed: ${response.status} ${response.statusText}`,
        details: errorText 
      });
    }

    const data = await response.json();
    console.log('Successfully proxied request to Anthropic API');
    res.json(data);

  } catch (error) {
    console.error('Proxy server error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      details: error.message 
    });
  }
});

// Events API endpoints

// GET /api/events - Get all events
app.get('/api/events', async (req, res) => {
  try {
    const events = await getAllEvents();
    res.json(events);
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// GET /api/events/range - Get events within a date range
app.get('/api/events/range', async (req, res) => {
  try {
    const { start, end } = req.query;
    
    if (!start || !end) {
      return res.status(400).json({ error: 'Start and end dates are required' });
    }
    
    const startDate = new Date(start);
    const endDate = new Date(end);
    
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }
    
    const events = await getEventsByDateRange(startDate, endDate);
    res.json(events);
  } catch (error) {
    console.error('Error fetching events by date range:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// POST /api/events - Create a new event
app.post('/api/events', async (req, res) => {
  try {
    const { title, start, end, color } = req.body;
    
    if (!title || !start || !end) {
      return res.status(400).json({ error: 'Title, start, and end are required' });
    }
    
    const startDate = new Date(start);
    const endDate = new Date(end);
    
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }
    
    if (startDate >= endDate) {
      return res.status(400).json({ error: 'Start time must be before end time' });
    }
    
    const newEvent = await createEvent({
      title,
      start: startDate,
      end: endDate,
      color: color || '#3b82f6'
    });
    
    console.log('Created new event:', newEvent);
    res.status(201).json(newEvent);
  } catch (error) {
    console.error('Error creating event:', error);
    res.status(500).json({ error: 'Failed to create event' });
  }
});

// PUT /api/events/:id - Update an existing event
app.put('/api/events/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, start, end, color } = req.body;
    
    // Get the existing event first
    const existingEvents = await getAllEvents();
    const existingEvent = existingEvents.find(e => e.id === parseInt(id));
    
    if (!existingEvent) {
      return res.status(404).json({ error: 'Event not found' });
    }
    
    // Use existing values if not provided in update
    const updateData = {
      title: title !== undefined ? title : existingEvent.title,
      start: start !== undefined ? new Date(start) : new Date(existingEvent.start),
      end: end !== undefined ? new Date(end) : new Date(existingEvent.end),
      color: color !== undefined ? color : existingEvent.color
    };
    
    // Validate dates if they were provided
    if (start !== undefined && isNaN(updateData.start.getTime())) {
      return res.status(400).json({ error: 'Invalid start date format' });
    }
    
    if (end !== undefined && isNaN(updateData.end.getTime())) {
      return res.status(400).json({ error: 'Invalid end date format' });
    }
    
    if (updateData.start >= updateData.end) {
      return res.status(400).json({ error: 'Start time must be before end time' });
    }
    
    const updatedEvent = await updateEvent(parseInt(id), updateData);
    
    console.log('Updated event:', updatedEvent);
    res.json(updatedEvent);
  } catch (error) {
    console.error('Error updating event:', error);
    res.status(500).json({ error: 'Failed to update event' });
  }
});

// DELETE /api/events/:id - Delete an event
app.delete('/api/events/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await deleteEvent(parseInt(id));
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }
    
    console.log('Deleted event:', result);
    res.json({ message: 'Event deleted successfully', id: parseInt(id) });
  } catch (error) {
    console.error('Error deleting event:', error);
    res.status(500).json({ error: 'Failed to delete event' });
  }
});

// Search events
app.get('/api/events/search', async (req, res) => {
  try {
    const { q: searchTerm, timeframe } = req.query;
    
    if (!searchTerm) {
      return res.status(400).json({ error: 'Search term is required' });
    }
    
    let timeframeObj = null;
    if (timeframe) {
      const [start, end] = timeframe.split(',');
      timeframeObj = {
        start: new Date(start),
        end: new Date(end)
      };
    }
    
    const events = await searchEvents(searchTerm, timeframeObj);
    res.json(events);
  } catch (error) {
    console.error('Error searching events:', error);
    res.status(500).json({ error: 'Failed to search events' });
  }
});

// Get upcoming events
app.get('/api/events/upcoming', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const events = await getUpcomingEvents(limit);
    res.json(events);
  } catch (error) {
    console.error('Error getting upcoming events:', error);
    res.status(500).json({ error: 'Failed to get upcoming events' });
  }
});

// Get events for specific periods
app.get('/api/events/period/:period', async (req, res) => {
  try {
    const { period } = req.params;
    const events = await getEventsForPeriod(period);
    res.json(events);
  } catch (error) {
    console.error('Error getting events for period:', error);
    res.status(500).json({ error: 'Failed to get events for period' });
  }
});

// Check availability
app.post('/api/events/availability', async (req, res) => {
  try {
    const { startTime, endTime } = req.body;
    
    if (!startTime || !endTime) {
      return res.status(400).json({ error: 'Start time and end time are required' });
    }
    
    const isFree = await isTimeSlotFree(new Date(startTime), new Date(endTime));
    res.json({ isFree });
  } catch (error) {
    console.error('Error checking availability:', error);
    res.status(500).json({ error: 'Failed to check availability' });
  }
});

// Get calendar statistics
app.get('/api/events/stats', async (req, res) => {
  try {
    const period = req.query.period || 'this_week';
    const stats = await getCalendarStats(period);
    res.json(stats);
  } catch (error) {
    console.error('Error getting calendar stats:', error);
    res.status(500).json({ error: 'Failed to get calendar stats' });
  }
});

// AI Calendar Query endpoint
app.post('/api/calendar/query', async (req, res) => {
  try {
    const { query, chatHistory = [] } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }
    
    // Get all events for context
    const allEvents = await getAllEvents();
    const upcomingEvents = await getUpcomingEvents(20);
    const todayEvents = await getEventsForPeriod('today');
    const tomorrowEvents = await getEventsForPeriod('tomorrow');
    const thisWeekEvents = await getEventsForPeriod('this_week');
    const stats = await getCalendarStats('this_week');
    
    // Create calendar context for Claude
    const now = new Date();
    const calendarContext = {
      currentTime: now.toISOString(),
      currentDate: now.toLocaleDateString(),
      currentDay: now.toLocaleDateString('en-US', { weekday: 'long' }),
      currentLocalTime: now.toLocaleString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      totalEvents: allEvents.length,
      upcomingEvents: upcomingEvents.slice(0, 10),
      todayEvents,
      tomorrowEvents,
      thisWeekEvents,
      weeklyStats: stats,
      query,
      chatHistory
    };
    
    // Use Claude API for intelligent calendar assistance
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: createCalendarPrompt(query, calendarContext)
        }]
      })
    });

    if (!response.ok) {
      throw new Error('Claude API request failed');
    }

    const claudeData = await response.json();
    const claudeResponse = claudeData.content[0].text;
    
    // Try to extract JSON from the response (could be mixed with text)
    const jsonMatch = claudeResponse.match(/\{[\s\S]*"type":\s*"(event_suggestion|event_rearrangement)"[\s\S]*\}/);
    
    if (jsonMatch) {
      try {
        const actionData = JSON.parse(jsonMatch[0]);
        if (actionData.type === 'event_suggestion' || actionData.type === 'event_rearrangement') {
          // Validate the action data before sending to frontend
          const validationResult = validateActionData(actionData);
          if (!validationResult.valid) {
            console.warn('Claude response validation failed:', validationResult.error);
            console.warn('Original Claude response:', claudeResponse);
            // Fall through to regular text response if validation fails
          } else {
            // Extract the text part (everything before the JSON)
            const textPart = claudeResponse.replace(jsonMatch[0], '').trim();
            
            // Return both the conversational text and the structured action data
            res.json({ 
              response: {
                type: actionData.type,
                message: textPart || actionData.message,
                eventData: actionData.eventData,
                rearrangements: actionData.rearrangements || null
              }, 
              context: calendarContext 
            });
            return;
          }
        }
      } catch (e) {
        // JSON parsing failed, treat as regular text
        console.warn('Failed to parse JSON from Claude response:', e.message);
        console.warn('Original Claude response:', claudeResponse);
      }
    }
    
    // Regular text response
    res.json({ response: claudeResponse, context: calendarContext });
  } catch (error) {
    console.error('Error processing calendar query:', error);
    res.status(500).json({ error: 'Failed to process calendar query' });
  }
});

// Validate Claude's action data to prevent time parsing issues
function validateActionData(actionData) {
  try {
    console.log('🔍 Validating Claude action data:', actionData);
    
    if (actionData.type === 'event_suggestion') {
      if (!actionData.eventData) {
        return { valid: false, error: 'Missing eventData for event_suggestion' };
      }
      
      const { title, start, end } = actionData.eventData;
      
      if (!title || typeof title !== 'string' || title.trim() === '') {
        return { valid: false, error: 'Invalid or missing event title' };
      }
      
      if (!start || typeof start !== 'string') {
        return { valid: false, error: 'Invalid or missing start time' };
      }
      
      if (!end || typeof end !== 'string') {
        return { valid: false, error: 'Invalid or missing end time' };
      }
      
      // Validate time format (should be ISO format without Z for local time)
      const timeFormatRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
      if (!timeFormatRegex.test(start)) {
        return { valid: false, error: `Invalid start time format: "${start}". Expected format: YYYY-MM-DDTHH:mm:ss` };
      }
      
      if (!timeFormatRegex.test(end)) {
        return { valid: false, error: `Invalid end time format: "${end}". Expected format: YYYY-MM-DDTHH:mm:ss` };
      }
      
      // Validate that times can be parsed
      const startDate = new Date(start);
      const endDate = new Date(end);
      
      if (isNaN(startDate.getTime())) {
        return { valid: false, error: `Invalid start time value: "${start}"` };
      }
      
      if (isNaN(endDate.getTime())) {
        return { valid: false, error: `Invalid end time value: "${end}"` };
      }
      
      if (startDate >= endDate) {
        return { valid: false, error: `Start time (${start}) must be before end time (${end})` };
      }
      
      console.log('✅ Event suggestion validation passed');
      return { valid: true };
    }
    
    if (actionData.type === 'event_rearrangement') {
      if (!actionData.rearrangements || !Array.isArray(actionData.rearrangements)) {
        return { valid: false, error: 'Missing or invalid rearrangements array' };
      }
      
      if (actionData.rearrangements.length === 0) {
        return { valid: false, error: 'Empty rearrangements array' };
      }
      
      for (let i = 0; i < actionData.rearrangements.length; i++) {
        const rearrangement = actionData.rearrangements[i];
        
        if (!rearrangement.eventId || typeof rearrangement.eventId !== 'number') {
          return { valid: false, error: `Invalid eventId in rearrangement ${i}: ${rearrangement.eventId}` };
        }
        
        if (!rearrangement.currentTitle || typeof rearrangement.currentTitle !== 'string') {
          return { valid: false, error: `Invalid currentTitle in rearrangement ${i}` };
        }
        
        if (!rearrangement.newStart || typeof rearrangement.newStart !== 'string') {
          return { valid: false, error: `Invalid newStart in rearrangement ${i}` };
        }
        
        if (!rearrangement.newEnd || typeof rearrangement.newEnd !== 'string') {
          return { valid: false, error: `Invalid newEnd in rearrangement ${i}` };
        }
        
        // Validate time format
        const timeFormatRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
        if (!timeFormatRegex.test(rearrangement.newStart)) {
          return { valid: false, error: `Invalid newStart format in rearrangement ${i}: "${rearrangement.newStart}"` };
        }
        
        if (!timeFormatRegex.test(rearrangement.newEnd)) {
          return { valid: false, error: `Invalid newEnd format in rearrangement ${i}: "${rearrangement.newEnd}"` };
        }
        
        // Validate that times can be parsed
        const startDate = new Date(rearrangement.newStart);
        const endDate = new Date(rearrangement.newEnd);
        
        if (isNaN(startDate.getTime())) {
          return { valid: false, error: `Invalid newStart value in rearrangement ${i}: "${rearrangement.newStart}"` };
        }
        
        if (isNaN(endDate.getTime())) {
          return { valid: false, error: `Invalid newEnd value in rearrangement ${i}: "${rearrangement.newEnd}"` };
        }
        
        if (startDate >= endDate) {
          return { valid: false, error: `Start time must be before end time in rearrangement ${i}` };
        }
      }
      
      console.log('✅ Event rearrangement validation passed');
      return { valid: true };
    }
    
    return { valid: false, error: `Unknown action type: ${actionData.type}` };
  } catch (error) {
    console.error('🚨 Error during validation:', error);
    return { valid: false, error: `Validation error: ${error.message}` };
  }
}

// Create a well-engineered prompt for Claude
function createCalendarPrompt(query, context) {
  // Format chat history for the prompt
  const chatHistorySection = context.chatHistory && context.chatHistory.length > 0 
    ? `
CHAT HISTORY (Recent conversation context):
${context.chatHistory.slice(-10).map((msg, index) => {
  const timestamp = new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
  return `[${timestamp}] ${msg.sender === 'user' ? 'User' : 'Tilly'}: ${msg.text}`;
}).join('\n')}
` 
    : '';

  return `You are Tilly, an intelligent calendar assistant. You have full access to the user's calendar and can help with scheduling, availability, and calendar management.

CURRENT CONTEXT:
- Current local time: ${context.currentLocalTime}
- Timezone: ${context.timezone}
- Current date: ${context.currentDate} (${context.currentDay})
- Total events in calendar: ${context.totalEvents}${chatHistorySection}

TODAY'S EVENTS (${context.todayEvents.length}):
${context.todayEvents.map(e => {
  const startTime = new Date(e.start).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
  const endTime = new Date(e.end).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
  return `- [ID:${e.id}] ${e.title} from ${startTime} to ${endTime}`;
}).join('\n') || '- No events today'}

TOMORROW'S EVENTS (${context.tomorrowEvents.length}):
${context.tomorrowEvents.map(e => {
  const startTime = new Date(e.start).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
  const endTime = new Date(e.end).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
  return `- [ID:${e.id}] ${e.title} from ${startTime} to ${endTime}`;
}).join('\n') || '- No events tomorrow'}

UPCOMING EVENTS (${context.upcomingEvents.length}):
${context.upcomingEvents.map(e => {
  const date = new Date(e.start).toLocaleDateString();
  const startTime = new Date(e.start).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
  const endTime = new Date(e.end).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
  return `- [ID:${e.id}] ${e.title} on ${date} from ${startTime} to ${endTime}`;
}).join('\n') || '- No upcoming events'}

WEEKLY STATS:
- Total events this week: ${context.weeklyStats.totalEvents}
- Total hours: ${context.weeklyStats.totalHours.toFixed(1)}
- Busiest day: ${context.weeklyStats.busiestDay || 'None'}

USER QUERY: "${query}"

INSTRUCTIONS:
1. Use the chat history above to maintain context and provide coherent follow-up responses. Reference previous conversations when relevant.

2. For event scheduling requests, be conversational and helpful. Check for TIME CONFLICTS (overlapping time slots) - having other events on the same day is fine unless they overlap. Then end your response with a JSON object:

Example for scheduling WITHOUT conflict:
"I'd be happy to schedule that meeting for tomorrow at 6pm! I see you have a meeting from 10:30am to 11:30am, but 6pm works perfectly since there's no time overlap.

{
  "type": "event_suggestion",
  "message": "Would you like me to add this meeting to your calendar?",
  "eventData": {
    "title": "Team Meeting",
    "start": "2025-05-27T18:00:00",
    "end": "2025-05-27T19:00:00"
  }
}"

Example for scheduling WITH conflict:
"I'd like to help you schedule that meeting for 2pm tomorrow, but you already have a meeting from 2:00pm to 3:00pm. How about 4pm instead?

{
  "type": "event_suggestion", 
  "message": "Would you like me to add this meeting at 4pm to your calendar?",
  "eventData": {
    "title": "Team Meeting",
    "start": "2025-05-27T16:00:00",
    "end": "2025-05-27T17:00:00"
  }
}"

3. For event rearrangement requests (move, reschedule, change time), suggest moving existing events:

Example for rearrangement:
"I can help you change the duration of your Flight Home! Let me update it to 7 hours as requested.

{
  "type": "event_rearrangement",
  "message": "Would you like me to update the Flight Home duration to 7 hours?",
  "rearrangements": [
    {
      "eventId": 5,
      "currentTitle": "Flight Home",
      "newStart": "2025-05-31T18:00:00",
      "newEnd": "2025-06-01T01:00:00"
    }
  ]
}"

4. For all other queries (availability, upcoming events, summaries, etc.), respond with helpful conversational text only.

5. IMPORTANT: A scheduling conflict only occurs when the proposed time OVERLAPS with an existing event. Multiple events on the same day are perfectly fine if they don't overlap in time.

6. For event scheduling:
   - Parse natural language to extract event title, date, and time
   - Check for ACTUAL time conflicts (overlapping periods), not just same-day events
   - Only suggest alternative times if there are real overlapping conflicts
   - Default to 1 hour duration if not specified
   - IMPORTANT: Provide times in LOCAL format (${context.timezone}) in the JSON - the frontend will handle UTC conversion
   - Use ISO format like "2025-05-27T18:00:00" (without Z suffix) for local times
   - CRITICAL: Double-check your time arithmetic. If you calculate "11:30 AM + 3 hours = 2:30 PM", make sure your JSON shows "14:30:00" not "02:30:00"

7. For event rearrangement:
   - Identify which existing event the user wants to move
   - Use the EXACT event ID from the context provided (shown as [ID:X] in the event listings above)
   - Suggest new times that don't conflict with other events
   - Preserve the event title and duration unless user specifies changes
   - CRITICAL: Match the event title to the correct ID from the context - do not guess or use wrong IDs
   - EXAMPLE: If user asks to modify "Flight Home", find "[ID:5] Flight Home" in the context and use eventId: 5
   - IMPORTANT: Provide times in LOCAL format (${context.timezone}) in the JSON - the frontend will handle UTC conversion
   - Use ISO format like "2025-05-27T18:00:00" (without Z suffix) for local times
   - CRITICAL: Verify your time calculations. When moving events, ensure start and end times are both correctly calculated
   - EXAMPLE: If moving a 30-minute event from 11:30 AM to 3:30 PM, JSON should show start: "2025-05-27T15:30:00", end: "2025-05-27T16:00:00"

8. Be natural and conversational while providing accurate calendar information. Always reference times in the user's local timezone (${context.timezone}). Use the chat history to provide contextual responses and remember what the user has asked about.

Response:`;
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Proxy server is running' });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down server...');
  await closeDatabase();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down server...');
  await closeDatabase();
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`Proxy server running on http://localhost:${PORT}`);
  console.log(`API endpoint: http://localhost:${PORT}/api/claude`);
  console.log(`Events API: http://localhost:${PORT}/api/events`);
  console.log(`Health check: http://localhost:${PORT}/health`);
}); 