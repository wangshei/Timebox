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
} from '../types';
import { getLocalDateString } from '../utils/dateTime';
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

/** Date string YYYY-MM-DD to set of dates for week containing that date (Sun–Sat). */
function getWeekDateSet(dateStr: string): Set<string> {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const day = date.getDay();
  const start = new Date(date);
  start.setDate(date.getDate() - day);
  const set = new Set<string>();
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    set.add(getLocalDateString(d));
  }
  return set;
}

/** Date string YYYY-MM-DD to set of dates in that month. */
function getMonthDateSet(dateStr: string): Set<string> {
  const [y, m] = dateStr.split('-').map(Number);
  const set = new Set<string>();
  const lastDay = new Date(y, m, 0).getDate();
  for (let d = 1; d <= lastDay; d++) {
    set.add(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  return set;
}

/** Blocks visible for the current view range (day, 3day, week, or month). */
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
  if (view === '3day') {
    // Build the exact 3 dates shown (anchor + 2 days). getMonthDateSet would miss
    // dates that cross into the next month (e.g. anchor = Feb 27, third day = March 1).
    const [y, m, d] = selectedDate.split('-').map(Number);
    const anchor = new Date(y, (m ?? 1) - 1, d ?? 1);
    const set = new Set<string>();
    for (let i = 0; i < 3; i++) {
      const day = new Date(anchor);
      day.setDate(anchor.getDate() + i);
      set.add(getLocalDateString(day));
    }
    return timeBlocks.filter((b) => set.has(b.date) && visible(b));
  }
  const dateSet = view === 'week' ? getWeekDateSet(selectedDate) : getMonthDateSet(selectedDate);
  return timeBlocks.filter((b) => dateSet.has(b.date) && visible(b));
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
export function selectPlanVsActualByCategory(
  timeBlocks: TimeBlock[],
  dates: string[],
  categories: Category[],
  todayStr?: string
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
  todayStr?: string
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
    };
  });
}

export {
  getPlannedMinutes,
  getRecordedMinutes,
  getTaskProgress,
  getTaskStatus,
} from '../utils/taskHelpers';
