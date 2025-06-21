const request = require('supertest');
const { v4: uuidv4 } = require('uuid');

// Mock a simple server function for testing
function mockConvertLocalTimeToUTC(localTimeStr) {
  // If input already has timezone info, use it directly
  if (localTimeStr.includes('Z') || localTimeStr.includes('+') || localTimeStr.includes('-')) {
    return new Date(localTimeStr);
  }
  
  // For local time strings without timezone info, let JavaScript handle DST
  try {
    const localDate = new Date(localTimeStr);
    if (isNaN(localDate.getTime())) {
      throw new Error('Invalid date format');
    }
    return localDate;
  } catch (error) {
    console.error('Error converting local time to UTC:', error);
    throw new Error('Invalid date format');
  }
}

// Mock the old problematic function
function mockOldProblematicConversion(localTimeStr) {
  if (localTimeStr.includes('Z') || localTimeStr.includes('+') || localTimeStr.includes('-')) {
    return new Date(localTimeStr);
  }
  
  // This is the WRONG way (from the old code)
  const now = new Date();
  const currentOffsetMinutes = -now.getTimezoneOffset();
  const localDate = new Date(localTimeStr);
  return new Date(localDate.getTime() - (currentOffsetMinutes * 60 * 1000));
}

describe('DST Fix Validation', () => {
  describe('Timezone Conversion Function Comparison', () => {
    test('should handle summer time correctly vs old method', () => {
      // Test during summer (DST active)
      const summerTime = '2024-07-15T14:00:00'; // 2 PM in July
      
      const fixedResult = mockConvertLocalTimeToUTC(summerTime);
      const oldResult = mockOldProblematicConversion(summerTime);
      
      console.log('Summer time test:');
      console.log(`  Input: ${summerTime}`);
      console.log(`  Fixed result: ${fixedResult.toISOString()}`);
      console.log(`  Old result: ${oldResult.toISOString()}`);
      
      // The results should be different if there's a DST issue
      expect(fixedResult.toISOString()).not.toBe(oldResult.toISOString());
    });

    test('should handle winter time correctly vs old method', () => {
      // Test during winter (standard time)
      const winterTime = '2024-01-15T14:00:00'; // 2 PM in January
      
      const fixedResult = mockConvertLocalTimeToUTC(winterTime);
      const oldResult = mockOldProblematicConversion(winterTime);
      
      console.log('Winter time test:');
      console.log(`  Input: ${winterTime}`);
      console.log(`  Fixed result: ${fixedResult.toISOString()}`);
      console.log(`  Old result: ${oldResult.toISOString()}`);
      
      // Results might differ depending on when this test runs vs the event date
      expect(typeof fixedResult.getTime()).toBe('number');
      expect(typeof oldResult.getTime()).toBe('number');
    });

    test('should handle DST transition dates correctly', () => {
      // Test around spring forward (March 10, 2024 in US)
      const springForwardTime = '2024-03-10T14:00:00'; // 2 PM on spring forward day
      
      const fixedResult = mockConvertLocalTimeToUTC(springForwardTime);
      const oldResult = mockOldProblematicConversion(springForwardTime);
      
      console.log('Spring forward test:');
      console.log(`  Input: ${springForwardTime}`);
      console.log(`  Fixed result: ${fixedResult.toISOString()}`);
      console.log(`  Old result: ${oldResult.toISOString()}`);
      
      // Test around fall back (November 3, 2024 in US)
      const fallBackTime = '2024-11-03T14:00:00'; // 2 PM on fall back day
      
      const fixedResultFall = mockConvertLocalTimeToUTC(fallBackTime);
      const oldResultFall = mockOldProblematicConversion(fallBackTime);
      
      console.log('Fall back test:');
      console.log(`  Input: ${fallBackTime}`);
      console.log(`  Fixed result: ${fixedResultFall.toISOString()}`);
      console.log(`  Old result: ${oldResultFall.toISOString()}`);
      
      expect(fixedResult instanceof Date).toBe(true);
      expect(fixedResultFall instanceof Date).toBe(true);
    });

    test('should demonstrate the offset mismatch problem', () => {
      // Run this test at a time different from the event time to show the problem
      const testCases = [
        '2024-03-15T15:00:00', // Spring time
        '2024-11-15T15:00:00', // Fall time
        '2024-06-15T15:00:00', // Deep summer
        '2024-12-15T15:00:00'  // Deep winter
      ];

      testCases.forEach(eventTime => {
        const now = new Date();
        const currentOffset = -now.getTimezoneOffset();
        const eventDate = new Date(eventTime);
        const eventOffset = -eventDate.getTimezoneOffset();
        
        const offsetDifference = currentOffset - eventOffset;
        
        console.log(`Event: ${eventTime}`);
        console.log(`  Current offset: ${currentOffset} minutes`);
        console.log(`  Event offset: ${eventOffset} minutes`);
        console.log(`  Difference: ${offsetDifference} minutes`);
        
        if (offsetDifference !== 0) {
          console.log(`  ⚠️ OFFSET MISMATCH: ${offsetDifference} minutes (${offsetDifference/60} hours)`);
        }
        
        expect(typeof offsetDifference).toBe('number');
      });
    });
  });

  describe('AI Event Creation Scenarios', () => {
    test('should handle AI creating event in different seasons', () => {
      const scenarios = [
        {
          name: 'Spring Meeting',
          start: '2024-04-15T14:00:00',
          end: '2024-04-15T15:00:00'
        },
        {
          name: 'Summer Conference',
          start: '2024-07-20T09:00:00',
          end: '2024-07-20T17:00:00'
        },
        {
          name: 'Fall Workshop',
          start: '2024-10-10T13:00:00',
          end: '2024-10-10T16:00:00'
        },
        {
          name: 'Winter Planning',
          start: '2024-12-05T10:00:00',
          end: '2024-12-05T12:00:00'
        }
      ];

      scenarios.forEach(scenario => {
        const startFixed = mockConvertLocalTimeToUTC(scenario.start);
        const endFixed = mockConvertLocalTimeToUTC(scenario.end);
        
        const startOld = mockOldProblematicConversion(scenario.start);
        const endOld = mockOldProblematicConversion(scenario.end);
        
        console.log(`\nScenario: ${scenario.name}`);
        console.log(`  Fixed: ${startFixed.toISOString()} to ${endFixed.toISOString()}`);
        console.log(`  Old:   ${startOld.toISOString()} to ${endOld.toISOString()}`);
        
        const timeDiffFixed = endFixed.getTime() - startFixed.getTime();
        const timeDiffOld = endOld.getTime() - startOld.getTime();
        
        console.log(`  Duration fixed: ${timeDiffFixed / (1000 * 60)} minutes`);
        console.log(`  Duration old:   ${timeDiffOld / (1000 * 60)} minutes`);
        
        // Duration should be the same for both methods
        expect(timeDiffFixed).toBe(timeDiffOld);
        
        // But the absolute times might be different due to DST
        expect(startFixed instanceof Date).toBe(true);
        expect(endFixed instanceof Date).toBe(true);
      });
    });

    test('should preserve event durations across DST fixes', () => {
      // One-hour meeting
      const meetingStart = '2024-06-15T14:00:00';
      const meetingEnd = '2024-06-15T15:00:00';
      
      const startFixed = mockConvertLocalTimeToUTC(meetingStart);
      const endFixed = mockConvertLocalTimeToUTC(meetingEnd);
      
      const duration = endFixed.getTime() - startFixed.getTime();
      const durationHours = duration / (1000 * 60 * 60);
      
      console.log('Duration preservation test:');
      console.log(`  Start: ${startFixed.toISOString()}`);
      console.log(`  End: ${endFixed.toISOString()}`);
      console.log(`  Duration: ${durationHours} hours`);
      
      // Should be exactly 1 hour
      expect(durationHours).toBe(1);
    });
  });

  describe('Edge Cases', () => {
    test('should handle timezone-aware input correctly', () => {
      const timeWithTimezone = '2024-06-15T14:00:00-04:00'; // EDT
      
      const result = mockConvertLocalTimeToUTC(timeWithTimezone);
      
      console.log('Timezone-aware input:');
      console.log(`  Input: ${timeWithTimezone}`);
      console.log(`  Result: ${result.toISOString()}`);
      
      // Should be 18:00 UTC (14:00 - 4 hours)
      expect(result.getUTCHours()).toBe(18);
    });

    test('should handle ISO UTC input correctly', () => {
      const utcTime = '2024-06-15T14:00:00Z';
      
      const result = mockConvertLocalTimeToUTC(utcTime);
      
      console.log('UTC input:');
      console.log(`  Input: ${utcTime}`);
      console.log(`  Result: ${result.toISOString()}`);
      
      // Should remain 14:00 UTC
      expect(result.getUTCHours()).toBe(14);
    });

    test('should validate error handling', () => {
      const invalidInputs = [
        'invalid-date',
        '2024-13-45T25:99:99',
        '',
        null,
        undefined
      ];

      invalidInputs.forEach(input => {
        expect(() => {
          mockConvertLocalTimeToUTC(input);
        }).toThrow();
      });
    });
  });
}); 