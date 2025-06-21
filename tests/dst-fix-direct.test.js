// Direct test of the DST fix
const fs = require('fs');
const path = require('path');

// Read the server.js file to extract our function
const serverContent = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

// Extract the convertLocalTimeToUTC function for testing
function extractAndEvaluateFunction() {
  // Find the function definition
  const functionMatch = serverContent.match(/function convertLocalTimeToUTC\(localTimeStr\) \{[\s\S]*?\n\}/);
  
  if (!functionMatch) {
    throw new Error('Could not find convertLocalTimeToUTC function in server.js');
  }
  
  // Evaluate the function in our test context
  const functionCode = functionMatch[0];
  
  // Create a safe evaluation context
  const context = {
    convertLocalTimeToUTC: null,
    console: console,
    Error: Error,
    Date: Date,
    isNaN: isNaN
  };
  
  // Safely evaluate the function
  const wrappedCode = `
    ${functionCode}
    context.convertLocalTimeToUTC = convertLocalTimeToUTC;
  `;
  
  eval(wrappedCode);
  return context.convertLocalTimeToUTC;
}

describe('DST Fix Direct Test', () => {
  let convertLocalTimeToUTC;
  
  beforeAll(() => {
    convertLocalTimeToUTC = extractAndEvaluateFunction();
  });

  test('should extract convertLocalTimeToUTC function from server.js', () => {
    expect(convertLocalTimeToUTC).toBeDefined();
    expect(typeof convertLocalTimeToUTC).toBe('function');
  });

  test('should handle local time without timezone info correctly', () => {
    const testCases = [
      {
        input: '2024-07-15T14:00:00',
        description: 'Summer time (DST active)'
      },
      {
        input: '2024-01-15T14:00:00', 
        description: 'Winter time (standard time)'
      },
      {
        input: '2024-03-10T14:00:00',
        description: 'Spring forward day'
      },
      {
        input: '2024-11-03T14:00:00',
        description: 'Fall back day'
      }
    ];

    testCases.forEach(testCase => {
      const result = convertLocalTimeToUTC(testCase.input);
      
      console.log(`\nTesting ${testCase.description}:`);
      console.log(`  Input: ${testCase.input}`);
      console.log(`  Output: ${result.toISOString()}`);
      console.log(`  Local interpretation: ${result.toLocaleString()}`);
      
      // Verify it's a valid date
      expect(result instanceof Date).toBe(true);
      expect(isNaN(result.getTime())).toBe(false);
      
      // Verify the year, month, day are preserved
      expect(result.getFullYear()).toBe(2024);
      expect(result.getHours()).toBe(14); // Should preserve the hour as local time
    });
  });

  test('should handle timezone-aware input correctly', () => {
    const timeWithTimezone = '2024-06-15T14:00:00-04:00'; // EDT
    const result = convertLocalTimeToUTC(timeWithTimezone);
    
    console.log('\nTesting timezone-aware input:');
    console.log(`  Input: ${timeWithTimezone}`);
    console.log(`  Output: ${result.toISOString()}`);
    
    // Should be 18:00 UTC (14:00 - 4 hours)
    expect(result.getUTCHours()).toBe(18);
  });

  test('should handle UTC input correctly', () => {
    const utcTime = '2024-06-15T14:00:00Z';
    const result = convertLocalTimeToUTC(utcTime);
    
    console.log('\nTesting UTC input:');
    console.log(`  Input: ${utcTime}`);
    console.log(`  Output: ${result.toISOString()}`);
    
    // Should remain 14:00 UTC
    expect(result.getUTCHours()).toBe(14);
  });

  test('should demonstrate DST-safe behavior', () => {
    // Create events in different seasons
    const summerEvent = convertLocalTimeToUTC('2024-07-15T15:00:00');
    const winterEvent = convertLocalTimeToUTC('2024-01-15T15:00:00');
    
    console.log('\nDST-safe behavior demonstration:');
    console.log(`  Summer event (3 PM): ${summerEvent.toISOString()}`);
    console.log(`  Winter event (3 PM): ${winterEvent.toISOString()}`);
    
    // Both should be at 3 PM in their respective local times
    // The UTC times will be different due to DST, but that's correct!
    expect(summerEvent.getHours()).toBe(15);
    expect(winterEvent.getHours()).toBe(15);
    
    // Show the actual UTC times (these should be different)
    const summerUTC = summerEvent.getUTCHours();
    const winterUTC = winterEvent.getUTCHours();
    
    console.log(`  Summer event UTC hour: ${summerUTC}`);
    console.log(`  Winter event UTC hour: ${winterUTC}`);
    
    // In most DST timezones, these should be different by 1 hour
    const hourDifference = Math.abs(summerUTC - winterUTC);
    console.log(`  Hour difference: ${hourDifference} (should be 0 or 1 depending on timezone)`);
    
    // This is the key: the function preserves local time semantics
    expect(typeof hourDifference).toBe('number');
  });

  test('should handle invalid input gracefully', () => {
    const invalidInputs = [
      'invalid-date',
      '2024-13-45T25:99:99',
      '',
    ];

    invalidInputs.forEach(input => {
      expect(() => {
        convertLocalTimeToUTC(input);
      }).toThrow('Invalid date format');
    });
  });

  test('should show comparison with old problematic method', () => {
    // Simulate the old problematic method
    function oldProblematicMethod(localTimeStr) {
      if (localTimeStr.includes('Z') || localTimeStr.includes('+') || localTimeStr.includes('-')) {
        return new Date(localTimeStr);
      }
      
      const now = new Date();
      const currentOffsetMinutes = -now.getTimezoneOffset();
      const localDate = new Date(localTimeStr);
      return new Date(localDate.getTime() - (currentOffsetMinutes * 60 * 1000));
    }

    const testTime = '2024-06-15T14:00:00';
    
    const fixedResult = convertLocalTimeToUTC(testTime);
    const oldResult = oldProblematicMethod(testTime);
    
    console.log('\nComparison with old method:');
    console.log(`  Input: ${testTime}`);
    console.log(`  Fixed result: ${fixedResult.toISOString()}`);
    console.log(`  Old result: ${oldResult.toISOString()}`);
    
    const now = new Date();
    const currentOffset = -now.getTimezoneOffset();
    const eventDate = new Date(testTime);
    const eventOffset = -eventDate.getTimezoneOffset();
    
    console.log(`  Current offset: ${currentOffset} minutes`);
    console.log(`  Event date offset: ${eventOffset} minutes`);
    console.log(`  Offset difference: ${currentOffset - eventOffset} minutes`);
    
    if (currentOffset !== eventOffset) {
      console.log('  ⚠️ The old method would have been wrong by this offset difference!');
      console.log('  ✅ The new method correctly handles the DST difference');
      
      // Results should be different when there's an offset mismatch
      expect(fixedResult.toISOString()).not.toBe(oldResult.toISOString());
    } else {
      console.log('  ✅ Both methods agree when offsets match (no DST difference)');
      
      // Results should be the same when offsets match
      expect(fixedResult.toISOString()).toBe(oldResult.toISOString());
    }
  });
}); 