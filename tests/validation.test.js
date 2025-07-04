// Validation and Error Handling Tests
describe('Validation Functions', () => {
  describe('OpenAI Action Data Validation', () => {
    // Simulate the validation function locally for testing
    const validateActionData = (actionData, context = null) => {
      try {
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
            
            if (!rearrangement.newStart || typeof rearrangement.newStart !== 'string') {
              return { valid: false, error: `Invalid newStart in rearrangement ${i}` };
            }
            
            if (!rearrangement.newEnd || typeof rearrangement.newEnd !== 'string') {
              return { valid: false, error: `Invalid newEnd in rearrangement ${i}` };
            }
          }
          
          return { valid: true };
        }
        
        return { valid: false, error: `Unknown action type: ${actionData.type}` };
      } catch (error) {
        return { valid: false, error: `Validation error: ${error.message}` };
      }
    };

    test('should validate valid event suggestion', () => {
      const validData = {
        type: 'event_suggestion',
        eventData: {
          title: 'Test Meeting',
          start: '2025-06-21T14:00:00',
          end: '2025-06-21T15:00:00'
        }
      };
      
      const result = validateActionData(validData);
      expect(result.valid).toBe(true);
    });

    test('should reject event suggestion with missing eventData', () => {
      const invalidData = {
        type: 'event_suggestion'
      };
      
      const result = validateActionData(invalidData);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Missing eventData for event_suggestion');
    });

    test('should reject event suggestion with empty title', () => {
      const invalidData = {
        type: 'event_suggestion',
        eventData: {
          title: '',
          start: '2025-06-21T14:00:00',
          end: '2025-06-21T15:00:00'
        }
      };
      
      const result = validateActionData(invalidData);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid or missing event title');
    });

    test('should reject event suggestion with invalid time format', () => {
      const invalidData = {
        type: 'event_suggestion',
        eventData: {
          title: 'Test Meeting',
          start: '2025-06-21T14:00:00Z', // Z suffix not allowed
          end: '2025-06-21T15:00:00'
        }
      };
      
      const result = validateActionData(invalidData);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid start time format');
    });

    test('should reject event suggestion with end before start', () => {
      const invalidData = {
        type: 'event_suggestion',
        eventData: {
          title: 'Test Meeting',
          start: '2025-06-21T15:00:00',
          end: '2025-06-21T14:00:00'
        }
      };
      
      const result = validateActionData(invalidData);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Start time');
      expect(result.error).toContain('must be before end time');
    });

    test('should validate valid event rearrangement', () => {
      const validData = {
        type: 'event_rearrangement',
        rearrangements: [{
          eventId: 123,
          currentTitle: 'Meeting',
          newStart: '2025-06-21T14:00:00',
          newEnd: '2025-06-21T15:00:00'
        }]
      };
      
      const result = validateActionData(validData);
      expect(result.valid).toBe(true);
    });

    test('should reject event rearrangement with missing rearrangements', () => {
      const invalidData = {
        type: 'event_rearrangement'
      };
      
      const result = validateActionData(invalidData);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Missing or invalid rearrangements array');
    });

    test('should reject event rearrangement with empty array', () => {
      const invalidData = {
        type: 'event_rearrangement',
        rearrangements: []
      };
      
      const result = validateActionData(invalidData);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Empty rearrangements array');
    });

    test('should reject unknown action type', () => {
      const invalidData = {
        type: 'unknown_action'
      };
      
      const result = validateActionData(invalidData);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Unknown action type: unknown_action');
    });
  });

  describe('Event Data Validation', () => {
    test('should validate event structure', () => {
      const validateEvent = (event) => {
        if (!event || typeof event !== 'object') {
          throw new Error('Event must be an object');
        }
        if (!event.title || typeof event.title !== 'string' || event.title.trim() === '') {
          throw new Error('Event title is required and must be a non-empty string');
        }
        if (!event.start) {
          throw new Error('Event start time is required');
        }
        if (!event.end) {
          throw new Error('Event end time is required');
        }
        
        const startDate = new Date(event.start);
        const endDate = new Date(event.end);
        
        if (isNaN(startDate.getTime())) {
          throw new Error('Invalid start time');
        }
        if (isNaN(endDate.getTime())) {
          throw new Error('Invalid end time');
        }
        if (startDate >= endDate) {
          throw new Error('Event end time must be after start time');
        }
        
        return true;
      };

      // Valid event
      const validEvent = {
        title: 'Test Event',
        start: '2025-06-21T14:00:00Z',
        end: '2025-06-21T15:00:00Z'
      };
      expect(() => validateEvent(validEvent)).not.toThrow();

      // Invalid events
      expect(() => validateEvent(null)).toThrow('Event must be an object');
      expect(() => validateEvent({ title: '', start: '2025-06-21T14:00:00Z', end: '2025-06-21T15:00:00Z' }))
        .toThrow('Event title is required');
      expect(() => validateEvent({ title: 'Test', end: '2025-06-21T15:00:00Z' }))
        .toThrow('Event start time is required');
      expect(() => validateEvent({ title: 'Test', start: '2025-06-21T14:00:00Z' }))
        .toThrow('Event end time is required');
      expect(() => validateEvent({ title: 'Test', start: 'invalid', end: '2025-06-21T15:00:00Z' }))
        .toThrow('Invalid start time');
      expect(() => validateEvent({ title: 'Test', start: '2025-06-21T15:00:00Z', end: '2025-06-21T14:00:00Z' }))
        .toThrow('Event end time must be after start time');
    });
  });

  describe('Input Sanitization', () => {
    test('should sanitize event titles', () => {
      const sanitizeTitle = (title) => {
        if (!title || typeof title !== 'string') return '';
        
        // Remove dangerous characters and limit length
        return title
          .replace(/<script[^>]*>.*?<\/script>/gi, '')
          .replace(/<[^>]*>/g, '')
          .replace(/javascript:/gi, '')
          .trim()
          .substring(0, 100);
      };

      expect(sanitizeTitle('Normal Title')).toBe('Normal Title');
      expect(sanitizeTitle('<script>alert("xss")</script>Meeting')).toBe('Meeting');
      expect(sanitizeTitle('<b>Bold</b> Meeting')).toBe('Bold Meeting');
      expect(sanitizeTitle('javascript:alert(1)')).toBe('alert(1)');
      expect(sanitizeTitle('  Trimmed  ')).toBe('Trimmed');
      expect(sanitizeTitle('A'.repeat(150))).toHaveLength(100);
      expect(sanitizeTitle(null)).toBe('');
      expect(sanitizeTitle(undefined)).toBe('');
    });

    test('should sanitize colors', () => {
      const sanitizeColor = (color) => {
        if (!color || typeof color !== 'string') return '#4A7C2A';
        
        // Remove any non-hex characters except #
        const cleaned = color.replace(/[^#0-9A-Fa-f]/g, '');
        
        // Validate hex format
        if (!/^#[0-9A-Fa-f]{6}$/.test(cleaned)) {
          return '#4A7C2A'; // Return default if invalid
        }
        
        return cleaned;
      };

      expect(sanitizeColor('#FF0000')).toBe('#FF0000');
      expect(sanitizeColor('#4A7C2A')).toBe('#4A7C2A');
      expect(sanitizeColor('red')).toBe('#4A7C2A');
      expect(sanitizeColor('#ZZZ')).toBe('#4A7C2A');
      expect(sanitizeColor('javascript:alert(1)')).toBe('#4A7C2A');
      expect(sanitizeColor(null)).toBe('#4A7C2A');
      expect(sanitizeColor(undefined)).toBe('#4A7C2A');
    });
  });

  describe('File Validation', () => {
    test('should validate file types', () => {
      const validateFileType = (filename, allowedTypes = ['.ics', '.ical']) => {
        if (!filename || typeof filename !== 'string') {
          throw new Error('Filename is required');
        }
        
        const extension = filename.toLowerCase().substring(filename.lastIndexOf('.'));
        
        if (!allowedTypes.includes(extension)) {
          throw new Error(`Invalid file type. Allowed types: ${allowedTypes.join(', ')}`);
        }
        
        return true;
      };

      // Valid files
      expect(() => validateFileType('calendar.ics')).not.toThrow();
      expect(() => validateFileType('my-calendar.ical')).not.toThrow();
      expect(() => validateFileType('CALENDAR.ICS')).not.toThrow();

      // Invalid files
      expect(() => validateFileType('document.pdf')).toThrow('Invalid file type');
      expect(() => validateFileType('calendar.txt')).toThrow('Invalid file type');
      expect(() => validateFileType('')).toThrow('Filename is required');
      expect(() => validateFileType(null)).toThrow('Filename is required');
    });

    test('should validate file size', () => {
      const validateFileSize = (size, maxSize = 5 * 1024 * 1024) => {
        if (typeof size !== 'number' || size < 0) {
          throw new Error('Invalid file size');
        }
        
        if (size > maxSize) {
          throw new Error(`File too large. Maximum size is ${Math.floor(maxSize / 1024 / 1024)}MB`);
        }
        
        return true;
      };

      // Valid sizes
      expect(() => validateFileSize(1024)).not.toThrow(); // 1KB
      expect(() => validateFileSize(1024 * 1024)).not.toThrow(); // 1MB
      expect(() => validateFileSize(4 * 1024 * 1024)).not.toThrow(); // 4MB

      // Invalid sizes
      expect(() => validateFileSize(10 * 1024 * 1024)).toThrow('File too large');
      expect(() => validateFileSize(-1)).toThrow('Invalid file size');
      expect(() => validateFileSize('not-a-number')).toThrow('Invalid file size');
    });
  });

  describe('URL Validation', () => {
    test('should validate calendar URLs', () => {
      const validateCalendarUrl = (url) => {
        try {
          const urlObj = new URL(url);
          
          // Only allow HTTP/HTTPS
          if (!['http:', 'https:'].includes(urlObj.protocol)) {
            throw new Error('Only HTTP and HTTPS URLs are allowed');
          }
          
          return true;
        } catch (error) {
          throw new Error(`Invalid URL: ${error.message}`);
        }
      };

      // Valid URLs
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

  describe('Email Validation', () => {
    test('should validate email addresses', () => {
      const validateEmail = (email) => {
        if (!email || typeof email !== 'string') {
          throw new Error('Email is required');
        }
        
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        
        if (!emailRegex.test(email)) {
          throw new Error('Invalid email format');
        }
        
        return true;
      };

      // Valid emails
      const validEmails = [
        'user@example.com',
        'test.email+tag@domain.co.uk',
        'user123@test-domain.org'
      ];

      validEmails.forEach(email => {
        expect(() => validateEmail(email)).not.toThrow();
      });

      // Invalid emails
      const invalidEmails = [
        'invalid-email',
        '@domain.com',
        'user@',
        'user@domain',
        '',
        null,
        undefined
      ];

      invalidEmails.forEach(email => {
        expect(() => validateEmail(email)).toThrow();
      });
    });

    test('should validate multiple emails', () => {
      const validateEmails = (emails) => {
        if (!Array.isArray(emails)) {
          throw new Error('Emails must be an array');
        }
        
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const validEmails = emails.filter(email => 
          email && typeof email === 'string' && emailRegex.test(email.trim())
        );
        
        if (validEmails.length === 0) {
          throw new Error('At least one valid email is required');
        }
        
        return validEmails;
      };

      // Valid email arrays
      expect(() => validateEmails(['user@example.com'])).not.toThrow();
      expect(() => validateEmails(['user1@example.com', 'user2@example.com'])).not.toThrow();

      // Invalid email arrays
      expect(() => validateEmails('not-an-array')).toThrow('Emails must be an array');
      expect(() => validateEmails([])).toThrow('At least one valid email is required');
      expect(() => validateEmails(['invalid-email'])).toThrow('At least one valid email is required');
      
      // Mixed valid/invalid should return only valid ones
      const result = validateEmails(['user@example.com', 'invalid-email', 'user2@example.com']);
      expect(result).toEqual(['user@example.com', 'user2@example.com']);
    });
  });
}); 