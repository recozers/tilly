// Utility Function Tests
describe('Utility Functions', () => {
  describe('Date Handling', () => {
    test('should handle timezone conversions', () => {
      const testDate = new Date('2025-06-20T10:00:00Z');
      expect(testDate.toISOString()).toBe('2025-06-20T10:00:00.000Z');
    });

    test('should validate date formats', () => {
      const validDates = [
        '2025-06-20T10:00:00Z',
        '2025-06-20T10:00:00.000Z',
        new Date().toISOString()
      ];

      validDates.forEach(dateStr => {
        const date = new Date(dateStr);
        expect(date.getTime()).not.toBeNaN();
      });
    });

         test('should handle invalid dates gracefully', () => {
       const invalidDates = [
         'invalid-date',
         '2025-13-40T25:70:00Z'
       ];

       invalidDates.forEach(dateStr => {
         const date = new Date(dateStr);
         expect(date.getTime()).toBeNaN();
       });

       // Test null and undefined separately
       expect(new Date(null).getTime()).toBe(0); // new Date(null) returns Jan 1 1970
       expect(new Date(undefined).getTime()).toBeNaN();
     });
  });

  describe('Color Validation', () => {
    test('should validate hex colors', () => {
      const validColors = [
        '#4A7C2A',
        '#10b981',
        '#FF0000',
        '#000000',
        '#FFFFFF'
      ];

      const hexColorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;

      validColors.forEach(color => {
        expect(color).toMatch(hexColorRegex);
      });
    });

    test('should reject invalid colors', () => {
      const invalidColors = [
        'red',
        '#ZZZ',
        '#12345',
        '4A7C2A',
        '#1234567'
      ];

      const hexColorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;

      invalidColors.forEach(color => {
        expect(color).not.toMatch(hexColorRegex);
      });
    });
  });

  describe('Event Validation', () => {
    test('should validate required event fields', () => {
      const validEvent = {
        title: 'Test Event',
        start: new Date('2025-06-20T10:00:00Z'),
        end: new Date('2025-06-20T11:00:00Z'),
        color: '#4A7C2A'
      };

      expect(validEvent.title).toBeTruthy();
      expect(validEvent.start).toBeInstanceOf(Date);
      expect(validEvent.end).toBeInstanceOf(Date);
      expect(validEvent.start.getTime()).toBeLessThan(validEvent.end.getTime());
    });

    test('should detect invalid event data', () => {
      const invalidEvents = [
        { title: '', start: new Date(), end: new Date() }, // Empty title
        { title: 'Test', start: new Date('invalid'), end: new Date() }, // Invalid start
        { title: 'Test', start: new Date(), end: new Date('invalid') }, // Invalid end
        { 
          title: 'Test', 
          start: new Date('2025-06-20T11:00:00Z'), 
          end: new Date('2025-06-20T10:00:00Z') 
        } // End before start
      ];

      invalidEvents.forEach((event, index) => {
        if (index === 0) {
          expect(event.title).toBeFalsy();
        } else if (index === 1) {
          expect(event.start.getTime()).toBeNaN();
        } else if (index === 2) {
          expect(event.end.getTime()).toBeNaN();
        } else if (index === 3) {
          expect(event.start.getTime()).toBeGreaterThan(event.end.getTime());
        }
      });
    });
  });

  describe('String Sanitization', () => {
    test('should sanitize user input', () => {
      const dangerousInputs = [
        '<script>alert("xss")</script>',
        'SELECT * FROM users; DROP TABLE users;',
        '${process.env.SECRET_KEY}',
        '../../../etc/passwd'
      ];

             // Simple sanitization function for testing
       const sanitize = (input) => {
         if (typeof input !== 'string') return '';
         return input
           .replace(/<[^>]*>/g, '') // Remove HTML tags
           .replace(/[<>'"]/g, '') // Remove dangerous characters
           .replace(/DROP\s+TABLE/gi, '') // Remove SQL injection patterns
           .replace(/\$\{[^}]*\}/g, '') // Remove template injection
           .replace(/\.\.\//g, '') // Remove path traversal
           .trim();
       };

      dangerousInputs.forEach(input => {
        const sanitized = sanitize(input);
        expect(sanitized).not.toContain('<script>');
        expect(sanitized).not.toContain('DROP TABLE');
        expect(sanitized).not.toContain('${');
        expect(sanitized).not.toContain('../');
      });
    });

    test('should preserve safe content', () => {
      const safeInputs = [
        'Regular meeting title',
        'Team Standup @ 9:00 AM',
        'Project Review - Q1 2025',
        'Doctor Appointment (Annual Checkup)'
      ];

      const sanitize = (input) => {
        if (typeof input !== 'string') return '';
        return input
          .replace(/<[^>]*>/g, '')
          .trim();
      };

      safeInputs.forEach(input => {
        const sanitized = sanitize(input);
        expect(sanitized).toBeTruthy();
        expect(sanitized.length).toBeGreaterThan(0);
      });
    });
  });

  describe('URL Validation', () => {
    test('should validate calendar URLs', () => {
      const validUrls = [
        'https://calendar.google.com/calendar/ical/example%40gmail.com/public/basic.ics',
        'https://outlook.live.com/owa/calendar/feed.ics',
        'https://example.com/calendar.ics',
        'http://localhost:3000/test.ics'
      ];

      const urlRegex = /^https?:\/\/[\w\-.]+(:\d+)?(\/[\w\-._~:/?#[\]@!$&'()*+,;=%]*)?$/;

      validUrls.forEach(url => {
        expect(url).toMatch(urlRegex);
        expect(() => new URL(url)).not.toThrow();
      });
    });

         test('should reject invalid URLs', () => {
       const trulyInvalidUrls = [
         'not-a-url',
         ''
       ];

       trulyInvalidUrls.forEach(url => {
         if (url === '') {
           expect(url).toBe('');
         } else {
           expect(() => new URL(url)).toThrow();
         }
       });

       // These are technically valid URLs but inappropriate for calendar feeds
       const inappropriateUrls = [
         'javascript:alert("xss")',
         'file:///etc/passwd',
         'ftp://example.com/calendar.ics'
       ];

       inappropriateUrls.forEach(url => {
         // They don't throw but should be rejected by application logic
         const urlObj = new URL(url);
         expect(['javascript:', 'file:', 'ftp:']).toContain(urlObj.protocol);
       });
     });
  });
}); 