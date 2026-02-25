import React, { useMemo, useState } from 'react';
import { Task, Category, Tag } from '../App';
import { getLocalDateString } from '../utils/dateTime';
import { TaskCard } from './TaskCard';
import { PlusIcon, XMarkIcon, CheckIcon, ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/solid';
import type { TimeBlock, Event } from '../types';

interface RightSidebarProps {
  tasks: Task[];
  unscheduledTasks: Task[];
  partiallyCompletedTasks: Task[];
  fixedMissedTasks?: Task[];
  /** Tasks that have recorded time and no planned (fully done); shown in Done section. Same shape as other task lists (DisplayTask). */
  doneTasks?: Task[];
  selectedDate?: string;
  timeBlocks?: TimeBlock[];
  categories: Category[];
  tags: Tag[];
  onAddTask: (task: {
    title: string;
    estimatedHours: number;
    category: Category;
    tags: Tag[];
    calendar: 'personal' | 'work' | 'school';
  }) => void;
  onOpenScheduleTask?: (taskId: string) => void;
  onEditTask?: (taskId: string) => void;
  onDeleteTask?: (taskId: string) => void;
  /** Mark all planned blocks of this task as done (create recorded for each). */
  onMarkTaskDone?: (taskId: string) => void;
  onOpenAddModal?: (mode: 'task' | 'event') => void;
  /** When a block is dropped from the calendar, unschedule it (remove from calendar). */
  onDropBlock?: (blockId: string) => void;
  /** Break a task into smaller tasks (e.g. 30min, 1h chunks) and add to backlog. */
  onBreakIntoChunks?: (taskId: string, chunkMinutes: number) => void;
  /** Split task into two: one with chunkMinutes, original reduced by that amount. */
  onSplitTask?: (taskId: string, chunkMinutes: number) => void;
  events?: Event[];
  onDeleteEvent?: (eventId: string) => void;
  isMobile?: boolean;
  isBottomSheet?: boolean;
}

export type TaskViewMode = 'overview' | 'plan';

export function RightSidebar({ tasks, unscheduledTasks, partiallyCompletedTasks, fixedMissedTasks = [], doneTasks = [], selectedDate = getLocalDateString(), timeBlocks, categories, tags, onAddTask, onOpenScheduleTask, onEditTask, onDeleteTask, onMarkTaskDone, onOpenAddModal, onDropBlock, onBreakIntoChunks, onSplitTask, events = [], onDeleteEvent, isMobile = false, isBottomSheet = false }: RightSidebarProps) {
  const [viewMode, setViewMode] = useState<TaskViewMode>('overview');
  const [overviewRange, setOverviewRange] = useState<'today' | 'week' | 'month'>('today');
  const [isDragOverBlock, setIsDragOverBlock] = useState(false);
  const [doneSectionOpen, setDoneSectionOpen] = useState(true);

  const upcomingEvents = useMemo(() => {
    const today = getLocalDateString();
    return events
      .filter((e) => e.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
  }, [events]);

  const dateSet = useMemo(() => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const base = new Date(y, (m ?? 1) - 1, d ?? 1);
    if (overviewRange === 'today') return new Set([selectedDate]);
    if (overviewRange === 'week') {
      const start = new Date(base);
      start.setDate(base.getDate() - base.getDay());
      const s = new Set<string>();
      for (let i = 0; i < 7; i++) {
        const di = new Date(start);
        di.setDate(start.getDate() + i);
        s.add(getLocalDateString(di));
      }
      return s;
    }
    // month
    const s = new Set<string>();
    const first = new Date(base.getFullYear(), base.getMonth(), 1);
    const next = new Date(base.getFullYear(), base.getMonth() + 1, 1);
    for (let dt = new Date(first); dt < next; dt.setDate(dt.getDate() + 1)) {
      s.add(getLocalDateString(dt));
    }
    return s;
  }, [selectedDate, overviewRange]);

  const taskIdsInRange = useMemo(() => {
    const set = new Set<string>();
    (timeBlocks ?? []).forEach((b) => {
      if (b.taskId && dateSet.has(b.date)) set.add(b.taskId);
    });
    return set;
  }, [timeBlocks, dateSet]);

  const filteredPartially = useMemo(() => {
    if (viewMode !== 'overview' || !timeBlocks) return partiallyCompletedTasks;
    return partiallyCompletedTasks.filter((t) => taskIdsInRange.has(t.id));
  }, [partiallyCompletedTasks, taskIdsInRange, timeBlocks, viewMode]);

  const filteredFixed = useMemo(() => {
    if (viewMode !== 'overview' || !timeBlocks) return fixedMissedTasks;
    return fixedMissedTasks.filter((t) => taskIdsInRange.has(t.id));
  }, [fixedMissedTasks, taskIdsInRange, timeBlocks, viewMode]);

  /** Done tasks sorted by earliest recorded block date (most recent first) */
  const doneSorted = useMemo(() => {
    if (!timeBlocks?.length) return doneTasks;
    return [...doneTasks].sort((taskA, taskB) => {
      const datesA = timeBlocks.filter((bl) => bl.taskId === taskA.id && bl.mode === 'recorded').map((bl) => bl.date);
      const datesB = timeBlocks.filter((bl) => bl.taskId === taskB.id && bl.mode === 'recorded').map((bl) => bl.date);
      const minA = datesA.length ? datesA.sort()[0] : '';
      const minB = datesB.length ? datesB.sort()[0] : '';
      return minB.localeCompare(minA);
    });
  }, [doneTasks, timeBlocks]);

  const handleDragOver = (e: React.DragEvent) => {
    if (!onDropBlock || !e.dataTransfer.types.includes('application/x-timebox-block-id')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsDragOverBlock(true);
  };
  const handleDragLeave = () => setIsDragOverBlock(false);
  const handleDrop = (e: React.DragEvent) => {
    const blockId = e.dataTransfer.getData('application/x-timebox-block-id');
    setIsDragOverBlock(false);
    if (onDropBlock && blockId) {
      e.preventDefault();
      onDropBlock(blockId);
    }
  };

  return (
    <div
      className={`bg-white flex flex-col overflow-hidden min-h-0 ${
        isBottomSheet ? 'h-full' : isMobile ? 'w-full border-l border-neutral-200' : 'w-80'
      } ${isDragOverBlock ? 'ring-2 ring-inset ring-blue-300 bg-blue-50/50' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Overview toggle (button) + Today / Week / Month range — always visible */}
      <div className={`border-b border-neutral-200 ${isBottomSheet ? 'px-4 py-3' : 'px-6 py-3'}`}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setViewMode(viewMode === 'overview' ? 'plan' : 'overview')}
            className={`px-2 py-1 text-xs font-medium rounded transition-all touch-manipulation ${
              viewMode === 'overview'
                ? 'bg-neutral-100 text-neutral-600 hover:text-neutral-800 hover:bg-neutral-200/80'
                : 'bg-white text-neutral-800 shadow-sm border border-neutral-100'
            }`}
            title={viewMode === 'overview' ? 'Show as planning blocks' : 'Show as list'}
          >
            Overview
          </button>
          <div className="flex rounded-lg bg-neutral-100 p-0.5 border border-neutral-100">
            <button
              type="button"
              onClick={() => setOverviewRange('today')}
              className={`px-2 py-1 text-xs font-medium rounded transition-all touch-manipulation ${
                overviewRange === 'today' ? 'bg-white text-neutral-800 shadow-sm border border-neutral-100' : 'text-neutral-600 hover:text-neutral-800 hover:bg-neutral-100/80'
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setOverviewRange('week')}
              className={`px-2 py-1 text-xs font-medium rounded transition-all touch-manipulation ${
                overviewRange === 'week' ? 'bg-white text-neutral-800 shadow-sm border border-neutral-100' : 'text-neutral-600 hover:text-neutral-800 hover:bg-neutral-100/80'
              }`}
            >
              Week
            </button>
            <button
              type="button"
              onClick={() => setOverviewRange('month')}
              className={`px-2 py-1 text-xs font-medium rounded transition-all touch-manipulation ${
                overviewRange === 'month' ? 'bg-white text-neutral-800 shadow-sm border border-neutral-100' : 'text-neutral-600 hover:text-neutral-800 hover:bg-neutral-100/80'
              }`}
            >
              Month
            </button>
          </div>
        </div>
      </div>

      <div className={`flex-1 min-h-0 overflow-y-auto space-y-6 ${isBottomSheet ? 'px-4 py-4 pb-6' : 'p-6 pb-8'}`}>
        {/* Unscheduled Tasks */}
        <div>
          <h2 className="text-sm font-medium text-neutral-500 mb-4">Unscheduled Tasks</h2>
          {onOpenAddModal && (
            <button
              type="button"
              onClick={() => onOpenAddModal('task')}
              className="w-full py-2.5 px-3 mb-3 rounded-lg border border-dashed border-neutral-300 bg-neutral-50/80 hover:bg-neutral-100 hover:border-neutral-400 text-sm font-medium text-neutral-600 hover:text-neutral-800 transition-colors flex items-center justify-center gap-2"
            >
              <PlusIcon className="h-4 w-4" />
              Add task
            </button>
          )}
          <div className={viewMode === 'overview' ? 'space-y-2' : 'space-y-3'}>
            {unscheduledTasks.length === 0 ? (
              <div className="text-sm text-neutral-400 text-center py-4">No unscheduled tasks</div>
            ) : (
              unscheduledTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  viewMode={viewMode}
                  popoverSide="left"
                  onScheduleTask={onOpenScheduleTask ? () => onOpenScheduleTask(task.id) : undefined}
                  onEditTask={onEditTask ? () => onEditTask(task.id) : undefined}
                  onDeleteTask={onDeleteTask ? () => onDeleteTask(task.id) : undefined}
                  onMarkTaskDone={
                    onMarkTaskDone && timeBlocks?.some((b) => b.taskId === task.id && b.mode === 'planned')
                      ? () => onMarkTaskDone(task.id)
                      : undefined
                  }
                  onBreakIntoChunks={onBreakIntoChunks}
                  onSplitTask={onSplitTask}
                />
              ))
            )}
          </div>
        </div>

        {/* Partially Completed */}
        {partiallyCompletedTasks.length > 0 && (
          <div>
            <h2 className="text-sm font-medium text-neutral-500 mb-4">Partially Completed</h2>
            <div className={viewMode === 'overview' ? 'space-y-2' : 'space-y-3'}>
              {              filteredPartially.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  viewMode={viewMode}
                  popoverSide="left"
                  onScheduleTask={onOpenScheduleTask ? () => onOpenScheduleTask(task.id) : undefined}
                  onEditTask={onEditTask ? () => onEditTask(task.id) : undefined}
                  onDeleteTask={onDeleteTask ? () => onDeleteTask(task.id) : undefined}
                  onMarkTaskDone={
                    onMarkTaskDone && timeBlocks?.some((b) => b.taskId === task.id && b.mode === 'planned')
                      ? () => onMarkTaskDone(task.id)
                      : undefined
                  }
                  onBreakIntoChunks={onBreakIntoChunks}
                  onSplitTask={onSplitTask}
                />
              ))}
            </div>
          </div>
        )}

        {/* Fixed / Missed */}
        {fixedMissedTasks.length > 0 && (
          <div>
            <h2 className="text-sm font-medium text-neutral-500 mb-4">Fixed / Missed</h2>
            <div className={viewMode === 'overview' ? 'space-y-2' : 'space-y-3'}>
              {              filteredFixed.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  viewMode={viewMode}
                  popoverSide="left"
                  onScheduleTask={onOpenScheduleTask ? () => onOpenScheduleTask(task.id) : undefined}
                  onEditTask={onEditTask ? () => onEditTask(task.id) : undefined}
                  onDeleteTask={onDeleteTask ? () => onDeleteTask(task.id) : undefined}
                  onMarkTaskDone={
                    onMarkTaskDone && timeBlocks?.some((b) => b.taskId === task.id && b.mode === 'planned')
                      ? () => onMarkTaskDone(task.id)
                      : undefined
                  }
                  onBreakIntoChunks={onBreakIntoChunks}
                  onSplitTask={onSplitTask}
                />
              ))}
            </div>
          </div>
        )}

        {/* Done — collapsible, sorted by date */}
        {doneSorted.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setDoneSectionOpen(!doneSectionOpen)}
              className="flex items-center gap-1.5 w-full text-left mb-2"
            >
              {doneSectionOpen ? (
                <ChevronDownIcon className="h-3.5 w-3.5 text-neutral-500" />
              ) : (
                <ChevronRightIcon className="h-3.5 w-3.5 text-neutral-500" />
              )}
              <h2 className="text-sm font-medium text-neutral-500">Done</h2>
            </button>
            {doneSectionOpen && (
              <div className={viewMode === 'overview' ? 'space-y-2' : 'space-y-3'}>
                {doneSorted.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center gap-2 p-2 rounded-lg bg-neutral-50 border border-neutral-100"
                  >
                    <span className="flex-1 min-w-0 text-sm text-neutral-600 line-through truncate">{task.title}</span>
                    <span className="text-xs text-neutral-400">{task.recordedHours}h</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Events */}
        <div>
          <h2 className="text-sm font-medium text-neutral-500 mb-4">Events</h2>
          {upcomingEvents.length === 0 ? (
            <div className="text-sm text-neutral-400 text-center py-4">
              No upcoming events
            </div>
          ) : (
            <div className="space-y-2">
              {upcomingEvents.map((event) => (
                <div
                  key={event.id}
                  className="flex items-center gap-2 p-2 rounded-lg bg-neutral-50 border border-neutral-100 group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-neutral-700 truncate">{event.title}</div>
                    <div className="text-xs text-neutral-400">{event.start} – {event.end} · {event.date}</div>
                  </div>
                  {onDeleteEvent && (
                    <button
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-neutral-200 transition-opacity flex-shrink-0"
                      onClick={() => onDeleteEvent(event.id)}
                      title="Delete event"
                    >
                      <XMarkIcon className="w-3.5 h-3.5 text-neutral-400" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}