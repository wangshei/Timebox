export const PX_PER_HOUR = 68;
export const SNAP_MINUTES = 15;
export const TASK_BLOCK_WIDTH_PERCENT = 72;

export function snapToGrid(totalMinutes: number): number {
  return Math.round(totalMinutes / SNAP_MINUTES) * SNAP_MINUTES;
}

export function minutesToTimeString(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function offsetYToMinutes(offsetY: number, pxPerHour: number = PX_PER_HOUR): number {
  return snapToGrid((offsetY / pxPerHour) * 60);
}

export function parseTimeToMins(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export const MINS_PER_DAY = 24 * 60;

/** Add N days to a YYYY-MM-DD string, returning YYYY-MM-DD (local, DST-safe). */
export function addDaysToDateString(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Whole-day offset between two YYYY-MM-DD strings (endDate - startDate). */
export function dayOffsetBetween(startDate: string, endDate: string): number {
  const a = new Date(startDate + 'T00:00:00').getTime();
  const b = new Date(endDate + 'T00:00:00').getTime();
  return Math.round((b - a) / 86400000);
}

/**
 * Map an absolute end offset (minutes from the start of the start day) onto a
 * calendar {endDate, endTime}. endDate is undefined when the end lands on the
 * start day. Used to turn a drag/resize that crosses midnight into a proper
 * cross-date event instead of an invalid "25:00" time.
 */
export function absMinsToEndParts(
  startDate: string,
  endAbsMins: number,
): { endDate?: string; endTime: string } {
  const dayOffset = Math.floor(endAbsMins / MINS_PER_DAY);
  const endMinsInDay = endAbsMins - dayOffset * MINS_PER_DAY;
  return {
    endTime: minutesToTimeString(endMinsInDay),
    endDate: dayOffset > 0 ? addDaysToDateString(startDate, dayOffset) : undefined,
  };
}

/**
 * Given a set of day-columns (each with its date + on-screen grid rect) and a
 * cursor position, return which column the cursor is over and the snapped minutes
 * from the top of that column. Clamps horizontally to the first/last column so a
 * drag past the edge still resolves. Used to make event resize follow the cursor
 * across day columns (drag into tomorrow → cross-date event).
 */
export function resolveGridColumnAtPoint(
  columns: Array<{ date: string; rect: DOMRect }>,
  clientX: number,
  clientY: number,
  pxPerHour: number,
): { date: string; minsInDay: number } | null {
  if (!columns.length) return null;
  // Columns are in left-to-right order: pick the last whose left edge is ≤ x.
  let chosen = columns[0];
  for (const c of columns) {
    if (clientX >= c.rect.left) chosen = c;
  }
  const mins = snapToGrid(((clientY - chosen.rect.top) / pxPerHour) * 60);
  return { date: chosen.date, minsInDay: Math.max(0, Math.min(mins, MINS_PER_DAY)) };
}
