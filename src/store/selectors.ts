/**
 * Derived state (selectors) for Timebox.
 * Pure functions from store state; used by UI for backlog and analytics.
 */

import type {
  Task,
  TimeBlock,
  CalendarContainer,
  Category,
  Tag,
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

/** Plan vs Actual: combined by category for a date. */
export function selectPlanVsActualByCategory(
  timeBlocks: TimeBlock[],
  date: string,
  categories: Category[]
): SummaryRow[] {
  const planned = timeBlocks.filter(
    (b) => b.date === date && b.mode === 'planned'
  );
  const recorded = timeBlocks.filter(
    (b) => b.date === date && b.mode === 'recorded'
  );
  const byCategory = new Map<
    string,
    { category: Category; plannedMins: number; recordedMins: number }
  >();
  for (const block of planned) {
    const cat = categories.find((c) => c.id === block.categoryId);
    if (!cat) continue;
    const mins =
      parseTimeToMinutes(block.end) - parseTimeToMinutes(block.start);
    const prev = byCategory.get(cat.id) ?? {
      category: cat,
      plannedMins: 0,
      recordedMins: 0,
    };
    byCategory.set(cat.id, { ...prev, plannedMins: prev.plannedMins + mins });
  }
  for (const block of recorded) {
    const cat = categories.find((c) => c.id === block.categoryId);
    if (!cat) continue;
    const mins =
      parseTimeToMinutes(block.end) - parseTimeToMinutes(block.start);
    const prev = byCategory.get(cat.id) ?? {
      category: cat,
      plannedMins: 0,
      recordedMins: 0,
    };
    byCategory.set(cat.id, {
      ...prev,
      recordedMins: prev.recordedMins + mins,
    });
  }
  return Array.from(byCategory.values()).map(
    ({ category, plannedMins, recordedMins }) => ({
      id: category.id,
      name: category.name,
      color: category.color,
      plannedHours: plannedMins / 60,
      recordedHours: recordedMins / 60,
      deltaHours: (recordedMins - plannedMins) / 60,
    })
  );
}

export function selectPlanVsActualByContainer(
  timeBlocks: TimeBlock[],
  date: string,
  containers: CalendarContainer[]
): SummaryRow[] {
  const byContainer = new Map<
    string,
    { container: CalendarContainer; plannedMins: number; recordedMins: number }
  >();
  for (const block of timeBlocks.filter((b) => b.date === date)) {
    const container = containers.find((c) => c.id === block.calendarContainerId);
    if (!container) continue;
    const mins =
      parseTimeToMinutes(block.end) - parseTimeToMinutes(block.start);
    const prev = byContainer.get(container.id) ?? {
      container,
      plannedMins: 0,
      recordedMins: 0,
    };
    if (block.mode === 'planned')
      byContainer.set(container.id, {
        ...prev,
        plannedMins: prev.plannedMins + mins,
      });
    else
      byContainer.set(container.id, {
        ...prev,
        recordedMins: prev.recordedMins + mins,
      });
  }
  return Array.from(byContainer.values()).map(
    ({ container, plannedMins, recordedMins }) => ({
      id: container.id,
      name: container.name,
      color: container.color,
      plannedHours: plannedMins / 60,
      recordedHours: recordedMins / 60,
      deltaHours: (recordedMins - plannedMins) / 60,
    })
  );
}

/** Display shape for backlog (TaskCard expects estimatedHours, recordedHours, category, tags, calendar). */
export interface DisplayTask {
  id: string;
  title: string;
  estimatedHours: number;
  recordedHours: number;
  category: Category;
  tags: Tag[];
  calendar: 'personal' | 'work' | 'school';
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
    const plannedMins = getPlannedMinutes(task, timeBlocks);
    const recordedMins = getRecordedMinutes(task, timeBlocks);
    return {
      id: task.id,
      title: task.title,
      estimatedHours: task.estimatedMinutes / 60,
      recordedHours: recordedMins / 60,
      category,
      tags: taskTags,
      calendar,
    };
  });
}

export {
  getPlannedMinutes,
  getRecordedMinutes,
  getTaskProgress,
  getTaskStatus,
} from '../utils/taskHelpers';
