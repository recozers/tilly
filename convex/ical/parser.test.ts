import { describe, it, expect } from 'vitest';
import {
  parseICalDate,
  parseICalData,
  unfoldIcalLines,
  formatICalDate,
  escapeICalText,
  generateUID,
  computeETag,
  getLastModified,
  generateICalData,
} from './parser';

describe('parseICalDate', () => {
  describe('all-day events (DATE format)', () => {
    it('parses YYYYMMDD format to UTC midnight', () => {
      const result = parseICalDate('20250115');
      expect(result.date.getTime()).toBe(Date.UTC(2025, 0, 15, 0, 0, 0));
      expect(result.isAllDay).toBe(true);
    });

    it('returns isAllDay: true for DATE format', () => {
      const result = parseICalDate('20241225');
      expect(result.isAllDay).toBe(true);
    });

    it('handles single digit months/days correctly', () => {
      const result = parseICalDate('20250101');
      expect(result.date.getUTCMonth()).toBe(0); // January
      expect(result.date.getUTCDate()).toBe(1);
    });

    it('handles December 31st edge case', () => {
      const result = parseICalDate('20251231');
      expect(result.date.getUTCMonth()).toBe(11); // December
      expect(result.date.getUTCDate()).toBe(31);
    });

    it('handles January 1st edge case', () => {
      const result = parseICalDate('20260101');
      expect(result.date.getUTCFullYear()).toBe(2026);
      expect(result.date.getUTCMonth()).toBe(0);
      expect(result.date.getUTCDate()).toBe(1);
    });
  });

  describe('datetime events (DATETIME format)', () => {
    it('parses YYYYMMDDTHHmmssZ as UTC', () => {
      const result = parseICalDate('20250115T143000Z');
      expect(result.date.getTime()).toBe(Date.UTC(2025, 0, 15, 14, 30, 0));
      expect(result.isAllDay).toBe(false);
    });

    it('parses YYYYMMDDTHHmmss without Z as local time', () => {
      const result = parseICalDate('20250115T143000');
      const expected = new Date(2025, 0, 15, 14, 30, 0);
      expect(result.date.getTime()).toBe(expected.getTime());
      expect(result.isAllDay).toBe(false);
    });

    it('returns isAllDay: false for datetime format', () => {
      const result = parseICalDate('20250115T143000Z');
      expect(result.isAllDay).toBe(false);
    });

    it('handles midnight times correctly', () => {
      const result = parseICalDate('20250115T000000Z');
      expect(result.date.getUTCHours()).toBe(0);
      expect(result.date.getUTCMinutes()).toBe(0);
      expect(result.date.getUTCSeconds()).toBe(0);
    });

    it('handles 23:59:59 times correctly', () => {
      const result = parseICalDate('20250115T235959Z');
      expect(result.date.getUTCHours()).toBe(23);
      expect(result.date.getUTCMinutes()).toBe(59);
      expect(result.date.getUTCSeconds()).toBe(59);
    });
  });

  describe('TZID prefix handling', () => {
    it('strips TZID prefix from date strings', () => {
      const result = parseICalDate('TZID=America/New_York:20250115T143000');
      expect(result.date.getHours()).toBe(14);
      expect(result.date.getMinutes()).toBe(30);
    });

    it('handles various timezone identifiers', () => {
      const result = parseICalDate('TZID=Europe/London:20250115');
      expect(result.isAllDay).toBe(true);
    });
  });

  describe('fallback parsing', () => {
    it('falls back to Date.parse for non-standard formats', () => {
      const result = parseICalDate('2025-01-15T14:30:00');
      expect(result.isAllDay).toBe(false);
    });

    it('returns isAllDay: false for fallback', () => {
      const result = parseICalDate('invalid-but-parseable-date');
      expect(result.isAllDay).toBe(false);
    });
  });
});

