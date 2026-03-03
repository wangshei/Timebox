import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  Cog6ToothIcon,
  CheckIcon,
  PencilIcon,
  CalendarIcon,
} from '@heroicons/react/24/solid';
import { CalendarView } from './components/CalendarView';
import { DraggableBottomSheet } from './components/DraggableBottomSheet';
import { RightSidebar } from './components/RightSidebar';
import { AddModal } from './components/AddModal';
import { ScheduleTaskModal } from './components/ScheduleTaskModal';
import { LeftSidebar } from './components/LeftSidebar';
import { SettingsPanel } from './components/SettingsPanel';
import { AuthPage } from './components/AuthPage';
import { OnboardingWizard } from './components/OnboardingWizard';
import { OnboardingTour } from './components/OnboardingTour';
import { useStore } from './store/useStore';
import {
  selectTimeBlocksForView,
  selectPlanVsActualByCategory,
  selectPlanVsActualByContainer,
  selectPlanVsActualByTag,
  selectDisplayTasksForBacklog,
  selectUnscheduledTasks,
  selectPartiallyCompletedTasks,
  selectFixedTasks,
  selectDoneTasks,
} from './store/selectors';
import { resolveTimeBlocks } from './utils/dataResolver';
import { findNextAvailableSlot, parseTimeToMinutes } from './utils/taskHelpers';
import { getLocalDateString, getViewDateRange } from './utils/dateTime';
import { generateRecurrenceDates } from './utils/recurrenceExpander';
import type { Category, Tag, Mode as StoreMode } from './types';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import { loadSupabaseState, startSupabasePersistence, persistOnboardingToSupabase, deleteOwnAccount } from './supabasePersistence';
import { SegmentedControl } from './components/ui/SegmentedControl';
import { THEME } from './constants/colors';

// Re-export for components that still import from App
export type Mode = StoreMode;
export type View = 'day' | '3day' | 'week' | 'month';
export type { Category, Tag };
export interface Task {
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
  /** Stored task status, mirrors core Task.status. */
  status?: import('./types').Task['status'];
  /** Earliest planned block date (YYYY-MM-DD). */
  nextBlockDate?: string | null;
  /** Earliest planned block start time (HH:mm). */
  nextBlockStart?: string | null;
  /** Earliest planned block end time (HH:mm). */
  nextBlockEnd?: string | null;
}
export interface TimeBlock {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  date: string;
  category: Category;
  tags: Tag[];
  type: 'planned' | 'recorded';
  calendar: 'personal' | 'work' | 'school';
}

