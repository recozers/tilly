const express = require('express');
const cors = require('cors');
const ical = require('ical');
const multer = require('multer');
const nodemailer = require('nodemailer');
const path = require('path');
const { RRule, RRuleSet, rrulestr } = require('rrule');
require('dotenv').config();

// Import Supabase functions instead of SQLite
const {
  getAllEvents,
  getEventById,
  createEvent,
  updateEvent,
  deleteEvent,
  getEventsByDateRange,
  getEventsForPeriod,
  searchEvents,
  getCalendarStats,
  importEvents,
  addCalendarSubscription,
  getCalendarSubscriptions,
  updateCalendarSync,
  deleteCalendarSubscription,
  importEventsFromSubscription,
  getUpcomingEvents
} = require('./supabase.js');

const app = express();
const PORT = process.env.PORT || 8080;

// Get detailed timezone information for the user
function getUserTimezoneInfo(userTimeZone = null) {
  console.log('🌍 === TIMEZONE INFO DEBUG START ===');
  const now = new Date();
  const timeZone = userTimeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  console.log('🌍 Detected/provided timezone:', timeZone);
  
  // Get the timezone offset in hours and minutes
  const offsetMinutes = -now.getTimezoneOffset();
  const offsetHours = Math.floor(Math.abs(offsetMinutes) / 60);
  const offsetMinutesRemainder = Math.abs(offsetMinutes) % 60;
  const offsetSign = offsetMinutes >= 0 ? '+' : '-';
  const offsetFormatted = `UTC${offsetSign}${String(offsetHours).padStart(2, '0')}:${String(offsetMinutesRemainder).padStart(2, '0')}`;
  console.log('🌍 Current offset:', offsetFormatted, `(${offsetMinutes} minutes)`);
  
  // Check if it's daylight saving time
  const jan = new Date(now.getFullYear(), 0, 1);
  const jul = new Date(now.getFullYear(), 6, 1);
  const isDST = now.getTimezoneOffset() < Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset());
  console.log('🌍 DST status:', isDST ? 'ACTIVE' : 'INACTIVE');
  console.log('🌍 January offset:', -jan.getTimezoneOffset(), 'minutes');
  console.log('🌍 July offset:', -jul.getTimezoneOffset(), 'minutes');
  
  // Get current time in local format
  let localTimeStr;
  try {
    localTimeStr = now.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true,
      timeZone 
    });
    console.log('🌍 Local time string created successfully:', localTimeStr);
  } catch (localTimeError) {
    console.log('🌍 ERROR creating local time string:', localTimeError.message);
    localTimeStr = 'ERROR';
  }
  
  // Get timezone abbreviation (approximate)
  let tzAbbr;
  try {
    tzAbbr = now.toLocaleTimeString('en-US', { timeZoneName: 'short' })
      .split(' ').pop();
    console.log('🌍 Timezone abbreviation:', tzAbbr);
  } catch (e) {
    console.log('🌍 ERROR getting timezone abbreviation:', e.message);
    tzAbbr = isDST ? 'DST' : 'STD';
    console.log('🌍 Fallback timezone abbreviation:', tzAbbr);
  }
  
  const result = {
    timeZone,
    offsetFormatted,
    offsetMinutes,
    isDST,
    localTimeStr,
    tzAbbr,
    utcTimeStr: now.toISOString()
  };
  
  console.log('🌍 Final timezone info:', result);
  console.log('🌍 === TIMEZONE INFO DEBUG END ===');
  
  return result;
}

// Convert local time to UTC
function localToUTC(localTimeStr, dateStr = null) {
  // If no date is provided, use today
  const today = new Date();
  const date = dateStr ? new Date(dateStr) : today;
  
  // Parse time components
  let hours = 0;
  let minutes = 0;
  let isPM = false;
  
  // Handle different time formats
  if (localTimeStr.toLowerCase().includes('am') || localTimeStr.toLowerCase().includes('pm')) {
    // 12-hour format (e.g., "3:00 PM")
    const timeParts = localTimeStr.match(/(\d+):(\d+)\s*(am|pm)/i);
    if (timeParts) {
      hours = parseInt(timeParts[1], 10);
      minutes = parseInt(timeParts[2], 10);
      isPM = timeParts[3].toLowerCase() === 'pm';
      
      // Convert 12-hour to 24-hour
      if (isPM && hours < 12) hours += 12;
      if (!isPM && hours === 12) hours = 0;
    }
  } else {
    // 24-hour format (e.g., "15:00")
    const timeParts = localTimeStr.match(/(\d+):(\d+)/);
    if (timeParts) {
      hours = parseInt(timeParts[1], 10);
      minutes = parseInt(timeParts[2], 10);
    }
  }
  
  // Set the time components on the date
  date.setHours(hours, minutes, 0, 0);
  
  // Return ISO string (UTC)
  return date.toISOString();
}

// SIMPLE: Convert local time string to UTC
function convertLocalTimeToUTC(localTimeStr) {
  const userTimeZone = arguments[1] || 'Europe/London';
  
  console.log('🕐 Converting', localTimeStr, 'from timezone', userTimeZone);
  
  // If already has timezone offset (+/-), use directly
  // But if it's just 'Z' and we have a userTimeZone, treat as local time
  if (localTimeStr.match(/[Z]$/)) {
    // Strip Z and treat as local time in user's timezone
    console.log('🕐 Stripping Z suffix to treat as local time');
    localTimeStr = localTimeStr.replace(/\.?000?Z$/, '');
  } else if (localTimeStr.match(/[+-]\d{2}:?\d{2}$/)) {
    // Has explicit offset like +01:00 or -0500, use directly
    const result = new Date(localTimeStr);
    console.log('🕐 Already has offset, result:', result.toISOString());
    return result;
  }
  
  // Dead simple approach: treat as UTC first, then adjust for timezone
  const utcDate = new Date(localTimeStr + 'Z'); // Force UTC interpretation
  
  // Now we need to subtract the user's timezone offset
  // In June 2025, Europe/London will be BST (UTC+1), so we subtract 1 hour
  const tempFormatter = new Intl.DateTimeFormat('en', {
    timeZone: userTimeZone,
    timeZoneName: 'longOffset'
  });
  
  const offsetString = tempFormatter.formatToParts(utcDate).find(part => part.type === 'timeZoneName')?.value || '+00:00';
  console.log('🕐 Detected offset for', userTimeZone, ':', offsetString);
  
  // Parse offset (e.g., "+01:00" -> 1 hour)
  const offsetMatch = offsetString.match(/([+-])(\d{2}):(\d{2})/);
  if (offsetMatch) {
    const [, sign, hours, minutes] = offsetMatch;
    const offsetMs = (parseInt(hours) * 60 + parseInt(minutes)) * 60000;
    const adjustedMs = sign === '+' ? utcDate.getTime() - offsetMs : utcDate.getTime() + offsetMs;
    const result = new Date(adjustedMs);
    
    console.log('🕐 Result:', result.toISOString());
    return result;
  }
  
  // Fallback - just return the UTC interpretation
  console.log('🕐 Fallback result:', utcDate.toISOString());
  return utcDate;
}

// Convert UTC to local time string in user's timezone
function utcToLocal(utcTimeStr, format = '12h', userTimeZone = null) {
  const date = new Date(utcTimeStr);
  // Force user timezone instead of detecting server timezone
  const targetTimeZone = userTimeZone || 'Europe/London';
  const options = { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: format === '12h',
    timeZone: targetTimeZone
  };
  
  try {
    return date.toLocaleTimeString('en-GB', options);
  } catch (error) {
    console.log('🕐 Error in utcToLocal with timezone', targetTimeZone, ':', error.message);
    // Fallback to basic formatting if timezone is not available
    return date.toLocaleTimeString('en-GB', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: format === '12h'
    });
  }
}

// Email transporter configuration
const createEmailTransporter = () => {
  // For development, you can use Gmail with an App Password
  // In production, use a proper email service like SendGrid, AWS SES, etc.
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER, // Your email
      pass: process.env.EMAIL_PASS  // App password (not regular password)
    }
  });
};

// Generate iCal content for an event
const generateICalInvite = (event, organizerEmail = 'noreply@tilly.app') => {
  const now = new Date();
  const uid = `${event.id}-${now.getTime()}@tilly.app`;
  
  // Format dates for iCal (YYYYMMDDTHHMMSSZ)
  const formatDate = (date) => {
    return new Date(date).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  };
  
  const icalContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Tilly Calendar//Tilly//EN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${formatDate(now)}`,
    `DTSTART:${formatDate(event.start)}`,
    `DTEND:${formatDate(event.end)}`,
    `SUMMARY:${event.title}`,
    `ORGANIZER;CN=Tilly Calendar:MAILTO:${organizerEmail}`,
    `DESCRIPTION:Event created via Tilly Calendar`,
    'STATUS:CONFIRMED',
    'SEQUENCE:0',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
  
  return icalContent;
};

// Configure multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024 // 20MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept .ics files and text files
    if (file.mimetype === 'text/calendar' || 
        file.mimetype === 'text/plain' || 
        file.originalname.toLowerCase().endsWith('.ics')) {
      cb(null, true);
    } else {
      cb(new Error('Only .ics (iCalendar) files are allowed'));
    }
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static('dist'));
  
  // Catch all handler for SPA routing
  app.get('*', (req, res, next) => {
    // Skip API routes
    if (req.path.startsWith('/api/') || req.path.startsWith('/health')) {
      return next();
    }
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
}

// Authentication middleware
const authenticateUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No authentication token provided' });
    }
    
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    // Create authenticated Supabase client with user's token
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      }
    );
    
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid authentication token' });
    }
    
    // Add user info and authenticated Supabase client to request object
    req.user = user;
    req.userId = user.id;
    req.supabase = supabase; // Authenticated client
    
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(401).json({ error: 'Authentication failed' });
  }
};

// Supabase doesn't need initialization - it's ready to use!