describe('unfoldIcalLines', () => {
  it('handles CRLF line continuations (space)', () => {
    // RFC 5545: Lines starting with space/tab after CRLF are continuations
    // The leading space is removed (it's just a continuation marker)
    const input = 'DESCRIPTION:This is a long\r\n description';
    const result = unfoldIcalLines(input);
    expect(result).toEqual(['DESCRIPTION:This is a longdescription']);
  });

  it('handles CRLF line continuations (tab)', () => {
    const input = 'SUMMARY:Title\r\n\twith tabs';
    const result = unfoldIcalLines(input);
    expect(result).toEqual(['SUMMARY:Titlewith tabs']);
  });

  it('handles CRLF line endings', () => {
    const input = 'LINE1\r\nLINE2\r\nLINE3';
    const result = unfoldIcalLines(input);
    expect(result).toEqual(['LINE1', 'LINE2', 'LINE3']);
  });

  it('handles LF-only line endings', () => {
    const input = 'LINE1\nLINE2\nLINE3';
    const result = unfoldIcalLines(input);
    expect(result).toEqual(['LINE1', 'LINE2', 'LINE3']);
  });

  it('handles CR-only line endings', () => {
    const input = 'LINE1\rLINE2\rLINE3';
    const result = unfoldIcalLines(input);
    expect(result).toEqual(['LINE1', 'LINE2', 'LINE3']);
  });

  it('filters out empty lines', () => {
    const input = 'LINE1\n\nLINE2\n   \nLINE3';
    const result = unfoldIcalLines(input);
    expect(result).toEqual(['LINE1', 'LINE2', 'LINE3']);
  });

  it('handles mixed line endings', () => {
    const input = 'LINE1\r\nLINE2\nLINE3\rLINE4';
    const result = unfoldIcalLines(input);
    expect(result).toEqual(['LINE1', 'LINE2', 'LINE3', 'LINE4']);
  });
});

