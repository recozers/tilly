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
    
    // Get regular events (last 6 months to next 6 months for performance)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const sixMonthsFromNow = new Date();
    sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6);
    
    const { data: events, error: eventsError } = await client
      .from('events')
      .select('*')
      .eq('user_id', userId) // HARDENED: Always filter by user_id
      .gte('start_time', sixMonthsAgo.toISOString())
      .lte('start_time', sixMonthsFromNow.toISOString())
      .order('start_time', { ascending: true });

    if (eventsError) throw eventsError;

    // Get pending meeting requests where user is the friend (recipient)
    const { data: meetingRequests, error: requestsError } = await client
      .from('meeting_requests')
      .select(`
        id,
        title,
        message,
        duration_minutes,
        proposed_times,
        requester_id
      `)
      .eq('friend_id', userId)
      .eq('status', 'pending');

    if (requestsError) throw requestsError;

    // Fetch requester profiles manually if we have meeting requests
    if (meetingRequests && meetingRequests.length > 0) {
      const requesterIds = [...new Set(meetingRequests.map(req => req.requester_id))];
      const { data: requesterProfiles, error: profilesError } = await client
        .from('user_profiles')
        .select('id, display_name, email')
        .in('id', requesterIds);

      if (!profilesError && requesterProfiles) {
        meetingRequests.forEach(request => {
          const profile = requesterProfiles.find(p => p.id === request.requester_id);
          request.requester = profile;
        });
      }
    }

    // Convert regular events to frontend format
    const regularEvents = events.map(row => ({
      id: row.id,
      title: row.title,
      start: new Date(row.start_time),
      end: new Date(row.end_time),
      color: row.color,
      type: 'event'
    }));

    // Convert meeting requests to outlined events
    const proposedEvents = [];
    if (meetingRequests && meetingRequests.length > 0) {
      meetingRequests.forEach((request) => {
        // Create an event for each proposed time
        if (request.proposed_times && Array.isArray(request.proposed_times)) {
          request.proposed_times.forEach((proposedTime, index) => {
            const start = new Date(proposedTime.start || proposedTime);
            const duration = request.duration_minutes || 30;
            const end = new Date(start.getTime() + duration * 60000);
            
            if (!isNaN(start.getTime())) {  // Only add if valid date
              const requesterName = request.requester?.display_name || request.requester?.email || `User ${request.requester_id}`;
              proposedEvents.push({
                id: `meeting-request-${request.id}-${index}`,
                title: `📅 ${request.title} - ${requesterName}`,
                start: start,
                end: end,
                type: 'meeting_request',
                meetingRequestId: request.id,
                requesterName: requesterName,
                message: request.message,
                proposedTimeIndex: index,
                color: '#e8f5e9',
                borderColor: '#4a6741',
                isProposed: true
              });
            }
          });
        }
      });
    }

    // Check for accepted meeting requests where user is the requester
    const { data: acceptedRequests, error: acceptedError } = await client
      .from('meeting_requests')
      .select('*')
      .eq('requester_id', userId)
      .eq('status', 'accepted');

    if (!acceptedError && acceptedRequests && acceptedRequests.length > 0) {
      // Create events for accepted meetings that don't already exist
      for (const request of acceptedRequests) {
        const existingEvent = events.find(e => 
          e.title === request.title && 
          Math.abs(new Date(e.start_time).getTime() - new Date(request.selected_time).getTime()) < 60000
        );
        
        if (!existingEvent) {
          try {
            const newEvent = await createEvent({
              title: request.title,
              start: new Date(request.selected_time),
              end: new Date(new Date(request.selected_time).getTime() + (request.duration_minutes * 60000)),
              color: '#4A7C2A'
            }, userId, client);
            
            // Add to regular events so it shows up
            regularEvents.push({
              id: newEvent.id,
              title: newEvent.title,
              start: newEvent.start,
              end: newEvent.end,
              color: newEvent.color,
              type: 'event'
            });
          } catch (error) {
            console.error('Error creating event for accepted meeting:', error);
          }
        }
      }
    }

    // Combine and return all events
    return [...regularEvents, ...proposedEvents];
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
    
    // First get the event to check if it's a meeting
    const { data: event } = await supabaseClient
      .from('events')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    // Delete the event
    const { error } = await supabaseClient
      .from('events')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;

    // If this was a meeting event, also delete/cancel the meeting request
    if (event) {
      // Look for meeting requests that match this event
      const { data: meetingRequests } = await supabaseClient
        .from('meeting_requests')
        .select('*')
        .eq('title', event.title)
        .eq('status', 'accepted')
        .or(`requester_id.eq.${userId},friend_id.eq.${userId}`);

      // Delete matching meeting requests to prevent recreation
      if (meetingRequests && meetingRequests.length > 0) {
        for (const request of meetingRequests) {
          const eventTime = new Date(event.start_time).getTime();
          const requestTime = new Date(request.selected_time).getTime();
          
          // If times match (within 1 minute), delete the meeting request
          if (Math.abs(eventTime - requestTime) < 60000) {
            await supabaseClient
              .from('meeting_requests')
              .delete()
              .eq('id', request.id);
          }
        }
      }
    }

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

