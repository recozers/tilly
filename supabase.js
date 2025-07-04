const { createClient } = require('@supabase/supabase-js')

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

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables. Please set SUPABASE_URL and SUPABASE_ANON_KEY')
}

// Create Supabase client
const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Database functions using Supabase

// Get all events for a specific user
const getAllEvents = async (userId, authenticatedSupabase = null) => {
  if (!userId) throw new Error('SECURITY: userId is required for getAllEvents.');
  try {
    const client = authenticatedSupabase || supabase;
    const { data, error } = await client
      .from('events')
      .select('*')
      .eq('user_id', userId) // HARDENED: Always filter by user_id
      .order('start_time', { ascending: true });

    if (error) throw error;

    // Convert to frontend format
    return data.map(row => ({
      id: row.id,
      title: row.title,
      start: new Date(row.start_time),
      end: new Date(row.end_time),
      color: row.color
    }));
  } catch (error) {
    console.error('Error fetching events:', error);
    throw error;
  }
};

// Get a single event by ID - more efficient than loading all events
const getEventById = async (id, userId, authenticatedSupabase = null) => {
  if (!userId) throw new Error('SECURITY: userId is required for getEventById.');
  try {
    const client = authenticatedSupabase || supabase;
    const { data, error } = await client
      .from('events')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId) // HARDENED: Always filter by user_id
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Record not found
      throw error;
    }

    // Convert to frontend format
    return {
      id: data.id,
      title: data.title,
      start: new Date(data.start_time),
      end: new Date(data.end_time),
      color: data.color
    };
  } catch (error) {
    console.error('Error fetching event by ID:', error);
    throw error;
  }
};

// Create a new event
const createEvent = async (eventData, userId, authenticatedSupabase = null) => {
  if (!userId) throw new Error('SECURITY: userId is required for createEvent.');
  try {
    const { title, start, end, color = getRandomEventColor() } = eventData;
    const client = authenticatedSupabase || supabase;
    
    const insertData = {
      title,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      color,
      user_id: userId // HARDENED: user_id is now guaranteed
    };
    
    const { data, error } = await client
      .from('events')
      .insert([insertData])
      .select()
      .single();

    if (error) throw error;

    return {
      id: data.id,
      title: data.title,
      start: new Date(data.start_time),
      end: new Date(data.end_time),
      color: data.color
    };
  } catch (error) {
    console.error('Error creating event:', error);
    throw error;
  }
};

// Update an existing event
const updateEvent = async (id, eventData, userId, authenticatedSupabase = null) => {
  if (!userId) throw new Error('SECURITY: userId is required for updateEvent.');
  try {
    const { title, start, end, color } = eventData;
    const supabaseClient = authenticatedSupabase || supabase;
    
    const { data, error } = await supabaseClient
      .from('events')
      .update({
        title,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        color,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('user_id', userId) // HARDENED: Always filter by user_id
      .select()
      .single();

    if (error) throw error;

    return {
      id: data.id,
      title: data.title,
      start: new Date(data.start_time),
      end: new Date(data.end_time),
      color: data.color
    };
  } catch (error) {
    console.error('Error updating event:', error);
    throw error;
  }
};

// Delete an event
const deleteEvent = async (id, userId, authenticatedSupabase = null) => {
  if (!userId) throw new Error('SECURITY: userId is required for deleteEvent.');
  try {
    const supabaseClient = authenticatedSupabase || supabase;
    const { error } = await supabaseClient
      .from('events')
      .delete()
      .eq('id', id)
      .eq('user_id', userId); // HARDENED: Always filter by user_id

    if (error) throw error;

    return { deletedId: id };
  } catch (error) {
    console.error('Error deleting event:', error);
    throw error;
  }
};

// Get events within a date range
const getEventsByDateRange = async (startDate, endDate, userId, authenticatedSupabase = null) => {
  if (!userId) throw new Error('SECURITY: userId is required for getEventsByDateRange.');
  try {
    const client = authenticatedSupabase || supabase;
    const { data, error } = await client
      .from('events')
      .select('*')
      .eq('user_id', userId) // HARDENED: Always filter by user_id
      .gte('start_time', startDate.toISOString())
      .lte('start_time', endDate.toISOString())
      .order('start_time', { ascending: true });

    if (error) throw error;

    return data.map(row => ({
      id: row.id,
      title: row.title,
      start: new Date(row.start_time),
      end: new Date(row.end_time),
      color: row.color
    }));
  } catch (error) {
    console.error('Error fetching events by date range:', error);
    throw error;
  }
};

// Search events by title
const searchEvents = async (searchTerm, timeframe = null, userId, authenticatedSupabase = null) => {
  if (!userId) throw new Error('SECURITY: userId is required for searchEvents.');
  try {
    const client = authenticatedSupabase || supabase;
    let query = client
      .from('events')
      .select('*')
      .eq('user_id', userId) // HARDENED: Always filter by user_id
      .ilike('title', `%${searchTerm}%`);
      
    if (timeframe) {
      query = query
        .gte('start_time', timeframe.start.toISOString())
        .lte('start_time', timeframe.end.toISOString());
    }

    const { data, error } = await query.order('start_time', { ascending: true });

    if (error) throw error;

    return data.map(row => ({
      id: row.id,
      title: row.title,
      start: new Date(row.start_time),
      end: new Date(row.end_time),
      color: row.color
    }));
  } catch (error) {
    console.error('Error searching events:', error);
    throw error;
  }
};

// Get upcoming events
const getUpcomingEvents = async (limit = 10, userId, authenticatedSupabase = null) => {
  if (!userId) throw new Error('SECURITY: userId is required for getUpcomingEvents.');
  try {
    const now = new Date();
    const client = authenticatedSupabase || supabase;
    const { data, error } = await client
      .from('events')
      .select('*')
      .eq('user_id', userId) // HARDENED: Always filter by user_id
      .gte('start_time', now.toISOString())
      .order('start_time', { ascending: true })
      .limit(limit);

    if (error) throw error;

    return data.map(row => ({
      id: row.id,
      title: row.title,
      start: new Date(row.start_time),
      end: new Date(row.end_time),
      color: row.color
    }));
  } catch (error) {
    console.error('Error fetching upcoming events:', error);
    throw error;
  }
};

// Get events within a specific period (e.g., 'today', 'this_week')
const getEventsForPeriod = async (period, userId, authenticatedSupabase = null) => {
  if (!userId) throw new Error('SECURITY: userId is required for getEventsForPeriod.');
  try {
    let startDate, endDate;
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    switch (period) {
      case 'today':
        startDate = now;
        endDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        break;
      case 'tomorrow':
        startDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        endDate = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
        break;
      case 'this_week':
        const dayOfWeek = now.getDay();
        const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysToMonday);
        endDate = new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000);
        break;
      default:
        throw new Error(`Unsupported period: ${period}`);
    }

    return await getEventsByDateRange(startDate, endDate, userId, authenticatedSupabase);
  } catch (error) {
    console.error('Error fetching events for period:', error);
    throw error;
  }
};

