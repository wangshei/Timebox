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
  maxInstances = 52
): string[] {
  if (pattern === 'none') return [startDate];

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
      dates.push(toStr(addDays(origin, i)));
    }
    return dates;
  }

  if (pattern === 'every_other_day') {
    for (let i = 0; dates.length < maxInstances; i++) {
      dates.push(toStr(addDays(origin, i * 2)));
    }
    return dates;
  }

  if (pattern === 'weekly') {
    for (let i = 0; dates.length < maxInstances; i++) {
      dates.push(toStr(addDays(origin, i * 7)));
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
      if (candidate.getDate() !== origin.getDate()) continue;
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
      if (recurrenceDays.includes(d.getDay())) {
        dates.push(toStr(d));
      }
      d = addDays(d, 1);
    }
    return dates;
  }

  return [startDate];
}
