import React, { useMemo, useState, useEffect } from 'react';
import { Task, Category, Tag } from '../App';
import { getLocalDateString } from '../utils/dateTime';
import { TaskCard } from './TaskCard';
import { PlusIcon, XMarkIcon, CheckIcon, ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/solid';
import type { TimeBlock, Event } from '../types';
import { SegmentedControl } from './ui/SegmentedControl';
import { THEME } from '../constants/colors';

const BORDER = 'rgba(0,0,0,0.08)';
const BG_PANEL = '#FCFBF7';

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
  /** Toggle pin status for a task (priority). */
  onTogglePin?: (taskId: string) => void;
}

export type TaskViewMode = 'overview' | 'plan';

export function RightSidebar({ tasks, unscheduledTasks, partiallyCompletedTasks, fixedMissedTasks = [], doneTasks = [], selectedDate = getLocalDateString(), timeBlocks, categories, tags, onAddTask, onOpenScheduleTask, onEditTask, onDeleteTask, onMarkTaskDone, onOpenAddModal, onDropBlock, onBreakIntoChunks, onSplitTask, events = [], onDeleteEvent, isMobile = false, isBottomSheet = false, onTogglePin }: RightSidebarProps) {
  const [viewMode, setViewMode] = useState<TaskViewMode>('overview');
  const [overviewRange, setOverviewRange] = useState<'today' | 'week' | 'month'>('month');
  const [isDragOverBlock, setIsDragOverBlock] = useState(false);
  const [doneSectionOpen, setDoneSectionOpen] = useState(false);

  // Auto-open done section when done tasks become available
  useEffect(() => {
    if (doneTasks.length > 0 && !doneSectionOpen) {
      setDoneSectionOpen(true);
    }
  }, [doneTasks.length]);

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

  const getPriority = (t: Task): number | null =>
    typeof t.priority === 'number' && t.priority >= 1 && t.priority <= 5
      ? t.priority
      : null;

  /** Sort: priority desc, then due date asc, then title */
  const sortByPriorityAndDueDate = (a: Task, b: Task) => {
    const pa = getPriority(a);
    const pb = getPriority(b);
    if (pa !== pb) {
      if (pa === null) return 1;
      if (pb === null) return -1;
      return pb - pa;
    }
    const da = (a as any).dueDate as string | null | undefined;
    const db = (b as any).dueDate as string | null | undefined;
    if (da && db) return da.localeCompare(db);
    if (da) return -1;
    if (db) return 1;
    return a.title.localeCompare(b.title);
  };

  /** High-priority tasks (rating ≥ 4), shown above Unscheduled (plan view only). */
  const priorityTasks = useMemo(
    () => tasks.filter((t) => {
      const p = getPriority(t);
      return p !== null && p >= 4;
    }).sort(sortByPriorityAndDueDate),
    [tasks]
  );

  // Done task ID set for exclusion from "All tasks"
  const doneIdSet = useMemo(() => new Set(doneTasks.map((t) => t.id)), [doneTasks]);

  /** All non-done tasks sorted by priority then due date for overview. */
  const allTasksSorted = useMemo(() => {
    let base = tasks.filter((t) => !doneIdSet.has(t.id));
    if (overviewRange !== 'month' && timeBlocks) {
      base = base.filter((t) => {
        const hasBlocksInRange = taskIdsInRange.has(t.id);
        const hasAnyBlocks = (t as any).blockCount && (t as any).blockCount > 0;
        return hasBlocksInRange || !hasAnyBlocks;
      });
    }
    return [...base].sort(sortByPriorityAndDueDate);
  }, [tasks, overviewRange, timeBlocks, taskIdsInRange, doneIdSet]);

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
      data-tour="right-sidebar"
      className={`flex flex-col overflow-hidden min-h-0 ${
        isBottomSheet ? 'h-full' : isMobile ? 'w-full' : ''
      }`}
      style={{
        backgroundColor: isDragOverBlock ? 'rgba(141,162,134,0.05)' : BG_PANEL,
        outline: isDragOverBlock ? '2px solid rgba(141,162,134,0.35)' : 'none',
        outlineOffset: '-2px',
        borderLeft: isMobile ? `1px solid ${BORDER}` : 'none',
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Overview toggle + date range filter */}
      <div className="px-3 py-2.5" style={{ borderBottom: `1px solid ${BORDER}` }}>
        <div className="flex items-center justify-between gap-2">
          <SegmentedControl
            options={[
              { value: 'overview', label: 'Overview' },
              { value: 'plan', label: 'Plan' },
            ]}
            value={viewMode}
            onChange={(v) => setViewMode(v as TaskViewMode)}
            compact
          />
          <div className="flex gap-1">
            {(['today', 'week'] as const).map((range) => (
              <button
                key={range}
                type="button"
                onClick={() => setOverviewRange(overviewRange === range ? 'month' : range)}
                className="px-2 py-1 text-xs font-medium rounded-lg transition-all capitalize"
                style={overviewRange === range
                  ? { backgroundColor: 'rgba(141,162,134,0.12)', color: '#8DA286', border: '1px solid rgba(141,162,134,0.28)' }
                  : { backgroundColor: 'rgba(0,0,0,0.04)', color: '#636366', border: '1px solid rgba(0,0,0,0.08)' }}
              >
                {range.charAt(0).toUpperCase() + range.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={`flex-1 min-h-0 overflow-y-auto ${isBottomSheet ? 'px-3 py-3 pb-6' : 'px-3 py-3 pb-8'}`}>
        {viewMode === 'overview' ? (
          <>
            {/* All tasks — sorted by priority then due date, excludes done */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1.5 px-1">
                <h2
                  className="text-sm font-semibold"
                  style={{ fontSize: '14px', color: THEME.textPrimary }}
                >
                  All tasks {allTasksSorted.length > 0 && `(${allTasksSorted.length})`}
                </h2>
                {onOpenAddModal && (
                  <button
                    data-tour="add-task-btn"
                    type="button"
                    onClick={() => onOpenAddModal('task')}
                    className="flex items-center gap-0.5 text-xs transition-colors"
                    style={{ color: THEME.textPrimary }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#8DA286')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = THEME.textPrimary)}
                    title="Add task"
                  >
                    <PlusIcon className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {allTasksSorted.length === 0 ? (
                <div className="text-xs text-center py-4 px-2" style={{ color: '#AEAEB2' }}>
                  {doneTasks.length > 0 ? 'All tasks are done!' : 'No tasks yet'}
                </div>
              ) : (
                <div>
                  {allTasksSorted.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      viewMode="overview"
                      popoverSide="left"
                      onScheduleTask={onOpenScheduleTask ? () => onOpenScheduleTask(task.id) : undefined}
                      onEditTask={onEditTask ? () => onEditTask(task.id) : undefined}
                      onDeleteTask={onDeleteTask ? () => onDeleteTask(task.id) : undefined}
                      onMarkTaskDone={onMarkTaskDone ? () => onMarkTaskDone(task.id) : undefined}
                      onBreakIntoChunks={onBreakIntoChunks}
                      onSplitTask={onSplitTask}
                      onTogglePin={onTogglePin ? () => onTogglePin(task.id) : undefined}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Done section — collapsible, chevron on right */}
            {doneSorted.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setDoneSectionOpen(!doneSectionOpen)}
                  className="flex items-center justify-between w-full text-left px-1 mb-1.5"
                >
                  <h2 className="text-sm font-semibold" style={{ fontSize: '14px', color: THEME.textPrimary }}>
                    Done ({doneSorted.length})
                  </h2>
                  {doneSectionOpen
                    ? <ChevronDownIcon className="h-3 w-3 flex-shrink-0" style={{ color: THEME.textPrimary }} />
                    : <ChevronRightIcon className="h-3 w-3 flex-shrink-0" style={{ color: THEME.textPrimary }} />
                  }
                </button>
                {doneSectionOpen && (
                  <div>
                    {doneSorted.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        viewMode="overview"
                        popoverSide="left"
                        onScheduleTask={onOpenScheduleTask ? () => onOpenScheduleTask(task.id) : undefined}
                        onEditTask={onEditTask ? () => onEditTask(task.id) : undefined}
                        onDeleteTask={onDeleteTask ? () => onDeleteTask(task.id) : undefined}
                        onMarkTaskDone={onMarkTaskDone ? () => onMarkTaskDone(task.id) : undefined}
                        onBreakIntoChunks={onBreakIntoChunks}
                        onSplitTask={onSplitTask}
                        onTogglePin={onTogglePin ? () => onTogglePin(task.id) : undefined}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          /* ─── PLAN VIEW ─── */
          <div className="space-y-4">
            {/* Priority Tasks */}
            {priorityTasks.length > 0 && (
              <div>
                <h2
                  className="text-sm font-semibold mb-2 px-1"
                  style={{ fontSize: '14px', color: THEME.textPrimary }}
                >
                  Priority
                </h2>
                <div className="space-y-2">
                  {priorityTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      viewMode="plan"
                      popoverSide="left"
                      onScheduleTask={onOpenScheduleTask ? () => onOpenScheduleTask(task.id) : undefined}
                      onEditTask={onEditTask ? () => onEditTask(task.id) : undefined}
                      onDeleteTask={onDeleteTask ? () => onDeleteTask(task.id) : undefined}
                      onMarkTaskDone={onMarkTaskDone ? () => onMarkTaskDone(task.id) : undefined}
                      onBreakIntoChunks={onBreakIntoChunks}
                      onSplitTask={onSplitTask}
                      onTogglePin={onTogglePin ? () => onTogglePin(task.id) : undefined}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Unscheduled Tasks */}
            <div>
              <h2 className="text-sm font-semibold mb-2 px-1" style={{ fontSize: '14px', color: THEME.textPrimary }}>Unscheduled</h2>
              {onOpenAddModal && (
                <button
                  type="button"
                  onClick={() => onOpenAddModal('task')}
                  className="w-full py-2 px-3 mb-3 rounded-xl text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
                  style={{
                    border: '1.5px dashed rgba(0,0,0,0.15)',
                    color: '#636366',
                    backgroundColor: 'transparent',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)';
                    e.currentTarget.style.borderColor = 'rgba(141,162,134,0.50)';
                    e.currentTarget.style.color = '#8DA286';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.borderColor = 'rgba(0,0,0,0.15)';
                    e.currentTarget.style.color = '#636366';
                  }}
                >
                  <PlusIcon className="h-3.5 w-3.5" />
                  Add task
                </button>
              )}
              <div className="space-y-2">
                {unscheduledTasks.length === 0 ? (
                  <div className="text-xs text-center py-4" style={{ color: '#AEAEB2' }}>No unscheduled tasks</div>
                ) : (
                  unscheduledTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      viewMode="plan"
                      popoverSide="left"
                      onScheduleTask={onOpenScheduleTask ? () => onOpenScheduleTask(task.id) : undefined}
                      onEditTask={onEditTask ? () => onEditTask(task.id) : undefined}
                      onDeleteTask={onDeleteTask ? () => onDeleteTask(task.id) : undefined}
                      onMarkTaskDone={onMarkTaskDone ? () => onMarkTaskDone(task.id) : undefined}
                      onBreakIntoChunks={onBreakIntoChunks}
                      onSplitTask={onSplitTask}
                      onTogglePin={onTogglePin ? () => onTogglePin(task.id) : undefined}
                    />
                  ))
                )}
              </div>
            </div>

            {/* Partially Completed */}
            {partiallyCompletedTasks.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold mb-2 px-1" style={{ fontSize: '14px', color: THEME.textPrimary }}>In progress</h2>
                <div className="space-y-2">
                  {filteredPartially.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      viewMode="plan"
                      popoverSide="left"
                      onScheduleTask={onOpenScheduleTask ? () => onOpenScheduleTask(task.id) : undefined}
                      onEditTask={onEditTask ? () => onEditTask(task.id) : undefined}
                      onDeleteTask={onDeleteTask ? () => onDeleteTask(task.id) : undefined}
                      onMarkTaskDone={onMarkTaskDone ? () => onMarkTaskDone(task.id) : undefined}
                      onBreakIntoChunks={onBreakIntoChunks}
                      onSplitTask={onSplitTask}
                      onTogglePin={onTogglePin ? () => onTogglePin(task.id) : undefined}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Fixed / Missed */}
            {fixedMissedTasks.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold mb-2 px-1" style={{ fontSize: '14px', color: THEME.textPrimary }}>Fixed / missed</h2>
                <div className="space-y-2">
                  {filteredFixed.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      viewMode="plan"
                      popoverSide="left"
                      onScheduleTask={onOpenScheduleTask ? () => onOpenScheduleTask(task.id) : undefined}
                      onEditTask={onEditTask ? () => onEditTask(task.id) : undefined}
                      onDeleteTask={onDeleteTask ? () => onDeleteTask(task.id) : undefined}
                      onMarkTaskDone={onMarkTaskDone ? () => onMarkTaskDone(task.id) : undefined}
                      onBreakIntoChunks={onBreakIntoChunks}
                      onSplitTask={onSplitTask}
                      onTogglePin={onTogglePin ? () => onTogglePin(task.id) : undefined}
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
                  className="flex items-center justify-between w-full text-left px-1 mb-2"
                >
                  <h2 className="text-sm font-semibold" style={{ fontSize: '14px', color: THEME.textPrimary }}>
                    Done ({doneSorted.length})
                  </h2>
                  {doneSectionOpen
                    ? <ChevronDownIcon className="h-3 w-3 flex-shrink-0" style={{ color: THEME.textPrimary }} />
                    : <ChevronRightIcon className="h-3 w-3 flex-shrink-0" style={{ color: THEME.textPrimary }} />
                  }
                </button>
                {doneSectionOpen && (
                  <div className="space-y-2">
                    {doneSorted.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        viewMode="plan"
                        popoverSide="left"
                        onScheduleTask={onOpenScheduleTask ? () => onOpenScheduleTask(task.id) : undefined}
                        onEditTask={onEditTask ? () => onEditTask(task.id) : undefined}
                        onDeleteTask={onDeleteTask ? () => onDeleteTask(task.id) : undefined}
                        onMarkTaskDone={onMarkTaskDone ? () => onMarkTaskDone(task.id) : undefined}
                        onBreakIntoChunks={onBreakIntoChunks}
                        onSplitTask={onSplitTask}
                        onTogglePin={onTogglePin ? () => onTogglePin(task.id) : undefined}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Events */}
            {upcomingEvents.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold mb-2 px-1" style={{ fontSize: '14px', color: THEME.textPrimary }}>Upcoming events</h2>
                <div className="space-y-2">
                  {upcomingEvents.map((event) => (
                    <div
                      key={event.id}
                      className="flex items-center gap-2 px-3 py-3 rounded-xl group"
                      style={{
                        backgroundColor: 'rgba(0,0,0,0.04)',
                        border: '1px solid rgba(0,0,0,0.06)',
                        borderLeft: '3px solid #8DA286',
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="truncate" style={{ fontSize: 13, fontWeight: 600, color: THEME.textPrimary, lineHeight: 1.3 }}>{event.title}</div>
                        <div className="mt-1 truncate" style={{ fontSize: 11, color: THEME.textPrimary, lineHeight: 1.4 }}>{event.start} – {event.end} · {event.date}</div>
                      </div>
                      {onDeleteEvent && (
                        <button
                          className="opacity-0 group-hover:opacity-100 p-1 rounded-lg transition-all flex-shrink-0"
                          style={{ color: '#AEAEB2' }}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.07)'; e.currentTarget.style.color = THEME.textPrimary; }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#AEAEB2'; }}
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
        )}
      </div>
    </div>
  );
}
