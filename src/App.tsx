import React, { useState, useMemo, useEffect } from 'react';
import { CalendarView } from './components/CalendarView';
import { DraggableBottomSheet } from './components/DraggableBottomSheet';
import { RightSidebar } from './components/RightSidebar';
import { AddModal } from './components/AddModal';
import { ScheduleTaskModal } from './components/ScheduleTaskModal';
import { SettingsPanel } from './components/SettingsPanel';
import { CalendarContainerList } from './components/CalendarContainerList';
import { CategoryFocusList } from './components/CategoryFocusList';
import { useStore } from './store/useStore';
import {
  selectTimeBlocksForDate,
  selectPlanVsActualByCategory,
  selectPlanVsActualByContainer,
  selectPlanVsActualByTag,
  selectDisplayTasksForBacklog,
  selectUnscheduledTasks,
  selectPartiallyCompletedTasks,
} from './store/selectors';
import { resolveTimeBlocks } from './utils/dataResolver';
import type { Category, Tag } from './types';

// Re-export for components that still import from App
export type Mode = 'planning' | 'recording';
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
  const [schedulingTaskId, setSchedulingTaskId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [focusedCategoryId, setFocusedCategoryId] = useState<string | null>(null);
  const [focusedCalendarId, setFocusedCalendarId] = useState<string | null>(null);

  const {
    viewMode: mode,
    view,
    setViewMode,
    setView,
    selectedDate,
    setSelectedDate,
    containerVisibility,
    toggleContainerVisibility,
    tasks,
    timeBlocks,
    calendarContainers,
    categories,
    tags,
    addTask,
    addTimeBlock,
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
  } = useStore();

  const visibleTimeBlocks = useMemo(
    () =>
      selectTimeBlocksForDate(
        timeBlocks,
        selectedDate,
        containerVisibility
      ),
    [timeBlocks, selectedDate, containerVisibility]
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
    setAddModalMode(modalMode);
    setIsAddModalOpen(true);
  };

  const handleEditTask = (id: string) => {
    setEditingTaskId(id);
    setAddModalMode('task');
    setIsAddModalOpen(true);
  };

  const editingTask = editingTaskId ? tasks.find((t) => t.id === editingTaskId) ?? null : null;
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

  // Keyboard shortcuts: d day, w week, m month, p planning, r recording
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
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setView, setViewMode]);

  return (
    <div className="h-screen w-full bg-neutral-50 flex flex-col overflow-hidden">
      <div className="hidden lg:flex flex-1 overflow-hidden">
        {/* Left panel — 15% slimmer (w-60), closable */}
        {leftPanelOpen ? (
          <div className="w-60 flex-shrink-0 bg-white border-r border-neutral-200 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-100">
              <span className="text-xs font-medium text-neutral-500">Left</span>
              <button type="button" onClick={() => setLeftPanelOpen(false)} className="p-1.5 rounded text-neutral-400 hover:bg-neutral-50 hover:text-neutral-600 transition-colors" aria-label="Close left panel">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
            </div>
            <div className="p-4 flex-shrink-0">
            <div className="mb-4">
              <CalendarContainerList
                containers={calendarContainers}
                visibility={containerVisibility}
                onToggleVisibility={toggleContainerVisibility}
                focusedCalendarId={focusedCalendarId}
                onFocusCalendar={(id) => setFocusedCalendarId((prev) => (prev === id ? null : id))}
              />
            </div>
            <div className="mb-4">
              <CategoryFocusList
                categories={categories}
                focusedCategoryId={focusedCategoryId}
                onFocusCategory={(id) => setFocusedCategoryId((prev) => (prev === id ? null : id))}
              />
            </div>
            <button
              type="button"
              onClick={() => endDay(selectedDate)}
              className="w-full py-2.5 px-4 text-sm font-medium text-neutral-600 bg-neutral-50 hover:bg-neutral-100 rounded-lg transition-colors border border-neutral-100"
            >
              End day ({selectedDate})
            </button>
            <button type="button" onClick={() => setIsSettingsOpen(true)} className="w-full mt-2 py-2 px-3 text-sm font-medium text-neutral-600 bg-neutral-50 hover:bg-neutral-100 rounded-lg transition-colors border border-neutral-100">
              Calendars / Categories / Tags
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-4 min-h-0">
            <h2 className="text-sm font-medium text-neutral-500 mb-2">
              {selectedDate} — Plan vs Actual
            </h2>
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
              <div className="space-y-4">
                {planVsActual.map((row) => {
                  const totalP = planVsActual.reduce((s, r) => s + r.plannedHours, 0);
                  const totalR = planVsActual.reduce((s, r) => s + r.recordedHours, 0);
                  const pctP = totalP > 0 ? (row.plannedHours / totalP) * 100 : 0;
                  const pctR = totalR > 0 ? (row.recordedHours / totalR) * 100 : 0;
                  return (
                    <div key={row.id} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: row.color }}
                          />
                          <span className="text-sm text-neutral-700">{row.name}</span>
                        </div>
                        <span className="text-xs text-neutral-500">
                          P: {row.plannedHours.toFixed(1)}h · R: {row.recordedHours.toFixed(1)}h
                        </span>
                      </div>
                      <div className="flex gap-1">
                        <div className="flex-1 bg-neutral-100 rounded-full h-2 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-neutral-300"
                            style={{ width: `${pctP}%` }}
                          />
                        </div>
                        <div className="flex-1 bg-neutral-100 rounded-full h-2 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${pctR}%`,
                              backgroundColor: row.color,
                              opacity: 0.8,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div className="pt-4 mt-4 border-t border-neutral-200">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-neutral-700">Total</span>
                    <span className="font-medium text-neutral-900">
                      P: {planVsActual.reduce((s, r) => s + r.plannedHours, 0).toFixed(1)}h · R:{' '}
                      {planVsActual.reduce((s, r) => s + r.recordedHours, 0).toFixed(1)}h
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-neutral-400 text-center py-8">
                No time planned or recorded for this day
              </div>
            )}
          </div>
          {/* Shortcuts — small gray box at bottom */}
          <div className="flex-shrink-0 px-3 py-2.5 border-t border-neutral-100 bg-neutral-50/80">
            <div className="text-[10px] font-medium text-neutral-400 uppercase tracking-wide mb-1.5">Shortcuts</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-neutral-500">
              <span><kbd className="font-mono text-neutral-600">d</kbd> Day</span>
              <span><kbd className="font-mono text-neutral-600">w</kbd> Week</span>
              <span><kbd className="font-mono text-neutral-600">m</kbd> Month</span>
              <span><kbd className="font-mono text-neutral-600">p</kbd> Plan</span>
              <span><kbd className="font-mono text-neutral-600">r</kbd> Record</span>
            </div>
          </div>
        </div>
        ) : (
          <button type="button" onClick={() => setLeftPanelOpen(true)} className="flex-shrink-0 w-10 flex items-center justify-center bg-white border-r border-neutral-200 text-neutral-400 hover:bg-neutral-50 hover:text-neutral-600 transition-colors" aria-label="Open left panel">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
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
        />

        {/* Right panel — closable */}
        {rightPanelOpen ? (
          <div className="w-80 flex-shrink-0 flex flex-col overflow-hidden border-l border-neutral-200 bg-white">
            <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-100">
              <span className="text-xs font-medium text-neutral-500">Tasks</span>
              <button type="button" onClick={() => setRightPanelOpen(false)} className="p-1.5 rounded text-neutral-400 hover:bg-neutral-50 hover:text-neutral-600 transition-colors" aria-label="Close right panel">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <RightSidebar
                tasks={displayTasks}
                unscheduledTasks={unscheduledDisplay}
                partiallyCompletedTasks={partiallyCompletedDisplay}
                selectedDate={selectedDate}
                categories={categories}
                tags={tags}
                onAddTask={handleAddTask}
                onOpenScheduleTask={handleOpenScheduleTask}
                onEditTask={handleEditTask}
                onDeleteTask={deleteTask}
                onOpenAddModal={handleOpenAddModal}
              />
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setRightPanelOpen(true)} className="flex-shrink-0 w-10 flex items-center justify-center bg-white border-l border-neutral-200 text-neutral-400 hover:bg-neutral-50 hover:text-neutral-600 transition-colors" aria-label="Open right panel">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
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
        />
        <DraggableBottomSheet
          tasks={displayTasks}
          unscheduledTasks={unscheduledDisplay}
          partiallyCompletedTasks={partiallyCompletedDisplay}
          selectedDate={selectedDate}
          categories={categories}
          tags={tags}
          onAddTask={handleAddTask}
          onOpenScheduleTask={handleOpenScheduleTask}
          onEditTask={handleEditTask}
          onDeleteTask={deleteTask}
          onOpenAddModal={handleOpenAddModal}
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
        onClose={() => { setIsAddModalOpen(false); setEditingTaskId(null); }}
        categories={categories}
        tags={tags}
        calendarContainers={calendarContainers}
        initialMode={addModalMode}
        editingTask={editingTask}
        onAddTask={handleAddTask}
        onUpdateTask={updateTask}
        onAddEvent={handleAddEvent}
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
