export const PX_PER_HOUR = 64;
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
