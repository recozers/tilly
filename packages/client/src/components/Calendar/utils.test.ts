import { describe, it, expect } from 'vitest';
import {
  getStartOfWeek,
  addDays,
  isSameDay,
  formatHour,
  getAllDayEvents,
  calculateEventLayout,
  CalendarEvent,
} from './utils';

describe('getStartOfWeek', () => {
  it('returns Sunday of the same week', () => {
    const wednesday = new Date(2025, 0, 15); // Wednesday Jan 15, 2025
    const result = getStartOfWeek(wednesday);
    expect(result.getDay()).toBe(0); // Sunday
    expect(result.getDate()).toBe(12); // Jan 12
  });

  it('returns same day if already Sunday', () => {
    const sunday = new Date(2025, 0, 12); // Sunday Jan 12, 2025
    const result = getStartOfWeek(sunday);
    expect(result.getDay()).toBe(0);
    expect(result.getDate()).toBe(12);
  });

  it('sets time to midnight', () => {
    const dateWithTime = new Date(2025, 0, 15, 14, 30, 45);
    const result = getStartOfWeek(dateWithTime);
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
  });

  it('handles month boundaries', () => {
    const firstOfMonth = new Date(2025, 1, 1); // Saturday Feb 1, 2025
    const result = getStartOfWeek(firstOfMonth);
    expect(result.getMonth()).toBe(0); // January
    expect(result.getDate()).toBe(26); // Jan 26
  });
});

describe('addDays', () => {
  it('adds positive days', () => {
    const date = new Date(2025, 0, 15);
    const result = addDays(date, 5);
    expect(result.getDate()).toBe(20);
  });

  it('adds negative days', () => {
    const date = new Date(2025, 0, 15);
    const result = addDays(date, -5);
    expect(result.getDate()).toBe(10);
  });

  it('handles month boundaries', () => {
    const date = new Date(2025, 0, 31);
    const result = addDays(date, 1);
    expect(result.getMonth()).toBe(1); // February
    expect(result.getDate()).toBe(1);
  });

  it('does not modify original date', () => {
    const original = new Date(2025, 0, 15);
    const originalTime = original.getTime();
    addDays(original, 5);
    expect(original.getTime()).toBe(originalTime);
  });
});

describe('isSameDay', () => {
  it('returns true for same day', () => {
    const a = new Date(2025, 0, 15, 10, 0, 0);
    const b = new Date(2025, 0, 15, 20, 30, 0);
    expect(isSameDay(a, b)).toBe(true);
  });

  it('returns false for different days', () => {
    const a = new Date(2025, 0, 15);
    const b = new Date(2025, 0, 16);
    expect(isSameDay(a, b)).toBe(false);
  });

  it('returns false for different months', () => {
    const a = new Date(2025, 0, 15);
    const b = new Date(2025, 1, 15);
    expect(isSameDay(a, b)).toBe(false);
  });

  it('returns false for different years', () => {
    const a = new Date(2025, 0, 15);
    const b = new Date(2024, 0, 15);
    expect(isSameDay(a, b)).toBe(false);
  });
});

describe('formatHour', () => {
  it('formats midnight as 12 AM', () => {
    expect(formatHour(0)).toBe('12 AM');
  });

  it('formats 24 as 12 AM', () => {
    expect(formatHour(24)).toBe('12 AM');
  });

  it('formats noon as 12 PM', () => {
    expect(formatHour(12)).toBe('12 PM');
  });

  it('formats morning hours correctly', () => {
    expect(formatHour(1)).toBe('1 AM');
    expect(formatHour(9)).toBe('9 AM');
    expect(formatHour(11)).toBe('11 AM');
  });

  it('formats afternoon hours correctly', () => {
    expect(formatHour(13)).toBe('1 PM');
    expect(formatHour(17)).toBe('5 PM');
    expect(formatHour(23)).toBe('11 PM');
  });
});

