/**
 * Date/time helpers that always use the user's local timezone.
 * Use these instead of toISOString().slice(0,10) for calendar dates
 * so "today" and date strings are correct in the user's timezone.
 */

/** Get IANA timezone string for the current environment (e.g. "America/Los_Angeles"). */
export function getLocalTimeZone(): string {
  if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
  return 'UTC';
}

/**
 * Format a date as YYYY-MM-DD in the local timezone.
 * Use this for "today", selected date, and any calendar date string.
 */
export function getLocalDateString(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** True if dateStr (YYYY-MM-DD) is today in the local timezone. */
export function isTodayLocal(dateStr: string): boolean {
  return getLocalDateString() === dateStr;
}

/**
 * Parse YYYY-MM-DD as a local date (midnight in local time).
 * Use when you need a Date for a calendar day, not a UTC moment.
 */
export function parseLocalDateString(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}
