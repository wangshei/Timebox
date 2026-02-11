import React, { useState, useMemo, useEffect } from 'react';
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
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [focusedCategoryId, setFocusedCategoryId] = useState<string | null>(null);
  const [focusedCalendarId, setFocusedCalendarId] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authMessage, setAuthMessage] = useState<string | null>(null);

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
    addTimeBlock({
      title: eventData.title,
      calendarContainerId: eventData.calendar,
      categoryId: eventData.category.id,
      tagIds: eventData.tags.map((t) => t.id),
      start: eventData.startTime,
      end: eventData.endTime,
      date: eventData.date,
      mode: 'planned',
      source: 'manual',
    });
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

  const handleCreateBlock = (params: { date: string; startTime: string; endTime: string }) => {
    const containerId = calendarContainers[0]?.id;
    const categoryId = categories[0]?.id;
    if (!containerId || !categoryId) return undefined;
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
        await loadSupabaseState();
        unsubscribePersistence = startSupabasePersistence();
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

  const handleSendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !authEmail.trim()) return;
    setAuthMessage(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: authEmail.trim(),
      options: {
        emailRedirectTo: window.location.origin,
      },
    });
    if (error) {
      setAuthMessage(error.message);
    } else {
      setAuthMessage('Check your email for a magic link.');
    }
  };

  return (
    <div className={`h-screen w-full flex flex-col overflow-hidden ${mode === 'recording' ? 'bg-neutral-100' : 'bg-neutral-50'}`}>
      {/* Supabase auth bar */}
      {supabase && (
        <div className="w-full border-b border-neutral-200 bg-white px-4 py-1.5 flex items-center justify-end gap-3 text-xs">
          {session ? (
            <>
              <span className="text-neutral-500">
                Signed in as <span className="font-medium text-neutral-800">{session.user.email}</span>
              </span>
              <button
                type="button"
                onClick={() => supabase?.auth.signOut()}
                className="px-2 py-1 rounded border border-neutral-200 text-neutral-600 hover:bg-neutral-50"
              >
                Sign out
              </button>
            </>
          ) : (
            <form onSubmit={handleSendMagicLink} className="flex items-center gap-2">
              <input
                type="email"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                placeholder="Email for login"
                className="px-2 py-1 text-xs border border-neutral-200 rounded bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                className="px-2 py-1 rounded border border-blue-500 text-blue-700 text-xs font-medium hover:bg-blue-50"
              >
                Send link
              </button>
              {authMessage && <span className="text-[10px] text-neutral-500">{authMessage}</span>}
            </form>
          )}
        </div>
      )}

      <div className="hidden lg:flex flex-1 overflow-hidden">
        {/* Left panel — Notion-like: header (logo + add + edit icon), sections left-aligned */}
        {leftPanelOpen ? (
          <div className="flex-shrink-0 bg-white border-r border-neutral-200 flex flex-col overflow-hidden" style={{ width: '260px' }}>
            {/* Header: close left panel; Manage & shortcuts live inside LeftSidebar */}
            <div className="relative flex items-center justify-end gap-1 px-2 py-2 border-b border-neutral-100 flex-shrink-0">
              <button
                type="button"
                onClick={() => setLeftPanelOpen(false)}
                className="p-1.5 rounded text-neutral-400 hover:bg-neutral-50 hover:text-neutral-600 transition-colors"
                aria-label="Close left panel"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
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
                onOpenSettings={() => setIsSettingsOpen(true)}
                canEditOrganization={calendarContainers.length > 0 && tasks.length > 0}
                isShortcutsOpen={isShortcutsOpen}
                onToggleShortcuts={() => setIsShortcutsOpen((o) => !o)}
              />
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setLeftPanelOpen(true)} className="flex-shrink-0 w-10 h-10 mt-2 ml-2 self-start flex items-center justify-center bg-white border border-neutral-200 text-neutral-400 hover:bg-neutral-50 hover:text-neutral-600 transition-colors rounded-lg" aria-label="Open left panel" title="Open left panel">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
        )}

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
        />

        {/* Right panel — closable */}
        {rightPanelOpen ? (
          <div className="w-80 flex-shrink-0 flex flex-col overflow-hidden border-l border-neutral-200 bg-white">
            <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-neutral-500">Tasks</span>
              </div>
              <button type="button" onClick={() => setRightPanelOpen(false)} className="p-1.5 rounded text-neutral-400 hover:bg-neutral-50 hover:text-neutral-600 transition-colors" aria-label="Close right panel">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </button>
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
              />
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setRightPanelOpen(true)} className="flex-shrink-0 w-10 flex items-center justify-center py-2 bg-white border-l border-neutral-200 text-neutral-400 hover:bg-neutral-50 hover:text-neutral-600 transition-colors" aria-label="Open right panel" title="Open right panel">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
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
          // If a time block was created as a draft (via drag on calendar) and still has no title, discard it.
          if (isDraftTimeBlock && editingTimeBlockId) {
            const b = timeBlocks.find((tb) => tb.id === editingTimeBlockId);
            if (!b?.title?.trim()) {
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
        editingTask={editingTask}
        editingTimeBlock={editingTimeBlock}
        onAddTask={handleAddTask}
        onUpdateTask={updateTask}
        onUpdateTimeBlock={updateTimeBlock}
        onAddEvent={handleAddEvent}
        onRequireCalendar={() => setIsSettingsOpen(true)}
      />

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