// ============================================
// FRIEND SYSTEM FUNCTIONS
// ============================================

// Get user profile
const getUserProfile = async (userId, authenticatedSupabase = null) => {
  if (!userId) throw new Error('SECURITY: userId is required for getUserProfile.');
  try {
    const supabaseClient = authenticatedSupabase || supabase;
    const { data, error } = await supabaseClient
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error && error.code === 'PGRST116') {
      // No profile found, return null instead of throwing
      return null;
    }
    
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching user profile:', error);
    throw error;
  }
};

// Update user profile
const updateUserProfile = async (userId, profileData, authenticatedSupabase = null) => {
  if (!userId) throw new Error('SECURITY: userId is required for updateUserProfile.');
  try {
    const supabaseClient = authenticatedSupabase || supabase;
    const { data, error } = await supabaseClient
      .from('user_profiles')
      .update(profileData)
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error updating user profile:', error);
    throw error;
  }
};

// Search users for friend requests
const searchUsers = async (query, currentUserId, authenticatedSupabase = null) => {
  if (!currentUserId) throw new Error('SECURITY: currentUserId is required for searchUsers.');
  try {
    const supabaseClient = authenticatedSupabase || supabase;
    const { data, error } = await supabaseClient
      .from('user_profiles')
      .select('id, display_name, email, avatar_url')
      .or(`display_name.ilike.%${query}%,email.ilike.%${query}%`)
      .eq('allow_friend_requests', true)
      .neq('id', currentUserId)
      .limit(10);

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error searching users:', error);
    throw error;
  }
};