describe('parseICalData', () => {
  describe('basic event parsing', () => {
    it('parses single VEVENT correctly', () => {
      const ical = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:test-123
SUMMARY:Test Event
DTSTART:20250115T100000Z
DTEND:20250115T110000Z
END:VEVENT
END:VCALENDAR`;
      const events = parseICalData(ical);
      expect(events).toHaveLength(1);
      expect(events[0].uid).toBe('test-123');
      expect(events[0].title).toBe('Test Event');
    });

    it('parses multiple VEVENTs', () => {
      const ical = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:event-1
SUMMARY:Event 1
DTSTART:20250115T100000Z
END:VEVENT
BEGIN:VEVENT
UID:event-2
SUMMARY:Event 2
DTSTART:20250116T100000Z
END:VEVENT
END:VCALENDAR`;
      const events = parseICalData(ical);
      expect(events).toHaveLength(2);
      expect(events[0].uid).toBe('event-1');
      expect(events[1].uid).toBe('event-2');
    });

    it('generates UID for events without one', () => {
      const ical = `BEGIN:VEVENT
SUMMARY:No UID Event
DTSTART:20250115T100000Z
END:VEVENT`;
      const events = parseICalData(ical);
      expect(events[0].uid).toMatch(/^imported-\d+-[a-z0-9]+$/);
    });

    it('uses "Untitled Event" for events without SUMMARY', () => {
      const ical = `BEGIN:VEVENT
UID:no-title
DTSTART:20250115T100000Z
END:VEVENT`;
      const events = parseICalData(ical);
      expect(events[0].title).toBe('Untitled Event');
    });
  });

  describe('all-day event handling', () => {
    it('correctly identifies all-day events', () => {
      const ical = `BEGIN:VEVENT
UID:allday-1
SUMMARY:All Day Event
DTSTART:20250115
DTEND:20250116
END:VEVENT`;
      const events = parseICalData(ical);
      expect(events[0].allDay).toBe(true);
    });

    it('handles exclusive DTEND by subtracting 1 day', () => {
      // iCal spec: DTEND for all-day is exclusive (Jan 16 means event ends on Jan 15)
      const ical = `BEGIN:VEVENT
UID:allday-2
SUMMARY:All Day
DTSTART:20250115
DTEND:20250116
END:VEVENT`;
      const events = parseICalData(ical);
      // End should be Jan 15 at 23:59:59.999 UTC
      expect(events[0].end.getUTCDate()).toBe(15);
      expect(events[0].end.getUTCHours()).toBe(23);
      expect(events[0].end.getUTCMinutes()).toBe(59);
    });

    it('sets end to 23:59:59.999 of last day', () => {
      const ical = `BEGIN:VEVENT
UID:allday-3
SUMMARY:Multi-day
DTSTART:20250115
DTEND:20250118
END:VEVENT`;
      const events = parseICalData(ical);
      // DTEND 18th means last day is 17th
      expect(events[0].end.getUTCDate()).toBe(17);
      expect(events[0].end.getUTCMilliseconds()).toBe(999);
    });

    it('handles single-day events without DTEND', () => {
      const ical = `BEGIN:VEVENT
UID:single-day
SUMMARY:Single Day
DTSTART:20250115
END:VEVENT`;
      const events = parseICalData(ical);
      expect(events[0].start.getUTCDate()).toBe(15);
      expect(events[0].end.getUTCDate()).toBe(15);
      expect(events[0].end.getUTCHours()).toBe(23);
      expect(events[0].end.getUTCMinutes()).toBe(59);
    });

    it('handles multi-day all-day events', () => {
      const ical = `BEGIN:VEVENT
UID:multi-day
SUMMARY:Vacation
DTSTART:20250115
DTEND:20250120
END:VEVENT`;
      const events = parseICalData(ical);
      expect(events[0].start.getUTCDate()).toBe(15);
      // DTEND 20th is exclusive, so last day is 19th
      expect(events[0].end.getUTCDate()).toBe(19);
    });
  });

  describe('timed event handling', () => {
    it('uses DTEND when provided', () => {
      const ical = `BEGIN:VEVENT
UID:timed-1
SUMMARY:Meeting
DTSTART:20250115T140000Z
DTEND:20250115T150000Z
END:VEVENT`;
      const events = parseICalData(ical);
      expect(events[0].start.getUTCHours()).toBe(14);
      expect(events[0].end.getUTCHours()).toBe(15);
    });

    it('defaults to 1 hour duration when DTEND missing', () => {
      const ical = `BEGIN:VEVENT
UID:no-end
SUMMARY:Quick Event
DTSTART:20250115T140000Z
END:VEVENT`;
      const events = parseICalData(ical);
      const duration = events[0].end.getTime() - events[0].start.getTime();
      expect(duration).toBe(60 * 60 * 1000); // 1 hour
    });

    it('handles UTC times correctly', () => {
      const ical = `BEGIN:VEVENT
UID:utc-event
DTSTART:20250115T120000Z
END:VEVENT`;
      const events = parseICalData(ical);
      expect(events[0].start.getUTCHours()).toBe(12);
    });
  });

  describe('property parsing', () => {
    it('parses DESCRIPTION with escaped newlines', () => {
      const ical = `BEGIN:VEVENT
UID:desc-1
SUMMARY:Event
DTSTART:20250115T100000Z
DESCRIPTION:Line 1\\nLine 2\\nLine 3
END:VEVENT`;
      const events = parseICalData(ical);
      expect(events[0].description).toBe('Line 1\nLine 2\nLine 3');
    });

    it('parses DESCRIPTION with escaped commas', () => {
      const ical = `BEGIN:VEVENT
UID:desc-2
SUMMARY:Event
DTSTART:20250115T100000Z
DESCRIPTION:Item 1\\, Item 2\\, Item 3
END:VEVENT`;
      const events = parseICalData(ical);
      expect(events[0].description).toBe('Item 1, Item 2, Item 3');
    });

    it('parses LOCATION with escaped characters', () => {
      const ical = `BEGIN:VEVENT
UID:loc-1
SUMMARY:Event
DTSTART:20250115T100000Z
LOCATION:Room 101\\, Building A
END:VEVENT`;
      const events = parseICalData(ical);
      expect(events[0].location).toBe('Room 101, Building A');
    });

    it('parses RRULE correctly', () => {
      const ical = `BEGIN:VEVENT
UID:recurring
SUMMARY:Weekly
DTSTART:20250115T100000Z
RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR
END:VEVENT`;
      const events = parseICalData(ical);
      expect(events[0].rrule).toBe('FREQ=WEEKLY;BYDAY=MO,WE,FR');
    });

    it('ignores unknown properties', () => {
      const ical = `BEGIN:VEVENT
UID:unknown-props
SUMMARY:Event
DTSTART:20250115T100000Z
X-CUSTOM-PROP:custom value
ATTENDEE:mailto:test@example.com
END:VEVENT`;
      const events = parseICalData(ical);
      expect(events).toHaveLength(1);
      expect(events[0].title).toBe('Event');
    });

    it('handles properties with parameters', () => {
      const ical = `BEGIN:VEVENT
UID:params
SUMMARY;LANGUAGE=en:English Title
DTSTART;VALUE=DATE:20250115
END:VEVENT`;
      const events = parseICalData(ical);
      expect(events[0].title).toBe('English Title');
      expect(events[0].allDay).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('skips events without DTSTART', () => {
      const ical = `BEGIN:VEVENT
UID:no-start
SUMMARY:Invalid Event
END:VEVENT`;
      const events = parseICalData(ical);
      expect(events).toHaveLength(0);
    });

    it('handles events with only DTSTART', () => {
      const ical = `BEGIN:VEVENT
UID:only-start
SUMMARY:Minimal
DTSTART:20250115T100000Z
END:VEVENT`;
      const events = parseICalData(ical);
      expect(events).toHaveLength(1);
    });

    it('handles malformed lines gracefully', () => {
      const ical = `BEGIN:VEVENT
UID:malformed
SUMMARY:Event
malformed line without colon
DTSTART:20250115T100000Z
END:VEVENT`;
      const events = parseICalData(ical);
      expect(events).toHaveLength(1);
    });
  });
});

describe('formatICalDate', () => {
  describe('all-day format', () => {
    it('formats UTC date as YYYYMMDD', () => {
      const date = new Date(Date.UTC(2025, 0, 15));
      const result = formatICalDate(date, true);
      expect(result).toBe('20250115');
    });

    it('uses UTC getters for date components', () => {
      // Create a date that's different in UTC vs local
      const date = new Date(Date.UTC(2025, 11, 31, 23, 0, 0));
      const result = formatICalDate(date, true);
      expect(result).toBe('20251231');
    });

    it('pads single-digit months and days', () => {
      const date = new Date(Date.UTC(2025, 0, 5));
      const result = formatICalDate(date, true);
      expect(result).toBe('20250105');
    });
  });

  describe('datetime format', () => {
    it('formats as YYYYMMDDTHHmmssZ', () => {
      const date = new Date(Date.UTC(2025, 0, 15, 14, 30, 45));
      const result = formatICalDate(date, false);
      expect(result).toBe('20250115T143045Z');
    });

    it('uses UTC getters for all components', () => {
      const date = new Date(Date.UTC(2025, 5, 15, 9, 5, 3));
      const result = formatICalDate(date, false);
      expect(result).toBe('20250615T090503Z');
    });

    it('pads all components correctly', () => {
      const date = new Date(Date.UTC(2025, 0, 1, 1, 2, 3));
      const result = formatICalDate(date, false);
      expect(result).toBe('20250101T010203Z');
    });

    it('handles midnight correctly', () => {
      const date = new Date(Date.UTC(2025, 0, 15, 0, 0, 0));
      const result = formatICalDate(date, false);
      expect(result).toBe('20250115T000000Z');
    });

    it('handles 23:59:59 correctly', () => {
      const date = new Date(Date.UTC(2025, 0, 15, 23, 59, 59));
      const result = formatICalDate(date, false);
      expect(result).toBe('20250115T235959Z');
    });
  });
});

describe('generateUID', () => {
  it('generates deterministic UID from event ID', () => {
    const uid1 = generateUID('abc123');
    const uid2 = generateUID('abc123');
    expect(uid1).toBe(uid2);
  });

  it('formats as UUID with domain suffix', () => {
    const uid = generateUID('test');
    expect(uid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}@tilly\.app$/);
  });

  it('uses default domain when not specified', () => {
    const uid = generateUID('test');
    expect(uid).toContain('@tilly.app');
  });

  it('uses custom domain when specified', () => {
    const uid = generateUID('test', 'custom.com');
    expect(uid).toContain('@custom.com');
  });

  it('pads short event IDs correctly', () => {
    const uid = generateUID('a');
    expect(uid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}@/);
  });
});

