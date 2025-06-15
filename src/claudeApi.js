// Anthropic API integration for calendar event parsing
const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

// Debug logging (safe - no sensitive data)
console.log('API Key loaded:', ANTHROPIC_API_KEY ? 'Yes (length: ' + ANTHROPIC_API_KEY.length + ')' : 'No');
// Removed environment variables logging for security

const SYSTEM_PROMPT = `You are Tilly, a helpful calendar assistant. Your job is to parse natural language requests and extract calendar event information.

IMPORTANT: You must ALWAYS respond with valid JSON in the exact format specified below. Do not include any other text or explanations outside the JSON.

When a user asks to schedule something, respond with a JSON object in this exact format:
{
  "intent": "create_event",
  "event": {
    "title": "Event Title",
    "start": "2024-01-15T14:00:00",
    "end": "2024-01-15T15:00:00"
  },
  "response": "I'll help you schedule [event] for [time]. Please confirm if you'd like to add this event to your calendar."
}

For non-scheduling requests, respond with:
{
  "intent": "general",
  "response": "Your helpful response here"
}

Examples:
User: "schedule a meeting at 3pm on wednesday"
Response: {"intent": "create_event", "event": {"title": "Meeting", "start": "2024-12-25T15:00:00", "end": "2024-12-25T16:00:00"}, "response": "I'll help you schedule a meeting for Wednesday at 3:00 PM. Please confirm if you'd like to add this event to your calendar."}

User: "book dentist appointment friday 2pm"
Response: {"intent": "create_event", "event": {"title": "Dentist Appointment", "start": "2024-12-27T14:00:00", "end": "2024-12-27T15:00:00"}, "response": "I'll help you schedule a dentist appointment for Friday at 2:00 PM. Please confirm if you'd like to add this event to your calendar."}

Rules:
- Be extremely concise and to the point in your responses
- ALWAYS respond with valid JSON only
- Use local time format without timezone (YYYY-MM-DDTHH:mm:ss)
- Default duration is 1 hour unless specified
- If no date is specified, assume the next occurrence of that day
- If no time is specified, assume 2:00 PM
- Be conversational and helpful in your responses
- Extract the most logical event title from the user's request

Current date and time: ${new Date().toISOString()}`;

export const parseEventRequest = async (userMessage) => {
  console.log('parseEventRequest called with:', userMessage);
  console.log('API Key available:', !!ANTHROPIC_API_KEY);
  
  // Use dynamic URL that works in both dev and production
  const envBase = import.meta.env?.VITE_API_BASE;
  const API_BASE = envBase && !envBase.includes('localhost') ? envBase : `${window.location.protocol}//${window.location.host}`;
  const PROXY_URL = `${API_BASE}/api/claude`;
  
  try {
    console.log('Making API request via proxy server...');
    
    const requestBody = {
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: userMessage
        }
      ]
    };
    
    console.log('Request body:', requestBody);
    
    const response = await fetch(PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    console.log('Proxy response status:', response.status);
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error('Proxy request failed:', response.status, errorData);
      throw new Error(`Proxy request failed: ${response.status} - ${errorData.error}`);
    }

    const data = await response.json();
    console.log('API response data:', data);
    const content = data.content[0].text;
    
    // Parse the JSON response from Claude
    try {
      const parsedResponse = JSON.parse(content);
      console.log('Parsed response:', parsedResponse);
      
      // Validate the response structure
      if (parsedResponse.intent === 'create_event' && parsedResponse.event) {
        // Convert ISO strings back to Date objects for the calendar
        parsedResponse.event.start = new Date(parsedResponse.event.start).getTime();
        parsedResponse.event.end = new Date(parsedResponse.event.end).getTime();
      }
      
      return parsedResponse;
    } catch (parseError) {
      console.error('Failed to parse Claude response as JSON:', content);
      return {
        intent: 'general',
        response: content // Return the raw response if it's not valid JSON
      };
    }

  } catch (error) {
    console.error('Error calling proxy API:', error);
    console.error('Error type:', error.constructor.name);
    console.error('Error message:', error.message);
    
    // Check if it's a network error (proxy server not running)
    if (error.message.includes('fetch') || error.message.includes('Failed to fetch')) {
      console.error('Proxy server appears to be down. Make sure to run: npm run server');
      return {
        intent: 'general',
        response: "The AI service is currently unavailable. Please make sure the proxy server is running (npm run server) and try again."
      };
    }
    
    // Fall back to enhanced parser if proxy fails
    console.log('Falling back to enhanced local parser...');
    return getEnhancedFallbackResponse(userMessage);
  }
};

// Fallback function for when API is unavailable
const getFallbackResponse = (userMessage) => {
  const lowerMessage = userMessage.toLowerCase();
  
  // Simple pattern matching for common scheduling requests
  if (lowerMessage.includes('meeting') || lowerMessage.includes('appointment') || 
      lowerMessage.includes('schedule') || lowerMessage.includes('book') ||
      lowerMessage.includes('lunch') || lowerMessage.includes('dinner') ||
      lowerMessage.includes('call') || lowerMessage.includes('gym')) {
    
    // Create a basic event with tomorrow at 2pm default
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(14, 0, 0, 0);
    
    const endTime = new Date(tomorrow);
    endTime.setHours(15, 0, 0, 0);
    
    // Extract a reasonable title
    let title = 'Event';
    if (lowerMessage.includes('meeting')) title = 'Meeting';
    else if (lowerMessage.includes('appointment')) title = 'Appointment';
    else if (lowerMessage.includes('lunch')) title = 'Lunch';
    else if (lowerMessage.includes('dinner')) title = 'Dinner';
    else if (lowerMessage.includes('call')) title = 'Call';
    else if (lowerMessage.includes('gym')) title = 'Gym Session';
    
    return {
      intent: 'create_event',
      event: {
        title: title,
        start: tomorrow.getTime(),
        end: endTime.getTime(),
      },
      response: `I'll help you schedule a ${title.toLowerCase()} for tomorrow at 2pm. Please confirm if you'd like to add this event to your calendar.`
    };
  }
  
  // Default response for non-scheduling requests
  return {
    intent: 'general',
    response: "I understand you want to schedule something. Try being more specific like 'Schedule a meeting tomorrow at 2pm' or 'Book dentist appointment Friday 3pm'. (Note: API key not configured, using basic parsing)"
  };
};

