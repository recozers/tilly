const express = require('express');
const cors = require('cors');
const ical = require('ical');
const multer = require('multer');
const nodemailer = require('nodemailer');
const path = require('path');
const { RRule, RRuleSet, rrulestr } = require('rrule');
require('dotenv').config();
const { Buffer } = require('buffer');

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
  getAllCalendarSubscriptionsForAutoSync,
  updateCalendarSync,
  deleteCalendarSubscription,
  importEventsFromSubscription,
  getUpcomingEvents,
  // Friend system functions
  getUserProfile,
  updateUserProfile,
  searchUsers,
  sendFriendRequest,
  getFriendRequests,
  acceptFriendRequest,
  declineFriendRequest,
  getFriends,
  removeFriend,
  blockUser,
  // Meeting request functions
  createMeetingRequest,
  getMeetingRequests,
  respondToMeetingRequest,
  cancelMeetingRequest,
  // Availability functions
  getAvailabilitySharing,
  updateAvailabilitySharing,
  checkUserAvailability,
  findMutualFreeTime
} = require('./supabase.js');

const app = express();
const PORT = process.env.PORT || 8080;

// Simple in-memory cache for AI responses
const responseCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 100;

// Cache cleanup function
const cleanupCache = () => {
  const now = Date.now();
  for (const [key, value] of responseCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      responseCache.delete(key);
    }
  }
  // Keep cache size under limit
  if (responseCache.size > MAX_CACHE_SIZE) {
    const entries = Array.from(responseCache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toDelete = entries.slice(0, responseCache.size - MAX_CACHE_SIZE);
    toDelete.forEach(([key]) => responseCache.delete(key));
  }
};

// Run cache cleanup every 5 minutes
setInterval(cleanupCache, 5 * 60 * 1000);

// Generate cache key from message and user context
const generateCacheKey = (message, userId, contextHash) => {
  return `${userId}:${message.toLowerCase().trim()}:${contextHash}`;
};

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

// Calendar colors - green and cream
const CALENDAR_COLORS = {
  GREEN: '#4A7C2A',
  CREAM: '#F4F1E8'
}

// Randomly select between green and cream colors
const getRandomEventColor = () => {
  const colors = [CALENDAR_COLORS.GREEN, CALENDAR_COLORS.CREAM]
  return colors[Math.floor(Math.random() * colors.length)]
}

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
    
    // Handle test tokens or bypass auth for testing
    if ((process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development') && 
        (token.includes('test-signature') || token === 'bypass-auth-for-testing')) {
      try {
        let userId;
        
        if (token === 'bypass-auth-for-testing') {
          // Simple bypass - use a default test user ID
          userId = '1c30d652-bd04-47f3-8673-3e72cc6e8867';
        } else {
          // Decode test JWT payload
          const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
          userId = payload.sub;
        }
        
        // Create mock user object for testing
        const mockUser = {
          id: userId,
          email: `${userId}@test.com`,
          role: 'authenticated'
        };
        
        // Create mock Supabase client that uses service role for testing
        const { createClient } = require('@supabase/supabase-js');
        const supabase = createClient(
          process.env.SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
        );
        
        req.user = mockUser;
        req.userId = mockUser.id;
        req.supabase = supabase;
        
        console.log(`🧪 Test auth: User ${mockUser.id} authenticated`);
        next();
        return;
      } catch (testError) {
        console.error('Test token validation failed:', testError);
        return res.status(401).json({ error: 'Invalid test token' });
      }
    }
    
    // Regular Supabase authentication for production
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

// OpenAI API proxy endpoint
app.post('/api/openai', authenticateUser, async (req, res) => {
  try {
    const { model, messages, temperature, max_tokens, response_format } = req.body;

    const requestBody = {
      model: model || 'gpt-4o-mini',
      messages: messages,
      temperature: temperature || 0.3,
      max_tokens: max_tokens || 1000
    };

    // Add response_format if specified
    if (response_format) {
      requestBody.response_format = response_format;
    }

    console.log('🤖 Making OpenAI API request...');
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', errorText);
      throw new Error(`OpenAI API request failed: ${response.status}`);
    }

    const data = await response.json();
    res.json(data);

  } catch (error) {
    console.error('Error processing OpenAI request:', error);
    res.status(500).json({ error: error.message || 'Failed to process OpenAI request' });
  }
});