describe('getAllDayEvents', () => {
  const createEvent = (id: string, startTime: number, endTime: number, allDay = true): CalendarEvent => ({
    _id: id,
    title: `Event ${id}`,
    startTime,
    endTime,
    color: '#4A7C2A',
    allDay,
    type: 'event',
  });

  it('filters events with allDay: true', () => {
    const events = [
      createEvent('1', Date.UTC(2025, 0, 15, 0, 0, 0), Date.UTC(2025, 0, 15, 23, 59, 59), true),
      createEvent('2', Date.UTC(2025, 0, 15, 10, 0, 0), Date.UTC(2025, 0, 15, 11, 0, 0), false),
    ];
    const result = getAllDayEvents(events, new Date(2025, 0, 15));
    expect(result).toHaveLength(1);
    expect(result[0]._id).toBe('1');
  });

  it('includes events that span the target day', () => {
    const events = [
      createEvent('1', Date.UTC(2025, 0, 14, 0, 0, 0), Date.UTC(2025, 0, 16, 23, 59, 59), true),
    ];
    const result = getAllDayEvents(events, new Date(2025, 0, 15));
    expect(result).toHaveLength(1);
  });

  it('excludes events outside the target day', () => {
    const events = [
      createEvent('1', Date.UTC(2025, 0, 10, 0, 0, 0), Date.UTC(2025, 0, 12, 23, 59, 59), true),
    ];
    const result = getAllDayEvents(events, new Date(2025, 0, 15));
    expect(result).toHaveLength(0);
  });

  it('handles multi-day all-day events', () => {
    // Use local time for consistency with how getAllDayEvents normalizes dates
    const vacation = createEvent('vacation', new Date(2025, 0, 15, 0, 0, 0).getTime(), new Date(2025, 0, 20, 23, 59, 59).getTime(), true);
    const events = [vacation];

    // Should include on all days
    expect(getAllDayEvents(events, new Date(2025, 0, 15))).toHaveLength(1);
    expect(getAllDayEvents(events, new Date(2025, 0, 17))).toHaveLength(1);
    expect(getAllDayEvents(events, new Date(2025, 0, 20))).toHaveLength(1);

    // Should exclude before and after
    expect(getAllDayEvents(events, new Date(2025, 0, 14))).toHaveLength(0);
    expect(getAllDayEvents(events, new Date(2025, 0, 21))).toHaveLength(0);
  });

  it('normalizes dates for comparison', () => {
    // Event stored in UTC
    const event = createEvent('1', Date.UTC(2025, 0, 15, 0, 0, 0), Date.UTC(2025, 0, 15, 23, 59, 59), true);
    // Day in local time
    const result = getAllDayEvents([event], new Date(2025, 0, 15));
    expect(result).toHaveLength(1);
  });

  it('handles events at day boundaries', () => {
    const events = [
      createEvent('start', new Date(2025, 0, 15, 0, 0, 0).getTime(), new Date(2025, 0, 15, 23, 59, 59).getTime(), true),
      createEvent('end', new Date(2025, 0, 15, 0, 0, 0).getTime(), new Date(2025, 0, 15, 23, 59, 59).getTime(), true),
    ];
    const result = getAllDayEvents(events, new Date(2025, 0, 15));
    expect(result).toHaveLength(2);
  });
});

