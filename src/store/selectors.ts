/**
 * Derived state (selectors) for The Timeboxing Club.
 * Pure functions from store state; used by UI for backlog and analytics.
 */

import type {
  Task,
  TimeBlock,
  CalendarContainer,
  Category,
  Tag,
  View,
  Event,
} from '../types';
import {
  getPlannedMinutes,
  getRecordedMinutes,
  getUnscheduledTasks,
  getPartiallyCompletedTasks,
  getFixedTasks,
  parseTimeToMinutes,
} from '../utils/taskHelpers';

export interface SummaryRow {
  id: string;
  name: string;
  color: string;
  plannedHours: number;
  recordedHours: number;
  deltaHours: number;
}

export function selectUnscheduledTasks(
  tasks: Task[],
  timeBlocks: TimeBlock[]
): Task[] {
  return getUnscheduledTasks(tasks, timeBlocks);
}

export function selectPartiallyCompletedTasks(
  tasks: Task[],
  timeBlocks: TimeBlock[]
): Task[] {
  return getPartiallyCompletedTasks(tasks, timeBlocks);
}

export function selectFixedTasks(tasks: Task[]): Task[] {
  return getFixedTasks(tasks);
}

/** Tasks that have recorded time and no planned time (fully confirmed / done). */
export function selectDoneTasks(
  tasks: Task[],
  timeBlocks: TimeBlock[]
): Task[] {
  return tasks.filter((task) => {
    if (task.status === 'done') return true;
    const planned = getPlannedMinutes(task, timeBlocks);
    const recorded = getRecordedMinutes(task, timeBlocks);
    return planned === 0 && recorded > 0;
  });
}

export function selectTimeBlocksForDate(
  timeBlocks: TimeBlock[],
  date: string,
  containerVisibility: Record<string, boolean>
): TimeBlock[] {
  return timeBlocks.filter(
    (b) =>
      b.date === date &&
      containerVisibility[b.calendarContainerId] !== false
  );
}


/** Blocks visible for the current view range.
 *  For day view: filter by exact date. For multi-day views (3day, week, month):
 *  only filter by container visibility — the view components already filter by date
 *  internally, matching how events are handled. */
export function selectTimeBlocksForView(
  timeBlocks: TimeBlock[],
  selectedDate: string,
  view: View,
  containerVisibility: Record<string, boolean>
): TimeBlock[] {
  const visible = (b: TimeBlock) => containerVisibility[b.calendarContainerId] !== false;
  if (view === 'day') {
    return timeBlocks.filter((b) => b.date === selectedDate && visible(b));
  }
  // For 3day, week, month: pass all visibility-filtered blocks through.
  // Each view component filters by its own date range (using the user's weekStartsOnMonday pref).
  return timeBlocks.filter(visible);
}

/** Planned time by category for a date. */
export function selectPlannedSummaryByCategory(
  timeBlocks: TimeBlock[],
  date: string,
  categories: Category[]
): SummaryRow[] {
  const planned = timeBlocks.filter(
    (b) => b.date === date && b.mode === 'planned'
  );
  const byCategory = new Map<string, { category: Category; minutes: number }>();
  for (const block of planned) {
    const cat = categories.find((c) => c.id === block.categoryId);
    if (!cat) continue;
    const mins =
      parseTimeToMinutes(block.end) - parseTimeToMinutes(block.start);
    const prev = byCategory.get(cat.id);
    byCategory.set(cat.id, {
      category: cat,
      minutes: (prev?.minutes ?? 0) + mins,
    });
  }
  return Array.from(byCategory.values()).map(({ category, minutes }) => ({
    id: category.id,
    name: category.name,
    color: category.color,
    plannedHours: minutes / 60,
    recordedHours: 0,
    deltaHours: 0,
  }));
}

/** Recorded time by category for a date. */
export function selectRecordedSummaryByCategory(
  timeBlocks: TimeBlock[],
  date: string,
  categories: Category[]
): SummaryRow[] {
  const recorded = timeBlocks.filter(
    (b) => b.date === date && b.mode === 'recorded'
  );
  const byCategory = new Map<string, { category: Category; minutes: number }>();
  for (const block of recorded) {
    const cat = categories.find((c) => c.id === block.categoryId);
    if (!cat) continue;
    const mins =
      parseTimeToMinutes(block.end) - parseTimeToMinutes(block.start);
    const prev = byCategory.get(cat.id);
    byCategory.set(cat.id, {
      category: cat,
      minutes: (prev?.minutes ?? 0) + mins,
    });
  }
  return Array.from(byCategory.values()).map(({ category, minutes }) => ({
    id: category.id,
    name: category.name,
    color: category.color,
    plannedHours: 0,
    recordedHours: minutes / 60,
    deltaHours: 0,
  }));
}

// --- Plan vs Actual helpers ---

/**
 * True if this block represents the original planned intent.
 * Excludes retroactively-added unplanned blocks (they have no plan counterpart).
 */
export function isPlannedIntent(b: TimeBlock): boolean {
  return b.mode === 'planned' && b.source !== 'unplanned';
}

