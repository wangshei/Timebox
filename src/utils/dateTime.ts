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
 * Return the YYYY-MM-DD strings for every day in a view window.
 * - 'day'   → [date]
 * - '3day'  → [date, date+1, date+2]
 * - 'week'  → Mon–Sun of the week containing date
 * - 'month' → all days in the month containing date
 */
export function getViewDateRange(date: string, view: 'day' | '3day' | 'week' | 'month'): string[] {
  const base = parseLocalDateString(date);
  if (view === 'day') return [date];
  if (view === '3day') {
    return [0, 1, 2].map((offset) => {
      const d = new Date(base);
      d.setDate(d.getDate() + offset);
      return getLocalDateString(d);
    });
  }
  if (view === 'week') {
    // Week starts Monday (day 1); Sunday (0) maps to -6
    const dow = base.getDay();
    const daysToMon = dow === 0 ? -6 : 1 - dow;
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base);
      d.setDate(d.getDate() + daysToMon + i);
      return getLocalDateString(d);
    });
  }
  // month
  const year = base.getFullYear();
  const month = base.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: daysInMonth }, (_, i) => {
    const d = new Date(year, month, i + 1);
    return getLocalDateString(d);
  });
}

/**
 * Parse YYYY-MM-DD as a local date (midnight in local time).
 * Use when you need a Date for a calendar day, not a UTC moment.
 */
export function parseLocalDateString(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}