// Calendar subscription functions
const addCalendarSubscription = async (subscriptionData, userId, authenticatedSupabase = null) => {
  if (!userId) throw new Error('SECURITY: userId is required for addCalendarSubscription.');
  try {
    const { name, url, color = '#4A7C2A' } = subscriptionData;
    const supabaseClient = authenticatedSupabase || supabase;

    const { data, error } = await supabaseClient
      .from('calendar_subscriptions')
      .insert([{ name, url, color, user_id: userId }]) // HARDENED: user_id is now guaranteed
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error adding calendar subscription:', error);
    throw error;
  }
};

const getCalendarSubscriptions = async (userId, authenticatedSupabase = null) => {
  if (!userId) throw new Error('SECURITY: userId is required for getCalendarSubscriptions.');
  try {
    const supabaseClient = authenticatedSupabase || supabase;
    const { data, error } = await supabaseClient
      .from('calendar_subscriptions')
      .select('*')
      .eq('user_id', userId) // HARDENED: Always filter by user_id
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching calendar subscriptions:', error);
    throw error;
  }
};

// ADMIN FUNCTION: Get all calendar subscriptions across all users (for auto-sync only)
const getAllCalendarSubscriptionsForAutoSync = async () => {
  try {
    const { data, error } = await supabase
      .from('calendar_subscriptions')
      .select('*')
      .eq('sync_enabled', true) // Only get subscriptions that have sync enabled
      .order('user_id', { ascending: true });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching all calendar subscriptions for auto-sync:', error);
    throw error;
  }
};

const updateCalendarSync = async (subscriptionId, lastSync = new Date(), userId, authenticatedSupabase = null) => {
  if (!userId) throw new Error('SECURITY: userId is required for updateCalendarSync.');
  try {
    const supabaseClient = authenticatedSupabase || supabase;
    const { error } = await supabaseClient
      .from('calendar_subscriptions')
      .update({ last_sync: lastSync.toISOString() })
      .eq('id', subscriptionId)
      .eq('user_id', userId); // HARDENED: Always filter by user_id

    if (error) throw error;
  } catch (error) {
    console.error('Error updating calendar sync:', error);
    throw error;
  }
};

const deleteCalendarSubscription = async (subscriptionId, userId, authenticatedSupabase = null) => {
  if (!userId) throw new Error('SECURITY: userId is required for deleteCalendarSubscription.');
  try {
    const supabaseClient = authenticatedSupabase || supabase;
    
    // HARDENED: Delete events ensuring they belong to the user
    await supabaseClient
      .from('events')
      .delete()
      .eq('source_calendar_id', subscriptionId)
      .eq('user_id', userId);

    // HARDENED: Then delete the subscription, ensuring it belongs to the user
    const { error } = await supabaseClient
      .from('calendar_subscriptions')
      .delete()
      .eq('id', subscriptionId)
      .eq('user_id', userId);

    if (error) throw error;
  } catch (error)
  {
    console.error('Error deleting calendar subscription:', error);
    throw error;
  }
};