// Anthropic API proxy endpoint
app.post('/api/claude', authenticateUser, async (req, res) => {
  try {
    const { message, chatHistory, userTimeZone } = req.body;

    // Store user's timezone in request for tool functions
    req.userTimeZone = userTimeZone;

    // Get user's timezone info - use provided timezone from frontend
    const timezoneInfo = getUserTimezoneInfo(userTimeZone);

    // Get today's and tomorrow's dates
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);

    // Fetch calendar data for context, NOW CORRECTLY SCOPED TO THE USER
    const [todayEvents, tomorrowEvents, upcomingEvents, weeklyStats, allEvents] = await Promise.all([
      getEventsForPeriod('today', req.userId, req.supabase),
      getEventsForPeriod('tomorrow', req.userId, req.supabase),
      getUpcomingEvents(15, req.userId, req.supabase),
      getCalendarStats('this_week', req.userId, req.supabase),
      getAllEvents(req.userId, req.supabase)
    ]);
    
    const context = {
      userTime: timezoneInfo.localTimeStr,
      currentDate: today.toLocaleDateString(),
      currentDay: today.toLocaleDateString('en-US', { weekday: 'long' }),
      currentLocalTime: today.toLocaleString(),
      timezone: timezoneInfo.timeZone,
      totalEvents: todayEvents.length,
      upcomingEvents: upcomingEvents.slice(0, 10),
      todayEvents,
      tomorrowEvents,
      recentEvents: todayEvents,
      weeklyStats,
      chatHistory
    };
    
    // Use Claude API for intelligent calendar assistance
    const requestBody = {
      model: 'claude-3-5-haiku-20240307',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: createCalendarPrompt(message, context)
      }]
    };

    console.log('🔍 DEBUG: Events being sent to Claude:');
    console.log('📅 Today events:', todayEvents.length, todayEvents.map(e => `${e.title} (${e.start} to ${e.end})`));
    console.log('📅 Tomorrow events:', tomorrowEvents.length, tomorrowEvents.map(e => `${e.title} (${e.start} to ${e.end})`));
    console.log('📅 Upcoming events (day after tomorrow+):', upcomingEvents.length, upcomingEvents.map(e => `${e.title} (${e.start} to ${e.end})`));
    console.log('🔍 DEBUG: Total events in 7-day range:', todayEvents.length);
    console.log('🔍 DEBUG: API Key present:', !!process.env.ANTHROPIC_API_KEY);
    console.log('🔍 DEBUG: API Key length:', process.env.ANTHROPIC_API_KEY ? process.env.ANTHROPIC_API_KEY.length : 0);

    // Retry logic for handling API overload
    const makeClaudeRequest = async (retryCount = 0, maxRetries = 3) => {
      const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff: 1s, 2s, 4s
      
      if (retryCount > 0) {
        console.log(`🔄 Retrying Claude API request (attempt ${retryCount + 1}/${maxRetries + 1}) after ${delay}ms delay...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(requestBody),
        timeout: 30000 // 30 second timeout
      });

      console.log('🔍 DEBUG: Claude API response status:', response.status);
      console.log('🔍 DEBUG: Claude API response headers:', Object.fromEntries(response.headers.entries()));

      // Handle overload errors with retry
      if (response.status === 529 && retryCount < maxRetries) {
        const errorText = await response.text();
        console.log(`⚠️ Claude API overloaded (529), retrying... Response: ${errorText}`);
        return makeClaudeRequest(retryCount + 1, maxRetries);
      }

      return response;
    };

    const response = await makeClaudeRequest();

    if (!response.ok) {
      const errorText = await response.text();
      console.error('🚨 Claude API Error Response:', errorText);
      
      // If Claude API is overloaded after all retries, provide a graceful fallback
      if (response.status === 529) {
        console.log('📋 Providing fallback response due to Claude API overload');
        const fallbackResponse = createFallbackResponse(message, context);
        res.json({ response: fallbackResponse, context: context });
        return;
      }
      
      throw new Error(`Claude API request failed: ${response.status} ${response.statusText}`);
    }

    const claudeData = await response.json();
    const claudeResponse = claudeData.content[0].text;
    
    // Try to extract JSON from the response (could be mixed with text)
    const jsonMatch = claudeResponse.match(/\{[\s\S]*"type":\s*"(event_suggestion|event_rearrangement|multiple_actions)"[\s\S]*\}/);
    
    if (jsonMatch) {
      try {
        const actionData = JSON.parse(jsonMatch[0]);
        if (actionData.type === 'event_suggestion' || actionData.type === 'event_rearrangement' || actionData.type === 'multiple_actions') {
          // Validate the action data before sending to frontend
          const validationResult = validateActionData(actionData, context);
          if (!validationResult.valid) {
            console.error('🚨 Claude response validation failed:', validationResult.error);
            console.error('🚨 Original Claude response:', claudeResponse);
            // Send error response back to user explaining the issue
            res.status(400).json({ 
              error: 'Invalid calendar response detected',
              details: validationResult.error,
              suggestion: 'Please try rephrasing your request or ask for a different time slot.'
            });
            return;
          } else {
            // Extract the text part (everything before the JSON)
            const textPart = claudeResponse.replace(jsonMatch[0], '').trim();
            
            // Return both the conversational text and the structured action data
            res.json({ 
              response: {
                type: actionData.type,
                message: textPart || actionData.message,
                eventData: actionData.eventData,
                rearrangements: actionData.rearrangements || null,
                actions: actionData.actions || null
              }, 
              context: context 
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
    res.json({ response: claudeResponse, context: context });
  } catch (error) {
    console.error('Error processing calendar query:', error);
    res.status(500).json({ error: 'Failed to process calendar query' });
  }
});

// Events API endpoints

// GET /api/events - Get all events
app.get('/api/events', authenticateUser, async (req, res) => {
  try {
    const events = await getAllEvents(req.userId, req.supabase);
    res.json(events);
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// GET /api/events/range - Get events within a date range
app.get('/api/events/range', authenticateUser, async (req, res) => {
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
    
    const events = await getEventsByDateRange(startDate, endDate, req.userId, req.supabase);
    res.json(events);
  } catch (error) {
    console.error('Error fetching events by date range:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// POST /api/events - Create a new event
app.post('/api/events', authenticateUser, async (req, res) => {
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
      color: color || '#4A7C2A'
    }, req.userId, req.supabase);
    
    console.log('Created new event:', newEvent);
    res.status(201).json(newEvent);
  } catch (error) {
    console.error('Error creating event:', error);
    res.status(500).json({ error: 'Failed to create event' });
  }
});

// PUT /api/events/:id - Update an existing event
app.put('/api/events/:id', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, start, end, color } = req.body;
    const userId = req.userId;
    const authenticatedSupabase = req.supabase;
    
    // Get the existing event first
    const existingEvents = await getAllEvents(userId, authenticatedSupabase);
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
    
    const updatedEvent = await updateEvent(parseInt(id), updateData, userId, authenticatedSupabase);
    
    console.log('Updated event:', updatedEvent);
    res.json(updatedEvent);
  } catch (error) {
    console.error('Error updating event:', error);
    res.status(500).json({ error: 'Failed to update event' });
  }
});

// DELETE /api/events/:id - Delete an event
app.delete('/api/events/:id', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;
    const authenticatedSupabase = req.supabase;
    const result = await deleteEvent(parseInt(id), userId, authenticatedSupabase);
    
    console.log('Deleted event:', result);
    res.json({ message: 'Event deleted successfully', id: parseInt(id) });
  } catch (error) {
    console.error('Error deleting event:', error);
    res.status(500).json({ error: 'Failed to delete event' });
  }
});

// ============================================================================
// AI TOOL ENDPOINTS - Clean tool-based API for Claude assistant
// ============================================================================

// Tool: get_calendar_events - Get events for conflict checking and context
app.post('/api/tools/get_calendar_events', authenticateUser, async (req, res) => {
  try {
    const { start_date, end_date } = req.body;
    
    let events;
    if (start_date && end_date) {
      // Get events within specific date range
      events = await getEventsByDateRange(
        new Date(start_date), 
        new Date(end_date), 
        req.userId, 
        req.supabase
      );
    } else {
      // Get all events if no range specified
      events = await getAllEvents(req.userId, req.supabase);
    }
    
    // Format for AI consumption
    const formattedEvents = events.map(event => ({
      id: event.id,
      title: event.title,
      start: event.start,
      end: event.end,
      color: event.color
    }));
    
    res.json({
      success: true,
      events: formattedEvents,
      count: formattedEvents.length
    });
  } catch (error) {
    console.error('Error getting calendar events:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get calendar events',
      details: error.message 
    });
  }
});

// Tool: create_event - Create a new event
app.post('/api/tools/create_event', authenticateUser, async (req, res) => {
  try {
    const { title, start_time, end_time, description } = req.body;
    
    if (!title || !start_time || !end_time) {
      return res.status(400).json({ 
        success: false,
        error: 'Title, start_time, and end_time are required' 
      });
    }
    
    const startDate = new Date(start_time);
    const endDate = new Date(end_time);
    
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid date format' 
      });
    }
    
    if (startDate >= endDate) {
      return res.status(400).json({ 
        success: false,
        error: 'Start time must be before end time' 
      });
    }
    
    const newEvent = await createEvent({
      title,
      start: startDate,
      end: endDate,
      color: '#F4F1E8', // AI events use cream color
      description
    }, req.userId, req.supabase);
    
    console.log('🤖 AI created event:', newEvent);
    res.json({
      success: true,
      event: newEvent,
      message: `Created event "${title}" from ${startDate.toLocaleString()} to ${endDate.toLocaleString()}`
    });
  } catch (error) {
    console.error('Error creating event via AI tool:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to create event',
      details: error.message 
    });
  }
});

// Tool: move_event - Move/reschedule an existing event
app.post('/api/tools/move_event', authenticateUser, async (req, res) => {
  try {
    const { event_id, new_start_time, new_end_time, new_title } = req.body;
    
    if (!event_id || !new_start_time || !new_end_time) {
      return res.status(400).json({ 
        success: false,
        error: 'event_id, new_start_time, and new_end_time are required' 
      });
    }
    
    const newStartDate = new Date(new_start_time);
    const newEndDate = new Date(new_end_time);
    
    if (isNaN(newStartDate.getTime()) || isNaN(newEndDate.getTime())) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid date format' 
      });
    }
    
    if (newStartDate >= newEndDate) {
      return res.status(400).json({ 
        success: false,
        error: 'New start time must be before new end time' 
      });
    }
    
    // Check if event exists and user has access
    const allEvents = await getAllEvents(req.userId, req.supabase);
    const existingEvent = allEvents.find(e => e.id === parseInt(event_id));
    
    if (!existingEvent) {
      return res.status(404).json({ 
        success: false,
        error: 'Event not found' 
      });
    }
    
    const updatedEvent = await updateEvent(parseInt(event_id), {
      start: newStartDate,
      end: newEndDate
    }, req.userId, req.supabase);
    
    console.log('🤖 AI moved event:', updatedEvent);
    res.json({
      success: true,
      event: updatedEvent,
      message: `Moved "${updatedEvent.title}" to ${newStartDate.toLocaleString()} - ${newEndDate.toLocaleString()}`
    });
  } catch (error) {
    console.error('Error moving event via AI tool:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to move event',
      details: error.message 
    });
  }
});

// Tool: check_time_conflicts - Check for conflicts with a proposed time
app.post('/api/tools/check_time_conflicts', authenticateUser, async (req, res) => {
  try {
    const { start_time, end_time, exclude_event_id } = req.body;
    
    if (!start_time || !end_time) {
      return res.status(400).json({ 
        success: false,
        error: 'start_time and end_time are required' 
      });
    }
    
    const startDate = new Date(start_time);
    const endDate = new Date(end_time);
    
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid date format' 
      });
    }
    
    // Get all events to check conflicts
    const allEvents = await getAllEvents(req.userId, req.supabase);
    
    // Filter out the excluded event if provided (for rescheduling scenarios)
    const eventsToCheck = exclude_event_id 
      ? allEvents.filter(e => e.id !== parseInt(exclude_event_id))
      : allEvents;
    
    const conflicts = checkEventConflicts(startDate, endDate, eventsToCheck);
    
    res.json({
      success: true,
      has_conflicts: conflicts.length > 0,
      conflicts: conflicts.map(event => ({
        id: event.id,
        title: event.title,
        start: event.start,
        end: event.end
      })),
      conflict_count: conflicts.length
    });
  } catch (error) {
    console.error('Error checking time conflicts:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to check conflicts',
      details: error.message 
    });
  }
});

// NEW: Tool-based Claude AI endpoint
app.post('/api/ai/chat', authenticateUser, async (req, res) => {
  try {
    const { message, chatHistory = [], userTimeZone } = req.body;
    
    console.log('🌐 === AI CHAT REQUEST DEBUG ===');
    console.log('🌐 Received userTimeZone:', userTimeZone);
    console.log('🌐 Server detected timezone:', Intl.DateTimeFormat().resolvedOptions().timeZone);
    
    // Store user's timezone in request for tool functions
    req.userTimeZone = userTimeZone;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Define tools for Claude
    const tools = [
      {
        name: "get_calendar_events",
        description: "Get calendar events for a specific date range or all events if no range provided. Use this to check existing events before scheduling.",
        input_schema: {
          type: "object",
          properties: {
            start_date: {
              type: "string",
              description: "Start date in ISO format (YYYY-MM-DD) - optional"
            },
            end_date: {
              type: "string", 
              description: "End date in ISO format (YYYY-MM-DD) - optional"
            }
          }
        }
      },
      {
        name: "create_event",
        description: "Create a new calendar event. Always check for conflicts first using get_calendar_events.",
        input_schema: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "Event title"
            },
            start_time: {
              type: "string",
              description: "Start time in local timezone format (YYYY-MM-DDTHH:MM:SS) - do NOT include Z suffix"
            },
            end_time: {
              type: "string",
              description: "End time in local timezone format (YYYY-MM-DDTHH:MM:SS) - do NOT include Z suffix"
            },
            description: {
              type: "string",
              description: "Optional event description"
            }
          },
          required: ["title", "start_time", "end_time"]
        }
      },
      {
        name: "move_event",
        description: "Move/reschedule an existing event to a new time and optionally change its title. Use check_time_conflicts first to ensure no conflicts.",
        input_schema: {
          type: "object",
          properties: {
            event_id: {
              type: "integer",
              description: "ID of the event to move"
            },
            new_start_time: {
              type: "string",
              description: "New start time in local timezone format (YYYY-MM-DDTHH:MM:SS) - do NOT include Z suffix"
            },
            new_end_time: {
              type: "string",
              description: "New end time in local timezone format (YYYY-MM-DDTHH:MM:SS) - do NOT include Z suffix"
            },
            new_title: {
              type: "string",
              description: "Optional: New title for the event. Use this when renaming and moving in one operation."
            }
          },
          required: ["event_id", "new_start_time", "new_end_time"]
        }
      },
      {
        name: "check_time_conflicts",
        description: "Check if a proposed time slot conflicts with existing events.",
        input_schema: {
          type: "object",
          properties: {
            start_time: {
              type: "string",
              description: "Proposed start time in local timezone format (YYYY-MM-DDTHH:MM:SS) - do NOT include Z suffix"
            },
            end_time: {
              type: "string",
              description: "Proposed end time in local timezone format (YYYY-MM-DDTHH:MM:SS) - do NOT include Z suffix"
            },
            exclude_event_id: {
              type: "integer",
              description: "Optional: Event ID to exclude from conflict check (for rescheduling)"
            }
          },
          required: ["start_time", "end_time"]
        }
      },
      {
        name: "search_events",
        description: "Search for events by title (case-insensitive partial match).",
        input_schema: {
          type: "object",
          properties: {
            search_term: {
              type: "string",
              description: "Text to search for in event titles"
            },
            start_date: {
              type: "string",
              description: "Optional: Filter events starting after this date (YYYY-MM-DD)"
            },
            end_date: {
              type: "string",
              description: "Optional: Filter events starting before this date (YYYY-MM-DD)"
            }
          },
          required: ["search_term"]
        }
      }
    ];

    // Get today and tomorrow's events for context
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    
    const todayStr = today.toISOString().split('T')[0];
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    
    // Get events for today and tomorrow
    const todayEvents = await getEventsByDateRange(
      new Date(todayStr + 'T00:00:00Z'),
      new Date(todayStr + 'T23:59:59Z'),
      req.userId,
      req.supabase
    );
    
    const tomorrowEvents = await getEventsByDateRange(
      new Date(tomorrowStr + 'T00:00:00Z'),
      new Date(tomorrowStr + 'T23:59:59Z'),
      req.userId,
      req.supabase
    );
    
    // Format events for the prompt
    const formatEventsForPrompt = (events, day) => {
      if (events.length === 0) return `${day}: No events scheduled`;
      return `${day}: ${events.map(e => `"${e.title}" (${utcToLocal(e.start, '12h', req.userTimeZone)} - ${utcToLocal(e.end, '12h', req.userTimeZone)})`).join(', ')}`;
    };

    // Create system prompt with detailed timezone information
    const tzInfo = getUserTimezoneInfo(req.userTimeZone);
    const systemPrompt = `You are Tilly, a helpful calendar assistant. 

CURRENT CONTEXT:
- Current UTC time: ${new Date().toISOString()}
- Current local time: ${tzInfo.localTimeStr}
- Current date: ${new Date().toLocaleDateString()}
- Current day: ${new Date().toLocaleDateString('en-US', { weekday: 'long' })}
- User timezone: ${tzInfo.timeZone} (${tzInfo.offsetFormatted}, ${tzInfo.tzAbbr})
- Daylight Saving Time active: ${tzInfo.isDST ? 'Yes' : 'No'}

UPCOMING EVENTS:
- ${formatEventsForPrompt(todayEvents, 'Today')}
- ${formatEventsForPrompt(tomorrowEvents, 'Tomorrow')}

IMPORTANT TIME HANDLING:
- When DISPLAYING times to the user, ALWAYS convert from UTC to ${tzInfo.timeZone} (${tzInfo.offsetFormatted})
- When CALLING TOOLS, always use LOCAL TIME format (YYYY-MM-DDTHH:MM:SS) without Z suffix
- When the user mentions times like "3pm", interpret that as ${tzInfo.timeZone} time and pass as-is to tools (e.g., "2025-06-20T15:00:00")
- NEVER include Z suffix in tool calls - the system handles UTC conversion automatically
- Display times naturally without explicitly mentioning the timezone unless there's ambiguity or the user asks

TIME CONVERSION EXAMPLES:
- Local 9:00 AM ${tzInfo.tzAbbr} = ${localToUTC("9:00 AM")} in UTC
- Local 3:00 PM ${tzInfo.tzAbbr} = ${localToUTC("3:00 PM")} in UTC
- Local 8:30 PM ${tzInfo.tzAbbr} = ${localToUTC("8:30 PM")} in UTC
- UTC ${new Date().toISOString()} = ${utcToLocal(new Date().toISOString(), '12h', req.userTimeZone)} ${tzInfo.tzAbbr}

GUIDELINES:
1. You automatically have context of today and tomorrow's events (shown above) - use this for quick reference
2. For events on other days, use the get_calendar_events tool to retrieve them
3. Always check existing events before scheduling to avoid conflicts
4. When creating events, use LOCAL TIME format (YYYY-MM-DDTHH:MM:SS) WITHOUT Z suffix
5. Suggest alternative times if conflicts exist
6. Be conversational and helpful
7. If moving events to resolve conflicts, explain the changes clearly
8. Use tools in the right order: check conflicts → create/move events
9. Events you create will automatically appear in cream color to distinguish them from user-created events
10. When renaming and moving an event, use the move_event tool with new_title parameter rather than creating new events and deleting old ones
11. You can search for events by title using the search_events tool with a search term

CONFLICT RESOLUTION STRATEGY:
- Check for conflicts first with check_time_conflicts
- If conflicts exist, either suggest alternative times or offer to move existing events
- Prefer suggesting buffer time (15-30 min) between events
- Ask user permission before moving existing events`;

    // Build message history for Claude
    const messages = [];
    
    // Add chat history
    chatHistory.forEach(msg => {
      messages.push({
        role: msg.sender === 'user' ? 'user' : 'assistant',
        content: msg.text
      });
    });
    
    // Add current message
    messages.push({
      role: 'user',
      content: message
    });

    const claudeRequest = {
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 1000,
      system: systemPrompt,
      messages: messages,
      tools: tools
    };

    console.log('🤖 Making Claude API request with tools...');
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(claudeRequest)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Claude API error:', errorText);
      throw new Error(`Claude API request failed: ${response.status}`);
    }

    const claudeData = await response.json();
    
    // Check if Claude wants to use tools
    const hasToolUse = claudeData.content.some(content => content.type === 'tool_use');
    
    if (hasToolUse) {
      console.log('🔧 Claude wants to use tools, executing and getting final response...');
      
      // Execute all tool calls
      const toolResults = [];
      for (const content of claudeData.content) {
        if (content.type === 'tool_use') {
          console.log(`🔧 Executing tool: ${content.name}`, content.input);
          
          try {
            let toolResult;
            
            switch (content.name) {
              case 'get_calendar_events':
                toolResult = await executeGetCalendarEvents(content.input, req);
                break;
              case 'create_event':
                toolResult = await executeCreateEvent(content.input, req);
                break;
              case 'move_event':
                toolResult = await executeMoveEvent(content.input, req);
                break;
              case 'check_time_conflicts':
                toolResult = await executeCheckTimeConflicts(content.input, req);
                break;
              case 'search_events':
                toolResult = await executeSearchEvents(content.input, req);
                break;
              default:
                toolResult = { success: false, error: 'Unknown tool' };
            }
            
                      console.log(`✅ Tool ${content.name} completed:`, toolResult.success ? 'SUCCESS' : 'FAILED');
          
          // Track tool name for change detection BEFORE stringifying
          toolResult._tool_name = content.name;
          
          toolResults.push({
            tool_use_id: content.id,
            type: 'tool_result',
            content: JSON.stringify(toolResult)
          });
            
  } catch (error) {
            console.error(`❌ Error executing tool ${content.name}:`, error);
            toolResults.push({
              tool_use_id: content.id,
              type: 'tool_result',
              content: JSON.stringify({ success: false, error: error.message })
            });
          }
        }
      }
      
      // Continue conversation with tool results, allowing for multiple rounds
      const conversationMessages = [
        ...messages,
        {
          role: 'assistant',
          content: claudeData.content
        },
        {
          role: 'user',
          content: toolResults
        }
      ];
      
      let allToolResults = [...toolResults];
      let finalResponse;
      let maxRounds = 5; // Prevent infinite loops
      let round = 1;
      
      while (round <= maxRounds) {
        console.log(`🔄 Round ${round}: Sending tool results back to Claude...`);
        
        const followUpRequest = {
          model: 'claude-3-5-haiku-20241022',
          max_tokens: 1000,
          system: systemPrompt,
          messages: conversationMessages,
          tools: tools
        };
        
        const followUpResponse = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify(followUpRequest)
        });
        
        if (!followUpResponse.ok) {
          const errorText = await followUpResponse.text();
          console.error(`Claude API error ${followUpResponse.status}:`, errorText);
          throw new Error(`Claude follow-up request failed: ${followUpResponse.status}`);
        }
        
        finalResponse = await followUpResponse.json();
        
        // Check if Claude wants to use more tools
        const hasMoreToolUse = finalResponse.content.some(content => content.type === 'tool_use');
        
        if (!hasMoreToolUse) {
          console.log(`🎉 Round ${round}: Claude finished with final response`);
          break;
        }
        
        console.log(`🔧 Round ${round}: Claude wants to use more tools...`);
        
        // Execute the additional tools
        const moreToolResults = [];
        for (const content of finalResponse.content) {
          if (content.type === 'tool_use') {
            console.log(`🔧 Round ${round}: Executing tool: ${content.name}`, content.input);
            
            try {
              let toolResult;
              
              switch (content.name) {
                case 'get_calendar_events':
                  toolResult = await executeGetCalendarEvents(content.input, req);
                  break;
                case 'create_event':
                  toolResult = await executeCreateEvent(content.input, req);
                  break;
                case 'move_event':
                  toolResult = await executeMoveEvent(content.input, req);
                  break;
                case 'check_time_conflicts':
                  toolResult = await executeCheckTimeConflicts(content.input, req);
                  break;
                case 'search_events':
                  toolResult = await executeSearchEvents(content.input, req);
                  break;
                default:
                  toolResult = { success: false, error: 'Unknown tool' };
              }
              
              console.log(`✅ Round ${round}: Tool ${content.name} completed:`, toolResult.success ? 'SUCCESS' : 'FAILED');
              
              // Track tool name for change detection BEFORE stringifying
              toolResult._tool_name = content.name;
              
              moreToolResults.push({
                tool_use_id: content.id,
                type: 'tool_result',
                content: JSON.stringify(toolResult)
              });
              
  } catch (error) {
              console.error(`❌ Round ${round}: Error executing tool ${content.name}:`, error);
              moreToolResults.push({
                tool_use_id: content.id,
                type: 'tool_result',
                content: JSON.stringify({ success: false, error: error.message })
              });
            }
          }
        }
        
        // Add this round to the conversation
        conversationMessages.push({
          role: 'assistant',
          content: finalResponse.content
        });
        conversationMessages.push({
          role: 'user',
          content: moreToolResults
        });
        
        allToolResults.push(...moreToolResults);
        round++;
      }
      
      const finalText = finalResponse.content.map(c => c.text).join('');
      
              // Check if any events were created/moved across all rounds
        console.log('🔍 Checking for event changes in', allToolResults.length, 'tool results');
        const hasEventChanges = allToolResults.some(result => {
          const content = JSON.parse(result.content);
          console.log('🔍 Tool result:', content._tool_name, 'success:', content.success);
          return content.success && ['create_event', 'move_event'].includes(content._tool_name);
        });
        
        console.log('🔍 hasEventChanges:', hasEventChanges);
        if (hasEventChanges) {
          console.log('📅 Event changes detected - frontend will refresh calendar');
        }
      
      res.json({
        response: finalText,
        toolResults: allToolResults.map(r => ({ ...r, content: JSON.parse(r.content) })),
        hasEventChanges,
        totalRounds: round - 1,
        success: true
      });
      
    } else {
      // No tools needed, just return Claude's text response
      const responseText = claudeData.content.map(c => c.text).join('');
      res.json({
        response: responseText,
        toolResults: [],
        hasEventChanges: false,
        success: true
      });
    }

  } catch (error) {
    console.error('Error in AI chat:', error);
    res.status(500).json({ 
      error: 'Failed to process AI request',
      details: error.message 
    });
  }
});

// Tool execution functions - call directly instead of HTTP requests to avoid loops
async function executeGetCalendarEvents(input, req) {
  try {
    const { start_date, end_date } = input;
    
    // Default to a 7-day range if no dates are provided
    const startDate = start_date ? new Date(start_date) : new Date();
    let endDate;
    if (end_date) {
      endDate = new Date(end_date);
    } else if (start_date) {
      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 1); // 24-hour period if only start_date is given
    } else {
      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 7); // Default 7-day view
    }
    
    // Ensure end date is after start date
    if (endDate <= startDate) {
      endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000);
    }
    
    console.log(`🔍 Fetching events from ${startDate.toISOString()} to ${endDate.toISOString()} for user ${req.userId}`);
    
    const events = await getEventsByDateRange(startDate, endDate, req.userId, req.supabase);
    
    if (events.length === 0) {
      return { success: true, message: "No events found in this date range." };
    }
    
    const eventsList = events.map(e => `[ID:${e.id}] "${e.title}" from ${e.start.toISOString()} to ${e.end.toISOString()}`).join('\n');
    
    return { 
      success: true, 
      count: events.length,
      events: eventsList
    };
    
  } catch (error) {
    console.error('Error in executeGetCalendarEvents:', error);
    return { success: false, error: 'Failed to retrieve calendar events.' };
  }
}

async function executeCreateEvent(input, req) {
  try {
    const { title, start_time, end_time, description } = input;
    
    if (!title || !start_time || !end_time) {
      return { 
        success: false,
        error: 'Title, start_time, and end_time are required' 
      };
    }
    
    // Use the DST-aware conversion function for Claude's local time inputs
    let startDate, endDate;
    try {
      startDate = convertLocalTimeToUTC(start_time, req.userTimeZone);
      endDate = convertLocalTimeToUTC(end_time, req.userTimeZone);
    } catch (error) {
      return { 
        success: false,
        error: 'Invalid date format: ' + error.message 
      };
    }
    
    console.log('🔍 Input times:', start_time, 'to', end_time);
    console.log('🔍 DST-aware parsed dates (UTC):', startDate.toISOString(), 'to', endDate.toISOString());
    console.log('🔍 Will display as local:', utcToLocal(startDate.toISOString(), '12h', req.userTimeZone), 'to', utcToLocal(endDate.toISOString(), '12h', req.userTimeZone));
    
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return { 
        success: false,
        error: 'Invalid date format' 
      };
    }
    
    if (startDate >= endDate) {
      return { 
        success: false,
        error: 'Start time must be before end time' 
      };
    }
    
    const newEvent = await createEvent({
      title,
      start: startDate,
      end: endDate,
      color: '#F4F1E8', // AI events use cream color
      description
    }, req.userId, req.supabase);
    
    console.log('🤖 AI created event:', newEvent);
    return {
      success: true,
      event: newEvent,
      message: `Created event "${title}" from ${utcToLocal(startDate.toISOString(), '12h', req.userTimeZone)} to ${utcToLocal(endDate.toISOString(), '12h', req.userTimeZone)}`
    };
  } catch (error) {
    console.error('Error in executeCreateEvent:', error);
    return { 
      success: false,
      error: 'Failed to create event',
      details: error.message 
    };
  }
}

async function executeMoveEvent(input, req) {
  try {
    const { event_id, new_start_time, new_end_time, new_title } = input;
    
    if (!event_id || !new_start_time || !new_end_time) {
      return { 
        success: false,
        error: 'event_id, new_start_time, and new_end_time are required' 
      };
    }
    
    // Use the DST-aware conversion function for Claude's local time inputs
    let newStartDate, newEndDate;
    try {
      newStartDate = convertLocalTimeToUTC(new_start_time, req.userTimeZone);
      newEndDate = convertLocalTimeToUTC(new_end_time, req.userTimeZone);
    } catch (error) {
      return { 
        success: false,
        error: 'Invalid date format: ' + error.message 
      };
    }
    console.log('🔍 Move input times:', new_start_time, 'to', new_end_time);
    console.log('🔍 DST-aware parsed dates (UTC):', newStartDate.toISOString(), 'to', newEndDate.toISOString());
    console.log('🔍 Will display as local:', utcToLocal(newStartDate.toISOString(), '12h', req.userTimeZone), 'to', utcToLocal(newEndDate.toISOString(), '12h', req.userTimeZone));
    
    if (isNaN(newStartDate.getTime()) || isNaN(newEndDate.getTime())) {
      return { 
        success: false,
        error: 'Invalid date format' 
      };
    }
    
    if (newStartDate >= newEndDate) {
      return { 
        success: false,
        error: 'New start time must be before new end time' 
      };
    }
    
    // Check if event exists and user has access - using direct lookup
    const existingEvent = await getEventById(parseInt(event_id), req.userId, req.supabase);
    
    if (!existingEvent) {
      return { 
        success: false,
        error: 'Event not found' 
      };
    }
    
    const updatedEvent = await updateEvent(parseInt(event_id), {
      start: newStartDate,
      end: newEndDate
    }, req.userId, req.supabase);
    
    console.log('🤖 AI moved event:', updatedEvent);
    return {
      success: true,
      event: updatedEvent,
      message: `Moved "${updatedEvent.title}" to ${utcToLocal(newStartDate.toISOString(), '12h', req.userTimeZone)} - ${utcToLocal(newEndDate.toISOString(), '12h', req.userTimeZone)}`
    };
  } catch (error) {
    console.error('Error in executeMoveEvent:', error);
    return { 
      success: false,
      error: 'Failed to move event',
      details: error.message 
    };
  }
}

async function executeCheckTimeConflicts(input, req) {
  try {
    const { start_time, end_time, exclude_event_id } = input;
    
    if (!start_time || !end_time) {
      return { 
        success: false,
        error: 'start_time and end_time are required' 
      };
    }
    
    // Use the DST-aware conversion function for Claude's local time inputs
    let startDate, endDate;
    try {
      startDate = convertLocalTimeToUTC(start_time, req.userTimeZone);
      endDate = convertLocalTimeToUTC(end_time, req.userTimeZone);
    } catch (error) {
      return { 
        success: false,
        error: 'Invalid date format: ' + error.message 
      };
    }
    console.log('🔍 Conflict check input times:', start_time, 'to', end_time);
    console.log('🔍 DST-aware parsed dates (UTC):', startDate.toISOString(), 'to', endDate.toISOString());
    console.log('🔍 Will display as local:', utcToLocal(startDate.toISOString(), '12h', req.userTimeZone), 'to', utcToLocal(endDate.toISOString(), '12h', req.userTimeZone));
    
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return { 
        success: false,
        error: 'Invalid date format' 
      };
    }
    
    // Get only events that might conflict (in the same timeframe)
    // This is more efficient than loading ALL events
    const eventsInTimeframe = await getEventsByDateRange(
      new Date(new Date(startDate).getTime() - 24 * 60 * 60 * 1000), // 1 day before
      new Date(new Date(endDate).getTime() + 24 * 60 * 60 * 1000),   // 1 day after
      req.userId,
      req.supabase
    );
    
    // Filter out the excluded event if provided (for rescheduling scenarios)
    const eventsToCheck = exclude_event_id 
      ? eventsInTimeframe.filter(e => e.id !== parseInt(exclude_event_id))
      : eventsInTimeframe;
    
    const conflicts = checkEventConflicts(startDate, endDate, eventsToCheck);
    
    return {
      success: true,
      has_conflicts: conflicts.length > 0,
      conflicts: conflicts.map(event => ({
        id: event.id,
        title: event.title,
        start: event.start,
        end: event.end
      })),
      conflict_count: conflicts.length
    };
  } catch (error) {
    console.error('Error in executeCheckTimeConflicts:', error);
    return { 
      success: false,
      error: 'Failed to check conflicts',
      details: error.message 
    };
  }
}

async function executeSearchEvents(input, req) {
  try {
    const { search_term, start_date, end_date } = input;
    
    if (!search_term) {
      return { 
        success: false,
        error: 'search_term is required' 
      };
    }
    
    console.log(`🔍 Searching events with term: "${search_term}"`);
    
    // Set up the timeframe filter if dates are provided
    let timeframe = null;
    
    if (start_date || end_date) {
      timeframe = {};
      const tzInfo = getUserTimezoneInfo(req.userTimeZone);
      console.log('🔍 User timezone for search:', tzInfo.timeZone, tzInfo.offsetFormatted, tzInfo.isDST ? '(DST active)' : '');
      
      if (start_date) {
        // Handle timezone properly for start date
        const startDate = start_date.includes('Z') || start_date.includes('+') || start_date.includes('-') 
          ? new Date(start_date) 
          : new Date(start_date + 'T00:00:00Z'); // Assume start of day in UTC if just a date
        
        if (isNaN(startDate.getTime())) {
          return {
            success: false,
            error: 'Invalid start_date format. Use YYYY-MM-DD.'
          };
        }
        console.log('🔍 Search start date (UTC):', startDate.toISOString());
        console.log('🔍 Search start date (local):', utcToLocal(startDate.toISOString(), '12h', req.userTimeZone));
        timeframe.start = startDate;
      } else {
        // If no start date, use a date far in the past
        timeframe.start = new Date(0); // Jan 1, 1970
      }
      
      if (end_date) {
        // Handle timezone properly for end date
        let endDate;
        if (end_date.includes('Z') || end_date.includes('+') || end_date.includes('-')) {
          // If it has timezone info, use it directly
          endDate = new Date(end_date);
        } else if (end_date.length === 10) { // YYYY-MM-DD format
          // If just a date is provided without time, set to end of day in UTC
          endDate = new Date(end_date + 'T23:59:59Z');
        } else {
          // Otherwise assume it's UTC time
          endDate = new Date(end_date + 'Z');
        }
        
        if (isNaN(endDate.getTime())) {
          return {
            success: false,
            error: 'Invalid end_date format. Use YYYY-MM-DD.'
          };
        }
        
        console.log('🔍 Search end date (UTC):', endDate.toISOString());
        console.log('🔍 Search end date (local):', utcToLocal(endDate.toISOString(), '12h', req.userTimeZone));
        timeframe.end = endDate;
      } else {
        // If no end date, use a date far in the future
        timeframe.end = new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000); // ~10 years from now
      }
      
      console.log(`🔍 Filtering by timeframe: ${timeframe.start.toISOString()} to ${timeframe.end.toISOString()}`);
    }
    
    // Perform the search
    const events = await searchEvents(search_term, timeframe, req.userId, req.supabase);
    
    console.log(`🔍 Found ${events.length} events matching "${search_term}"`);
    
    // Limit events sent to Claude to prevent API issues
    const maxEventsForAI = 50;
    const eventsForAI = events.slice(0, maxEventsForAI);
    const wasLimited = events.length > maxEventsForAI;
    
    return {
      success: true,
      events: eventsForAI.map(event => ({
        id: event.id,
        title: event.title,
        start: event.start,
        end: event.end,
        color: event.color
      })),
      count: eventsForAI.length,
      total_count: events.length,
      search_term: search_term,
      ...(wasLimited && { note: `Showing first ${maxEventsForAI} of ${events.length} events` })
    };
  } catch (error) {
    console.error('Error in executeSearchEvents:', error);
    return { 
      success: false,
      error: 'Failed to search events',
      details: error.message 
    };
  }
}

// ============================================================================
// LEGACY ENDPOINTS (keep for backwards compatibility)
// ============================================================================

// POST /api/events/import - Import events from iCal file
app.post('/api/events/import', authenticateUser, upload.single('icalFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No iCal file provided' });
    }

    console.log('Processing iCal import:', req.file.originalname, 'Size:', req.file.size, 'bytes');
    
    // Parse the iCal file
    const icalDataRaw = req.file.buffer.toString('utf8');
    console.log('Raw iCal data length:', icalDataRaw.length);
    console.log('First 500 chars:', icalDataRaw.substring(0, 500));
    
    const icalData = unfoldICSLines(icalDataRaw);
    console.log('Unfolded iCal data length:', icalData.length);
    
    let parsedEvents;
    try {
      parsedEvents = ical.parseICS(icalData);
      console.log('Parsed events object keys:', Object.keys(parsedEvents));
      console.log('Total parsed entries:', Object.keys(parsedEvents).length);
    } catch (parseError) {
      console.error('ICS parsing failed:', parseError);
      return res.status(400).json({ 
        error: 'Failed to parse iCal file', 
        details: parseError.message 
      });
    }
    
    if (!parsedEvents || Object.keys(parsedEvents).length === 0) {
      return res.status(400).json({ error: 'No valid entries found in the iCal file' });
    }

    // Debug: show what types of entries we found
    const entryTypes = {};
    Object.values(parsedEvents).forEach(entry => {
      const type = entry.type || 'unknown';
      entryTypes[type] = (entryTypes[type] || 0) + 1;
    });
    console.log('Entry types found:', entryTypes);
    
    // Convert iCal events to our format
    const eventsToImport = [];
    const currentYear = new Date().getFullYear();
    const janFirstThisYear = new Date(currentYear, 0, 1);
    console.log(`Filtering events from ${janFirstThisYear.toISOString()} onwards`);
    
    for (const [key, event] of Object.entries(parsedEvents)) {
      console.log(`Processing entry ${key}:`, {
        type: event.type,
        summary: event.summary,
        start: event.start,
        end: event.end,
        hasRrule: !!event.rrule
      });
      
      // Skip non-event entries (like VTIMEZONE)
      if (event.type !== 'VEVENT') {
        console.log(`Skipping non-VEVENT entry: ${event.type}`);
        continue;
      }
      
      try {
        // Extract event data
        const title = event.summary || 'Untitled Event';
        console.log(`Processing VEVENT: "${title}"`);
        
        const start = event.start ? new Date(event.start) : null;
        console.log(`Start date: ${event.start} -> ${start}`);
        
        // Some calendars (e.g., Google) omit DTEND for all-day or point events.
        // If end is missing or invalid, default to one hour after start (or same day for all-day)
        let end = event.end ? new Date(event.end) : null;
        console.log(`End date: ${event.end} -> ${end}`);
        
        if (!end || isNaN(end.getTime())) {
          end = new Date(start.getTime() + 60 * 60 * 1000); // +1h fallback
          console.log(`Applied 1-hour fallback end: ${end}`);
        }
        
        // Validate start date
        if (!start || isNaN(start.getTime())) {
          console.warn(`Skipping event with invalid start date: ${title} (start: ${event.start})`);
          continue;
        }
        
        // Ensure end is after start; if not, extend by one hour
        if (start >= end) {
          end = new Date(start.getTime() + 60 * 60 * 1000);
          console.log(`Adjusted end to be after start: ${end}`);
        }
        
        // Normalize the event for processing
        const normalizedEvent = {
          ...event,
          start,
          end,
          summary: title
        };
        
        // Handle recurring events - expand into individual instances
        const expandedEvents = expandRecurringEvent(normalizedEvent);
        
        for (const expandedEvent of expandedEvents) {
          // Skip events before current year to avoid importing thousands of old events
          if (expandedEvent.start < janFirstThisYear) {
            console.log(`Skipping old event: ${expandedEvent.title || expandedEvent.summary} (${expandedEvent.start.toISOString()})`);
            continue;
          }
          
          const eventToImport = {
            title: expandedEvent.title || expandedEvent.summary,
            start: expandedEvent.start,
            end: expandedEvent.end,
            color: '#4A7C2A' // Use dark green color for imported events
          };
          
          console.log(`Successfully processed event:`, eventToImport);
          eventsToImport.push(eventToImport);
        }
        
      } catch (eventError) {
        console.error(`Error processing event ${key}:`, eventError);
        console.error(`Event data:`, event);
      }
    }
    
    if (eventsToImport.length === 0) {
      return res.status(400).json({ 
        error: 'No valid events could be extracted from the iCal file' 
      });
    }
    
    console.log(`Importing ${eventsToImport.length} events...`);
    
    // Import events to database
    const result = await importEvents(eventsToImport, req.userId, req.supabase);
    
    console.log('Import completed:', result);
    
    res.json({
      message: `Successfully imported ${result.successful} out of ${result.total} events`,
      imported: result.successful,
      total: result.total,
      failed: result.failed,
      errors: result.errors,
      events: result.imported
    });
    
  } catch (error) {
    console.error('Error importing iCal file:', error);
    
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 5MB.' });
    }
    
    if (error.message.includes('Only .ics')) {
      return res.status(400).json({ error: error.message });
    }
    
    res.status(500).json({ 
      error: 'Failed to import iCal file', 
      details: error.message 
    });
  }
});

// POST /api/events/import-url - Import events from iCloud shared calendar URL
app.post('/api/events/import-url', authenticateUser, upload.none(), async (req, res) => {
  try {
    const { url, subscribe, name } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    console.log(`📡 Importing from URL: ${url}${subscribe ? ' (with subscription)' : ''}`);

    // Convert webcal:// to https:// (webcal is just https with subscription intent)
    const fetchUrl = url.replace(/^webcal:\/\//, 'https://');
    console.log(`🔄 Converted URL for fetch: ${fetchUrl}`);

    // Fetch iCal data
    const response = await fetch(fetchUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch calendar: ${response.status} ${response.statusText}`);
    }

    const icalDataRaw = await response.text();
    const icalData = unfoldICSLines(icalDataRaw);
    const parsedEvents = ical.parseICS(icalData);

    const currentYear = new Date().getFullYear();
    const janFirstThisYear = new Date(currentYear, 0, 1);
    console.log(`Filtering URL events from ${janFirstThisYear.toISOString()} onwards`);
    
    const eventsData = [];
    
    for (const event of Object.values(parsedEvents)) {
      if (event.type !== 'VEVENT') continue;
      
      const start = new Date(event.start);
      let end = event.end ? new Date(event.end) : null;
      if (!end || isNaN(end.getTime())) {
        end = new Date(start.getTime() + 60 * 60 * 1000);
      }
      if (start >= end) {
        end = new Date(start.getTime() + 60 * 60 * 1000);
      }
      
      // Normalize the event for processing
      const normalizedEvent = {
        ...event,
        start,
        end,
        summary: event.summary || 'Untitled Event'
      };
      
      // Handle recurring events - expand into individual instances
      const expandedEvents = expandRecurringEvent(normalizedEvent);
      
      for (const expandedEvent of expandedEvents) {
        // Skip events before current year
        if (expandedEvent.start < janFirstThisYear) continue;
        
        eventsData.push({
          title: expandedEvent.title || expandedEvent.summary,
          start: expandedEvent.start,
          end: expandedEvent.end,
          color: '#4A7C2A', // Default lighter green for URL imports
          uid: expandedEvent.uid || event.uid
        });
      }
    }

    let result;
    let subscriptionId = null;

    if (subscribe && name) {
      // Create subscription and import events
      try {
        const subscription = await addCalendarSubscription({ 
          name: name.trim(), 
          url, 
          color: '#4A7C2A' 
        }, req.userId, req.supabase);
        subscriptionId = subscription.id;
        
        result = await importEventsFromSubscription(subscriptionId, eventsData, req.userId, req.supabase);
        await updateCalendarSync(subscriptionId, new Date(), req.userId, req.supabase);
        
        console.log(`📅 Subscription created: ${name} (${result.successful}/${result.total} events)`);
        res.json({
          ...result,
          subscription: subscription,
          message: `Subscribed to calendar "${name}" and imported ${result.successful} events`
        });
      } catch (subscriptionError) {
        if (subscriptionError.message.includes('already subscribed')) {
          // URL already subscribed, just sync it
          const subscriptions = await getCalendarSubscriptions(req.userId, req.supabase);
          const existingSubscription = subscriptions.find(sub => sub.url === url);
          
          if (existingSubscription) {
            result = await importEventsFromSubscription(existingSubscription.id, eventsData, req.userId, req.supabase);
            await updateCalendarSync(existingSubscription.id, new Date(), req.userId, req.supabase);
            
            res.json({
              ...result,
              subscription: existingSubscription,
              message: `Synced existing subscription "${existingSubscription.name}" - ${result.successful} events updated`
            });
          } else {
            throw subscriptionError;
          }
        } else {
          throw subscriptionError;
        }
      }
    } else {
      // One-time import (original behavior)
      result = await importEvents(eventsData, req.userId, req.supabase);
      console.log(`📊 One-time import: ${result.successful}/${result.total} events imported`);
      res.json({
        ...result,
        message: `Imported ${result.successful} events from calendar URL`
      });
    }

  } catch (error) {
    console.error('❌ URL import error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to import calendar from URL',
      details: error.toString()
    });
  }
});

