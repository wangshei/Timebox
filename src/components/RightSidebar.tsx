import React, { useMemo, useState, useEffect } from 'react';
import { Task, Category, Tag } from '../App';
import { getLocalDateString, getStartOfWeek } from '../utils/dateTime';
import { TaskCard } from './TaskCard';
import { PlusIcon, XMarkIcon, ChevronDownIcon, ChevronRightIcon, BoltIcon } from '@heroicons/react/24/solid';
import type { TimeBlock, Event, RecurrencePattern } from '../types';
import { SegmentedControl } from './ui/SegmentedControl';
import { THEME } from '../constants/colors';

const BORDER = 'rgba(0,0,0,0.08)';
const BG_PANEL = '#FCFBF7';

function recurrencePatternLabel(pattern: RecurrencePattern | undefined): string {
  switch (pattern) {
    case 'daily': return 'day';
    case 'every_other_day': return 'other day';
    case 'weekly': return 'week';
    case 'monthly': return 'month';
    case 'custom': return 'custom';
    default: return '';
  }
}

export type TaskViewMode = 'overview' | 'plan';

interface RightSidebarProps {
  tasks: Task[];
  unscheduledTasks: Task[];
  partiallyCompletedTasks: Task[];
  fixedMissedTasks?: Task[];
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
  onMarkTaskDone?: (taskId: string) => void;
  onOpenAddModal?: (mode: 'task' | 'event') => void;
  onDropBlock?: (blockId: string) => void;
  onBreakIntoChunks?: (taskId: string, chunkMinutes: number) => void;
  onSplitTask?: (taskId: string, chunkMinutes: number) => void;
  events?: Event[];
  onDeleteEvent?: (eventId: string) => void;
  isMobile?: boolean;
  isBottomSheet?: boolean;
  onTogglePin?: (taskId: string) => void;
  onRescheduleLater?: (taskId: string) => void;
  /** Auto-schedule all unscheduled tasks into free calendar slots. Receives task IDs in desired order. */
  onAutoSchedule?: (taskIds: string[]) => void;
  weekStartsOnMonday?: boolean;
}

