/**
 * Date/time helpers that always use the user's local timezone.
 * Use these instead of toISOString().slice(0,10) for calendar dates
 * so "today" and date strings are correct in the user's timezone.
 */

/** Get IANA timezone string for the current environment (e.g. "America/Los_Angeles").
 *  Checks for a user override in localStorage before falling back to browser detection.
 */
export function getLocalTimeZone(): string {
  try {
    const override = localStorage.getItem('timebox_user_timezone');
    if (override) return override;
  } catch { /* localStorage unavailable */ }
  if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
  return 'UTC';
}

/** Get the browser's detected timezone (ignoring any user override). */
export function getBrowserTimeZone(): string {
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
 * Return the start of the week containing the given date.
 * - weekStartsOnMonday: true  → Monday (ISO-style)
 * - weekStartsOnMonday: false → Sunday (US-style)
 */
export function getStartOfWeek(date: Date, weekStartsOnMonday: boolean): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sun, 6 = Sat
  const daysBack = weekStartsOnMonday ? (day + 6) % 7 : day;
  d.setDate(d.getDate() - daysBack);
  d.setHours(0, 0, 0, 0);
  return d;
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

/**
 * Get secondary timezones from localStorage.
 * Returns an array of IANA timezone strings (max 2).
 */
export function getSecondaryTimezones(): string[] {
  try {
    const raw = localStorage.getItem('timebox_secondary_timezones');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.slice(0, 2);
    }
  } catch { /* ignore */ }
  return [];
}

/**
 * Get the short timezone abbreviation for a given IANA timezone (e.g., "PST", "EST").
 */
export function getTimezoneAbbr(timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' }).formatToParts(new Date());
    const tzPart = parts.find(p => p.type === 'timeZoneName');
    return tzPart?.value || timeZone.split('/').pop()?.replace(/_/g, ' ') || timeZone;
  } catch {
    return timeZone.split('/').pop()?.replace(/_/g, ' ') || timeZone;
  }
}

/**
 * Get the hour (0-23) in a given timezone for a local hour on a given date.
 * @param localHour - hour in the primary/local timezone (0-23)
 * @param dateStr - YYYY-MM-DD date string
 * @param targetTimeZone - IANA timezone to convert to
 * @returns hour in the target timezone (0-23)
 */
export function convertHourToTimezone(localHour: number, dateStr: string, targetTimeZone: string): number {
  // Create a date at the given hour in the local timezone
  const [y, m, d] = dateStr.split('-').map(Number);
  const localDate = new Date(y, m - 1, d, localHour, 0, 0);

  // Format the hour in the target timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: targetTimeZone,
    hour: 'numeric',
    hour12: false,
  });
  const hourStr = formatter.format(localDate);
  // Intl may return "24" for midnight — normalize to 0
  const h = parseInt(hourStr, 10);
  return h === 24 ? 0 : h;
}

/**
 * Format an hour number (0-23) as short label like "12a", "1p", "12p".
 */
export function formatHourShort(hour: number): string {
  if (hour === 0) return '12a';
  if (hour === 12) return '12p';
  if (hour > 12) return `${hour - 12}p`;
  return `${hour}a`;
}
