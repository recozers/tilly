const { createClient } = require('@supabase/supabase-js')

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
const getAllEvents = async (userId = null, authenticatedSupabase = null) => {
  try {
    const client = authenticatedSupabase || supabase
    
    let query = client
      .from('events')
      .select('*')
      .order('start_time', { ascending: true })

    // If using authenticated client, RLS will handle filtering automatically
    // If userId is provided and no authenticated client, filter manually
    if (userId && !authenticatedSupabase) {
      query = query.eq('user_id', userId)
    }

    const { data, error } = await query

    if (error) throw error

    // Convert to frontend format
    return data.map(row => ({
      id: row.id,
      title: row.title,
      start: new Date(row.start_time),
      end: new Date(row.end_time),
      color: row.color
    }))
  } catch (error) {
    console.error('Error fetching events:', error)
    throw error
  }
}

// Get a single event by ID - more efficient than loading all events
const getEventById = async (id, userId = null, authenticatedSupabase = null) => {
  try {
    const client = authenticatedSupabase || supabase
    
    let query = client
      .from('events')
      .select('*')
      .eq('id', id)
      .single()

    // If using authenticated client, RLS will handle filtering automatically
    // If userId is provided and no authenticated client, filter manually
    if (userId && !authenticatedSupabase) {
      query = query.eq('user_id', userId)
    }

    const { data, error } = await query

    if (error) {
      if (error.code === 'PGRST116') {
        // Record not found
        return null
      }
      throw error
    }

    // Convert to frontend format
    return {
      id: data.id,
      title: data.title,
      start: new Date(data.start_time),
      end: new Date(data.end_time),
      color: data.color
    }
  } catch (error) {
    console.error('Error fetching event by ID:', error)
    throw error
  }
}

// Create a new event
const createEvent = async (eventData, userId = null, authenticatedSupabase = null) => {
  try {
    const { title, start, end, color = '#4A7C2A' } = eventData
    const client = authenticatedSupabase || supabase
    
    const insertData = {
      title,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      color
    }

    // Supabase RLS requires user_id to match auth.uid() for inserts. Always include it when available.
    if (userId) {
      insertData.user_id = userId
    }
    
    const { data, error } = await client
      .from('events')
      .insert([insertData])
      .select()
      .single()

    if (error) throw error

    return {
      id: data.id,
      title: data.title,
      start: new Date(data.start_time),
      end: new Date(data.end_time),
      color: data.color
    }
  } catch (error) {
    console.error('Error creating event:', error)
    throw error
  }
}

// Update an existing event
const updateEvent = async (id, eventData, userId = null, authenticatedSupabase = null) => {
  try {
    const { title, start, end, color } = eventData
    const supabaseClient = authenticatedSupabase || supabase
    
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
      .select()
      .single()

    if (error) throw error

    return {
      id: data.id,
      title: data.title,
      start: new Date(data.start_time),
      end: new Date(data.end_time),
      color: data.color
    }
  } catch (error) {
    console.error('Error updating event:', error)
    throw error
  }
}

// Delete an event
const deleteEvent = async (id, userId = null, authenticatedSupabase = null) => {
  try {
    const supabaseClient = authenticatedSupabase || supabase
    
    const { error } = await supabaseClient
      .from('events')
      .delete()
      .eq('id', id)

    if (error) throw error

    return { deletedId: id }
  } catch (error) {
    console.error('Error deleting event:', error)
    throw error
  }
}

// Get events within a date range
const getEventsByDateRange = async (startDate, endDate, userId = null, authenticatedSupabase = null) => {
  try {
    const client = authenticatedSupabase || supabase
    
    let query = client
      .from('events')
      .select('*')
      .gte('start_time', startDate.toISOString())
      .lte('start_time', endDate.toISOString())
      .order('start_time', { ascending: true })

    // If using authenticated client, RLS will handle filtering automatically
    // If userId is provided and no authenticated client, filter manually
    if (userId && !authenticatedSupabase) {
      query = query.eq('user_id', userId)
    }

    const { data, error } = await query

    if (error) throw error

    return data.map(row => ({
      id: row.id,
      title: row.title,
      start: new Date(row.start_time),
      end: new Date(row.end_time),
      color: row.color
    }))
  } catch (error) {
    console.error('Error fetching events by date range:', error)
    throw error
  }
}

