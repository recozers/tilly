/**
 * Timezone utilities - consolidated from 4 different functions in server.js
 */

export interface TimezoneInfo {
  offsetMinutes: number;
  offsetHours: number;
  name: string;
  isDST: boolean;
}

/**
 * Get timezone info from a timezone name
 */
export function getTimezoneInfo(timezone: string): TimezoneInfo {
  const now = new Date();

  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'short',
    });

    const parts = formatter.formatToParts(now);
    const tzName = parts.find(p => p.type === 'timeZoneName')?.value || timezone;

    // Calculate offset
    const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
    const tzDate = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
    const offsetMinutes = (tzDate.getTime() - utcDate.getTime()) / 60000;

    // Check for DST by comparing January and July offsets
    const jan = new Date(now.getFullYear(), 0, 1);
    const jul = new Date(now.getFullYear(), 6, 1);

    const janUtc = new Date(jan.toLocaleString('en-US', { timeZone: 'UTC' }));
    const janTz = new Date(jan.toLocaleString('en-US', { timeZone: timezone }));
    const janOffset = (janTz.getTime() - janUtc.getTime()) / 60000;

    const julUtc = new Date(jul.toLocaleString('en-US', { timeZone: 'UTC' }));
    const julTz = new Date(jul.toLocaleString('en-US', { timeZone: timezone }));
    const julOffset = (julTz.getTime() - julUtc.getTime()) / 60000;

    const isDST = offsetMinutes !== Math.min(janOffset, julOffset);

    return {
      offsetMinutes,
      offsetHours: offsetMinutes / 60,
      name: tzName,
      isDST,
    };
  } catch {
    // Fallback to local timezone
    const offsetMinutes = -now.getTimezoneOffset();
    return {
      offsetMinutes,
      offsetHours: offsetMinutes / 60,
      name: timezone,
      isDST: false,
    };
  }
}

/**
 * Convert a local time string to UTC Date
 */
export function localToUTC(localTimeStr: string, timezone: string): Date {
  const date = new Date(localTimeStr);

  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date string: ${localTimeStr}`);
  }

  try {
    // Parse as if the string is in the given timezone
    const utcStr = date.toLocaleString('en-US', { timeZone: 'UTC' });
    const tzStr = date.toLocaleString('en-US', { timeZone: timezone });

    const utcDate = new Date(utcStr);
    const tzDate = new Date(tzStr);
    const offsetMs = utcDate.getTime() - tzDate.getTime();

    return new Date(date.getTime() + offsetMs);
  } catch {
    // If timezone is invalid, return the date as-is
    return date;
  }
}

/**
 * Convert a UTC Date to local time string
 */
export function utcToLocal(utcDate: Date, timezone: string): string {
  try {
    return utcDate.toLocaleString('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return utcDate.toISOString();
  }
}

/**
 * Format a date for display in a specific timezone
 */
export function formatDateInTimezone(date: Date, timezone: string, options?: Intl.DateTimeFormatOptions): string {
  const defaultOptions: Intl.DateTimeFormatOptions = {
    timeZone: timezone,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  };

  return date.toLocaleString('en-US', { ...defaultOptions, ...options });
}

/**
 * Get the current date in a specific timezone
 */
export function getCurrentDateInTimezone(timezone: string): Date {
  const now = new Date();
  const tzString = now.toLocaleString('en-US', { timeZone: timezone });
  return new Date(tzString);
}

/**
 * Parse a date string that may or may not have timezone info
 */
export function parseFlexibleDate(dateStr: string, defaultTimezone?: string): Date {
  // If it ends with Z, it's already UTC
  if (dateStr.endsWith('Z')) {
    return new Date(dateStr);
  }

  // If it has a timezone offset (+/-HH:MM), parse directly
  if (/[+-]\d{2}:\d{2}$/.test(dateStr)) {
    return new Date(dateStr);
  }

  // Otherwise, treat as local time in the default timezone
  if (defaultTimezone) {
    return localToUTC(dateStr, defaultTimezone);
  }

  // Fall back to parsing as-is
  return new Date(dateStr);
}