/**
 * True if this block counts as "recorded" / actually done.
 * Covers both the new confirmation model and legacy mode='recorded' blocks.
 * Event blocks (no taskId) auto-confirm in the past unless explicitly skipped.
 */
export function isRecordedBlock(b: TimeBlock, todayStr?: string): boolean {
  if (b.confirmationStatus === 'skipped') return false;
  if (b.confirmationStatus === 'confirmed' || b.mode === 'recorded') return true;
  // Events (no taskId) are auto-confirmed in the past
  if (!b.taskId && todayStr && b.date < todayStr) return true;
  return false;
}

/** Minutes to use for recorded time — actual if set, else planned. */
function recordedMins(b: TimeBlock): number {
  const s = b.recordedStart ?? b.start;
  const e = b.recordedEnd ?? b.end;
  return parseTimeToMinutes(e) - parseTimeToMinutes(s);
}

/**
 * Plan vs Actual by category across a set of dates (day, week, or month range).
 * Pass all dates in the current view window as `dates`.
 */
/** Get duration in minutes from an event's start/end times. */
function eventMins(e: Event): number {
  return parseTimeToMinutes(e.end) - parseTimeToMinutes(e.start);
}

export function selectPlanVsActualByCategory(
  timeBlocks: TimeBlock[],
  dates: string[],
  categories: Category[],
  todayStr?: string,
  events?: Event[]
): SummaryRow[] {
  const dateSet = new Set(dates);
  const inRange = timeBlocks.filter((b) => dateSet.has(b.date));
  const byCategory = new Map<
    string,
    { category: Category; plannedMins: number; recordedMins: number }
  >();
  for (const b of inRange) {
    const cat = categories.find((c) => c.id === b.categoryId);
    if (!cat) continue;
    const prev = byCategory.get(cat.id) ?? { category: cat, plannedMins: 0, recordedMins: 0 };
    if (isPlannedIntent(b)) {
      const mins = parseTimeToMinutes(b.end) - parseTimeToMinutes(b.start);
      byCategory.set(cat.id, { ...prev, plannedMins: prev.plannedMins + mins });
    }
    if (isRecordedBlock(b, todayStr)) {
      byCategory.set(cat.id, { ...prev, recordedMins: prev.recordedMins + recordedMins(b) });
    }
  }
  // Include events
  if (events) {
    const eventsInRange = events.filter((e) => dateSet.has(e.date));
    for (const e of eventsInRange) {
      const cat = categories.find((c) => c.id === e.categoryId);
      if (!cat) continue;
      const prev = byCategory.get(cat.id) ?? { category: cat, plannedMins: 0, recordedMins: 0 };
      const mins = eventMins(e);
      // Events are always planned
      prev.plannedMins += mins;
      // Attended events count as recorded
      if (e.attendanceStatus === 'attended') {
        prev.recordedMins += mins;
      }
      byCategory.set(cat.id, prev);
    }
  }
  return Array.from(byCategory.values())
    .map(({ category, plannedMins, recordedMins }) => ({
      id: category.id,
      name: category.name,
      color: category.color,
      plannedHours: plannedMins / 60,
      recordedHours: recordedMins / 60,
      deltaHours: (recordedMins - plannedMins) / 60,
    }))
    .sort((a, b) => b.recordedHours - a.recordedHours);
}

/** Plan vs Actual by calendar container across a set of dates. */
export function selectPlanVsActualByContainer(
  timeBlocks: TimeBlock[],
  dates: string[],
  containers: CalendarContainer[],
  todayStr?: string,
  events?: Event[]
): SummaryRow[] {
  const dateSet = new Set(dates);
  const inRange = timeBlocks.filter((b) => dateSet.has(b.date));
  const byContainer = new Map<
    string,
    { container: CalendarContainer; plannedMins: number; recordedMins: number }
  >();
  for (const b of inRange) {
    const container = containers.find((c) => c.id === b.calendarContainerId);
    if (!container) continue;
    const prev = byContainer.get(container.id) ?? { container, plannedMins: 0, recordedMins: 0 };
    if (isPlannedIntent(b)) {
      const mins = parseTimeToMinutes(b.end) - parseTimeToMinutes(b.start);
      byContainer.set(container.id, { ...prev, plannedMins: prev.plannedMins + mins });
    }
    if (isRecordedBlock(b, todayStr)) {
      byContainer.set(container.id, { ...prev, recordedMins: prev.recordedMins + recordedMins(b) });
    }
  }
  if (events) {
    const eventsInRange = events.filter((e) => dateSet.has(e.date));
    for (const e of eventsInRange) {
      const container = containers.find((c) => c.id === e.calendarContainerId);
      if (!container) continue;
      const prev = byContainer.get(container.id) ?? { container, plannedMins: 0, recordedMins: 0 };
      const mins = eventMins(e);
      prev.plannedMins += mins;
      if (e.attendanceStatus === 'attended') {
        prev.recordedMins += mins;
      }
      byContainer.set(container.id, prev);
    }
  }
  return Array.from(byContainer.values())
    .map(({ container, plannedMins, recordedMins }) => ({
      id: container.id,
      name: container.name,
      color: container.color,
      plannedHours: plannedMins / 60,
      recordedHours: recordedMins / 60,
      deltaHours: (recordedMins - plannedMins) / 60,
    }))
    .sort((a, b) => b.recordedHours - a.recordedHours);
}

