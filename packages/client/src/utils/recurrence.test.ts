import { describe, it, expect, vi } from 'vitest';
import {
  expandRecurringEvents,
  isRecurringInstance,
  getOriginalEventId,
  describeRecurrence,
} from './recurrence';

// Mock console.warn for error handling tests
vi.spyOn(console, 'warn').mockImplementation(() => {});

describe('expandRecurringEvents', () => {
  const baseEvent = {
    _id: 'event-1',
    title: 'Test Event',
    startTime: Date.UTC(2025, 0, 15, 10, 0, 0),
    endTime: Date.UTC(2025, 0, 15, 11, 0, 0),
    color: '#4A7C2A',
  };

  it('returns non-recurring events unchanged', () => {
    const events = [baseEvent];
    const result = expandRecurringEvents(
      events,
      new Date(Date.UTC(2025, 0, 1)),
      new Date(Date.UTC(2025, 0, 31))
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(events[0]);
  });

  it('expands daily recurring events', () => {
    const recurringEvent = {
      ...baseEvent,
      rrule: 'FREQ=DAILY;COUNT=5',
    };
    const result = expandRecurringEvents(
      [recurringEvent],
      new Date(Date.UTC(2025, 0, 1)),
      new Date(Date.UTC(2025, 0, 31))
    );
    expect(result.length).toBe(5);
  });

  it('expands weekly recurring events', () => {
    const recurringEvent = {
      ...baseEvent,
      rrule: 'FREQ=WEEKLY;COUNT=4',
    };
    const result = expandRecurringEvents(
      [recurringEvent],
      new Date(Date.UTC(2025, 0, 1)),
      new Date(Date.UTC(2025, 2, 31)) // 3 month range
    );
    expect(result.length).toBe(4);
  });

  it('limits to 100 occurrences', () => {
    const recurringEvent = {
      ...baseEvent,
      rrule: 'FREQ=DAILY', // No limit, would be infinite
    };
    const result = expandRecurringEvents(
      [recurringEvent],
      new Date(Date.UTC(2025, 0, 1)),
      new Date(Date.UTC(2026, 0, 1)) // 1 year range
    );
    expect(result.length).toBeLessThanOrEqual(100);
  });

  it('handles RRULE prefix in rrule string', () => {
    const recurringEvent = {
      ...baseEvent,
      rrule: 'RRULE:FREQ=DAILY;COUNT=3',
    };
    const result = expandRecurringEvents(
      [recurringEvent],
      new Date(Date.UTC(2025, 0, 1)),
      new Date(Date.UTC(2025, 0, 31))
    );
    expect(result.length).toBe(3);
  });

  it('uses dtstart when available', () => {
    const recurringEvent = {
      ...baseEvent,
      rrule: 'FREQ=DAILY;COUNT=2',
      dtstart: Date.UTC(2025, 0, 20, 10, 0, 0), // Different from startTime
    };
    const result = expandRecurringEvents(
      [recurringEvent],
      new Date(Date.UTC(2025, 0, 1)),
      new Date(Date.UTC(2025, 0, 31))
    );
    // Should start from dtstart (Jan 20), not startTime (Jan 15)
    expect(result.length).toBe(2);
    const firstOccurrence = result[0];
    if ('startTime' in firstOccurrence) {
      expect(new Date(firstOccurrence.startTime).getUTCDate()).toBe(20);
    }
  });

  it('falls back to startTime for dtstart', () => {
    const recurringEvent = {
      ...baseEvent,
      rrule: 'FREQ=DAILY;COUNT=2',
    };
    const result = expandRecurringEvents(
      [recurringEvent],
      new Date(Date.UTC(2025, 0, 1)),
      new Date(Date.UTC(2025, 0, 31))
    );
    expect(result.length).toBe(2);
  });

  it('calculates duration from event times', () => {
    const twoHourEvent = {
      ...baseEvent,
      endTime: Date.UTC(2025, 0, 15, 12, 0, 0), // 2 hours
      rrule: 'FREQ=DAILY;COUNT=2',
    };
    const result = expandRecurringEvents(
      [twoHourEvent],
      new Date(Date.UTC(2025, 0, 1)),
      new Date(Date.UTC(2025, 0, 31))
    );
    // Each occurrence should be 2 hours
    const firstOcc = result[0] as typeof baseEvent;
    expect(firstOcc.endTime - firstOcc.startTime).toBe(2 * 60 * 60 * 1000);
  });

  it('handles events with explicit duration', () => {
    const eventWithDuration = {
      ...baseEvent,
      rrule: 'FREQ=DAILY;COUNT=2',
      duration: 30 * 60 * 1000, // 30 minutes
    };
    const result = expandRecurringEvents(
      [eventWithDuration],
      new Date(Date.UTC(2025, 0, 1)),
      new Date(Date.UTC(2025, 0, 31))
    );
    const firstOcc = result[0] as typeof baseEvent;
    expect(firstOcc.endTime - firstOcc.startTime).toBe(30 * 60 * 1000);
  });

  it('marks expanded events as recurring instances', () => {
    const recurringEvent = {
      ...baseEvent,
      rrule: 'FREQ=DAILY;COUNT=2',
    };
    const result = expandRecurringEvents(
      [recurringEvent],
      new Date(Date.UTC(2025, 0, 1)),
      new Date(Date.UTC(2025, 0, 31))
    );
    for (const event of result) {
      expect((event as any).isRecurringInstance).toBe(true);
    }
  });

  it('sets originalEventId on expanded events', () => {
    const recurringEvent = {
      ...baseEvent,
      rrule: 'FREQ=DAILY;COUNT=2',
    };
    const result = expandRecurringEvents(
      [recurringEvent],
      new Date(Date.UTC(2025, 0, 1)),
      new Date(Date.UTC(2025, 0, 31))
    );
    for (const event of result) {
      expect((event as any).originalEventId).toBe('event-1');
    }
  });

  it('handles invalid RRULE gracefully', () => {
    const invalidEvent = {
      ...baseEvent,
      rrule: 'INVALID_RRULE_STRING',
    };
    const result = expandRecurringEvents(
      [invalidEvent],
      new Date(Date.UTC(2025, 0, 1)),
      new Date(Date.UTC(2025, 0, 31))
    );
    // Should return original event on error
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(invalidEvent);
  });

  it('handles Date objects for range parameters', () => {
    const recurringEvent = {
      ...baseEvent,
      rrule: 'FREQ=DAILY;COUNT=3',
    };
    const result = expandRecurringEvents(
      [recurringEvent],
      new Date(2025, 0, 1),
      new Date(2025, 0, 31)
    );
    expect(result.length).toBe(3);
  });

  it('handles number timestamps for range parameters', () => {
    const recurringEvent = {
      ...baseEvent,
      rrule: 'FREQ=DAILY;COUNT=3',
    };
    const result = expandRecurringEvents(
      [recurringEvent],
      Date.UTC(2025, 0, 1),
      Date.UTC(2025, 0, 31)
    );
    expect(result.length).toBe(3);
  });
});

describe('isRecurringInstance', () => {
  it('returns true for recurring instances', () => {
    expect(isRecurringInstance({ isRecurringInstance: true })).toBe(true);
  });

  it('returns false for regular events', () => {
    expect(isRecurringInstance({ isRecurringInstance: false })).toBe(false);
  });

  it('returns false for undefined isRecurringInstance', () => {
    expect(isRecurringInstance({})).toBe(false);
  });
});

describe('getOriginalEventId', () => {
  it('returns originalEventId when present', () => {
    expect(getOriginalEventId({ originalEventId: 'original-123', _id: 'instance-456' })).toBe('original-123');
  });

  it('falls back to _id when originalEventId missing', () => {
    expect(getOriginalEventId({ _id: 'event-123' })).toBe('event-123');
  });
});

describe('describeRecurrence', () => {
  it('describes daily recurrence', () => {
    const result = describeRecurrence('FREQ=DAILY');
    expect(result.toLowerCase()).toContain('day');
  });

  it('describes weekly recurrence', () => {
    const result = describeRecurrence('FREQ=WEEKLY');
    expect(result.toLowerCase()).toContain('week');
  });

  it('describes monthly recurrence', () => {
    const result = describeRecurrence('FREQ=MONTHLY');
    expect(result.toLowerCase()).toContain('month');
  });

  it('handles RRULE prefix', () => {
    const result = describeRecurrence('RRULE:FREQ=DAILY');
    expect(result.toLowerCase()).toContain('day');
  });

  it('returns fallback for invalid RRULE', () => {
    const result = describeRecurrence('INVALID');
    expect(result).toBe('Recurring event');
  });
});