// OpenAI-based calendar assistant endpoint
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
    
    // Use OpenAI API for intelligent calendar assistance
    const requestBody = {
      model: 'gpt-4o-mini',
      max_tokens: 1000,
      stream: true,
      messages: [{
        role: 'system',
        content: 'You are Tilly, a helpful calendar assistant. Respond concisely and always include the requested JSON format at the end of your response when handling scheduling requests.'
      }, {
        role: 'user',
        content: createCalendarPrompt(message, context)
      }],
      temperature: 0.3
    };

    console.log('🔍 DEBUG: Events being sent to OpenAI:');
    console.log('📅 Today events:', todayEvents.length, todayEvents.map(e => `${e.title} (${e.start} to ${e.end})`));
    console.log('📅 Tomorrow events:', tomorrowEvents.length, tomorrowEvents.map(e => `${e.title} (${e.start} to ${e.end})`));
    console.log('📅 Upcoming events (day after tomorrow+):', upcomingEvents.length, upcomingEvents.map(e => `${e.title} (${e.start} to ${e.end})`));
    console.log('🔍 DEBUG: Total events in 7-day range:', todayEvents.length);
    console.log('🔍 DEBUG: API Key present:', !!process.env.OPENAI_API_KEY);
    console.log('🔍 DEBUG: API Key length:', process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.length : 0);

    // Retry logic for handling API overload
    const makeOpenAIRequest = async (retryCount = 0, maxRetries = 3) => {
      const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff: 1s, 2s, 4s
      
      if (retryCount > 0) {
        console.log(`🔄 Retrying OpenAI API request (attempt ${retryCount + 1}/${maxRetries + 1}) after ${delay}ms delay...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify(requestBody),
        timeout: 30000 // 30 second timeout
      });

      console.log('🔍 DEBUG: OpenAI API response status:', response.status);
      console.log('🔍 DEBUG: OpenAI API response headers:', Object.fromEntries(response.headers.entries()));

      // Handle rate limit errors with retry
      if (response.status === 429 && retryCount < maxRetries) {
        const errorText = await response.text();
        console.log(`⚠️ OpenAI API rate limited (429), retrying... Response: ${errorText}`);
        return makeOpenAIRequest(retryCount + 1, maxRetries);
      }

      return response;
    };

    const response = await makeOpenAIRequest();

    if (!response.ok) {
      const errorText = await response.text();
      console.error('🚨 OpenAI API Error Response:', errorText);
      
      // If OpenAI API is rate limited after all retries, provide a graceful fallback
      if (response.status === 429) {
        console.log('📋 Providing fallback response due to OpenAI API rate limit');
        const fallbackResponse = createFallbackResponse(message, context);
        res.json({ response: fallbackResponse, context: context });
        return;
      }
      
      throw new Error(`OpenAI API request failed: ${response.status} ${response.statusText}`);
    }

    // Set up streaming response headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    let fullResponse = '';
    
    // Handle streaming response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            
            if (data === '[DONE]') {
              break;
            }
            
            try {
              const parsed = JSON.parse(data);
              
              // OpenAI streaming format
              if (parsed.choices && parsed.choices[0]?.delta?.content) {
                const text = parsed.choices[0].delta.content;
                fullResponse += text;
                
                // Send streaming chunk to frontend
                res.write(`data: ${JSON.stringify({ 
                  type: 'chunk', 
                  content: text 
                })}\n\n`);
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }
      
      // Process the complete response
      const jsonMatch = fullResponse.match(/\{[\s\S]*"type":\s*"(event_suggestion|event_rearrangement|multiple_actions)"[\s\S]*\}/);
      
      if (jsonMatch) {
        try {
          const actionData = JSON.parse(jsonMatch[0]);
          if (actionData.type === 'event_suggestion' || actionData.type === 'event_rearrangement' || actionData.type === 'multiple_actions') {
            // Validate the action data before sending to frontend
            const validationResult = validateActionData(actionData, context);
            if (!validationResult.valid) {
              console.error('🚨 OpenAI response validation failed:', validationResult.error);
              res.write(`data: ${JSON.stringify({ 
                type: 'error', 
                error: 'Invalid calendar response detected',
                details: validationResult.error 
              })}\n\n`);
              res.write('data: [DONE]\n\n');
              res.end();
              return;
            } else {
              // Extract the text part (everything before the JSON)
              const textPart = fullResponse.replace(jsonMatch[0], '').trim();
              
              // Send final structured response
              res.write(`data: ${JSON.stringify({ 
                type: 'complete',
                response: {
                  type: actionData.type,
                  message: textPart || actionData.message,
                  eventData: actionData.eventData,
                  rearrangements: actionData.rearrangements || null,
                  actions: actionData.actions || null
                },
                context: context
              })}\n\n`);
              res.write('data: [DONE]\n\n');
              res.end();
              return;
            }
          }
        } catch (e) {
          console.warn('Failed to parse JSON from OpenAI response:', e.message);
        }
      }
      
      // Send final response
      res.write(`data: ${JSON.stringify({ 
        type: 'complete',
        response: fullResponse, 
        context: context 
      })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
      
    } catch (streamError) {
      console.error('Streaming error:', streamError);
      res.write(`data: ${JSON.stringify({ 
        type: 'error', 
        error: 'Streaming failed' 
      })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    }
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
      color: color || getRandomEventColor()
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
// AI TOOL ENDPOINTS - Clean tool-based API for OpenAI assistant
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

// Tool-based OpenAI endpoint
app.post('/api/ai/chat', authenticateUser, async (req, res) => {
  try {
    const { message, chatHistory = [], userTimeZone, suggestionMode = false } = req.body;
    
    console.log('🌐 === AI CHAT REQUEST DEBUG ===');
    console.log('🌐 Received userTimeZone:', userTimeZone);
    console.log('🌐 Server detected timezone:', Intl.DateTimeFormat().resolvedOptions().timeZone);
    
    // Store user's timezone in request for tool functions
    req.userTimeZone = userTimeZone;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Define tools for OpenAI
    const tools = [
      {
        type: "function",
        function: {
          name: "get_calendar_events",
          description: "Get calendar events for a specific date range or all events if no range provided. Use this to check existing events before scheduling.",
          parameters: {
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
        }
      },
      {
        type: "function",
        function: {
          name: "create_event",
          description: "Create a new calendar event. Always check for conflicts first using get_calendar_events.",
          parameters: {
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
        }
      },
      {
        type: "function",
        function: {
          name: "move_event",
          description: "Move/reschedule an existing event to a new time and optionally change its title. Use check_time_conflicts first to ensure no conflicts.",
          parameters: {
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
        }
      },
      {
        type: "function",
        function: {
          name: "check_time_conflicts",
          description: "Check if a proposed time slot conflicts with existing events.",
          parameters: {
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
        }
      },
      {
        type: "function",
        function: {
          name: "search_events",
          description: "Search for events by title (case-insensitive partial match).",
          parameters: {
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
      },
      {
        type: "function",
        function: {
          name: "find_friends",
          description: "Get the current user's friends list to see who they can book meetings with.",
          parameters: {
            type: "object",
            properties: {},
            required: []
          }
        }
      },
      {
        type: "function",
        function: {
          name: "find_mutual_free_time",
          description: "Find available time slots when both the user and a friend are free for a meeting.",
          parameters: {
            type: "object",
            properties: {
              friend_name: {
                type: "string",
                description: "Name of the friend to find mutual time with"
              },
              duration_minutes: {
                type: "integer",
                description: "Duration of the meeting in minutes (default: 30)"
              },
              start_date: {
                type: "string",
                description: "Start of date range to search (YYYY-MM-DD)"
              },
              end_date: {
                type: "string",
                description: "End of date range to search (YYYY-MM-DD)"
              }
            },
            required: ["friend_name", "start_date", "end_date"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "request_meeting_with_friend",
          description: "Send a meeting request to a friend with proposed time slots.",
          parameters: {
            type: "object",
            properties: {
              friend_name: {
                type: "string",
                description: "Name of the friend to request a meeting with"
              },
              meeting_title: {
                type: "string",
                description: "Title for the meeting"
              },
              message: {
                type: "string",
                description: "Optional message to include with the meeting request"
              },
              duration_minutes: {
                type: "integer",
                description: "Duration of the meeting in minutes (default: 30)"
              },
              proposed_times: {
                type: "array",
                description: "Array of proposed meeting times in ISO format",
                items: {
                  type: "string",
                  description: "Proposed start time (YYYY-MM-DDTHH:MM:SS)"
                }
              }
            },
            required: ["friend_name", "meeting_title", "proposed_times"]
          }
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

    // Create enhanced system prompt with detailed date/time awareness
    const tzInfo = getUserTimezoneInfo(req.userTimeZone);
    
    // Get more detailed date context
    const now = new Date();
    const currentDate = now.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      timeZone: req.userTimeZone 
    });
    
    const systemPrompt = `You are Tilly, a helpful calendar assistant with precise date and time awareness.

📅 CURRENT DATE & TIME CONTEXT:
- TODAY is ${currentDate}
- Current local time: ${tzInfo.localTimeStr} (${tzInfo.tzAbbr})
- Current date string: ${todayStr} (YYYY-MM-DD format)
- Tomorrow date string: ${tomorrowStr} (YYYY-MM-DD format)
- User timezone: ${tzInfo.timeZone} (${tzInfo.offsetFormatted})

📋 TODAY'S SCHEDULE (${todayStr}):
${formatEventsForPrompt(todayEvents, 'TODAY')}

📋 TOMORROW'S SCHEDULE (${tomorrowStr}):
${formatEventsForPrompt(tomorrowEvents, 'TOMORROW')}

🎯 CRITICAL DATE INTERPRETATION RULES:
1. When user says "today" → Always use date ${todayStr}
2. When user says "tomorrow" → Always use date ${tomorrowStr}
3. When user says "3pm today" → Create event for ${todayStr}T15:00:00
4. When user says "3pm" without specifying day → Assume TODAY (${todayStr}T15:00:00)
5. When user says day names (Monday, Tuesday, etc.) → Calculate the NEXT occurrence of that day
6. When user says "this [day]" → Find the occurrence within this week
7. When user says "next [day]" → Find the occurrence in the following week

⚠️ COMMON MISTAKES TO AVOID:
- Do NOT confuse today (${todayStr}) with other dates
- Do NOT schedule events for wrong dates
- Do NOT assume times without considering the current date
- Always double-check: if user says "today at 3pm" → use ${todayStr}T15:00:00

🔧 TOOL USAGE FOR DATES:
- For TODAY's events: Use the events already provided above
- For TOMORROW's events: Use the events already provided above  
- For other dates: Use get_calendar_events tool with start_date and end_date
- When creating events: Always use YYYY-MM-DDTHH:MM:SS format WITHOUT Z suffix
- Time format examples:
  * "today at 3pm" → "${todayStr}T15:00:00"
  * "tomorrow at 9am" → "${tomorrowStr}T09:00:00"
  * "monday at 2pm" → Calculate next Monday + "T14:00:00"

🎯 WORKFLOW:
1. Parse user's date/time intent carefully
2. Check if it's for TODAY or TOMORROW (use provided events above)
3. For other dates, use get_calendar_events tool first
4. Check for conflicts with check_time_conflicts
5. Create or move events as needed
6. Confirm the action with the specific date and time

REMEMBER: Today is ${currentDate}. When in doubt about dates, always clarify with the user!`;

    // Build message history for OpenAI
    const messages = [
      {
        role: 'system',
        content: systemPrompt
      }
    ];
    
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

    const openaiRequest = {
      model: 'gpt-4o-mini',
      max_tokens: 1000,
      messages: messages,
      tools: tools,
      tool_choice: 'auto',
      temperature: 0.3
    };

    console.log('🤖 Making OpenAI API request with tools...');
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify(openaiRequest)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', errorText);
      throw new Error(`OpenAI API request failed: ${response.status}`);
    }

    const openaiData = await response.json();
    const choice = openaiData.choices[0];
    
    // Check if OpenAI wants to use tools
    const hasToolCalls = choice.message.tool_calls && choice.message.tool_calls.length > 0;
    
    if (hasToolCalls) {
      if (suggestionMode) {
        console.log('🔧 OpenAI wants to use tools, returning suggestions without executing...');
        
        // Extract tool suggestions without executing
        const suggestedTools = choice.message.tool_calls.map(toolCall => ({
          name: toolCall.function.name,
          input: JSON.parse(toolCall.function.arguments)
        }));
        
        const responseText = choice.message.content || '';
        
        return res.json({
          response: responseText,
          suggestedTools,
          success: true
        });
      }
      
      console.log('🔧 OpenAI wants to use tools, executing and getting final response...');
      
      // Execute all tool calls
      const toolResults = [];
      for (const toolCall of choice.message.tool_calls) {
        const toolName = toolCall.function.name;
        const toolInput = JSON.parse(toolCall.function.arguments);
        
        console.log(`🔧 Executing tool: ${toolName}`, toolInput);
        
        try {
          let toolResult;
          
          switch (toolName) {
            case 'get_calendar_events':
              toolResult = await executeGetCalendarEvents(toolInput, req);
              break;
            case 'create_event':
              toolResult = await executeCreateEvent(toolInput, req);
              break;
            case 'move_event':
              toolResult = await executeMoveEvent(toolInput, req);
              break;
            case 'check_time_conflicts':
              toolResult = await executeCheckTimeConflicts(toolInput, req);
              break;
            case 'search_events':
              toolResult = await executeSearchEvents(toolInput, req);
              break;
            case 'find_friends':
              toolResult = await executeFindFriends(toolInput, req);
              break;
            case 'find_mutual_free_time':
              toolResult = await executeFindMutualFreeTime(toolInput, req);
              break;
            case 'request_meeting_with_friend':
              toolResult = await executeRequestMeetingWithFriend(toolInput, req);
              break;
            default:
              toolResult = { success: false, error: 'Unknown tool' };
            }
            
          console.log(`✅ Tool ${toolName} completed:`, toolResult.success ? 'SUCCESS' : 'FAILED');
          
          // Track tool name for change detection BEFORE stringifying
          toolResult._tool_name = toolName;
          
          toolResults.push({
            tool_call_id: toolCall.id,
            role: 'tool',
            name: toolName,
            content: JSON.stringify(toolResult)
          });
            
        } catch (error) {
          console.error(`❌ Error executing tool ${toolName}:`, error);
          toolResults.push({
            tool_call_id: toolCall.id,
            role: 'tool',
            name: toolName,
            content: JSON.stringify({ success: false, error: error.message })
          });
        }
      }
      
      // Continue conversation with tool results
      const conversationMessages = [
        ...messages,
        choice.message,
        ...toolResults
      ];
      
      console.log('🔄 Sending tool results back to OpenAI...');
      
      const followUpRequest = {
        model: 'gpt-4o-mini',
        max_tokens: 1000,
        messages: conversationMessages,
        temperature: 0.3
      };
      
      const followUpResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify(followUpRequest)
      });
      
      if (!followUpResponse.ok) {
        const errorText = await followUpResponse.text();
        console.error(`OpenAI API error ${followUpResponse.status}:`, errorText);
        throw new Error(`OpenAI follow-up request failed: ${followUpResponse.status}`);
      }
      
      const finalResponse = await followUpResponse.json();
      const finalChoice = finalResponse.choices[0];
      
      const finalText = finalChoice.message.content || '';
      
      // Check if any events were created/moved
      console.log('🔍 Checking for event changes in', toolResults.length, 'tool results');
      const hasEventChanges = toolResults.some(result => {
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
        toolResults: toolResults.map(r => ({ ...r, content: JSON.parse(r.content) })),
        hasEventChanges,
        success: true
      });
      
    } else {
      // No tools needed, just return OpenAI's text response
      const responseText = choice.message.content || '';
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

// New streamlined AI chat endpoint - much faster and smarter
app.post('/api/ai/smart-chat', authenticateUser, async (req, res) => {
  try {
    const { message, chatHistory = [], userTimeZone = 'Europe/London' } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Fetch current week's events from database for accurate context
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay()); // Sunday
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6); // Saturday
    
    console.log(`📅 Fetching events for current week: ${startOfWeek.toISOString().split('T')[0]} to ${endOfWeek.toISOString().split('T')[0]}`);
    
    const weekEvents = await getEventsByDateRange(startOfWeek, endOfWeek, req.userId, req.supabase);
    
    // Create rich context from current week's events
    const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD format
    const todaysEvents = weekEvents.filter(e => {
      const eventDate = new Date(e.start).toISOString().split('T')[0];
      return eventDate === todayStr;
    });
    
    const tomorrowDate = new Date(Date.now() + 24*60*60*1000).toISOString().split('T')[0];
    const tomorrowEvents = weekEvents.filter(e => {
      const eventDate = new Date(e.start).toISOString().split('T')[0];
      return eventDate === tomorrowDate;
    });
    
    const eventsContext = `
TODAY (${todayStr}): ${todaysEvents.length > 0 
  ? todaysEvents.map(e => `"${e.title}" at ${new Date(e.start).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}`).join(', ')
  : 'No events scheduled'}

TOMORROW (${tomorrowDate}): ${tomorrowEvents.length > 0
  ? tomorrowEvents.map(e => `"${e.title}" at ${new Date(e.start).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}`).join(', ')  
  : 'No events scheduled'}

THIS WEEK: ${weekEvents.slice(0, 10).map(e => `"${e.title}" on ${new Date(e.start).toLocaleDateString()}`).join(', ')}`;
    
    // First, classify the request complexity
    const requestType = classifyRequest(message);
    console.log(`🔍 Message: "${message}" classified as: ${requestType}`);
    
    if (requestType === 'complex') {
      // Use tool-based approach for complex queries
      return await handleComplexRequest(message, weekEvents, userTimeZone, req, res);
    }
    
    // Add conversation history for context
    const conversationHistory = chatHistory.length > 0 
      ? `\nRecent conversation:\n${chatHistory.slice(-3).map(msg => `${msg.sender}: ${msg.text}`).join('\n')}\n`
      : '';
    
    // Get enhanced date/time context
    const tzInfo = getUserTimezoneInfo(userTimeZone);
    const currentDate = new Date();
    const tomorrowStr = new Date(Date.now() + 24*60*60*1000).toISOString().split('T')[0];
    
    // Enhanced prompt with precise date awareness
    const smartPrompt = `You are Tilly, a helpful calendar assistant with precise date and time awareness.

📅 CURRENT DATE & TIME CONTEXT:
- TODAY is ${todayStr}
- Current local time: ${tzInfo.localTimeStr} (${tzInfo.tzAbbr})
- Current date string: ${todayStr} (YYYY-MM-DD format)
- Tomorrow date string: ${tomorrowStr} (YYYY-MM-DD format)

🎯 CRITICAL DATE INTERPRETATION RULES:
1. When user says "today" → Always use date ${todayStr}
2. When user says "tomorrow" → Always use date ${tomorrowStr}
3. When user says "3pm today" → Create event for ${todayStr}T15:00:00
4. When user says "3pm" without specifying day → Assume TODAY (${todayStr}T15:00:00)
5. When user says a day name like "Monday" → Find the next upcoming Monday from today
6. Always double-check: is this for today (${todayStr}) or another day?

${eventsContext}${conversationHistory}

User: ${message}

Respond naturally first, then if action needed, add on new line:
CREATE_EVENT: {title: "Name", date: "YYYY-MM-DD", time: "HH:MM", duration: 60}
MOVE_EVENT: {eventTitle: "Event", newDate: "YYYY-MM-DD", newTime: "HH:MM"}`;

    console.log('🤖 Making streamlined OpenAI request...');
    console.log('🔍 DEBUG: OPENAI_API_KEY present:', !!process.env.OPENAI_API_KEY);
    console.log('🔍 DEBUG: OPENAI_API_KEY length:', process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.length : 0);
    console.log('🔍 DEBUG: OPENAI_API_KEY starts with sk-:', process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.startsWith('sk-') : false);
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 200, // Reduced for faster responses
        messages: [
          { role: 'system', content: 'You are Tilly, a helpful calendar assistant. Be concise.' },
          { role: 'user', content: smartPrompt }
        ],
        temperature: 0.3
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('🔍 OpenAI API Error Details:', {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body: errorBody
      });
      throw new Error(`OpenAI API request failed: ${response.status} - ${errorBody}`);
    }

    const aiData = await response.json();
    const aiResponse = aiData.choices[0].message.content;
    
    console.log('🔍 AI Response:', aiResponse);
    
    // Parse action suggestions from AI response
    const suggestions = parseActionSuggestions(aiResponse, userTimeZone);
    
    // Clean the response text by removing action patterns
    const cleanedResponse = aiResponse
      .replace(/CREATE_EVENT:\s*\{[^}]+\}/g, '')
      .replace(/MOVE_EVENT:\s*\{[^}]+\}/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    
    console.log('🔍 Parsed suggestions:', suggestions);
    console.log('🔍 Cleaned response:', cleanedResponse);
    
    res.json({
      response: cleanedResponse,
      suggestions: suggestions,
      success: true
    });

  } catch (error) {
    console.error('Error in smart chat:', error);
    res.status(500).json({ 
      error: 'Failed to process AI request',
      details: error.message 
    });
  }
});

// Classify request complexity to decide between fast parsing vs tools
function classifyRequest(message) {
  // Only truly complex queries that need deep search/analysis
  const complexPatterns = [
    /when (did|was|have) i (last|previously|before).*(meet|meeting|saw)/i, // "when did I last meet with John"
    /how many.*(meetings|events).*(with|containing|about).+/i, // "how many meetings with specific person"
    /find (all|events|meetings) (with|containing|about).+/i, // "find all meetings about project X"
    /search.*(for|calendar).*(with|containing|about).+/i, // "search for meetings with John"
    /analyze my (schedule|calendar)/i,
    /pattern of (meetings|events)/i,
    /busiest (day|week|month)/i,
    /overlap(ping)? (meetings|events)/i,
    /recurring (meetings|events)/i
  ];
  
  // Simple queries that should use context
  const simplePatterns = [
    /what.*(do i have|events|meetings).*(today|tomorrow|this week)/i,
    /check.*(events|schedule|calendar).*(today|tomorrow)/i,
    /show.*(today|tomorrow|this week)/i,
    /am i (free|busy).*(today|tomorrow)/i,
    /what's.*(today|tomorrow)/i
  ];
  
  // If it's clearly simple, return simple
  if (simplePatterns.some(pattern => pattern.test(message))) {
    return 'simple';
  }
  
  // Only complex if it matches complex patterns
  return complexPatterns.some(pattern => pattern.test(message)) ? 'complex' : 'simple';
}

// Handle complex requests using tools
async function handleComplexRequest(message, currentEvents, userTimeZone, req, res) {
  try {
    console.log('🔍 Handling complex request with tools...');
    
    // Define tools for complex analysis
    const complexTools = [
      {
        name: "search_events",
        description: "Search calendar events by title, participant, date range, or other criteria",
        input_schema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query" },
            start_date: { type: "string", description: "Start date (YYYY-MM-DD)" },
            end_date: { type: "string", description: "End date (YYYY-MM-DD)" },
            participant: { type: "string", description: "Person's name to search for" }
          }
        }
      },
      {
        name: "analyze_schedule",
        description: "Analyze calendar patterns, frequency, busy periods",
        input_schema: {
          type: "object", 
          properties: {
            analysis_type: { type: "string", enum: ["frequency", "busy_periods", "patterns", "conflicts"] },
            date_range: { type: "string", description: "Date range to analyze" }
          }
        }
      },
      {
        name: "get_calendar_events",
        description: "Get calendar events for a specific date range",
        input_schema: {
          type: "object",
          properties: {
            start_date: { type: "string", description: "Start date (YYYY-MM-DD)" },
            end_date: { type: "string", description: "End date (YYYY-MM-DD)" }
          }
        }
      }
    ];

    const complexPrompt = `You are Tilly, a calendar assistant with advanced analysis capabilities. Current time: ${new Date().toLocaleString()} (${userTimeZone}).

Recent events: ${currentEvents.map(e => `"${e.title}" on ${new Date(e.start).toLocaleDateString()}`).join(', ')}

The user has asked a complex question that requires searching or analyzing their calendar. Use the available tools to help answer their question thoroughly.

User: ${message}
Assistant:`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 1000,
        messages: [
          { role: 'system', content: 'You are Tilly, a helpful calendar assistant.' },
          { role: 'user', content: complexPrompt }
        ],
        tools: complexTools,
        tool_choice: 'auto',
        temperature: 0.3
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API request failed: ${response.status}`);
    }

    const openaiData = await response.json();
    const choice = openaiData.choices[0];
    
    // Check if OpenAI wants to use tools
    const hasToolCalls = choice.message.tool_calls && choice.message.tool_calls.length > 0;
    
    if (hasToolCalls) {
      console.log('🔧 OpenAI wants to use tools for complex query...');
      
      // Execute tools and get final response
      const toolResults = [];
      for (const toolCall of choice.message.tool_calls) {
        const toolName = toolCall.function.name;
        const toolInput = JSON.parse(toolCall.function.arguments);
        
        let result;
        try {
          switch (toolName) {
            case 'search_events':
              result = await executeSearchEvents(toolInput, req);
              break;
            case 'analyze_schedule':
              result = await executeAnalyzeSchedule(toolInput, req);
              break;
            case 'find_friends':
              result = await executeFindFriends(toolInput, req);
              break;
            case 'find_mutual_free_time':
              result = await executeFindMutualFreeTime(toolInput, req);
              break;
            case 'request_meeting_with_friend':
              result = await executeRequestMeetingWithFriend(toolInput, req);
              break;
            case 'get_calendar_events':
              result = await executeGetCalendarEvents(toolInput, req);
              break;
            default:
              result = { success: false, error: `Unknown tool: ${toolName}` };
          }
        } catch (error) {
          result = { success: false, error: error.message };
        }
        
        toolResults.push({
          tool_call_id: toolCall.id,
          role: 'tool',
          name: toolName,
          content: JSON.stringify(result)
        });
      }
      
      // Get final response from OpenAI with tool results
      const conversationMessages = [
        { role: 'system', content: 'You are Tilly, a helpful calendar assistant.' },
        { role: 'user', content: complexPrompt },
        choice.message,
        ...toolResults
      ];
      
      const finalResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          max_tokens: 1000,
          messages: conversationMessages,
          temperature: 0.3
        })
      });
      
      const finalData = await finalResponse.json();
      const finalText = finalData.choices[0].message.content;
      
      return res.json({
        response: finalText,
        suggestions: [], // Complex queries don't need action buttons
        isComplex: true,
        success: true
      });
    } else {
      // No tools needed, return direct response
      const responseText = choice.message.content;
      return res.json({
        response: responseText,
        suggestions: [],
        isComplex: true,
        success: true
      });
    }
    
  } catch (error) {
    console.error('Error in complex request:', error);
    return res.status(500).json({
      error: 'Failed to process complex request',
      details: error.message
    });
  }
}

