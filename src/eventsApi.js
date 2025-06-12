// API service for calendar events
import { supabase } from './lib/supabase'

const API_BASE_URL = 'http://localhost:3001/api';

// Helper function to get auth headers
const getAuthHeaders = async () => {
  const { data: { session } } = await supabase.auth.getSession()
  const headers = {
    'Content-Type': 'application/json'
  }
  
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`
  }
  
  return headers
}

// Helper function to handle API responses
const handleResponse = async (response) => {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Network error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }
  return response.json();
};

// Get all events
export const fetchEvents = async () => {
  try {
    const headers = await getAuthHeaders()
    const response = await fetch(`${API_BASE_URL}/events`, { headers });
    return await handleResponse(response);
  } catch (error) {
    console.error('Error fetching events:', error);
    throw error;
  }
};

// Get events within a date range
export const fetchEventsByDateRange = async (startDate, endDate) => {
  try {
    const params = new URLSearchParams({
      start: startDate.toISOString(),
      end: endDate.toISOString()
    });
    
    const headers = await getAuthHeaders()
    const response = await fetch(`${API_BASE_URL}/events/range?${params}`, { headers });
    return await handleResponse(response);
  } catch (error) {
    console.error('Error fetching events by date range:', error);
    throw error;
  }
};

// Create a new event
export const createEvent = async (eventData) => {
  try {
    const headers = await getAuthHeaders()
    const response = await fetch(`${API_BASE_URL}/events`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        title: eventData.title,
        start: eventData.start.toISOString(),
        end: eventData.end.toISOString(),
        color: eventData.color || '#4A7C2A'
      }),
    });
    
    return await handleResponse(response);
  } catch (error) {
    console.error('Error creating event:', error);
    throw error;
  }
};

// Update an existing event
export const updateEvent = async (id, eventData) => {
  try {
    console.log('🔍 DEBUG: updateEvent called with:', { id, eventData });
    
    // Build the update payload, only including fields that are provided
    const updatePayload = {};
    
    if (eventData.title !== undefined) {
      updatePayload.title = eventData.title;
    }
    
    if (eventData.start !== undefined) {
      updatePayload.start = eventData.start instanceof Date 
        ? eventData.start.toISOString() 
        : eventData.start;
      console.log('🔍 DEBUG: processed start:', updatePayload.start, 'from:', eventData.start);
    }
    
    if (eventData.end !== undefined) {
      updatePayload.end = eventData.end instanceof Date 
        ? eventData.end.toISOString() 
        : eventData.end;
      console.log('🔍 DEBUG: processed end:', updatePayload.end, 'from:', eventData.end);
    }
    
    if (eventData.color !== undefined) {
      updatePayload.color = eventData.color;
    }

    console.log('🔍 DEBUG: final updatePayload:', updatePayload);

    const headers = await getAuthHeaders()
    const response = await fetch(`${API_BASE_URL}/events/${id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(updatePayload),
    });
    
    return await handleResponse(response);
  } catch (error) {
    console.error('Error updating event:', error);
    throw error;
  }
};

// Delete an event
export const deleteEvent = async (id) => {
  try {
    const headers = await getAuthHeaders()
    const response = await fetch(`${API_BASE_URL}/events/${id}`, {
      method: 'DELETE',
      headers,
    });
    
    return await handleResponse(response);
  } catch (error) {
    console.error('Error deleting event:', error);
    throw error;
  }
};

// Import iCal file
export const importICalFile = async (file) => {
  try {
    const formData = new FormData();
    formData.append('icalFile', file);
    
    // Get auth headers but remove Content-Type for FormData
    const headers = await getAuthHeaders()
    delete headers['Content-Type'] // Let browser set it with boundary for FormData
    
    const response = await fetch(`${API_BASE_URL}/events/import`, {
      method: 'POST',
      headers,
      body: formData,
    });
    
    return await handleResponse(response);
  } catch (error) {
    console.error('Error importing iCal file:', error);
    throw error;
  }
};

// Import from calendar URL (iCloud, Google Calendar sharing URLs)
export const importFromCalendarURL = async (url) => {
  try {
    const headers = await getAuthHeaders()
    const response = await fetch(`${API_BASE_URL}/events/import-url`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ url }),
    });
    
    return await handleResponse(response);
  } catch (error) {
    console.error('Error importing from calendar URL:', error);
    throw error;
  }
};

// Send calendar invitation via email
export const sendEventInvitation = async (eventId, emails, message = '') => {
  try {
    const headers = await getAuthHeaders()
    const response = await fetch(`${API_BASE_URL}/events/${eventId}/invite`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ emails, message }),
    });
    
    return await handleResponse(response);
  } catch (error) {
    console.error('Error sending event invitation:', error);
    throw error;
  }
}; 