// Enhanced fallback function with better natural language parsing
const getEnhancedFallbackResponse = (userMessage) => {
  const lowerMessage = userMessage.toLowerCase();
  console.log('Parsing message:', lowerMessage);
  
  // Check if this is a scheduling request
  const schedulingKeywords = ['meeting', 'appointment', 'schedule', 'book', 'lunch', 'dinner', 'call', 'gym', 'workout', 'coffee', 'interview', 'dentist', 'doctor', 'class', 'lesson', 'session'];
  const isSchedulingRequest = schedulingKeywords.some(keyword => lowerMessage.includes(keyword));
  
  if (!isSchedulingRequest) {
    return {
      intent: 'general',
      response: "I can help you schedule events! Try saying something like 'Schedule a meeting tomorrow at 2pm' or 'Book dentist appointment Friday 3pm'."
    };
  }
  
  // Extract event title
  let title = 'Event';
  for (const keyword of schedulingKeywords) {
    if (lowerMessage.includes(keyword)) {
      title = keyword.charAt(0).toUpperCase() + keyword.slice(1);
      break;
    }
  }
  
  // Extract more specific titles
  if (lowerMessage.includes('dentist')) title = 'Dentist Appointment';
  else if (lowerMessage.includes('doctor')) title = 'Doctor Appointment';
  else if (lowerMessage.includes('coffee')) title = 'Coffee Meeting';
  else if (lowerMessage.includes('interview')) title = 'Interview';
  else if (lowerMessage.includes('workout') || lowerMessage.includes('gym')) title = 'Workout';
  
  // Parse date
  let targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + 1); // Default to tomorrow
  
  if (lowerMessage.includes('today')) {
    targetDate = new Date();
  } else if (lowerMessage.includes('tomorrow')) {
    targetDate.setDate(targetDate.getDate()); // Already set to tomorrow above
  } else if (lowerMessage.includes('monday')) {
    targetDate = getNextWeekday(1);
  } else if (lowerMessage.includes('tuesday')) {
    targetDate = getNextWeekday(2);
  } else if (lowerMessage.includes('wednesday')) {
    targetDate = getNextWeekday(3);
  } else if (lowerMessage.includes('thursday')) {
    targetDate = getNextWeekday(4);
  } else if (lowerMessage.includes('friday')) {
    targetDate = getNextWeekday(5);
  } else if (lowerMessage.includes('saturday')) {
    targetDate = getNextWeekday(6);
  } else if (lowerMessage.includes('sunday')) {
    targetDate = getNextWeekday(0);
  } else if (lowerMessage.includes('next week')) {
    targetDate.setDate(targetDate.getDate() + 7);
  }
  
  // Parse time
  let hour = 14; // Default 2 PM
  let minute = 0;
  
  // Look for time patterns like "2pm", "3:30pm", "10am", "14:00"
  const timePatterns = [
    /(\d{1,2}):(\d{2})\s*(am|pm)/i,  // 3:30pm
    /(\d{1,2})\s*(am|pm)/i,          // 3pm
    /(\d{1,2}):(\d{2})/,             // 14:00
    /at\s+(\d{1,2})/i                // at 3
  ];
  
  for (const pattern of timePatterns) {
    const match = lowerMessage.match(pattern);
    if (match) {
      hour = parseInt(match[1]);
      minute = match[2] ? parseInt(match[2]) : 0;
      
      // Handle AM/PM - check if we have AM/PM in the match
      let ampmIndex = -1;
      for (let i = 2; i < match.length; i++) {
        if (match[i] && (match[i].toLowerCase() === 'am' || match[i].toLowerCase() === 'pm')) {
          ampmIndex = i;
          break;
        }
      }
      
      if (ampmIndex !== -1) {
        const ampm = match[ampmIndex].toLowerCase();
        if (ampm === 'pm' && hour !== 12) hour += 12;
        if (ampm === 'am' && hour === 12) hour = 0;
      }
      
      console.log(`Parsed time: ${hour}:${minute} from "${match[0]}"`);
      break;
    }
  }
  
  // Set the time
  targetDate.setHours(hour, minute, 0, 0);
  
  // Create end time (default 1 hour duration)
  const endDate = new Date(targetDate);
  endDate.setHours(endDate.getHours() + 1);
  
  const response = `I'll help you schedule "${title}" for ${targetDate.toLocaleDateString()} at ${targetDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Please confirm if you'd like to add this event to your calendar.`;
  
  return {
    intent: 'create_event',
    event: {
      title: title,
      start: targetDate.getTime(),
      end: endDate.getTime(),
    },
    response: response
  };
};

// Helper function to get next occurrence of a weekday
const getNextWeekday = (targetDay) => {
  const today = new Date();
  const currentDay = today.getDay();
  let daysUntilTarget = targetDay - currentDay;
  
  if (daysUntilTarget <= 0) {
    daysUntilTarget += 7; // Next week
  }
  
  const result = new Date(today);
  result.setDate(today.getDate() + daysUntilTarget);
  return result;
}; 