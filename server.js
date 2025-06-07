const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const ical = require('ical');
const multer = require('multer');
const nodemailer = require('nodemailer');
require('dotenv').config();

// Import database functions
const {
  initDatabase,
  getAllEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  getEventsByDateRange,
  getEventsForPeriod,
  getCalendarStats,
  closeDatabase,
  importEvents,
  addCalendarSubscription,
  getCalendarSubscriptions,
  updateCalendarSync,
  deleteCalendarSubscription,
  importEventsFromSubscription
} = require('./database');

const app = express();
const PORT = process.env.PORT || 3001;

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
    fileSize: 5 * 1024 * 1024 // 5MB limit
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
      body: JSON.stringify(req.body),
      timeout: 30000 // 30 second timeout
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



// POST /api/events/import - Import events from iCal file
app.post('/api/events/import', upload.single('icalFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No iCal file provided' });
    }

    console.log('Processing iCal import:', req.file.originalname);
    
    // Parse the iCal file
    const icalData = req.file.buffer.toString('utf8');
    const parsedEvents = ical.parseICS(icalData);
    
    if (!parsedEvents || Object.keys(parsedEvents).length === 0) {
      return res.status(400).json({ error: 'No valid events found in the iCal file' });
    }

    // Convert iCal events to our format
    const eventsToImport = [];
    
    for (const [key, event] of Object.entries(parsedEvents)) {
      // Skip non-event entries (like VTIMEZONE)
      if (event.type !== 'VEVENT') continue;
      
      try {
        // Extract event data
        const title = event.summary || 'Untitled Event';
        const start = event.start ? new Date(event.start) : null;
        const end = event.end ? new Date(event.end) : null;
        
        // Validate dates
        if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime())) {
          console.warn(`Skipping event with invalid dates: ${title}`);
          continue;
        }
        
        if (start >= end) {
          console.warn(`Skipping event with invalid time range: ${title}`);
          continue;
        }
        
        // Handle recurring events (basic support)
        if (event.rrule) {
          console.log(`Note: Recurring event "${title}" imported as single occurrence`);
        }
        
        eventsToImport.push({
          title,
          start,
          end,
          color: '#10b981' // Use green color for imported events
        });
        
      } catch (eventError) {
        console.error(`Error processing event ${key}:`, eventError);
      }
    }
    
    if (eventsToImport.length === 0) {
      return res.status(400).json({ 
        error: 'No valid events could be extracted from the iCal file' 
      });
    }
    
    console.log(`Importing ${eventsToImport.length} events...`);
    
    // Import events to database
    const result = await importEvents(eventsToImport);
    
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
app.post('/api/events/import-url', upload.none(), async (req, res) => {
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

    const icalData = await response.text();
    const parsedEvents = ical.parseICS(icalData);

    const eventsData = Object.values(parsedEvents)
      .filter(event => event.type === 'VEVENT')
      .map(event => {
        return {
          title: event.summary || 'Untitled Event',
          start: new Date(event.start),
          end: new Date(event.end),
          color: '#3b82f6', // Default blue for URL imports
          uid: event.uid
        };
      });

    let result;
    let subscriptionId = null;

    if (subscribe && name) {
      // Create subscription and import events
      try {
        const subscription = await addCalendarSubscription({ 
          name: name.trim(), 
          url, 
          color: '#3b82f6' 
        });
        subscriptionId = subscription.id;
        
        result = await importEventsFromSubscription(subscriptionId, eventsData);
        await updateCalendarSync(subscriptionId);
        
        console.log(`📅 Subscription created: ${name} (${result.successful}/${result.total} events)`);
        res.json({
          ...result,
          subscription: subscription,
          message: `Subscribed to calendar "${name}" and imported ${result.successful} events`
        });
      } catch (subscriptionError) {
        if (subscriptionError.message.includes('already subscribed')) {
          // URL already subscribed, just sync it
          const subscriptions = await getCalendarSubscriptions();
          const existingSubscription = subscriptions.find(sub => sub.url === url);
          
          if (existingSubscription) {
            result = await importEventsFromSubscription(existingSubscription.id, eventsData);
            await updateCalendarSync(existingSubscription.id);
            
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
      result = await importEvents(eventsData);
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
app.get('/api/calendar-subscriptions', async (req, res) => {
  try {
    const subscriptions = await getCalendarSubscriptions();
    res.json(subscriptions);
  } catch (error) {
    console.error('❌ Error fetching subscriptions:', error);
    res.status(500).json({ error: 'Failed to fetch calendar subscriptions' });
  }
});

// Delete calendar subscription
app.delete('/api/calendar-subscriptions/:id', async (req, res) => {
  try {
    const subscriptionId = parseInt(req.params.id);
    await deleteCalendarSubscription(subscriptionId);
    res.json({ success: true, message: 'Calendar subscription deleted' });
  } catch (error) {
    console.error('❌ Error deleting subscription:', error);
    res.status(500).json({ error: 'Failed to delete calendar subscription' });
  }
});

// Sync specific calendar subscription
app.post('/api/calendar-subscriptions/:id/sync', async (req, res) => {
  try {
    const subscriptionId = parseInt(req.params.id);
    const subscriptions = await getCalendarSubscriptions();
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

    const icalData = await response.text();
    const parsedEvents = ical.parseICS(icalData);

    const eventsData = Object.values(parsedEvents)
      .filter(event => event.type === 'VEVENT')
      .map(event => {
        return {
          title: event.summary || 'Untitled Event',
          start: new Date(event.start),
          end: new Date(event.end),
          color: subscription.color,
          uid: event.uid
        };
      });

    const result = await importEventsFromSubscription(subscriptionId, eventsData);
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
app.post('/api/calendar-subscriptions/sync-all', async (req, res) => {
  try {
    const subscriptions = await getCalendarSubscriptions();
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

        const icalData = await response.text();
        const parsedEvents = ical.parseICS(icalData);

        const eventsData = Object.values(parsedEvents)
          .filter(event => event.type === 'VEVENT')
          .map(event => {
            return {
              title: event.summary || 'Untitled Event',
              start: new Date(event.start),
              end: new Date(event.end),
              color: subscription.color,
              uid: event.uid
            };
          });

        const result = await importEventsFromSubscription(subscription.id, eventsData);
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
  
  syncInterval = setInterval(async () => {
    try {
      console.log('🔄 Auto-sync starting...');
      const response = await fetch('http://localhost:3001/api/calendar-subscriptions/sync-all', {
        method: 'POST'
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log(`✅ Auto-sync complete: ${result.summary.message}`);
      } else {
        console.error('❌ Auto-sync failed:', response.statusText);
      }
    } catch (error) {
      console.error('❌ Auto-sync error:', error.message);
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
    const allEvents = await getAllEvents();
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
app.post('/api/calendar/query', async (req, res) => {
  try {
    const { query, chatHistory = [] } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }
    
    // Get events for today + next 7 days (limited context to avoid rate limiting)
    const currentTime = new Date();
    const today = new Date(currentTime.getFullYear(), currentTime.getMonth(), currentTime.getDate());
    const next7Days = new Date(today.getTime() + (7 * 24 * 60 * 60 * 1000));
    
    const recentEvents = await getEventsByDateRange(today, next7Days);
    const todayEvents = await getEventsForPeriod('today');
    const tomorrowEvents = await getEventsForPeriod('tomorrow');
    const upcomingEvents = recentEvents.slice(0, 20); // Limit to 20 most recent
    const stats = await getCalendarStats('this_week');
    
    // Create calendar context for Claude
    const now = currentTime;
    const calendarContext = {
      currentTime: now.toISOString(),
      currentDate: now.toLocaleDateString(),
      currentDay: now.toLocaleDateString('en-US', { weekday: 'long' }),
      currentLocalTime: now.toLocaleString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
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
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: createCalendarPrompt(query, calendarContext)
      }]
    };

    console.log('🔍 DEBUG: Events being sent to Claude:');
    console.log('📅 Today events:', todayEvents.length, todayEvents.map(e => `${e.title} (${e.start} to ${e.end})`));
    console.log('📅 Tomorrow events:', tomorrowEvents.length, tomorrowEvents.map(e => `${e.title} (${e.start} to ${e.end})`));
    console.log('📅 Recent events:', recentEvents.length, recentEvents.map(e => `${e.title} (${e.start} to ${e.end})`));
    console.log('🔍 DEBUG: Sending Claude API request with body:', JSON.stringify(requestBody, null, 2));
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
- Total events in next 7 days: ${context.totalEvents}${chatHistorySection}

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