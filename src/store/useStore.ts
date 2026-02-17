/**
 * Single source of truth for Timebox app state.
 * See docs/SYSTEM_INTEGRATION.md and docs/ENGINEERING_LEAD.md.
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type {
  Task,
  TimeBlock,
  CalendarContainer,
  Category,
  Tag,
  Event,
  Mode,
  View,
  CalendarContainerVisibility,
} from '../types';
import {
  getPlannedMinutes,
  getRecordedMinutes,
  getUnscheduledTasks,
  getPartiallyCompletedTasks,
  getFixedTasks,
  parseTimeToMinutes,
} from '../utils/taskHelpers';
import { convertOldTimeBlockToNew, convertOldTaskToNew } from '../utils/migrateData';
import { getLocalDateString } from '../utils/dateTime';
import {
  calendarContainers as seedContainers,
  categories as seedCategories,
  tags as seedTags,
  initialTimeBlocks as seedTimeBlocks,
  initialTasks as seedTasks,
} from '../data/seed';

// --- State shape ---

export interface AppState {
  // Domain
  tasks: Task[];
  timeBlocks: TimeBlock[];
  calendarContainers: CalendarContainer[];
  categories: Category[];
  tags: Tag[];
  events: Event[];
  // UI
  viewMode: Mode;
  view: View;
  selectedDate: string; // YYYY-MM-DD
  containerVisibility: CalendarContainerVisibility;
  defaultBlockMinutes: number;
}

// --- Initial state from seed ---

function getInitialState(): AppState {
  const containers = [...seedContainers];
  const categories: Category[] = [...seedCategories];
  const tags: Tag[] = [...seedTags];
  const timeBlocks = seedTimeBlocks.map((b) => convertOldTimeBlockToNew(b, containers));
  const tasks = seedTasks.map((t) => convertOldTaskToNew(t, containers));
  const visibility: CalendarContainerVisibility = {};
  containers.forEach((c) => (visibility[c.id] = true));

  return {
    tasks,
    timeBlocks,
    calendarContainers: containers,
    categories,
    tags,
    events: [],
    viewMode: 'planning',
    view: 'day',
    selectedDate: getLocalDateString(),
    containerVisibility: visibility,
    defaultBlockMinutes: 60,
  };
}

// --- Actions ---

export interface AppActions {
  setViewMode: (mode: Mode) => void;
  setView: (view: View) => void;
  setSelectedDate: (date: string) => void;
  toggleContainerVisibility: (containerId: string) => void;
  setAllCalendarsVisible: () => void;

  addTask: (task: Omit<Task, 'id'>) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  deleteTask: (id: string) => void;

  addTimeBlock: (block: Omit<TimeBlock, 'id'>) => string;
  updateTimeBlock: (id: string, updates: Partial<TimeBlock>) => void;
  deleteTimeBlock: (id: string) => void;

  createPlannedBlocksFromTask: (
    taskId: string,
    params: { date: string; startTime: string; blockMinutes?: number; splitTask?: boolean }
  ) => void;
  markDoneAsPlanned: (plannedBlockId: string) => void;
  markDidSomethingElse: (plannedBlockId: string, recorded: Omit<TimeBlock, 'id' | 'mode' | 'source'>) => void;
  endDay: (date: string) => void;

  addCalendarContainer: (c: Omit<CalendarContainer, 'id'>) => void;
  updateCalendarContainer: (id: string, updates: Partial<CalendarContainer>) => void;
  deleteCalendarContainer: (id: string) => void;
  addCategory: (c: Omit<Category, 'id'>) => Category;
  updateCategory: (id: string, updates: Partial<Category>) => void;
  deleteCategory: (id: string) => void;
  addTag: (t: Omit<Tag, 'id'>) => Tag;
  updateTag: (id: string, updates: Partial<Tag>) => void;
  deleteTag: (id: string) => void;

  addEvent: (e: Omit<Event, 'id'>) => string;
  updateEvent: (id: string, updates: Partial<Event>) => void;
  deleteEvent: (id: string) => void;
  /** Atomically delete a time block and create an event in a single state update. */
  convertTimeBlockToEvent: (blockId: string, event: Omit<Event, 'id'>) => string;

  /** Replace organization data (for Revert in settings). */
  setCalendarContainers: (containers: CalendarContainer[]) => void;
  setCategories: (categories: Category[]) => void;
  setTags: (tags: Tag[]) => void;

  resetToSeed: () => void;
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return String(Date.now()) + '-' + Math.random().toString(36).slice(2, 9);
}

// --- Store ---

