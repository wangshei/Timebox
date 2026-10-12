import { FEATURES } from '../config/features';
import React, { useMemo, useState } from 'react';
import { Task, Category, Tag } from '../App';
import { getLocalDateString, getStartOfWeek } from '../utils/dateTime';
import { TaskCard } from './TaskCard';
import { PlusIcon, BoltIcon, ChevronDownIcon, ChevronRightIcon, RectangleStackIcon } from '@heroicons/react/24/outline';
import type { TimeBlock, Event } from '../types';
import { SegmentedControl } from './ui/SegmentedControl';
import { THEME } from '../constants/colors';
import { activeDrag, registerDropZone, unregisterDropZone } from '../utils/dragState';
import { COLOR } from '../styles/tokens';
import { Button, IconButton } from './ds';
import { MiniMonth } from './MiniMonth';

const BORDER = COLOR.border;
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
  /** Main calendar view + date setter; enables the desktop mini-month picker above the list */
  view?: 'day' | '3day' | 'week' | 'month';
  onSelectedDateChange?: (date: string) => void;
  onResizeTask?: (taskId: string, newEstimatedMinutes: number) => void;
  /** Extra controls rendered at the end of the To-Dos header row. */
  headerExtra?: React.ReactNode;
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
  view,
  onSelectedDateChange,
  onResizeTask,
  headerExtra,
}: RightSidebarProps) {
  const [isDragOverBlock, setIsDragOverBlock] = useState(false);
  // Plan toggle: OFF = compact list rows, ON = duration-sized cards.
  const [planMode, setPlanMode] = useState(false);
  // Grouping: by the day each to-do is scheduled on, or by its due date.
  const [groupBy, setGroupBy] = useState<'day' | 'due'>('day');
  // Done section is folded away by default.
  const [doneOpen, setDoneOpen] = useState(false);

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

  // The week currently shown on the calendar (the week containing selectedDate).
  const weekSet = useMemo(() => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const base = new Date(y, (m ?? 1) - 1, d ?? 1);
    const start = getStartOfWeek(base, weekStartsOnMonday);
    const s = new Set<string>();
    for (let i = 0; i < 7; i++) {
      const di = new Date(start);
      di.setDate(start.getDate() + i);
      s.add(getLocalDateString(di));
    }
    return s;
  }, [selectedDate, weekStartsOnMonday]);

  const weekRangeLabel = useMemo(() => {
    const dates = [...weekSet].sort();
    const fmt = (k: string) => {
      const [y, m, d] = k.split('-').map(Number);
      return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    };
    return dates.length ? `${fmt(dates[0])} – ${fmt(dates[dates.length - 1])}` : '';
  }, [weekSet]);

  // Split tasks into three consistent buckets (same in both grouping modes):
  //  • Unscheduled = any to-do with NO time block (not on the calendar) → bottom section.
  //  • Done       = completed to-dos scheduled in the shown week, grouped by day → fold.
  //  • Main       = the rest (scheduled, not done): "By day" is week-filtered + grouped by
  //                 scheduled day; "By due" groups by due date across all weeks.
  const { mainGroups, unscheduledList, doneList } = useMemo(() => {
    const mainMap = new Map<string, Task[]>();
    const doneAll: Task[] = [];
    const unscheduled: Task[] = [];
    const push = (map: Map<string, Task[]>, key: string, t: Task) => {
      const arr = map.get(key); if (arr) arr.push(t); else map.set(key, [t]);
    };
    for (const t of tasks) {
      const sd = scheduledDateOf(t.id);
      const done = doneIdSet.has(t.id);
      // Every completed to-do (with or without a block, any week) lives in the Done fold (N-02).
      if (done) { if (t.isTodo !== false) doneAll.push(t); continue; }
      if (!sd) { unscheduled.push(t); continue; }   // no block → Unscheduled
      if (groupBy === 'day') {
        if (weekSet.has(sd)) push(mainMap, sd, t);             // week-filtered scheduled view
      } else {
        push(mainMap, ((t as any).dueDate as string | null) || 'none', t); // by due date, all weeks
      }
    }
    const toGroups = (map: Map<string, Task[]>) =>
      [...map.keys()].sort().map((key) => ({
        key,
        label: dayLabel(key),
        tasks: map.get(key)!.slice().sort(sortByUrgencyAndPriority),
      }));
    return {
      mainGroups: toGroups(mainMap),
      unscheduledList: unscheduled.slice().sort(sortByUrgencyAndPriority),
      doneList: doneAll.slice().sort((a, b) => a.title.localeCompare(b.title)),
    };
  }, [tasks, timeBlocks, groupBy, doneIdSet, weekSet, todayStr, tomorrowStr]);

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

  const SectionLabel = ({ label, count, action }: { label: string; count: number; action?: React.ReactNode }) => (
    <div className="flex items-center justify-between" style={{ height: 24, padding: '0 4px', marginBottom: 4 }}>
      <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--tb-muted)' }}>
        {label}<span style={{ marginLeft: 6, fontWeight: 500, color: 'var(--tb-faint)' }}>{count}</span>
      </span>
      {action}
    </div>
  );

  const renderList = (list: Task[]) => (
    <div className="flex flex-col" style={{ gap: 2 }}>
      {list.map((task) => renderTaskCard(task, planMode ? 'plan' : 'overview'))}
    </div>
  );

  const renderGroups = (groupList: Array<{ key: string; label: string; tasks: Task[] }>) => (
    <>
      {groupList.map((group) => (
        <section key={group.key} style={{ marginTop: 16 }}>
          <SectionLabel label={group.label} count={group.tasks.length} />
          {renderList(group.tasks)}
        </section>
      ))}
    </>
  );

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
      {!isMobile && view && onSelectedDateChange && (
        <div className="flex-shrink-0" style={{ padding: 'var(--tb-sp-2) 0 var(--tb-sp-1)' }}>
          <MiniMonth selectedDate={selectedDate} view={view} onSelect={onSelectedDateChange} weekStartsOnMonday={weekStartsOnMonday} />
        </div>
      )}

      {/* Header: title + controls, below the mini month */}
      <div className="flex-shrink-0" style={{ padding: 'var(--tb-sp-3) var(--tb-sp-4) var(--tb-sp-2)', borderTop: !isMobile && view ? `1px solid ${BORDER}` : 'none' }}>
        <div className="flex items-center justify-between" style={{ height: 28 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--tb-text)' }}>To-Dos</span>
          <div className="flex items-center" style={{ gap: 4 }}>
            {headerExtra}
            <SegmentedControl
              options={groupOptions}
              value={groupBy}
              onChange={(v) => setGroupBy(v as 'day' | 'due')}
              compact
              size="sm"
            />
            <IconButton
              icon={RectangleStackIcon}
              size={isMobile ? 'touch' : 'md'}
              variant="ghost"
              active={planMode}
              onClick={() => setPlanMode((v) => !v)}
              title="Plan view — sizes each to-do by how long it takes"
              aria-label="Toggle plan view"
              aria-pressed={planMode}
              style={{ color: planMode ? 'var(--tb-accent)' : 'var(--tb-text-2)' }}
            />
            {onOpenAddModal && (
              <IconButton
                data-tour="add-task-btn"
                icon={PlusIcon}
                size={isMobile ? 'touch' : 'md'}
                variant="ghost"
                onClick={() => onOpenAddModal('task')}
                title="Add note or to-do"
                aria-label="Add note or to-do"
              />
            )}
          </div>
        </div>
      </div>

      {/* One calm scroll area: sections, then Unscheduled, then the Done fold */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden" style={{ padding: '0 var(--tb-sp-3) var(--tb-sp-4)' }}>
        {groupBy === 'day' && (
          <div style={{ fontSize: 11, color: 'var(--tb-faint)', padding: '0 4px' }}>Week of {weekRangeLabel}</div>
        )}
        {mainGroups.length === 0 ? (
          <div className="text-center" style={{ fontSize: 12, color: 'var(--tb-faint)', padding: '16px 8px 0' }}>
            {groupBy === 'day' ? 'Nothing scheduled this week' : 'No scheduled to-dos'}
          </div>
        ) : (
          renderGroups(mainGroups)
        )}

        <section style={{ marginTop: 16 }}>
          <SectionLabel
            label="Unscheduled"
            count={unscheduledList.length}
            action={FEATURES.autoSchedule && onAutoSchedule && unscheduledList.length > 0 ? (
              <Button
                size="sm"
                icon={BoltIcon}
                onClick={() => onAutoSchedule(unscheduledList.map((t) => t.id))}
                style={{ color: 'var(--tb-accent-hover)', background: 'var(--tb-accent-soft)', borderColor: 'var(--tb-accent-ring)' }}
              >
                Auto Schedule
              </Button>
            ) : undefined}
          />
          {unscheduledList.length === 0
            ? <div style={{ fontSize: 12, color: 'var(--tb-faint)', padding: '4px' }}>Nothing unscheduled</div>
            : renderList(unscheduledList)}
        </section>

        {doneList.length > 0 && (
          <section style={{ marginTop: 16 }}>
            <button
              type="button"
              data-testid="done-section-toggle"
              onClick={() => setDoneOpen((v) => !v)}
              aria-expanded={doneOpen}
              className="flex items-center w-full text-left"
              style={{ height: 24, padding: '0 4px', gap: 4, marginBottom: 4 }}
            >
              {doneOpen
                ? <ChevronDownIcon className="flex-shrink-0" style={{ width: 12, height: 12, color: 'var(--tb-muted)' }} />
                : <ChevronRightIcon className="flex-shrink-0" style={{ width: 12, height: 12, color: 'var(--tb-muted)' }} />}
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--tb-muted)' }}>
                Done<span style={{ marginLeft: 6, fontWeight: 500, color: 'var(--tb-faint)' }}>{doneList.length}</span>
              </span>
            </button>
            {doneOpen && renderList(doneList)}
          </section>
        )}
      </div>
    </div>
  );
}