// Get all calendar subscriptions
app.get('/api/calendar-subscriptions', authenticateUser, async (req, res) => {
  try {
    const subscriptions = await getCalendarSubscriptions(req.userId, req.supabase);
    res.json(subscriptions);
  } catch (error) {
    console.error('❌ Error fetching subscriptions:', error);
    res.status(500).json({ error: 'Failed to fetch calendar subscriptions' });
  }
});

// Delete calendar subscription
app.delete('/api/calendar-subscriptions/:id', authenticateUser, async (req, res) => {
  try {
    const subscriptionId = parseInt(req.params.id);
    await deleteCalendarSubscription(subscriptionId, req.userId, req.supabase);
    res.json({ success: true, message: 'Calendar subscription deleted' });
  } catch (error) {
    console.error('❌ Error deleting subscription:', error);
    res.status(500).json({ error: 'Failed to delete calendar subscription' });
  }
});

// Sync specific calendar subscription
app.post('/api/calendar-subscriptions/:id/sync', authenticateUser, async (req, res) => {
  try {
    const subscriptionId = parseInt(req.params.id);
    const subscriptions = await getCalendarSubscriptions(req.userId, req.supabase);
    const subscription = subscriptions.find(sub => sub.id === subscriptionId);
    
    if (!subscription) {
      return res.status(404).json({ error: 'Calendar subscription not found' });
    }

    console.log(`🔄 Syncing calendar: ${subscription.name}`);

    // Convert webcal:// to https:// for fetching
    const fetchUrl = subscription.url.replace(/^webcal:\/\//, 'https://');

    // Fetch latest iCal data
    const response = await fetch(fetchUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch calendar: ${response.status} ${response.statusText}`);
    }

    const icalDataRaw = await response.text();
    const icalData = unfoldICSLines(icalDataRaw);
    const parsedEvents = ical.parseICS(icalData);

    const currentYear = new Date().getFullYear();
    const janFirstThisYear = new Date(currentYear, 0, 1);
    
    const eventsData = [];
    
    for (const event of Object.values(parsedEvents)) {
      if (event.type !== 'VEVENT') continue;
      
      const start = new Date(event.start);
      let end = event.end ? new Date(event.end) : null;
      if (!end || isNaN(end.getTime())) {
        end = new Date(start.getTime() + 60 * 60 * 1000);
      }
      if (start >= end) {
        end = new Date(start.getTime() + 60 * 60 * 1000);
      }
      
      // Normalize the event for processing
      const normalizedEvent = {
        ...event,
        start,
        end,
        summary: event.summary || 'Untitled Event'
      };
      
      // Handle recurring events - expand into individual instances
      const expandedEvents = expandRecurringEvent(normalizedEvent);
      
      for (const expandedEvent of expandedEvents) {
        // Skip events before current year
        if (expandedEvent.start < janFirstThisYear) continue;
        
        eventsData.push({
          title: expandedEvent.title || expandedEvent.summary,
          start: expandedEvent.start,
          end: expandedEvent.end,
          color: subscription.color,
          uid: expandedEvent.uid || event.uid
        });
      }
    }

    const result = await importEventsFromSubscription(subscriptionId, eventsData, req.userId, req.supabase);
    await updateCalendarSync(subscriptionId);
    
    console.log(`✅ Sync complete: ${subscription.name} (${result.successful}/${result.total} events)`);
    res.json({
      ...result,
      subscription: subscription,
      message: `Synced calendar "${subscription.name}" - ${result.successful} events updated`
    });

  } catch (error) {
    console.error('❌ Sync error:', error);
    res.status(500).json({ error: 'Failed to sync calendar subscription' });
  }
});

// Sync all calendar subscriptions  
app.post('/api/calendar-subscriptions/sync-all', authenticateUser, async (req, res) => {
  try {
    const subscriptions = await getCalendarSubscriptions(req.userId, req.supabase);
    const results = [];

    for (const subscription of subscriptions) {
      if (!subscription.sync_enabled) continue;

      try {
        console.log(`🔄 Auto-syncing: ${subscription.name}`);
        
        // Convert webcal:// to https:// for fetching
        const fetchUrl = subscription.url.replace(/^webcal:\/\//, 'https://');
        
        const response = await fetch(fetchUrl);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const icalDataRaw = await response.text();
        const icalData = unfoldICSLines(icalDataRaw);
        const parsedEvents = ical.parseICS(icalData);

        const currentYear = new Date().getFullYear();
        const janFirstThisYear = new Date(currentYear, 0, 1);
        
        const eventsData = [];
        
        for (const event of Object.values(parsedEvents)) {
          if (event.type !== 'VEVENT') continue;
          
          const start = new Date(event.start);
          let end = event.end ? new Date(event.end) : null;
          if (!end || isNaN(end.getTime())) {
            end = new Date(start.getTime() + 60 * 60 * 1000);
          }
          if (start >= end) {
            end = new Date(start.getTime() + 60 * 60 * 1000);
          }
          
          // Normalize the event for processing
          const normalizedEvent = {
            ...event,
            start,
            end,
            summary: event.summary || 'Untitled Event'
          };
          
          // Handle recurring events - expand into individual instances
          const expandedEvents = expandRecurringEvent(normalizedEvent);
          
          for (const expandedEvent of expandedEvents) {
            // Skip events before current year
            if (expandedEvent.start < janFirstThisYear) continue;
            
            eventsData.push({
              title: expandedEvent.title || expandedEvent.summary,
              start: expandedEvent.start,
              end: expandedEvent.end,
              color: subscription.color,
              uid: expandedEvent.uid || event.uid
            });
          }
        }

        const result = await importEventsFromSubscription(subscription.id, eventsData, req.userId, req.supabase);
        await updateCalendarSync(subscription.id);
        
        results.push({
          subscription: subscription.name,
          success: true,
          events: result.successful,
          total: result.total
        });

      } catch (syncError) {
        console.error(`❌ Sync failed for ${subscription.name}:`, syncError.message);
        results.push({
          subscription: subscription.name,
          success: false,
          error: syncError.message
        });
      }
    }

    const successful = results.filter(r => r.success).length;
    const totalEvents = results.reduce((sum, r) => sum + (r.events || 0), 0);

    res.json({
      results,
      summary: {
        successful,
        failed: results.length - successful,
        totalEvents,
        message: `Synced ${successful}/${results.length} calendars (${totalEvents} events)`
      }
    });

  } catch (error) {
    console.error('❌ Bulk sync error:', error);
    res.status(500).json({ error: 'Failed to sync calendar subscriptions' });
  }
});

// Start automatic sync interval (every 30 minutes)
let syncInterval;
const startAutoSync = () => {
  if (syncInterval) clearInterval(syncInterval);
  
  // TEMPORARILY DISABLED: Auto-sync was causing cross-user calendar contamination
  // Need to fix user context issues before re-enabling
  console.log('⚠️ Auto-sync temporarily disabled to prevent calendar leakage');
  return;
  
  syncInterval = setInterval(async () => {
    try {
      console.log('🔄 Auto-sync starting...');
      
      // Fetch all subscriptions from all users
      const allSubscriptions = await getCalendarSubscriptions();
      
      // Group subscriptions by user to process them securely
      const subscriptionsByUser = allSubscriptions.reduce((acc, sub) => {
        if (!sub.user_id) return acc;
        if (!acc[sub.user_id]) acc[sub.user_id] = [];
        acc[sub.user_id].push(sub);
        return acc;
      }, {});

      console.log(`Found subscriptions for ${Object.keys(subscriptionsByUser).length} users.`);

      // Process each user's subscriptions independently
      for (const userId in subscriptionsByUser) {
        const userSubscriptions = subscriptionsByUser[userId];
        console.log(`Processing ${userSubscriptions.length} subscriptions for user ${userId}...`);

        for (const subscription of userSubscriptions) {
          if (!subscription.sync_enabled) continue;
          
          try {
            console.log(`🔄 Auto-syncing: ${subscription.name} for user ${userId}`);
            
            // Convert webcal:// to https:// for fetching
            const fetchUrl = subscription.url ? subscription.url.replace(/^webcal:\/\//, 'https://') : null;
            
            if (!fetchUrl) {
              console.log(`⚠️ Skipping subscription with invalid URL: ${subscription.name}`);
              continue;
            }
            
            const response = await fetch(fetchUrl, { 
              timeout: 10000,
              signal: AbortSignal.timeout(10000) 
            });
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const icalDataRaw = await response.text();
            const icalData = unfoldICSLines(icalDataRaw);
            const parsedEvents = ical.parseICS(icalData);
            
            const currentYear = new Date().getFullYear();
            const janFirstThisYear = new Date(currentYear, 0, 1);
            
            const eventsData = [];
            
            for (const event of Object.values(parsedEvents)) {
              if (event.type !== 'VEVENT') continue;
              
              const start = new Date(event.start);
              let end = event.end ? new Date(event.end) : null;
              if (!end || isNaN(end.getTime())) end = new Date(start.getTime() + 60 * 60 * 1000);
              if (start >= end) end = new Date(start.getTime() + 60 * 60 * 1000);
              
              const normalizedEvent = { ...event, start, end, summary: event.summary || 'Untitled Event' };
              const expandedEvents = expandRecurringEvent(normalizedEvent);
              
              for (const expandedEvent of expandedEvents) {
                if (expandedEvent.start < janFirstThisYear) continue;
                
                eventsData.push({
                  title: expandedEvent.title || expandedEvent.summary,
                  start: expandedEvent.start,
                  end: expandedEvent.end,
                  color: subscription.color,
                  uid: expandedEvent.uid || event.uid
                });
              }
            }
            
            // CORRECTLY pass the userId for this user's subscription batch
            const result = await importEventsFromSubscription(subscription.id, eventsData, userId, null);
            await updateCalendarSync(subscription.id);
            
            console.log(`✅ Sync complete for ${subscription.name}: ${result.successful}/${result.total} events`);
            
          } catch (syncError) {
            console.error(`⚠️ Sync failed for ${subscription.name} (User: ${userId}):`, syncError.message);
          }
        }
      }
      
      console.log(`✅ Auto-sync cycle complete.`);
      
    } catch (error) {
      console.error('❌ Auto-sync master error:', error.message);
    }
  }, 30 * 60 * 1000); // 30 minutes
  
  console.log('🕐 Auto-sync enabled (every 30 minutes)');
};

// Start auto-sync after server initialization
setTimeout(() => {
  startAutoSync();
}, 5000); // Wait 5 seconds after server start

// POST /api/events/:id/invite - Send calendar invitation via email
app.post('/api/events/:id/invite', async (req, res) => {
  try {
    const { id } = req.params;
    const { emails, message } = req.body;
    
    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ error: 'At least one email address is required' });
    }
    
    // Validate email addresses
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmails = emails.filter(email => !emailRegex.test(email));
    if (invalidEmails.length > 0) {
      return res.status(400).json({ 
        error: `Invalid email addresses: ${invalidEmails.join(', ')}` 
      });
    }
    
    // Get the event from database
    const allEvents = await getAllEvents(req.userId, req.supabase);
    const event = allEvents.find(e => e.id === parseInt(id));
    
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }
    
    console.log(`Sending calendar invite for event "${event.title}" to:`, emails);
    
    // Check if email is configured
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      return res.status(500).json({ 
        error: 'Email service not configured. Please set EMAIL_USER and EMAIL_PASS environment variables.' 
      });
    }
    
    // Generate iCal content
    const icalContent = generateICalInvite(event, process.env.EMAIL_USER);
    
    // Create email transporter
    const transporter = createEmailTransporter();
    
    // Send invitations
    const results = [];
    
    for (const email of emails) {
      try {
        const mailOptions = {
          from: `"Tilly Calendar" <${process.env.EMAIL_USER}>`,
          to: email,
          subject: `Calendar Invite: ${event.title}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #3b82f6;">📅 You're Invited!</h2>
              
              <div style="background: #f8fafc; border-radius: 8px; padding: 20px; margin: 20px 0;">
                <h3 style="margin-top: 0; color: #1f2937;">${event.title}</h3>
                <p style="margin: 8px 0; color: #6b7280;">
                  📅 <strong>Date:</strong> ${new Date(event.start).toLocaleDateString()}
                </p>
                <p style="margin: 8px 0; color: #6b7280;">
                  🕐 <strong>Time:</strong> ${new Date(event.start).toLocaleTimeString()} - ${new Date(event.end).toLocaleTimeString()}
                </p>
                ${message ? `<p style="margin: 8px 0; color: #6b7280;"><strong>Message:</strong> ${message}</p>` : ''}
              </div>
              
              <p style="color: #6b7280;">
                This calendar invitation has been attached to this email. Your calendar app should automatically detect it and offer to add the event to your calendar.
              </p>
              
              <p style="color: #9ca3af; font-size: 12px; margin-top: 20px;">
                Sent via Tilly Calendar
              </p>
            </div>
          `,
          attachments: [
            {
              filename: `${event.title.replace(/[^\w\s]/gi, '')}.ics`,
              content: icalContent,
              contentType: 'text/calendar'
            }
          ],
          icalEvent: {
            content: icalContent,
            method: 'REQUEST'
          }
        };
        
        await transporter.sendMail(mailOptions);
        results.push({ email, status: 'sent' });
        console.log(`✅ Calendar invite sent to ${email}`);
        
      } catch (emailError) {
        console.error(`❌ Failed to send invite to ${email}:`, emailError);
        results.push({ 
          email, 
          status: 'failed', 
          error: emailError.message 
        });
      }
    }
    
    const successful = results.filter(r => r.status === 'sent').length;
    const failed = results.filter(r => r.status === 'failed').length;
    
    res.json({
      message: `Calendar invitations sent: ${successful} successful, ${failed} failed`,
      results,
      successful,
      failed,
      event: {
        id: event.id,
        title: event.title,
        start: event.start,
        end: event.end
      }
    });
    
  } catch (error) {
    console.error('Error sending calendar invitations:', error);
    res.status(500).json({ 
      error: 'Failed to send calendar invitations', 
      details: error.message 
    });
  }
});
  
  // AI Calendar Query endpoint
app.post('/api/calendar/query', authenticateUser, async (req, res) => {
  try {
    const { query, chatHistory = [], userTimeZone } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }
    
    // Get events for today + next 7 days (limited context to avoid rate limiting)
    const currentTime = new Date();
    const today = new Date(currentTime.getFullYear(), currentTime.getMonth(), currentTime.getDate());
    const next7Days = new Date(today.getTime() + (7 * 24 * 60 * 60 * 1000));
    const dayAfterTomorrow = new Date(today.getTime() + (2 * 24 * 60 * 60 * 1000));
    
    const recentEvents = await getEventsByDateRange(today, next7Days, req.userId, req.supabase);
    const todayEvents = await getEventsForPeriod('today', req.userId, req.supabase);
    const tomorrowEvents = await getEventsForPeriod('tomorrow', req.userId, req.supabase);
    
    // Get upcoming events (day after tomorrow onwards) to avoid duplicates with today/tomorrow
    const upcomingEventsRange = await getEventsByDateRange(dayAfterTomorrow, next7Days, req.userId, req.supabase);
    const upcomingEvents = upcomingEventsRange.slice(0, 10); // Limit to 10 to keep context manageable
    
    const stats = await getCalendarStats('this_week', req.userId, req.supabase);
    
    // Create calendar context for Claude
    const now = currentTime;
    const actualTimezone = userTimeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const calendarContext = {
      currentTime: now.toISOString(),
      currentDate: now.toLocaleDateString(),
      currentDay: now.toLocaleDateString('en-US', { weekday: 'long' }),
      currentLocalTime: now.toLocaleString(),
      timezone: actualTimezone,
      totalEvents: recentEvents.length,
      upcomingEvents: upcomingEvents.slice(0, 10),
      todayEvents,
      tomorrowEvents,
      recentEvents: recentEvents, // Events for today + next 7 days
      weeklyStats: stats,
      query,
      chatHistory
    };
    
    // Use Claude API for intelligent calendar assistance
    const requestBody = {
      model: 'claude-3-5-haiku-20240307',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: createCalendarPrompt(query, calendarContext)
      }]
    };

    console.log('🔍 DEBUG: Events being sent to Claude:');
    console.log('📅 Today events:', todayEvents.length, todayEvents.map(e => `${e.title} (${e.start} to ${e.end})`));
    console.log('📅 Tomorrow events:', tomorrowEvents.length, tomorrowEvents.map(e => `${e.title} (${e.start} to ${e.end})`));
    console.log('📅 Upcoming events (day after tomorrow+):', upcomingEvents.length, upcomingEvents.map(e => `${e.title} (${e.start} to ${e.end})`));
    console.log('🔍 DEBUG: Total events in 7-day range:', recentEvents.length);
    console.log('🔍 DEBUG: API Key present:', !!process.env.ANTHROPIC_API_KEY);
    console.log('🔍 DEBUG: API Key length:', process.env.ANTHROPIC_API_KEY ? process.env.ANTHROPIC_API_KEY.length : 0);

    // Retry logic for handling API overload
    const makeClaudeRequest = async (retryCount = 0, maxRetries = 3) => {
      const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff: 1s, 2s, 4s
      
      if (retryCount > 0) {
        console.log(`🔄 Retrying Claude API request (attempt ${retryCount + 1}/${maxRetries + 1}) after ${delay}ms delay...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(requestBody),
        timeout: 30000 // 30 second timeout
      });

      console.log('🔍 DEBUG: Claude API response status:', response.status);
      console.log('🔍 DEBUG: Claude API response headers:', Object.fromEntries(response.headers.entries()));

      // Handle overload errors with retry
      if (response.status === 529 && retryCount < maxRetries) {
        const errorText = await response.text();
        console.log(`⚠️ Claude API overloaded (529), retrying... Response: ${errorText}`);
        return makeClaudeRequest(retryCount + 1, maxRetries);
      }

      return response;
    };

    const response = await makeClaudeRequest();

    if (!response.ok) {
      const errorText = await response.text();
      console.error('🚨 Claude API Error Response:', errorText);
      
      // If Claude API is overloaded after all retries, provide a graceful fallback
      if (response.status === 529) {
        console.log('📋 Providing fallback response due to Claude API overload');
        const fallbackResponse = createFallbackResponse(query, calendarContext);
        res.json({ response: fallbackResponse, context: calendarContext });
        return;
      }
      
      throw new Error(`Claude API request failed: ${response.status} ${response.statusText}`);
    }

    const claudeData = await response.json();
    const claudeResponse = claudeData.content[0].text;
    
    // Try to extract JSON from the response (could be mixed with text)
    const jsonMatch = claudeResponse.match(/\{[\s\S]*"type":\s*"(event_suggestion|event_rearrangement|multiple_actions)"[\s\S]*\}/);
    
    if (jsonMatch) {
      try {
        const actionData = JSON.parse(jsonMatch[0]);
        if (actionData.type === 'event_suggestion' || actionData.type === 'event_rearrangement' || actionData.type === 'multiple_actions') {
          // Validate the action data before sending to frontend
          const validationResult = validateActionData(actionData, calendarContext);
          if (!validationResult.valid) {
            console.error('🚨 Claude response validation failed:', validationResult.error);
            console.error('🚨 Original Claude response:', claudeResponse);
            // Send error response back to user explaining the issue
            res.status(400).json({ 
              error: 'Invalid calendar response detected',
              details: validationResult.error,
              suggestion: 'Please try rephrasing your request or ask for a different time slot.'
            });
            return;
          } else {
            // Extract the text part (everything before the JSON)
            const textPart = claudeResponse.replace(jsonMatch[0], '').trim();
            
            // Return both the conversational text and the structured action data
            res.json({ 
              response: {
                type: actionData.type,
                message: textPart || actionData.message,
                eventData: actionData.eventData,
                rearrangements: actionData.rearrangements || null,
                actions: actionData.actions || null
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

// Check for event conflicts
function checkEventConflicts(startDate, endDate, existingEvents) {
  const conflicts = [];
  
  for (const event of existingEvents) {
    const eventStart = new Date(event.start);
    const eventEnd = new Date(event.end);
    
    // Check if times overlap
    if (startDate < eventEnd && endDate > eventStart) {
      conflicts.push(event);
    }
  }
  
  return conflicts;
}

// Validate Claude's action data to prevent time parsing issues
function validateActionData(actionData, context = null) {
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
      
      // Check for common PM/AM mistakes (e.g., 01:00 when user meant 13:00)
      const startHour = startDate.getHours();
      const endHour = endDate.getHours();
      if (startHour < 6 && endHour > 12) {
        return { valid: false, error: `Suspicious time range detected: ${start} to ${end}. This looks like a PM/AM conversion error. Check your time format: 1pm = 13:00, 2pm = 14:00, 3pm = 15:00, etc.` };
      }
      
      // Check for unrealistic early morning times (1am-5am) which are often mistakes
      if (startHour >= 1 && startHour <= 5) {
        console.warn(`⚠️ Very early morning time detected: ${start}. Verify this is intentional.`);
      }
      
      // Server-side conflict detection for event suggestions
      console.log(`🔍 Checking for conflicts: ${start} to ${end}`);
      console.log(`🔍 Available events for conflict check:`, context?.recentEvents?.length || 0);
      if (context && context.recentEvents) {
        console.log(`🔍 Events being checked:`, context.recentEvents.map(e => `${e.title} (${e.start} to ${e.end})`));
        const conflicts = checkEventConflicts(startDate, endDate, context.recentEvents);
        console.log(`🔍 Found ${conflicts.length} conflicts:`, conflicts.map(e => e.title));
        if (conflicts.length > 0) {
          const conflictList = conflicts.map(e => `"${e.title}" (${new Date(e.start).toLocaleString()} to ${new Date(e.end).toLocaleString()})`).join(', ');
          return { valid: false, error: `Event conflict detected! The proposed time ${start} to ${end} conflicts with existing events: ${conflictList}. Claude should have suggested a multiple_actions solution to resolve this conflict.` };
        }
      } else {
        console.log(`⚠️ No context or recentEvents available for conflict detection`);
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
          return { valid: false, error: `Invalid newEnd in rearrangement ${i}. Do not provide JSON without specific new times.` };
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
        
        // Check for common PM/AM mistakes in rearrangements
        const rearrangeStartHour = startDate.getHours();
        const rearrangeEndHour = endDate.getHours();
        if (rearrangeStartHour < 6 && rearrangeEndHour > 12) {
          return { valid: false, error: `Suspicious time range in rearrangement ${i}: ${rearrangement.newStart} to ${rearrangement.newEnd}. This looks like a PM/AM conversion error. Check your time format: 1pm = 13:00, 2pm = 14:00, 3pm = 15:00, etc.` };
        }
        
        // Warn about unrealistic early morning times in rearrangements
        if (rearrangeStartHour >= 1 && rearrangeStartHour <= 5) {
          console.warn(`⚠️ Very early morning time in rearrangement ${i}: ${rearrangement.newStart}. Verify this is intentional.`);
        }
      }
      
      console.log('✅ Event rearrangement validation passed');
      return { valid: true };
    }
    
    if (actionData.type === 'multiple_actions') {
      if (!actionData.actions || !Array.isArray(actionData.actions)) {
        return { valid: false, error: 'Missing or invalid actions array for multiple_actions' };
      }
      
      if (actionData.actions.length === 0) {
        return { valid: false, error: 'actions array cannot be empty for multiple_actions' };
      }
      
      // Validate each individual action
      for (let i = 0; i < actionData.actions.length; i++) {
        const action = actionData.actions[i];
        const subValidation = validateActionData(action);
        if (!subValidation.valid) {
          return { valid: false, error: `Action ${i + 1} validation failed: ${subValidation.error}` };
        }
      }
      
      console.log('✅ Multiple actions validation passed');
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
  const timestamp = utcToLocal(msg.timestamp, '24h', context.timezone);
  return `[${timestamp}] ${msg.sender === 'user' ? 'User' : 'Tilly'}: ${msg.text}`;
}).join('\n')}
` 
    : '';

  return `You are Tilly, an intelligent calendar assistant. You have full access to the user's calendar and can help with scheduling, availability, and calendar management.

CURRENT CONTEXT:
- Current local time: ${context.currentLocalTime}
- Timezone: ${context.timezone}
- Current date: ${context.currentDate} (${context.currentDay})
- Total events in next 7 days: ${context.totalEvents}${chatHistorySection}

TODAY'S EVENTS (${context.todayEvents.length}):
${context.todayEvents.map(e => {
  const startTime = utcToLocal(e.start, '24h', context.timezone);
  const endTime = utcToLocal(e.end, '24h', context.timezone);
  return `- [ID:${e.id}] ${e.title} from ${startTime} to ${endTime}`;
}).join('\n') || '- No events today'}

TOMORROW'S EVENTS (${context.tomorrowEvents.length}):
${context.tomorrowEvents.map(e => {
  const startTime = utcToLocal(e.start, '24h', context.timezone);
  const endTime = utcToLocal(e.end, '24h', context.timezone);
  return `- [ID:${e.id}] ${e.title} from ${startTime} to ${endTime}`;
}).join('\n') || '- No events tomorrow'}

UPCOMING EVENTS (${context.upcomingEvents.length}):
${context.upcomingEvents.map(e => {
  const date = new Date(e.start).toLocaleDateString();
  const startTime = utcToLocal(e.start, '24h', context.timezone);
  const endTime = utcToLocal(e.end, '24h', context.timezone);
  return `- [ID:${e.id}] ${e.title} on ${date} from ${startTime} to ${endTime}`;
}).join('\n') || '- No upcoming events'}

WEEKLY STATS:
- Total events this week: ${context.weeklyStats.totalEvents}
- Total hours: ${context.weeklyStats.totalHours.toFixed(1)}
- Busiest day: ${context.weeklyStats.busiestDay || 'None'}

USER QUERY: "${query}"

INSTRUCTIONS:
1. Use the chat history above to maintain context and provide coherent follow-up responses. Reference previous conversations when relevant.

2. For event scheduling requests, be CONCISE and helpful. 

MANDATORY CONFLICT CHECK PROCESS (do this mentally, don't write it out):
- STEP 1: Identify your proposed event's start and end times
- STEP 2: Check if times overlap with existing events using: (your_start < their_end) AND (your_end > their_start)
- STEP 3: If ANY conflict found, use "multiple_actions" to rearrange. If no conflicts, use "event_suggestion"

Keep responses SHORT - don't repeat information the user can already see. Then end with a JSON object:

Example for scheduling WITHOUT conflict:
"Perfect! I can schedule your meeting tomorrow at 6pm - no conflicts.

{
  "type": "event_suggestion",
  "message": "Add meeting to calendar?",
  "eventData": {
    "title": "Team Meeting",
    "start": "2025-05-27T18:00:00",
    "end": "2025-05-27T19:00:00"
  }
}"

Example for scheduling WITH conflict:
"Conflict detected - I'll move Vector Embeddings to 1pm-4pm and add Collect Tilly at the requested time.

{
  \"type\": \"multiple_actions\",
  \"message\": \"Rearrange schedule?\",
  \"actions\": [
    {
      \"type\": \"event_rearrangement\",
      \"rearrangements\": [
                 {
           \"eventId\": 405,
           \"currentTitle\": \"Implement Vector Embeddings Approach\",
           \"newStart\": \"2025-06-08T13:00:00\",
           \"newEnd\": \"2025-06-08T16:00:00\"
         }
      ]
    },
    {
      \"type\": \"event_suggestion\",
      \"eventData\": {
        \"title\": \"Collect Tilly\",
        \"start\": \"2025-06-08T09:30:00\",
        \"end\": \"2025-06-08T12:00:00\"
      }
    }
  ]
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



Example for multiple actions (reschedule + add new event):
"I'll reschedule your Vector Embeddings event to 1pm-4pm and add Collect Tilly at 9:30am-12pm.

{
  "type": "multiple_actions",
  "message": "Would you like me to reschedule the existing event and add the new one?",
  "actions": [
    {
      "type": "event_rearrangement",
      "rearrangements": [
        {
          "eventId": 405,
          "currentTitle": "Implement Vector Embeddings Approach",
          "newStart": "2025-06-08T13:00:00",
          "newEnd": "2025-06-08T16:00:00"
        }
      ]
    },
    {
      "type": "event_suggestion",
      "eventData": {
        "title": "Collect Tilly",
        "start": "2025-06-08T09:30:00",
        "end": "2025-06-08T12:00:00"
      }
    }
  ]
}"

4. For all other queries (availability, upcoming events, summaries, etc.), respond with BRIEF conversational text only. 

CRITICAL: DO NOT include any JSON whatsoever for informational queries. Only text responses for availability, summaries, and general questions.

5. IMPORTANT: A scheduling conflict only occurs when the proposed time OVERLAPS with an existing event. Multiple events on the same day are perfectly fine if they don't overlap in time.

CRITICAL CONFLICT CHECK: Before suggesting any event, you MUST check:
- Look at the exact start and end times of ALL existing events
- Check if your proposed time overlaps with ANY existing event
- An event conflicts if: (new_start < existing_end) AND (new_end > existing_start)
- Example: If Vector Embeddings is 2:00 PM to 5:00 PM, then 2:15 PM to 2:45 PM CONFLICTS (overlaps)
- Example: If Walk Dogs is 1:00 PM to 2:00 PM, then 2:00 PM to 3:00 PM is OK (no overlap)
- CRITICAL: Always consider BOTH start AND end times - don't just look at start times!
- STEP-BY-STEP CONFLICT CHECK:
  1. Write down your proposed start and end times
  2. List ALL existing events with their FULL time ranges (start to end)
  3. For each existing event, check: Does your time overlap with theirs?
  4. If ANY overlap exists, use "multiple_actions" to rearrange the schedule

CONFLICT DETECTION: When there's a time overlap, you MUST:
- Clearly explain the specific overlap (which times conflict)
- Automatically suggest a complete rearranged schedule using "multiple_actions" format
- Provide a concrete solution that accommodates both the existing event and the new request
- If user rejects the solution, offer a different complete rearrangement

SOLUTION APPROACH: Always provide complete solutions, not questions:
- Move the conflicting event to a logical alternative time
- Include the new event at the requested time
- Present as one unified schedule change using "multiple_actions"
- Make the solution smart by considering time gaps, logical flow, and user preferences

6. For event scheduling:
   - Parse natural language to extract event title, date, and time
   - Check for ACTUAL time conflicts (overlapping periods), not just same-day events
   - If there's a conflict: explain the overlap clearly and automatically suggest a complete solution using "multiple_actions" format
   - BEFORE suggesting any time, manually check if it overlaps with existing events by comparing start/end times
   - If no conflict: suggest the requested time using "event_suggestion" format
   - Default to 1 hour duration if not specified
   - IMPORTANT: Provide times in LOCAL format (${context.timezone}) in the JSON - the frontend will handle UTC conversion
   - Use ISO format like "2025-05-27T18:00:00" (without Z suffix) for local times
   - CRITICAL: Double-check your time arithmetic. If you calculate "11:30 AM + 3 hours = 2:30 PM", make sure your JSON shows "14:30:00" not "02:30:00"
   - CRITICAL: 1 PM = 13:00, 2 PM = 14:00, etc. NEVER use 01:00 for 1 PM - that's 1 AM!
   - EXAMPLES: 1pm-4pm = "13:00:00" to "16:00:00", 9am-12pm = "09:00:00" to "12:00:00"
   - TIME CONVERSION CHART:
     12am = 00:00, 1am = 01:00, 2am = 02:00... 11am = 11:00
     12pm = 12:00, 1pm = 13:00, 2pm = 14:00, 3pm = 15:00, 4pm = 16:00, 5pm = 17:00... 11pm = 23:00
   - ALWAYS double-check: if you say "3pm" in your text, JSON must show "15:00:00" NOT "03:00:00"
   - NEVER create custom JSON types - only use "event_suggestion" or "event_rearrangement"
   - CRITICAL: When there's a conflict, always provide a complete "multiple_actions" solution

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
   - CRITICAL: event_rearrangement JSON MUST include newStart AND newEnd times - never provide incomplete JSON
   - If you need to ask for more details about timing, provide NO JSON until you have specific times to suggest

   - CRITICAL: When rescheduling due to conflict, use "multiple_actions" type to do both rearrangement AND add new event
   - Format: {"type": "multiple_actions", "actions": [rearrangement_action, event_suggestion_action]}

8. Be BRIEF and natural while providing accurate calendar information. Don't repeat information visible in the UI. Keep responses under 2 sentences when possible. 

CRITICAL RULE: Only provide JSON for scheduling/rearranging events. For informational queries (availability, summaries, etc.), respond with text only - ABSOLUTELY NO JSON.

Examples of when to use JSON: "schedule a meeting", "move my event", "reschedule the call"
Examples of when NOT to use JSON: "what's tomorrow like?", "show my schedule", "how busy am I?"

Always reference times in the user's local timezone (${context.timezone}). Use the chat history to provide contextual responses and remember what the user has asked about.

Response:`;
}

// Create a fallback response when Claude API is unavailable
function createFallbackResponse(query, context) {
  const now = new Date();
  const currentTime = now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
  
  // Simple keyword-based responses for common queries
  const lowerQuery = query.toLowerCase();
  
  if (lowerQuery.includes('today') || lowerQuery.includes('day')) {
    if (context.todayEvents.length === 0) {
      return `I'm currently experiencing some connectivity issues with my AI processing, but I can still help! 📅\n\nLooking at your schedule for today (${context.currentDate}), you have a completely free day with no events scheduled. Perfect for getting things done or taking some time to relax!`;
    } else {
      const eventsList = context.todayEvents.map(e => {
        const startTime = new Date(e.start).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        const endTime = new Date(e.end).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        return `• ${e.title} from ${startTime} to ${endTime}`;
      }).join('\n');
      
      return `I'm currently experiencing some connectivity issues with my AI processing, but I can still help! 📅\n\nHere's what you have scheduled for today (${context.currentDate}):\n\n${eventsList}\n\nYou currently have ${context.todayEvents.length} event${context.todayEvents.length === 1 ? '' : 's'} scheduled.`;
    }
  }
  
  if (lowerQuery.includes('tomorrow')) {
    if (context.tomorrowEvents.length === 0) {
      return `I'm currently experiencing some connectivity issues with my AI processing, but I can still help! 📅\n\nGood news! Tomorrow looks completely free with no events scheduled. It's a great opportunity to plan something new or enjoy a relaxing day.`;
    } else {
      const eventsList = context.tomorrowEvents.map(e => {
        const startTime = new Date(e.start).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        const endTime = new Date(e.end).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        return `• ${e.title} from ${startTime} to ${endTime}`;
      }).join('\n');
      
      return `I'm currently experiencing some connectivity issues with my AI processing, but I can still help! 📅\n\nHere's what you have scheduled for tomorrow:\n\n${eventsList}`;
    }
  }
  
  if (lowerQuery.includes('upcoming') || lowerQuery.includes('next') || lowerQuery.includes('coming')) {
    if (context.upcomingEvents.length === 0) {
      return `I'm currently experiencing some connectivity issues with my AI processing, but I can still help! 📅\n\nYou don't have any upcoming events scheduled. Your calendar is wide open for new opportunities!`;
    } else {
      const eventsList = context.upcomingEvents.slice(0, 5).map(e => {
        const date = new Date(e.start).toLocaleDateString();
        const startTime = new Date(e.start).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        return `• ${e.title} on ${date} at ${startTime}`;
      }).join('\n');
      
      return `I'm currently experiencing some connectivity issues with my AI processing, but I can still help! 📅\n\nHere are your upcoming events:\n\n${eventsList}\n\n${context.upcomingEvents.length > 5 ? `And ${context.upcomingEvents.length - 5} more...` : ''}`;
    }
  }
  
  if (lowerQuery.includes('week') || lowerQuery.includes('summary')) {
    return `I'm currently experiencing some connectivity issues with my AI processing, but I can still help! 📅\n\nWeekly Summary:\n• Total events: ${context.weeklyStats.totalEvents}\n• Total hours: ${context.weeklyStats.totalHours.toFixed(1)}\n• Busiest day: ${context.weeklyStats.busiestDay || 'None'}\n\nYour calendar ${context.weeklyStats.totalEvents === 0 ? 'is completely free this week!' : `has ${context.weeklyStats.totalEvents} event${context.weeklyStats.totalEvents === 1 ? '' : 's'} scheduled.`}`;
  }
  
  // Default response
  return `I'm currently experiencing some connectivity issues with my AI processing, but I can still help with basic calendar information! 📅\n\nYou have ${context.totalEvents} total events in your calendar. Try asking me about "today", "tomorrow", "upcoming events", or "this week" and I'll do my best to help while my full AI capabilities are restored.`;
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Proxy server is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down server...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down server...');
  process.exit(0);
});

// Validate required environment variables
const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.warn('⚠️  Missing environment variables:', missingEnvVars.join(', '));
  console.warn('⚠️  Some features may not work correctly without these variables');
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn('⚠️  Missing ANTHROPIC_API_KEY - AI features will not work');
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Tilly Calendar server running on port ${PORT}`);
console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`🔗 API endpoint: http://localhost:${PORT}/api/claude`);
console.log(`📅 Events API: http://localhost:${PORT}/api/events`);
console.log(`❤️  Health check: http://localhost:${PORT}/health`);

// Timezone environment debugging
console.log('\n🌍 === SERVER TIMEZONE ENVIRONMENT ===');
console.log('🌍 Node.js version:', process.version);
console.log('🌍 Process timezone (TZ):', process.env.TZ || 'not set');
console.log('🌍 NODE_ICU_DATA:', process.env.NODE_ICU_DATA || 'not set');
console.log('🌍 System locale:', Intl.DateTimeFormat().resolvedOptions().locale);
console.log('🌍 Detected system timezone:', Intl.DateTimeFormat().resolvedOptions().timeZone);

// Test ICU availability
try {
  const icuTest = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/London' });
  const testDate = new Date('2024-07-15T14:00:00Z');
  const londonTime = icuTest.format(testDate);
  console.log('🌍 ICU test PASSED - Europe/London format works:', londonTime);
} catch (icuError) {
  console.log('🌍 ICU test FAILED:', icuError.message);
}

// Test current timezone info
try {
  const tzInfo = getUserTimezoneInfo();
  console.log('🌍 Server startup timezone check completed');
} catch (tzError) {
  console.log('🌍 Server startup timezone check FAILED:', tzError.message);
}
console.log('🌍 === END SERVER TIMEZONE ENVIRONMENT ===\n');
  
  if (process.env.NODE_ENV === 'production') {
    console.log(`🌐 Serving static files from dist/`);
  }
  
  // Start auto-sync if enabled
  if (process.env.NODE_ENV === 'production') {
    startAutoSync();
  }
}); 