export function RightSidebar({
  tasks,
  unscheduledTasks,
  partiallyCompletedTasks,
  fixedMissedTasks = [],
  doneTasks = [],
  selectedDate = getLocalDateString(),
  timeBlocks,
  categories,
  tags,
  onAddTask,
  onOpenScheduleTask,
  onEditTask,
  onDeleteTask,
  onMarkTaskDone,
  onOpenAddModal,
  onDropBlock,
  onBreakIntoChunks,
  onSplitTask,
  events = [],
  onDeleteEvent,
  isMobile = false,
  isBottomSheet = false,
  onTogglePin,
  onRescheduleLater,
  onAutoSchedule,
  weekStartsOnMonday = false,
}: RightSidebarProps) {
  const [viewMode, setViewMode] = useState<TaskViewMode>('plan');
  const [overviewRange, setOverviewRange] = useState<'today' | 'week' | 'month'>('month');
  const [isDragOverBlock, setIsDragOverBlock] = useState(false);
  const [doneSectionOpen, setDoneSectionOpen] = useState(false);

  useEffect(() => {
    if (doneTasks.length > 0 && !doneSectionOpen) {
      setDoneSectionOpen(true);
    }
  }, [doneTasks.length]);

  // ─── Date range helpers ───────────────────────────────────────────────────

  const dateSet = useMemo(() => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const base = new Date(y, (m ?? 1) - 1, d ?? 1);
    if (overviewRange === 'today') return new Set([selectedDate]);
    if (overviewRange === 'week') {
      const start = getStartOfWeek(base, weekStartsOnMonday);
      const s = new Set<string>();
      for (let i = 0; i < 7; i++) {
        const di = new Date(start);
        di.setDate(start.getDate() + i);
        s.add(getLocalDateString(di));
      }
      return s;
    }
    const s = new Set<string>();
    const first = new Date(base.getFullYear(), base.getMonth(), 1);
    const next = new Date(base.getFullYear(), base.getMonth() + 1, 1);
    for (let dt = new Date(first); dt < next; dt.setDate(dt.getDate() + 1)) {
      s.add(getLocalDateString(dt));
    }
    return s;
  }, [selectedDate, overviewRange, weekStartsOnMonday]);

  const taskIdsInRange = useMemo(() => {
    const set = new Set<string>();
    (timeBlocks ?? []).forEach((b) => {
      if (b.taskId && dateSet.has(b.date)) set.add(b.taskId);
    });
    return set;
  }, [timeBlocks, dateSet]);

  // ─── Events ───────────────────────────────────────────────────────────────

  const upcomingEvents = useMemo(() => {
    const today = getLocalDateString();
    return events
      .filter((e) => e.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
  }, [events]);

  const upcomingEventsInRange = useMemo(() => {
    if (overviewRange === 'month') return upcomingEvents;
    return upcomingEvents.filter((e) => dateSet.has(e.date));
  }, [upcomingEvents, dateSet, overviewRange]);

  const upcomingEventsDisplay = useMemo(() => {
    const seenSeries = new Set<string | null>();
    const result: Array<{ event: Event; isRecurringSummary: boolean }> = [];
    for (const e of upcomingEventsInRange) {
      const seriesId = e.recurring ? (e.recurrenceSeriesId ?? e.id) : null;
      if (seriesId !== null) {
        if (seenSeries.has(seriesId)) continue;
        seenSeries.add(seriesId);
        result.push({ event: e, isRecurringSummary: true });
      } else {
        result.push({ event: e, isRecurringSummary: false });
      }
    }
    return result;
  }, [upcomingEventsInRange]);

  // ─── Task sections (plan mode) ────────────────────────────────────────────

  const filteredPartially = useMemo(() => {
    if (overviewRange === 'month' || !timeBlocks) return partiallyCompletedTasks;
    return partiallyCompletedTasks.filter((t) => taskIdsInRange.has(t.id));
  }, [partiallyCompletedTasks, taskIdsInRange, timeBlocks, overviewRange]);

  const filteredFixed = useMemo(() => {
    if (overviewRange === 'month' || !timeBlocks) return fixedMissedTasks;
    return fixedMissedTasks.filter((t) => taskIdsInRange.has(t.id));
  }, [fixedMissedTasks, taskIdsInRange, timeBlocks, overviewRange]);

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

  const filteredDoneSorted = useMemo(() => {
    if (overviewRange === 'month' || !timeBlocks) return doneSorted;
    return doneSorted.filter((t) => taskIdsInRange.has(t.id));
  }, [doneSorted, taskIdsInRange, overviewRange, timeBlocks]);

  const getPriority = (t: Task): number | null =>
    typeof t.priority === 'number' && t.priority >= 1 && t.priority <= 5
      ? t.priority
      : null;

  // ─── Urgency-aware sort ────────────────────────────────────────────────────
  // Tier 0: Past due
  // Tier 1: Due today / tomorrow (within 1 day)
  // Tier 2: Due within 2 days AND high priority (4-5)
  // Tier 3: High priority (4-5)
  // Tier 4: Has priority (1-3)
  // Tier 5: Has due date
  // Tier 6: Everything else
  const { today: todayStr, tomorrow: tomorrowStr, dayAfter: dayAfterStr } = useMemo(() => {
    const now = new Date();
    const today = getLocalDateString(now);
    const tom = new Date(now); tom.setDate(tom.getDate() + 1);
    const da2 = new Date(now); da2.setDate(da2.getDate() + 2);
    return { today: today, tomorrow: getLocalDateString(tom), dayAfter: getLocalDateString(da2) };
  }, []);

  const getUrgencyTier = (t: Task): number => {
    const due = (t as any).dueDate as string | null | undefined;
    const p = getPriority(t) ?? 0;
    if (due && due < todayStr) return 0;        // past due
    if (due && due <= tomorrowStr) return 1;     // due today or tomorrow
    if (due && due <= dayAfterStr && p >= 4) return 2; // due in 2 days + high priority
    if (p >= 4) return 3;                        // high priority
    if (p > 0) return 4;                         // has priority
    if (due) return 5;                           // has due date
    return 6;
  };

  const sortByUrgencyAndPriority = (a: Task, b: Task) => {
    const ta = getUrgencyTier(a);
    const tb = getUrgencyTier(b);
    if (ta !== tb) return ta - tb;
    // Within same tier, sort by due date earliest first, then priority highest first
    const da = (a as any).dueDate as string | null | undefined;
    const db = (b as any).dueDate as string | null | undefined;
    if (da && db && da !== db) return da.localeCompare(db);
    if (da && !db) return -1;
    if (!da && db) return 1;
    const pa = getPriority(a) ?? 0;
    const pb = getPriority(b) ?? 0;
    if (pa !== pb) return pb - pa;
    return a.title.localeCompare(b.title);
  };

  const priorityTasks = useMemo(
    () => tasks.filter((t) => {
      const p = getPriority(t);
      return p !== null && p >= 4;
    }).sort(sortByUrgencyAndPriority),
    [tasks, todayStr],
  );

  // ─── Overview mode: all non-done tasks in a flat list ─────────────────────

  const doneIdSet = useMemo(() => new Set(doneTasks.map((t) => t.id)), [doneTasks]);

  const allTasksSorted = useMemo(() => {
    let base = tasks.filter((t) => !doneIdSet.has(t.id));
    if (overviewRange !== 'month' && timeBlocks) {
      base = base.filter((t) => {
        const hasBlocksInRange = taskIdsInRange.has(t.id);
        const hasAnyBlocks = (t as any).blockCount && (t as any).blockCount > 0;
        return hasBlocksInRange || !hasAnyBlocks;
      });
    }
    return [...base].sort(sortByUrgencyAndPriority);
  }, [tasks, overviewRange, timeBlocks, taskIdsInRange, doneIdSet, todayStr]);

  const sortedUnscheduled = useMemo(
    () => [...unscheduledTasks].sort(sortByUrgencyAndPriority),
    [unscheduledTasks, todayStr],
  );

  // ─── Drag & drop ──────────────────────────────────────────────────────────

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

  // ─── Shared helpers ───────────────────────────────────────────────────────

  const renderTaskCard = (task: Task, mode: 'overview' | 'plan') => (
    <TaskCard
      key={task.id}
      task={task}
      viewMode={mode}
      popoverSide="left"
      onScheduleTask={onOpenScheduleTask ? () => onOpenScheduleTask(task.id) : undefined}
      onEditTask={onEditTask ? () => onEditTask(task.id) : undefined}
      onDeleteTask={onDeleteTask ? () => onDeleteTask(task.id) : undefined}
      onMarkTaskDone={onMarkTaskDone ? () => onMarkTaskDone(task.id) : undefined}
      onBreakIntoChunks={onBreakIntoChunks}
      onSplitTask={onSplitTask}
      onTogglePin={onTogglePin ? () => onTogglePin(task.id) : undefined}
      onRescheduleLater={onRescheduleLater ? () => onRescheduleLater(task.id) : undefined}
    />
  );

  const renderEventsSection = () => {
    if (upcomingEventsDisplay.length === 0) return null;
    return (
      <div>
        <h2 className="text-sm font-semibold mb-2 px-1" style={{ fontSize: '14px', color: THEME.textPrimary }}>Upcoming events</h2>
        <div className="space-y-2">
          {upcomingEventsDisplay.map(({ event, isRecurringSummary }) => (
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
                <div className="mt-1 truncate" style={{ fontSize: 11, color: THEME.textPrimary, lineHeight: 1.4 }}>
                  {event.start} – {event.end}
                  {isRecurringSummary
                    ? ` · ${recurrencePatternLabel(event.recurrencePattern) ? `Recurring every ${recurrencePatternLabel(event.recurrencePattern)}` : 'Recurring'}`
                    : ` · ${event.date}`}
                </div>
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
    );
  };

  const renderDoneSection = (mode: 'overview' | 'plan') => {
    if (filteredDoneSorted.length === 0) return null;
    return (
      <div>
        <button
          type="button"
          onClick={() => setDoneSectionOpen(!doneSectionOpen)}
          className="flex items-center justify-between w-full text-left px-1 mb-1.5"
        >
          <h2 className="text-sm font-semibold" style={{ fontSize: '14px', color: THEME.textPrimary }}>
            Done ({filteredDoneSorted.length})
          </h2>
          {doneSectionOpen
            ? <ChevronDownIcon className="h-3 w-3 flex-shrink-0" style={{ color: THEME.textPrimary }} />
            : <ChevronRightIcon className="h-3 w-3 flex-shrink-0" style={{ color: THEME.textPrimary }} />
          }
        </button>
        {doneSectionOpen && (
          <div className={mode === 'plan' ? 'space-y-2' : ''}>
            {filteredDoneSorted.map((task) => renderTaskCard(task, mode))}
          </div>
        )}
      </div>
    );
  };

  // ─── Overview view ────────────────────────────────────────────────────────

  const renderOverviewView = () => (
    <>
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
            {allTasksSorted.map((task) => renderTaskCard(task, 'overview'))}
          </div>
        )}
      </div>

      {renderDoneSection('overview')}
    </>
  );

  // ─── Plan view ────────────────────────────────────────────────────────────

  const renderPlanView = () => (
    <div className="space-y-4">
      {/* Priority Tasks */}
      {priorityTasks.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-2 px-1" style={{ fontSize: '14px', color: THEME.textPrimary }}>Priority</h2>
          <div className="space-y-2">
            {priorityTasks.map((task) => renderTaskCard(task, 'plan'))}
          </div>
        </div>
      )}

      {/* Unscheduled Tasks */}
      <div>
        <div className="flex items-center justify-between mb-2 px-1">
          <h2 className="text-sm font-semibold" style={{ fontSize: '14px', color: THEME.textPrimary }}>Unscheduled</h2>
          {onAutoSchedule && sortedUnscheduled.length > 0 && (
            <button
              type="button"
              onClick={() => onAutoSchedule(sortedUnscheduled.map((t) => t.id))}
              className="flex items-center gap-1 text-xs font-medium transition-colors rounded-md px-2 py-1"
              style={{ color: '#8DA286', backgroundColor: 'rgba(141,162,134,0.08)', border: '1px solid rgba(141,162,134,0.20)' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(141,162,134,0.16)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(141,162,134,0.08)'; }}
            >
              <BoltIcon className="h-3 w-3" />
              Auto Schedule
            </button>
          )}
        </div>
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
          {sortedUnscheduled.length === 0 ? (
            <div className="text-xs text-center py-4" style={{ color: '#AEAEB2' }}>No unscheduled tasks</div>
          ) : (
            sortedUnscheduled.map((task) => renderTaskCard(task, 'plan'))
          )}
        </div>
      </div>

      {/* Partially Completed */}
      {filteredPartially.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-2 px-1" style={{ fontSize: '14px', color: THEME.textPrimary }}>In progress</h2>
          <div className="space-y-2">
            {filteredPartially.map((task) => renderTaskCard(task, 'plan'))}
          </div>
        </div>
      )}

      {/* Fixed / Missed */}
      {filteredFixed.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-2 px-1" style={{ fontSize: '14px', color: THEME.textPrimary }}>Fixed / missed</h2>
          <div className="space-y-2">
            {filteredFixed.map((task) => renderTaskCard(task, 'plan'))}
          </div>
        </div>
      )}

      {/* Done */}
      {renderDoneSection('plan')}

      {/* Events */}
      {renderEventsSection()}
    </div>
  );

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      data-tour="right-sidebar"
      className={`flex flex-col overflow-hidden min-h-0 h-full ${
        isMobile && !isBottomSheet ? 'w-full' : ''
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
      {/* Overview / Plan toggle + date range filter */}
      <div className="px-3 py-2.5 flex-shrink-0" style={{ borderBottom: `1px solid ${BORDER}` }}>
        <div className="flex items-center justify-between gap-2">
          <SegmentedControl
            options={[
              { value: 'plan', label: 'Plan' },
              { value: 'overview', label: 'Overview' },
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

      {/* Scrollable content */}
      <div className={`flex-1 min-h-0 overflow-y-auto overflow-x-hidden ${isBottomSheet ? 'px-3 py-3 pb-6' : 'px-3 py-3 pb-8'}`}>
        {viewMode === 'overview' ? renderOverviewView() : renderPlanView()}
      </div>
    </div>
  );
}