describe('computeETag', () => {
  it('returns quoted hex string', () => {
    const events = [{ _id: '1', startTime: 1000, endTime: 2000, title: 'Test' }];
    const etag = computeETag(events);
    expect(etag).toMatch(/^"[0-9a-f]+"$/);
  });

  it('produces same ETag for same data', () => {
    const events = [{ _id: '1', startTime: 1000, endTime: 2000, title: 'Test' }];
    const etag1 = computeETag(events);
    const etag2 = computeETag(events);
    expect(etag1).toBe(etag2);
  });

  it('produces different ETag for different data', () => {
    const events1 = [{ _id: '1', startTime: 1000, endTime: 2000, title: 'Test' }];
    const events2 = [{ _id: '1', startTime: 1000, endTime: 2000, title: 'Different' }];
    const etag1 = computeETag(events1);
    const etag2 = computeETag(events2);
    expect(etag1).not.toBe(etag2);
  });

  it('handles empty events array', () => {
    const etag = computeETag([]);
    expect(etag).toMatch(/^"[0-9a-f]+"$/);
  });

  it('is order-independent (sorts internally)', () => {
    const events1 = [
      { _id: '1', startTime: 1000, endTime: 2000, title: 'A' },
      { _id: '2', startTime: 3000, endTime: 4000, title: 'B' },
    ];
    const events2 = [
      { _id: '2', startTime: 3000, endTime: 4000, title: 'B' },
      { _id: '1', startTime: 1000, endTime: 2000, title: 'A' },
    ];
    expect(computeETag(events1)).toBe(computeETag(events2));
  });
});