/** Plan vs Actual by tag across a set of dates. Blocks contribute to each of their tagIds. */
export function selectPlanVsActualByTag(
  timeBlocks: TimeBlock[],
  dates: string[],
  tags: Tag[],
  todayStr?: string
): SummaryRow[] {
  const dateSet = new Set(dates);
  const inRange = timeBlocks.filter((b) => dateSet.has(b.date));
  const byTag = new Map<
    string,
    { tag: Tag; plannedMins: number; recordedMins: number }
  >();
  for (const b of inRange) {
    for (const tagId of b.tagIds) {
      const tag = tags.find((t) => t.id === tagId);
      if (!tag) continue;
      const prev = byTag.get(tag.id) ?? { tag, plannedMins: 0, recordedMins: 0 };
      if (isPlannedIntent(b)) {
        const mins = parseTimeToMinutes(b.end) - parseTimeToMinutes(b.start);
        byTag.set(tag.id, { ...prev, plannedMins: prev.plannedMins + mins });
      }
      if (isRecordedBlock(b, todayStr)) {
        byTag.set(tag.id, { ...prev, recordedMins: prev.recordedMins + recordedMins(b) });
      }
    }
  }
  return Array.from(byTag.values())
    .map(({ tag, plannedMins, recordedMins }) => ({
      id: tag.id,
      name: tag.name,
      color: '#6b7280',
      plannedHours: plannedMins / 60,
      recordedHours: recordedMins / 60,
      deltaHours: (recordedMins - plannedMins) / 60,
    }))
    .sort((a, b) => b.recordedHours - a.recordedHours);
}

/** Display shape for backlog (TaskCard expects estimatedHours, recordedHours, category, tags, calendar, dueDate, link, description). */
export interface DisplayTask {
  id: string;
  title: string;
  estimatedHours: number;
  recordedHours: number;
  /** Total number of time blocks (planned + recorded) linked to this task. */
  blockCount: number;
  /** Priority 1–5 (higher = more important). Optional. */
  priority?: number;
  category: Category;
  tags: Tag[];
  calendar: 'personal' | 'work' | 'school';
  dueDate?: string | null;
  link?: string | null;
  description?: string | null;
  /** Stored task status, mirrors Task.status from the store. */
  status?: Task['status'];
  /** Earliest planned block date (YYYY-MM-DD) for "scheduled for" display. */
  nextBlockDate?: string | null;
  /** Earliest planned block start time (HH:mm). */
  nextBlockStart?: string | null;
  /** Earliest planned block end time (HH:mm). */
  nextBlockEnd?: string | null;
}

const containerIdToCalendar = (id: string): 'personal' | 'work' | 'school' =>
  id === 'work' || id === 'school' ? id : 'personal';

export function selectDisplayTasksForBacklog(
  tasks: Task[],
  timeBlocks: TimeBlock[],
  categories: Category[],
  tags: Tag[],
  containers: CalendarContainer[]
): DisplayTask[] {
  return tasks.map((task) => {
    const category = categories.find((c) => c.id === task.categoryId) ?? categories[0];
    const taskTags = tags.filter((t) => task.tagIds.includes(t.id));
    const container = containers.find((c) => c.id === task.calendarContainerId);
    const calendar = container
      ? containerIdToCalendar(container.id)
      : 'personal';
    const blocksForTask = timeBlocks.filter((b) => b.taskId === task.id);
    const blockCount = blocksForTask.length;
    const priority = typeof task.priority === 'number' && task.priority >= 1 && task.priority <= 5
      ? task.priority
      : undefined;
    const plannedMins = getPlannedMinutes(task, timeBlocks);
    const recordedMins = getRecordedMinutes(task, timeBlocks);
    // Find earliest planned block for "scheduled for" display
    const plannedBlocks = blocksForTask
      .filter((b) => b.mode === 'planned')
      .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
    const earliest = plannedBlocks[0] ?? null;
    return {
      id: task.id,
      title: task.title,
      estimatedHours: task.estimatedMinutes / 60,
      recordedHours: recordedMins / 60,
      blockCount,
      priority,
      category,
      tags: taskTags,
      calendar,
      dueDate: task.dueDate ?? null,
      link: task.link ?? null,
      description: task.description ?? null,
      status: task.status,
      nextBlockDate: earliest?.date ?? null,
      nextBlockStart: earliest?.start ?? null,
      nextBlockEnd: earliest?.end ?? null,
    };
  });
}

export {
  getPlannedMinutes,
  getRecordedMinutes,
  getTaskProgress,
  getTaskStatus,
} from '../utils/taskHelpers';