// Parse action suggestions from AI response text
function parseActionSuggestions(aiResponse, userTimeZone) {
  const suggestions = [];
  
  // Look for CREATE_EVENT pattern - much more robust parsing
  const createMatch = aiResponse.match(/CREATE_EVENT:\s*\{([^}]+)\}/);
  if (createMatch) {
    try {
      const eventData = parseEventData(createMatch[1]);
      if (eventData.title && eventData.date) {
        suggestions.push({
          type: 'create_event',
          title: eventData.title,
          date: eventData.date,
          time: eventData.time || '09:00',
          duration: parseInt(eventData.duration) || 60,
          buttonText: `Create "${eventData.title}"`
        });
      }
    } catch (e) {
      console.log('Failed to parse CREATE_EVENT:', e.message);
    }
  }
  
  // Look for MOVE_EVENT pattern  
  const moveMatch = aiResponse.match(/MOVE_EVENT:\s*\{([^}]+)\}/);
  if (moveMatch) {
    try {
      const moveData = parseEventData(moveMatch[1]);
      if (moveData.eventTitle && moveData.newDate) {
        suggestions.push({
          type: 'move_event',
          eventTitle: moveData.eventTitle,
          newDate: moveData.newDate,
          newTime: moveData.newTime || '09:00',
          buttonText: `Move "${moveData.eventTitle}"`
        });
      }
    } catch (e) {
      console.log('Failed to parse MOVE_EVENT:', e.message);
    }
  }
  
  return suggestions;
}

