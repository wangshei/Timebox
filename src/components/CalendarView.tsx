import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { ChevronLeftIcon, ChevronRightIcon, CalendarIcon, PlusIcon, Cog6ToothIcon } from '@heroicons/react/24/solid';
import { Mode, View, TimeBlock, Category, Tag, CalendarContainer, Task, Event } from '../types';
import { resolveTimeBlocks, resolveEvents, selectMainViewBlocks } from '../utils/dataResolver';
import { getLocalDateString, getStartOfWeek } from '../utils/dateTime';
import { isPlannedIntent, isRecordedBlock } from '../store/selectors';
import { DayView } from './DayView';
import { ThreeDayView } from './ThreeDayView';
import { WeekView } from './WeekView';
import { MonthView } from './MonthView';
import { SegmentedControl } from './ui/SegmentedControl';
import { PX_PER_HOUR } from '../utils/gridUtils';

const PRIMARY = '#8DA286';
const BG = '#FDFDFB';
const BORDER = 'rgba(0,0,0,0.08)';
const TEXT_PRIMARY = '#5F615F';
const TEXT_MUTED = '#8E8E93';
const TEXT_SECONDARY = '#636366';

/** Default stamp emojis */
const STAMP_DEFAULTS = ['🔋', '🪫', '❤️', '🤍'];

/** Breakpoint (px) below which compare mode switches to tabbed layout */
const NARROW_BREAKPOINT = 600;

interface CalendarViewProps {
  mode: Mode;
  onModeChange?: (mode: Mode) => void;
  view: View;
  onViewChange: (view: View) => void;
  selectedDate: string;
  onSelectedDateChange?: (date: string) => void;
  timeBlocks: TimeBlock[];
  tasks: Task[];
  categories: Category[];
  tags: Tag[];
  containers: CalendarContainer[];
  containerVisibility: { [key: string]: boolean };
  focusedCategoryId?: string | null;
  focusedCalendarId?: string | null;
  isMobile?: boolean;
  onOpenAddModal?: (mode: 'task' | 'event') => void;
  onConfirm?: (blockId: string) => void;
  onSkip?: (blockId: string) => void;
  onUnconfirm?: (blockId: string) => void;
  onDeleteBlock?: (blockId: string) => void;
  onDeleteTask?: (taskId: string) => void;
  onDropTask?: (taskId: string, params: import('./DayView').DropTaskParams) => void;
  onCreateBlock?: (params: import('./DayView').CreateBlockParams) => string | undefined;
  onMoveBlock?: (blockId: string, params: { date: string; startTime: string; endTime: string }) => void;
  onResizeBlock?: (blockId: string, params: { date: string; endTime: string }) => void;
  onEditEvent?: (eventId: string) => void;
  onEditBlock?: (blockId: string) => void;
  events?: Event[];
  onDeleteEvent?: (eventId: string) => void;
  onDeleteEventSeries?: (eventId: string, scope: 'this' | 'all' | 'all_after') => void;
  onMoveEvent?: (eventId: string, params: { date: string; startTime: string; endTime: string }) => void;
  onResizeEvent?: (eventId: string, params: { date: string; endTime: string }) => void;
  onToggleEventAttendance?: (eventId: string, status: 'attended' | 'not_attended' | undefined) => void;
  /** When true, week view shows Mon–Sun; when false, Sun–Sat. */
  weekStartsOnMonday?: boolean;
  onRescheduleLater?: (blockId: string) => void;
  onAddTimeToComplete?: (blockId: string, minutes: number) => void;
  /** Preview rectangle for a pending drag-create while AddModal is open. */
  pendingBlockPreview?: { date: string; startTime: string; endTime: string } | null;
  /** Seed value for the internal showDifferences toggle (used by walkthrough overlay). */
  defaultShowDifferences?: boolean;
  /** Mobile: open the slide-over calendar sidebar */
  onOpenMobileSidebar?: () => void;
  /** Mobile: open settings */
  onOpenSettings?: () => void;
  /** Mobile: open task list panel */
  onOpenMobileTasks?: () => void;
}

const VIEW_OPTIONS = [
  { value: 'day' as View, label: 'Day', shortLabel: 'D' },
  { value: '3day' as View, label: '3 Day', shortLabel: '3D' },
  { value: 'week' as View, label: 'Week', shortLabel: 'W' },
  { value: 'month' as View, label: 'Month', shortLabel: 'M' },
];

