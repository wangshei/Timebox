/**
 * Single source of truth for The Timeboxing Club app state.
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
  Sticker,
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
import {
  DEFAULT_TEMPLATE,
  GENERAL_CATEGORY_COLOR,
  BLANK_PERSONAL_COLOR,
} from '../data/templates';

// --- State shape ---

export interface AppState {
  // Domain
  tasks: Task[];
  timeBlocks: TimeBlock[];
  calendarContainers: CalendarContainer[];
  categories: Category[];
  tags: Tag[];
  events: Event[];
  stickers: Sticker[];
  // UI
  viewMode: Mode;
  view: View;
  selectedDate: string; // YYYY-MM-DD
  containerVisibility: CalendarContainerVisibility;
  defaultBlockMinutes: number;
  /** When true, week view shows Mon–Sun; when false, Sun–Sat. */
  weekStartsOnMonday: boolean;
  /** User's wake time — earliest scheduling boundary. "HH:mm", default "08:00". */
  wakeTime: string;
  /** User's sleep time — latest scheduling boundary. "HH:mm", default "23:00". */
  sleepTime: string;
  /** Push notification scope: events only, events+tasks, or off. */
  notificationScope: 'events' | 'events_and_tasks' | 'off';
  /** Minutes before event to send push notification. 0 = at event time. */
  notificationLeadMinutes: number;
  /** Whether to send email notifications to attendees on event changes. */
  emailNotificationsEnabled: boolean;
  // Onboarding
  hasCompletedSetup: boolean;
  userName: string;
  onboardingTourComplete: boolean;
  // Timer
  activeTimer: { blockId: string; startedAt: number } | null;
  // Persistence status
  saveError: boolean;
  sessionExpired: boolean;
}

// --- Entity limits (prevent unbounded data creation) ---
export const ENTITY_LIMITS = {
  tasks: 500,
  timeBlocks: 2000,
  events: 2000,
  calendarContainers: 20,
  categories: 100,
  tags: 200,
  stickers: 500,
} as const;

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
    stickers: [],
    viewMode: 'overall',
    view: '3day',
    selectedDate: getLocalDateString(),
    containerVisibility: visibility,
    defaultBlockMinutes: 60,
    weekStartsOnMonday: false,
    wakeTime: '08:00',
    sleepTime: '23:00',
    notificationScope: 'events',
    notificationLeadMinutes: 5,
    emailNotificationsEnabled: true,
    hasCompletedSetup: false,
    userName: '',
    onboardingTourComplete: false,
    activeTimer: null,
    saveError: false,
    sessionExpired: false,
  };
}

// --- Actions ---

export interface AppActions {
  setViewMode: (mode: Mode) => void;
  setView: (view: View) => void;
  setSelectedDate: (date: string) => void;
  toggleContainerVisibility: (containerId: string) => void;
  setAllCalendarsVisible: () => void;

  addTask: (task: Omit<Task, 'id'>) => string | undefined;
  updateTask: (id: string, updates: Partial<Task>) => void;
  deleteTask: (id: string) => void;

  addTimeBlock: (block: Omit<TimeBlock, 'id'>) => string;
  updateTimeBlock: (id: string, updates: Partial<TimeBlock>) => void;
  deleteTimeBlock: (id: string) => void;

  createPlannedBlocksFromTask: (
    taskId: string,
    params: { date: string; startTime: string; blockMinutes?: number; splitTask?: boolean; singleBlock?: boolean }
  ) => void;
  /** Confirm a past planned block as done. Optionally override the actual start/end times. */
  confirmBlock: (id: string, recordedStart?: string, recordedEnd?: string) => void;
  /** Mark a past planned block as skipped / not done. */
  skipBlock: (id: string) => void;
  /** Add a retroactive block for time spent that was never planned. Always confirmed. */
  addUnplannedBlock: (block: Omit<TimeBlock, 'id' | 'source' | 'confirmationStatus'>) => string;
  /** Confirm all unreviewed (pending) planned blocks on a given date as done as planned. */
  batchConfirmDay: (date: string) => void;
  /** @deprecated Use confirmBlock instead. Kept for backward compat with existing UI. */
  markDoneAsPlanned: (plannedBlockId: string) => void;
  /** @deprecated Use addUnplannedBlock + skipBlock instead. */
  markDidSomethingElse: (plannedBlockId: string, recorded: Omit<TimeBlock, 'id' | 'mode' | 'source'>) => void;
  endDay: (date: string) => void;