describe('getLastModified', () => {
  it('returns current date for empty array', () => {
    const before = Date.now();
    const result = getLastModified([]);
    const after = Date.now();
    expect(result.getTime()).toBeGreaterThanOrEqual(before - 86400000);
    expect(result.getTime()).toBeLessThanOrEqual(after);
  });

  it('returns max of event times', () => {
    const events = [
      { startTime: 1000000, endTime: 2000000 },
      { startTime: 5000000, endTime: 6000000 },
    ];
    const result = getLastModified(events);
    // Should be based on max time (6000000) or within last day of now
    expect(result.getTime()).toBeGreaterThanOrEqual(6000000);
  });
});

describe('escapeICalText', () => {
  it('escapes backslashes', () => {
    expect(escapeICalText('path\\to\\file')).toBe('path\\\\to\\\\file');
  });

  it('escapes semicolons', () => {
    expect(escapeICalText('item;value')).toBe('item\\;value');
  });

  it('escapes commas', () => {
    expect(escapeICalText('a,b,c')).toBe('a\\,b\\,c');
  });

  it('escapes newlines', () => {
    expect(escapeICalText('line1\nline2')).toBe('line1\\nline2');
  });

  it('handles multiple escape sequences', () => {
    expect(escapeICalText('a\\b;c,d\ne')).toBe('a\\\\b\\;c\\,d\\ne');
  });

  it('handles text without special characters', () => {
    expect(escapeICalText('plain text')).toBe('plain text');
  });
});

