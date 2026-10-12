import type { RecurrencePattern } from '../types';

/**
 * Generate all occurrence dates for a recurring event.
 * Returns an array of YYYY-MM-DD strings starting with startDate itself,
 * capped at maxInstances (default 365).
 */
export function generateRecurrenceDates(
  startDate: string,
  pattern: RecurrencePattern,
  recurrenceDays?: number[],
  maxInstances = DEFAULT_MAX_INSTANCES,
  untilDate?: string
): string[] {
  if (pattern === 'none') return [startDate];
  // `until` (inclusive) caps the series by date; the instance cap stays as a safety net.
  const dates = generateRaw(startDate, pattern, recurrenceDays, untilDate ? MAX_UNTIL_INSTANCES : maxInstances, untilDate);
  // The date the user picked is always an occurrence, even when a custom pattern's weekdays
  // don't include it (B-26 / N-17) - it must never be silently skipped or moved.
  return dates.includes(startDate) ? dates : [startDate, ...dates];
}

/** Default horizon for a series created without an explicit end date: one year. */
export function defaultSeriesUntil(startDate: string): string {
  const [y, m, d] = startDate.split('-').map(Number);
  const end = new Date(y, (m ?? 1) - 1, d ?? 1, 12);
  end.setFullYear(end.getFullYear() + 1);
  return `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
}

/** Instances to keep when no explicit end date is given (daily = ~1 year). */
const DEFAULT_MAX_INSTANCES = 400;

function generateRaw(
  startDate: string,
  pattern: RecurrencePattern,
  recurrenceDays: number[] | undefined,
  maxInstances: number,
  untilDate?: string
): string[] {

  // Parse startDate into a local Date (noon to avoid DST shifts)
  const [sy, sm, sd] = startDate.split('-').map(Number);
  const origin = new Date(sy, (sm ?? 1) - 1, sd ?? 1, 12, 0, 0);

  const addDays = (d: Date, n: number) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12, 0, 0);

  const toStr = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const dates: string[] = [];

  if (pattern === 'daily') {
    for (let i = 0; dates.length < maxInstances; i++) {
      const s = toStr(addDays(origin, i));
      if (untilDate && s > untilDate) break;
      dates.push(s);
    }
    return dates;
  }

  if (pattern === 'every_other_day') {
    for (let i = 0; dates.length < maxInstances; i++) {
      const s = toStr(addDays(origin, i * 2));
      if (untilDate && s > untilDate) break;
      dates.push(s);
    }
    return dates;
  }

  if (pattern === 'weekly') {
    for (let i = 0; dates.length < maxInstances; i++) {
      const s = toStr(addDays(origin, i * 7));
      if (untilDate && s > untilDate) break;
      dates.push(s);
    }
    return dates;
  }

  if (pattern === 'monthly') {
    let monthOffset = 0;
    while (dates.length < maxInstances) {
      // Build a candidate date by advancing the month
      const candidate = new Date(
        origin.getFullYear(),
        origin.getMonth() + monthOffset,
        origin.getDate(),
        12, 0, 0
      );
      monthOffset++;
      // If the day rolled over (e.g. Jan 31 → Feb 3), skip this month
      if (candidate.getDate() !== origin.getDate()) {
        if (untilDate && toStr(candidate) > untilDate) break;
        continue;
      }
      if (untilDate && toStr(candidate) > untilDate) break;
      dates.push(toStr(candidate));
    }
    return dates;
  }

  if (pattern === 'custom') {
    if (!recurrenceDays || recurrenceDays.length === 0) return [startDate];
    // Iterate day by day, collecting days whose weekday is in recurrenceDays
    let d = origin;
    const maxDaysToSearch = maxInstances * 10;
    for (let i = 0; dates.length < maxInstances && i < maxDaysToSearch; i++) {
      if (untilDate && toStr(d) > untilDate) break;
      if (recurrenceDays.includes(d.getDay())) {
        dates.push(toStr(d));
      }
      d = addDays(d, 1);
    }
    return dates;
  }

  return [startDate];
}

/** Max occurrences a "repeat until" series may generate in one go. */
const MAX_UNTIL_INSTANCES = 800;

/**
 * Occurrence dates strictly after `afterDate` (which must itself be an occurrence)
 * up to and including `untilDate`. Used to extend an existing materialized series.
 */
export function generateRecurrenceDatesAfter(
  afterDate: string,
  pattern: RecurrencePattern,
  recurrenceDays: number[] | undefined,
  untilDate: string
): string[] {
  if (pattern === 'none' || untilDate <= afterDate) return [];
  return generateRecurrenceDates(afterDate, pattern, recurrenceDays, MAX_UNTIL_INSTANCES, untilDate)
    .filter((d) => d > afterDate && d <= untilDate);
}