export const useStore = create<AppState & AppActions>()(
  subscribeWithSelector((set, get) => ({
  ...getInitialState(),

  setViewMode: (mode) => set({ viewMode: mode }),
  setView: (view) => set({ view }),
  setSelectedDate: (date) => set({ selectedDate: date }),
  toggleContainerVisibility: (containerId) =>
    set((s) => ({
      containerVisibility: {
        ...s.containerVisibility,
        [containerId]: !s.containerVisibility[containerId],
      },
    })),
  setAllCalendarsVisible: () =>
    set((s) => ({
      containerVisibility: Object.fromEntries(
        s.calendarContainers.map((c) => [c.id, true])
      ),
    })),

  addTask: (task) =>
    set((s) => ({
      tasks: [...s.tasks, { ...task, id: generateId() }],
    })),
  updateTask: (id, updates) =>
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),
  deleteTask: (id) =>
    set((s) => ({
      tasks: s.tasks.filter((t) => t.id !== id),
      timeBlocks: s.timeBlocks.filter((b) => b.taskId !== id),
    })),

  addTimeBlock: (block) => {
    const id = generateId();
    set((s) => ({
      timeBlocks: [...s.timeBlocks, { ...block, id }],
    }));
    return id;
  },
  updateTimeBlock: (id, updates) =>
    set((s) => ({
      timeBlocks: s.timeBlocks.map((b) => (b.id === id ? { ...b, ...updates } : b)),
    })),
  deleteTimeBlock: (id) =>
    set((s) => ({
      timeBlocks: s.timeBlocks.filter((b) => b.id !== id),
    })),

  createPlannedBlocksFromTask: (taskId, { date, startTime, blockMinutes, splitTask }) => {
    const state = get();
    const task = state.tasks.find((t) => t.id === taskId);
    if (!task) return;
    const blockMins = blockMinutes ?? state.defaultBlockMinutes;
    const planned = getPlannedMinutes(task, state.timeBlocks);
    const recorded = getRecordedMinutes(task, state.timeBlocks);
    const remaining = task.estimatedMinutes - planned - recorded;
    if (remaining <= 0) return;

    const startMins = parseTimeToMinutes(startTime);
    const blocks: TimeBlock[] = [];

    if (splitTask) {
      // Drop: create exactly one block; reduce task so remainder stays in todo
      const scheduledMins = Math.min(remaining, blockMins);
      const endMins = startMins + scheduledMins;
      const startStr = `${Math.floor(startMins / 60)}:${String(startMins % 60).padStart(2, '0')}`;
      const endStr = `${Math.floor(endMins / 60)}:${String(endMins % 60).padStart(2, '0')}`;
      blocks.push({
        id: generateId(),
        taskId,
        title: task.title,
        calendarContainerId: task.calendarContainerId,
        categoryId: task.categoryId,
        tagIds: task.tagIds,
        start: startStr,
        end: endStr,
        date,
        mode: 'planned',
        source: 'manual',
      });
      set((s) => ({
        timeBlocks: [...s.timeBlocks, ...blocks],
        tasks: s.tasks.map((t) =>
          t.id === taskId
            ? { ...t, estimatedMinutes: Math.max(0, t.estimatedMinutes - scheduledMins) }
            : t
        ),
      }));
      return;
    }

    let remainingToSchedule = Math.min(remaining, Math.floor(remaining / blockMins) * blockMins || blockMins);
    let currentStart = startMins;

    while (remainingToSchedule >= blockMins) {
      const endMins = currentStart + blockMins;
      const startStr = `${Math.floor(currentStart / 60)}:${String(currentStart % 60).padStart(2, '0')}`;
      const endStr = `${Math.floor(endMins / 60)}:${String(endMins % 60).padStart(2, '0')}`;
      blocks.push({
        id: generateId(),
        taskId,
        title: task.title,
        calendarContainerId: task.calendarContainerId,
        categoryId: task.categoryId,
        tagIds: task.tagIds,
        start: startStr,
        end: endStr,
        date,
        mode: 'planned',
        source: 'manual',
      });
      currentStart = endMins;
      remainingToSchedule -= blockMins;
    }

    set((s) => ({
      timeBlocks: [...s.timeBlocks, ...blocks],
    }));
  },

  markDoneAsPlanned: (plannedBlockId) => {
    const state = get();
    const block = state.timeBlocks.find((b) => b.id === plannedBlockId && b.mode === 'planned');
    if (!block) return;
    const recorded: TimeBlock = {
      ...block,
      id: generateId(),
      mode: 'recorded',
      source: 'manual',
    };
    set((s) => ({ timeBlocks: [...s.timeBlocks, recorded] }));
  },

  markDidSomethingElse: (plannedBlockId, recorded) => {
    set((s) => ({
      timeBlocks: [
        ...s.timeBlocks,
        {
          ...recorded,
          id: generateId(),
          mode: 'recorded' as const,
          source: 'manual' as const,
        },
      ],
    }));
  },

  endDay: (date) => {
    const state = get();
    const plannedOnDate = state.timeBlocks.filter(
      (b) => b.date === date && b.mode === 'planned'
    );
    const recordedOnDate = state.timeBlocks.filter(
      (b) => b.date === date && b.mode === 'recorded'
    );
    const newBlocks: TimeBlock[] = [];
    for (const planned of plannedOnDate) {
      const hasRecorded = recordedOnDate.some(
        (r) =>
          r.start === planned.start &&
          r.end === planned.end &&
          r.calendarContainerId === planned.calendarContainerId
      );
      if (!hasRecorded) {
        newBlocks.push({
          ...planned,
          id: generateId(),
          mode: 'recorded',
          source: 'autoAssumed',
        });
      }
    }
    set((s) => ({ timeBlocks: [...s.timeBlocks, ...newBlocks] }));
  },

  addCalendarContainer: (c) => {
    const id = generateId();
    set((s) => ({
      calendarContainers: [...s.calendarContainers, { ...c, id }],
      containerVisibility: { ...s.containerVisibility, [id]: true },
    }));
  },
  updateCalendarContainer: (id, updates) =>
    set((s) => ({
      calendarContainers: s.calendarContainers.map((c) =>
        c.id === id ? { ...c, ...updates } : c
      ),
    })),
  deleteCalendarContainer: (id) =>
    set((s) => {
      const nextVisibility = { ...s.containerVisibility };
      delete nextVisibility[id];
      return {
        calendarContainers: s.calendarContainers.filter((c) => c.id !== id),
        containerVisibility: nextVisibility,
      };
    }),
  addCategory: (c) => {
    const id = generateId();
    const newCategory: Category = { ...c, id };
    set((s) => ({ categories: [...s.categories, newCategory] }));
    return newCategory;
  },
  updateCategory: (id, updates) =>
    set((s) => ({
      categories: s.categories.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    })),
  deleteCategory: (id) =>
    set((s) => ({
      categories: s.categories.filter((c) => c.id !== id),
    })),
  addTag: (t) => {
    const id = generateId();
    const newTag: Tag = { ...t, id };
    set((s) => ({ tags: [...s.tags, newTag] }));
    return newTag;
  },
  updateTag: (id, updates) =>
    set((s) => ({
      tags: s.tags.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),
  deleteTag: (id) =>
    set((s) => ({
      tags: s.tags.filter((t) => t.id !== id),
    })),

  addEvent: (e) => {
    const id = generateId();
    set((s) => ({ events: [...s.events, { ...e, id }] }));
    return id;
  },
  updateEvent: (id, updates) =>
    set((s) => ({
      events: s.events.map((e) => (e.id === id ? { ...e, ...updates } : e)),
    })),
  deleteEvent: (id) =>
    set((s) => ({
      events: s.events.filter((e) => e.id !== id),
    })),

  convertTimeBlockToEvent: (blockId, event) => {
    const eventId = generateId();
    set((s) => ({
      timeBlocks: s.timeBlocks.filter((b) => b.id !== blockId),
      events: [...s.events, { ...event, id: eventId }],
    }));
    return eventId;
  },

  setCalendarContainers: (containers) => set({ calendarContainers: containers }),
  setCategories: (categories) => set({ categories }),
  setTags: (tags) => set({ tags }),

  resetToSeed: () => set(getInitialState()),
}))
);

// --- Local persistence (Phase 2: adapter-ready localStorage layer) ---

/** Bump version to reset cached state so users see new default (e.g. single Personal calendar). */
const STORAGE_KEY = 'timebox-state-v2';

type PersistedSlice = Pick<
  AppState,
  | 'tasks'
  | 'timeBlocks'
  | 'calendarContainers'
  | 'categories'
  | 'tags'
  | 'events'
  | 'viewMode'
  | 'view'
  | 'selectedDate'
  | 'containerVisibility'
  | 'defaultBlockMinutes'
>;

/** Hydrate store from localStorage on app startup (no-op on server). */
export function hydrateFromLocalStorage() {
  if (typeof window === 'undefined') return;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedSlice>;
    useStore.setState((prev) => ({
      ...prev,
      ...parsed,
    }));
  } catch {
    // Ignore corrupted cache; keep seed state.
  }
}

/** Subscribe to store changes and persist a minimal slice into localStorage. */
export function startLocalStoragePersistence() {
  if (typeof window === 'undefined') return () => {};
  const unsubscribe = useStore.subscribe<PersistedSlice>(
    (state) => ({
      tasks: state.tasks,
      timeBlocks: state.timeBlocks,
      calendarContainers: state.calendarContainers,
      categories: state.categories,
      tags: state.tags,
      events: state.events,
      viewMode: state.viewMode,
      view: state.view,
      selectedDate: state.selectedDate,
      containerVisibility: state.containerVisibility,
      defaultBlockMinutes: state.defaultBlockMinutes,
    }),
    (slice) => {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(slice));
      } catch {
        // Quota or privacy mode; fail silently.
      }
    }
  );
  return unsubscribe;
}