// Helper to unfold folded lines in ICS text per RFC 5545
function unfoldICSLines(icsText) {
  return icsText.replace(/\r?\n[ \t]/g, '');
}

// Expand recurring events into individual instances
function expandRecurringEvent(event, maxInstances = 100) {
  try {
    if (!event.rrule) {
      return [event]; // Not a recurring event, return as-is
    }

    console.log(`📅 Expanding recurring event: "${event.summary}" with RRULE: ${event.rrule}`);
    
    const startDate = new Date(event.start);
    const endDate = new Date(event.end);
    const duration = endDate.getTime() - startDate.getTime();
    
    // Parse the RRULE
    let rrule;
    try {
      // Handle different RRULE formats
      let rruleString = event.rrule.toString();
      
      // If it's already a string, use it directly
      if (typeof event.rrule === 'string') {
        rruleString = event.rrule;
      }
      
      // Ensure RRULE string starts with "RRULE:"
      if (!rruleString.startsWith('RRULE:')) {
        rruleString = 'RRULE:' + rruleString;
      }
      
      rrule = rrulestr(rruleString, { dtstart: startDate });
    } catch (rruleError) {
      console.warn(`⚠️ Failed to parse RRULE for "${event.summary}": ${rruleError.message}`);
      return [event]; // Return original event if RRULE parsing fails
    }
    
    // Set a reasonable limit for expansion (avoid infinite loops)
    const currentYear = new Date().getFullYear();
    const maxDate = new Date(currentYear + 2, 11, 31); // 2 years from now
    
    // Generate occurrences
    const occurrences = rrule.between(
      new Date(currentYear, 0, 1), // Start from current year
      maxDate,
      true, // inclusive
      (date, i) => i < maxInstances // Limit number of instances
    );
    
    console.log(`🔄 Generated ${occurrences.length} occurrences for "${event.summary}"`);
    
    // Create individual event instances
    const expandedEvents = occurrences.map((occurrenceStart, index) => {
      const occurrenceEnd = new Date(occurrenceStart.getTime() + duration);
      
      return {
        ...event,
        start: occurrenceStart,
        end: occurrenceEnd,
        // Add a suffix to distinguish recurring instances (but keep original title for most cases)
        summary: event.summary,
        title: event.summary || 'Untitled Event',
        // Keep track of the original recurring event
        originalEvent: event,
        recurrenceIndex: index,
        isRecurringInstance: true
      };
    });
    
    return expandedEvents;
    
  } catch (error) {
    console.error(`❌ Error expanding recurring event "${event.summary}":`, error);
    return [event]; // Return original event on error
  }
} 