import React, { useState, useMemo } from 'react';
import { CalendarView } from './components/CalendarView';
import { DraggableBottomSheet } from './components/DraggableBottomSheet';
import { RightSidebar } from './components/RightSidebar';
import { AddModal } from './components/AddModal';
import { ScheduleTaskModal } from './components/ScheduleTaskModal';
import { CalendarContainerList } from './components/CalendarContainerList';
import { useStore } from './store/useStore';
import {
  selectTimeBlocksForDate,
  selectPlanVsActualByCategory,
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

  const planVsActual = useMemo(
    () =>
      selectPlanVsActualByCategory(timeBlocks, selectedDate, categories),
    [timeBlocks, selectedDate, categories]
  );

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

  return (
    <div className="h-screen w-full bg-neutral-50 flex flex-col overflow-hidden">
      <div className="hidden lg:flex flex-1 overflow-hidden">
        <div className="w-72 bg-white border-r border-neutral-200 flex flex-col overflow-hidden">
          <div className="p-6 flex-shrink-0">
            <div className="mb-8">
              <div className="bg-neutral-100 rounded-full p-1 flex">
                <button
                  onClick={() => setViewMode('planning')}
                  className={`flex-1 py-2.5 px-4 rounded-full transition-all ${
                    mode === 'planning'
                      ? 'bg-white text-neutral-900 shadow-sm'
                      : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  Planning
                </button>
                <button
                  onClick={() => setViewMode('recording')}
                  className={`flex-1 py-2.5 px-4 rounded-full transition-all ${
                    mode === 'recording'
                      ? 'bg-white text-neutral-900 shadow-sm'
                      : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  Recording
                </button>
              </div>
            </div>
            <div className="mb-8">
              <CalendarContainerList
                containers={calendarContainers}
                visibility={containerVisibility}
                onToggleVisibility={toggleContainerVisibility}
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-6 pb-6">
            <h2 className="text-sm font-medium text-neutral-500 mb-4">
              {selectedDate} — Plan vs Actual
            </h2>
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
        </div>

        <CalendarView
          mode={mode}
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
          onOpenAddModal={handleOpenAddModal}
        />

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
    </div>
  );
}