  // Onboarding
  setWeekStartsOnMonday: (val: boolean) => void;
  setWakeTime: (time: string) => void;
  setSleepTime: (time: string) => void;
  setNotificationScope: (scope: 'events' | 'events_and_tasks' | 'off') => void;
  setNotificationLeadMinutes: (minutes: number) => void;
  setEmailNotificationsEnabled: (val: boolean) => void;
  setHasCompletedSetup: (val: boolean) => void;
  setUserName: (name: string) => void;
  setOnboardingTourComplete: (val: boolean) => void;
  /** New user: clears seed data and applies the default template fresh. */
  applyTemplate: () => void;
  /** Existing user (migration): adds template calendars/categories that don't already exist. */
  mergeTemplate: () => void;
  /** New user: clears seed data and sets up a bare Personal calendar. */
  applyBlankSetup: () => void;

  addCalendarContainer: (c: Omit<CalendarContainer, 'id'>, opts?: { skipAutoGeneral?: boolean }) => string;
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

  /** Add multiple events in a single state update. Returns array of new IDs. */
  addEvents: (events: Omit<Event, 'id'>[]) => string[];
  /** Update multiple events in a single state update. */
  updateEvents: (updates: Array<{ id: string; changes: Partial<Event> }>) => void;
  /** Delete multiple events in a single state update. */
  deleteEvents: (ids: string[]) => void;

  /** Replace organization data (for Revert in settings). */
  setCalendarContainers: (containers: CalendarContainer[]) => void;
  setCategories: (categories: Category[]) => void;
  setTags: (tags: Tag[]) => void;

  addSticker: (s: Omit<Sticker, 'id'>) => string;
  updateSticker: (id: string, updates: Partial<Sticker>) => void;
  deleteSticker: (id: string) => void;

  resetToSeed: () => void;

  startTimer: (blockId: string) => void;
  stopTimer: () => void;

  setSaveError: (val: boolean) => void;
  setSessionExpired: (val: boolean) => void;
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