// Helper to parse event data from string
function parseEventData(dataStr) {
  const data = {};
  
  // More robust parsing that handles quotes and various formats
  const cleanStr = dataStr.trim();
  const pairs = cleanStr.split(',');
  
  pairs.forEach(pair => {
    const colonIndex = pair.indexOf(':');
    if (colonIndex !== -1) {
      const key = pair.substring(0, colonIndex).trim();
      const value = pair.substring(colonIndex + 1).trim();
      if (key && value) {
        // Remove quotes and clean up
        data[key] = value.replace(/^["']|["']$/g, '').trim();
      }
    }
  });
  
  return data;
}

// Execute AI suggested tools endpoint
app.post('/api/ai/execute-tools', authenticateUser, async (req, res) => {
  try {
    const { tools, userTimeZone } = req.body;
    
    if (!tools || !Array.isArray(tools)) {
      return res.status(400).json({ error: 'Tools array is required' });
    }
    
    // Store user's timezone in request for tool functions
    req.userTimeZone = userTimeZone;
    
    const results = [];
    
    // Execute each tool
    for (const tool of tools) {
      let result;
      try {
        switch (tool.name) {
          case 'create_event':
            result = await executeCreateEvent(tool.input, req);
            break;
          case 'move_event':
            result = await executeMoveEvent(tool.input, req);
            break;
          case 'get_calendar_events':
            result = await executeGetCalendarEvents(tool.input, req);
            break;
          case 'check_time_conflicts':
            result = await executeCheckTimeConflicts(tool.input, req);
            break;
          case 'find_friends':
            result = await executeFindFriends(tool.input, req);
            break;
          case 'find_mutual_free_time':
            result = await executeFindMutualFreeTime(tool.input, req);
            break;
          case 'request_meeting_with_friend':
            result = await executeRequestMeetingWithFriend(tool.input, req);
            break;
          default:
            result = { success: false, error: `Unknown tool: ${tool.name}` };
        }
        result._tool_name = tool.name;
        results.push(result);
      } catch (error) {
        console.error(`Error executing tool ${tool.name}:`, error);
        results.push({
          success: false,
          error: error.message,
          _tool_name: tool.name
        });
      }
    }
    
    const hasEventChanges = results.some(result => 
      result.success && ['create_event', 'move_event'].includes(result._tool_name)
    );
    
    res.json({
      results,
      hasEventChanges,
      success: true
    });
    
  } catch (error) {
    console.error('Error executing tools:', error);
    res.status(500).json({ 
      error: 'Failed to execute tools',
      details: error.message 
    });
  }
});

// New tool functions for complex queries
async function executeSearchEvents(input, req) {
  try {
    const { query, start_date, end_date, participant } = input;
    
    console.log(`🔍 Searching events with query: "${query}", participant: "${participant}"`);
    
    // Get events in the specified range or default to last 3 months
    const startDate = start_date ? new Date(start_date) : new Date(new Date().setMonth(new Date().getMonth() - 3));
    const endDate = end_date ? new Date(end_date) : new Date();
    
    const events = await getEventsByDateRange(startDate, endDate, req.userId, req.supabase);
    
    // Filter events based on search criteria
    let filteredEvents = events;
    
    if (query) {
      filteredEvents = filteredEvents.filter(event => 
        event.title.toLowerCase().includes(query.toLowerCase()) ||
        (event.description && event.description.toLowerCase().includes(query.toLowerCase()))
      );
    }
    
    if (participant) {
      filteredEvents = filteredEvents.filter(event =>
        event.title.toLowerCase().includes(participant.toLowerCase()) ||
        (event.description && event.description.toLowerCase().includes(participant.toLowerCase()))
      );
    }
    
    if (filteredEvents.length === 0) {
      return { 
        success: true, 
        message: `No events found matching your search criteria.`,
        events: []
      };
    }
    
    const eventsList = filteredEvents.map(e => ({
      title: e.title,
      date: e.start.toLocaleDateString(),
      time: e.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      id: e.id
    }));
    
    return { 
      success: true, 
      message: `Found ${filteredEvents.length} events matching your search.`,
      events: eventsList
    };
    
  } catch (error) {
    console.error('Error searching events:', error);
    return { success: false, error: error.message };
  }
}

async function executeAnalyzeSchedule(input, req) {
  try {
    const { analysis_type, date_range } = input;
    
    console.log(`📊 Analyzing schedule: ${analysis_type} for ${date_range}`);
    
    // Default to last month for analysis
    const endDate = new Date();
    const startDate = new Date();
    
    if (date_range === 'week') {
      startDate.setDate(endDate.getDate() - 7);
    } else if (date_range === 'month') {
      startDate.setMonth(endDate.getMonth() - 1);
    } else {
      startDate.setMonth(endDate.getMonth() - 1); // default to month
    }
    
    const events = await getEventsByDateRange(startDate, endDate, req.userId, req.supabase);
    
    let analysis = {};
    
    switch (analysis_type) {
      case 'frequency':
        const eventsByDay = {};
        events.forEach(event => {
          const day = event.start.toDateString();
          eventsByDay[day] = (eventsByDay[day] || 0) + 1;
        });
        
        const avgPerDay = events.length / Object.keys(eventsByDay).length;
        analysis = {
          total_events: events.length,
          average_per_day: Math.round(avgPerDay * 100) / 100,
          busiest_day: Object.entries(eventsByDay).sort((a, b) => b[1] - a[1])[0]
        };
        break;
        
      case 'busy_periods':
        const hourCounts = {};
        events.forEach(event => {
          const hour = event.start.getHours();
          hourCounts[hour] = (hourCounts[hour] || 0) + 1;
        });
        
        const busiestHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0];
        analysis = {
          busiest_hour: busiestHour ? `${busiestHour[0]}:00` : 'No data',
          hour_distribution: hourCounts
        };
        break;
        
      case 'patterns':
        const dayOfWeekCounts = {};
        events.forEach(event => {
          const dayOfWeek = event.start.toLocaleDateString('en-US', { weekday: 'long' });
          dayOfWeekCounts[dayOfWeek] = (dayOfWeekCounts[dayOfWeek] || 0) + 1;
        });
        
        analysis = {
          events_by_weekday: dayOfWeekCounts,
          total_events: events.length
        };
        break;
        
      default:
        analysis = { message: 'Analysis type not supported' };
    }
    
    return { 
      success: true, 
      analysis_type,
      date_range,
      data: analysis
    };
    
  } catch (error) {
    console.error('Error analyzing schedule:', error);
    return { success: false, error: error.message };
  }
}

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
    
    // Use the DST-aware conversion function for AI's local time inputs
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
    
    // Use the DST-aware conversion function for AI's local time inputs
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
    
    // Use the DST-aware conversion function for AI's local time inputs
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
    
    // Limit events sent to AI to prevent API issues
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

// ============================================
// FRIEND-BASED MEETING AI TOOL FUNCTIONS
// ============================================

async function executeFindFriends(input, req) {
  try {
    console.log('👥 Finding friends for user:', req.userId);
    
    const friends = await getFriends(req.userId, req.supabase);
    
    if (friends.length === 0) {
      return {
        success: true,
        friends: [],
        message: "You don't have any friends added yet. You can search for users and send friend requests to start booking meetings together."
      };
    }
    
    return {
      success: true,
      friends: friends.map(f => ({
        id: f.friend.id,
        name: f.friend.display_name,
        email: f.friend.email
      })),
      count: friends.length,
      message: `You have ${friends.length} friend${friends.length === 1 ? '' : 's'} you can book meetings with.`
    };
  } catch (error) {
    console.error('Error in executeFindFriends:', error);
    return { 
      success: false,
      error: 'Failed to retrieve friends list',
      details: error.message 
    };
  }
}

async function executeFindMutualFreeTime(input, req) {
  try {
    const { friend_name, duration_minutes = 30, start_date, end_date } = input;
    
    console.log(`🕐 Finding mutual free time with "${friend_name}" for ${duration_minutes} minutes`);
    
    // First, find the friend by name
    const friends = await getFriends(req.userId, req.supabase);
    const friend = friends.find(f => 
      f.friend.display_name.toLowerCase().includes(friend_name.toLowerCase()) ||
      f.friend.email.toLowerCase().includes(friend_name.toLowerCase())
    );
    
    if (!friend) {
      return {
        success: false,
        error: `Friend "${friend_name}" not found. Make sure you're friends with this person first.`
      };
    }
    
    // Parse dates
    const startDateTime = new Date(start_date + 'T00:00:00Z');
    const endDateTime = new Date(end_date + 'T23:59:59Z');
    
    if (isNaN(startDateTime.getTime()) || isNaN(endDateTime.getTime())) {
      return {
        success: false,
        error: 'Invalid date format. Use YYYY-MM-DD format.'
      };
    }
    
    // Find mutual free time
    const freeSlots = await findMutualFreeTime(
      req.userId,
      friend.friend.id,
      duration_minutes,
      startDateTime.toISOString(),
      endDateTime.toISOString(),
      req.supabase
    );
    
    if (freeSlots.length === 0) {
      return {
        success: true,
        free_slots: [],
        message: `No mutual free time found with ${friend.friend.display_name} between ${start_date} and ${end_date} for ${duration_minutes} minutes. Try a different date range or shorter duration.`
      };
    }
    
    return {
      success: true,
      friend_name: friend.friend.display_name,
      duration_minutes,
      free_slots: freeSlots.map(slot => ({
        start: slot.start.toISOString(),
        end: slot.end.toISOString(),
        start_local: utcToLocal(slot.start.toISOString(), '12h', req.userTimeZone),
        day: slot.start.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
      })),
      message: `Found ${freeSlots.length} mutual free time slot${freeSlots.length === 1 ? '' : 's'} with ${friend.friend.display_name}.`
    };
  } catch (error) {
    console.error('Error in executeFindMutualFreeTime:', error);
    return { 
      success: false,
      error: 'Failed to find mutual free time',
      details: error.message 
    };
  }
}

async function executeRequestMeetingWithFriend(input, req) {
  try {
    const { friend_name, meeting_title, message = '', duration_minutes = 30, proposed_times } = input;
    
    console.log(`📤 Requesting meeting "${meeting_title}" with "${friend_name}"`);
    
    // Find the friend by name
    const friends = await getFriends(req.userId, req.supabase);
    const friend = friends.find(f => 
      f.friend.display_name.toLowerCase().includes(friend_name.toLowerCase()) ||
      f.friend.email.toLowerCase().includes(friend_name.toLowerCase())
    );
    
    if (!friend) {
      return {
        success: false,
        error: `Friend "${friend_name}" not found. Make sure you're friends with this person first.`
      };
    }
    
    // Validate proposed times
    if (!proposed_times || !Array.isArray(proposed_times) || proposed_times.length === 0) {
      return {
        success: false,
        error: 'At least one proposed time is required for the meeting request.'
      };
    }
    
    // Convert proposed times to proper format and validate
    const validatedTimes = [];
    for (const timeStr of proposed_times) {
      const proposedTime = new Date(timeStr);
      if (isNaN(proposedTime.getTime())) {
        return {
          success: false,
          error: `Invalid time format: "${timeStr}". Use ISO format like "2025-01-05T14:00:00".`
        };
      }
      validatedTimes.push(proposedTime.toISOString());
    }
    
    // Create the meeting request
    const requestData = {
      requester_id: req.userId,
      friend_id: friend.friend.id,
      title: meeting_title.trim(),
      message: message.trim() || null,
      duration_minutes,
      proposed_times: validatedTimes,
      status: 'pending'
    };
    
    const meetingRequest = await createMeetingRequest(requestData, req.supabase);
    
    return {
      success: true,
      request: meetingRequest,
      friend_name: friend.friend.display_name,
      message: `Meeting request "${meeting_title}" sent to ${friend.friend.display_name} with ${validatedTimes.length} proposed time${validatedTimes.length === 1 ? '' : 's'}.`
    };
  } catch (error) {
    console.error('Error in executeRequestMeetingWithFriend:', error);
    return { 
      success: false,
      error: 'Failed to send meeting request',
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
            color: getRandomEventColor() // Use random green or cream color for imported events
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
          color: getRandomEventColor(), // Random green or cream for URL imports
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
          color: getRandomEventColor() 
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

// Create new calendar subscription
app.post('/api/calendar-subscriptions', authenticateUser, async (req, res) => {
  try {
    const { name, url, color } = req.body;
    
    if (!name || !url) {
      return res.status(400).json({ error: 'Name and URL are required' });
    }
    
    const subscriptionData = {
      name,
      url,
      color: color || '#4A7C2A',
      sync_enabled: true
    };
    
    const newSubscription = await addCalendarSubscription(subscriptionData, req.userId, req.supabase);
    
    console.log('Created new calendar subscription:', newSubscription);
    res.status(201).json(newSubscription);
  } catch (error) {
    console.error('❌ Error creating subscription:', error);
    res.status(500).json({ error: 'Failed to create calendar subscription' });
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
    await updateCalendarSync(subscriptionId, new Date(), req.userId, req.supabase);
    
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
        await updateCalendarSync(subscription.id, new Date(), req.userId, req.supabase);
        
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
  
  syncInterval = setInterval(async () => {
    try {
      console.log('🔄 Auto-sync starting...');
      
      // Fetch all subscriptions from all users that have sync enabled
      const allSubscriptions = await getAllCalendarSubscriptionsForAutoSync();
      
      // Group subscriptions by user to process them securely
      const subscriptionsByUser = allSubscriptions.reduce((acc, sub) => {
        if (!sub.user_id) {
          console.warn(`⚠️ Skipping subscription ${sub.id} with no user_id`);
          return acc;
        }
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
            
            // Import events for this specific user
            const result = await importEventsFromSubscription(subscription.id, eventsData, userId, null);
            // Update sync timestamp for this specific user's subscription
            await updateCalendarSync(subscription.id, new Date(), userId);
            
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
    
    // Create calendar context for AI
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
    
    // Generate context hash for caching (simple hash of event count and day)
    const contextHash = `${now.toDateString()}-${recentEvents.length}-${todayEvents.length}`;
    const cacheKey = generateCacheKey(query, req.userId, contextHash);
    
    // Check cache first for non-time-sensitive queries
    const isTimeQuery = /\b(now|current|today|time|when|schedule|free|busy|available)\b/i.test(query);
    if (!isTimeQuery && responseCache.has(cacheKey)) {
      const cached = responseCache.get(cacheKey);
      console.log('📝 Serving cached response for query:', query);
      return res.json({ 
        response: cached.response, 
        context: calendarContext,
        cached: true
      });
    }
    
    // Use OpenAI API for intelligent calendar assistance
    const requestBody = {
      model: 'gpt-4o-mini',
      max_tokens: 1000,
      messages: [{
        role: 'system',
        content: 'You are Tilly, a helpful calendar assistant. Respond concisely and always include the requested JSON format at the end of your response when handling scheduling requests.'
      }, {
        role: 'user',
        content: createCalendarPrompt(query, calendarContext)
      }],
      temperature: 0.3
    };

    console.log('🔍 DEBUG: Events being sent to OpenAI:');
    console.log('📅 Today events:', todayEvents.length, todayEvents.map(e => `${e.title} (${e.start} to ${e.end})`));
    console.log('📅 Tomorrow events:', tomorrowEvents.length, tomorrowEvents.map(e => `${e.title} (${e.start} to ${e.end})`));
    console.log('📅 Upcoming events (day after tomorrow+):', upcomingEvents.length, upcomingEvents.map(e => `${e.title} (${e.start} to ${e.end})`));
    console.log('🔍 DEBUG: Total events in 7-day range:', recentEvents.length);
    console.log('🔍 DEBUG: API Key present:', !!process.env.OPENAI_API_KEY);
    console.log('🔍 DEBUG: API Key length:', process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.length : 0);

    // Retry logic for handling API overload
    const makeOpenAIRequest = async (retryCount = 0, maxRetries = 3) => {
      const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff: 1s, 2s, 4s
      
      if (retryCount > 0) {
        console.log(`🔄 Retrying OpenAI API request (attempt ${retryCount + 1}/${maxRetries + 1}) after ${delay}ms delay...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify(requestBody),
        timeout: 30000 // 30 second timeout
      });

      console.log('🔍 DEBUG: OpenAI API response status:', response.status);
      console.log('🔍 DEBUG: OpenAI API response headers:', Object.fromEntries(response.headers.entries()));

      // Handle rate limit errors with retry
      if (response.status === 429 && retryCount < maxRetries) {
        const errorText = await response.text();
        console.log(`⚠️ OpenAI API rate limited (429), retrying... Response: ${errorText}`);
        return makeOpenAIRequest(retryCount + 1, maxRetries);
      }

      return response;
    };

    const response = await makeOpenAIRequest();

    if (!response.ok) {
      const errorText = await response.text();
      console.error('🚨 OpenAI API Error Response:', errorText);
      
      // If OpenAI API is rate limited after all retries, provide a graceful fallback
      if (response.status === 429) {
        console.log('📋 Providing fallback response due to OpenAI API rate limit');
        const fallbackResponse = createFallbackResponse(query, calendarContext);
        res.json({ response: fallbackResponse, context: calendarContext });
        return;
      }
      
      throw new Error(`OpenAI API request failed: ${response.status} ${response.statusText}`);
    }

    const openaiData = await response.json();
    const openaiResponse = openaiData.choices[0].message.content;
    
    // Try to extract JSON from the response (could be mixed with text)
    const jsonMatch = openaiResponse.match(/\{[\s\S]*"type":\s*"(event_suggestion|event_rearrangement|multiple_actions)"[\s\S]*\}/);
    
    if (jsonMatch) {
      try {
        const actionData = JSON.parse(jsonMatch[0]);
        if (actionData.type === 'event_suggestion' || actionData.type === 'event_rearrangement' || actionData.type === 'multiple_actions') {
          // Validate the action data before sending to frontend
          const validationResult = validateActionData(actionData, calendarContext);
          if (!validationResult.valid) {
            console.error('🚨 OpenAI response validation failed:', validationResult.error);
            console.error('🚨 Original OpenAI response:', openaiResponse);
            // Send error response back to user explaining the issue
            res.status(400).json({ 
              error: 'Invalid calendar response detected',
              details: validationResult.error,
              suggestion: 'Please try rephrasing your request or ask for a different time slot.'
            });
            return;
          } else {
            // Extract the text part (everything before the JSON)
            const textPart = openaiResponse.replace(jsonMatch[0], '').trim();
            
            const responseData = {
              type: actionData.type,
              message: textPart || actionData.message,
              eventData: actionData.eventData,
              rearrangements: actionData.rearrangements || null,
              actions: actionData.actions || null
            };
            
            // Cache non-time-sensitive responses
            if (!isTimeQuery) {
              responseCache.set(cacheKey, {
                response: responseData,
                timestamp: Date.now()
              });
            }
            
            // Return both the conversational text and the structured action data
            res.json({ 
              response: responseData, 
              context: calendarContext 
            });
            return;
          }
        }
      } catch (e) {
        // JSON parsing failed, treat as regular text
        console.warn('Failed to parse JSON from OpenAI response:', e.message);
        console.warn('Original OpenAI response:', openaiResponse);
      }
    }
    
    // Cache non-time-sensitive responses
    if (!isTimeQuery) {
      responseCache.set(cacheKey, {
        response: openaiResponse,
        timestamp: Date.now()
      });
    }
    
    // Regular text response
    res.json({ response: openaiResponse, context: calendarContext });
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

// Validate AI's action data to prevent time parsing issues
function validateActionData(actionData, context = null) {
  try {
    console.log('🔍 Validating AI action data:', actionData);
    
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
          return { valid: false, error: `Event conflict detected! The proposed time ${start} to ${end} conflicts with existing events: ${conflictList}. AI should have suggested a multiple_actions solution to resolve this conflict.` };
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

// Create a well-engineered prompt for AI
function createCalendarPrompt(query, context) {
  // Group events by day for better context
  const weekEvents = context.recentEvents || [];
  const eventsByDay = {};
  
  // Initialize days of the week
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    const dayKey = date.toDateString();
    eventsByDay[dayKey] = [];
  }
  
  // Organize events by day
  weekEvents.forEach(event => {
    const eventDate = new Date(event.start);
    const dayKey = eventDate.toDateString();
    if (eventsByDay[dayKey] !== undefined) {
      eventsByDay[dayKey].push(event);
    }
  });

  // Build weekly context string
  let weeklyContext = '';
  Object.entries(eventsByDay).forEach(([dayKey, events], index) => {
    const date = new Date(dayKey);
    const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
    const dayDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    
    if (events.length > 0) {
      const eventsText = events.map(e => {
        const startTime = utcToLocal(e.start, '24h', context.timezone);
        const endTime = utcToLocal(e.end, '24h', context.timezone);
        return `[ID:${e.id}] ${e.title} ${startTime}-${endTime}`;
      }).join('; ');
      weeklyContext += `${dayName} ${dayDate}: ${eventsText}\n`;
    } else {
      weeklyContext += `${dayName} ${dayDate}: Free\n`;
    }
  });

  return `You are Tilly, a calendar assistant. Time: ${context.currentLocalTime} (${context.timezone}).

WEEK SCHEDULE:
${weeklyContext.trim()}

Query: "${query}"

For scheduling: Check conflicts using event IDs and times above. If conflict found, use "multiple_actions" to rearrange existing events. Otherwise use "event_suggestion".
Be concise. End with JSON:

No conflict:
{
  "type": "event_suggestion",
  "message": "Add to calendar?",
  "eventData": {"title": "Title", "start": "2025-05-27T18:00:00", "end": "2025-05-27T19:00:00"}
}

With conflict:
{
  "type": "multiple_actions",
  "message": "Rearrange?",
  "actions": [
    {"type": "event_rearrangement", "rearrangements": [{"eventId": 123, "currentTitle": "Old Event", "newStart": "2025-05-27T13:00:00", "newEnd": "2025-05-27T14:00:00"}]},
    {"type": "event_suggestion", "eventData": {"title": "New Event", "start": "2025-05-27T18:00:00", "end": "2025-05-27T19:00:00"}}
  ]
}`;
}

// Create a fallback response when OpenAI API is unavailable
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

// ============================================
// FRIEND MANAGEMENT API ENDPOINTS
// ============================================

// Get current user's profile (creates one if it doesn't exist)
app.get('/api/users/profile', authenticateUser, async (req, res) => {
  try {
    let profile = await getUserProfile(req.userId, req.supabase);
    
    // If profile doesn't exist, create one with default values
    if (!profile) {
      const { data: { user } } = await req.supabase.auth.getUser();
      
      const defaultProfile = {
        id: req.userId,
        display_name: user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'User',
        email: user?.email,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        allow_friend_requests: true,
        public_availability: false,
        default_meeting_duration: 30
      };
      
      // Create the profile
      await req.supabase
        .from('user_profiles')
        .insert(defaultProfile);
      
      profile = await getUserProfile(req.userId, req.supabase);
    }
    
    res.json(profile);
  } catch (error) {
    console.error('❌ Error fetching/creating user profile:', error);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

// Update current user's profile
app.put('/api/users/profile', authenticateUser, async (req, res) => {
  try {
    const { display_name, bio, timezone, allow_friend_requests, public_availability, default_meeting_duration } = req.body;
    
    const profileData = {};
    if (display_name !== undefined) profileData.display_name = display_name;
    if (bio !== undefined) profileData.bio = bio;
    if (timezone !== undefined) profileData.timezone = timezone;
    if (allow_friend_requests !== undefined) profileData.allow_friend_requests = allow_friend_requests;
    if (public_availability !== undefined) profileData.public_availability = public_availability;
    if (default_meeting_duration !== undefined) profileData.default_meeting_duration = default_meeting_duration;

    const updatedProfile = await updateUserProfile(req.userId, profileData, req.supabase);
    res.json(updatedProfile);
  } catch (error) {
    console.error('❌ Error updating user profile:', error);
    res.status(500).json({ error: 'Failed to update user profile' });
  }
});

// Search users
app.get('/api/users/search', authenticateUser, async (req, res) => {
  try {
    const { q: query } = req.query;
    
    if (!query || query.trim().length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }

    const users = await searchUsers(query.trim(), req.userId, req.supabase);
    res.json(users);
  } catch (error) {
    console.error('❌ Error searching users:', error);
    res.status(500).json({ error: 'Failed to search users' });
  }
});

// Send friend request
app.post('/api/friends/request', authenticateUser, async (req, res) => {
  try {
    const { addressee_id } = req.body;
    
    if (!addressee_id) {
      return res.status(400).json({ error: 'addressee_id is required' });
    }

    if (addressee_id === req.userId) {
      return res.status(400).json({ error: 'Cannot send friend request to yourself' });
    }

    const friendRequest = await sendFriendRequest(req.userId, addressee_id, req.supabase);
    res.json({ success: true, request: friendRequest });
  } catch (error) {
    console.error('❌ Error sending friend request:', error);
    if (error.message.includes('already exists')) {
      res.status(409).json({ error: 'Friend request already exists or users are already friends' });
    } else {
      res.status(500).json({ error: 'Failed to send friend request' });
    }
  }
});

// Get friend requests (sent and received)
app.get('/api/friends/requests', authenticateUser, async (req, res) => {
  try {
    const requests = await getFriendRequests(req.userId, req.supabase);
    res.json(requests);
  } catch (error) {
    console.error('❌ Error fetching friend requests:', error);
    res.status(500).json({ error: 'Failed to fetch friend requests' });
  }
});

// Accept friend request
app.post('/api/friends/requests/:id/accept', authenticateUser, async (req, res) => {
  try {
    const requestId = parseInt(req.params.id);
    
    if (isNaN(requestId)) {
      return res.status(400).json({ error: 'Invalid request ID' });
    }

    const result = await acceptFriendRequest(requestId, req.userId, req.supabase);
    res.json({ success: true, result });
  } catch (error) {
    console.error('❌ Error accepting friend request:', error);
    res.status(500).json({ error: 'Failed to accept friend request' });
  }
});

// Decline friend request
app.post('/api/friends/requests/:id/decline', authenticateUser, async (req, res) => {
  try {
    const requestId = parseInt(req.params.id);
    
    if (isNaN(requestId)) {
      return res.status(400).json({ error: 'Invalid request ID' });
    }

    const result = await declineFriendRequest(requestId, req.userId, req.supabase);
    res.json({ success: true, request: result });
  } catch (error) {
    console.error('❌ Error declining friend request:', error);
    res.status(500).json({ error: 'Failed to decline friend request' });
  }
});

// Get friends list
app.get('/api/friends', authenticateUser, async (req, res) => {
  try {
    const friends = await getFriends(req.userId, req.supabase);
    res.json(friends);
  } catch (error) {
    console.error('❌ Error fetching friends:', error);
    res.status(500).json({ error: 'Failed to fetch friends' });
  }
});

// Remove friend
app.delete('/api/friends/:id', authenticateUser, async (req, res) => {
  try {
    const friendshipId = parseInt(req.params.id);
    
    if (isNaN(friendshipId)) {
      return res.status(400).json({ error: 'Invalid friendship ID' });
    }

    const result = await removeFriend(friendshipId, req.userId, req.supabase);
    res.json(result);
  } catch (error) {
    console.error('❌ Error removing friend:', error);
    res.status(500).json({ error: 'Failed to remove friend' });
  }
});

// Block user
app.post('/api/users/:id/block', authenticateUser, async (req, res) => {
  try {
    const addresseeId = req.params.id;
    
    if (addresseeId === req.userId) {
      return res.status(400).json({ error: 'Cannot block yourself' });
    }

    const result = await blockUser(req.userId, addresseeId, req.supabase);
    res.json({ success: true, block: result });
  } catch (error) {
    console.error('❌ Error blocking user:', error);
    res.status(500).json({ error: 'Failed to block user' });
  }
});

// ============================================
// MEETING REQUEST API ENDPOINTS
// ============================================

// Create meeting request
app.post('/api/meetings/request', authenticateUser, async (req, res) => {
  try {
    const { friend_id, title, message, duration_minutes, proposed_times } = req.body;
    
    if (!friend_id || !title || !proposed_times || !Array.isArray(proposed_times)) {
      return res.status(400).json({ 
        error: 'friend_id, title, and proposed_times array are required' 
      });
    }

    // Verify users are friends
    const friends = await getFriends(req.userId, req.supabase);
    const isFriend = friends.some(f => f.friend.id === friend_id);
    
    if (!isFriend) {
      return res.status(403).json({ error: 'Can only request meetings with friends' });
    }

    const requestData = {
      requester_id: req.userId,
      friend_id,
      title: title.trim(),
      message: message?.trim() || null,
      duration_minutes: duration_minutes || 30,
      proposed_times,
      status: 'pending'
    };

    const meetingRequest = await createMeetingRequest(requestData, req.supabase);
    res.json({ success: true, request: meetingRequest });
  } catch (error) {
    console.error('❌ Error creating meeting request:', error);
    res.status(500).json({ error: 'Failed to create meeting request' });
  }
});

// Get meeting requests (sent and received)
app.get('/api/meetings/requests', authenticateUser, async (req, res) => {
  try {
    const requests = await getMeetingRequests(req.userId, req.supabase);
    res.json(requests);
  } catch (error) {
    console.error('❌ Error fetching meeting requests:', error);
    res.status(500).json({ error: 'Failed to fetch meeting requests' });
  }
});

// Respond to meeting request (accept/decline)
app.post('/api/meetings/requests/:id/respond', authenticateUser, async (req, res) => {
  try {
    const requestId = parseInt(req.params.id);
    const { response, selected_time } = req.body;
    
    if (isNaN(requestId)) {
      return res.status(400).json({ error: 'Invalid request ID' });
    }

    if (!['accepted', 'declined'].includes(response)) {
      return res.status(400).json({ error: 'Response must be "accepted" or "declined"' });
    }

    if (response === 'accepted' && !selected_time) {
      return res.status(400).json({ error: 'selected_time is required when accepting' });
    }

    const result = await respondToMeetingRequest(
      requestId, 
      response, 
      response === 'accepted' ? selected_time : null, 
      req.userId, 
      req.supabase
    );

    // If accepted, create calendar events for both users
    if (response === 'accepted') {
      try {
        // Create event for the requester
        const requesterEvent = await createEvent({
          title: result.title,
          start: new Date(selected_time),
          end: new Date(new Date(selected_time).getTime() + (result.duration_minutes * 60000)),
          color: '#4A7C2A', // Green for meeting events
          meeting_request_id: requestId
        }, result.requester_id, req.supabase);

        // Create event for the friend (current user)
        const friendEvent = await createEvent({
          title: result.title,
          start: new Date(selected_time),
          end: new Date(new Date(selected_time).getTime() + (result.duration_minutes * 60000)),
          color: '#4A7C2A', // Green for meeting events
          meeting_request_id: requestId
        }, req.userId, req.supabase);

        res.json({ 
          success: true, 
          request: result, 
          events: { requester: requesterEvent, friend: friendEvent }
        });
      } catch (eventError) {
        console.error('❌ Error creating calendar events:', eventError);
        // Meeting request was accepted but calendar events failed
        res.json({ 
          success: true, 
          request: result,
          warning: 'Meeting accepted but calendar events could not be created'
        });
      }
    } else {
      res.json({ success: true, request: result });
    }
  } catch (error) {
    console.error('❌ Error responding to meeting request:', error);
    res.status(500).json({ error: 'Failed to respond to meeting request' });
  }
});

// Cancel meeting request
app.post('/api/meetings/requests/:id/cancel', authenticateUser, async (req, res) => {
  try {
    const requestId = parseInt(req.params.id);
    
    if (isNaN(requestId)) {
      return res.status(400).json({ error: 'Invalid request ID' });
    }

    const result = await cancelMeetingRequest(requestId, req.userId, req.supabase);
    res.json({ success: true, request: result });
  } catch (error) {
    console.error('❌ Error cancelling meeting request:', error);
    res.status(500).json({ error: 'Failed to cancel meeting request' });
  }
});

// Find mutual free time with a friend
app.post('/api/availability/find-mutual-time', authenticateUser, async (req, res) => {
  try {
    const { friend_id, duration, start_date, end_date } = req.body;
    
    if (!friend_id || !duration || !start_date || !end_date) {
      return res.status(400).json({ 
        error: 'friend_id, duration, start_date, and end_date are required' 
      });
    }

    // Verify users are friends
    const friends = await getFriends(req.userId, req.supabase);
    const isFriend = friends.some(f => f.friend.id === friend_id);
    
    if (!isFriend) {
      return res.status(403).json({ error: 'Can only check availability with friends' });
    }

    const freeSlots = await findMutualFreeTime(
      req.userId, 
      friend_id, 
      duration, 
      start_date, 
      end_date, 
      req.supabase
    );

    res.json({ success: true, free_slots: freeSlots });
  } catch (error) {
    console.error('❌ Error finding mutual free time:', error);
    res.status(500).json({ error: 'Failed to find mutual free time' });
  }
});

// Get/Update availability sharing settings
app.get('/api/availability/sharing/:friend_id', authenticateUser, async (req, res) => {
  try {
    const friendId = req.params.friend_id;
    const settings = await getAvailabilitySharing(req.userId, friendId, req.supabase);
    res.json(settings || { share_level: 'busy_free' }); // Default level
  } catch (error) {
    console.error('❌ Error fetching availability sharing:', error);
    res.status(500).json({ error: 'Failed to fetch availability sharing settings' });
  }
});

app.put('/api/availability/sharing/:friend_id', authenticateUser, async (req, res) => {
  try {
    const friendId = req.params.friend_id;
    const { share_level } = req.body;
    
    if (!['none', 'busy_free', 'basic_details', 'full_details'].includes(share_level)) {
      return res.status(400).json({ error: 'Invalid share_level' });
    }

    const settings = await updateAvailabilitySharing(req.userId, friendId, share_level, req.supabase);
    res.json({ success: true, settings });
  } catch (error) {
    console.error('❌ Error updating availability sharing:', error);
    res.status(500).json({ error: 'Failed to update availability sharing settings' });
  }
});

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

if (!process.env.OPENAI_API_KEY) {
  console.warn('⚠️  Missing OPENAI_API_KEY - AI features will not work');
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