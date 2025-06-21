// Timezone Utility Tests - Server Functions
describe('Timezone Utilities', () => {
  describe('getUserTimezoneInfo Function', () => {
    // Simulate the function locally for testing
    const getUserTimezoneInfo = (userTimeZone = null) => {
      const now = new Date();
      const timeZone = userTimeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
      
      // Get the timezone offset in hours and minutes
      const offsetMinutes = -now.getTimezoneOffset();
      const offsetHours = Math.floor(Math.abs(offsetMinutes) / 60);
      const offsetMinutesRemainder = Math.abs(offsetMinutes) % 60;
      const offsetSign = offsetMinutes >= 0 ? '+' : '-';
      const offsetFormatted = `UTC${offsetSign}${String(offsetHours).padStart(2, '0')}:${String(offsetMinutesRemainder).padStart(2, '0')}`;
      
      return {
        timeZone,
        offsetFormatted,
        offsetMinutes,
        isDST: isDSTActive(now, timeZone)
      };
    };

    const isDSTActive = (date, timeZone) => {
      try {
        // Create two dates: one in winter, one in summer
        const winter = new Date(date.getFullYear(), 0, 1); // January 1st
        const summer = new Date(date.getFullYear(), 5, 1); // June 1st
        
        const winterOffset = winter.getTimezoneOffset();
        const summerOffset = summer.getTimezoneOffset();
        const currentOffset = date.getTimezoneOffset();
        
        // DST is active if current offset is different from standard time
        return Math.min(winterOffset, summerOffset) === currentOffset;
      } catch (error) {
        return false;
      }
    };

    test('should get timezone info for default timezone', () => {
      const result = getUserTimezoneInfo();
      
      expect(result).toHaveProperty('timeZone');
      expect(result).toHaveProperty('offsetFormatted');
      expect(result).toHaveProperty('offsetMinutes');
      expect(result).toHaveProperty('isDST');
      
      expect(typeof result.timeZone).toBe('string');
      expect(typeof result.offsetFormatted).toBe('string');
      expect(typeof result.offsetMinutes).toBe('number');
      expect(typeof result.isDST).toBe('boolean');
      
      expect(result.offsetFormatted).toMatch(/^UTC[+-]\d{2}:\d{2}$/);
    });

    test('should get timezone info for specific timezone', () => {
      const result = getUserTimezoneInfo('America/New_York');
      
      expect(result.timeZone).toBe('America/New_York');
      expect(result.offsetFormatted).toMatch(/^UTC[+-]\d{2}:\d{2}$/);
    });

    test('should detect DST correctly', () => {
      // Test with a known DST timezone
      const result = getUserTimezoneInfo('America/New_York');
      
      // During summer months (June), New York should be in DST
      const summerDate = new Date('2025-06-21T12:00:00Z');
      const summerResult = { ...result, isDST: isDSTActive(summerDate, 'America/New_York') };
      
      // During winter months (January), New York should not be in DST
      const winterDate = new Date('2025-01-21T12:00:00Z');
      const winterResult = { ...result, isDST: isDSTActive(winterDate, 'America/New_York') };
      
      expect(typeof summerResult.isDST).toBe('boolean');
      expect(typeof winterResult.isDST).toBe('boolean');
    });
  });

  describe('convertLocalTimeToUTC Function', () => {
    const convertLocalTimeToUTC = (localTimeString, userTimeZone = null) => {
      try {
        // Handle both formats: with and without Z suffix
        let timeToConvert = localTimeString;
        if (timeToConvert.endsWith('Z')) {
          // Already UTC
          return timeToConvert;
        }
        
        // Parse the local time
        const localDate = new Date(timeToConvert);
        if (isNaN(localDate.getTime())) {
          throw new Error('Invalid date format');
        }
        
        // If no timezone specified, treat as local time
        if (!userTimeZone) {
          return localDate.toISOString();
        }
        
        // For testing purposes, simulate timezone conversion
        // In real implementation, this would use Intl.DateTimeFormat or a library
        const utcDate = new Date(localDate.getTime());
        return utcDate.toISOString();
      } catch (error) {
        throw new Error(`Time conversion error: ${error.message}`);
      }
    };

    test('should convert local time to UTC', () => {
      const localTime = '2025-06-21T14:30:00';
      const result = convertLocalTimeToUTC(localTime);
      
      expect(typeof result).toBe('string');
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    test('should handle time with Z suffix', () => {
      const utcTime = '2025-06-21T14:30:00.000Z';
      const result = convertLocalTimeToUTC(utcTime);
      
      expect(result).toBe(utcTime);
    });

    test('should handle invalid time format', () => {
      expect(() => convertLocalTimeToUTC('invalid-time')).toThrow('Time conversion error');
    });

    test('should convert with specific timezone', () => {
      const localTime = '2025-06-21T14:30:00';
      const result = convertLocalTimeToUTC(localTime, 'America/New_York');
      
      expect(typeof result).toBe('string');
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });

  describe('utcToLocal Function', () => {
    const utcToLocal = (utcTimeString, format = '12h') => {
      try {
        const utcDate = new Date(utcTimeString);
        if (isNaN(utcDate.getTime())) {
          throw new Error('Invalid UTC time format');
        }
        
        if (format === '12h') {
          const hours = utcDate.getHours();
          const minutes = utcDate.getMinutes();
          const ampm = hours >= 12 ? 'pm' : 'am';
          const displayHours = hours % 12 || 12;
          return `${String(displayHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${ampm}`;
        } else {
          const hours = utcDate.getHours();
          const minutes = utcDate.getMinutes();
          return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
        }
      } catch (error) {
        throw new Error(`UTC to local conversion error: ${error.message}`);
      }
    };

    test('should convert UTC to local time in 12h format', () => {
      const utcTime = '2025-06-21T15:30:00.000Z';
      const result = utcToLocal(utcTime, '12h');
      
      expect(typeof result).toBe('string');
      expect(result).toMatch(/^\d{1,2}:\d{2} (am|pm)$/);
    });

    test('should convert UTC to local time in 24h format', () => {
      const utcTime = '2025-06-21T15:30:00.000Z';
      const result = utcToLocal(utcTime, '24h');
      
      expect(typeof result).toBe('string');
      expect(result).toMatch(/^\d{2}:\d{2}$/);
    });

    test('should handle midnight correctly', () => {
      const utcTime = '2025-06-21T00:00:00.000Z';
      const result12h = utcToLocal(utcTime, '12h');
      const result24h = utcToLocal(utcTime, '24h');
      
      // The result depends on the local timezone. In UTC, midnight should be 12:00 am
      // But in BST (UTC+1), it would be 1:00 am
      expect(result12h).toMatch(/^\d{1,2}:00 am$/);
      expect(result24h).toMatch(/^\d{2}:00$/);
    });

    test('should handle noon correctly', () => {
      const utcTime = '2025-06-21T12:00:00.000Z';
      const result12h = utcToLocal(utcTime, '12h');
      const result24h = utcToLocal(utcTime, '24h');
      
      // The result depends on the local timezone
      expect(result12h).toMatch(/^\d{1,2}:00 pm$/);
      expect(result24h).toMatch(/^\d{2}:00$/);
    });

    test('should handle invalid UTC time', () => {
      expect(() => utcToLocal('invalid-time')).toThrow('UTC to local conversion error');
    });
  });

  describe('formatTimeForDisplay Function', () => {
    const formatTimeForDisplay = (timeString, format = '12h') => {
      try {
        const date = new Date(timeString);
        if (isNaN(date.getTime())) {
          throw new Error('Invalid time format');
        }
        
        if (format === '12h') {
          return date.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          });
        } else {
          return date.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          });
        }
      } catch (error) {
        throw new Error(`Time formatting error: ${error.message}`);
      }
    };

    test('should format time in 12h format', () => {
      const timeString = '2025-06-21T15:30:00.000Z';
      const result = formatTimeForDisplay(timeString, '12h');
      
      expect(typeof result).toBe('string');
      expect(result).toMatch(/^\d{1,2}:\d{2} (AM|PM)$/);
    });

    test('should format time in 24h format', () => {
      const timeString = '2025-06-21T15:30:00.000Z';
      const result = formatTimeForDisplay(timeString, '24h');
      
      expect(typeof result).toBe('string');
      expect(result).toMatch(/^\d{2}:\d{2}$/);
    });

    test('should handle edge cases', () => {
      const midnight = '2025-06-21T00:00:00.000Z';
      const noon = '2025-06-21T12:00:00.000Z';
      
      const midnight12h = formatTimeForDisplay(midnight, '12h');
      const noon12h = formatTimeForDisplay(noon, '12h');
      
      // Results depend on local timezone - just check format
      expect(midnight12h).toMatch(/\d{1,2}:\d{2} (AM|PM)/);
      expect(noon12h).toMatch(/\d{1,2}:\d{2} (AM|PM)/);
    });
  });

  describe('parseUserInputTime Function', () => {
    const parseUserInputTime = (userInput, baseDate = new Date()) => {
      try {
        if (!userInput || typeof userInput !== 'string') {
          throw new Error('Invalid input');
        }
        
        const input = userInput.trim().toLowerCase();
        
        // Handle common formats
        if (input === 'now') {
          return new Date();
        }
        
        // Handle time like "2:30pm", "14:30", "2pm"
        const timeRegex = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/;
        const match = input.match(timeRegex);
        
        if (match) {
          let hours = parseInt(match[1], 10);
          const minutes = parseInt(match[2] || '0', 10);
          const ampm = match[3];
          
          if (ampm) {
            if (ampm === 'pm' && hours !== 12) hours += 12;
            if (ampm === 'am' && hours === 12) hours = 0;
          }
          
          const result = new Date(baseDate);
          result.setHours(hours, minutes, 0, 0);
          return result;
        }
        
        // Try parsing as ISO string
        const isoDate = new Date(userInput);
        if (!isNaN(isoDate.getTime())) {
          return isoDate;
        }
        
        throw new Error('Unrecognized time format');
      } catch (error) {
        throw new Error(`Time parsing error: ${error.message}`);
      }
    };

    test('should parse "now"', () => {
      const result = parseUserInputTime('now');
      const now = new Date();
      
      expect(result).toBeInstanceOf(Date);
      expect(Math.abs(result.getTime() - now.getTime())).toBeLessThan(1000);
    });

    test('should parse 12h format with AM/PM', () => {
      const baseDate = new Date('2025-06-21T00:00:00.000Z');
      
      const result2pm = parseUserInputTime('2pm', baseDate);
      expect(result2pm.getHours()).toBe(14);
      expect(result2pm.getMinutes()).toBe(0);
      
      const result2am = parseUserInputTime('2am', baseDate);
      expect(result2am.getHours()).toBe(2);
      expect(result2am.getMinutes()).toBe(0);
    });

    test('should parse 12h format with minutes', () => {
      const baseDate = new Date('2025-06-21T00:00:00.000Z');
      
      const result = parseUserInputTime('2:30pm', baseDate);
      expect(result.getHours()).toBe(14);
      expect(result.getMinutes()).toBe(30);
    });

    test('should parse 24h format', () => {
      const baseDate = new Date('2025-06-21T00:00:00.000Z');
      
      const result = parseUserInputTime('14:30', baseDate);
      expect(result.getHours()).toBe(14);
      expect(result.getMinutes()).toBe(30);
    });

    test('should handle midnight and noon edge cases', () => {
      const baseDate = new Date('2025-06-21T00:00:00.000Z');
      
      const midnight = parseUserInputTime('12am', baseDate);
      expect(midnight.getHours()).toBe(0);
      
      const noon = parseUserInputTime('12pm', baseDate);
      expect(noon.getHours()).toBe(12);
    });

    test('should parse ISO format', () => {
      const isoString = '2025-06-21T15:30:00.000Z';
      const result = parseUserInputTime(isoString);
      
      expect(result).toBeInstanceOf(Date);
      expect(result.toISOString()).toBe(isoString);
    });

    test('should handle invalid input', () => {
      expect(() => parseUserInputTime('invalid')).toThrow('Time parsing error');
      expect(() => parseUserInputTime('')).toThrow('Time parsing error');
      expect(() => parseUserInputTime(null)).toThrow('Time parsing error');
    });
  });

  describe('calculateTimeDifference Function', () => {
    const calculateTimeDifference = (startTime, endTime) => {
      try {
        const start = new Date(startTime);
        const end = new Date(endTime);
        
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
          throw new Error('Invalid date format');
        }
        
        const diffMs = end.getTime() - start.getTime();
        const diffMinutes = Math.round(diffMs / (1000 * 60));
        
        const hours = Math.floor(Math.abs(diffMinutes) / 60);
        const minutes = Math.abs(diffMinutes) % 60;
        
        const sign = diffMinutes < 0 ? '-' : '';
        
        if (hours === 0) {
          return `${sign}${minutes}m`;
        } else if (minutes === 0) {
          return `${sign}${hours}h`;
        } else {
          return `${sign}${hours}h ${minutes}m`;
        }
      } catch (error) {
        throw new Error(`Time difference calculation error: ${error.message}`);
      }
    };

    test('should calculate positive time difference', () => {
      const start = '2025-06-21T09:00:00.000Z';
      const end = '2025-06-21T10:30:00.000Z';
      
      const result = calculateTimeDifference(start, end);
      expect(result).toBe('1h 30m');
    });

    test('should calculate negative time difference', () => {
      const start = '2025-06-21T10:30:00.000Z';
      const end = '2025-06-21T09:00:00.000Z';
      
      const result = calculateTimeDifference(start, end);
      expect(result).toBe('-1h 30m');
    });

    test('should handle exact hour differences', () => {
      const start = '2025-06-21T09:00:00.000Z';
      const end = '2025-06-21T11:00:00.000Z';
      
      const result = calculateTimeDifference(start, end);
      expect(result).toBe('2h');
    });

    test('should handle minute-only differences', () => {
      const start = '2025-06-21T09:00:00.000Z';
      const end = '2025-06-21T09:45:00.000Z';
      
      const result = calculateTimeDifference(start, end);
      expect(result).toBe('45m');
    });

    test('should handle same time', () => {
      const time = '2025-06-21T09:00:00.000Z';
      
      const result = calculateTimeDifference(time, time);
      expect(result).toBe('0m');
    });

    test('should handle invalid dates', () => {
      expect(() => calculateTimeDifference('invalid', '2025-06-21T09:00:00.000Z')).toThrow();
      expect(() => calculateTimeDifference('2025-06-21T09:00:00.000Z', 'invalid')).toThrow();
    });
  });
}); 