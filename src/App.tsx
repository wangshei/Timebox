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
import { getLocalDateString } from './utils/dateTime';
import type { Category, Tag, Mode as StoreMode } from './types';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import { loadSupabaseState, startSupabasePersistence } from './supabasePersistence';

// Re-export for components that still import from App
export type Mode = StoreMode;
export type View = 'day' | '3day' | 'week' | 'month';
export type { Category, Tag };
export interface Task {
  id: string;
  title: string;
  estimatedHours: number;
  recordedHours: number;
  category: Category;
  tags: Tag[];
  calendar: 'personal' | 'work' | 'school';
  dueDate?: string | null;
  link?: string | null;
  description?: string | null;
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
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTimeBlockId, setEditingTimeBlockId] = useState<string | null>(null);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [isDraftTimeBlock, setIsDraftTimeBlock] = useState(false);
  const [schedulingTaskId, setSchedulingTaskId] = useState<string | null>(null);
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const leftBarDragJustEnded = useRef(false);
  const rightBarDragJustEnded = useRef(false);
  const [focusedCategoryId, setFocusedCategoryId] = useState<string | null>(null);
  const [focusedCalendarId, setFocusedCalendarId] = useState<string | null>(null);
  const [recordingOverlapWarning, setRecordingOverlapWarning] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [authErrorFromUrl, setAuthErrorFromUrl] = useState<string | null>(null);
  const [visitMode, setVisitMode] = useState(false);
  const [dataReady, setDataReady] = useState(false);

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
    setCalendarContainers,
    setCategories,
    setTags,
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

  const planVsActualByCategory = useMemo(
    () =>
      selectPlanVsActualByCategory(timeBlocks, selectedDate, categories),
    [timeBlocks, selectedDate, categories]
  );
  const planVsActualByContainer = useMemo(
    () =>
      selectPlanVsActualByContainer(timeBlocks, selectedDate, calendarContainers),
    [timeBlocks, selectedDate, calendarContainers]
  );
  const planVsActualByTag = useMemo(
    () => selectPlanVsActualByTag(timeBlocks, selectedDate, tags),
    [timeBlocks, selectedDate, tags]
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
        unscheduledTasks.some((u) => u.id === t.id)
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
    const plannedBlocks = timeBlocks.filter(
      (b) => b.taskId === taskId && b.mode === 'planned'
    );
    plannedBlocks.forEach((b) => markDoneAsPlanned(b.id));
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
  }) => {
    addTask({
      title: taskData.title,
      estimatedMinutes: taskData.estimatedHours * 60,
      calendarContainerId: taskData.calendar,
      categoryId: taskData.category.id,
      tagIds: taskData.tags.map((t) => t.id),
      flexible: true,
      dueDate: taskData.dueDate ?? undefined,
      link: taskData.link ?? undefined,
      description: taskData.description ?? undefined,
    });
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
    };
    // If we were editing a draft timeBlock (from drag-to-create),
    // atomically convert it to an event in a single state change.
    if (isDraftTimeBlock && editingTimeBlockId) {
      convertTimeBlockToEvent(editingTimeBlockId, eventPayload);
      setEditingTimeBlockId(null);
      setIsDraftTimeBlock(false);
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
    setEditingTaskId(null);
    setEditingTimeBlockId(null);
    setEditingEventId(id);
    setIsDraftTimeBlock(false);
    setAddModalMode('event');
    setIsAddModalOpen(true);
  };

  const handleEditBlock = (blockId: string) => {
    setEditingTaskId(null);
    setEditingTimeBlockId(blockId);
    setEditingEventId(null);
    setIsDraftTimeBlock(false);
    setAddModalMode('event');
    setIsAddModalOpen(true);
  };

  const editingTask = editingTaskId ? tasks.find((t) => t.id === editingTaskId) ?? null : null;
  const editingTimeBlock = editingTimeBlockId ? timeBlocks.find((b) => b.id === editingTimeBlockId) ?? null : null;
  const editingEvent = editingEventId ? events.find((e) => e.id === editingEventId) ?? null : null;
  const schedulingTask = schedulingTaskId ? tasks.find((t) => t.id === schedulingTaskId) ?? null : null;

  const handleOpenScheduleTask = (taskId: string) => {
    setSchedulingTaskId(taskId);
  };

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
    const planned = timeBlocks
      .filter((b) => b.taskId === taskId && b.mode === 'planned')
      .reduce((s, b) => s + (parseTimeToMinsLocal(b.end) - parseTimeToMinsLocal(b.start)), 0);
    const recorded = timeBlocks
      .filter((b) => b.taskId === taskId && b.mode === 'recorded')
      .reduce((s, b) => s + (parseTimeToMinsLocal(b.end) - parseTimeToMinsLocal(b.start)), 0);
    const remaining = Math.max(0, task.estimatedMinutes - planned - recorded);
    if (remaining <= 0) return;

    const requested =
      params.blockMinutes > 0 && Number.isFinite(params.blockMinutes)
        ? params.blockMinutes
        : task.estimatedMinutes;
    const duration = Math.max(15, Math.min(remaining, Math.round(requested / 15) * 15));
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

  const handleCreateBlock = (params: { date: string; startTime: string; endTime: string }) => {
    let containerId = calendarContainers[0]?.id;
    if (!containerId) {
      // Should not normally happen, but create a default calendar as a fallback.
      addCalendarContainer({ name: 'Personal', color: '#0044A8' });
      containerId = useStore.getState().calendarContainers[0]?.id;
      if (!containerId) return undefined;
    }
    let categoryId = categories[0]?.id;
    if (!categoryId) {
      // No categories exist — create a default one so drag-to-create works.
      const newCat = addCategory({ name: 'General', color: '#6b7280', calendarContainerId: containerId });
      categoryId = newCat.id;
    }
    if (!categoryId) return undefined;
    const todayStr = getLocalDateString();
    const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
    const [eh, em] = params.endTime.split(':').map(Number);
    const endMins = (eh ?? 0) * 60 + (em ?? 0);
    const isPastSlot = params.date < todayStr || (params.date === todayStr && endMins <= nowMins);
    const blockMode = isPastSlot ? 'recorded' : 'planned';
    if (blockMode === 'recorded' && checkRecordingOverlap(params.date, params.startTime, params.endTime)) {
      return undefined;
    }
    const id = addTimeBlock({
      title: '',
      calendarContainerId: containerId,
      categoryId,
      tagIds: [],
      start: params.startTime,
      end: params.endTime,
      date: params.date,
      mode: blockMode,
      source: 'manual',
    });
    // Immediately open the Add Event popup to fill in details; delete draft on cancel.
    setEditingTaskId(null);
    setEditingTimeBlockId(id);
    setIsDraftTimeBlock(true);
    setAddModalMode('event');
    setIsAddModalOpen(true);
    return id;
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
    if (block.mode === 'recorded') {
      if (checkRecordingOverlap(block.date, block.start, params.endTime, blockId)) return;
    }
    updateTimeBlock(blockId, { date: params.date, end: params.endTime });
  };

  const handleMoveEvent = (eventId: string, params: { date: string; startTime: string; endTime: string }) => {
    updateEvent(eventId, { date: params.date, start: params.startTime, end: params.endTime });
  };

  const handleResizeEvent = (eventId: string, params: { date: string; endTime: string }) => {
    const event = events.find((e) => e.id === eventId);
    if (!event) return;
    updateEvent(eventId, { date: params.date, end: params.endTime });
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
      setDataReady(false);
      if (unsubscribePersistence) {
        unsubscribePersistence();
        unsubscribePersistence = undefined;
      }
      if (next) {
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

    supabase.auth.getSession().then(({ data }) => {
      void setupForSession(data.session);
      // After Supabase has had a chance to use the URL, parse auth errors (from hash or query).
      // PKCE uses query params; implicit uses hash. Only clear and show message on error.
      if (typeof window === 'undefined') return;
      const hash = window.location.hash;
      const search = window.location.search;
      const params = new URLSearchParams(hash ? hash.slice(1) : search.slice(1));
      const error = params.get('error');
      if (!error) return;
      const errorCode = params.get('error_code');
      const description = (params.get('error_description') ?? '').replace(/\+/g, ' ');
      if (error === 'access_denied' && (errorCode === 'otp_expired' || description.toLowerCase().includes('expired'))) {
        setAuthErrorFromUrl('That sign-in link has expired or was already used. Request a new one below.');
      } else if (description.toLowerCase().includes('redirect') || description.toLowerCase().includes('url')) {
        const siteUrl = window.location.origin + window.location.pathname;
        setAuthErrorFromUrl(`Redirect URL not allowed. In Supabase: Auth → URL Configuration → add "${siteUrl}" to Redirect URLs.`);
      } else {
        setAuthErrorFromUrl(description || 'Sign-in failed. Try again.');
      }
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void setupForSession(nextSession);
      // Clear code/hash from URL after successful sign-in so tokens don't stay in the bar
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

  const getRedirectUrl = () => {
    const fromEnv = import.meta.env.VITE_SITE_URL as string | undefined;
    if (fromEnv && typeof fromEnv === 'string' && fromEnv.startsWith('http')) {
      return fromEnv.replace(/\/$/, '') + (window.location.pathname || '/');
    }
    return window.location.origin + window.location.pathname;
  };

  const handleSendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !authEmail.trim()) return;
    setAuthMessage(null);
    setAuthErrorFromUrl(null);
    const redirectTo = getRedirectUrl();
    const { error } = await supabase.auth.signInWithOtp({
      email: authEmail.trim(),
      options: {
        emailRedirectTo: redirectTo,
      },
    });
    if (error) {
      setAuthMessage(error.message);
    } else {
      setAuthMessage('Check your email for a magic link.');
    }
  };

  // Auth gate: require sign-in only in production. In dev you get visit mode by default; sign in once to test backend (session persists).
  const requireAuth = !!supabase && import.meta.env.PROD;

  if (requireAuth && session && !dataReady) {
    return (
      <div className="h-screen w-full flex items-center justify-center" style={{ backgroundColor: '#F8F8F6' }}>
        <div className="text-sm" style={{ color: '#636366' }}>Loading your data...</div>
      </div>
    );
  }

  if (requireAuth && !session && !visitMode) {
    return (
      <div className="h-screen w-full flex items-center justify-center px-4 py-8" style={{ backgroundColor: '#F8F8F6' }}>
        <div className="w-full max-w-xs rounded-lg">
          <div className="rounded-2xl shadow-xl flex flex-col px-5 py-4 h-fit" style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.09)' }}>
            <div className="pt-5 pb-3 px-4" style={{ borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
              <div className="flex items-center gap-2 mb-0.5">
                <CalendarIcon className="h-5 w-5" style={{ color: '#4A80F0' }} />
                <h1 className="text-base font-semibold" style={{ color: '#1C1C1E' }}>Timebox</h1>
              </div>
              <p className="text-xs" style={{ color: '#8E8E93' }}>Sign in to sync your tasks and calendar</p>
            </div>

            <div className="py-4 px-4">
              {!supabase && (
                <div className="mb-3 text-xs px-2.5 py-1.5 rounded-lg" style={{ color: '#B85050', backgroundColor: 'rgba(184,80,80,0.08)', border: '1px solid rgba(184,80,80,0.2)' }}>
                  Backend not configured. Set <code className="font-mono">VITE_SUPABASE_URL</code> and <code className="font-mono">VITE_SUPABASE_ANON_KEY</code>.
                </div>
              )}

              {authErrorFromUrl && (
                <div className="mb-3 text-xs px-2.5 py-1.5 rounded-lg" style={{ color: '#7A5C30', backgroundColor: 'rgba(196,154,80,0.1)', border: '1px solid rgba(196,154,80,0.25)' }}>
                  {authErrorFromUrl}
                  {typeof window !== 'undefined' && (
                    <p className="mt-2" style={{ color: '#636366' }}>
                      In Supabase: Auth → URL Configuration set <strong>Site URL</strong> to your app (e.g. <code className="font-mono break-all">{window.location.origin}</code>) and add it to <strong>Redirect URLs</strong>.
                    </p>
                  )}
                </div>
              )}

              <form onSubmit={handleSendMagicLink} className="space-y-3">
                <div>
                  <label htmlFor="auth-email" className="block text-xs font-medium mb-1" style={{ color: '#636366' }}>
                    Email address
                  </label>
                  <input
                    id="auth-email"
                    type="email"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    placeholder="you@example.com"
                    disabled={!supabase}
                    className="w-full px-3 py-1.5 text-sm rounded-lg focus:outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ color: '#1C1C1E', backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.12)' }}
                    autoFocus
                  />
                </div>
                <button
                  type="submit"
                  disabled={!supabase}
                  className="w-full py-1.5 rounded-lg text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ backgroundColor: '#4A80F0' }}
                >
                  Send magic link
                </button>
                {authMessage && (
                  <p className="text-xs text-center pt-0.5" style={{ color: '#8E8E93' }}>{authMessage}</p>
                )}
              </form>

              <div className="relative my-3">
                <div className="absolute inset-0 flex items-center"><div className="w-full" style={{ borderTop: '1px solid rgba(0,0,0,0.09)' }} /></div>
                <div className="relative flex justify-center py-3"><span className="px-2 text-xs uppercase tracking-wide" style={{ backgroundColor: '#FFFFFF', color: '#B0A090' }}>or</span></div>
              </div>

              <button
                type="button"
                onClick={() => setVisitMode(true)}
                className="w-full py-1.5 rounded-lg text-sm font-medium transition-colors"
                style={{ border: '1px solid rgba(0,0,0,0.12)', color: '#636366', backgroundColor: 'transparent' }}
              >
                Try without signing in
              </button>
            </div>

            <p className="text-xs text-center leading-relaxed" style={{ color: '#B0A090' }}>
              Sign in to save across sessions. Visit mode resets on refresh.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full flex flex-col overflow-hidden" style={{ backgroundColor: '#F8F8F6' }}>
      {/* Visit-mode warning banner */}
      {visitMode && !session && (
        <div className="w-full border-b border-amber-300 bg-amber-50 px-4 py-1.5 flex items-center justify-between text-xs">
          <span className="text-amber-800 font-medium">
            Visit Mode — nothing will be saved. Sign in to keep your data.
          </span>
          <button
            type="button"
            onClick={() => setVisitMode(false)}
            className="px-2 py-1 rounded border border-amber-300 text-amber-800 font-medium hover:bg-amber-100 transition-colors"
          >
            Sign in
          </button>
        </div>
      )}

      {/* Supabase auth bar */}
      {session && (
        <div className="w-full px-4 py-1.5 flex items-center justify-end gap-3 text-xs" style={{ borderBottom: '1px solid rgba(0,0,0,0.08)', backgroundColor: '#EFEFE9' }}>
          <span style={{ color: '#8E8E93' }}>
            Signed in as <span className="font-medium" style={{ color: '#1C1C1E' }}>{session.user.email}</span>
            <span className="ml-1.5" style={{ color: '#B0A090' }}>· synced</span>
          </span>
          <button
            type="button"
            onClick={() => supabase?.auth.signOut()}
            className="px-2 py-1 rounded-lg transition-colors"
            style={{ border: '1px solid rgba(0,0,0,0.09)', color: '#636366' }}
          >
            Sign out
          </button>
        </div>
      )}

      <div className="hidden lg:flex flex-1 min-h-0 overflow-hidden">
        {/* Left panel + unified bar (bar always visible; click or drag to open/close) */}
        {leftPanelOpen && (
          <div className="flex-shrink-0 flex flex-col overflow-hidden" style={{ width: '260px', backgroundColor: '#EFEFE9' }}>
            {/* Header: Organization heading + settings + edit */}
            <div className="flex items-center justify-between gap-2 px-3 py-2 flex-shrink-0" style={{ borderBottom: '1px solid rgba(0,0,0,0.09)' }}>
              <h2 className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: '#8E8E93', letterSpacing: '0.12em' }}>
                My Calendars
              </h2>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(true)}
                  className="p-1.5 rounded-lg transition-colors"
                  style={{ color: '#8E8E93' }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.08)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  title="Settings"
                  aria-label="Open settings"
                >
                  <Cog6ToothIcon className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditMode(!isEditMode)}
                  className="p-1.5 rounded-lg transition-colors"
                  style={{
                    color: isEditMode ? '#4A80F0' : '#8E8E93',
                    backgroundColor: isEditMode ? 'rgba(74,128,240,0.08)' : 'transparent',
                  }}
                  onMouseEnter={(e) => {
                    if (!isEditMode) e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.08)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isEditMode) e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                  title={isEditMode ? 'Done editing' : 'Edit organization'}
                >
                  {isEditMode ? <CheckIcon className="h-3.5 w-3.5" /> : <PencilIcon className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
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
                endDayLabel={`End day (${selectedDate})`}
                onEndDay={() => endDay(selectedDate)}
                planVsActualSection={mode === 'compare' ? (
                  <div className="px-4 pb-6 pt-3">
                    <p className="text-[10px] mb-2.5 pl-0.5 font-medium" style={{ color: '#8E8E93' }}>
                      {view === 'week'
                        ? `Week of ${selectedDate}`
                        : view === 'month'
                          ? new Date(selectedDate).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                          : selectedDate}
                    </p>
                    <div className="mb-3 flex rounded-xl p-0.5" style={{ backgroundColor: 'rgba(0,0,0,0.07)' }}>
                      {(['category', 'container', 'tag'] as const).map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setPlanVsActualView(v)}
                          className="flex-1 py-1.5 px-2 text-xs font-medium rounded-lg transition-all capitalize"
                          style={{
                            backgroundColor: planVsActualView === v ? '#FFFFFF' : 'transparent',
                            color: planVsActualView === v ? '#1C1C1E' : '#636366',
                            boxShadow: planVsActualView === v ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                          }}
                        >
                          {v === 'container' ? 'Calendar' : v.charAt(0).toUpperCase() + v.slice(1)}
                        </button>
                      ))}
                    </div>
                    {planVsActual.length > 0 ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-x-2 text-[9px] font-semibold uppercase tracking-widest mb-1 px-0.5" style={{ color: '#B0A090' }}>
                          <span>Planned</span>
                          <span className="text-right">Recorded</span>
                        </div>
                        {planVsActual.map((row) => {
                          const totalP = planVsActual.reduce((s, r) => s + r.plannedHours, 0);
                          const totalR = planVsActual.reduce((s, r) => s + r.recordedHours, 0);
                          const maxH = Math.max(totalP, totalR, 1);
                          const pctP = (row.plannedHours / maxH) * 100;
                          const pctR = (row.recordedHours / maxH) * 100;
                          return (
                            <div key={row.id} className="space-y-1.5">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: row.color }} />
                                <span className="text-xs truncate font-medium" style={{ color: '#3C3430' }}>{row.name}</span>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-0.5">
                                  <div className="rounded-full h-2 overflow-hidden" style={{ backgroundColor: 'rgba(0,0,0,0.08)' }}>
                                    <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, pctP)}%`, backgroundColor: 'rgba(74,128,240,0.35)' }} />
                                  </div>
                                  <span className="text-[10px]" style={{ color: '#8E8E93' }}>{row.plannedHours.toFixed(1)}h</span>
                                </div>
                                <div className="space-y-0.5 text-right">
                                  <div className="rounded-full h-2 overflow-hidden" style={{ backgroundColor: 'rgba(0,0,0,0.08)' }}>
                                    <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, pctR)}%`, backgroundColor: row.color, opacity: 0.9 }} />
                                  </div>
                                  <span className="text-[10px]" style={{ color: '#8E8E93' }}>{row.recordedHours.toFixed(1)}h</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        <div className="pt-3 mt-2 text-xs font-semibold" style={{ borderTop: '1px solid rgba(0,0,0,0.09)', color: '#3C3430' }}>
                          {planVsActual.reduce((s, r) => s + r.plannedHours, 0).toFixed(1)}h planned ·{' '}
                          {planVsActual.reduce((s, r) => s + r.recordedHours, 0).toFixed(1)}h done
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm text-center py-8" style={{ color: '#B0A090' }}>
                        No time planned or recorded
                      </div>
                    )}
                  </div>
                ) : undefined}
                canEditOrganization={true}
                isShortcutsOpen={isShortcutsOpen}
                onToggleShortcuts={() => setIsShortcutsOpen((o) => !o)}
                isEditMode={isEditMode}
              />
            </div>
          </div>
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
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(74,128,240,0.15)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.03)')} />
          <div className="w-0.5" style={{ backgroundColor: 'rgba(0,0,0,0.10)' }} />
          <div className="flex-1 min-w-0 transition-colors" style={{ backgroundColor: 'rgba(0,0,0,0.03)' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(74,128,240,0.15)')}
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
          onConfirm={markDoneAsPlanned}
          onUnconfirm={(id) => updateTimeBlock(id, { mode: 'planned' })}
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
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(74,128,240,0.15)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.03)')} />
          <div className="w-0.5" style={{ backgroundColor: 'rgba(0,0,0,0.10)' }} />
          <div className="flex-1 min-w-0 transition-colors" style={{ backgroundColor: 'rgba(0,0,0,0.03)' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(74,128,240,0.15)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.03)')} />
          <div className="w-px" style={{ backgroundColor: 'rgba(0,0,0,0.09)' }} />
        </div>
        {/* Right panel */}
        {rightPanelOpen && (
          <div className="w-80 flex-shrink-0 flex flex-col min-h-0 overflow-hidden" style={{ backgroundColor: '#EFEFE9' }}>
            <div className="flex items-center px-4 py-2.5 flex-shrink-0" style={{ borderBottom: '1px solid rgba(0,0,0,0.09)' }}>
              <span className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: '#8E8E93', letterSpacing: '0.12em' }}>Tasks</span>
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
                onTogglePin={(taskId) => updateTask(taskId, { pinned: !tasks.find(t => t.id === taskId)?.pinned })}
                events={events}
                onDeleteEvent={deleteEvent}
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
          onConfirm={markDoneAsPlanned}
          onUnconfirm={(id) => updateTimeBlock(id, { mode: 'planned' })}
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
          onTogglePin={(taskId) => updateTask(taskId, { pinned: !tasks.find(t => t.id === taskId)?.pinned })}
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
        }}
        categories={categories}
        tags={tags}
        calendarContainers={calendarContainers}
        initialMode={addModalMode}
        editingTask={editingTask}
        editingTimeBlock={editingTimeBlock}
        editingEvent={editingEvent}
        onAddTask={handleAddTask}
        onUpdateTask={updateTask}
        onUpdateEvent={(id, updates) => {
          const { recurrenceEditScope: _scope, ...rest } = updates as typeof updates & { recurrenceEditScope?: 'this' | 'all' | 'all_after' };
          updateEvent(id, rest);
          // TODO: handle _scope 'all' / 'all_after' to update series when store supports it
        }}
        onUpdateTimeBlock={(id, updates) => {
          // If this is a draft block being finalized in event mode,
          // convert it to a proper Event and remove the draft timeBlock
          // in a SINGLE atomic state change so the persistence layer
          // never sees an intermediate state with events: [].
          if (isDraftTimeBlock && id === editingTimeBlockId) {
            const block = timeBlocks.find((b) => b.id === id);
            if (block) {
              convertTimeBlockToEvent(id, {
                title: updates.title ?? block.title ?? '',
                calendarContainerId: updates.calendarContainerId ?? block.calendarContainerId,
                categoryId: updates.categoryId ?? block.categoryId,
                start: updates.start ?? block.start,
                end: updates.end ?? block.end,
                date: updates.date ?? block.date,
                recurring: false,
                link: updates.link ?? block.link ?? undefined,
                description: updates.description ?? block.description ?? undefined,
              });
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
      {recordingOverlapWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.35)' }}>
          <div className="rounded-2xl shadow-2xl p-6 max-w-sm mx-4" style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.09)' }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: 'rgba(200,120,104,0.12)' }}>
                <svg className="w-5 h-5" style={{ color: '#C87868' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold" style={{ color: '#1C1C1E' }}>Overlapping Recording</h3>
            </div>
            <p className="text-sm mb-4 leading-relaxed" style={{ color: '#636366' }}>{recordingOverlapWarning}</p>
            <button
              type="button"
              className="w-full py-2 px-4 text-sm font-medium rounded-xl transition-colors"
              style={{ backgroundColor: '#4A80F0', color: 'white' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#4E8A9C')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#4A80F0')}
              onClick={() => setRecordingOverlapWarning(null)}
            >
              Got it
            </button>
          </div>
        </div>
      )}

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
      />

    </div>
  );
}
