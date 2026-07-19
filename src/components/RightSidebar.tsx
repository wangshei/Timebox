import React, { useMemo, useState } from 'react';
import { Task, Category, Tag } from '../App';
import { getLocalDateString } from '../utils/dateTime';
import { TaskCard } from './TaskCard';
import { PlusIcon, BoltIcon } from '@heroicons/react/24/solid';
import type { TimeBlock, Event } from '../types';
import { SegmentedControl } from './ui/SegmentedControl';
import { THEME } from '../constants/colors';
import { activeDrag, registerDropZone, unregisterDropZone } from '../utils/dragState';

const BORDER = 'rgba(0,0,0,0.08)';
const BG_PANEL = '#FCFBF7';

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
  onDeleteEventSeries?: (eventId: string, scope: 'this' | 'all' | 'all_after') => void;
  isMobile?: boolean;
  isBottomSheet?: boolean;
  onTogglePin?: (taskId: string) => void;
  onRescheduleLater?: (taskId: string) => void;
  /** Auto-schedule all unscheduled tasks into free calendar slots. Receives task IDs in desired order. */
  onAutoSchedule?: (taskIds: string[]) => void;
  weekStartsOnMonday?: boolean;
  onResizeTask?: (taskId: string, newEstimatedMinutes: number) => void;
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
  onDeleteEventSeries,
  isMobile = false,
  isBottomSheet = false,
  onTogglePin,
  onRescheduleLater,
  onAutoSchedule,
  weekStartsOnMonday = false,
  onResizeTask,
}: RightSidebarProps) {
  const [isDragOverBlock, setIsDragOverBlock] = useState(false);
  // Plan toggle: OFF = compact list rows, ON = duration-sized cards.
  const [planMode, setPlanMode] = useState(false);
  // Grouping: by the day each to-do is scheduled on, or by its due date.
  const [groupBy, setGroupBy] = useState<'day' | 'due'>('day');

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

  const doneIdSet = useMemo(() => new Set(doneTasks.map((t) => t.id)), [doneTasks]);

  const sortedUnscheduled = useMemo(
    () => [...unscheduledTasks].sort(sortByUrgencyAndPriority),
    [unscheduledTasks, todayStr],
  );

  // ─── Grouping: "By day" (scheduled day) or "By due" (due date) ─────────────

  /** Earliest scheduled (planned) block date for a task, or null if unscheduled. */
  const scheduledDateOf = (taskId: string): string | null => {
    let min: string | null = null;
    for (const b of timeBlocks ?? []) {
      if (b.taskId === taskId && (min === null || b.date < min)) min = b.date;
    }
    return min;
  };

  const dayLabel = (key: string): string => {
    if (key === 'unscheduled') return 'Unscheduled';
    if (key === 'none') return 'No due date';
    if (key === todayStr) return 'Today';
    if (key === tomorrowStr) return 'Tomorrow';
    const [y, m, d] = key.split('-').map(Number);
    const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
    const label = dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    return key < todayStr ? `${label} · overdue` : label;
  };

  const groups = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      const key = groupBy === 'day'
        ? (scheduledDateOf(t.id) ?? 'unscheduled')
        : (((t as any).dueDate as string | null) || 'none');
      const arr = map.get(key) ?? [];
      arr.push(t);
      map.set(key, arr);
    }
    const special = groupBy === 'day' ? 'unscheduled' : 'none';
    const dateKeys = [...map.keys()].filter((k) => k !== special).sort();
    const orderedKeys = groupBy === 'day'
      ? [...(map.has('unscheduled') ? ['unscheduled'] : []), ...dateKeys]   // unscheduled first, then chronological
      : [...dateKeys, ...(map.has('none') ? ['none'] : [])];                // overdue→future, no-due-date last
    return orderedKeys.map((key) => {
      const list = map.get(key)!.slice().sort((a, b) => {
        const ad = doneIdSet.has(a.id) ? 1 : 0;
        const bd = doneIdSet.has(b.id) ? 1 : 0;
        if (ad !== bd) return ad - bd; // not-done first, done sinks to the bottom of its day
        return sortByUrgencyAndPriority(a, b);
      });
      return { key, label: dayLabel(key), tasks: list };
    });
  }, [tasks, timeBlocks, groupBy, doneIdSet, todayStr, tomorrowStr]);

  // ─── Drag & drop (pointer-based) ──────────────────────────────────────────
  const sidebarDropRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = sidebarDropRef.current;
    if (!el || !onDropBlock) return;
    registerDropZone(el, {
      onOver: () => {
        if (activeDrag.type === 'block') setIsDragOverBlock(true);
      },
      onLeave: () => setIsDragOverBlock(false),
      onDrop: () => {
        setIsDragOverBlock(false);
        if (activeDrag.type === 'block' && activeDrag.id && onDropBlock) {
          onDropBlock(activeDrag.id);
        }
      },
    });
    return () => unregisterDropZone(el);
  }, [onDropBlock]);

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
      onResizeTask={onResizeTask}
    />
  );

  const totalTasks = tasks.length;

  const renderGroupedView = () => {
    if (totalTasks === 0) {
      return (
        <div className="text-xs text-center py-6 px-2" style={{ color: '#AEAEB2' }}>No to-dos yet</div>
      );
    }
    return (
      <div className="space-y-4">
        {groups.map((group) => {
          const isUnscheduled = group.key === 'unscheduled';
          return (
            <div key={group.key}>
              <div className="flex items-center justify-between mb-1.5 px-1">
                <h2 className="text-sm font-semibold flex items-center gap-1.5" style={{ fontSize: 13, color: THEME.textPrimary }}>
                  {group.label}
                  <span style={{ fontSize: 11, color: '#AEAEB2', fontWeight: 500 }}>{group.tasks.length}</span>
                </h2>
                {isUnscheduled && onAutoSchedule && group.tasks.some((t) => !doneIdSet.has(t.id)) && (
                  <button
                    type="button"
                    onClick={() => onAutoSchedule(group.tasks.filter((t) => !doneIdSet.has(t.id)).map((t) => t.id))}
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
              <div className={planMode ? 'space-y-2' : ''}>
                {group.tasks.map((task) => renderTaskCard(task, planMode ? 'plan' : 'overview'))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  const groupOptions: Array<{ value: 'day' | 'due'; label: string }> = [
    { value: 'day', label: 'By day' },
    { value: 'due', label: 'By due' },
  ];

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
      ref={sidebarDropRef}
    >
      {/* Controls: grouping switch · Plan toggle · add */}
      <div className="px-3 pt-2 pb-2.5 flex-shrink-0">
        <div className="flex items-center justify-between gap-2">
          <SegmentedControl
            options={groupOptions}
            value={groupBy}
            onChange={(v) => setGroupBy(v as 'day' | 'due')}
            compact
          />
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPlanMode((v) => !v)}
              className="px-2.5 py-1 text-xs font-medium rounded-lg transition-all"
              style={planMode
                ? { backgroundColor: 'rgba(141,162,134,0.14)', color: '#8DA286', border: '1px solid rgba(141,162,134,0.30)' }
                : { backgroundColor: 'rgba(0,0,0,0.04)', color: '#636366', border: '1px solid rgba(0,0,0,0.08)' }}
              title="Toggle plan view — sizes each to-do by how long it takes"
            >
              Plan
            </button>
            {onOpenAddModal && (
              <button
                data-tour="add-task-btn"
                type="button"
                onClick={() => onOpenAddModal('task')}
                className="flex items-center justify-center rounded-lg transition-colors"
                style={{ width: 26, height: 26, color: '#636366', backgroundColor: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.08)' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#8DA286'; e.currentTarget.style.borderColor = 'rgba(141,162,134,0.40)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#636366'; e.currentTarget.style.borderColor = 'rgba(0,0,0,0.08)'; }}
                title="Add to-do"
              >
                <PlusIcon className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Scrollable content */}
      <div className={`flex-1 min-h-0 overflow-y-auto overflow-x-hidden ${isBottomSheet ? 'px-3 py-3 pb-6' : 'px-3 py-3 pb-8'}`}>
        {renderGroupedView()}
      </div>
    </div>
  );
}
