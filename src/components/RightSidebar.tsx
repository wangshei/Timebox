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
      className={`flex flex-col overflow-hidden min-h-0 ${
        isBottomSheet ? 'h-full' : isMobile ? 'w-full' : 'w-80'
      }`}
      style={{
        backgroundColor: isDragOverBlock ? 'rgba(91,155,173,0.06)' : '#F5F1EB',
        outline: isDragOverBlock ? '2px solid rgba(91,155,173,0.4)' : 'none',
        outlineOffset: '-2px',
        borderLeft: isMobile ? '1px solid rgba(160,140,120,0.2)' : 'none',
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Overview toggle + date range filter */}
      <div className={isBottomSheet ? 'px-4 py-2.5' : 'px-4 py-2.5'} style={{ borderBottom: '1px solid rgba(160,140,120,0.18)' }}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setViewMode(viewMode === 'overview' ? 'plan' : 'overview')}
            className="px-2.5 py-1 text-xs font-medium rounded-lg transition-all touch-manipulation"
            style={{
              backgroundColor: viewMode === 'plan' ? 'rgba(91,155,173,0.1)' : 'rgba(160,140,120,0.1)',
              color: viewMode === 'plan' ? '#5B9BAD' : '#8A7A6E',
              border: viewMode === 'plan' ? '1px solid rgba(91,155,173,0.25)' : '1px solid rgba(160,140,120,0.2)',
            }}
            title={viewMode === 'overview' ? 'Show as planning blocks' : 'Show as list'}
          >
            {viewMode === 'overview' ? 'Overview' : '← List'}
          </button>
          <div className="flex rounded-lg p-0.5" style={{ backgroundColor: 'rgba(160,140,120,0.1)', border: '1px solid rgba(160,140,120,0.18)' }}>
            {(['today', 'week', 'month'] as const).map((range) => (
              <button
                key={range}
                type="button"
                onClick={() => setOverviewRange(range)}
                className="px-2 py-1 text-xs font-medium rounded-md transition-all touch-manipulation capitalize"
                style={{
                  backgroundColor: overviewRange === range ? '#FDFBF8' : 'transparent',
                  color: overviewRange === range ? '#2C2820' : '#8A7A6E',
                  boxShadow: overviewRange === range ? '0 1px 3px rgba(0,0,0,0.07)' : 'none',
                }}
              >
                {range.charAt(0).toUpperCase() + range.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={`flex-1 min-h-0 overflow-y-auto space-y-5 ${isBottomSheet ? 'px-4 py-4 pb-6' : 'px-4 py-4 pb-8'}`}>
        {/* Unscheduled Tasks */}
        <div>
          <h2 className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: '#A08C78', letterSpacing: '0.1em' }}>Unscheduled</h2>
          {onOpenAddModal && (
            <button
              type="button"
              onClick={() => onOpenAddModal('task')}
              className="w-full py-2 px-3 mb-3 rounded-xl text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
              style={{
                border: '1.5px dashed rgba(160,140,120,0.35)',
                color: '#8A7A6E',
                backgroundColor: 'transparent',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(160,140,120,0.08)';
                e.currentTarget.style.borderColor = 'rgba(91,155,173,0.45)';
                e.currentTarget.style.color = '#5B9BAD';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.borderColor = 'rgba(160,140,120,0.35)';
                e.currentTarget.style.color = '#8A7A6E';
              }}
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Add task
            </button>
          )}
          <div className={viewMode === 'overview' ? 'space-y-2' : 'space-y-2.5'}>
            {unscheduledTasks.length === 0 ? (
              <div className="text-xs text-center py-4" style={{ color: '#B0A090' }}>No unscheduled tasks</div>
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
            <h2 className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: '#A08C78', letterSpacing: '0.1em' }}>In Progress</h2>
            <div className={viewMode === 'overview' ? 'space-y-2' : 'space-y-2.5'}>
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
            <h2 className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: '#A08C78', letterSpacing: '0.1em' }}>Fixed / Missed</h2>
            <div className={viewMode === 'overview' ? 'space-y-2' : 'space-y-2.5'}>
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
                <ChevronDownIcon className="h-3 w-3" style={{ color: '#A08C78' }} />
              ) : (
                <ChevronRightIcon className="h-3 w-3" style={{ color: '#A08C78' }} />
              )}
              <h2 className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#A08C78', letterSpacing: '0.1em' }}>Done</h2>
            </button>
            {doneSectionOpen && (
              <div className="space-y-1.5">
                {doneSorted.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl"
                    style={{ backgroundColor: 'rgba(160,140,120,0.08)', border: '1px solid rgba(160,140,120,0.14)' }}
                  >
                    <CheckIcon className="h-3.5 w-3.5 shrink-0" style={{ color: '#6A8C5A' }} />
                    <span className="flex-1 min-w-0 text-xs line-through truncate" style={{ color: '#8A7A6E' }}>{task.title}</span>
                    <span className="text-xs shrink-0" style={{ color: '#B0A090' }}>{task.recordedHours}h</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Events */}
        {upcomingEvents.length > 0 && (
          <div>
            <h2 className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: '#A08C78', letterSpacing: '0.1em' }}>Upcoming Events</h2>
            <div className="space-y-2">
              {upcomingEvents.map((event) => (
                <div
                  key={event.id}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl group"
                  style={{
                    backgroundColor: 'rgba(160,140,120,0.07)',
                    border: '1px solid rgba(160,140,120,0.14)',
                    borderLeft: '3px solid #5B9BAD',
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold truncate" style={{ color: '#2C2820' }}>{event.title}</div>
                    <div className="text-[10px] mt-0.5" style={{ color: '#A08C78' }}>{event.start} – {event.end} · {event.date}</div>
                  </div>
                  {onDeleteEvent && (
                    <button
                      className="opacity-0 group-hover:opacity-100 p-1 rounded-lg transition-all flex-shrink-0"
                      style={{ color: '#B0A090' }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(160,140,120,0.15)'; e.currentTarget.style.color = '#6E5E50'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#B0A090'; }}
                      onClick={() => onDeleteEvent(event.id)}
                      title="Delete event"
                    >
                      <XMarkIcon className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}