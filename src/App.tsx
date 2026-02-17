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
} from './store/selectors';
import { resolveTimeBlocks } from './utils/dataResolver';
import type { Category, Tag, Mode as StoreMode } from './types';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import { loadSupabaseState, startSupabasePersistence } from './supabasePersistence';

// Re-export for components that still import from App
export type Mode = StoreMode;
export type View = 'day' | 'week' | 'month';
export type { Category, Tag };
export interface Task {
  id: string;
  title: string;
  estimatedHours: number;
  recordedHours: number;
  category: Category;
  tags: Tag[];
  calendar: 'personal' | 'work' | 'school';
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
  const partiallyCompletedDisplay = useMemo(
    () =>
      displayTasks.filter((t) =>
        partiallyCompletedTasks.some((p) => p.id === t.id)
      ),
    [displayTasks, partiallyCompletedTasks]
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

  const handleAddTask = (taskData: {
    title: string;
    estimatedHours: number;
    category: Category;
    tags: Tag[];
    calendar: 'personal' | 'work' | 'school';
  }) => {
    addTask({
      title: taskData.title,
      estimatedMinutes: taskData.estimatedHours * 60,
      calendarContainerId: taskData.calendar,
      categoryId: taskData.category.id,
      tagIds: taskData.tags.map((t) => t.id),
      flexible: true,
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
  }) => {
    const eventPayload = {
      title: eventData.title,
      calendarContainerId: eventData.calendar,
      categoryId: eventData.category.id,
      start: eventData.startTime,
      end: eventData.endTime,
      date: eventData.date,
      recurring: false,
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

  const handleOpenAddModal = (modalMode: 'task' | 'event' = 'task') => {
    setEditingTaskId(null);
    setEditingTimeBlockId(null);
    setIsDraftTimeBlock(false);
    setAddModalMode(modalMode);
    setIsAddModalOpen(true);
  };

  const handleEditTask = (id: string) => {
    setEditingTaskId(id);
    setEditingTimeBlockId(null);
    setIsDraftTimeBlock(false);
    setAddModalMode('task');
    setIsAddModalOpen(true);
  };

  const editingTask = editingTaskId ? tasks.find((t) => t.id === editingTaskId) ?? null : null;
  const editingTimeBlock = editingTimeBlockId ? timeBlocks.find((b) => b.id === editingTimeBlockId) ?? null : null;
  const schedulingTask = schedulingTaskId ? tasks.find((t) => t.id === schedulingTaskId) ?? null : null;

  const handleOpenScheduleTask = (taskId: string) => {
    setSchedulingTaskId(taskId);
  };

  const handleScheduleSubmit = (params: { date: string; startTime: string; blockMinutes?: number }) => {
    if (schedulingTaskId) {
      createPlannedBlocksFromTask(schedulingTaskId, params);
      setSchedulingTaskId(null);
    }
  };

  const handleDropTask = (
    taskId: string,
    params: { date: string; startTime: string; blockMinutes: number; splitCount?: number }
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

    // Schedule the full remaining time by default; only split if user requested.
    const total = Math.max(15, Math.round(remaining / 15) * 15);
    const count = Math.max(1, Math.min(12, params.splitCount ?? 1));
    const startMins = parseTimeToMinsLocal(params.startTime);
    const minsToTimeString = (mins: number) =>
      `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

    if (count === 1) {
      addTimeBlock({
        taskId,
        title: task.title,
        calendarContainerId: task.calendarContainerId,
        categoryId: task.categoryId,
        tagIds: task.tagIds,
        start: minsToTimeString(startMins),
        end: minsToTimeString(startMins + total),
        date: params.date,
        mode: 'planned',
        source: 'manual',
      });
      return;
    }

    const chunk = Math.max(15, Math.round((total / count) / 15) * 15);
    let cur = startMins;
    let remainingToPlace = total;
    for (let i = 0; i < count; i++) {
      const dur = i === count - 1 ? remainingToPlace : Math.min(chunk, remainingToPlace - 15 * (count - i - 1));
      addTimeBlock({
        taskId,
        title: task.title,
        calendarContainerId: task.calendarContainerId,
        categoryId: task.categoryId,
        tagIds: task.tagIds,
        start: minsToTimeString(cur),
        end: minsToTimeString(cur + dur),
        date: params.date,
        mode: 'planned',
        source: 'manual',
      });
      cur += dur;
      remainingToPlace -= dur;
    }
  };

  const checkRecordingOverlap = useCallback((date: string, startTime: string, endTime: string, excludeBlockId?: string) => {
    if (mode !== 'recording') return false;
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
  }, [mode, timeBlocks]);

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
    // Warn if recording and overlapping an existing recorded block.
    checkRecordingOverlap(params.date, params.startTime, params.endTime);
    const id = addTimeBlock({
      title: '',
      calendarContainerId: containerId,
      categoryId,
      tagIds: [],
      start: params.startTime,
      end: params.endTime,
      date: params.date,
      mode: mode === 'planning' ? 'planned' : 'recorded',
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
    // Don't allow moving untitled events; prompt user to name it first.
    if (!(block.title ?? '').trim() && !block.taskId) {
      setEditingTaskId(null);
      setEditingTimeBlockId(blockId);
      setIsDraftTimeBlock(false);
      setAddModalMode('event');
      setIsAddModalOpen(true);
      return;
    }
    const origStart = parseTimeToMins(block.start);
    const origEnd = parseTimeToMins(block.end);
    const newStart = parseTimeToMins(params.startTime);
    const newEnd = parseTimeToMins(params.endTime);
    // Warn if recording and the moved block overlaps an existing recorded block.
    if (block.mode === 'recorded') {
      checkRecordingOverlap(params.date, params.startTime, params.endTime, blockId);
    }
    updateTimeBlock(blockId, { start: params.startTime, end: params.endTime, date: params.date });
    if (origStart < newStart) {
      addTimeBlock({
        calendarContainerId: block.calendarContainerId,
        categoryId: block.categoryId,
        tagIds: block.tagIds ?? [],
        taskId: block.taskId ?? undefined,
        title: block.title,
        start: minsToTime(origStart),
        end: minsToTime(newStart),
        date: block.date,
        mode: block.mode,
        source: block.source,
      });
    }
    if (newEnd < origEnd) {
      addTimeBlock({
        calendarContainerId: block.calendarContainerId,
        categoryId: block.categoryId,
        tagIds: block.tagIds ?? [],
        taskId: block.taskId ?? undefined,
        title: block.title,
        start: minsToTime(newEnd),
        end: minsToTime(origEnd),
        date: block.date,
        mode: block.mode,
        source: block.source,
      });
    }
  };

  // Supabase auth session + persistence
  useEffect(() => {
    if (!supabase) return;
    let unsubscribePersistence: (() => void) | undefined;

    const setupForSession = async (next: Session | null) => {
      setSession(next);
      if (unsubscribePersistence) {
        unsubscribePersistence();
        unsubscribePersistence = undefined;
      }
      if (next) {
        // Start persistence subscription BEFORE loading so that the store
        // changes made by loadSupabaseState (e.g. default Personal calendar)
        // are captured and saved to Supabase.
        unsubscribePersistence = startSupabasePersistence();
        await loadSupabaseState();
      }
    };

    supabase.auth.getSession().then(({ data }) => {
      void setupForSession(data.session);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void setupForSession(nextSession);
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
      else if (key === 'w') { setView('week'); e.preventDefault(); }
      else if (key === 'm') { setView('month'); e.preventDefault(); }
      else if (key === 'p') { setViewMode('planning'); e.preventDefault(); }
      else if (key === 'r') { setViewMode('recording'); e.preventDefault(); }
      else if (key === 'a') { setAllCalendarsVisible(); e.preventDefault(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setView, setViewMode, setAllCalendarsVisible]);

  // Show friendly message when returning from Supabase with an error (e.g. expired magic link)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.slice(1));
    const error = params.get('error');
    const description = params.get('error_description');
    if (error === 'access_denied' && (params.get('error_code') === 'otp_expired' || description?.toLowerCase().includes('expired'))) {
      setAuthErrorFromUrl('That sign-in link has expired. Request a new one below.');
    } else if (error) {
      setAuthErrorFromUrl(description?.replace(/\+/g, ' ') ?? 'Sign-in failed. Try again.');
    }
    if (error && hash) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, []);

  const handleSendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !authEmail.trim()) return;
    setAuthMessage(null);
    setAuthErrorFromUrl(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: authEmail.trim(),
      options: {
        emailRedirectTo: window.location.origin + window.location.pathname,
      },
    });
    if (error) {
      setAuthMessage(error.message);
    } else {
      setAuthMessage('Check your email for a magic link.');
    }
  };

  // Auth gate — in production, always require sign-in; in dev, allow local-only mode when Supabase isn't configured
  const requireAuth = import.meta.env.PROD || !!supabase;

  if (requireAuth && !session && !visitMode) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-neutral-50 px-4 py-8">
        <div className="w-full max-w-xs">
          <div className="bg-white rounded-xl shadow-xl border border-neutral-200 flex flex-col overflow-hidden px-5 py-4 h-fit">
            <div className="px-5 pt-5 pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-2 mb-0.5">
                <CalendarIcon className="h-5 w-5 text-blue-600" />
                <h1 className="text-base font-semibold text-neutral-900">Timebox</h1>
              </div>
              <p className="text-xs text-neutral-500">Sign in to sync your tasks and calendar</p>
            </div>

            <div className="px-5 py-4">
              {!supabase && (
                <div className="mb-3 text-xs text-red-700 bg-red-50 px-2.5 py-1.5 rounded-lg border border-red-200">
                  Backend not configured. Set <code className="font-mono">VITE_SUPABASE_URL</code> and <code className="font-mono">VITE_SUPABASE_ANON_KEY</code>.
                </div>
              )}

              {authErrorFromUrl && (
                <div className="mb-3 text-xs text-amber-700 bg-amber-50 px-2.5 py-1.5 rounded-lg border border-amber-200">
                  {authErrorFromUrl}
                </div>
              )}

              <form onSubmit={handleSendMagicLink} className="space-y-3">
                <div>
                  <label htmlFor="auth-email" className="block text-xs font-medium text-neutral-700 mb-1">
                    Email address
                  </label>
                  <input
                    id="auth-email"
                    type="email"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    placeholder="you@example.com"
                    disabled={!supabase}
                    className="w-full px-2.5 py-1.5 text-sm text-neutral-800 border border-neutral-200 rounded-lg bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    autoFocus
                  />
                </div>
                <button
                  type="submit"
                  disabled={!supabase}
                  className="w-full py-1.5 rounded-lg bg-neutral-900 text-white text-sm font-medium hover:bg-neutral-800 transition-colors focus:outline-none focus:ring-2 focus:ring-neutral-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Send magic link
                </button>
                {authMessage && (
                  <p className="text-xs text-neutral-500 text-center pt-0.5">{authMessage}</p>
                )}
              </form>

              <div className="relative my-3">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-neutral-200" /></div>
                <div className="relative flex justify-center py-3"><span className="bg-white px-2 text-xs text-neutral-400 uppercase tracking-wide">or</span></div>
              </div>

              <button
                type="button"
                onClick={() => setVisitMode(true)}
                className="w-full py-1.5 rounded-lg border border-neutral-200 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors focus:outline-none focus:ring-2 focus:ring-neutral-300 focus:ring-offset-2"
              >
                Try without signing in
              </button>
            </div>

            <p className="text-[10px] text-neutral-400 text-center leading-relaxed">
              Sign in to save across sessions. Visit mode resets on refresh.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`h-screen w-full flex flex-col overflow-hidden ${mode === 'recording' ? 'bg-neutral-100' : 'bg-neutral-50'}`}>
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
        <div className="w-full border-b border-neutral-200 bg-white px-4 py-1.5 flex items-center justify-end gap-3 text-xs">
          <span className="text-neutral-500">
            Signed in as <span className="font-medium text-neutral-800">{session.user.email}</span>
            <span className="ml-1.5 text-neutral-400">· changes sync to Supabase</span>
          </span>
          <button
            type="button"
            onClick={() => supabase?.auth.signOut()}
            className="px-2 py-1 rounded border border-neutral-200 text-neutral-600 hover:bg-neutral-50"
          >
            Sign out
          </button>
        </div>
      )}

      <div className="hidden lg:flex flex-1 overflow-hidden">
        {/* Left panel + unified bar (bar always visible; click or drag to open/close) */}
        {leftPanelOpen && (
          <div className="flex-shrink-0 bg-white flex flex-col overflow-hidden" style={{ width: '260px' }}>
            {/* Header: Organization heading + settings + edit */}
            <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-neutral-100 flex-shrink-0">
              <h2 className="text-[8px] font-medium text-neutral-500 tracking-wide">
                Organization
              </h2>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(true)}
                  className="p-2 rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 transition-colors"
                  title="Settings"
                  aria-label="Open settings"
                >
                  <Cog6ToothIcon className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditMode(!isEditMode)}
                  className={`p-2 rounded-lg transition-colors ${
                    isEditMode
                      ? 'bg-blue-50 text-[#0044A8]'
                      : 'hover:bg-neutral-100 text-neutral-500'
                  }`}
                  title={isEditMode ? 'Done editing' : 'Edit organization'}
                >
                  {isEditMode ? <CheckIcon className="h-4 w-4" /> : <PencilIcon className="h-4 w-4" />}
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
                onFocusCategory={(id) => setFocusedCategoryId((prev) => (prev === id ? null : id))}
                endDayLabel={`End day (${selectedDate})`}
                onEndDay={() => endDay(selectedDate)}
                planVsActualSection={
                  <div className="px-4 pb-6 pt-3">
                    <p className="text-[6px] text-neutral-400 mb-2 pl-0.5">
                      {view === 'week'
                        ? `Week of ${selectedDate}`
                        : view === 'month'
                          ? new Date(selectedDate).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                          : selectedDate}
                    </p>
                    <div className="mb-3 flex rounded-lg bg-neutral-100 p-0.5">
                      <button
                        type="button"
                        onClick={() => setPlanVsActualView('category')}
                        className={`flex-1 py-1.5 px-2 text-xs font-medium rounded-md transition-all ${
                          planVsActualView === 'category'
                            ? 'bg-white text-neutral-900 shadow-sm'
                            : 'text-neutral-600 hover:text-neutral-900'
                        }`}
                      >
                        Category
                      </button>
                      <button
                        type="button"
                        onClick={() => setPlanVsActualView('container')}
                        className={`flex-1 py-1.5 px-2 text-xs font-medium rounded-md transition-all ${
                          planVsActualView === 'container'
                            ? 'bg-white text-neutral-900 shadow-sm'
                            : 'text-neutral-600 hover:text-neutral-900'
                        }`}
                      >
                        Calendar
                      </button>
                      <button
                        type="button"
                        onClick={() => setPlanVsActualView('tag')}
                        className={`flex-1 py-1.5 px-2 text-xs font-medium rounded-md transition-all ${
                          planVsActualView === 'tag'
                            ? 'bg-white text-neutral-900 shadow-sm'
                            : 'text-neutral-600 hover:text-neutral-900'
                        }`}
                      >
                        Tag
                      </button>
                    </div>
                    {planVsActual.length > 0 ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-x-2 text-[10px] font-medium text-neutral-400 uppercase tracking-wide mb-1 px-0.5">
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
                              <div className="flex items-center justify-start gap-2 min-w-0">
                                <div
                                  className="w-2 h-2 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: row.color }}
                                />
                                <span className="text-sm text-neutral-700 truncate">{row.name}</span>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-0.5">
                                  <div className="bg-neutral-100 rounded-full h-2 overflow-hidden">
                                    <div
                                      className="h-full rounded-full bg-neutral-300 transition-all"
                                      style={{ width: `${Math.min(100, pctP)}%` }}
                                    />
                                  </div>
                                  <span className="text-[10px] text-neutral-500">{row.plannedHours.toFixed(1)}h</span>
                                </div>
                                <div className="space-y-0.5 text-right">
                                  <div className="bg-neutral-100 rounded-full h-2 overflow-hidden">
                                    <div
                                      className="h-full rounded-full transition-all"
                                      style={{ width: `${Math.min(100, pctR)}%`, backgroundColor: row.color, opacity: 0.9 }}
                                    />
                                  </div>
                                  <span className="text-[10px] text-neutral-500">{row.recordedHours.toFixed(1)}h</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        <div className="pt-3 mt-3 border-t border-neutral-200 text-sm font-semibold text-neutral-900">
                          {planVsActual.reduce((s, r) => s + r.plannedHours, 0).toFixed(1)}h planned ·{' '}
                          {planVsActual.reduce((s, r) => s + r.recordedHours, 0).toFixed(1)}h completed
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm text-neutral-400 text-center py-8">
                        No time planned or recorded for this day
                      </div>
                    )}
                  </div>
                }
                canEditOrganization={true}
                isShortcutsOpen={isShortcutsOpen}
                onToggleShortcuts={() => setIsShortcutsOpen((o) => !o)}
                isEditMode={isEditMode}
              />
            </div>
          </div>
        )}
        {/* Left bar — 8px, gray center line; click toggles, drag left closes / drag right opens */}
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
          <div className="w-px bg-neutral-200" />
          <div className="flex-1 min-w-0 bg-neutral-100 group-hover:bg-blue-200 transition-colors" />
          <div className="w-0.5 bg-neutral-300" />
          <div className="flex-1 min-w-0 bg-neutral-100 group-hover:bg-blue-200 transition-colors" />
          <div className="w-px bg-neutral-200" />
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
          onDoneAsPlanned={markDoneAsPlanned}
          onDidSomethingElse={markDidSomethingElse}
          onDeleteBlock={deleteTimeBlock}
          onDeleteTask={deleteTask}
          onDropTask={handleDropTask}
          onCreateBlock={handleCreateBlock}
          onMoveBlock={handleMoveBlock}
          events={visibleEvents}
          onDeleteEvent={deleteEvent}
        />

        {/* Right bar — 8px, gray center line; click toggles, drag right closes / drag left opens */}
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
          <div className="w-px bg-neutral-200" />
          <div className="flex-1 min-w-0 bg-neutral-100 group-hover:bg-blue-200 transition-colors" />
          <div className="w-0.5 bg-neutral-300" />
          <div className="flex-1 min-w-0 bg-neutral-100 group-hover:bg-blue-200 transition-colors" />
          <div className="w-px bg-neutral-200" />
        </div>
        {/* Right panel */}
        {rightPanelOpen && (
          <div className="w-80 flex-shrink-0 flex flex-col overflow-hidden bg-white">
            <div className="flex items-center px-3 py-2 border-b border-neutral-100">
              <span className="text-xs font-medium text-neutral-500">Tasks</span>
            </div>
            <div className="flex-1 overflow-hidden">
              <RightSidebar
                tasks={displayTasks}
                unscheduledTasks={unscheduledDisplay}
                partiallyCompletedTasks={partiallyCompletedDisplay}
                fixedMissedTasks={fixedMissedDisplay}
                selectedDate={selectedDate}
                timeBlocks={timeBlocks}
                categories={categories}
                tags={tags}
                onAddTask={handleAddTask}
                onOpenScheduleTask={handleOpenScheduleTask}
                onEditTask={handleEditTask}
                onDeleteTask={deleteTask}
                onOpenAddModal={handleOpenAddModal}
                onDropBlock={deleteTimeBlock}
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
          onDoneAsPlanned={markDoneAsPlanned}
          onDidSomethingElse={markDidSomethingElse}
          onDeleteBlock={deleteTimeBlock}
          onDeleteTask={deleteTask}
          onDropTask={handleDropTask}
          onCreateBlock={handleCreateBlock}
          onMoveBlock={handleMoveBlock}
          events={visibleEvents}
          onDeleteEvent={deleteEvent}
        />
        <DraggableBottomSheet
          tasks={displayTasks}
          unscheduledTasks={unscheduledDisplay}
          partiallyCompletedTasks={partiallyCompletedDisplay}
          fixedMissedTasks={fixedMissedDisplay}
          selectedDate={selectedDate}
          timeBlocks={timeBlocks}
          categories={categories}
          tags={tags}
          onAddTask={handleAddTask}
          onOpenScheduleTask={handleOpenScheduleTask}
          onEditTask={handleEditTask}
          onDeleteTask={deleteTask}
          onOpenAddModal={handleOpenAddModal}
          onDropBlock={deleteTimeBlock}
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
          setIsDraftTimeBlock(false);
        }}
        categories={categories}
        tags={tags}
        calendarContainers={calendarContainers}
        initialMode={addModalMode}
        viewMode={mode}
        onViewModeChange={setViewMode}
        editingTask={editingTask}
        editingTimeBlock={editingTimeBlock}
        onAddTask={handleAddTask}
        onUpdateTask={updateTask}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-xl shadow-xl border border-neutral-200 p-6 max-w-sm mx-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-neutral-800">Overlapping Recording</h3>
            </div>
            <p className="text-sm text-neutral-600 mb-4">{recordingOverlapWarning}</p>
            <button
              type="button"
              className="w-full py-2 px-4 bg-neutral-800 text-white text-sm font-medium rounded-lg hover:bg-neutral-700 transition-colors"
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
