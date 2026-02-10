import { Task, TimeBlock } from '../types';

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
 * Filter tasks by backlog section
 */
export function getUnscheduledTasks(tasks: Task[], timeBlocks: TimeBlock[]): Task[] {
  return tasks.filter(task => {
    const planned = getPlannedMinutes(task, timeBlocks);
    const recorded = getRecordedMinutes(task, timeBlocks);
    return planned === 0 && recorded === 0;
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