  addTask: (task) => {
    const s = get();
    if (s.tasks.length >= ENTITY_LIMITS.tasks) {
      console.warn(`[useStore] Task limit (${ENTITY_LIMITS.tasks}) reached`);
      return undefined;
    }
    const id = generateId();
    set((s) => ({
      tasks: [...s.tasks, { ...task, id }],
    }));
    return id;
  },
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
    const s = get();
    if (s.timeBlocks.length >= ENTITY_LIMITS.timeBlocks) {
      console.warn(`[useStore] Time block limit (${ENTITY_LIMITS.timeBlocks}) reached`);
      return '';
    }
    const id = generateId();
    set((s) => ({
      timeBlocks: [...s.timeBlocks, { ...block, id, editedAt: Date.now() }],
    }));
    return id;
  },
  updateTimeBlock: (id, updates) =>
    set((s) => {
      const result: Partial<AppState> = {
        timeBlocks: s.timeBlocks.map((b) => (b.id === id ? { ...b, ...updates, editedAt: Date.now() } : b)),
      };
      // When a block moves to a different date, sync its stickers' dates
      if (updates.date) {
        const oldBlock = s.timeBlocks.find((b) => b.id === id);
        if (oldBlock && oldBlock.date !== updates.date) {
          result.stickers = s.stickers.map((st) =>
            st.blockId === id ? { ...st, date: updates.date! } : st
          );
        }
      }
      return result;
    }),
  deleteTimeBlock: (id) =>
    set((s) => ({
      timeBlocks: s.timeBlocks.filter((b) => b.id !== id),
      stickers: s.stickers.filter((st) => st.blockId !== id),
    })),

  createPlannedBlocksFromTask: (taskId, { date, startTime, blockMinutes, splitTask, singleBlock }) => {
    const state = get();
    const task = state.tasks.find((t) => t.id === taskId);
    if (!task) return;
    const blockMins = blockMinutes ?? state.defaultBlockMinutes;

    // For singleBlock (auto-schedule / reschedule-later), only count "active" planned time:
    // today/future blocks, or confirmed past blocks. Past unconfirmed/skipped blocks
    // don't count — they correspond to tasks that returned to the unscheduled list.
    const today = getLocalDateString();
    const activePlanned = (singleBlock)
      ? state.timeBlocks
          .filter(b => b.taskId === task.id && b.mode === 'planned' && (b.date >= today || b.confirmationStatus === 'confirmed'))
          .reduce((sum, b) => sum + (parseTimeToMinutes(b.end) - parseTimeToMinutes(b.start)), 0)
      : getPlannedMinutes(task, state.timeBlocks);
    const recorded = getRecordedMinutes(task, state.timeBlocks);

    // If task has no estimate (0), allow scheduling with blockMins; otherwise check remaining
    const hasEstimate = task.estimatedMinutes > 0;
    const remaining = hasEstimate ? task.estimatedMinutes - activePlanned - recorded : blockMins;
    if (remaining <= 0) return;

    const startMins = parseTimeToMinutes(startTime);
    const blocks: TimeBlock[] = [];
    const editedAt = Date.now();

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
        editedAt,
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

    if (singleBlock) {
      // Schedule modal: create exactly one block of chosen length (or remaining), no loop, no task reduction
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
        editedAt,
      });
      set((s) => ({ timeBlocks: [...s.timeBlocks, ...blocks] }));
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
        editedAt,
      });
      currentStart = endMins;
      remainingToSchedule -= blockMins;
    }

    set((s) => ({
      timeBlocks: [...s.timeBlocks, ...blocks],
    }));
  },

  confirmBlock: (id, recordedStart, recordedEnd) => {
    set((s) => ({
      timeBlocks: s.timeBlocks.map((b) =>
        b.id === id
          ? {
              ...b,
              confirmationStatus: 'confirmed' as const,
              recordedStart: recordedStart ?? b.recordedStart ?? null,
              recordedEnd: recordedEnd ?? b.recordedEnd ?? null,
              editedAt: Date.now(),
            }
          : b
      ),
    }));
  },

  skipBlock: (id) => {
    set((s) => ({
      timeBlocks: s.timeBlocks.map((b) =>
        b.id === id ? { ...b, confirmationStatus: 'skipped' as const, editedAt: Date.now() } : b
      ),
    }));
  },

  addUnplannedBlock: (block) => {
    const id = generateId();
    set((s) => ({
      timeBlocks: [
        ...s.timeBlocks,
        {
          ...block,
          id,
          source: 'unplanned' as const,
          confirmationStatus: 'confirmed' as const,
          editedAt: Date.now(),
        },
      ],
    }));
    return id;
  },

  batchConfirmDay: (date) => {
    set((s) => ({
      timeBlocks: s.timeBlocks.map((b) => {
        if (b.date !== date || b.mode !== 'planned' || b.source === 'unplanned') return b;
        if (b.confirmationStatus === 'confirmed' || b.confirmationStatus === 'skipped') return b;
        return { ...b, confirmationStatus: 'confirmed' as const };
      }),
    }));
  },

  // --- Backward-compat wrappers ---

  markDoneAsPlanned: (plannedBlockId) => {
    get().confirmBlock(plannedBlockId);
  },

  markDidSomethingElse: (plannedBlockId, recorded) => {
    get().skipBlock(plannedBlockId);
    get().addUnplannedBlock({ ...recorded, mode: 'planned' });
  },

  endDay: (date) => {
    get().batchConfirmDay(date);
  },

  setWeekStartsOnMonday: (val) => set({ weekStartsOnMonday: val }),
  setWakeTime: (time) => set({ wakeTime: time }),
  setSleepTime: (time) => set({ sleepTime: time }),
  setNotificationScope: (scope) => set({ notificationScope: scope }),
  setNotificationLeadMinutes: (minutes) => set({ notificationLeadMinutes: minutes }),
  setEmailNotificationsEnabled: (val) => set({ emailNotificationsEnabled: val }),
  setHasCompletedSetup: (val) => set({ hasCompletedSetup: val }),
  setUserName: (name) => set({ userName: name }),
  setOnboardingTourComplete: (val) => set({ onboardingTourComplete: val }),

  applyTemplate: () => {
    const tmpl = DEFAULT_TEMPLATE;
    const containerMap: Record<string, string> = {};
    const containers: CalendarContainer[] = tmpl.calendars.map((cal) => {
      const id = generateId();
      containerMap[cal.templateId] = id;
      return { id, name: cal.name, color: cal.color };
    });
    const categories: Category[] = tmpl.categories.map((cat) => ({
      id: generateId(),
      name: cat.name,
      color: cat.color,
      calendarContainerId: containerMap[cat.calendarTemplateId] ?? null,
    }));
    const visibility: CalendarContainerVisibility = {};
    containers.forEach((c) => { visibility[c.id] = true; });
    set({ calendarContainers: containers, categories, tags: [], containerVisibility: visibility });
  },

  mergeTemplate: () => {
    const tmpl = DEFAULT_TEMPLATE;
    set((s) => {
      const containerMap: Record<string, string> = {};
      const newContainers: CalendarContainer[] = [];

      tmpl.calendars.forEach((cal) => {
        const existing = s.calendarContainers.find(
          (c) => c.name.toLowerCase() === cal.name.toLowerCase()
        );
        if (existing) {
          containerMap[cal.templateId] = existing.id;
        } else {
          const id = generateId();
          newContainers.push({ id, name: cal.name, color: cal.color });
          containerMap[cal.templateId] = id;
        }
      });

      const newCategories: Category[] = [];
      tmpl.categories.forEach((cat) => {
        const targetCalendarId = containerMap[cat.calendarTemplateId];
        const alreadyExists = s.categories.some(
          (c) =>
            c.name.toLowerCase() === cat.name.toLowerCase() &&
            c.calendarContainerId === targetCalendarId
        );
        if (!alreadyExists) {
          newCategories.push({
            id: generateId(),
            name: cat.name,
            color: cat.color,
            calendarContainerId: targetCalendarId ?? null,
          });
        }
      });

      const newVisibility = { ...s.containerVisibility };
      newContainers.forEach((c) => { newVisibility[c.id] = true; });

      return {
        calendarContainers: [...s.calendarContainers, ...newContainers],
        categories: [...s.categories, ...newCategories],
        containerVisibility: newVisibility,
      };
    });
  },

  applyBlankSetup: () => {
    const calId = generateId();
    const catId = generateId();
    set({
      calendarContainers: [{ id: calId, name: 'Personal', color: BLANK_PERSONAL_COLOR }],
      categories: [{
        id: catId,
        name: 'General',
        color: GENERAL_CATEGORY_COLOR,
        calendarContainerId: calId,
      }],
      tags: [],
      containerVisibility: { [calId]: true },
    });
  },

  addCalendarContainer: (c, opts) => {
    const current = get();
    if (current.calendarContainers.length >= ENTITY_LIMITS.calendarContainers) {
      console.warn(`[useStore] Calendar limit (${ENTITY_LIMITS.calendarContainers}) reached`);
      return '';
    }
    const id = generateId();
    const generalId = generateId();
    set((s) => {
      const newCats =
        opts?.skipAutoGeneral
          ? s.categories
          : [
              ...s.categories,
              {
                id: generalId,
                name: 'General',
                color: GENERAL_CATEGORY_COLOR,
                calendarContainerId: id,
              },
            ];
      return {
        calendarContainers: [...s.calendarContainers, { ...c, id }],
        containerVisibility: { ...s.containerVisibility, [id]: true },
        categories: newCats,
      };
    });
    return id;
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
      const removedCategoryIds = new Set(
        s.categories.filter((c) => c.calendarContainerId === id).map((c) => c.id),
      );
      return {
        calendarContainers: s.calendarContainers.filter((c) => c.id !== id),
        categories: s.categories.filter((c) => c.calendarContainerId !== id),
        tasks: s.tasks.filter((t) => t.calendarContainerId !== id && !removedCategoryIds.has(t.categoryId ?? '')),
        timeBlocks: s.timeBlocks.filter((b) => b.calendarContainerId !== id && !removedCategoryIds.has(b.categoryId ?? '')),
        events: s.events.filter((e) => e.calendarContainerId !== id && !removedCategoryIds.has(e.categoryId ?? '')),
        containerVisibility: nextVisibility,
      };
    }),
  addCategory: (c) => {
    const current = get();
    if (current.categories.length >= ENTITY_LIMITS.categories) {
      console.warn(`[useStore] Category limit (${ENTITY_LIMITS.categories}) reached`);
      return { ...c, id: '' } as Category;
    }
    const id = generateId();
    const newCategory: Category = { ...c, id };
    if (newCategory.calendarContainerId && (!newCategory.calendarContainerIds || newCategory.calendarContainerIds.length === 0)) {
      newCategory.calendarContainerIds = [newCategory.calendarContainerId];
    }
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
      tasks: s.tasks.filter((t) => t.categoryId !== id),
      timeBlocks: s.timeBlocks.filter((b) => b.categoryId !== id),
      events: s.events.filter((e) => e.categoryId !== id),
    })),
  addTag: (t) => {
    const current = get();
    if (current.tags.length >= ENTITY_LIMITS.tags) {
      console.warn(`[useStore] Tag limit (${ENTITY_LIMITS.tags}) reached`);
      return { ...t, id: '' } as Tag;
    }
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
    const s = get();
    if (s.events.length >= ENTITY_LIMITS.events) {
      console.warn(`[useStore] Event limit (${ENTITY_LIMITS.events}) reached`);
      return '';
    }
    const id = generateId();
    set((s) => ({ events: [...s.events, { ...e, id, editedAt: Date.now() }] }));
    return id;
  },
  updateEvent: (id, updates) =>
    set((s) => {
      const result: Partial<AppState> = {
        events: s.events.map((e) => (e.id === id ? { ...e, ...updates, editedAt: Date.now() } : e)),
      };
      // When an event moves to a different date, sync its stickers' dates
      if (updates.date) {
        const oldEvent = s.events.find((e) => e.id === id);
        if (oldEvent && oldEvent.date !== updates.date) {
          result.stickers = s.stickers.map((st) =>
            st.eventId === id ? { ...st, date: updates.date! } : st
          );
        }
      }
      return result;
    }),
  deleteEvent: (id) =>
    set((s) => ({
      events: s.events.filter((e) => e.id !== id),
      stickers: s.stickers.filter((st) => st.eventId !== id),
    })),

  convertTimeBlockToEvent: (blockId, event) => {
    const eventId = generateId();
    set((s) => ({
      timeBlocks: s.timeBlocks.filter((b) => b.id !== blockId),
      events: [...s.events, { ...event, id: eventId, editedAt: Date.now() }],
    }));
    return eventId;
  },

  addEvents: (events) => {
    const s = get();
    const headroom = ENTITY_LIMITS.events - s.events.length;
    if (headroom <= 0) {
      console.warn(`[useStore] Event limit (${ENTITY_LIMITS.events}) reached`);
      return [];
    }
    const capped = events.slice(0, headroom);
    const now = Date.now();
    const newEvents = capped.map((e) => ({ ...e, id: generateId(), editedAt: now }));
    set((s) => ({ events: [...s.events, ...newEvents] }));
    return newEvents.map((e) => e.id);
  },
  updateEvents: (updates) => {
    const now = Date.now();
    set((s) => ({
      events: s.events.map((e) => {
        const u = updates.find((u) => u.id === e.id);
        return u ? { ...e, ...u.changes, editedAt: now } : e;
      }),
    }));
  },
  deleteEvents: (ids) =>
    set((s) => ({
      events: s.events.filter((e) => !ids.includes(e.id)),
    })),

  setCalendarContainers: (containers) => set({ calendarContainers: containers }),
  setCategories: (categories) => set({ categories }),
  setTags: (tags) => set({ tags }),

  addSticker: (s) => {
    const current = get();
    if (current.stickers.length >= ENTITY_LIMITS.stickers) return '';
    const id = generateId();
    set((state) => ({ stickers: [...state.stickers, { ...s, id }] }));
    return id;
  },
  updateSticker: (id, updates) =>
    set((s) => ({ stickers: s.stickers.map((st) => (st.id === id ? { ...st, ...updates } : st)) })),
  deleteSticker: (id) =>
    set((s) => ({ stickers: s.stickers.filter((st) => st.id !== id) })),

  resetToSeed: () => set(getInitialState()),

  startTimer: (blockId) => set({ activeTimer: { blockId, startedAt: Date.now() } }),
  stopTimer: () => {
    const { activeTimer, timeBlocks } = get();
    if (!activeTimer) return;
    const block = timeBlocks.find((b) => b.id === activeTimer.blockId);
    if (block) {
      const now = new Date();
      const endMinutes = now.getHours() * 60 + now.getMinutes();
      const startMinutes = parseTimeToMinutes(block.start);
      // Clamp to at least 1 minute duration
      const clampedEnd = Math.max(endMinutes, startMinutes + 1);
      const endStr = `${Math.floor(clampedEnd / 60)}:${String(clampedEnd % 60).padStart(2, '0')}`;
      set((s) => ({
        activeTimer: null,
        timeBlocks: s.timeBlocks.map((b) =>
          b.id === activeTimer.blockId
            ? { ...b, end: endStr, confirmationStatus: 'confirmed' as const, editedAt: Date.now() }
            : b
        ),
      }));
    } else {
      set({ activeTimer: null });
    }
  },

  setSaveError: (val) => set({ saveError: val }),
  setSessionExpired: (val) => set({ sessionExpired: val }),
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
  | 'stickers'
  | 'viewMode'
  | 'view'
  | 'selectedDate'
  | 'containerVisibility'
  | 'defaultBlockMinutes'
  | 'weekStartsOnMonday'
  | 'wakeTime'
  | 'sleepTime'
  | 'notificationScope'
  | 'notificationLeadMinutes'
  | 'emailNotificationsEnabled'
  | 'hasCompletedSetup'
  | 'userName'
  | 'onboardingTourComplete'
  | 'activeTimer'
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
    const stored = parsed.viewMode as string | undefined;
    if (stored !== 'overall' && stored !== 'compare') {
      useStore.setState({ viewMode: 'overall' });
    }
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
      stickers: state.stickers,
      viewMode: state.viewMode,
      view: state.view,
      selectedDate: state.selectedDate,
      containerVisibility: state.containerVisibility,
      defaultBlockMinutes: state.defaultBlockMinutes,
      weekStartsOnMonday: state.weekStartsOnMonday,
      wakeTime: state.wakeTime,
      sleepTime: state.sleepTime,
      notificationScope: state.notificationScope,
      notificationLeadMinutes: state.notificationLeadMinutes,
      emailNotificationsEnabled: state.emailNotificationsEnabled,
      hasCompletedSetup: state.hasCompletedSetup,
      userName: state.userName,
      onboardingTourComplete: state.onboardingTourComplete,
      activeTimer: state.activeTimer,
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