// Search events by title
const searchEvents = async (searchTerm, timeframe = null, userId = null, authenticatedSupabase = null) => {
  try {
    const client = authenticatedSupabase || supabase;
    
    let query = client
      .from('events')
      .select('*')
      .ilike('title', `%${searchTerm}%`)
      
    // If using authenticated client, RLS will handle filtering automatically
    // If userId is provided and no authenticated client, filter manually
    if (userId && !authenticatedSupabase) {
      query = query.eq('user_id', userId)
    }

    if (timeframe) {
      query = query
        .gte('start_time', timeframe.start.toISOString())
        .lte('start_time', timeframe.end.toISOString())
    }

    query = query.order('start_time', { ascending: true })

    const { data, error } = await query

    if (error) throw error

    return data.map(row => ({
      id: row.id,
      title: row.title,
      start: new Date(row.start_time),
      end: new Date(row.end_time),
      color: row.color
    }))
  } catch (error) {
    console.error('Error searching events:', error)
    throw error
  }
}

// Get upcoming events
const getUpcomingEvents = async (limit = 10) => {
  try {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .gte('start_time', new Date().toISOString())
      .order('start_time', { ascending: true })
      .limit(limit)

    if (error) throw error

    return data.map(row => ({
      id: row.id,
      title: row.title,
      start: new Date(row.start_time),
      end: new Date(row.end_time),
      color: row.color
    }))
  } catch (error) {
    console.error('Error fetching upcoming events:', error)
    throw error
  }
}

// Get events for a specific period (today, tomorrow, this_week, etc.)
const getEventsForPeriod = async (period, userId = null, authenticatedSupabase = null) => {
  try {
    const now = new Date()
    let startDate, endDate

    switch (period) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
        break
      case 'tomorrow':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2)
        break
      case 'this_week':
        const dayOfWeek = now.getDay()
        const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysToMonday)
        endDate = new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000)
        break
      default:
        throw new Error(`Unsupported period: ${period}`)
    }

    return await getEventsByDateRange(startDate, endDate, userId, authenticatedSupabase)
  } catch (error) {
    console.error('Error fetching events for period:', error)
    throw error
  }
}

// Calendar subscription functions
const addCalendarSubscription = async (subscriptionData, userId = null, authenticatedSupabase = null) => {
  try {
    const { name, url, color = '#4A7C2A' } = subscriptionData
    const supabaseClient = authenticatedSupabase || supabase

    const { data, error } = await supabaseClient
      .from('calendar_subscriptions')
      .insert([{ name, url, color, ...(userId ? { user_id: userId } : {}) }])
      .select()
      .single()

    if (error) throw error
    return data
  } catch (error) {
    console.error('Error adding calendar subscription:', error)
    throw error
  }
}

const getCalendarSubscriptions = async (userId = null, authenticatedSupabase = null) => {
  try {
    const supabaseClient = authenticatedSupabase || supabase
    
    const { data, error } = await supabaseClient
      .from('calendar_subscriptions')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    return data
  } catch (error) {
    console.error('Error fetching calendar subscriptions:', error)
    throw error
  }
}

const updateCalendarSync = async (subscriptionId, lastSync = new Date(), userId = null, authenticatedSupabase = null) => {
  try {
    const supabaseClient = authenticatedSupabase || supabase
    
    const { error } = await supabaseClient
      .from('calendar_subscriptions')
      .update({ last_sync: lastSync.toISOString() })
      .eq('id', subscriptionId)

    if (error) throw error
  } catch (error) {
    console.error('Error updating calendar sync:', error)
    throw error
  }
}

