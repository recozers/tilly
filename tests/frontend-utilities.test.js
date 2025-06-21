// Frontend Utility Functions Tests
describe('Frontend Utilities', () => {
  describe('Date Manipulation Functions', () => {
    test('should generate week dates correctly', () => {
      const getWeekDates = (date = new Date()) => {
        const startOfWeek = new Date(date);
        const day = startOfWeek.getDay();
        startOfWeek.setDate(startOfWeek.getDate() - day);
        
        const weekDates = [];
        for (let i = 0; i < 7; i++) {
          const date = new Date(startOfWeek);
          date.setDate(startOfWeek.getDate() + i);
          weekDates.push(date);
        }
        return weekDates;
      };

      const testDate = new Date('2025-06-21T12:00:00'); // Saturday
      const weekDates = getWeekDates(testDate);
      
      expect(weekDates).toHaveLength(7);
      expect(weekDates[0].getDay()).toBe(0); // Sunday
      expect(weekDates[6].getDay()).toBe(6); // Saturday
      
      // Check all dates are consecutive
      for (let i = 1; i < weekDates.length; i++) {
        const diff = weekDates[i].getTime() - weekDates[i-1].getTime();
        expect(diff).toBe(24 * 60 * 60 * 1000); // 24 hours in milliseconds
      }
    });

    test('should generate time slots correctly', () => {
      const generateTimeSlots = () => {
        const slots = [];
        for (let hour = 0; hour < 24; hour++) {
          slots.push({
            time: `${hour.toString().padStart(2, '0')}:00`,
            label: formatTimeLabel(hour, 0)
          });
          if (hour < 23) {
            slots.push({
              time: `${hour.toString().padStart(2, '0')}:30`,
              label: formatTimeLabel(hour, 30)
            });
          }
        }
        return slots;
      };
      
      const formatTimeLabel = (hour, minute) => {
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
        return `${displayHour}:${minute.toString().padStart(2, '0')} ${ampm}`;
      };

      const slots = generateTimeSlots();
      
      expect(slots).toHaveLength(47); // 24 hours with 30-min slots except last one
      expect(slots[0]).toEqual({ time: '00:00', label: '12:00 AM' });
      expect(slots[1]).toEqual({ time: '00:30', label: '12:30 AM' });
      expect(slots[24]).toEqual({ time: '12:00', label: '12:00 PM' });
      expect(slots[25]).toEqual({ time: '12:30', label: '12:30 PM' });
      expect(slots[slots.length - 1]).toEqual({ time: '23:00', label: '11:00 PM' });
    });

    test('should format time labels correctly', () => {
      const formatTimeLabel = (hour, minute) => {
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
        return `${displayHour}:${minute.toString().padStart(2, '0')} ${ampm}`;
      };

      expect(formatTimeLabel(0, 0)).toBe('12:00 AM');
      expect(formatTimeLabel(1, 30)).toBe('1:30 AM');
      expect(formatTimeLabel(12, 0)).toBe('12:00 PM');
      expect(formatTimeLabel(13, 15)).toBe('1:15 PM');
      expect(formatTimeLabel(23, 59)).toBe('11:59 PM');
    });

    test('should round time to quarter hour', () => {
      const roundToQuarterHour = (date) => {
        const rounded = new Date(date);
        const minutes = rounded.getMinutes();
        const roundedMinutes = Math.round(minutes / 15) * 15;
        rounded.setMinutes(roundedMinutes, 0, 0);
        return rounded;
      };

      const testCases = [
        { input: '2025-06-21T14:07:00.000Z', expected: '2025-06-21T14:00:00' },
        { input: '2025-06-21T14:08:00.000Z', expected: '2025-06-21T14:15:00' },
        { input: '2025-06-21T14:22:00.000Z', expected: '2025-06-21T14:15:00' },
        { input: '2025-06-21T14:23:00.000Z', expected: '2025-06-21T14:30:00' },
        { input: '2025-06-21T14:37:00.000Z', expected: '2025-06-21T14:30:00' },
        { input: '2025-06-21T14:38:00.000Z', expected: '2025-06-21T14:45:00' },
        { input: '2025-06-21T14:52:00.000Z', expected: '2025-06-21T14:45:00' },
        { input: '2025-06-21T14:53:00.000Z', expected: '2025-06-21T15:00:00' }
      ];

      testCases.forEach(({ input, expected }) => {
        const result = roundToQuarterHour(new Date(input));
        expect(result.toISOString().substring(0, 19)).toBe(expected);
      });
    });
  });

  describe('Event Filtering Functions', () => {
    const sampleEvents = [
      {
        id: 1,
        title: 'Morning Meeting',
        start: '2025-06-21T09:00:00.000Z',
        end: '2025-06-21T10:00:00.000Z'
      },
      {
        id: 2,
        title: 'Lunch Break',
        start: '2025-06-21T12:00:00.000Z',
        end: '2025-06-21T13:00:00.000Z'
      },
      {
        id: 3,
        title: 'Multi-day Event',
        start: '2025-06-21T18:00:00.000Z',
        end: '2025-06-22T06:00:00.000Z'
      }
    ];

    test('should get events for specific date and time', () => {
      const getEventsForDateTime = (events, date, timeSlot) => {
        const [hours, minutes] = timeSlot.split(':').map(Number);
        const slotStart = new Date(date);
        slotStart.setUTCHours(hours, minutes, 0, 0);
        const slotEnd = new Date(slotStart);
        slotEnd.setUTCMinutes(slotEnd.getUTCMinutes() + 30);

        return events.filter(event => {
          const eventStart = new Date(event.start);
          const eventEnd = new Date(event.end);
          return eventStart < slotEnd && eventEnd > slotStart;
        });
      };

      const testDate = new Date('2025-06-21T00:00:00.000Z');
      
      // Test 9:00 AM slot - should find morning meeting
      const morning = getEventsForDateTime(sampleEvents, testDate, '09:00');
      expect(morning).toHaveLength(1);
      expect(morning[0].title).toBe('Morning Meeting');
      
      // Test 12:30 PM slot - should find lunch break
      const lunch = getEventsForDateTime(sampleEvents, testDate, '12:30');
      expect(lunch).toHaveLength(1);
      expect(lunch[0].title).toBe('Lunch Break');
      
      // Test 6:00 PM slot - should find multi-day event
      const evening = getEventsForDateTime(sampleEvents, testDate, '18:00');
      expect(evening).toHaveLength(1);
      expect(evening[0].title).toBe('Multi-day Event');
      
      // Test 3:00 AM slot - should find nothing
      const earlyMorning = getEventsForDateTime(sampleEvents, testDate, '03:00');
      expect(earlyMorning).toHaveLength(0);
    });

    test('should get events starting in specific slot', () => {
      const getEventsStartingInSlot = (events, date, timeSlot) => {
        const [hours, minutes] = timeSlot.split(':').map(Number);
        const slotStart = new Date(date);
        slotStart.setUTCHours(hours, minutes, 0, 0);
        const slotEnd = new Date(slotStart);
        slotEnd.setUTCMinutes(slotEnd.getUTCMinutes() + 30);

        return events.filter(event => {
          const eventStart = new Date(event.start);
          return eventStart >= slotStart && eventStart < slotEnd;
        });
      };

      const testDate = new Date('2025-06-21T00:00:00.000Z');
      
      // Test 9:00 AM slot
      const morningStart = getEventsStartingInSlot(sampleEvents, testDate, '09:00');
      expect(morningStart).toHaveLength(1);
      expect(morningStart[0].title).toBe('Morning Meeting');
      
      // Test 12:30 PM slot - lunch starts at 12:00, not 12:30
      const lunchStart = getEventsStartingInSlot(sampleEvents, testDate, '12:30');
      expect(lunchStart).toHaveLength(0);
    });
  });

  describe('Calendar Layout Functions', () => {
    test('should calculate event dimensions', () => {
      const calculateEventDimensions = (event, date, slotHeight = 60) => {
        const eventStart = new Date(event.start);
        const eventEnd = new Date(event.end);
        
        // Calculate minutes from midnight in UTC
        const startMinutes = eventStart.getUTCHours() * 60 + eventStart.getUTCMinutes();
        const endMinutes = eventEnd.getUTCHours() * 60 + eventEnd.getUTCMinutes();
        
        const topOffset = (startMinutes / 30) * slotHeight;
        const duration = endMinutes - startMinutes;
        const height = Math.max(30, (duration / 30) * slotHeight);
        
        return { top: topOffset, height };
      };

      const testEvent = {
        id: 1,
        title: 'Test Event',
        start: '2025-06-21T09:00:00.000Z',
        end: '2025-06-21T10:30:00.000Z'
      };
      
      const dimensions = calculateEventDimensions(testEvent, new Date('2025-06-21'));
      
      expect(dimensions.top).toBe(1080); // 9:00 AM = 9 * 60 / 30 * 60 = 1080
      expect(dimensions.height).toBe(180); // 1.5 hours = 90 minutes / 30 * 60 = 180
    });

    test('should detect overlapping events', () => {
      const getOverlappingEvents = (targetEvent, allEvents) => {
        const targetStart = new Date(targetEvent.start);
        const targetEnd = new Date(targetEvent.end);
        
        return allEvents.filter(event => {
          if (event.id === targetEvent.id) return false;
          
          const eventStart = new Date(event.start);
          const eventEnd = new Date(event.end);
          
          return targetStart < eventEnd && targetEnd > eventStart;
        });
      };

      const events = [
        {
          id: 1,
          title: 'Event 1',
          start: '2025-06-21T09:00:00.000Z',
          end: '2025-06-21T10:00:00.000Z'
        },
        {
          id: 2,
          title: 'Event 2',
          start: '2025-06-21T09:30:00.000Z',
          end: '2025-06-21T10:30:00.000Z'
        },
        {
          id: 3,
          title: 'Event 3',
          start: '2025-06-21T11:00:00.000Z',
          end: '2025-06-21T12:00:00.000Z'
        }
      ];

      // Event 1 should overlap with Event 2
      const overlaps1 = getOverlappingEvents(events[0], events);
      expect(overlaps1).toHaveLength(1);
      expect(overlaps1[0].id).toBe(2);

      // Event 2 should overlap with Event 1
      const overlaps2 = getOverlappingEvents(events[1], events);
      expect(overlaps2).toHaveLength(1);
      expect(overlaps2[0].id).toBe(1);

      // Event 3 should not overlap with any
      const overlaps3 = getOverlappingEvents(events[2], events);
      expect(overlaps3).toHaveLength(0);
    });
  });

  describe('Coordinate Conversion Functions', () => {
    test('should convert pixel position to date/time', () => {
      // Mock DOM methods
      const mockElement = {
        getBoundingClientRect: () => ({
          top: 100,
          left: 50,
          width: 700,
          height: 1440 // 24 hours * 60px
        })
      };
      
      // Mock document.querySelector
      global.document = {
        querySelector: jest.fn(() => mockElement)
      };

      const pixelToDateTime = (clientX, clientY) => {
        const calendarGrid = document.querySelector('.calendar-time-grid');
        if (!calendarGrid) return null;

        const rect = calendarGrid.getBoundingClientRect();
        const relativeY = Math.max(0, clientY - rect.top);
        const relativeX = Math.max(0, clientX - rect.left - 80); // Subtract time column width

        const slotHeight = 60;
        const minutesFromStart = (relativeY / slotHeight) * 30;
        const totalMinutes = Math.max(0, Math.min(24 * 60 - 1, minutesFromStart));
        
        // Calculate day
        const columnWidth = (rect.width - 80) / 7;
        const dayIndex = Math.max(0, Math.min(6, Math.floor(relativeX / columnWidth)));
        
        // Create base date (week start)
        const today = new Date('2025-06-22T00:00:00.000Z'); // Sunday
        const targetDate = new Date(today);
        targetDate.setUTCDate(today.getUTCDate() + dayIndex);
        
        // Set the time
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        targetDate.setUTCHours(hours, minutes, 0, 0);
        
        return targetDate;
      };

      // Test clicking at 9:00 AM on the first day (Sunday)
      const columnWidth = (700 - 80) / 7; // ~88.57
      const result = pixelToDateTime(
        50 + 80 + 10,  // left + time column + small offset to be in first column (Sunday)
        100 + 1080     // top + 18 hours * 60px (9:00 AM UTC = 540 minutes = 18 slots)
      );
      
      expect(result).toBeInstanceOf(Date);
      expect(result.getUTCHours()).toBe(9);
      expect(result.getUTCMinutes()).toBe(0);
      expect(result.getUTCDay()).toBe(0); // Sunday (first column)
    });
  });

  describe('Time Slot Interaction', () => {
    test('should handle slot click for event creation', () => {
      const handleSlotClick = (date, timeSlot) => {
        const [hours, minutes] = timeSlot.split(':').map(Number);
        const startTime = new Date(date);
        startTime.setUTCHours(hours, minutes, 0, 0);
        const endTime = new Date(startTime);
        endTime.setUTCHours(hours + 1, minutes, 0, 0);

        return { start: startTime, end: endTime };
      };

      const testDate = new Date('2025-06-21T00:00:00.000Z');
      const result = handleSlotClick(testDate, '14:30');
      
      expect(result.start.getUTCHours()).toBe(14);
      expect(result.start.getUTCMinutes()).toBe(30);
      expect(result.end.getUTCHours()).toBe(15);
      expect(result.end.getUTCMinutes()).toBe(30);
    });
  });

  describe('Event Color Utilities', () => {
    test('should determine text color based on background', () => {
      const getTextColor = (backgroundColor) => {
        // Simple contrast check - in real app this might be more sophisticated
        if (backgroundColor === '#F4F1E8') {
          return '#1f2937'; // Dark text for light background
        }
        return 'white'; // White text for dark backgrounds
      };

      expect(getTextColor('#F4F1E8')).toBe('#1f2937');
      expect(getTextColor('#4A7C2A')).toBe('white');
      expect(getTextColor('#FF0000')).toBe('white');
    });

    test('should validate event colors', () => {
      const isValidEventColor = (color) => {
        return /^#[0-9A-Fa-f]{6}$/.test(color);
      };

      expect(isValidEventColor('#4A7C2A')).toBe(true);
      expect(isValidEventColor('#FF0000')).toBe(true);
      expect(isValidEventColor('#F4F1E8')).toBe(true);
      expect(isValidEventColor('red')).toBe(false);
      expect(isValidEventColor('#ZZZ')).toBe(false);
      expect(isValidEventColor('#12345')).toBe(false);
    });
  });

  describe('Navigation Utilities', () => {
    test('should navigate weeks correctly', () => {
      const navigateWeek = (currentDate, direction) => {
        const newDate = new Date(currentDate);
        newDate.setUTCDate(newDate.getUTCDate() + (direction * 7));
        return newDate;
      };

      const testDate = new Date('2025-06-21T00:00:00.000Z');
      
      // Navigate forward
      const nextWeek = navigateWeek(testDate, 1);
      expect(nextWeek.getUTCDate()).toBe(28);
      expect(nextWeek.getUTCMonth()).toBe(5); // June (0-indexed)
      
      // Navigate backward
      const prevWeek = navigateWeek(testDate, -1);
      expect(prevWeek.getUTCDate()).toBe(14);
      expect(prevWeek.getUTCMonth()).toBe(5); // June (0-indexed)
    });

    test('should go to today correctly', () => {
      const goToToday = () => {
        return new Date();
      };

      const today = goToToday();
      const now = new Date();
      
      // Should be within a few seconds of each other
      expect(Math.abs(today.getTime() - now.getTime())).toBeLessThan(1000);
    });
  });

  describe('Current Time Display', () => {
    test('should check if date is today', () => {
      const isToday = (date) => {
        const today = new Date();
        return date.toDateString() === today.toDateString();
      };

      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);
      const tomorrow = new Date();
      tomorrow.setDate(today.getDate() + 1);

      expect(isToday(today)).toBe(true);
      expect(isToday(yesterday)).toBe(false);
      expect(isToday(tomorrow)).toBe(false);
    });

    test('should calculate current time position', () => {
      const getCurrentTimePosition = (slotHeight = 60) => {
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        return (currentMinutes / 30) * slotHeight;
      };

      // Mock current time to 9:30 AM
      const originalDate = global.Date;
      global.Date = class extends originalDate {
        constructor(...args) {
          if (args.length === 0) {
            super('2025-06-21T09:30:00');
          } else {
            super(...args);
          }
        }
        static now() {
          return new originalDate('2025-06-21T09:30:00').getTime();
        }
      };

      const position = getCurrentTimePosition();
      expect(position).toBe(1140); // 9.5 hours * 60 minutes/hour * 2 slots/hour * 60px/slot / 30 minutes/slot

      // Restore original Date
      global.Date = originalDate;
    });
  });

  describe('Event Duration Calculations', () => {
    test('should calculate event duration', () => {
      const calculateDuration = (start, end) => {
        const startTime = new Date(start);
        const endTime = new Date(end);
        return (endTime - startTime) / (1000 * 60); // Duration in minutes
      };

      expect(calculateDuration(
        '2025-06-21T09:00:00.000Z',
        '2025-06-21T10:00:00.000Z'
      )).toBe(60);

      expect(calculateDuration(
        '2025-06-21T09:00:00.000Z',
        '2025-06-21T10:30:00.000Z'
      )).toBe(90);

      expect(calculateDuration(
        '2025-06-21T09:15:00.000Z',
        '2025-06-21T09:45:00.000Z'
      )).toBe(30);
    });

    test('should format duration display', () => {
      const formatDuration = (minutes) => {
        if (minutes < 60) {
          return `${minutes}m`;
        }
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;
        return remainingMinutes === 0 ? `${hours}h` : `${hours}h ${remainingMinutes}m`;
      };

      expect(formatDuration(30)).toBe('30m');
      expect(formatDuration(60)).toBe('1h');
      expect(formatDuration(90)).toBe('1h 30m');
      expect(formatDuration(120)).toBe('2h');
      expect(formatDuration(135)).toBe('2h 15m');
    });
  });
}); 