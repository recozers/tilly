/**
 * Calendar color constants - single source of truth
 * Previously duplicated in: supabase.js, server.js, src/eventsApi.js
 */
export const CALENDAR_COLORS = {
  GREEN: '#4A7C2A',
  CREAM: '#F4F1E8',
} as const;

export type CalendarColor = typeof CALENDAR_COLORS[keyof typeof CALENDAR_COLORS];

/**
 * Get a random calendar color
 */
export function getRandomEventColor(): CalendarColor {
  const colors = Object.values(CALENDAR_COLORS);
  return colors[Math.floor(Math.random() * colors.length)];
}