// Send friend request
const sendFriendRequest = async (requesterId, addresseeId, authenticatedSupabase = null) => {
  if (!requesterId) throw new Error('SECURITY: requesterId is required for sendFriendRequest.');
  try {
    const supabaseClient = authenticatedSupabase || supabase;
    
    // Check if request already exists
    const { data: existing } = await supabaseClient
      .from('friendships')
      .select('id, status')
      .or(`and(requester_id.eq.${requesterId},addressee_id.eq.${addresseeId}),and(requester_id.eq.${addresseeId},addressee_id.eq.${requesterId})`)
      .single();

    if (existing) {
      throw new Error('Friend request already exists or users are already friends');
    }

    const { data, error } = await supabaseClient
      .from('friendships')
      .insert({
        requester_id: requesterId,
        addressee_id: addresseeId,
        status: 'pending'
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error sending friend request:', error);
    throw error;
  }
};

// Get friend requests (both sent and received)
const getFriendRequests = async (userId, authenticatedSupabase = null) => {
  if (!userId) throw new Error('SECURITY: userId is required for getFriendRequests.');
  try {
    const supabaseClient = authenticatedSupabase || supabase;
    
    // Get received requests
    const { data: receivedRaw, error: receivedError } = await supabaseClient
      .from('friendships')
      .select('id, status, created_at, requester_id')
      .eq('addressee_id', userId)
      .eq('status', 'pending');

    // Get sent requests
    const { data: sentRaw, error: sentError } = await supabaseClient
      .from('friendships')
      .select('id, status, created_at, addressee_id')
      .eq('requester_id', userId)
      .eq('status', 'pending');

    if (receivedError) throw receivedError;
    if (sentError) throw sentError;

    // Fetch profile data for received requests
    const received = [];
    if (receivedRaw && receivedRaw.length > 0) {
      const requesterIds = receivedRaw.map(req => req.requester_id);
      const { data: requesterProfiles, error: requesterError } = await supabaseClient
        .from('user_profiles')
        .select('id, display_name, email, avatar_url')
        .in('id', requesterIds);

      if (requesterError) throw requesterError;

      for (const req of receivedRaw) {
        const profile = requesterProfiles.find(p => p.id === req.requester_id);
        if (profile) {
          received.push({
            ...req,
            requester_profile: profile
          });
        }
      }
    }

    // Fetch profile data for sent requests
    const sent = [];
    if (sentRaw && sentRaw.length > 0) {
      const addresseeIds = sentRaw.map(req => req.addressee_id);
      const { data: addresseeProfiles, error: addresseeError } = await supabaseClient
        .from('user_profiles')
        .select('id, display_name, email, avatar_url')
        .in('id', addresseeIds);

      if (addresseeError) throw addresseeError;

      for (const req of sentRaw) {
        const profile = addresseeProfiles.find(p => p.id === req.addressee_id);
        if (profile) {
          sent.push({
            ...req,
            addressee_profile: profile
          });
        }
      }
    }

    return {
      received,
      sent
    };
  } catch (error) {
    console.error('Error fetching friend requests:', error);
    throw error;
  }
};

// Accept friend request
const acceptFriendRequest = async (requestId, userId, authenticatedSupabase = null) => {
  if (!userId) throw new Error('SECURITY: userId is required for acceptFriendRequest.');
  try {
    const supabaseClient = authenticatedSupabase || supabase;
    
    // Use the database function for accepting friend requests
    const { data, error } = await supabaseClient.rpc('accept_friend_request', {
      request_id: requestId
    });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error accepting friend request:', error);
    throw error;
  }
};

// Decline friend request
const declineFriendRequest = async (requestId, userId, authenticatedSupabase = null) => {
  if (!userId) throw new Error('SECURITY: userId is required for declineFriendRequest.');
  try {
    const supabaseClient = authenticatedSupabase || supabase;
    const { data, error } = await supabaseClient
      .from('friendships')
      .update({ status: 'declined' })
      .eq('id', requestId)
      .eq('addressee_id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error declining friend request:', error);
    throw error;
  }
};

// Get friends list
const getFriends = async (userId, authenticatedSupabase = null) => {
  if (!userId) throw new Error('SECURITY: userId is required for getFriends.');
  try {
    const supabaseClient = authenticatedSupabase || supabase;
    
    // Get friendships
    const { data: friendships, error } = await supabaseClient
      .from('friendships')
      .select('id, created_at, requester_id, addressee_id')
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
      .eq('status', 'accepted');

    if (error) throw error;

    if (!friendships || friendships.length === 0) {
      return [];
    }

    // Get all friend IDs (the other person in each friendship)
    const friendIds = friendships.map(friendship => {
      return friendship.requester_id === userId ? friendship.addressee_id : friendship.requester_id;
    });

    // Fetch friend profiles
    const { data: profiles, error: profileError } = await supabaseClient
      .from('user_profiles')
      .select('id, display_name, email, avatar_url')
      .in('id', friendIds);

    if (profileError) throw profileError;

    // Combine friendship data with profiles
    return friendships.map(friendship => {
      const friendId = friendship.requester_id === userId ? friendship.addressee_id : friendship.requester_id;
      const friendProfile = profiles.find(p => p.id === friendId);
      
      return {
        id: friendship.id,
        created_at: friendship.created_at,
        friend: friendProfile
      };
    }).filter(f => f.friend); // Remove any without profiles
  } catch (error) {
    console.error('Error fetching friends:', error);
    throw error;
  }
};

// Remove friend
const removeFriend = async (friendshipId, userId, authenticatedSupabase = null) => {
  if (!userId) throw new Error('SECURITY: userId is required for removeFriend.');
  try {
    const supabaseClient = authenticatedSupabase || supabase;
    const { error } = await supabaseClient
      .from('friendships')
      .delete()
      .eq('id', friendshipId)
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('Error removing friend:', error);
    throw error;
  }
};

// Block user
const blockUser = async (requesterId, addresseeId, authenticatedSupabase = null) => {
  if (!requesterId) throw new Error('SECURITY: requesterId is required for blockUser.');
  try {
    const supabaseClient = authenticatedSupabase || supabase;
    const { data, error } = await supabaseClient
      .from('friendships')
      .upsert({
        requester_id: requesterId,
        addressee_id: addresseeId,
        status: 'blocked'
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error blocking user:', error);
    throw error;
  }
};

// ============================================
// MEETING REQUEST FUNCTIONS
// ============================================

// Create meeting request
const createMeetingRequest = async (requestData, authenticatedSupabase = null) => {
  if (!requestData.requester_id) throw new Error('SECURITY: requester_id is required for createMeetingRequest.');
  try {
    console.log(`📤 DEBUGGING: createMeetingRequest called with:`, requestData);
    
    const supabaseClient = authenticatedSupabase || supabase;
    const { data, error } = await supabaseClient
      .from('meeting_requests')
      .insert(requestData)
      .select()
      .single();

    console.log(`📤 DEBUGGING: Meeting request insert result:`, { data, error });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('📤 DEBUGGING: Error creating meeting request:', error);
    throw error;
  }
};

// Get meeting requests (both sent and received)
const getMeetingRequests = async (userId, authenticatedSupabase = null) => {
  if (!userId) throw new Error('SECURITY: userId is required for getMeetingRequests.');
  try {
    const supabaseClient = authenticatedSupabase || supabase;
    
    // Get received requests
    const { data: received, error: receivedError } = await supabaseClient
      .from('meeting_requests')
      .select('*')
      .eq('friend_id', userId)
      .in('status', ['pending']);

    // Get sent requests
    const { data: sent, error: sentError } = await supabaseClient
      .from('meeting_requests')
      .select('*')
      .eq('requester_id', userId)
      .in('status', ['pending', 'accepted']);

    if (receivedError) throw receivedError;
    if (sentError) throw sentError;

    // Fetch requester profiles for received requests
    if (received && received.length > 0) {
      const requesterIds = [...new Set(received.map(req => req.requester_id))];
      const { data: requesterProfiles, error: requesterProfilesError } = await supabaseClient
        .from('user_profiles')
        .select('id, display_name, email, avatar_url')
        .in('id', requesterIds);

      if (!requesterProfilesError && requesterProfiles) {
        received.forEach(request => {
          const profile = requesterProfiles.find(p => p.id === request.requester_id);
          request.requester_profile = profile;
        });
      }
    }

    // Fetch friend profiles for sent requests
    if (sent && sent.length > 0) {
      const friendIds = [...new Set(sent.map(req => req.friend_id))];
      const { data: friendProfiles, error: friendProfilesError } = await supabaseClient
        .from('user_profiles')
        .select('id, display_name, email, avatar_url')
        .in('id', friendIds);

      if (!friendProfilesError && friendProfiles) {
        sent.forEach(request => {
          const profile = friendProfiles.find(p => p.id === request.friend_id);
          request.friend_profile = profile;
        });
      }
    }

    return {
      received: received || [],
      sent: sent || []
    };
  } catch (error) {
    console.error('Error fetching meeting requests:', error);
    throw error;
  }
};

// Respond to meeting request
const respondToMeetingRequest = async (requestId, response, selectedTime, userId, authenticatedSupabase = null) => {
  if (!userId) throw new Error('SECURITY: userId is required for respondToMeetingRequest.');
  try {
    const supabaseClient = authenticatedSupabase || supabase;
    
    const updateData = {
      status: response,
      selected_time: response === 'accepted' ? selectedTime : null
    };

    const { data, error } = await supabaseClient
      .from('meeting_requests')
      .update(updateData)
      .eq('id', requestId)
      .eq('friend_id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error responding to meeting request:', error);
    throw error;
  }
};

// Cancel meeting request
const cancelMeetingRequest = async (requestId, userId, authenticatedSupabase = null) => {
  if (!userId) throw new Error('SECURITY: userId is required for cancelMeetingRequest.');
  try {
    const supabaseClient = authenticatedSupabase || supabase;
    const { data, error } = await supabaseClient
      .from('meeting_requests')
      .update({ status: 'cancelled' })
      .eq('id', requestId)
      .eq('requester_id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error cancelling meeting request:', error);
    throw error;
  }
};

// ============================================
// AVAILABILITY FUNCTIONS
// ============================================

// Get availability sharing settings
const getAvailabilitySharing = async (userId, friendId, authenticatedSupabase = null) => {
  if (!userId) throw new Error('SECURITY: userId is required for getAvailabilitySharing.');
  try {
    const supabaseClient = authenticatedSupabase || supabase;
    const { data, error } = await supabaseClient
      .from('availability_sharing')
      .select('*')
      .eq('user_id', userId)
      .eq('friend_id', friendId)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows returned
    return data;
  } catch (error) {
    console.error('Error fetching availability sharing:', error);
    throw error;
  }
};

// Update availability sharing settings
const updateAvailabilitySharing = async (userId, friendId, shareLevel, authenticatedSupabase = null) => {
  if (!userId) throw new Error('SECURITY: userId is required for updateAvailabilitySharing.');
  try {
    const supabaseClient = authenticatedSupabase || supabase;
    const { data, error } = await supabaseClient
      .from('availability_sharing')
      .upsert({
        user_id: userId,
        friend_id: friendId,
        share_level: shareLevel
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error updating availability sharing:', error);
    throw error;
  }
};

// Check user availability for specific time slots
const checkUserAvailability = async (userId, timeSlots, authenticatedSupabase = null) => {
  if (!userId) throw new Error('SECURITY: userId is required for checkUserAvailability.');
  try {
    const supabaseClient = authenticatedSupabase || supabase;
    
    const availability = [];
    
    for (const slot of timeSlots) {
      const { data: conflicts, error } = await supabaseClient
        .from('events')
        .select('id, title, start_time, end_time')
        .eq('user_id', userId)
        .lt('start_time', slot.end)
        .gt('end_time', slot.start);

      if (error) throw error;

      availability.push({
        start: slot.start,
        end: slot.end,
        available: conflicts.length === 0,
        conflicts: conflicts
      });
    }

    return availability;
  } catch (error) {
    console.error('Error checking user availability:', error);
    throw error;
  }
};

// Find mutual free time between two users
const findMutualFreeTime = async (userId1, userId2, duration, startDate, endDate, authenticatedSupabase = null) => {
  if (!userId1 || !userId2) throw new Error('SECURITY: Both user IDs are required for findMutualFreeTime.');
  try {
    const supabaseClient = authenticatedSupabase || supabase;
    
    // Get all events for both users in the date range
    const { data: user1Events, error: error1 } = await supabaseClient
      .from('events')
      .select('start_time, end_time')
      .eq('user_id', userId1)
      .gte('start_time', startDate)
      .lte('end_time', endDate);

    const { data: user2Events, error: error2 } = await supabaseClient
      .from('events')
      .select('start_time, end_time')
      .eq('user_id', userId2)
      .gte('start_time', startDate)
      .lte('end_time', endDate);

    if (error1) throw error1;
    if (error2) throw error2;

    // Combine all busy times
    const allBusyTimes = [
      ...(user1Events || []).map(e => ({ start: new Date(e.start_time), end: new Date(e.end_time) })),
      ...(user2Events || []).map(e => ({ start: new Date(e.start_time), end: new Date(e.end_time) }))
    ].sort((a, b) => a.start - b.start);

    // Find free time slots
    const freeSlots = [];
    const durationMs = duration * 60 * 1000; // Convert minutes to milliseconds
    
    let currentTime = new Date(startDate);
    const endDateTime = new Date(endDate);

    // Only consider business hours (9 AM to 6 PM)
    while (currentTime < endDateTime) {
      const dayStart = new Date(currentTime);
      dayStart.setHours(9, 0, 0, 0);
      const dayEnd = new Date(currentTime);
      dayEnd.setHours(18, 0, 0, 0);

      let slotStart = dayStart;

      // Check for conflicts and find free slots
      for (const busyTime of allBusyTimes) {
        if (busyTime.start >= dayEnd) break;
        if (busyTime.end <= dayStart) continue;

        // If there's a gap before this busy time
        if (slotStart < busyTime.start && busyTime.start - slotStart >= durationMs) {
          const slotEnd = new Date(Math.min(busyTime.start, dayEnd));
          if (slotEnd - slotStart >= durationMs) {
            freeSlots.push({
              start: new Date(slotStart),
              end: new Date(slotStart.getTime() + durationMs)
            });
          }
        }

        // Move past this busy time
        slotStart = new Date(Math.max(slotStart, busyTime.end));
      }

      // Check for a slot at the end of the day
      if (slotStart < dayEnd && dayEnd - slotStart >= durationMs) {
        freeSlots.push({
          start: new Date(slotStart),
          end: new Date(slotStart.getTime() + durationMs)
        });
      }

      // Move to next day
      currentTime.setDate(currentTime.getDate() + 1);
      currentTime.setHours(0, 0, 0, 0);
    }

    return freeSlots.slice(0, 5); // Return top 5 slots
  } catch (error) {
    console.error('Error finding mutual free time:', error);
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
  getEventById,
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
} 