const deleteCalendarSubscription = async (subscriptionId, userId = null, authenticatedSupabase = null) => {
  try {
    const supabaseClient = authenticatedSupabase || supabase
    
    // Delete all events from this subscription first
    await supabaseClient
      .from('events')
      .delete()
      .eq('source_calendar_id', subscriptionId)

    // Then delete the subscription
    const { error } = await supabaseClient
      .from('calendar_subscriptions')
      .delete()
      .eq('id', subscriptionId)

    if (error) throw error
  } catch (error) {
    console.error('Error deleting calendar subscription:', error)
    throw error
  }
}

// Import events (for one-time imports)
const importEvents = async (eventsData, userId = null, authenticatedSupabase = null) => {
  try {
    const successful = []
    const failed = []
    const errors = []

    for (const eventData of eventsData) {
      try {
        const result = await createEvent(eventData, userId, authenticatedSupabase)
        successful.push(result)
      } catch (error) {
        failed.push(eventData)
        errors.push(error.message)
      }
    }

    return {
      total: eventsData.length,
      successful: successful.length,
      failed: failed.length,
      errors,
      imported: successful
    }
  } catch (error) {
    console.error('Error importing events:', error)
    throw error
  }
}

// Import events from subscription
const importEventsFromSubscription = async (subscriptionId, eventsData, userId = null, authenticatedSupabase = null) => {
  try {
    const supabaseClient = authenticatedSupabase || supabase
    
    // First, only delete events that are actually from this subscription
    // Check if subscription ID is valid before deleting anything
    if (subscriptionId) {
      console.log(`🔄 Removing old events from subscription ID: ${subscriptionId}`);
      await supabaseClient
        .from('events')
        .delete()
        .eq('source_calendar_id', subscriptionId);
    } else {
      console.warn('⚠️ Attempted to delete events without a valid subscription ID');
    }

    const successful = []
    const failed = []
    const errors = []

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
            ...(userId ? { user_id: userId } : {})
          }])
          .select()
          .single()

        if (error) throw error

        successful.push({
          id: data.id,
          title: data.title,
          start: new Date(data.start_time),
          end: new Date(data.end_time),
          color: data.color
        })
      } catch (error) {
        failed.push(eventData)
        errors.push(error.message)
      }
    }

    return {
      total: eventsData.length,
      successful: successful.length,
      failed: failed.length,
      errors,
      imported: successful
    }
  } catch (error) {
    console.error('Error importing events from subscription:', error)
    throw error
  }
}

// Get calendar stats
const getCalendarStats = async (period = 'this_week', userId = null, authenticatedSupabase = null) => {
  try {
    const events = await getEventsForPeriod(period, userId, authenticatedSupabase)
    
    const totalEvents = events.length
    let totalHours = 0
    const dayStats = {}

    events.forEach(event => {
      const duration = (event.end - event.start) / (1000 * 60 * 60) // Convert to hours
      totalHours += duration
      
      const day = event.start.toLocaleDateString('en-US', { weekday: 'long' })
      dayStats[day] = (dayStats[day] || 0) + duration
    })

    const busiestDay = Object.keys(dayStats).reduce((a, b) => 
      dayStats[a] > dayStats[b] ? a : b, null
    )

    return {
      totalEvents,
      totalHours,
      busiestDay,
      dayStats
    }
  } catch (error) {
    console.error('Error getting calendar stats:', error)
    throw error
  }
}

// Check if time slot is free
const isTimeSlotFree = async (startTime, endTime) => {
  try {
    const { data, error } = await supabase
      .from('events')
      .select('id')
      .lt('start_time', endTime.toISOString())
      .gt('end_time', startTime.toISOString())

    if (error) throw error

    return data.length === 0
  } catch (error) {
    console.error('Error checking time slot availability:', error)
    throw error
  }
}

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
  updateCalendarSync,
  deleteCalendarSubscription,
  importEvents,
  importEventsFromSubscription,
  getCalendarStats,
  isTimeSlotFree,
  getEventById
} 