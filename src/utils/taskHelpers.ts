import { Task, TimeBlock, Event } from '../types';
import { getLocalDateString } from './dateTime';

/**
 * Calculate total planned minutes for a task
 */
export function getPlannedMinutes(task: Task, timeBlocks: TimeBlock[]): number {
  return timeBlocks
    .filter(block => block.taskId === task.id && block.mode === 'planned')
    .reduce((sum, block) => {
      const start = parseTimeToMinutes(block.start);
      const end = parseTimeToMinutes(block.end);
      return sum + (end - start);
    }, 0);
}

/**
 * Calculate total recorded minutes for a task
 */
export function getRecordedMinutes(task: Task, timeBlocks: TimeBlock[]): number {
  return timeBlocks
    .filter(block => block.taskId === task.id && block.mode === 'recorded')
    .reduce((sum, block) => {
      const start = parseTimeToMinutes(block.start);
      const end = parseTimeToMinutes(block.end);
      return sum + (end - start);
    }, 0);
}

/**
 * Calculate task progress (0-1)
 */
export function getTaskProgress(task: Task, timeBlocks: TimeBlock[]): number {
  const recorded = getRecordedMinutes(task, timeBlocks);
  if (task.estimatedMinutes === 0) return 0;
  return Math.min(recorded / task.estimatedMinutes, 1);
}

/**
 * Get task status based on planned/recorded minutes
 */
export function getTaskStatus(task: Task, timeBlocks: TimeBlock[]): Task['status'] {
  const planned = getPlannedMinutes(task, timeBlocks);
  const recorded = getRecordedMinutes(task, timeBlocks);
  
  if (recorded >= task.estimatedMinutes) {
    return 'done';
  }
  if (recorded > 0) {
    return 'partially_done';
  }
  if (planned >= task.estimatedMinutes) {
    return 'fully_planned';
  }
  if (planned > 0) {
    return 'partially_planned';
  }
  return 'inbox';
}

/**
 * Parse time string (HH:mm) to minutes since midnight
 */
export function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Format minutes to hours string (e.g., "2.5h" or "1h 30m")
 */
export function formatMinutesToHours(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h`;
  return `${mins}m`;
}

/**
 * Format minutes to decimal hours (e.g., 90 minutes -> "1.5h")
 */
export function formatMinutesToDecimalHours(minutes: number): string {
  const hours = minutes / 60;
  return `${hours.toFixed(1)}h`;
}

/**
 * Filter tasks by backlog section.
 *
 * A task is "unscheduled" (shows in right panel) when:
 *   1. It has zero planned blocks at all, OR
 *   2. ALL of its planned blocks are in the past AND none are confirmed
 *      (task was never done — the past blocks stay on calendar as locked/
 *       not-done, but the task returns to the backlog for re-scheduling).
 *
 * A task is NOT unscheduled (stays on calendar only) when:
 *   - It has any planned block on today or a future date, OR
 *   - It has at least one confirmed block, OR
 *   - It is marked done.
 */
export function getUnscheduledTasks(tasks: Task[], timeBlocks: TimeBlock[]): Task[] {
  const today = getLocalDateString();
  return tasks.filter(task => {
    // Done tasks always go to the Done section, never unscheduled
    if (task.status === 'done') return false;

    const taskBlocks = timeBlocks.filter(b => b.taskId === task.id && b.mode === 'planned');

    // No planned blocks at all → unscheduled
    if (taskBlocks.length === 0) return true;

    // Has any block today or in the future → scheduled on calendar, not unscheduled
    const hasActiveBlock = taskBlocks.some(b => b.date >= today);
    if (hasActiveBlock) return false;

    // All blocks are in the past — check if any were confirmed
    const anyConfirmed = taskBlocks.some(b => b.confirmationStatus === 'confirmed');
    if (anyConfirmed) return false;

    // All past, none confirmed → task returns to unscheduled
    // (the past blocks stay on calendar as locked/not-done)
    return true;
  });
}

export function getPartiallyCompletedTasks(tasks: Task[], timeBlocks: TimeBlock[]): Task[] {
  return tasks.filter(task => {
    const recorded = getRecordedMinutes(task, timeBlocks);
    return recorded > 0 && recorded < task.estimatedMinutes;
  });
}

export function getFixedTasks(tasks: Task[]): Task[] {
  return tasks.filter(task => !task.flexible);
}

export function getFlexibleTasks(tasks: Task[]): Task[] {
  return tasks.filter(task => task.flexible);
}

/**
 * Find the next available time slot on a given date.
 * Scans gaps between occupied intervals (blocks + events) from `afterTime` to `beforeTime`.
 * Returns the first gap that fits `durationMins`, rounded up to 15-minute boundaries.
 */
export function findNextAvailableSlot(
  timeBlocks: TimeBlock[],
  events: Event[],
  date: string,
  durationMins: number,
  afterTime: string,
  beforeTime: string,
): { start: string; end: string } | null {
  const afterMins = parseTimeToMinutes(afterTime);
  const beforeMins = parseTimeToMinutes(beforeTime);
  // Round start up to next 15-min boundary
  const windowStart = Math.ceil(afterMins / 15) * 15;
  if (windowStart + durationMins > beforeMins) return null;

  // Collect all occupied intervals on this date (skip past skipped blocks — they're free)
  const occupied: Array<{ start: number; end: number }> = [];
  for (const b of timeBlocks) {
    if (b.date !== date) continue;
    if (b.confirmationStatus === 'skipped') continue;
    occupied.push({ start: parseTimeToMinutes(b.start), end: parseTimeToMinutes(b.end) });
  }
  for (const e of events) {
    if (e.date !== date) continue;
    occupied.push({ start: parseTimeToMinutes(e.start), end: parseTimeToMinutes(e.end) });
  }
  // Sort by start time
  occupied.sort((a, b) => a.start - b.start || a.end - b.end);

  // Scan for gaps
  let cursor = windowStart;
  for (const interval of occupied) {
    if (interval.end <= cursor) continue; // fully before cursor
    if (interval.start > cursor) {
      // There's a gap from cursor to interval.start
      const gapEnd = Math.min(interval.start, beforeMins);
      if (gapEnd - cursor >= durationMins) {
        const endMins = cursor + durationMins;
        return { start: minsToTime(cursor), end: minsToTime(endMins) };
      }
    }
    cursor = Math.max(cursor, interval.end);
  }
  // Check gap after last interval
  if (beforeMins - cursor >= durationMins) {
    return { start: minsToTime(cursor), end: minsToTime(cursor + durationMins) };
  }
  return null;
}

function minsToTime(mins: number): string {
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}
