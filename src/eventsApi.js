// API service for calendar events
const API_BASE_URL = 'http://localhost:3001/api';

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
    const response = await fetch(`${API_BASE_URL}/events`);
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
    
    const response = await fetch(`${API_BASE_URL}/events/range?${params}`);
    return await handleResponse(response);
  } catch (error) {
    console.error('Error fetching events by date range:', error);
    throw error;
  }
};

// Create a new event
export const createEvent = async (eventData) => {
  try {
    const response = await fetch(`${API_BASE_URL}/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: eventData.title,
        start: eventData.start.toISOString(),
        end: eventData.end.toISOString(),
        color: eventData.color || '#3b82f6'
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
    // Build the update payload, only including fields that are provided
    const updatePayload = {};
    
    if (eventData.title !== undefined) {
      updatePayload.title = eventData.title;
    }
    
    if (eventData.start !== undefined) {
      updatePayload.start = eventData.start instanceof Date 
        ? eventData.start.toISOString() 
        : eventData.start;
    }
    
    if (eventData.end !== undefined) {
      updatePayload.end = eventData.end instanceof Date 
        ? eventData.end.toISOString() 
        : eventData.end;
    }
    
    if (eventData.color !== undefined) {
      updatePayload.color = eventData.color;
    }

    const response = await fetch(`${API_BASE_URL}/events/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
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
    const response = await fetch(`${API_BASE_URL}/events/${id}`, {
      method: 'DELETE',
    });
    
    return await handleResponse(response);
  } catch (error) {
    console.error('Error deleting event:', error);
    throw error;
  }
}; 