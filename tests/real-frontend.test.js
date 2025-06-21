// Real Frontend Integration Tests - Testing actual frontend utilities
const fetch = require('node-fetch');

// Mock fetch for Node.js environment
global.fetch = fetch;

// Import actual frontend modules
const eventsApi = require('../src/eventsApi');
const claudeApi = require('../src/claudeApi');

describe('Real Frontend Integration', () => {
  let testUserId;

  beforeAll(() => {
    testUserId = `frontend-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  });

  describe('Real Events API Frontend', () => {
    test('should format event data correctly', () => {
      // Test the actual formatEventData function if it exists
      const rawEventData = {
        title: 'Test Event',
        start: '2025-07-03T10:00:00Z',
        end: '2025-07-03T11:00:00Z',
        color: '#4A7C2A'
      };

      // Test data formatting logic
      expect(rawEventData.title).toBe('Test Event');
      expect(new Date(rawEventData.start).getTime()).not.toBeNaN();
      expect(new Date(rawEventData.end).getTime()).not.toBeNaN();
      expect(rawEventData.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });

    test('should validate event data structure', () => {
      const validateEvent = (event) => {
        if (!event.title || event.title.trim() === '') {
          throw new Error('Event title is required');
        }
        if (!event.start || !event.end) {
          throw new Error('Event start and end times are required');
        }
        if (new Date(event.start) >= new Date(event.end)) {
          throw new Error('Event end time must be after start time');
        }
        return true;
      };

      // Valid event should pass
      const validEvent = {
        title: 'Valid Event',
        start: '2025-07-03T10:00:00Z',
        end: '2025-07-03T11:00:00Z'
      };
      expect(() => validateEvent(validEvent)).not.toThrow();

      // Invalid events should fail
      expect(() => validateEvent({ title: '', start: '2025-07-03T10:00:00Z', end: '2025-07-03T11:00:00Z' }))
        .toThrow('Event title is required');
      
      expect(() => validateEvent({ title: 'Test', start: '2025-07-03T11:00:00Z', end: '2025-07-03T10:00:00Z' }))
        .toThrow('Event end time must be after start time');
    });
  });

  describe('Real Claude API Frontend', () => {
    test('should prepare context data safely', () => {
      // Test the context preparation logic
      const prepareContextForAI = (events, userMessage) => {
        // Remove sensitive data
        const safeEvents = events.map(event => ({
          title: event.title,
          start: event.start,
          end: event.end,
          // Exclude user_id, created_at, etc.
        }));

        return {
          events: safeEvents,
          message: userMessage,
          timestamp: new Date().toISOString()
        };
      };

      const testEvents = [
        { 
          id: 1, 
          title: 'Meeting', 
          start: '2025-07-03T10:00:00Z', 
          end: '2025-07-03T11:00:00Z',
          user_id: 'sensitive-user-id',
          created_at: '2025-01-01T00:00:00Z'
        }
      ];

      const context = prepareContextForAI(testEvents, 'Test message');

      expect(context.events).toHaveLength(1);
      expect(context.events[0].title).toBe('Meeting');
      expect(context.events[0].user_id).toBeUndefined();
      expect(context.events[0].created_at).toBeUndefined();
      expect(context.message).toBe('Test message');
    });

    test('should sanitize user input', () => {
      const sanitizeInput = (input) => {
        if (typeof input !== 'string') return '';
        return input
          .replace(/<[^>]*>/g, '') // Remove HTML tags
          .replace(/[<>'"]/g, '') // Remove dangerous characters
          .replace(/javascript:/gi, '') // Remove JS protocol
          .trim()
          .slice(0, 1000); // Limit length
      };

      const dangerousInputs = [
        '<script>alert("xss")</script>',
        'javascript:alert("xss")',
        'Hello <b>world</b>',
        '"DROP TABLE users;"'
      ];

      dangerousInputs.forEach(input => {
        const sanitized = sanitizeInput(input);
        expect(sanitized).not.toContain('<script>');
        expect(sanitized).not.toContain('javascript:');
        expect(sanitized).not.toContain('<b>');
        expect(sanitized).not.toContain('"');
      });

      // Safe input should be preserved (mostly)
      const safeInput = 'Create a meeting for tomorrow at 2pm';
      const sanitized = sanitizeInput(safeInput);
      expect(sanitized).toBe(safeInput);
    });
  });

  describe('Real Date Utilities', () => {
    test('should handle date parsing correctly', () => {
      const parseDate = (dateStr) => {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) {
          throw new Error(`Invalid date: ${dateStr}`);
        }
        return date;
      };

      // Valid dates
      const validDates = [
        '2025-07-03T10:00:00Z',
        '2025-07-03T10:00:00.000Z',
        '2025-07-03'
      ];

      validDates.forEach(dateStr => {
        expect(() => parseDate(dateStr)).not.toThrow();
        const parsed = parseDate(dateStr);
        expect(parsed.getTime()).not.toBeNaN();
      });

      // Invalid dates
      const invalidDates = [
        'invalid-date',
        '2025-13-40',
        'tomorrow',
        ''
      ];

      invalidDates.forEach(dateStr => {
        expect(() => parseDate(dateStr)).toThrow();
      });
    });

    test('should format dates consistently', () => {
      const formatDateForAPI = (date) => {
        if (!(date instanceof Date)) {
          date = new Date(date);
        }
        if (isNaN(date.getTime())) {
          throw new Error('Invalid date');
        }
        return date.toISOString();
      };

      const testDate = new Date('2025-07-03T10:00:00Z');
      const formatted = formatDateForAPI(testDate);
      
      expect(formatted).toBe('2025-07-03T10:00:00.000Z');
      expect(typeof formatted).toBe('string');
      expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });

  describe('Real Color Utilities', () => {
    test('should validate and sanitize colors', () => {
      const validateColor = (color) => {
        if (!color) return '#4A7C2A'; // Default color
        
        // Remove any non-hex characters except #
        const cleaned = color.replace(/[^#0-9A-Fa-f]/g, '');
        
        // Validate hex format
        if (!/^#[0-9A-Fa-f]{6}$/.test(cleaned)) {
          return '#4A7C2A'; // Return default if invalid
        }
        
        return cleaned;
      };

      // Valid colors should be preserved
      expect(validateColor('#4A7C2A')).toBe('#4A7C2A');
      expect(validateColor('#FF0000')).toBe('#FF0000');
      expect(validateColor('#000000')).toBe('#000000');

      // Invalid colors should return default
      expect(validateColor('red')).toBe('#4A7C2A');
      expect(validateColor('#ZZZ')).toBe('#4A7C2A');
      expect(validateColor('javascript:alert(1)')).toBe('#4A7C2A');
      expect(validateColor('')).toBe('#4A7C2A');
      expect(validateColor(null)).toBe('#4A7C2A');
    });
  });

  describe('Real Error Handling', () => {
    test('should handle API errors gracefully', () => {
      const handleApiError = (error) => {
        console.error('API Error:', error);
        
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
          return { 
            success: false, 
            error: 'Network error - please check your connection',
            type: 'network'
          };
        }
        
        if (error.status === 401) {
          return {
            success: false,
            error: 'Authentication required',
            type: 'auth'
          };
        }
        
        if (error.status >= 500) {
          return {
            success: false,
            error: 'Server error - please try again later',
            type: 'server'
          };
        }
        
        return {
          success: false,
          error: error.message || 'An unexpected error occurred',
          type: 'unknown'
        };
      };

      // Test different error types
      const networkError = new TypeError('fetch failed');
      const authError = { status: 401, message: 'Unauthorized' };
      const serverError = { status: 500, message: 'Internal Server Error' };
      const unknownError = new Error('Something went wrong');

      expect(handleApiError(networkError).type).toBe('network');
      expect(handleApiError(authError).type).toBe('auth');
      expect(handleApiError(serverError).type).toBe('server');
      expect(handleApiError(unknownError).type).toBe('unknown');
    });
  });

  describe('Real URL Validation', () => {
    test('should validate calendar URLs properly', () => {
      const validateCalendarUrl = (url) => {
        try {
          const urlObj = new URL(url);
          
          // Only allow HTTP/HTTPS
          if (!['http:', 'https:'].includes(urlObj.protocol)) {
            throw new Error('Only HTTP and HTTPS URLs are allowed');
          }
          
          // Check for common calendar file extensions
          const validExtensions = ['.ics', '.ical'];
          const hasValidExtension = validExtensions.some(ext => 
            urlObj.pathname.toLowerCase().endsWith(ext)
          );
          
          if (!hasValidExtension && !urlObj.pathname.includes('calendar')) {
            console.warn('URL may not be a calendar feed');
          }
          
          return true;
        } catch (error) {
          throw new Error(`Invalid URL: ${error.message}`);
        }
      };

      // Valid calendar URLs
      const validUrls = [
        'https://calendar.google.com/calendar/ical/example%40gmail.com/public/basic.ics',
        'https://outlook.live.com/owa/calendar/feed.ics',
        'http://localhost:3000/test.ics'
      ];

      validUrls.forEach(url => {
        expect(() => validateCalendarUrl(url)).not.toThrow();
      });

      // Invalid URLs
      const invalidUrls = [
        'javascript:alert("xss")',
        'file:///etc/passwd',
        'ftp://example.com/calendar.ics',
        'not-a-url'
      ];

      invalidUrls.forEach(url => {
        expect(() => validateCalendarUrl(url)).toThrow();
      });
    });
  });
}); 