describe('calculateEventLayout', () => {
  const createTimedEvent = (id: string, startTime: number, endTime: number): CalendarEvent => ({
    _id: id,
    title: `Event ${id}`,
    startTime,
    endTime,
    color: '#4A7C2A',
    allDay: false,
    type: 'event',
  });

  const jan15 = new Date(2025, 0, 15);

  it('excludes all-day events', () => {
    const events: CalendarEvent[] = [
      { ...createTimedEvent('1', Date.UTC(2025, 0, 15, 10, 0), Date.UTC(2025, 0, 15, 11, 0)), allDay: true },
    ];
    const result = calculateEventLayout(events, jan15);
    expect(result).toHaveLength(0);
  });

  it('filters events for the target day', () => {
    const events = [
      createTimedEvent('1', new Date(2025, 0, 15, 10, 0).getTime(), new Date(2025, 0, 15, 11, 0).getTime()),
      createTimedEvent('2', new Date(2025, 0, 16, 10, 0).getTime(), new Date(2025, 0, 16, 11, 0).getTime()),
    ];
    const result = calculateEventLayout(events, jan15);
    expect(result).toHaveLength(1);
    expect(result[0]._id).toBe('1');
  });

  it('sorts events by start time', () => {
    const events = [
      createTimedEvent('2', new Date(2025, 0, 15, 14, 0).getTime(), new Date(2025, 0, 15, 15, 0).getTime()),
      createTimedEvent('1', new Date(2025, 0, 15, 10, 0).getTime(), new Date(2025, 0, 15, 11, 0).getTime()),
    ];
    const result = calculateEventLayout(events, jan15);
    expect(result[0]._id).toBe('1');
  });

  it('places non-overlapping events in single column', () => {
    const events = [
      createTimedEvent('1', new Date(2025, 0, 15, 10, 0).getTime(), new Date(2025, 0, 15, 11, 0).getTime()),
      createTimedEvent('2', new Date(2025, 0, 15, 14, 0).getTime(), new Date(2025, 0, 15, 15, 0).getTime()),
    ];
    const result = calculateEventLayout(events, jan15);
    expect(result).toHaveLength(2);
    expect(result[0].width).toBe(100);
    expect(result[0].left).toBe(0);
    expect(result[1].width).toBe(100);
    expect(result[1].left).toBe(0);
  });

  it('places overlapping events in multiple columns', () => {
    const events = [
      createTimedEvent('1', new Date(2025, 0, 15, 10, 0).getTime(), new Date(2025, 0, 15, 12, 0).getTime()),
      createTimedEvent('2', new Date(2025, 0, 15, 11, 0).getTime(), new Date(2025, 0, 15, 13, 0).getTime()),
    ];
    const result = calculateEventLayout(events, jan15);
    expect(result).toHaveLength(2);
    expect(result[0].width).toBe(50);
    expect(result[1].width).toBe(50);
  });

  it('calculates correct width percentages', () => {
    // Three overlapping events
    const events = [
      createTimedEvent('1', new Date(2025, 0, 15, 10, 0).getTime(), new Date(2025, 0, 15, 14, 0).getTime()),
      createTimedEvent('2', new Date(2025, 0, 15, 11, 0).getTime(), new Date(2025, 0, 15, 13, 0).getTime()),
      createTimedEvent('3', new Date(2025, 0, 15, 12, 0).getTime(), new Date(2025, 0, 15, 15, 0).getTime()),
    ];
    const result = calculateEventLayout(events, jan15);
    expect(result).toHaveLength(3);
    // All in different columns, each gets 1/3 width
    expect(result[0].width).toBeCloseTo(33.33, 1);
  });

  it('calculates correct left offsets', () => {
    const events = [
      createTimedEvent('1', new Date(2025, 0, 15, 10, 0).getTime(), new Date(2025, 0, 15, 12, 0).getTime()),
      createTimedEvent('2', new Date(2025, 0, 15, 11, 0).getTime(), new Date(2025, 0, 15, 13, 0).getTime()),
    ];
    const result = calculateEventLayout(events, jan15);
    expect(result[0].left).toBe(0);
    expect(result[1].left).toBe(50);
  });

  it('assigns z-index based on column', () => {
    const events = [
      createTimedEvent('1', new Date(2025, 0, 15, 10, 0).getTime(), new Date(2025, 0, 15, 12, 0).getTime()),
      createTimedEvent('2', new Date(2025, 0, 15, 11, 0).getTime(), new Date(2025, 0, 15, 13, 0).getTime()),
    ];
    const result = calculateEventLayout(events, jan15);
    expect(result[0].zIndex).toBe(1);
    expect(result[1].zIndex).toBe(2);
  });

  it('handles empty events array', () => {
    const result = calculateEventLayout([], jan15);
    expect(result).toHaveLength(0);
  });

  it('reuses columns when events end before next starts', () => {
    const events = [
      createTimedEvent('1', new Date(2025, 0, 15, 9, 0).getTime(), new Date(2025, 0, 15, 10, 0).getTime()),
      createTimedEvent('2', new Date(2025, 0, 15, 10, 0).getTime(), new Date(2025, 0, 15, 11, 0).getTime()),
      createTimedEvent('3', new Date(2025, 0, 15, 11, 0).getTime(), new Date(2025, 0, 15, 12, 0).getTime()),
    ];
    const result = calculateEventLayout(events, jan15);
    // All events fit in single column (no overlap)
    expect(result[0].width).toBe(100);
    expect(result[1].width).toBe(100);
    expect(result[2].width).toBe(100);
  });
});