export default function App() {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addModalMode, setAddModalMode] = useState<'task' | 'event'>('task');
  const [addModalInitialDate, setAddModalInitialDate] = useState<string | null>(null);
  const [addModalInitialStart, setAddModalInitialStart] = useState<string | null>(null);
  const [addModalInitialEnd, setAddModalInitialEnd] = useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTimeBlockId, setEditingTimeBlockId] = useState<string | null>(null);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [isDraftTimeBlock, setIsDraftTimeBlock] = useState(false);
  const [recurrenceEditScopePending, setRecurrenceEditScopePending] = useState<string | null>(null);
  const [pendingRecurrenceEditScope, setPendingRecurrenceEditScope] = useState<'this' | 'all' | 'all_after'>('this');
  const [schedulingTaskId, setSchedulingTaskId] = useState<string | null>(null);
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isBugReportOpen, setIsBugReportOpen] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteStatus, setDeleteStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [bugText, setBugText] = useState('');
  const [bugStatus, setBugStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [isEditMode, setIsEditMode] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const leftBarDragJustEnded = useRef(false);
  const rightBarDragJustEnded = useRef(false);
  const [focusedCategoryId, setFocusedCategoryId] = useState<string | null>(null);
  const [focusedCalendarId, setFocusedCalendarId] = useState<string | null>(null);
  const [recordingOverlapWarning, setRecordingOverlapWarning] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const isPasswordRecoveryRef = useRef(false);
  // Check URL params for deep-links from the landing site (e.g. ?mode=signup|login|visitor)
  const _urlMode = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('mode')
    : null;
  const [visitMode, setVisitMode] = useState(_urlMode === 'visitor');
  const [dataReady, setDataReady] = useState(false);
  // Pre-auth navigation: always show auth screen (landing page lives in the separate landing site)
  const [preAuthScreen, setPreAuthScreen] = useState<'auth'>('auth');
  const [authMode, setAuthMode] = useState<'signup' | 'login'>(
    _urlMode === 'login' ? 'login' : 'signup'
  );
  // Onboarding tour: show after wizard completion
  const [showTour, setShowTour] = useState(false);

  // Local dev: if not signed in, auto-enter visit mode so you don't have to log in every time.
  // Sign in once when you want to test backend; session persists (Supabase persistSession).
  useEffect(() => {
    if (typeof import.meta.env.PROD !== 'boolean') return;
    if (!import.meta.env.PROD && !session && !visitMode) {
      setVisitMode(true);
    }
  }, [session, visitMode]);

  const {
    viewMode: mode,
    view,
    setViewMode,
    setView,
    selectedDate,
    setSelectedDate,
    containerVisibility,
    toggleContainerVisibility,
    setAllCalendarsVisible,
    tasks,
    timeBlocks,
    calendarContainers,
    categories,
    tags,
    addTask,
    addTimeBlock,
    updateTimeBlock,
    updateTask,
    deleteTask,
    createPlannedBlocksFromTask,
    defaultBlockMinutes,
    markDoneAsPlanned,
    markDidSomethingElse,
    confirmBlock,
    skipBlock,
    addUnplannedBlock,
    batchConfirmDay,
    deleteTimeBlock,
    endDay,
    addCalendarContainer,
    updateCalendarContainer,
    deleteCalendarContainer,
    addCategory,
    updateCategory,
    deleteCategory,
    addTag,
    updateTag,
    deleteTag,
    events,
    addEvent,
    updateEvent,
    deleteEvent,
    convertTimeBlockToEvent,
    addEvents,
    updateEvents,
    deleteEvents,
    setCalendarContainers,
    setCategories,
    setTags,
    weekStartsOnMonday,
    setWeekStartsOnMonday,
    wakeTime,
    sleepTime,
    setWakeTime,
    setSleepTime,
    hasCompletedSetup,
    userName,
    onboardingTourComplete,
    setHasCompletedSetup,
    setUserName,
    setOnboardingTourComplete,
    applyTemplate,
    mergeTemplate,
    applyBlankSetup,
    saveError,
    sessionExpired,
    setSaveError,
    setSessionExpired,
  } = useStore();

  const visibleTimeBlocks = useMemo(
    () =>
      selectTimeBlocksForView(
        timeBlocks,
        selectedDate,
        view,
        containerVisibility
      ),
    [timeBlocks, selectedDate, view, containerVisibility]
  );

  const visibleEvents = useMemo(() => {
    if (view === 'day') {
      return events.filter((e) => e.date === selectedDate && containerVisibility[e.calendarContainerId] !== false);
    }
    return events.filter((e) => containerVisibility[e.calendarContainerId] !== false);
  }, [events, selectedDate, view, containerVisibility]);

  const analyticsDateRange = useMemo(
    () => getViewDateRange(selectedDate, view),
    [selectedDate, view]
  );
  const planVsActualByCategory = useMemo(
    () => selectPlanVsActualByCategory(timeBlocks, analyticsDateRange, categories),
    [timeBlocks, analyticsDateRange, categories]
  );
  const planVsActualByContainer = useMemo(
    () => selectPlanVsActualByContainer(timeBlocks, analyticsDateRange, calendarContainers),
    [timeBlocks, analyticsDateRange, calendarContainers]
  );
  const planVsActualByTag = useMemo(
    () => selectPlanVsActualByTag(timeBlocks, analyticsDateRange, tags),
    [timeBlocks, analyticsDateRange, tags]
  );

  type PlanVsActualView = 'category' | 'container' | 'tag';
  const [planVsActualView, setPlanVsActualView] = useState<PlanVsActualView>('category');
  const planVsActual =
    planVsActualView === 'category'
      ? planVsActualByCategory
      : planVsActualView === 'container'
        ? planVsActualByContainer
        : planVsActualByTag;

  const displayTasks = useMemo(
    () =>
      selectDisplayTasksForBacklog(
        tasks,
        timeBlocks,
        categories,
        tags,
        calendarContainers
      ),
    [tasks, timeBlocks, categories, tags, calendarContainers]
  );

  const unscheduledTasks = useMemo(
    () => selectUnscheduledTasks(tasks, timeBlocks),
    [tasks, timeBlocks]
  );
  const partiallyCompletedTasks = useMemo(
    () => selectPartiallyCompletedTasks(tasks, timeBlocks),
    [tasks, timeBlocks]
  );
  const unscheduledDisplay = useMemo(
    () =>
      displayTasks.filter((t) =>
        unscheduledTasks.some((u) => u.id === t.id) && !t.pinned
      ),
    [displayTasks, unscheduledTasks]
  );
  const doneTasks = useMemo(
    () => selectDoneTasks(tasks, timeBlocks),
    [tasks, timeBlocks]
  );
  const doneDisplay = useMemo(
    () =>
      displayTasks.filter((t) => doneTasks.some((d) => d.id === t.id)),
    [displayTasks, doneTasks]
  );

  const partiallyCompletedDisplay = useMemo(
    () =>
      displayTasks.filter(
        (t) =>
          partiallyCompletedTasks.some((p) => p.id === t.id) &&
          !doneTasks.some((d) => d.id === t.id)
      ),
    [displayTasks, partiallyCompletedTasks, doneTasks]
  );

  const fixedTasks = useMemo(
    () => selectFixedTasks(tasks),
    [tasks]
  );
  const fixedMissedDisplay = useMemo(
    () =>
      displayTasks.filter((t) => fixedTasks.some((f) => f.id === t.id)),
    [displayTasks, fixedTasks]
  );

  const handleMarkTaskDone = (taskId: string) => {
    const coreTask = tasks.find((t) => t.id === taskId);
    if (!coreTask) return;

    const taskBlocks = timeBlocks.filter((b) => b.taskId === taskId);

    // Toggle behaviour: if already marked done, clear status and unconfirm all blocks.
    if (coreTask.status === 'done') {
      updateTask(taskId, { status: undefined });
      // Unconfirm all confirmed blocks so calendar cards reflect "not done"
      taskBlocks.forEach((b) => {
        if (b.confirmationStatus === 'confirmed') {
          updateTimeBlock(b.id, { confirmationStatus: undefined });
        }
      });
      return;
    }

    // Mark done: persist status and confirm all planned blocks so calendar cards update too.
    updateTask(taskId, { status: 'done' });
    taskBlocks.forEach((b) => {
      if (b.confirmationStatus !== 'confirmed') {
        confirmBlock(b.id);
      }
    });
  };

  /** Confirm a block on the calendar AND sync the parent task's done status. */
  const handleConfirmBlock = (blockId: string) => {
    confirmBlock(blockId);
    // If all blocks for this task are now confirmed, mark the task as done
    const block = timeBlocks.find((b) => b.id === blockId);
    if (!block?.taskId) return;
    const taskId = block.taskId;
    const siblings = timeBlocks.filter((b) => b.taskId === taskId && b.id !== blockId);
    const allConfirmed = siblings.every((b) => b.confirmationStatus === 'confirmed');
    if (allConfirmed) {
      updateTask(taskId, { status: 'done' });
    }
  };

  /** Unconfirm a block on the calendar AND clear the parent task's done status. */
  const handleUnconfirmBlock = (blockId: string) => {
    updateTimeBlock(blockId, { confirmationStatus: undefined });
    const block = timeBlocks.find((b) => b.id === blockId);
    if (!block?.taskId) return;
    const coreTask = tasks.find((t) => t.id === block.taskId);
    if (coreTask?.status === 'done') {
      updateTask(block.taskId, { status: undefined });
    }
  };

  const handleAddTask = (taskData: {
    title: string;
    estimatedHours: number;
    category: Category;
    tags: Tag[];
    calendar: 'personal' | 'work' | 'school';
    dueDate?: string | null;
    link?: string | null;
    description?: string | null;
    notes?: string | null;
    priority?: number;
    scheduleAt?: { date: string; startTime: string; endTime: string } | null;
  }) => {
    const taskId = addTask({
      title: taskData.title,
      estimatedMinutes: taskData.estimatedHours * 60,
      calendarContainerId: taskData.calendar,
      categoryId: taskData.category.id,
      tagIds: taskData.tags.map((t) => t.id),
      flexible: true,
      dueDate: taskData.dueDate ?? undefined,
      link: taskData.link ?? undefined,
      description: taskData.description ?? undefined,
      notes: taskData.notes ?? undefined,
      priority: typeof taskData.priority === 'number' ? taskData.priority : undefined,
    });
    // If created from a calendar drag, also schedule the task at that time slot
    if (taskData.scheduleAt && taskId) {
      const slot = taskData.scheduleAt;
      const todayStr = getLocalDateString();
      const parseT = (t: string) => { const [h, m] = t.split(':').map(Number); return (h ?? 0) * 60 + (m ?? 0); };
      const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
      const endMins = parseT(slot.endTime);
      const isPastSlot = slot.date < todayStr || (slot.date === todayStr && endMins <= nowMins);
      addTimeBlock({
        taskId,
        title: taskData.title,
        calendarContainerId: taskData.calendar,
        categoryId: taskData.category.id,
        tagIds: taskData.tags.map((t) => t.id),
        start: slot.startTime,
        end: slot.endTime,
        date: slot.date,
        mode: isPastSlot ? 'recorded' : 'planned',
        source: 'manual',
      });
    }
  };

  const handleAddEvent = (eventData: {
    title: string;
    startTime: string;
    endTime: string;
    date: string;
    category: Category;
    tags: Tag[];
    calendar: string;
    recurring?: boolean;
    recurrencePattern?: import('./types').RecurrencePattern;
    recurrenceDays?: number[];
    link?: string | null;
    description?: string | null;
    notes?: string | null;
  }) => {
    const eventPayload = {
      title: eventData.title,
      calendarContainerId: eventData.calendar,
      categoryId: eventData.category.id,
      start: eventData.startTime,
      end: eventData.endTime,
      date: eventData.date,
      recurring: eventData.recurring ?? false,
      recurrencePattern: eventData.recurrencePattern,
      recurrenceDays: eventData.recurrenceDays,
      link: eventData.link ?? undefined,
      description: eventData.description ?? undefined,
      notes: eventData.notes ?? undefined,
    };
    const isRecurring = eventData.recurring && eventData.recurrencePattern && eventData.recurrencePattern !== 'none';

    // If we were editing a draft timeBlock (from drag-to-create),
    // atomically convert it to an event (or series) in a single state change.
    if (isDraftTimeBlock && editingTimeBlockId) {
      // Preserve source from draft block so actual-panel events stay out of plan panel
      const draftBlock = timeBlocks.find((b) => b.id === editingTimeBlockId);
      const draftSource = draftBlock?.source === 'unplanned' ? ('unplanned' as const) : undefined;
      const payloadWithSource = { ...eventPayload, source: draftSource };
      if (isRecurring) {
        const seriesId = crypto.randomUUID();
        const dates = generateRecurrenceDates(eventData.date, eventData.recurrencePattern!, eventData.recurrenceDays);
        deleteTimeBlock(editingTimeBlockId);
        addEvents(dates.map((date) => ({ ...payloadWithSource, date, recurrenceSeriesId: seriesId })));
      } else {
        convertTimeBlockToEvent(editingTimeBlockId, payloadWithSource);
      }
      setEditingTimeBlockId(null);
      setIsDraftTimeBlock(false);
    } else if (isRecurring) {
      const seriesId = crypto.randomUUID();
      const dates = generateRecurrenceDates(eventData.date, eventData.recurrencePattern!, eventData.recurrenceDays);
      addEvents(dates.map((date) => ({ ...eventPayload, date, recurrenceSeriesId: seriesId })));
    } else {
      addEvent(eventPayload);
    }
  };

  const handleBreakIntoChunks = (taskId: string, chunkMinutes: number) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || chunkMinutes <= 0) return;
    const total = task.estimatedMinutes;
    const n = Math.ceil(total / chunkMinutes);
    for (let i = 0; i < n; i++) {
      const mins = i === n - 1 ? total - (n - 1) * chunkMinutes : chunkMinutes;
      if (mins <= 0) continue;
      addTask({
        title: task.title,
        estimatedMinutes: mins,
        calendarContainerId: task.calendarContainerId,
        categoryId: task.categoryId,
        tagIds: task.tagIds ?? [],
        flexible: task.flexible,
        dueDate: task.dueDate ?? undefined,
      });
    }
    deleteTask(taskId);
  };

  /** Split task into two: one with chunkMinutes, original reduced by that amount. */
  const handleSplitTask = (taskId: string, chunkMinutes: number) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || chunkMinutes <= 0) return;
    const remainder = task.estimatedMinutes - chunkMinutes;
    if (remainder <= 0) return; // not enough to split
    addTask({
      title: task.title,
      estimatedMinutes: chunkMinutes,
      calendarContainerId: task.calendarContainerId,
      categoryId: task.categoryId,
      tagIds: task.tagIds ?? [],
      flexible: task.flexible,
      dueDate: task.dueDate ?? undefined,
    });
    updateTask(taskId, { estimatedMinutes: remainder });
  };

  const handleOpenAddModal = (modalMode: 'task' | 'event' = 'task') => {
    setEditingTaskId(null);
    setEditingTimeBlockId(null);
    setEditingEventId(null);
    setIsDraftTimeBlock(false);
    setAddModalMode(modalMode);
    setIsAddModalOpen(true);
  };

  const handleEditTask = (id: string) => {
    setEditingTaskId(id);
    setEditingTimeBlockId(null);
    setEditingEventId(null);
    setIsDraftTimeBlock(false);
    setAddModalMode('task');
    setIsAddModalOpen(true);
  };

  const handleEditEvent = (id: string) => {
    const ev = events.find((e) => e.id === id);
    if (ev?.recurring && ev.recurrenceSeriesId) {
      // Show scope picker first
      setRecurrenceEditScopePending(id);
      return;
    }
    setPendingRecurrenceEditScope('this');
    setEditingTaskId(null);
    setEditingTimeBlockId(null);
    setEditingEventId(id);
    setIsDraftTimeBlock(false);
    setAddModalMode('event');
    setIsAddModalOpen(true);
  };

  const handleEditBlock = (blockId: string) => {
    const block = timeBlocks.find((b) => b.id === blockId);
    if (block?.taskId) {
      // Task-linked block: edit the task, not the block
      setEditingTaskId(block.taskId);
      setEditingTimeBlockId(null);
      setEditingEventId(null);
      setIsDraftTimeBlock(false);
      setAddModalMode('task');
      setIsAddModalOpen(true);
    } else {
      // Standalone block: edit as event
      setEditingTaskId(null);
      setEditingTimeBlockId(blockId);
      setEditingEventId(null);
      setIsDraftTimeBlock(false);
      setAddModalMode('event');
      setIsAddModalOpen(true);
    }
  };

  const editingTask = editingTaskId ? tasks.find((t) => t.id === editingTaskId) ?? null : null;
  const editingTimeBlock = editingTimeBlockId ? timeBlocks.find((b) => b.id === editingTimeBlockId) ?? null : null;
  const editingEvent = editingEventId ? events.find((e) => e.id === editingEventId) ?? null : null;
  const schedulingTask = schedulingTaskId ? tasks.find((t) => t.id === schedulingTaskId) ?? null : null;

  const handleAutoSchedule = useCallback((taskIds: string[]) => {
    const today = getLocalDateString();
    const now = new Date();
    const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const startAfter = parseTimeToMinutes(nowTime) > parseTimeToMinutes(wakeTime) ? nowTime : wakeTime;

    if (parseTimeToMinutes(startAfter) >= parseTimeToMinutes(sleepTime)) return;

    for (const taskId of taskIds) {
      // Re-read latest state each iteration so previously scheduled blocks are visible
      const currentState = useStore.getState();
      const task = currentState.tasks.find((t) => t.id === taskId);
      if (!task || task.status === 'done') continue;

      const durationMins = Math.max(15, task.estimatedMinutes || currentState.defaultBlockMinutes);
      const slot = findNextAvailableSlot(
        currentState.timeBlocks,
        currentState.events as any,
        today,
        durationMins,
        startAfter,
        sleepTime,
      );

      if (!slot) break; // No more room today

      currentState.createPlannedBlocksFromTask(taskId, {
        date: today,
        startTime: slot.start,
        blockMinutes: durationMins,
        singleBlock: true,
      });
    }
  }, [wakeTime, sleepTime]);

  const handleOpenScheduleTask = (taskId: string) => {
    setSchedulingTaskId(taskId);
  };

  const handleRescheduleLater = useCallback((taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const today = getLocalDateString();
    const now = new Date();
    const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    // Check current time is before sleep time
    if (parseTimeToMinutes(nowTime) >= parseTimeToMinutes(sleepTime)) return;

    const durationMins = Math.max(15, task.estimatedMinutes || defaultBlockMinutes);

    const slot = findNextAvailableSlot(
      timeBlocks,
      events,
      today,
      durationMins,
      nowTime,
      sleepTime,
    );

    if (!slot) return;

    // Skip old past pending blocks for this task on today
    const todayPastPending = timeBlocks.filter(
      (b) =>
        b.taskId === taskId &&
        b.date === today &&
        b.mode === 'planned' &&
        (!b.confirmationStatus || b.confirmationStatus === 'pending') &&
        parseTimeToMinutes(b.end) <= parseTimeToMinutes(nowTime),
    );
    for (const b of todayPastPending) {
      skipBlock(b.id);
    }

    // Create a new planned block in the found slot
    createPlannedBlocksFromTask(taskId, {
      date: today,
      startTime: slot.start,
      blockMinutes: durationMins,
      singleBlock: true,
    });
  }, [tasks, timeBlocks, events, sleepTime, defaultBlockMinutes, skipBlock, createPlannedBlocksFromTask]);

  const handleScheduleSubmit = (params: { date: string; startTime: string; blockMinutes?: number }) => {
    if (schedulingTaskId) {
      createPlannedBlocksFromTask(schedulingTaskId, { ...params, singleBlock: true });
      setSchedulingTaskId(null);
    }
  };

  const handleDropTask = (
    taskId: string,
    params: { date: string; startTime: string; blockMinutes: number }
  ) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    const parseTimeToMinsLocal = (t: string) => {
      const [h, m] = t.split(':').map(Number);
      return (h ?? 0) * 60 + (m ?? 0);
    };
    const todayLocal = getLocalDateString();
    // Count today-or-future planned blocks + confirmed past blocks toward the budget.
    // Past unconfirmed blocks are effectively "returned" to the backlog.
    const planned = timeBlocks
      .filter((b) => b.taskId === taskId && b.mode === 'planned' &&
        (b.date >= todayLocal || b.confirmationStatus === 'confirmed'))
      .reduce((s, b) => s + (parseTimeToMinsLocal(b.end) - parseTimeToMinsLocal(b.start)), 0);
    const recorded = timeBlocks
      .filter((b) => b.taskId === taskId && b.mode === 'recorded')
      .reduce((s, b) => s + (parseTimeToMinsLocal(b.end) - parseTimeToMinsLocal(b.start)), 0);
    const remaining = Math.max(0, task.estimatedMinutes - planned - recorded);
    // Only block the drop if the task has an estimate AND all time is already scheduled
    if (task.estimatedMinutes > 0 && remaining <= 0) return;

    const requested =
      params.blockMinutes > 0 && Number.isFinite(params.blockMinutes)
        ? params.blockMinutes
        : task.estimatedMinutes || 60; // default to 1h for tasks without estimate
    // When task has no estimate, don't cap by remaining
    const budget = task.estimatedMinutes > 0 ? remaining : requested;
    const duration = Math.max(15, Math.min(budget, Math.round(requested / 15) * 15));
    const startMins = parseTimeToMinsLocal(params.startTime);
    const endMins = startMins + duration;
    const minsToTimeString = (mins: number) =>
      `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
    const todayStr = getLocalDateString();
    const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
    const isPastSlot = params.date < todayStr || (params.date === todayStr && endMins <= nowMins);
    const blockMode = isPastSlot ? 'recorded' : 'planned';
    const startStr = minsToTimeString(startMins);
    const endStr = minsToTimeString(endMins);
    if (blockMode === 'recorded' && checkRecordingOverlap(params.date, startStr, endStr)) {
      return;
    }
    addTimeBlock({
      taskId,
      title: task.title,
      calendarContainerId: task.calendarContainerId,
      categoryId: task.categoryId,
      tagIds: task.tagIds ?? [],
      start: startStr,
      end: endStr,
      date: params.date,
      mode: blockMode,
      source: 'manual',
    });
  };

  const checkRecordingOverlap = useCallback((date: string, startTime: string, endTime: string, excludeBlockId?: string) => {
    const parseT = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    const newStart = parseT(startTime);
    const newEnd = parseT(endTime);
    const overlapping = timeBlocks.filter((b) =>
      b.date === date &&
      b.mode === 'recorded' &&
      b.id !== excludeBlockId &&
      parseT(b.start) < newEnd &&
      parseT(b.end) > newStart
    );
    if (overlapping.length > 0) {
      setRecordingOverlapWarning(
        'You already have a recorded block during this time. Consider editing the existing block or splitting it — you shouldn\'t record the same time twice.'
      );
      return true;
    }
    return false;
  }, [timeBlocks]);

  const handleCreateBlock = (params: { date: string; startTime: string; endTime: string; isRecordedPanel?: boolean }) => {
    // Open the Add modal (with Task/Event toggle) pre-filled with the dragged time slot.
    setEditingTaskId(null);
    setEditingTimeBlockId(null);
    setEditingEventId(null);
    setIsDraftTimeBlock(false);
    setAddModalInitialDate(params.date);
    setAddModalInitialStart(params.startTime);
    setAddModalInitialEnd(params.endTime);
    setAddModalMode('event');
    setIsAddModalOpen(true);
    return undefined;
  };

  const parseTimeToMins = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  };
  const minsToTime = (mins: number) =>
    `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

  const handleMoveBlock = (blockId: string, params: { date: string; startTime: string; endTime: string }) => {
    const block = timeBlocks.find((b) => b.id === blockId);
    if (!block) return;
    if (!(block.title ?? '').trim() && !block.taskId) {
      setEditingTaskId(null);
      setEditingTimeBlockId(blockId);
      setIsDraftTimeBlock(false);
      setAddModalMode('event');
      setIsAddModalOpen(true);
      return;
    }
    if (block.mode === 'recorded') {
      if (checkRecordingOverlap(params.date, params.startTime, params.endTime, blockId)) return;
    }
    updateTimeBlock(blockId, { start: params.startTime, end: params.endTime, date: params.date });
  };

  const handleResizeBlock = (blockId: string, params: { date: string; endTime: string }) => {
    const block = timeBlocks.find((b) => b.id === blockId);
    if (!block) return;
    if (parseTimeToMins(params.endTime) <= parseTimeToMins(block.start)) return;
    if (block.mode === 'recorded') {
      if (checkRecordingOverlap(block.date, block.start, params.endTime, blockId)) return;
    }
    updateTimeBlock(blockId, { date: params.date, end: params.endTime });
  };

  const handleMoveEvent = (eventId: string, params: { date: string; startTime: string; endTime: string }) => {
    if (parseTimeToMins(params.endTime) <= parseTimeToMins(params.startTime)) return;
    updateEvent(eventId, { date: params.date, start: params.startTime, end: params.endTime });
  };

  const handleResizeEvent = (eventId: string, params: { date: string; endTime: string }) => {
    const event = events.find((e) => e.id === eventId);
    if (!event) return;
    if (parseTimeToMins(params.endTime) <= parseTimeToMins(event.start)) return;
    updateEvent(eventId, { date: params.date, end: params.endTime });
  };

  const handleToggleEventAttendance = (eventId: string, status: 'attended' | 'not_attended' | undefined) => {
    updateEvent(eventId, { attendanceStatus: status });
  };

  const handleDeleteEventSeries = (id: string, scope: 'this' | 'all' | 'all_after') => {
    const event = events.find((e) => e.id === id);
    if (!event) return;
    if (scope === 'this' || !event.recurrenceSeriesId) {
      deleteEvent(id);
    } else if (scope === 'all') {
      deleteEvents(events.filter((e) => e.recurrenceSeriesId === event.recurrenceSeriesId).map((e) => e.id));
    } else if (scope === 'all_after') {
      deleteEvents(
        events
          .filter((e) => e.recurrenceSeriesId === event.recurrenceSeriesId && e.date >= event.date)
          .map((e) => e.id)
      );
    }
  };

  // Supabase auth session + persistence
  useEffect(() => {
    if (!supabase) {
      setDataReady(true);
      return;
    }
    let unsubscribePersistence: (() => void) | undefined;

    const setupForSession = async (next: Session | null) => {
      setSession(next);
      sessionRef.current = next;
      setDataReady(false);
      if (unsubscribePersistence) {
        unsubscribePersistence();
        unsubscribePersistence = undefined;
      }
      if (!next) {
        // Signed out: reset onboarding flags so a new user on this browser
        // doesn't inherit the previous user's completed-setup state.
        useStore.setState({ hasCompletedSetup: false, userName: '', onboardingTourComplete: false });
        // The persistence subscription was already unsubscribed above, so the
        // state reset above won't be written to localStorage automatically.
        // Clear localStorage directly so the next sign-in starts fresh.
        try { window.localStorage.removeItem('timebox-state-v2'); } catch { /* ignore */ }
      }
      if (next) {
        // Clear stale error flags on fresh sign-in
        setSessionExpired(false);
        setSaveError(false);
        // Start persistence subscription BEFORE loading so that the store
        // changes made by loadSupabaseState (e.g. default Personal calendar)
        // are captured and saved to Supabase.
        unsubscribePersistence = startSupabasePersistence();
        try {
          await loadSupabaseState();
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error('[App] loadSupabaseState failed', e);
          // Still allow app to render even if load failed (user can fix DB schema)
        }
      }
      setDataReady(true);
    };

    // Validate the session server-side (getUser hits the API, unlike getSession
    // which only reads the cached JWT). This ensures deleted users are signed out.
    supabase.auth.getUser().then(({ data, error }) => {
      if (error || !data.user) {
        // Token is invalid or user was deleted — clear the stale session
        void supabase!.auth.signOut();
        void setupForSession(null);
      } else {
        // User is valid — get the full session object
        supabase!.auth.getSession().then(({ data: sessionData }) => {
          void setupForSession(sessionData.session);
        });
      }
    });

    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      // Password recovery: show reset form instead of entering the app
      if (event === 'PASSWORD_RECOVERY') {
        setSession(nextSession);
        setIsPasswordRecovery(true);
        isPasswordRecoveryRef.current = true;
        setDataReady(true);
        // Clean URL but don't run setupForSession — we want to stay on auth screen
        if (typeof window !== 'undefined' && (window.location.hash || window.location.search.includes('code='))) {
          window.history.replaceState(null, '', window.location.pathname);
        }
        return;
      }
      // Supabase fires SIGNED_IN right after PASSWORD_RECOVERY — skip it
      if (isPasswordRecoveryRef.current && event === 'SIGNED_IN') {
        return;
      }
      // TOKEN_REFRESHED and SIGNED_IN fire on tab switch when Supabase refreshes
      // the JWT. Just update the session reference without reloading all data.
      if (event === 'TOKEN_REFRESHED' || (event === 'SIGNED_IN' && sessionRef.current)) {
        setSession(nextSession);
        sessionRef.current = nextSession;
        return;
      }
      void setupForSession(nextSession);
      // Clear code/hash from URL after successful sign-in
      if (nextSession && typeof window !== 'undefined' && (window.location.hash || window.location.search.includes('code='))) {
        window.history.replaceState(null, '', window.location.pathname);
      }
    });

    return () => {
      data.subscription.unsubscribe();
      if (unsubscribePersistence) unsubscribePersistence();
    };
  }, []);

  // Keyboard shortcuts: d day, w week, m month, p planning, r recording, a all calendars
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable;
      if (isInput) return;
      const key = e.key.toLowerCase();
      if (key === 'd') { setView('day'); e.preventDefault(); }
      else if (key === '3') { setView('3day'); e.preventDefault(); }
      else if (key === 'w') { setView('week'); e.preventDefault(); }
      else if (key === 'm') { setView('month'); e.preventDefault(); }
      else if (key === 'c') { setViewMode(mode === 'compare' ? 'overall' : 'compare'); e.preventDefault(); }
      else if (key === 'a') { setAllCalendarsVisible(); e.preventDefault(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, setView, setViewMode, setAllCalendarsVisible]);

  // Auth gate: require sign-in only in production. In dev you get visit mode by default; sign in once to test backend (session persists).
  const requireAuth = !!supabase && import.meta.env.PROD;

  // Profile display letter: prefer userName, fall back to email initial
  const profileLetter = (userName || session?.user.email || '?')[0]?.toUpperCase() ?? '?';

  // ── Derived screen ────────────────────────────────────────────────────────
  // Determines which top-level view to render without any routing library.
  type AppScreen = 'auth' | 'setup' | 'loading' | 'app';
  const appScreen: AppScreen = (() => {
    // Password recovery flow: always show auth screen with reset form
    if (isPasswordRecovery) return 'auth';
    // Dev-only: ?page=auth|setup forces a specific screen so you can preview auth flow
    if (!import.meta.env.PROD && typeof window !== 'undefined') {
      const forcePage = new URLSearchParams(window.location.search).get('page') as AppScreen | null;
      if (forcePage && (['auth', 'setup'] as AppScreen[]).includes(forcePage)) return forcePage;
    }
    if (!requireAuth) return 'app';                      // dev bypass
    if (session && !dataReady) return 'loading';         // waiting for Supabase load
    if (!session && !visitMode) return preAuthScreen;    // always 'auth'
    // Visitor or logged-in: check setup state
    if (!hasCompletedSetup) {
      // Existing user with meaningful data → show app + one-time migration modal
      // (don't count the auto-bootstrapped default calendar/category)
      if (session && (tasks.length > 0 || categories.length > 1 || calendarContainers.length > 1)) {
        return 'app';
      }
      return 'setup';                                    // new user (logged-in or visitor)
    }
    return 'app';
  })();

  // ── Onboarding wizard handler ─────────────────────────────────────────────
  const handleWizardComplete = ({ name, choice, showTour: doShowTour }: {
    name: string;
    choice: 'template' | 'blank';
    showTour: boolean;
  }) => {
    setUserName(name);
    if (choice === 'template') applyTemplate();
    else applyBlankSetup();
    setHasCompletedSetup(true);
    void persistOnboardingToSupabase(true);
    if (doShowTour) setShowTour(true);
  };

  // ── Pre-app screens ───────────────────────────────────────────────────────
  if (appScreen === 'loading') {
    return (
      <div className="h-screen w-full flex items-center justify-center" style={{ backgroundColor: '#FDFDFB' }}>
        <div className="text-sm" style={{ color: '#636366' }}>Loading your data…</div>
      </div>
    );
  }

  if (appScreen === 'auth') {
    return (
      <AuthPage
        supabase={supabase}
        mode={authMode}
        onVisitMode={() => setVisitMode(true)}
        isPasswordRecovery={isPasswordRecovery}
        onPasswordResetComplete={() => {
          // Clear recovery flags so the normal auth flow resumes
          setIsPasswordRecovery(false);
          isPasswordRecoveryRef.current = false;
          // Refresh the session — this fires onAuthStateChange with SIGNED_IN,
          // which (with recovery flag cleared) runs setupForSession normally.
          supabase?.auth.refreshSession();
        }}
      />
    );
  }

  if (appScreen === 'setup') {
    return (
      <OnboardingWizard
        initialName={userName}
        onComplete={handleWizardComplete}
      />
    );
  }

  return (
    <div className="h-screen w-full flex flex-col overflow-hidden" style={{ backgroundColor: '#FDFDFB' }}>
      {/* Visit-mode warning banner */}
      {visitMode && !session && (
        <div className="w-full border-b border-amber-300 bg-amber-50 px-4 py-1.5 flex items-center justify-between text-xs">
          <span className="text-amber-800 font-medium">
            Visit Mode — nothing will be saved.{userName ? ` Hey ${userName}!` : ''} Sign in to keep your data.
          </span>
          <button
            type="button"
            onClick={() => { setVisitMode(false); setPreAuthScreen('auth'); setAuthMode('signup'); }}
            className="px-2 py-1 rounded border border-amber-300 text-amber-800 font-medium hover:bg-amber-100 transition-colors"
          >
            Sign in
          </button>
        </div>
      )}

      {/* Session expired banner */}
      {sessionExpired && session === null && !visitMode && (
        <div className="w-full border-b px-4 py-1.5 flex items-center justify-between text-xs" style={{ borderColor: 'rgba(255,59,48,0.25)', backgroundColor: 'rgba(255,59,48,0.05)' }}>
          <span style={{ color: '#B85050' }} className="font-medium">
            Session expired — sign in again to save your changes.
          </span>
          <button
            type="button"
            onClick={() => { setSessionExpired(false); setVisitMode(false); setPreAuthScreen('auth'); setAuthMode('login'); }}
            className="px-2 py-1 rounded font-medium transition-colors"
            style={{ border: '1px solid rgba(255,59,48,0.25)', color: '#B85050' }}
          >
            Sign in
          </button>
        </div>
      )}

      {/* Save error banner */}
      {saveError && !sessionExpired && session && (
        <div className="w-full border-b px-4 py-1.5 flex items-center justify-between text-xs" style={{ borderColor: 'rgba(255,149,0,0.3)', backgroundColor: 'rgba(255,149,0,0.06)' }}>
          <span style={{ color: '#996300' }} className="font-medium">
            Changes couldn't be saved — check your connection. We'll retry automatically.
          </span>
          <button
            type="button"
            onClick={() => setSaveError(false)}
            className="px-2 py-1 rounded font-medium transition-colors"
            style={{ border: '1px solid rgba(255,149,0,0.3)', color: '#996300' }}
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="hidden lg:flex flex-1 min-h-0 overflow-hidden">
        {/* Left panel + unified bar (bar always visible; click or drag to open/close) */}
        {leftPanelOpen && (
          <div className="flex-shrink-0 flex flex-col min-h-0 overflow-hidden" style={{ width: '220px', backgroundColor: '#FCFBF7' }}>
            {/* Header: My Calendars label + settings + edit icons (hidden in compare mode — sidebar has its own header) */}
            {mode !== 'compare' && (
              <div className="flex items-center justify-between gap-1.5 px-3 py-2 flex-shrink-0" style={{ borderBottom: '1px solid rgba(0,0,0,0.09)' }}>
                <span className="text-[16px] font-semibold" style={{ color: THEME.textPrimary, letterSpacing: '0.12em' }}>
                  My Calendars
                </span>
                <div className="flex items-center gap-0.5">
                  {/* Settings */}
                  <button
                    type="button"
                    onClick={() => setIsSettingsOpen(true)}
                    className="p-1.5 rounded-lg transition-colors"
                    style={{ color: THEME.textPrimary }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.08)')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    title="Settings"
                    aria-label="Open settings"
                  >
                    <Cog6ToothIcon className="h-3.5 w-3.5" />
                  </button>
                  {/* Edit mode */}
                  <button
                    type="button"
                    onClick={() => setIsEditMode(!isEditMode)}
                    className="p-1.5 rounded-lg transition-colors"
                    style={{
                      color: isEditMode ? '#8DA286' : THEME.textPrimary,
                      backgroundColor: isEditMode ? 'rgba(141,162,134,0.09)' : 'transparent',
                    }}
                    onMouseEnter={(e) => { if (!isEditMode) e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.08)'; }}
                    onMouseLeave={(e) => { if (!isEditMode) e.currentTarget.style.backgroundColor = 'transparent'; }}
                    title={isEditMode ? 'Done editing' : 'Edit calendars'}
                  >
                    {isEditMode ? <CheckIcon className="h-3.5 w-3.5" /> : <PencilIcon className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            )}
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <LeftSidebar
                calendarContainers={calendarContainers}
                categories={categories}
                tags={tags}
                timeBlocks={timeBlocks}
                visibility={containerVisibility}
                onToggleVisibility={toggleContainerVisibility}
                onUpdateCalendar={updateCalendarContainer}
                onAddCalendar={addCalendarContainer}
                onDeleteCalendar={deleteCalendarContainer}
                onUpdateCategory={updateCategory}
                onAddCategory={addCategory}
                onDeleteCategory={deleteCategory}
                onUpdateTag={updateTag}
                onAddTag={addTag}
                onDeleteTag={deleteTag}
                onFocusCalendar={(id) => setFocusedCalendarId((prev) => (prev === id ? null : id))}
                focusedCalendarId={focusedCalendarId}
                onFocusCategory={(id) => setFocusedCategoryId((prev) => (prev === id ? null : id))}
                isEditMode={isEditMode}
                isCompareMode={mode === 'compare'}
                onExitCompare={() => setViewMode('overall')}
                endDayLabel={`Confirm all (${selectedDate})`}
                onEndDay={() => batchConfirmDay(selectedDate)}
                planVsActualSection={mode === 'compare' ? (() => {
                  const totalPlanned = planVsActual.reduce((s, r) => s + r.plannedHours, 0);
                  const totalRecorded = planVsActual.reduce((s, r) => s + r.recordedHours, 0);
                  const totalDelta = totalRecorded - totalPlanned;
                  const maxH = Math.max(totalPlanned, totalRecorded, 0.01);

                  const fmtDate = (d: string) => {
                    const [y, m, day] = d.split('-').map(Number);
                    return new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                  };
                  const rangeLabel = view === 'week'
                    ? `Week of ${fmtDate(analyticsDateRange[0])}`
                    : view === 'month'
                      ? new Date(selectedDate).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                      : view === '3day'
                        ? `${fmtDate(analyticsDateRange[0])} – ${fmtDate(analyticsDateRange[2])}`
                        : selectedDate;

                  return (
                    <div style={{ paddingTop: 2 }}>
                      {/* Date range label */}
                      <p style={{ fontSize: 10, color: '#AEAEB2', fontWeight: 400, marginBottom: 8, letterSpacing: '0' }}>
                        {rangeLabel}
                      </p>
                      {/* Tab control — full width */}
                      <div style={{ marginBottom: 12 }}>
                        <SegmentedControl
                          options={[
                            { value: 'category' as PlanVsActualView, label: 'Category' },
                            { value: 'container' as PlanVsActualView, label: 'Calendar' },
                            { value: 'tag' as PlanVsActualView, label: 'Tag' },
                          ]}
                          value={planVsActualView}
                          onChange={setPlanVsActualView}
                          compact
                          style={{ flex: 1, width: '100%' }}
                        />
                      </div>
                      {planVsActual.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {planVsActual.map((row) => {
                            const pctP = (row.plannedHours / maxH) * 100;
                            const pctR = (row.recordedHours / maxH) * 100;
                            const delta = row.deltaHours;
                            const deltaColor = delta > 0.05 ? '#34C759' : delta < -0.05 ? '#FF453A' : THEME.textPrimary;
                            const deltaLabel = delta > 0.05 ? `+${delta.toFixed(1)}h` : delta < -0.05 ? `${delta.toFixed(1)}h` : '–';
                            return (
                              <div key={row.id}>
                                {/* Name + delta */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
                                  <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: row.color, flexShrink: 0 }} />
                                  <span style={{ fontSize: 12, fontWeight: 500, color: THEME.textPrimary, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.01em' }}>
                                    {row.name}
                                  </span>
                                  <span style={{ fontSize: 10, fontWeight: 600, color: deltaColor, flexShrink: 0, letterSpacing: '-0.01em' }}>
                                    {deltaLabel}
                                  </span>
                                </div>
                                {/* Plan bar */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                                  <span style={{ fontSize: 9, width: 32, textAlign: 'right', color: '#AEAEB2', flexShrink: 0, letterSpacing: '0.02em' }}>plan</span>
                                  <div style={{ flex: 1, height: 3, borderRadius: 99, backgroundColor: 'rgba(0,0,0,0.07)', overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: `${Math.min(100, pctP)}%`, backgroundColor: row.color, opacity: 0.3, borderRadius: 99 }} />
                                  </div>
                                  <span style={{ fontSize: 10, width: 26, textAlign: 'right', color: '#AEAEB2', flexShrink: 0 }}>
                                    {row.plannedHours.toFixed(1)}h
                                  </span>
                                </div>
                                {/* Actual bar */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                  <span style={{ fontSize: 9, width: 32, textAlign: 'right', color: THEME.textPrimary, flexShrink: 0, letterSpacing: '0.02em' }}>actual</span>
                                  <div style={{ flex: 1, height: 3, borderRadius: 99, backgroundColor: 'rgba(0,0,0,0.07)', overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: `${Math.min(100, pctR)}%`, backgroundColor: row.color, opacity: 0.85, borderRadius: 99 }} />
                                  </div>
                                  <span style={{ fontSize: 10, width: 26, textAlign: 'right', color: THEME.textPrimary, fontWeight: 500, flexShrink: 0 }}>
                                    {row.recordedHours.toFixed(1)}h
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                          {/* Totals footer */}
                          <div style={{ borderTop: '1px solid rgba(0,0,0,0.07)', paddingTop: 8, marginTop: 2, display: 'flex', flexDirection: 'column', gap: 3 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: 10, color: THEME.textPrimary }}>Total recorded</span>
                              <span style={{ fontSize: 11, fontWeight: 600, color: THEME.textPrimary, letterSpacing: '-0.01em' }}>{totalRecorded.toFixed(1)}h</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: 10, color: '#AEAEB2' }}>Total planned</span>
                              <span style={{ fontSize: 10, color: '#AEAEB2' }}>{totalPlanned.toFixed(1)}h</span>
                            </div>
                            {Math.abs(totalDelta) > 0.05 && (
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 1 }}>
                                <span style={{ fontSize: 10, color: '#AEAEB2' }}>Difference</span>
                                <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '-0.01em', color: totalDelta > 0 ? '#34C759' : '#FF453A' }}>
                                  {totalDelta > 0 ? '+' : ''}{totalDelta.toFixed(1)}h
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div style={{ textAlign: 'center', padding: '14px 0', color: '#AEAEB2', fontSize: 11 }}>
                          No data for this period
                        </div>
                      )}
                    </div>
                  );
                })() : undefined}
                canEditOrganization={true}
              />
            </div>

            {/* ── Bottom toolbar: profile · bug report · shortcuts ── */}
            <div className="flex-shrink-0" style={{ position: 'relative', borderTop: '1px solid rgba(0,0,0,0.09)' }}>
              {/* Toolbar row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px' }}>
                {/* Profile circle */}
                <button
                  type="button"
                  onClick={() => setShowProfileMenu((o) => !o)}
                  style={{
                    width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 700, border: 'none', cursor: 'pointer', flexShrink: 0, transition: 'opacity 200ms',
                    backgroundColor: session ? '#DBE4D7' : 'rgba(141,162,134,0.14)',
                    color: session ? '#5A7454' : '#8DA286',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.8')}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                  title={session ? session.user.email : visitMode ? 'Visit mode — click for options' : ''}
                >
                  {profileLetter}
                </button>

                {/* Right icons: bug report + keyboard shortcuts */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  {/* Bug report button */}
                  <button
                    type="button"
                    onClick={() => { setIsBugReportOpen((o) => !o); setBugText(''); setBugStatus('idle'); }}
                    style={{
                      padding: 6, borderRadius: 8, border: 'none', cursor: 'pointer', transition: 'background-color 200ms',
                      color: isBugReportOpen ? '#8DA286' : THEME.textPrimary,
                      backgroundColor: isBugReportOpen ? 'rgba(141,162,134,0.09)' : 'transparent',
                    }}
                    onMouseEnter={(e) => { if (!isBugReportOpen) e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.08)'; }}
                    onMouseLeave={(e) => { if (!isBugReportOpen) e.currentTarget.style.backgroundColor = isBugReportOpen ? 'rgba(141,162,134,0.09)' : 'transparent'; }}
                    title="Report a bug"
                  >
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="8" cy="9" r="4" /><path d="M8 5V3" /><path d="M4 9H2M14 9h-2" />
                      <path d="M4.5 5.5 3 4M11.5 5.5 13 4" /><path d="M4.5 12.5 3 14M11.5 12.5 13 14" />
                    </svg>
                  </button>

                  {/* Keyboard shortcuts button */}
                  <button
                    type="button"
                    onClick={() => setIsShortcutsOpen((o) => !o)}
                    style={{
                      padding: 6, borderRadius: 8, border: 'none', cursor: 'pointer', transition: 'background-color 200ms',
                      color: isShortcutsOpen ? '#8DA286' : THEME.textPrimary,
                      backgroundColor: isShortcutsOpen ? 'rgba(141,162,134,0.09)' : 'transparent',
                    }}
                    onMouseEnter={(e) => { if (!isShortcutsOpen) e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.08)'; }}
                    onMouseLeave={(e) => { if (!isShortcutsOpen) e.currentTarget.style.backgroundColor = isShortcutsOpen ? 'rgba(141,162,134,0.09)' : 'transparent'; }}
                    title="Keyboard shortcuts"
                  >
                    <svg width="14" height="11" viewBox="0 0 16 12" fill="none" stroke="currentColor" strokeWidth="1.4">
                      <rect x="0.7" y="0.7" width="14.6" height="10.6" rx="2.5" strokeLinecap="round" strokeLinejoin="round" />
                      <rect x="2.5" y="2.5" width="2" height="2.5" rx="0.7" />
                      <rect x="6" y="2.5" width="2" height="2.5" rx="0.7" />
                      <rect x="9.5" y="2.5" width="2" height="2.5" rx="0.7" />
                      <rect x="3.5" y="7" width="9" height="2" rx="0.7" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* ── Popovers (rendered at toolbar level, positioned within panel bounds) ── */}

              {/* Profile dropdown */}
              {showProfileMenu && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 400 }} onClick={() => setShowProfileMenu(false)} />
                  <div
                    style={{
                      position: 'absolute', bottom: '100%', left: 12, marginBottom: 8, zIndex: 401,
                      minWidth: 196, borderRadius: 12, overflow: 'hidden',
                      backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.09)',
                      boxShadow: '0 8px 28px rgba(0,0,0,0.14)', display: 'flex', flexDirection: 'column',
                    }}
                  >
                    <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid rgba(0,0,0,0.07)' }}>
                      <div
                        style={{
                          width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 12, fontWeight: 700, flexShrink: 0,
                          backgroundColor: session ? '#DBE4D7' : 'rgba(141,162,134,0.14)', color: session ? '#5A7454' : '#8DA286',
                        }}
                      >
                        {profileLetter}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                        {userName && <p style={{ fontSize: 12, fontWeight: 600, color: THEME.textPrimary, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userName}</p>}
                        <p style={{ fontSize: 10, color: THEME.textPrimary, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {session ? session.user.email : 'Visit mode · not saved'}
                        </p>
                      </div>
                    </div>
                    {session ? (
                      <>
                        <button
                          type="button"
                          onClick={() => { supabase?.auth.signOut(); setShowProfileMenu(false); }}
                          style={{ width: '100%', textAlign: 'left', padding: '10px 12px', fontSize: 12, fontWeight: 500, color: '#636366', border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, transition: 'all 200ms', fontFamily: 'inherit' }}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.04)'; e.currentTarget.style.color = THEME.textPrimary; }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#636366'; }}
                        >
                          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M10 8H2M2 8L5 5M2 8l3 3" /><path d="M6 5V3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-2" />
                          </svg>
                          Sign out
                        </button>
                        <button
                          type="button"
                          onClick={() => { setShowProfileMenu(false); setShowDeleteAccount(true); setDeleteConfirmText(''); setDeleteStatus('idle'); }}
                          style={{ width: '100%', textAlign: 'left', padding: '10px 12px', fontSize: 12, fontWeight: 500, color: '#B85050', border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, transition: 'all 200ms', fontFamily: 'inherit', borderTop: '1px solid rgba(0,0,0,0.07)' }}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,59,48,0.05)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                        >
                          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M2 4h12M5.33 4V2.67a1.33 1.33 0 0 1 1.34-1.34h2.66a1.33 1.33 0 0 1 1.34 1.34V4M12 5.33v8a1.33 1.33 0 0 1-1.33 1.34H5.33A1.33 1.33 0 0 1 4 13.33v-8" />
                          </svg>
                          Delete account
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { setShowProfileMenu(false); setVisitMode(false); setPreAuthScreen('auth'); setAuthMode('login'); }}
                        style={{ width: '100%', textAlign: 'left', padding: '10px 12px', fontSize: 12, fontWeight: 500, color: '#636366', border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, transition: 'all 200ms', fontFamily: 'inherit' }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.04)'; e.currentTarget.style.color = THEME.textPrimary; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#636366'; }}
                      >
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M6 8h8M11 5l3 3-3 3" /><path d="M10 5V3a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2" />
                        </svg>
                        Sign in to save data
                      </button>
                    )}
                  </div>
                </>
              )}

              {/* Delete account confirmation dialog */}
              {showDeleteAccount && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 500, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onClick={() => { if (deleteStatus !== 'loading') { setShowDeleteAccount(false); } }}
                  >
                    <div
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        width: 400, maxWidth: 'calc(100vw - 48px)', borderRadius: 16, backgroundColor: '#FFFFFF',
                        border: '1px solid rgba(0,0,0,0.09)', boxShadow: '0 16px 48px rgba(0,0,0,0.18)',
                        padding: 28, display: 'flex', flexDirection: 'column', gap: 16,
                      }}
                    >
                      <div>
                        <h3 style={{ fontSize: 16, fontWeight: 700, color: '#B85050', margin: '0 0 6px' }}>Delete your account?</h3>
                        <p style={{ fontSize: 13, color: '#636366', margin: 0, lineHeight: 1.6 }}>
                          This will permanently delete your account and all your data. This action cannot be undone.
                        </p>
                      </div>
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 500, color: '#8E8E93', display: 'block', marginBottom: 8 }}>
                          Type <span style={{ fontWeight: 700, color: '#1C1C1E' }}>I want to delete my account permanently</span> to confirm
                        </label>
                        <input
                          type="text"
                          value={deleteConfirmText}
                          onChange={(e) => setDeleteConfirmText(e.target.value)}
                          disabled={deleteStatus === 'loading'}
                          placeholder="Type the phrase above"
                          style={{
                            width: '100%', height: 40, padding: '0 12px', fontSize: 13, borderRadius: 8,
                            border: '1.5px solid rgba(0,0,0,0.12)', outline: 'none', fontFamily: 'inherit',
                            backgroundColor: deleteStatus === 'loading' ? '#F5F4F0' : '#FFFFFF',
                            boxSizing: 'border-box' as const,
                          }}
                          onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(184,80,80,0.5)'; }}
                          onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.12)'; }}
                          autoFocus
                        />
                      </div>
                      {deleteStatus === 'error' && (
                        <p style={{ fontSize: 12, color: '#B85050', margin: 0, padding: '6px 10px', borderRadius: 8, backgroundColor: 'rgba(255,59,48,0.06)' }}>
                          Failed to delete account. Please try again or contact support.
                        </p>
                      )}
                      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          onClick={() => setShowDeleteAccount(false)}
                          disabled={deleteStatus === 'loading'}
                          style={{
                            padding: '8px 16px', fontSize: 13, fontWeight: 500, borderRadius: 8,
                            border: '1px solid rgba(0,0,0,0.12)', backgroundColor: 'transparent', color: '#636366',
                            cursor: 'pointer', fontFamily: 'inherit', transition: 'all 200ms',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.03)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={deleteConfirmText !== 'I want to delete my account permanently' || deleteStatus === 'loading'}
                          onClick={async () => {
                            setDeleteStatus('loading');
                            const { error } = await deleteOwnAccount();
                            if (error) {
                              setDeleteStatus('error');
                            } else {
                              setShowDeleteAccount(false);
                              setSession(null);
                            }
                          }}
                          style={{
                            padding: '8px 16px', fontSize: 13, fontWeight: 600, borderRadius: 8,
                            border: 'none', cursor: deleteConfirmText === 'I want to delete my account permanently' && deleteStatus !== 'loading' ? 'pointer' : 'default',
                            fontFamily: 'inherit', transition: 'all 200ms',
                            backgroundColor: deleteConfirmText === 'I want to delete my account permanently' ? '#D32F2F' : '#E0E0E0',
                            color: deleteConfirmText === 'I want to delete my account permanently' ? '#FFFFFF' : '#9E9E9E',
                            opacity: deleteStatus === 'loading' ? 0.6 : 1,
                          }}
                        >
                          {deleteStatus === 'loading' ? 'Deleting...' : 'Delete my account'}
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Bug report popover */}
              {isBugReportOpen && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 400 }} onClick={() => setIsBugReportOpen(false)} />
                  <div
                    style={{
                      position: 'absolute', bottom: '100%', left: 12, right: 12, marginBottom: 8, zIndex: 401,
                      borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column',
                      backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.09)',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                    }}
                  >
                    <div style={{ padding: '12px 12px 10px', borderBottom: '1px solid rgba(0,0,0,0.07)' }}>
                    <p style={{ fontSize: 14, fontWeight: 600, letterSpacing: '0', color: THEME.textPrimary, margin: 0 }}>Report a bug</p>
                      <p style={{ fontSize: 10, color: '#AEAEB2', margin: '2px 0 0' }}>We'll reply at wangsheila.work@gmail.com</p>
                    </div>
                    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {bugStatus === 'success' ? (
                        <div style={{ padding: '12px 0', textAlign: 'center' }}>
                          <p style={{ fontSize: 12, fontWeight: 500, color: '#34C759', margin: 0 }}>Thanks! Bug reported ✓</p>
                          <p style={{ fontSize: 10, color: THEME.textPrimary, margin: '2px 0 0' }}>We'll look into it soon.</p>
                        </div>
                      ) : (
                        <>
                          <textarea
                            value={bugText}
                            onChange={(e) => setBugText(e.target.value)}
                            placeholder="Describe what happened…"
                            rows={3}
                            style={{ width: '100%', fontSize: 12, resize: 'none', borderRadius: 8, padding: 8, outline: 'none', backgroundColor: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.09)', color: THEME.textPrimary, fontFamily: 'inherit', boxSizing: 'border-box' }}
                          />
                          {bugStatus === 'error' && (
                            <p style={{ fontSize: 10, color: '#FF453A', margin: 0 }}>Failed to send. Try again.</p>
                          )}
                          <button
                            type="button"
                            disabled={!bugText.trim() || bugStatus === 'loading'}
                            onClick={async () => {
                              if (!bugText.trim()) return;
                              setBugStatus('loading');
                              try {
                                if (supabase) {
                                  const { error } = await supabase.from('bug_reports').insert([{ user_email: session?.user.email ?? 'anonymous', description: bugText.trim() }]);
                                  if (error) throw error;
                                }
                                setBugStatus('success');
                                setTimeout(() => setIsBugReportOpen(false), 2000);
                              } catch {
                                setBugStatus('error');
                              }
                            }}
                            style={{
                              width: '100%', padding: '6px 0', fontSize: 12, fontWeight: 500, borderRadius: 8, border: 'none', cursor: 'pointer', transition: 'background-color 200ms', fontFamily: 'inherit',
                              backgroundColor: bugText.trim() ? '#8DA286' : 'rgba(0,0,0,0.06)',
                              color: bugText.trim() ? '#FFFFFF' : '#AEAEB2',
                            }}
                          >
                            {bugStatus === 'loading' ? 'Sending…' : 'Send Report'}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* Keyboard shortcuts popover */}
              {isShortcutsOpen && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 400 }} onClick={() => setIsShortcutsOpen(false)} />
                  <div
                    style={{
                      position: 'absolute', bottom: '100%', left: 12, right: 12, marginBottom: 8, zIndex: 401,
                      borderRadius: 12, padding: '8px 12px',
                      backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.09)',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.10)',
                    }}
                  >
                    <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0', color: THEME.textPrimary, margin: '0 0 8px' }}>Shortcuts</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: '#636366' }}>
                      {[['3', '3-Day view'], ['d', 'Day view'], ['w', 'Week view'], ['m', 'Month view'], ['c', 'Compare plan vs actual'], ['a', 'Show all calendars']].map(([key, label]) => (
                        <div key={key} style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                          <kbd style={{ fontFamily: 'monospace', fontSize: 10, padding: '2px 6px', borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.07)', border: '1px solid rgba(0,0,0,0.09)', color: THEME.textPrimary }}>{key}</kbd>
                          <span>{label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
        {!leftPanelOpen && (
          <button
            type="button"
            onClick={() => setLeftPanelOpen(true)}
            className="flex-shrink-0 flex items-center justify-center self-center z-10"
            style={{
              width: 18, height: 40, backgroundColor: '#FCFBF7',
              border: '1px solid rgba(0,0,0,0.09)',
              borderLeft: 'none',
              borderRadius: '0 6px 6px 0',
              color: THEME.textPrimary,
            }}
            title="Show panel"
          >
            <svg width="8" height="12" viewBox="0 0 8 12" fill="none">
              <path d="M1 1l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
        {/* Left bar — 8px, warm center line; click toggles, drag left closes / drag right opens */}
        <div
          className="flex-shrink-0 flex cursor-col-resize group"
          style={{ width: 8, cursor: 'col-resize' }}
          onClick={() => {
            if (leftBarDragJustEnded.current) {
              leftBarDragJustEnded.current = false;
              return;
            }
            setLeftPanelOpen((open) => !open);
          }}
          onMouseDown={(e) => {
            e.preventDefault();
            const startX = e.clientX;
            const onMove = (ev: MouseEvent) => {
              const dx = ev.clientX - startX;
              if (leftPanelOpen && -dx > 80) {
                setLeftPanelOpen(false);
                leftBarDragJustEnded.current = true;
                cleanup();
              } else if (!leftPanelOpen && dx > 80) {
                setLeftPanelOpen(true);
                leftBarDragJustEnded.current = true;
                cleanup();
              }
            };
            const cleanup = () => {
              window.removeEventListener('mousemove', onMove);
              window.removeEventListener('mouseup', cleanup);
            };
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', cleanup);
          }}
        >
          <div className="w-px" style={{ backgroundColor: 'rgba(0,0,0,0.09)' }} />
          <div className="flex-1 min-w-0 transition-colors" style={{ backgroundColor: 'rgba(0,0,0,0.03)' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(141,162,134,0.18)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.03)')} />
          <div className="w-0.5" style={{ backgroundColor: 'rgba(0,0,0,0.10)' }} />
          <div className="flex-1 min-w-0 transition-colors" style={{ backgroundColor: 'rgba(0,0,0,0.03)' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(141,162,134,0.18)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.03)')} />
          <div className="w-px" style={{ backgroundColor: 'rgba(0,0,0,0.09)' }} />
        </div>

        <CalendarView
          mode={mode}
          onModeChange={setViewMode}
          view={view}
          onViewChange={setView}
          selectedDate={selectedDate}
          onSelectedDateChange={setSelectedDate}
          timeBlocks={visibleTimeBlocks}
          tasks={tasks}
          categories={categories}
          tags={tags}
          containers={calendarContainers}
          containerVisibility={containerVisibility}
          focusedCategoryId={focusedCategoryId}
          focusedCalendarId={focusedCalendarId}
          onOpenAddModal={handleOpenAddModal}
          onConfirm={handleConfirmBlock}
          onSkip={skipBlock}
          onUnconfirm={handleUnconfirmBlock}
          onDeleteBlock={deleteTimeBlock}
          onDeleteTask={deleteTask}
          onDropTask={handleDropTask}
          onCreateBlock={handleCreateBlock}
          onMoveBlock={handleMoveBlock}
          onResizeBlock={handleResizeBlock}
          onMoveEvent={handleMoveEvent}
          onResizeEvent={handleResizeEvent}
          onEditEvent={handleEditEvent}
          onEditBlock={handleEditBlock}
          events={visibleEvents}
          onDeleteEvent={deleteEvent}
          onDeleteEventSeries={handleDeleteEventSeries}
          onToggleEventAttendance={handleToggleEventAttendance}
          weekStartsOnMonday={weekStartsOnMonday}
        />

        {/* Right bar — 8px, warm center line; click toggles, drag right closes / drag left opens */}
        <div
          className="flex-shrink-0 flex cursor-col-resize group"
          style={{ width: 8, cursor: 'col-resize' }}
          onClick={() => {
            if (rightBarDragJustEnded.current) {
              rightBarDragJustEnded.current = false;
              return;
            }
            setRightPanelOpen((open) => !open);
          }}
          onMouseDown={(e) => {
            e.preventDefault();
            const startX = e.clientX;
            const onMove = (ev: MouseEvent) => {
              const dx = ev.clientX - startX;
              if (rightPanelOpen && dx > 80) {
                setRightPanelOpen(false);
                rightBarDragJustEnded.current = true;
                cleanup();
              } else if (!rightPanelOpen && -dx > 80) {
                setRightPanelOpen(true);
                rightBarDragJustEnded.current = true;
                cleanup();
              }
            };
            const cleanup = () => {
              window.removeEventListener('mousemove', onMove);
              window.removeEventListener('mouseup', cleanup);
            };
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', cleanup);
          }}
        >
          <div className="w-px" style={{ backgroundColor: 'rgba(0,0,0,0.09)' }} />
          <div className="flex-1 min-w-0 transition-colors" style={{ backgroundColor: 'rgba(0,0,0,0.03)' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(141,162,134,0.18)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.03)')} />
          <div className="w-0.5" style={{ backgroundColor: 'rgba(0,0,0,0.10)' }} />
          <div className="flex-1 min-w-0 transition-colors" style={{ backgroundColor: 'rgba(0,0,0,0.03)' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(141,162,134,0.18)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.03)')} />
          <div className="w-px" style={{ backgroundColor: 'rgba(0,0,0,0.09)' }} />
        </div>
        {/* Right panel */}
        {!rightPanelOpen && (
          <button
            type="button"
            onClick={() => setRightPanelOpen(true)}
            className="flex-shrink-0 flex items-center justify-center self-center z-10"
            style={{
              width: 18, height: 40, backgroundColor: '#FCFBF7',
              border: '1px solid rgba(0,0,0,0.09)',
              borderRight: 'none',
              borderRadius: '6px 0 0 6px',
              color: THEME.textPrimary,
            }}
            title="Show tasks"
          >
            <svg width="8" height="12" viewBox="0 0 8 12" fill="none">
              <path d="M7 1L2 6l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
        {rightPanelOpen && (
            <div className="flex-shrink-0 flex flex-col min-h-0 overflow-hidden" style={{ width: '260px', backgroundColor: '#FCFBF7' }}>
            <div className="flex items-center px-4 py-2.5 flex-shrink-0" style={{ borderBottom: '1px solid rgba(0,0,0,0.09)' }}>
              <span className="text-base font-semibold" style={{ color: THEME.textPrimary }}>Tasks</span>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              <RightSidebar
                tasks={displayTasks}
                unscheduledTasks={unscheduledDisplay}
                partiallyCompletedTasks={partiallyCompletedDisplay}
                fixedMissedTasks={fixedMissedDisplay}
                doneTasks={doneDisplay}
                selectedDate={selectedDate}
                timeBlocks={timeBlocks}
                categories={categories}
                tags={tags}
                onAddTask={handleAddTask}
                onOpenScheduleTask={handleOpenScheduleTask}
                onEditTask={handleEditTask}
                onDeleteTask={deleteTask}
                onMarkTaskDone={handleMarkTaskDone}
                onOpenAddModal={handleOpenAddModal}
                onDropBlock={mode === 'overall' ? deleteTimeBlock : undefined}
                onBreakIntoChunks={handleBreakIntoChunks}
                onSplitTask={handleSplitTask}
                onTogglePin={(taskId) => {
                  const current = tasks.find((t) => t.id === taskId)?.priority;
                  // Cycle: none → 1 → 2 → 3 → 4 → 5 → none
                  const next = current == null ? 1 : current >= 5 ? undefined : current + 1;
                  updateTask(taskId, { priority: next });
                }}
                onRescheduleLater={handleRescheduleLater}
                onAutoSchedule={handleAutoSchedule}
                events={events}
                onDeleteEvent={deleteEvent}
                weekStartsOnMonday={weekStartsOnMonday}
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex lg:hidden flex-1 overflow-hidden relative">
        <CalendarView
          mode={mode}
          onModeChange={setViewMode}
          view={view}
          onViewChange={setView}
          selectedDate={selectedDate}
          onSelectedDateChange={setSelectedDate}
          timeBlocks={visibleTimeBlocks}
          tasks={tasks}
          categories={categories}
          tags={tags}
          containers={calendarContainers}
          containerVisibility={containerVisibility}
          isMobile
          onOpenAddModal={handleOpenAddModal}
          onConfirm={handleConfirmBlock}
          onSkip={skipBlock}
          onUnconfirm={handleUnconfirmBlock}
          onDeleteBlock={deleteTimeBlock}
          onDeleteTask={deleteTask}
          onDropTask={handleDropTask}
          onCreateBlock={handleCreateBlock}
          onMoveBlock={handleMoveBlock}
          onResizeBlock={handleResizeBlock}
          onMoveEvent={handleMoveEvent}
          onResizeEvent={handleResizeEvent}
          onEditEvent={handleEditEvent}
          onEditBlock={handleEditBlock}
          events={visibleEvents}
          onDeleteEvent={deleteEvent}
          onDeleteEventSeries={handleDeleteEventSeries}
          onToggleEventAttendance={handleToggleEventAttendance}
          weekStartsOnMonday={weekStartsOnMonday}
        />
        <DraggableBottomSheet
          tasks={displayTasks}
          unscheduledTasks={unscheduledDisplay}
          partiallyCompletedTasks={partiallyCompletedDisplay}
          fixedMissedTasks={fixedMissedDisplay}
          doneTasks={doneDisplay}
          selectedDate={selectedDate}
          timeBlocks={timeBlocks}
          categories={categories}
          tags={tags}
          onAddTask={handleAddTask}
          onOpenScheduleTask={handleOpenScheduleTask}
          onEditTask={handleEditTask}
          onDeleteTask={deleteTask}
          onMarkTaskDone={handleMarkTaskDone}
          onOpenAddModal={handleOpenAddModal}
          onDropBlock={mode === 'overall' ? deleteTimeBlock : undefined}
          onBreakIntoChunks={handleBreakIntoChunks}
          onSplitTask={handleSplitTask}
          onTogglePin={(taskId) => {
            const current = tasks.find((t) => t.id === taskId)?.priority;
            // Cycle: none → 1 → 2 → 3 → 4 → 5 → none
            const next = current == null ? 1 : current >= 5 ? undefined : current + 1;
            updateTask(taskId, { priority: next });
          }}
          onRescheduleLater={handleRescheduleLater}
          onAutoSchedule={handleAutoSchedule}
        />
      </div>

      <ScheduleTaskModal
        isOpen={!!schedulingTaskId}
        taskTitle={schedulingTask?.title}
        defaultDate={selectedDate}
        defaultStartTime="09:00"
        defaultBlockMinutes={defaultBlockMinutes}
        onSchedule={handleScheduleSubmit}
        onClose={() => setSchedulingTaskId(null)}
      />

      {/* Recurrence edit scope picker — shown before AddModal for recurring events */}
      {recurrenceEditScopePending && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center">
          <div
            className="absolute inset-0"
            style={{ backgroundColor: 'rgba(0,0,0,0.25)' }}
            onClick={() => setRecurrenceEditScopePending(null)}
          />
          <div className="relative rounded-2xl shadow-2xl p-6 max-w-xs w-full mx-4" style={{ backgroundColor: '#FFFFFF' }}>
            <h3 className="font-semibold text-sm mb-0.5" style={{ color: THEME.textPrimary }}>Edit recurring event</h3>
            <p className="text-xs mb-4" style={{ color: '#636366' }}>Which events do you want to change?</p>
            <div className="flex flex-col gap-2">
              {([
                { scope: 'this' as const, label: 'This event', desc: 'Only edit this occurrence' },
                { scope: 'all_after' as const, label: 'This and all after', desc: 'Edit from this date forward' },
                { scope: 'all' as const, label: 'All events', desc: 'Edit every event in the series' },
              ]).map(({ scope, label, desc }) => (
                <button
                  key={scope}
                  type="button"
                  className="text-left px-4 py-3 rounded-xl transition-all"
                  style={{ border: '1.5px solid rgba(0,0,0,0.10)', color: THEME.textPrimary, backgroundColor: 'transparent' }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(141,162,134,0.08)'; e.currentTarget.style.borderColor = '#8DA286'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.borderColor = 'rgba(0,0,0,0.10)'; }}
                  onClick={() => {
                    const eventId = recurrenceEditScopePending;
                    setRecurrenceEditScopePending(null);
                    setPendingRecurrenceEditScope(scope);
                    setEditingTaskId(null);
                    setEditingTimeBlockId(null);
                    setEditingEventId(eventId);
                    setIsDraftTimeBlock(false);
                    setAddModalMode('event');
                    setIsAddModalOpen(true);
                  }}
                >
                  <div className="text-sm font-medium">{label}</div>
                  <div className="text-xs mt-0.5" style={{ color: '#636366' }}>{desc}</div>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="mt-3 w-full py-2 text-xs font-medium rounded-xl transition-colors"
              style={{ color: '#636366', backgroundColor: 'rgba(0,0,0,0.04)' }}
              onClick={() => setRecurrenceEditScopePending(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <AddModal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setEditingTaskId(null);
          // If a draft time block still exists (user cancelled without submitting), discard it.
          // Note: if the user submitted, the draft was already converted to an event
          // (and isDraftTimeBlock was set to false), so this won't fire.
          if (isDraftTimeBlock && editingTimeBlockId) {
            const b = timeBlocks.find((tb) => tb.id === editingTimeBlockId);
            if (b && !b.title?.trim()) {
              deleteTimeBlock(editingTimeBlockId);
            }
          }
          setEditingTimeBlockId(null);
          setEditingEventId(null);
          setIsDraftTimeBlock(false);
          setPendingRecurrenceEditScope('this');
          setAddModalInitialDate(null);
          setAddModalInitialStart(null);
          setAddModalInitialEnd(null);
        }}
        categories={categories}
        tags={tags}
        calendarContainers={calendarContainers}
        initialMode={addModalMode}
        editingTask={editingTask}
        editingTimeBlock={editingTimeBlock}
        editingEvent={editingEvent}
        initialRecurrenceEditScope={pendingRecurrenceEditScope}
        initialDate={addModalInitialDate}
        initialStartTime={addModalInitialStart}
        initialEndTime={addModalInitialEnd}
        onAddTask={handleAddTask}
        onUpdateTask={(id, updates) => {
          updateTask(id, updates);
          // Propagate category/tags/calendar changes to all linked time blocks
          const blockUpdates: Partial<import('./types').TimeBlock> = {};
          if (updates.categoryId) blockUpdates.categoryId = updates.categoryId;
          if (updates.tagIds) blockUpdates.tagIds = updates.tagIds;
          if (updates.calendarContainerId) blockUpdates.calendarContainerId = updates.calendarContainerId;
          if (Object.keys(blockUpdates).length > 0) {
            timeBlocks
              .filter((b) => b.taskId === id)
              .forEach((b) => updateTimeBlock(b.id, blockUpdates));
          }
        }}
        onUpdateEvent={(id, updates) => {
          const { recurrenceEditScope, ...eventUpdates } = updates as typeof updates & { recurrenceEditScope?: 'this' | 'all' | 'all_after' };
          const event = events.find((e) => e.id === id);
          if (recurrenceEditScope === 'all' && event?.recurrenceSeriesId) {
            const { date: _date, ...sharedUpdates } = eventUpdates as typeof eventUpdates & { date?: string };
            updateEvents(
              events
                .filter((e) => e.recurrenceSeriesId === event.recurrenceSeriesId)
                .map((e) => ({ id: e.id, changes: sharedUpdates }))
            );
          } else if (recurrenceEditScope === 'all_after' && event?.recurrenceSeriesId) {
            const { date: _date, ...sharedUpdates } = eventUpdates as typeof eventUpdates & { date?: string };
            updateEvents(
              events
                .filter((e) => e.recurrenceSeriesId === event.recurrenceSeriesId && e.date >= event.date)
                .map((e) => ({ id: e.id, changes: sharedUpdates }))
            );
          } else {
            // Check if a singular event is becoming recurring
            const eu = eventUpdates as typeof eventUpdates & { recurring?: boolean; recurrencePattern?: import('./types').RecurrencePattern; recurrenceDays?: number[] };
            const isBecomingRecurring = eu.recurring && eu.recurrencePattern && eu.recurrencePattern !== 'none' && !event?.recurrenceSeriesId;
            if (isBecomingRecurring && event) {
              const seriesId = crypto.randomUUID();
              const eventDate = (eventUpdates as any).date ?? event.date;
              const dates = generateRecurrenceDates(eventDate, eu.recurrencePattern!, eu.recurrenceDays);
              // Update the original event with series ID
              updateEvent(id, { ...eventUpdates, recurrenceSeriesId: seriesId });
              // Add new events for the remaining dates
              const { id: _id, ...baseWithoutId } = { ...event, ...eventUpdates, recurrenceSeriesId: seriesId };
              addEvents(dates.filter((d) => d !== eventDate).map((date) => ({ ...baseWithoutId, date })));
            } else {
              updateEvent(id, eventUpdates);
            }
          }
        }}
        onUpdateTimeBlock={(id, updates) => {
          // If this is a draft block being finalized in event mode,
          // convert it to a proper Event and remove the draft timeBlock
          // in a SINGLE atomic state change so the persistence layer
          // never sees an intermediate state with events: [].
          if (isDraftTimeBlock && id === editingTimeBlockId) {
            const block = timeBlocks.find((b) => b.id === id);
            if (block) {
              const u = updates as typeof updates & { recurring?: boolean; recurrencePattern?: import('./types').RecurrencePattern; recurrenceDays?: number[] };
              const isRecurring = u.recurring && u.recurrencePattern && u.recurrencePattern !== 'none';
              const eventDate = updates.date ?? block.date;
              const eventBase = {
                title: updates.title ?? block.title ?? '',
                calendarContainerId: updates.calendarContainerId ?? block.calendarContainerId,
                categoryId: updates.categoryId ?? block.categoryId,
                start: updates.start ?? block.start,
                end: updates.end ?? block.end,
                date: eventDate,
                recurring: u.recurring ?? false,
                recurrencePattern: u.recurrencePattern,
                recurrenceDays: u.recurrenceDays,
                link: updates.link ?? block.link ?? undefined,
                description: updates.description ?? block.description ?? undefined,
                // Preserve source so actual-panel events stay out of plan panel
                source: block.source === 'unplanned' ? ('unplanned' as const) : undefined,
              };
              if (isRecurring) {
                const seriesId = crypto.randomUUID();
                const dates = generateRecurrenceDates(eventDate, u.recurrencePattern!, u.recurrenceDays);
                deleteTimeBlock(id);
                addEvents(dates.map((date) => ({ ...eventBase, date, recurrenceSeriesId: seriesId })));
              } else {
                convertTimeBlockToEvent(id, { ...eventBase, recurrenceSeriesId: null });
              }
              setEditingTimeBlockId(null);
              setIsDraftTimeBlock(false);
              return;
            }
          }
          updateTimeBlock(id, updates);
        }}
        onAddEvent={handleAddEvent}
        onRequireCalendar={() => setIsSettingsOpen(true)}
        onAddCategory={addCategory}
        onAddTag={addTag}
      />

      {/* Recording overlap warning dialog */}
      {
        recordingOverlapWarning && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.35)' }}>
            <div className="rounded-2xl shadow-2xl p-6 max-w-sm mx-4" style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.09)' }}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: 'rgba(200,120,104,0.12)' }}>
                  <svg className="w-5 h-5" style={{ color: '#C87868' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                </div>
                <h3 className="text-sm font-semibold" style={{ color: THEME.textPrimary }}>Overlapping Recording</h3>
              </div>
              <p className="text-sm mb-4 leading-relaxed" style={{ color: '#636366' }}>{recordingOverlapWarning}</p>
              <button
                type="button"
                className="w-full py-2 px-4 text-sm font-medium rounded-xl transition-colors"
                style={{ backgroundColor: '#8DA286', color: '#FFFFFF' }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#7A9278')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#8DA286')}
                onClick={() => setRecordingOverlapWarning(null)}
              >
                Got it
              </button>
            </div>
          </div>
        )
      }

      <SettingsPanel
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        calendarContainers={calendarContainers}
        categories={categories}
        tags={tags}
        onAddCalendar={addCalendarContainer}
        onUpdateCalendar={updateCalendarContainer}
        onDeleteCalendar={deleteCalendarContainer}
        onAddCategory={addCategory}
        onUpdateCategory={updateCategory}
        onDeleteCategory={deleteCategory}
        onAddTag={addTag}
        onUpdateTag={updateTag}
        onDeleteTag={deleteTag}
        weekStartsOnMonday={weekStartsOnMonday}
        onWeekStartsOnMondayChange={setWeekStartsOnMonday}
        wakeTime={wakeTime}
        sleepTime={sleepTime}
        onWakeTimeChange={setWakeTime}
        onSleepTimeChange={setSleepTime}
      />

      {/* ── Onboarding tour overlay (first-time users after wizard) ── */}
      {showTour && !onboardingTourComplete && (
        <OnboardingTour
          onComplete={() => {
            setOnboardingTourComplete(true);
            setShowTour(false);
          }}
        />
      )}

      {/* ── One-time migration modal for existing users (pre-onboarding) ── */}
      {!hasCompletedSetup && session && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9990,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 16px',
            backgroundColor: 'rgba(0,0,0,0.35)',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 420,
              borderRadius: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              padding: 24,
              backgroundColor: '#FFFFFF',
              boxShadow: '0 16px 48px rgba(0,0,0,0.18)',
              border: '1px solid rgba(0,0,0,0.08)',
              fontFamily: 'system-ui, -apple-system, sans-serif',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: THEME.textPrimary, margin: 0 }}>
                Templates are here
              </h2>
              <p style={{ fontSize: 13, lineHeight: 1.6, color: '#636366', margin: 0 }}>
                We added a starter template with calendars and categories for personal, growth,
                school, and relationships. Want to add it to your existing setup? Your current
                data won't be changed.
              </p>
            </div>

            {/* Template preview strip */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 12,
                padding: '10px 14px',
                borderRadius: 12,
                backgroundColor: '#F7F6F2',
              }}
            >
              {[
                { name: 'Personal', color: '#5B718C' },
                { name: 'Growth', color: '#8DA387' },
                { name: 'School', color: '#B3B46D' },
                { name: 'Relationships', color: '#DE8D91' },
              ].map((cal) => (
                <div key={cal.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: cal.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: '#636366' }}>{cal.name}</span>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={() => { mergeTemplate(); setHasCompletedSetup(true); void persistOnboardingToSupabase(true); }}
                style={{
                  width: '100%',
                  padding: '10px 0',
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 200ms',
                  backgroundColor: '#4A6741',
                  color: '#FFFFFF',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.12), 0 4px 12px rgba(74,103,65,0.25)',
                  fontFamily: 'inherit',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#3D5736';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#4A6741';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                Add template to my setup
              </button>
              <button
                onClick={() => { setHasCompletedSetup(true); void persistOnboardingToSupabase(true); }}
                style={{
                  width: '100%',
                  padding: '8px 0',
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 500,
                  border: '1px solid rgba(0,0,0,0.10)',
                  backgroundColor: 'transparent',
                  color: '#636366',
                  cursor: 'pointer',
                  transition: 'all 200ms',
                  fontFamily: 'inherit',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.03)';
                  e.currentTarget.style.color = THEME.textPrimary;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = '#636366';
                }}
              >
                No thanks, keep my current setup
              </button>
            </div>
          </div>
        </div>
      )}

    </div >
  );
}
