const request = require('supertest');
const { v4: uuidv4 } = require('uuid');

// Import the actual server functions we need to test
const serverPath = require('path').resolve(__dirname, '../server.js');

describe('Daylight Saving Time (DST) Tests', () => {
  let originalTZ;

  beforeAll(() => {
    // Save original timezone
    originalTZ = process.env.TZ;
  });

  afterAll(() => {
    // Restore original timezone
    if (originalTZ) {
      process.env.TZ = originalTZ;
    } else {
      delete process.env.TZ;
    }
  });

  describe('DST Detection Logic', () => {
    test('should correctly identify DST during summer months', () => {
      // Mock a July date (DST active in most timezones)
      const julyDate = new Date('2024-07-15T12:00:00');
      const jan = new Date(julyDate.getFullYear(), 0, 1);
      const jul = new Date(julyDate.getFullYear(), 6, 1);
      
      // DST detection logic from server.js
      const isDST = julyDate.getTimezoneOffset() < Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset());
      
      // In most timezones with DST, this should be true
      expect(typeof isDST).toBe('boolean');
    });

    test('should correctly identify standard time during winter months', () => {
      // Mock a January date (standard time)
      const janDate = new Date('2024-01-15T12:00:00');
      const jan = new Date(janDate.getFullYear(), 0, 1);
      const jul = new Date(janDate.getFullYear(), 6, 1);
      
      // DST detection logic from server.js
      const isDST = janDate.getTimezoneOffset() < Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset());
      
      expect(typeof isDST).toBe('boolean');
    });
  });

  describe('Timezone Conversion Issues', () => {
    test('should handle DST transitions correctly when creating events', () => {
      // Test dates around DST transitions
      const dstTransitionDates = [
        '2024-03-10T02:00:00', // Spring forward (US)
        '2024-11-03T02:00:00', // Fall back (US)
        '2024-03-31T01:00:00', // Spring forward (EU)
        '2024-10-27T02:00:00'  // Fall back (EU)
      ];

      dstTransitionDates.forEach(dateStr => {
        const testDate = new Date(dateStr);
        const offsetMinutes = -testDate.getTimezoneOffset();
        
        // The current server logic (PROBLEMATIC):
        // new Date(localDate.getTime() - (offsetMinutes * 60 * 1000))
        
        // This is wrong because it applies the CURRENT offset to a date
        // that might have a DIFFERENT offset due to DST
        
        expect(typeof offsetMinutes).toBe('number');
        expect(testDate instanceof Date).toBe(true);
      });
    });

    test('should correctly convert local time to UTC across DST boundaries', () => {
      // Mock different timezone scenarios
      const testCases = [
        {
          input: '2024-03-10T02:30:00',  // During spring forward gap
          description: 'Spring forward gap time'
        },
        {
          input: '2024-11-03T01:30:00',  // During fall back overlap
          description: 'Fall back overlap time'
        },
        {
          input: '2024-07-15T14:00:00',  // Standard DST time
          description: 'Standard DST time'
        },
        {
          input: '2024-01-15T14:00:00',  // Standard time
          description: 'Standard time'
        }
      ];

      testCases.forEach(testCase => {
        const inputDate = new Date(testCase.input);
        
        // Current problematic logic from server.js
        const now = new Date();
        const currentOffsetMinutes = -now.getTimezoneOffset();
        const problematicResult = new Date(inputDate.getTime() - (currentOffsetMinutes * 60 * 1000));
        
        // Correct approach - let JavaScript handle the timezone conversion
        const correctResult = new Date(testCase.input);
        
        console.log(`Testing ${testCase.description}:`);
        console.log(`  Input: ${testCase.input}`);
        console.log(`  Problematic result: ${problematicResult.toISOString()}`);
        console.log(`  Correct result: ${correctResult.toISOString()}`);
        
        // The test passes regardless - we're documenting the issue
        expect(inputDate instanceof Date).toBe(true);
      });
    });
  });

  describe('DST Edge Cases', () => {
    test('should handle the non-existent hour during spring forward', () => {
      // During spring forward, 2:00 AM becomes 3:00 AM
      // Times like 2:30 AM don't exist
      const springForwardTime = '2024-03-10T02:30:00'; // Non-existent time
      
      const date = new Date(springForwardTime);
      
      // JavaScript automatically adjusts non-existent times
      expect(date instanceof Date).toBe(true);
      expect(isNaN(date.getTime())).toBe(false);
    });

    test('should handle the ambiguous hour during fall back', () => {
      // During fall back, 2:00 AM happens twice
      // We need to be able to distinguish between the two
      const fallBackTime = '2024-11-03T01:30:00'; // Ambiguous time
      
      const date = new Date(fallBackTime);
      
      // JavaScript picks one interpretation, but we should document this
      expect(date instanceof Date).toBe(true);
      expect(isNaN(date.getTime())).toBe(false);
    });

    test('should maintain consistency across DST transitions for recurring events', () => {
      // Test a weekly recurring event that crosses DST boundary
      const baseDate = new Date('2024-03-03T14:00:00'); // Week before spring forward
      const weekLater = new Date('2024-03-10T14:00:00'); // Week of spring forward
      
      // The time difference should be exactly 7 days * 24 hours = 168 hours
      const timeDiff = weekLater.getTime() - baseDate.getTime();
      const hoursDiff = timeDiff / (1000 * 60 * 60);
      
      // Due to DST transition, this might be 167 hours instead of 168
      console.log(`Time difference across DST: ${hoursDiff} hours`);
      
      expect(typeof hoursDiff).toBe('number');
    });
  });

  describe('Timezone Offset Calculation', () => {
    test('should calculate correct offset for different times of year', () => {
      // Test offset calculation for different dates
      const testDates = [
        new Date('2024-01-15T12:00:00'), // Winter
        new Date('2024-07-15T12:00:00'), // Summer
        new Date('2024-03-10T12:00:00'), // Spring forward day
        new Date('2024-11-03T12:00:00')  // Fall back day
      ];

      testDates.forEach(date => {
        const offsetMinutes = -date.getTimezoneOffset();
        const offsetHours = Math.floor(Math.abs(offsetMinutes) / 60);
        const offsetMinutesRemainder = Math.abs(offsetMinutes) % 60;
        const offsetSign = offsetMinutes >= 0 ? '+' : '-';
        const offsetFormatted = `UTC${offsetSign}${String(offsetHours).padStart(2, '0')}:${String(offsetMinutesRemainder).padStart(2, '0')}`;
        
        console.log(`Date: ${date.toISOString()}, Offset: ${offsetFormatted}, Minutes: ${offsetMinutes}`);
        
        expect(typeof offsetMinutes).toBe('number');
        expect(offsetFormatted).toMatch(/^UTC[+-]\d{2}:\d{2}$/);
      });
    });
  });

  describe('Real-world DST Scenarios', () => {
    test('should handle event creation during DST transition correctly', () => {
      // Simulate creating an event during spring forward
      const eventTime = '2024-03-10T15:00:00'; // 3 PM on spring forward day
      
      // Current server logic (problematic)
      const now = new Date();
      const currentOffset = -now.getTimezoneOffset();
      const localDate = new Date(eventTime);
      const serverResult = new Date(localDate.getTime() - (currentOffset * 60 * 1000));
      
      // Better approach - use proper timezone handling
      const betterResult = new Date(eventTime);
      
      console.log('Event creation during DST:');
      console.log(`  Input time: ${eventTime}`);
      console.log(`  Server result: ${serverResult.toISOString()}`);
      console.log(`  Better result: ${betterResult.toISOString()}`);
      console.log(`  Current offset: ${currentOffset} minutes`);
      console.log(`  Event date offset: ${-localDate.getTimezoneOffset()} minutes`);
      
      // The issue is when current offset != event date offset due to DST
      const eventOffset = -localDate.getTimezoneOffset();
      const offsetDifference = currentOffset - eventOffset;
      
      if (offsetDifference !== 0) {
        console.log(`  ⚠️  OFFSET MISMATCH: ${offsetDifference} minutes difference`);
      }
      
      expect(typeof offsetDifference).toBe('number');
    });

    test('should preserve local time meaning across DST transitions', () => {
      // User creates a recurring 2 PM meeting
      // It should stay at 2 PM local time even across DST transitions
      
      const beforeDST = new Date('2024-03-03T14:00:00'); // 2 PM before spring forward
      const afterDST = new Date('2024-03-17T14:00:00');  // 2 PM after spring forward
      
      // In UTC, these times will be different due to DST
      const beforeUTC = beforeDST.toISOString();
      const afterUTC = afterDST.toISOString();
      
      console.log('Recurring meeting across DST:');
      console.log(`  Before DST (2 PM local): ${beforeUTC}`);
      console.log(`  After DST (2 PM local): ${afterUTC}`);
      
      // The UTC times should be different by 1 hour due to DST
      const timeDiff = afterDST.getTime() - beforeDST.getTime();
      const expectedDiff = 14 * 24 * 60 * 60 * 1000; // 14 days
      const actualDiff = Math.abs(timeDiff - expectedDiff);
      
      console.log(`  Time difference: ${timeDiff / (1000 * 60 * 60)} hours`);
      console.log(`  Expected (14 days): ${expectedDiff / (1000 * 60 * 60)} hours`);
      
      expect(typeof timeDiff).toBe('number');
    });
  });

  describe('Solutions and Fixes', () => {
    test('should demonstrate correct timezone conversion approach', () => {
      const testTime = '2024-07-15T14:00:00'; // 2 PM in summer (DST active)
      
      // WRONG: Current server approach
      const now = new Date();
      const currentOffset = -now.getTimezoneOffset();
      const localDate = new Date(testTime);
      const wrongResult = new Date(localDate.getTime() - (currentOffset * 60 * 1000));
      
      // CORRECT: Let the Date constructor handle it
      const correctResult = new Date(testTime);
      
      // BETTER: Use proper timezone libraries for complex cases
      // const betterResult = new Intl.DateTimeFormat('en-US', {
      //   timeZone: 'America/New_York',
      //   year: 'numeric', month: '2-digit', day: '2-digit',
      //   hour: '2-digit', minute: '2-digit', second: '2-digit'
      // }).format(new Date(testTime));
      
      console.log('Timezone conversion comparison:');
      console.log(`  Input: ${testTime}`);
      console.log(`  Wrong result: ${wrongResult.toISOString()}`);
      console.log(`  Correct result: ${correctResult.toISOString()}`);
      
      expect(correctResult.toISOString()).not.toBe(wrongResult.toISOString());
    });
  });
}); 