export function CalendarView({
  mode, onModeChange, view, onViewChange, selectedDate, onSelectedDateChange,
  timeBlocks, tasks, categories, tags, containers, containerVisibility,
  focusedCategoryId = null, focusedCalendarId = null, isMobile = false,
  onOpenAddModal, onConfirm, onSkip, onUnconfirm, onDeleteBlock, onDeleteTask,
  onDropTask, onCreateBlock, onMoveBlock, onResizeBlock, onEditEvent, onEditBlock,
  events: eventsProp = [], onDeleteEvent, onDeleteEventSeries, onMoveEvent, onResizeEvent,
  onToggleEventAttendance,
  weekStartsOnMonday = false,
  onRescheduleLater,
  onAddTimeToComplete,
  pendingBlockPreview,
  defaultShowDifferences,
  onOpenMobileSidebar,
  onOpenSettings,
  onOpenMobileTasks,
}: CalendarViewProps) {
  const [selectedBlock, setSelectedBlock] = useState<string | null>(null);
  const [showDifferences, setShowDifferences] = useState(defaultShowDifferences ?? false);
  const [compareTab, setCompareTab] = useState<'plan' | 'actual'>('actual');
  const [stampMode, setStampMode] = useState(false);
  const [activeStampEmoji, setActiveStampEmoji] = useState<string | null>(null);

  // Track container width for responsive compare layout
  const containerRef = useRef<HTMLDivElement>(null);
  const compareScrollRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1200);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    ro.observe(el);
    setContainerWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  const isNarrow = containerWidth < NARROW_BREAKPOINT;

  // If mobile and stuck on week view (e.g. resized window), auto-switch to day
  // Guard: only run when this component is actually visible (both desktop and mobile
  // CalendarViews render simultaneously; CSS hides one, but effects still fire).
  useEffect(() => {
    if (isMobile && view === 'week' && containerRef.current?.offsetParent !== null) {
      onViewChange('day');
    }
  }, [isMobile, view, onViewChange]);

  // Escape key exits stamp mode
  useEffect(() => {
    if (!stampMode) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setStampMode(false); setActiveStampEmoji(null); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [stampMode]);

  // Reset state when leaving compare mode
  useEffect(() => {
    if (mode !== 'compare') {
      setShowDifferences(defaultShowDifferences ?? false);
      setCompareTab('actual');
    }
  }, [mode, defaultShowDifferences]);

  // Sync from external prop (walkthrough overlay)
  useEffect(() => {
    if (defaultShowDifferences !== undefined) {
      setShowDifferences(defaultShowDifferences);
    }
  }, [defaultShowDifferences]);

  // Scroll compare panels to ~7am when entering compare or changing date/view
  useEffect(() => {
    if (mode === 'compare' && compareScrollRef.current) {
      const scrollTo7AM = 7 * PX_PER_HOUR;
      compareScrollRef.current.scrollTop = scrollTo7AM;
    }
  }, [mode, selectedDate, view]);

  const todayStr = getLocalDateString();

  const currentDate = useMemo(() => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    return new Date(y, m - 1, d);
  }, [selectedDate]);

  const visibleBlocks = useMemo(
    () => resolveTimeBlocks(timeBlocks, tasks, categories, tags, containers),
    [timeBlocks, tasks, categories, tags, containers]
  );

  const mainViewBlocks = useMemo(() => selectMainViewBlocks(visibleBlocks), [visibleBlocks]);

  const resolvedEvents = useMemo(
    () => resolveEvents(eventsProp, categories, containers),
    [eventsProp, categories, containers]
  );

  // Compare mode: split blocks into plan vs actual
  const planBlocks = useMemo(
    () => visibleBlocks.filter((b) => isPlannedIntent(b as any)),
    [visibleBlocks]
  );
  const actualBlocks = useMemo(
    () => visibleBlocks.filter((b) => isRecordedBlock(b as any, todayStr) || b.source === 'unplanned'),
    [visibleBlocks, todayStr]
  );

  // Compare mode: split events — plan excludes unplanned events
  const planEvents = useMemo(
    () => resolvedEvents.filter((e) => e.source !== 'unplanned'),
    [resolvedEvents]
  );
  // Actual shows all events (planned ones happened, unplanned ones are new)
  const actualEvents = resolvedEvents;

  // Wrap onCreateBlock for actual panel: mark as recorded
  const handleActualCreateBlock = useCallback(
    (params: import('./DayView').CreateBlockParams) =>
      onCreateBlock?.({ ...params, isRecordedPanel: true }),
    [onCreateBlock]
  );

  const getHeaderTitle = () => {
    if (view === 'day') {
      const dayName = currentDate.toLocaleDateString('en-US', { weekday: 'long' });
      const dateStr = currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return { dayName, dateStr };
    } else if (view === '3day') {
      const end = new Date(currentDate);
      end.setDate(currentDate.getDate() + 2);
      const startStr = currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return `${startStr} – ${endStr}`;
    } else if (view === 'week') {
      const startOfWeek = getStartOfWeek(currentDate, weekStartsOnMonday);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      return `${startOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${endOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    } else {
      return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
  };

  const navigatePrevious = () => {
    const newDate = new Date(currentDate);
    if (view === 'day') newDate.setDate(currentDate.getDate() - 1);
    else if (view === '3day') newDate.setDate(currentDate.getDate() - 3);
    else if (view === 'week') newDate.setDate(currentDate.getDate() - 7);
    else newDate.setMonth(currentDate.getMonth() - 1);
    onSelectedDateChange?.(getLocalDateString(newDate));
  };

  const navigateNext = () => {
    const newDate = new Date(currentDate);
    if (view === 'day') newDate.setDate(currentDate.getDate() + 1);
    else if (view === '3day') newDate.setDate(currentDate.getDate() + 3);
    else if (view === 'week') newDate.setDate(currentDate.getDate() + 7);
    else newDate.setMonth(currentDate.getMonth() + 1);
    onSelectedDateChange?.(getLocalDateString(newDate));
  };

  const navigateToday = () => onSelectedDateChange?.(getLocalDateString());

  const headerTitle = getHeaderTitle();

  // Shared label style for Plan/Actual headers
  const panelLabelStyle: React.CSSProperties = { fontSize: '9px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8E8E93' };

  // Compare tab bar for narrow/mobile layout
  const CompareTabBar = () => (
    <div className="flex shrink-0" style={{ borderBottom: `1px solid ${BORDER}` }}>
      {(['plan', 'actual'] as const).map((tab) => (
        <button
          key={tab}
          onClick={() => setCompareTab(tab)}
          className="flex-1 py-2 text-center transition-colors"
          style={{
            ...panelLabelStyle,
            color: compareTab === tab ? PRIMARY : TEXT_MUTED,
            borderBottom: compareTab === tab ? `2px solid ${PRIMARY}` : '2px solid transparent',
            backgroundColor: compareTab === tab ? 'rgba(141,162,134,0.06)' : 'transparent',
          }}
        >
          {tab === 'plan' ? 'Plan' : 'Actual'}
        </button>
      ))}
    </div>
  );

  // Effective showDifferences — auto-enabled on narrow compare
  const effectiveShowDifferences = showDifferences || (mode === 'compare' && isNarrow);

  // Render Plan DayView (shared between narrow/wide)
  const renderPlanDay = (disableScroll?: boolean) => (
    <DayView mode="overall" timeBlocks={planBlocks} events={planEvents} selectedDate={selectedDate} selectedBlock={selectedBlock} onSelectBlock={setSelectedBlock} focusedCategoryId={focusedCategoryId} focusedCalendarId={focusedCalendarId} onConfirm={onConfirm} onUnconfirm={onUnconfirm} onDeleteBlock={onDeleteBlock} onDeleteTask={onDeleteTask} onDeleteEvent={onDeleteEvent} onEditEvent={onEditEvent} onEditBlock={onEditBlock} locked showDifferences={effectiveShowDifferences} disableScroll={disableScroll} />
  );

  // Render Actual DayView (shared between narrow/wide)
  const renderActualDay = (disableScroll?: boolean) => (
    <DayView mode="compare" timeBlocks={actualBlocks} events={actualEvents} selectedDate={selectedDate} selectedBlock={selectedBlock} onSelectBlock={setSelectedBlock} focusedCategoryId={focusedCategoryId} focusedCalendarId={focusedCalendarId} onConfirm={onConfirm} onSkip={onSkip} onUnconfirm={onUnconfirm} onDeleteBlock={onDeleteBlock} onDeleteTask={onDeleteTask} onDeleteEvent={onDeleteEvent} onDropTask={onDropTask} onCreateBlock={handleActualCreateBlock} onMoveBlock={onMoveBlock} onResizeBlock={onResizeBlock} onMoveEvent={onMoveEvent} onResizeEvent={onResizeEvent} onEditEvent={onEditEvent} onEditBlock={onEditBlock} onToggleEventAttendance={onToggleEventAttendance} showDifferences={effectiveShowDifferences} disableScroll={disableScroll} />
  );

  return (
    <div ref={containerRef} className="flex-1 flex flex-col relative min-w-0 overflow-hidden" style={{ backgroundColor: BG }}>
      {/* Header */}
      {isMobile ? (
        /* ── Mobile header: single compact row ── */
        <div
          className="px-2 py-1 flex items-center gap-1 shrink-0"
          style={{ borderBottom: `1px solid ${BORDER}`, backgroundColor: BG, zIndex: 10 }}
        >
          {/* Hamburger — 40px touch target */}
          {onOpenMobileSidebar && (
            <button
              type="button"
              onClick={() => { setSelectedBlock(null); onOpenMobileSidebar(); }}
              className="flex items-center justify-center rounded-lg touch-manipulation shrink-0"
              style={{ width: 36, height: 36, color: TEXT_PRIMARY }}
              aria-label="Open calendars"
            >
              <svg width="16" height="12" viewBox="0 0 18 14" fill="none"><path d="M1 1h16M1 7h16M1 13h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
            </button>
          )}

          {/* Nav arrows — 36px touch targets */}
          <div className="flex items-center shrink-0">
            <button onClick={navigatePrevious} className="flex items-center justify-center rounded-md touch-manipulation" style={{ width: 28, height: 36, color: TEXT_MUTED }}>
              <ChevronLeftIcon className="h-4 w-4" />
            </button>
            <button onClick={navigateNext} className="flex items-center justify-center rounded-md touch-manipulation" style={{ width: 28, height: 36, color: TEXT_MUTED }}>
              <ChevronRightIcon className="h-4 w-4" />
            </button>
          </div>

          {/* Date title — truncates to fit */}
          <h1 className="text-xs font-semibold truncate shrink min-w-0" style={{ color: TEXT_PRIMARY }}>
            {view === 'day'
              ? currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              : typeof headerTitle === 'string' ? headerTitle : `${(headerTitle as any).dayName}`}
          </h1>

          {/* Spacer */}
          <div className="flex-1 min-w-1" />

          {/* View switcher: [· D 3D M] — Today is a dot */}
          <div className="flex items-center shrink-0"
            style={{
              backgroundColor: 'rgba(0,0,0,0.06)',
              borderRadius: 7,
              padding: 2,
              gap: 1,
            }}
          >
            <button
              onClick={navigateToday}
              className="flex items-center justify-center touch-manipulation"
              style={{
                width: 28,
                height: 28,
                fontSize: 11,
                fontWeight: 500,
                borderRadius: 5,
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                backgroundColor: 'transparent',
                color: PRIMARY,
              }}
              aria-label="Go to today"
            >
              <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: PRIMARY }} />
            </button>
            {VIEW_OPTIONS.filter(o => o.value !== 'week').map((option) => {
              const isActive = option.value === view;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onViewChange(option.value)}
                  className="flex items-center justify-center touch-manipulation"
                  style={{
                    minWidth: 28,
                    height: 28,
                    padding: '0 6px',
                    fontSize: 11,
                    fontWeight: isActive ? 600 : 400,
                    borderRadius: 5,
                    border: 'none',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.15s ease',
                    backgroundColor: isActive ? '#FFFFFF' : 'transparent',
                    color: isActive ? TEXT_PRIMARY : TEXT_SECONDARY,
                    boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.10), 0 0 0 0.5px rgba(0,0,0,0.04)' : 'none',
                  }}
                >
                  {option.shortLabel ?? option.label}
                </button>
              );
            })}
          </div>

          {/* Settings gear — 36px touch target */}
          {onOpenSettings && (
            <button
              type="button"
              onClick={onOpenSettings}
              className="flex items-center justify-center rounded-lg touch-manipulation shrink-0"
              style={{ width: 36, height: 36, color: TEXT_PRIMARY }}
              aria-label="Open settings"
            >
              <Cog6ToothIcon className="h-[17px] w-[17px]" />
            </button>
          )}

          {/* Tasks button — 36px touch target */}
          {onOpenMobileTasks && (
            <button
              type="button"
              onClick={() => { setSelectedBlock(null); onOpenMobileTasks(); }}
              className="flex items-center justify-center rounded-lg touch-manipulation shrink-0 -mr-1"
              style={{ width: 36, height: 36, color: TEXT_PRIMARY }}
              aria-label="Open to-dos"
            >
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                <path d="M3 4h14M3 8h14M3 12h10M3 16h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
      ) : (
        /* ── Desktop header ── */
        <div className="px-5 py-2 shrink-0" style={{ borderBottom: `1px solid ${BORDER}`, backgroundColor: BG }}>
          <div className="flex items-center justify-between gap-3">
            {/* Left: nav + title */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-0.5">
                <button
                  onClick={navigatePrevious}
                  className="p-1.5 rounded-lg transition-colors touch-manipulation"
                  style={{ color: TEXT_MUTED }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.06)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <ChevronLeftIcon className="h-4 w-4" />
                </button>
                <button
                  onClick={navigateNext}
                  className="p-1.5 rounded-lg transition-colors touch-manipulation"
                  style={{ color: TEXT_MUTED }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.06)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <ChevronRightIcon className="h-4 w-4" />
                </button>
              </div>

              <div className="min-w-0">
                {view === 'day' ? (
                  <h1 className="text-sm font-semibold truncate" style={{ color: TEXT_PRIMARY }}>
                    <span>{(headerTitle as any).dayName}</span>
                    <span className="font-normal ml-1" style={{ color: TEXT_SECONDARY, fontSize: '13px' }}>, {(headerTitle as any).dateStr}</span>
                  </h1>
                ) : (
                  <h1 className="text-sm font-semibold truncate" style={{ color: TEXT_PRIMARY }}>
                    {typeof headerTitle === 'string' ? headerTitle : `${(headerTitle as any).dayName}`}
                  </h1>
                )}
              </div>

              {/* Compare toggle */}
              {onModeChange && (
                <button
                  type="button"
                  onClick={() => onModeChange(mode === 'compare' ? 'overall' : 'compare')}
                  className="py-1.5 px-3 rounded-lg text-xs font-medium transition-all shrink-0"
                  style={{
                    backgroundColor: mode === 'compare' ? 'rgba(141,162,134,0.12)' : 'rgba(0,0,0,0.05)',
                    color: mode === 'compare' ? PRIMARY : TEXT_SECONDARY,
                    border: mode === 'compare' ? `1px solid rgba(141,162,134,0.28)` : `1px solid ${BORDER}`,
                  }}
                >
                  Compare
                </button>
              )}

              {/* Show Difference button — only in compare mode (wide layout) */}
              {mode === 'compare' && !isNarrow && (
                <button
                  type="button"
                  onClick={() => setShowDifferences((v) => !v)}
                  className="py-1.5 px-3 rounded-lg text-xs font-medium transition-all shrink-0"
                  style={{
                    color: '#FF3B30',
                    border: '1px solid #FF3B30',
                    backgroundColor: showDifferences ? 'rgba(255,59,48,0.08)' : 'transparent',
                  }}
                >
                  Show Difference
                </button>
              )}
            </div>

            {/* Right: today + view selector */}
            <div className="flex items-center gap-2">
              <button
                onClick={navigateToday}
                className="px-3 py-1.5 text-xs rounded-lg transition-colors flex items-center gap-1 font-medium touch-manipulation"
                style={{ color: TEXT_SECONDARY, backgroundColor: 'rgba(0,0,0,0.05)', border: `1px solid ${BORDER}` }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.08)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)')}
              >
                <CalendarIcon className="h-3.5 w-3.5" />
                Today
              </button>

              <SegmentedControl
                options={VIEW_OPTIONS}
                value={view}
                onChange={onViewChange}
              />
            </div>
          </div>
        </div>
      )}

      {/* Calendar Content */}
      {mode === 'compare' && view === 'day' ? (
        isNarrow ? (
          /* Narrow/mobile day compare: tabbed layout */
          <div className="flex-1 flex flex-col min-h-0">
            <CompareTabBar />
            <div className="flex-1 relative min-h-0">
              <div ref={compareScrollRef} className="absolute inset-0 overflow-y-auto">
                {compareTab === 'plan' ? renderPlanDay(true) : renderActualDay(true)}
              </div>
            </div>
          </div>
        ) : (
          /* Wide day compare: plan | actual split with shared scroll */
          <div className="flex-1 flex flex-col min-h-0" style={{ borderTop: `1px solid ${BORDER}` }}>
            {/* Sticky labels row */}
            <div className="grid grid-cols-2 shrink-0">
              <div className="px-3 py-1.5" style={{ backgroundColor: 'rgba(0,0,0,0.03)', borderBottom: `1px solid ${BORDER}`, borderRight: `1px solid ${BORDER}`, ...panelLabelStyle }}>
                Plan
              </div>
              <div className="px-3 py-1.5" style={{ backgroundColor: 'rgba(0,0,0,0.04)', borderBottom: `1px solid ${BORDER}`, ...panelLabelStyle }}>
                Actual
              </div>
            </div>
            {/* Shared scroll container — absolute positioned for reliable height constraint */}
            <div className="flex-1 relative min-h-0">
              <div ref={compareScrollRef} className="absolute inset-0 overflow-y-auto">
                <div className="grid grid-cols-2">
                  <div className="min-w-0" style={{ borderRight: `1px solid ${BORDER}`, backgroundColor: '#FFFFFF' }}>
                    {renderPlanDay(true)}
                  </div>
                  <div className="min-w-0" style={{ backgroundColor: BG }}>
                    {renderActualDay(true)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      ) : mode === 'compare' && view === '3day' ? (
        isNarrow ? (
          /* Narrow/mobile 3-day compare: tabbed layout */
          <div className="flex-1 flex flex-col min-h-0">
            <CompareTabBar />
            <div className="flex-1 relative min-h-0">
              <div ref={compareScrollRef} className="absolute inset-0 overflow-y-auto">
                {compareTab === 'plan' ? (
                  <ThreeDayView mode="overall" timeBlocks={planBlocks} currentDate={currentDate} selectedBlock={selectedBlock} onSelectBlock={setSelectedBlock} focusedCategoryId={focusedCategoryId} focusedCalendarId={focusedCalendarId} onConfirm={onConfirm} onUnconfirm={onUnconfirm} onDeleteBlock={onDeleteBlock} onDeleteTask={onDeleteTask} events={planEvents} onDeleteEvent={onDeleteEvent} onDeleteEventSeries={onDeleteEventSeries} onEditEvent={onEditEvent} onEditBlock={onEditBlock} locked panelLabel="Plan" showDifferences={effectiveShowDifferences} />
                ) : (
                  <ThreeDayView mode="compare" timeBlocks={actualBlocks} currentDate={currentDate} selectedBlock={selectedBlock} onSelectBlock={setSelectedBlock} focusedCategoryId={focusedCategoryId} focusedCalendarId={focusedCalendarId} onConfirm={onConfirm} onSkip={onSkip} onUnconfirm={onUnconfirm} onDeleteBlock={onDeleteBlock} onDeleteTask={onDeleteTask} onDropTask={onDropTask} onMoveBlock={onMoveBlock} onResizeBlock={onResizeBlock} onMoveEvent={onMoveEvent} onResizeEvent={onResizeEvent} events={actualEvents} onDeleteEvent={onDeleteEvent} onDeleteEventSeries={onDeleteEventSeries} onCreateBlock={handleActualCreateBlock} onEditEvent={onEditEvent} onEditBlock={onEditBlock} panelLabel="Actual" showDifferences={effectiveShowDifferences} />
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Wide 3-day compare: 3+3 split (plan left, actual right) with shared scroll */
          <div className="flex-1 relative min-h-0">
            {/* Shared scroll container — absolute positioned for reliable height constraint */}
            <div ref={compareScrollRef} className="absolute inset-0 overflow-y-auto">
              <div className="grid grid-cols-2">
                <div className="min-w-0" style={{ borderRight: `1px solid ${BORDER}` }}>
                  <ThreeDayView mode="overall" timeBlocks={planBlocks} currentDate={currentDate} selectedBlock={selectedBlock} onSelectBlock={setSelectedBlock} focusedCategoryId={focusedCategoryId} focusedCalendarId={focusedCalendarId} onConfirm={onConfirm} onUnconfirm={onUnconfirm} onDeleteBlock={onDeleteBlock} onDeleteTask={onDeleteTask} events={planEvents} onDeleteEvent={onDeleteEvent} onDeleteEventSeries={onDeleteEventSeries} onEditEvent={onEditEvent} onEditBlock={onEditBlock} locked panelLabel="Plan" showDifferences={effectiveShowDifferences} compact disableScroll />
                </div>
                <div className="min-w-0">
                  <ThreeDayView mode="compare" timeBlocks={actualBlocks} currentDate={currentDate} selectedBlock={selectedBlock} onSelectBlock={setSelectedBlock} focusedCategoryId={focusedCategoryId} focusedCalendarId={focusedCalendarId} onConfirm={onConfirm} onSkip={onSkip} onUnconfirm={onUnconfirm} onDeleteBlock={onDeleteBlock} onDeleteTask={onDeleteTask} onDropTask={onDropTask} onMoveBlock={onMoveBlock} onResizeBlock={onResizeBlock} onMoveEvent={onMoveEvent} onResizeEvent={onResizeEvent} events={actualEvents} onDeleteEvent={onDeleteEvent} onDeleteEventSeries={onDeleteEventSeries} onCreateBlock={handleActualCreateBlock} onEditEvent={onEditEvent} onEditBlock={onEditBlock} panelLabel="Actual" showDifferences={effectiveShowDifferences} compact disableScroll />
                </div>
              </div>
            </div>
          </div>
        )
      ) : (
        /* Normal view (or week/month compare — single view with showDifferences) */
        <div className="flex-1 overflow-y-auto min-h-0">
          {view === 'day' && (
            <DayView mode={mode} timeBlocks={mainViewBlocks} events={resolvedEvents} selectedDate={selectedDate} selectedBlock={selectedBlock} onSelectBlock={setSelectedBlock} focusedCategoryId={focusedCategoryId} focusedCalendarId={focusedCalendarId} onConfirm={onConfirm} onSkip={onSkip} onUnconfirm={onUnconfirm} onDeleteBlock={onDeleteBlock} onDeleteTask={onDeleteTask} onDeleteEvent={onDeleteEvent} onDeleteEventSeries={onDeleteEventSeries} onDropTask={onDropTask} onCreateBlock={onCreateBlock} onMoveBlock={onMoveBlock} onResizeBlock={onResizeBlock} onMoveEvent={onMoveEvent} onResizeEvent={onResizeEvent} onEditEvent={onEditEvent} onEditBlock={onEditBlock} onToggleEventAttendance={onToggleEventAttendance} onRescheduleLater={onRescheduleLater} onAddTimeToComplete={onAddTimeToComplete} pendingBlockPreview={pendingBlockPreview} activeStampEmoji={activeStampEmoji} showDateHeader />
          )}
          {view === '3day' && (
            <ThreeDayView mode={mode} timeBlocks={mainViewBlocks} currentDate={currentDate} selectedBlock={selectedBlock} onSelectBlock={setSelectedBlock} focusedCategoryId={focusedCategoryId} focusedCalendarId={focusedCalendarId} onConfirm={onConfirm} onSkip={onSkip} onUnconfirm={onUnconfirm} onDeleteBlock={onDeleteBlock} onDeleteTask={onDeleteTask} onDropTask={onDropTask} onMoveBlock={onMoveBlock} onResizeBlock={onResizeBlock} onMoveEvent={onMoveEvent} onResizeEvent={onResizeEvent} events={resolvedEvents} onDeleteEvent={onDeleteEvent} onDeleteEventSeries={onDeleteEventSeries} onCreateBlock={onCreateBlock} onEditEvent={onEditEvent} onEditBlock={onEditBlock} onToggleEventAttendance={onToggleEventAttendance} onRescheduleLater={onRescheduleLater} onAddTimeToComplete={onAddTimeToComplete} pendingBlockPreview={pendingBlockPreview} activeStampEmoji={activeStampEmoji} />
          )}
          {view === 'week' && (
            <WeekView mode={mode} timeBlocks={mainViewBlocks} currentDate={currentDate} selectedBlock={selectedBlock} onSelectBlock={setSelectedBlock} focusedCategoryId={focusedCategoryId} focusedCalendarId={focusedCalendarId} onConfirm={onConfirm} onSkip={onSkip} onUnconfirm={onUnconfirm} onDeleteBlock={onDeleteBlock} onDeleteTask={onDeleteTask} onDropTask={onDropTask} onMoveBlock={onMoveBlock} onResizeBlock={onResizeBlock} onMoveEvent={onMoveEvent} onResizeEvent={onResizeEvent} events={resolvedEvents} onDeleteEvent={onDeleteEvent} onDeleteEventSeries={onDeleteEventSeries} onCreateBlock={onCreateBlock} onEditEvent={onEditEvent} onEditBlock={onEditBlock} onToggleEventAttendance={onToggleEventAttendance} onRescheduleLater={onRescheduleLater} onAddTimeToComplete={onAddTimeToComplete} showDifferences={mode === 'compare' ? showDifferences : undefined} weekStartsOnMonday={weekStartsOnMonday} activeStampEmoji={activeStampEmoji} />
          )}
          {view === 'month' && (
            <MonthView mode={mode} timeBlocks={mode === 'compare' ? visibleBlocks : mainViewBlocks} currentDate={currentDate} selectedBlock={selectedBlock} onSelectBlock={setSelectedBlock} focusedCategoryId={focusedCategoryId} focusedCalendarId={focusedCalendarId} onSelectDate={(d) => { onSelectedDateChange?.(d); onViewChange('3day'); }} events={eventsProp} weekStartsOnMonday={weekStartsOnMonday} />
          )}
        </div>
      )}

      {/* Floating buttons — pinned to bottom-right */}
      <div className={`absolute ${isMobile ? 'bottom-5 right-4' : 'bottom-6 right-6'} z-30 flex flex-col items-center gap-3`}>
        {/* Stamp button — smaller, above + */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              if (activeStampEmoji) {
                // Exit stamp mode
                setStampMode(false);
                setActiveStampEmoji(null);
              } else {
                setStampMode((v) => !v);
                if (stampMode) setActiveStampEmoji(null);
              }
            }}
            className="flex items-center justify-center shadow-md transition-all active:scale-90"
            style={{
              width: isMobile ? 36 : 38, height: isMobile ? 36 : 38, borderRadius: '50%',
              backgroundColor: '#FFFFFF',
              border: stampMode ? `2px solid ${PRIMARY}` : '1.5px solid rgba(0,0,0,0.08)',
              boxShadow: stampMode
                ? `0 4px 16px rgba(141,162,134,0.35), 0 0 0 3px rgba(141,162,134,0.12)`
                : '0 2px 10px rgba(0,0,0,0.08)',
            }}
            aria-label="Stamp mode"
          >
            <span style={{ fontSize: stampMode ? 18 : 16, lineHeight: 1 }}>
              {activeStampEmoji || '📎'}
            </span>
          </button>

          {/* Emoji shelf — pops out left of button */}
          {stampMode && !activeStampEmoji && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => { setStampMode(false); setActiveStampEmoji(null); }} />
              <div
                className="absolute z-50 flex items-center gap-1 rounded-full py-1.5 px-2"
                style={{
                  right: isMobile ? 44 : 46,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  backgroundColor: '#FFFFFF',
                  border: '1.5px solid rgba(0,0,0,0.06)',
                  boxShadow: '0 6px 24px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.04)',
                }}
              >
                {STAMP_DEFAULTS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className="flex items-center justify-center rounded-full transition-all hover:scale-125 active:scale-95"
                    style={{ width: 32, height: 32, fontSize: 20, lineHeight: 1 }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.04)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                    onClick={() => setActiveStampEmoji(emoji)}
                  >
                    {emoji}
                  </button>
                ))}
                {/* Plus for custom emoji */}
                <div className="relative">
                  <button
                    type="button"
                    className="flex items-center justify-center rounded-full transition-all hover:scale-110 active:scale-95"
                    style={{
                      width: 32, height: 32, fontSize: 16, lineHeight: 1,
                      color: TEXT_MUTED,
                      backgroundColor: 'rgba(0,0,0,0.04)',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.08)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.04)'; }}
                    onClick={() => {
                      const val = prompt('Enter an emoji:');
                      if (val && val.trim()) {
                        // Take first grapheme cluster (emoji can be multi-codepoint)
                        const segments = typeof Intl !== 'undefined' && Intl.Segmenter
                          ? [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(val.trim())]
                          : null;
                        const emoji = segments && segments.length > 0 ? segments[0].segment : val.trim().slice(0, 2);
                        setActiveStampEmoji(emoji);
                      }
                    }}
                  >
                    +
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Active stamp hint */}
          {stampMode && activeStampEmoji && (
            <div
              className="absolute whitespace-nowrap rounded-full px-3 py-1"
              style={{
                right: isMobile ? 44 : 46,
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: 10, fontWeight: 500, color: PRIMARY,
                backgroundColor: 'rgba(141,162,134,0.08)',
                border: '1px solid rgba(141,162,134,0.15)',
              }}
            >
              Click to place · Esc to exit
            </div>
          )}
        </div>

        {/* Add button */}
        {onOpenAddModal && (
          <button
            type="button"
            onClick={() => onOpenAddModal('event')}
            className="flex items-center justify-center shadow-lg transition-all active:scale-95"
            style={{
              width: isMobile ? 48 : 52, height: isMobile ? 48 : 52, borderRadius: '50%',
              backgroundColor: PRIMARY,
              boxShadow: '0 4px 16px rgba(141,162,134,0.45)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#8DA387')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = PRIMARY)}
            aria-label="Add to-do or event"
          >
            <PlusIcon className="h-6 w-6 text-white" />
          </button>
        )}
      </div>
    </div>
  );
}