// Import events (for one-time imports)
const importEvents = async (eventsData, userId, authenticatedSupabase = null) => {
  if (!userId) throw new Error('SECURITY: userId is required for importEvents.');
  try {
    const successful = [];
    const failed = [];
    const errors = [];

    for (const eventData of eventsData) {
      try {
        // createEvent is already hardened, so this is safe
        const result = await createEvent(eventData, userId, authenticatedSupabase);
        successful.push(result);
      } catch (error) {
        failed.push(eventData);
        errors.push(error.message);
      }
    }

    return {
      total: eventsData.length,
      successful: successful.length,
      failed: failed.length,
      errors,
      imported: successful
    };
  } catch (error) {
    console.error('Error importing events:', error);
    throw error;
  }
};

// Import events from subscription
const importEventsFromSubscription = async (subscriptionId, eventsData, userId, authenticatedSupabase = null) => {
  if (!userId) throw new Error('SECURITY: userId is required for importEventsFromSubscription.');
  try {
    const supabaseClient = authenticatedSupabase || supabase;
    
    // HARDENED: Only delete events from this subscription AND this user
    if (subscriptionId) {
      console.log(`🔄 Removing old events from subscription ID: ${subscriptionId} for user ${userId}`);
      await supabaseClient
        .from('events')
        .delete()
        .eq('source_calendar_id', subscriptionId)
        .eq('user_id', userId);
    } else {
      console.warn('⚠️ Attempted to delete events without a valid subscription ID');
    }

    const successful = [];
    const failed = [];
    const errors = [];

    for (const eventData of eventsData) {
      try {
        const { data, error } = await supabaseClient
          .from('events')
          .insert([{
            title: eventData.title,
            start_time: eventData.start.toISOString(),
            end_time: eventData.end.toISOString(),
            color: eventData.color,
            source_calendar_id: subscriptionId,
            source_event_uid: eventData.uid,
            user_id: userId // HARDENED: user_id is now guaranteed
          }])
          .select()
          .single();

        if (error) throw error;

        successful.push({
          id: data.id,
          title: data.title,
          start: new Date(data.start_time),
          end: new Date(data.end_time),
          color: data.color
        });
      } catch (error) {
        failed.push(eventData);
        errors.push(error.message);
      }
    }

    return {
      total: eventsData.length,
      successful: successful.length,
      failed: failed.length,
      errors,
      imported: successful
    };
  } catch (error) {
    console.error('Error importing events from subscription:', error);
    throw error;
  }
};

// Get calendar stats
const getCalendarStats = async (period = 'this_week', userId, authenticatedSupabase = null) => {
  if (!userId) throw new Error('SECURITY: userId is required for getCalendarStats.');
  try {
    // getEventsForPeriod is now hardened
    const events = await getEventsForPeriod(period, userId, authenticatedSupabase);
    
    const totalEvents = events.length;
    let totalHours = 0;
    const dayStats = {};

    events.forEach(event => {
      const duration = (event.end - event.start) / (1000 * 60 * 60); // Convert to hours
      totalHours += duration;
      
      const day = event.start.toLocaleDateString('en-US', { weekday: 'long' });
      dayStats[day] = (dayStats[day] || 0) + duration;
    });

    const busiestDay = Object.keys(dayStats).reduce((a, b) => 
      dayStats[a] > dayStats[b] ? a : b, null
    );

    return {
      totalEvents,
      totalHours,
      busiestDay,
      dayStats
    };
  } catch (error) {
    console.error('Error getting calendar stats:', error);
    throw error;
  }
};

// Check if time slot is free FOR A SPECIFIC USER
const isTimeSlotFree = async (startTime, endTime, userId) => {
  if (!userId) throw new Error('SECURITY: userId is required for isTimeSlotFree.');
  try {
    const { data, error } = await supabase
      .from('events')
      .select('id')
      .eq('user_id', userId) // HARDENED: Always filter by user_id
      .lt('start_time', endTime.toISOString())
      .gt('end_time', startTime.toISOString());

    if (error) throw error;

    return data.length === 0;
  } catch (error) {
    console.error('Error checking time slot availability:', error);
    throw error;
  }
};

// Export all functions for CommonJS
module.exports = {
  supabase,
  getAllEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  getEventsByDateRange,
  searchEvents,
  getUpcomingEvents,
  getEventsForPeriod,
  addCalendarSubscription,
  getCalendarSubscriptions,
  getAllCalendarSubscriptionsForAutoSync,
  updateCalendarSync,
  deleteCalendarSubscription,
  importEvents,
  importEventsFromSubscription,
  getCalendarStats,
  isTimeSlotFree,
  getEventById
} 