describe('generateICalData', () => {
  describe('calendar header', () => {
    it('includes VERSION:2.0', () => {
      const result = generateICalData([]);
      expect(result).toContain('VERSION:2.0');
    });

    it('includes PRODID', () => {
      const result = generateICalData([]);
      expect(result).toContain('PRODID:-//Tilly//Calendar v1.0//EN');
    });

    it('includes calendar name', () => {
      const result = generateICalData([], 'My Calendar');
      expect(result).toContain('X-WR-CALNAME:My Calendar');
    });

    it('includes REFRESH-INTERVAL', () => {
      const result = generateICalData([]);
      expect(result).toContain('REFRESH-INTERVAL;VALUE=DURATION:PT1H');
    });

    it('includes VTIMEZONE definition', () => {
      const result = generateICalData([]);
      expect(result).toContain('BEGIN:VTIMEZONE');
      expect(result).toContain('END:VTIMEZONE');
    });
  });

  describe('event formatting', () => {
    const testEvent = {
      _id: 'test-id',
      title: 'Test Event',
      startTime: Date.UTC(2025, 0, 15, 14, 0, 0),
      endTime: Date.UTC(2025, 0, 15, 15, 0, 0),
    };

    it('includes required VEVENT properties', () => {
      const result = generateICalData([testEvent]);
      expect(result).toContain('BEGIN:VEVENT');
      expect(result).toContain('END:VEVENT');
      expect(result).toContain('UID:');
      expect(result).toContain('DTSTAMP:');
      expect(result).toContain('DTSTART:');
      expect(result).toContain('DTEND:');
      expect(result).toContain('SUMMARY:Test Event');
    });

    it('uses sourceEventUid when available', () => {
      const event = { ...testEvent, sourceEventUid: 'original-uid@example.com' };
      const result = generateICalData([event]);
      expect(result).toContain('UID:original-uid@example.com');
    });

    it('generates UID when sourceEventUid missing', () => {
      const result = generateICalData([testEvent]);
      expect(result).toMatch(/UID:[0-9a-f-]+@tilly\.app/);
    });

    it('formats all-day events with VALUE=DATE', () => {
      const allDayEvent = {
        ...testEvent,
        allDay: true,
        startTime: Date.UTC(2025, 0, 15, 0, 0, 0),
        endTime: Date.UTC(2025, 0, 15, 23, 59, 59, 999),
      };
      const result = generateICalData([allDayEvent]);
      expect(result).toContain('DTSTART;VALUE=DATE:20250115');
    });

    it('formats timed events with Z suffix', () => {
      const result = generateICalData([testEvent]);
      expect(result).toContain('DTSTART:20250115T140000Z');
      expect(result).toContain('DTEND:20250115T150000Z');
    });

    it('includes optional properties when present', () => {
      const event = {
        ...testEvent,
        description: 'Test description',
        location: 'Test location',
      };
      const result = generateICalData([event]);
      expect(result).toContain('DESCRIPTION:Test description');
      expect(result).toContain('LOCATION:Test location');
    });

    it('includes RRULE when present', () => {
      const event = { ...testEvent, rrule: 'FREQ=WEEKLY;BYDAY=MO' };
      const result = generateICalData([event]);
      expect(result).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO');
    });

    it('uses CRLF line endings', () => {
      const result = generateICalData([testEvent]);
      expect(result).toContain('\r\n');
      expect(result.split('\r\n').length).toBeGreaterThan(1);
    });
  });

  describe('all-day event DTEND export', () => {
    it('adds 1 day to DTEND for exclusive format', () => {
      const event = {
        _id: 'allday',
        title: 'All Day',
        startTime: Date.UTC(2025, 0, 15, 0, 0, 0),
        endTime: Date.UTC(2025, 0, 15, 23, 59, 59, 999),
        allDay: true,
      };
      const result = generateICalData([event]);
      // End is Jan 15 23:59:59, so DTEND should be Jan 16 (exclusive)
      expect(result).toContain('DTEND;VALUE=DATE:20250116');
    });

    it('exports single-day event with next-day DTEND', () => {
      const event = {
        _id: 'single',
        title: 'Single Day',
        startTime: Date.UTC(2025, 0, 20, 0, 0, 0),
        endTime: Date.UTC(2025, 0, 20, 23, 59, 59, 999),
        allDay: true,
      };
      const result = generateICalData([event]);
      expect(result).toContain('DTSTART;VALUE=DATE:20250120');
      expect(result).toContain('DTEND;VALUE=DATE:20250121');
    });

    it('exports multi-day event correctly', () => {
      const event = {
        _id: 'multi',
        title: 'Vacation',
        startTime: Date.UTC(2025, 0, 15, 0, 0, 0),
        endTime: Date.UTC(2025, 0, 19, 23, 59, 59, 999),
        allDay: true,
      };
      const result = generateICalData([event]);
      expect(result).toContain('DTSTART;VALUE=DATE:20250115');
      // Jan 19 end means DTEND should be Jan 20
      expect(result).toContain('DTEND;VALUE=DATE:20250120');
    });
  });
});
