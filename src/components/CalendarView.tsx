import { MISSED_STAMP } from './MissedOverlay';
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { ChevronLeftIcon, ChevronRightIcon, CalendarIcon, PlusIcon, Cog6ToothIcon, EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import { Bars3BottomLeftIcon } from '@heroicons/react/24/outline';
import { Mode, View, TimeBlock, Category, Tag, CalendarContainer, Task, Event, AvailableSlot } from '../types';
import { useStore } from '../store/useStore';
import { resolveTimeBlocks, resolveEvents, selectMainViewBlocks } from '../utils/dataResolver';
import { getLocalDateString, getStartOfWeek, getLocalTimeZone } from '../utils/dateTime';
import { isPlannedIntent, isRecordedBlock } from '../store/selectors';
import { DayView } from './DayView';
import { ThreeDayView } from './ThreeDayView';
import { WeekView } from './WeekView';
import { MonthView } from './MonthView';
import { SegmentedControl } from './ui/SegmentedControl';
import { useCreateMode, CreateMode } from '../utils/createMode';
import { Button, IconButton } from './ds';
import { useStickerSet, setStickerSet, parseEmoji, DEFAULT_STICKER_SET } from '../utils/stickerSet';
import { PX_PER_HOUR } from '../utils/gridUtils';
import { COLOR } from '../styles/tokens';

const PRIMARY = COLOR.accent;
const BG = COLOR.surface2;
const BORDER = COLOR.border;
const TEXT_PRIMARY = '#5F615F';
const TEXT_MUTED = COLOR.muted;
const TEXT_SECONDARY = COLOR.text2;

/** Default stamp emojis */

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
  onEditEventWithScope?: (eventId: string, scope: 'this' | 'all' | 'all_after') => void;
  onEditBlock?: (blockId: string) => void;
  events?: Event[];
  onDeleteEvent?: (eventId: string) => void;
  onDeleteEventSeries?: (eventId: string, scope: 'this' | 'all' | 'all_after') => void;
  onMoveEvent?: (eventId: string, params: { date: string; startTime: string; endTime: string }) => void;
  onResizeEvent?: (eventId: string, params: { date: string; endTime: string; endDate?: string }) => void;
  onSplitBlock?: (blockId: string) => void;
  onSplitEvent?: (eventId: string) => void;
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
  /** Mobile: open settings */
  onOpenSettings?: () => void;
  /** Mobile: open task list panel */
  onOpenMobileTasks?: () => void;
  /** Scheduling selection mode props */
  selectionMode?: boolean;
  selectedSlots?: AvailableSlot[];
  onToggleSlot?: (slot: AvailableSlot) => void;
  onSelectionDone?: () => void;
  onSelectionCancel?: () => void;
  highlightSlots?: AvailableSlot[];
}

const VIEW_OPTIONS = [
  { value: 'day' as View, label: 'Day', shortLabel: 'D' },
  { value: '3day' as View, label: '3 Day', shortLabel: '3D' },
  { value: 'week' as View, label: 'Week', shortLabel: 'W' },
  { value: 'month' as View, label: 'Month', shortLabel: 'M' },
];

const CREATE_MODE_OPTIONS: { value: CreateMode; label: string }[] = [
  { value: 'event', label: 'Event' },
  { value: 'todo', label: 'Todo' },
];

export function CalendarView({
  mode, onModeChange, view, onViewChange, selectedDate, onSelectedDateChange,
  timeBlocks, tasks, categories, tags, containers, containerVisibility,
  focusedCategoryId = null, focusedCalendarId = null,
  onOpenAddModal, onConfirm, onSkip, onUnconfirm, onDeleteBlock, onDeleteTask,
  onDropTask, onCreateBlock, onMoveBlock, onResizeBlock, onEditEvent, onEditEventWithScope, onEditBlock,
  events: eventsProp = [], onDeleteEvent, onDeleteEventSeries, onMoveEvent, onResizeEvent,
  onSplitBlock, onSplitEvent,
  onToggleEventAttendance,
  weekStartsOnMonday = false,
  onRescheduleLater,
  onAddTimeToComplete,
  pendingBlockPreview,
  defaultShowDifferences,
  onOpenSettings,
  onOpenMobileTasks,
  selectionMode,
  selectedSlots,
  onToggleSlot,
  onSelectionDone,
  onSelectionCancel,
  highlightSlots,
}: CalendarViewProps) {
  const [createMode, setCreateModeValue] = useCreateMode();
  const [selectedBlock, setSelectedBlock] = useState<string | null>(null);
  const revealPast = useStore((s) => s.revealPast);
  const setRevealPast = useStore((s) => s.setRevealPast);
  const [showDifferences, setShowDifferences] = useState(defaultShowDifferences ?? false);
  const [compareTab, setCompareTab] = useState<'plan' | 'actual'>('actual');
  const [stampMode, setStampMode] = useState(false);
  const [activeStampEmoji, setActiveStampEmoji] = useState<string | null>(null);
  const [viewTimezone, setViewTimezone] = useState<string | undefined>(undefined);

  // Hidden input ref for native emoji picker
  const emojiInputRef = useRef<HTMLInputElement>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const userStickers = useStickerSet();
  const STAMP_DEFAULTS = useMemo(() => [...userStickers, MISSED_STAMP], [userStickers]);
  const [emojiDraft, setEmojiDraft] = useState('');
  const [emojiError, setEmojiError] = useState('');
  const addDraftEmoji = () => {
    const e = parseEmoji(emojiDraft);
    if (!e) { setEmojiError(emojiDraft.trim() ? 'Enter a single emoji' : ''); return; }
    if (userStickers.includes(e)) { setEmojiError('Already in your set'); return; }
    setStickerSet([...userStickers, e]);
    setEmojiDraft(''); setEmojiError('');
  };

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

  // Stamp mode keyboard: Escape exits, arrow keys cycle emoji
  useEffect(() => {
    if (!stampMode) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setStampMode(false); setActiveStampEmoji(null); return; }
      // Arrow down/up/right/left cycle through stamp emojis
      if (activeStampEmoji && (e.key === 'ArrowDown' || e.key === 'ArrowRight')) {
        e.preventDefault();
        const idx = STAMP_DEFAULTS.indexOf(activeStampEmoji);
        const next = idx >= 0 ? (idx + 1) % STAMP_DEFAULTS.length : 0;
        setActiveStampEmoji(STAMP_DEFAULTS[next]);
      } else if (activeStampEmoji && (e.key === 'ArrowUp' || e.key === 'ArrowLeft')) {
        e.preventDefault();
        const idx = STAMP_DEFAULTS.indexOf(activeStampEmoji);
        const prev = idx > 0 ? idx - 1 : STAMP_DEFAULTS.length - 1;
        setActiveStampEmoji(STAMP_DEFAULTS[prev]);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [stampMode, activeStampEmoji]);

  // Delete/Backspace key deletes selected block or event
  useEffect(() => {
    if (!selectedBlock) return;
    const handleKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, [contenteditable]')) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        if (selectedBlock.startsWith('event-')) {
          const eventId = selectedBlock.replace('event-', '');
          onDeleteEvent?.(eventId);
        } else {
          onDeleteBlock?.(selectedBlock);
        }
        setSelectedBlock(null);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [selectedBlock, onDeleteBlock, onDeleteEvent]);

  // Emoji stamp cursor — inject a global style when an emoji is active so all
  // child elements (including draggable blocks) show the stamp cursor instead of grab.
  useEffect(() => {
    if (!activeStampEmoji) {
      document.getElementById('stamp-cursor-override')?.remove();
      return;
    }
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 32; canvas.height = 32;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.font = '22px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(activeStampEmoji, 16, 16);
      }
      const url = canvas.toDataURL();
      let style = document.getElementById('stamp-cursor-override') as HTMLStyleElement | null;
      if (!style) {
        style = document.createElement('style');
        style.id = 'stamp-cursor-override';
        document.head.appendChild(style);
      }
      style.textContent = `* { cursor: url(${url}) 16 16, crosshair !important; }`;
    } catch { /* ignore canvas errors */ }
    return () => { document.getElementById('stamp-cursor-override')?.remove(); };
  }, [activeStampEmoji]);

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
    <DayView mode="overall" timeBlocks={planBlocks} events={planEvents} selectedDate={selectedDate} selectedBlock={selectedBlock} onSelectBlock={setSelectedBlock} focusedCategoryId={focusedCategoryId} focusedCalendarId={focusedCalendarId} onConfirm={onConfirm} onUnconfirm={onUnconfirm} onDeleteBlock={onDeleteBlock} onDeleteTask={onDeleteTask} onDeleteEvent={onDeleteEvent} onDeleteEventSeries={onDeleteEventSeries} onEditEvent={onEditEvent} onEditEventWithScope={onEditEventWithScope} onEditBlock={onEditBlock} locked showDifferences={effectiveShowDifferences} disableScroll={disableScroll} />
  );

  // Render Actual DayView (shared between narrow/wide)
  const renderActualDay = (disableScroll?: boolean) => (
    <DayView mode="compare" timeBlocks={actualBlocks} events={actualEvents} selectedDate={selectedDate} selectedBlock={selectedBlock} onSelectBlock={setSelectedBlock} focusedCategoryId={focusedCategoryId} focusedCalendarId={focusedCalendarId} onConfirm={onConfirm} onSkip={onSkip} onUnconfirm={onUnconfirm} onDeleteBlock={onDeleteBlock} onDeleteTask={onDeleteTask} onDeleteEvent={onDeleteEvent} onDeleteEventSeries={onDeleteEventSeries} onDropTask={onDropTask} onCreateBlock={handleActualCreateBlock} onMoveBlock={onMoveBlock} onResizeBlock={onResizeBlock} onMoveEvent={onMoveEvent} onResizeEvent={onResizeEvent} onEditEvent={onEditEvent} onEditEventWithScope={onEditEventWithScope} onEditBlock={onEditBlock} onToggleEventAttendance={onToggleEventAttendance} showDifferences={effectiveShowDifferences} disableScroll={disableScroll} />
  );

  return (
    <div ref={containerRef} className="flex-1 flex flex-col relative min-w-0 overflow-hidden" style={{ backgroundColor: BG, isolation: 'isolate' }}>
      {/* Header */}
        <div className="shrink-0" style={{ borderBottom: `1px solid ${BORDER}`, backgroundColor: BG, minHeight: 'var(--tb-header-h)', paddingInline: 'var(--tb-sp-5)', display: 'flex', alignItems: 'center', boxSizing: 'border-box' }}>
          {/* flex-wrap: when the calendar column is narrow (both sidebars open) the view controls drop to a second row instead of overlapping the nav arrows */}
          <div className="flex items-center justify-between w-full flex-wrap" style={{ minWidth: 0, gap: 'var(--tb-sp-2)', paddingBlock: 'var(--tb-sp-1)' }}>
            {/* Left: nav + title */}
            <div className="flex items-center" style={{ minWidth: 0, gap: 'var(--tb-sp-2)' }}>
              <div className="flex items-center shrink-0" style={{ gap: 'var(--tb-sp-0_5)' }}>
                <IconButton icon={ChevronLeftIcon} aria-label="Previous" size="md" onClick={navigatePrevious} style={{ color: TEXT_MUTED }} />
                <IconButton icon={ChevronRightIcon} aria-label="Next" size="md" onClick={navigateNext} style={{ color: TEXT_MUTED }} />
              </div>

              <div style={{ minWidth: 0 }}>
                {view === 'day' ? (
                  <h1 className="truncate" style={{ color: TEXT_PRIMARY, fontSize: 'var(--tb-fs-md)', fontWeight: 600, margin: 0 }}>
                    <span>{(headerTitle as any).dayName}</span>
                    <span style={{ color: TEXT_SECONDARY, fontSize: 'var(--tb-fs-base)', fontWeight: 400 }}>, {(headerTitle as any).dateStr}</span>
                  </h1>
                ) : (
                  <h1 className="truncate" style={{ color: TEXT_PRIMARY, fontSize: 'var(--tb-fs-md)', fontWeight: 600, margin: 0 }}>
                    {typeof headerTitle === 'string' ? headerTitle : `${(headerTitle as any).dayName}`}
                  </h1>
                )}
              </div>

              {/* Compare toggle */}
              {onModeChange && (
                <Button
                  size="md"
                  active={mode === 'compare'}
                  onClick={() => onModeChange(mode === 'compare' ? 'overall' : 'compare')}
                  className="shrink-0"
                  style={{ color: mode === 'compare' ? PRIMARY : TEXT_SECONDARY }}
                >
                  Compare
                </Button>
              )}

              {/* Reveal-past toggle — show past events/blocks at full strength instead of faded */}
              <IconButton
                icon={revealPast ? EyeIcon : EyeSlashIcon}
                variant="outline"
                active={revealPast}
                size="md"
                onClick={() => setRevealPast(!revealPast)}
                title={revealPast ? 'Fade past events' : 'Show past events'}
                aria-label={revealPast ? 'Fade past events' : 'Show past events'}
                aria-pressed={revealPast}
                style={{ color: revealPast ? PRIMARY : TEXT_SECONDARY, width: 32, height: 32 }}
              />

              {/* Show Difference button — only in compare mode (wide layout) */}
              {mode === 'compare' && !isNarrow && (
                <Button
                  variant="danger"
                  className="shrink-0"
                  onClick={() => setShowDifferences((v) => !v)}
                  style={{ backgroundColor: showDifferences ? 'rgba(255,59,48,0.08)' : 'transparent' }}
                >
                  Show Difference
                </Button>
              )}
            </div>

            {/* Right: today + view selector */}
            <div className="flex items-center shrink-0" style={{ gap: 'var(--tb-sp-2)' }}>
              <div title="Create mode: drag on the calendar to create an Event or a Todo (keys e / t)">
                <SegmentedControl options={CREATE_MODE_OPTIONS} value={createMode} onChange={setCreateModeValue} size="md" />
              </div>
              <Button icon={CalendarIcon} onClick={navigateToday} style={{ color: TEXT_SECONDARY }}>Today</Button>
              <SegmentedControl options={VIEW_OPTIONS} value={view} onChange={onViewChange} size="md" />
            </div>
          </div>
        </div>

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
                  <ThreeDayView mode="overall" timeBlocks={planBlocks} currentDate={currentDate} selectedBlock={selectedBlock} onSelectBlock={setSelectedBlock} focusedCategoryId={focusedCategoryId} focusedCalendarId={focusedCalendarId} onConfirm={onConfirm} onUnconfirm={onUnconfirm} onDeleteBlock={onDeleteBlock} onDeleteTask={onDeleteTask} events={planEvents} onDeleteEvent={onDeleteEvent} onDeleteEventSeries={onDeleteEventSeries} onEditEvent={onEditEvent} onEditEventWithScope={onEditEventWithScope} onEditBlock={onEditBlock} locked panelLabel="Plan" showDifferences={effectiveShowDifferences} />
                ) : (
                  <ThreeDayView mode="compare" timeBlocks={actualBlocks} currentDate={currentDate} selectedBlock={selectedBlock} onSelectBlock={setSelectedBlock} focusedCategoryId={focusedCategoryId} focusedCalendarId={focusedCalendarId} onConfirm={onConfirm} onSkip={onSkip} onUnconfirm={onUnconfirm} onDeleteBlock={onDeleteBlock} onDeleteTask={onDeleteTask} onDropTask={onDropTask} onMoveBlock={onMoveBlock} onResizeBlock={onResizeBlock} onMoveEvent={onMoveEvent} onResizeEvent={onResizeEvent} events={actualEvents} onDeleteEvent={onDeleteEvent} onDeleteEventSeries={onDeleteEventSeries} onCreateBlock={handleActualCreateBlock} onEditEvent={onEditEvent} onEditEventWithScope={onEditEventWithScope} onEditBlock={onEditBlock} panelLabel="Actual" showDifferences={effectiveShowDifferences} />
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
                  <ThreeDayView mode="overall" timeBlocks={planBlocks} currentDate={currentDate} selectedBlock={selectedBlock} onSelectBlock={setSelectedBlock} focusedCategoryId={focusedCategoryId} focusedCalendarId={focusedCalendarId} onConfirm={onConfirm} onUnconfirm={onUnconfirm} onDeleteBlock={onDeleteBlock} onDeleteTask={onDeleteTask} events={planEvents} onDeleteEvent={onDeleteEvent} onDeleteEventSeries={onDeleteEventSeries} onEditEvent={onEditEvent} onEditEventWithScope={onEditEventWithScope} onEditBlock={onEditBlock} locked panelLabel="Plan" showDifferences={effectiveShowDifferences} compact disableScroll />
                </div>
                <div className="min-w-0">
                  <ThreeDayView mode="compare" timeBlocks={actualBlocks} currentDate={currentDate} selectedBlock={selectedBlock} onSelectBlock={setSelectedBlock} focusedCategoryId={focusedCategoryId} focusedCalendarId={focusedCalendarId} onConfirm={onConfirm} onSkip={onSkip} onUnconfirm={onUnconfirm} onDeleteBlock={onDeleteBlock} onDeleteTask={onDeleteTask} onDropTask={onDropTask} onMoveBlock={onMoveBlock} onResizeBlock={onResizeBlock} onMoveEvent={onMoveEvent} onResizeEvent={onResizeEvent} events={actualEvents} onDeleteEvent={onDeleteEvent} onDeleteEventSeries={onDeleteEventSeries} onCreateBlock={handleActualCreateBlock} onEditEvent={onEditEvent} onEditEventWithScope={onEditEventWithScope} onEditBlock={onEditBlock} panelLabel="Actual" showDifferences={effectiveShowDifferences} compact disableScroll />
                </div>
              </div>
            </div>
          </div>
        )
      ) : (
        /* Normal view (or week/month compare — single view with showDifferences) */
        <div className="flex-1 overflow-y-auto min-h-0">
          {view === 'day' && (
            <DayView mode={mode} timeBlocks={mainViewBlocks} events={resolvedEvents} selectedDate={selectedDate} selectedBlock={selectedBlock} onSelectBlock={setSelectedBlock} focusedCategoryId={focusedCategoryId} focusedCalendarId={focusedCalendarId} onConfirm={onConfirm} onSkip={onSkip} onUnconfirm={onUnconfirm} onDeleteBlock={onDeleteBlock} onDeleteTask={onDeleteTask} onDeleteEvent={onDeleteEvent} onDeleteEventSeries={onDeleteEventSeries} onDropTask={onDropTask} onCreateBlock={onCreateBlock} onMoveBlock={onMoveBlock} onResizeBlock={onResizeBlock} onMoveEvent={onMoveEvent} onResizeEvent={onResizeEvent} onSplitBlock={onSplitBlock} onSplitEvent={onSplitEvent} onEditEvent={onEditEvent} onEditEventWithScope={onEditEventWithScope} onEditBlock={onEditBlock} onToggleEventAttendance={onToggleEventAttendance} onRescheduleLater={onRescheduleLater} onAddTimeToComplete={onAddTimeToComplete} pendingBlockPreview={pendingBlockPreview} activeStampEmoji={activeStampEmoji} showDateHeader viewTimezone={viewTimezone} onSetViewTimezone={setViewTimezone} highlightSlots={highlightSlots} />
          )}
          {view === '3day' && (
            <ThreeDayView mode={mode} timeBlocks={mainViewBlocks} currentDate={currentDate} selectedBlock={selectedBlock} onSelectBlock={setSelectedBlock} focusedCategoryId={focusedCategoryId} focusedCalendarId={focusedCalendarId} onConfirm={onConfirm} onSkip={onSkip} onUnconfirm={onUnconfirm} onDeleteBlock={onDeleteBlock} onDeleteTask={onDeleteTask} onDropTask={onDropTask} onMoveBlock={onMoveBlock} onResizeBlock={onResizeBlock} onMoveEvent={onMoveEvent} onResizeEvent={onResizeEvent} onSplitBlock={onSplitBlock} onSplitEvent={onSplitEvent} events={resolvedEvents} onDeleteEvent={onDeleteEvent} onDeleteEventSeries={onDeleteEventSeries} onCreateBlock={onCreateBlock} onEditEvent={onEditEvent} onEditEventWithScope={onEditEventWithScope} onEditBlock={onEditBlock} onToggleEventAttendance={onToggleEventAttendance} onRescheduleLater={onRescheduleLater} onAddTimeToComplete={onAddTimeToComplete} pendingBlockPreview={pendingBlockPreview} activeStampEmoji={activeStampEmoji} viewTimezone={viewTimezone} onSetViewTimezone={setViewTimezone} highlightSlots={highlightSlots} />
          )}
          {view === 'week' && (
            <WeekView mode={mode} timeBlocks={mainViewBlocks} currentDate={currentDate} selectedBlock={selectedBlock} onSelectBlock={setSelectedBlock} focusedCategoryId={focusedCategoryId} focusedCalendarId={focusedCalendarId} onConfirm={onConfirm} onSkip={onSkip} onUnconfirm={onUnconfirm} onDeleteBlock={onDeleteBlock} onDeleteTask={onDeleteTask} onDropTask={onDropTask} onMoveBlock={onMoveBlock} onResizeBlock={onResizeBlock} onMoveEvent={onMoveEvent} onResizeEvent={onResizeEvent} onSplitBlock={onSplitBlock} onSplitEvent={onSplitEvent} events={resolvedEvents} onDeleteEvent={onDeleteEvent} onDeleteEventSeries={onDeleteEventSeries} onCreateBlock={onCreateBlock} onEditEvent={onEditEvent} onEditEventWithScope={onEditEventWithScope} onEditBlock={onEditBlock} onToggleEventAttendance={onToggleEventAttendance} onRescheduleLater={onRescheduleLater} onAddTimeToComplete={onAddTimeToComplete} showDifferences={mode === 'compare' ? showDifferences : undefined} weekStartsOnMonday={weekStartsOnMonday} activeStampEmoji={activeStampEmoji} pendingBlockPreview={pendingBlockPreview} selectionMode={selectionMode} selectedSlots={selectedSlots} onToggleSlot={onToggleSlot} onSelectionDone={onSelectionDone} onSelectionCancel={onSelectionCancel} viewTimezone={viewTimezone} onSetViewTimezone={setViewTimezone} highlightSlots={highlightSlots} />
          )}
          {view === 'month' && (
            <MonthView mode={mode} timeBlocks={mode === 'compare' ? visibleBlocks : mainViewBlocks} currentDate={currentDate} selectedBlock={selectedBlock} onSelectBlock={setSelectedBlock} focusedCategoryId={focusedCategoryId} focusedCalendarId={focusedCalendarId} onSelectDate={(d) => { onSelectedDateChange?.(d); onViewChange('3day'); }} events={eventsProp} weekStartsOnMonday={weekStartsOnMonday} onCreateRange={onCreateBlock ? (p) => onCreateBlock({ ...p, forceEvent: true }) : undefined} />
          )}
        </div>
      )}

      {/* Floating buttons — pinned to bottom-right */}
      <div className={`absolute bottom-6 right-6 z-30 flex flex-col items-center gap-3`}>
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
              width: 40, height: 40, borderRadius: '50%',
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
              <div className="fixed inset-0 z-40" onClick={() => { setStampMode(false); setActiveStampEmoji(null); setCustomOpen(false); }} />
              <div
                data-testid={customOpen ? 'sticker-editor' : undefined}
                className={`absolute z-50 flex gap-1 ${customOpen ? 'flex-col rounded-2xl' : 'items-center rounded-full py-1.5 px-2'}`}
                onClick={(e) => e.stopPropagation()}
                style={{
                  right: 48,
                  ...(customOpen ? { bottom: 0, width: 232, padding: 12 } : { top: '50%', transform: 'translateY(-50%)' }),
                  backgroundColor: '#FFFFFF',
                  border: '1.5px solid rgba(0,0,0,0.06)',
                  boxShadow: 'var(--tb-sh-2)',
                }}
              >
                {customOpen ? (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 600, color: TEXT_MUTED, marginBottom: 8 }}>Your stickers</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                      {userStickers.map((em) => (
                        <div key={em} className="group relative" style={{ width: 36, height: 36 }}>
                          <div className="flex items-center justify-center rounded-lg" style={{ width: 36, height: 36, fontSize: 20, backgroundColor: 'rgba(0,0,0,0.04)' }}>{em}</div>
                          <button
                            type="button"
                            aria-label={`Remove ${em}`}
                            className="absolute opacity-0 group-hover:opacity-100 focus:opacity-100 flex items-center justify-center rounded-full"
                            style={{ top: -5, right: -5, width: 16, height: 16, fontSize: 11, lineHeight: 1, background: '#5F615F', color: '#fff', border: 'none', touchAction: 'manipulation' }}
                            onClick={() => setStickerSet(userStickers.filter((x) => x !== em))}
                            onTouchStart={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
                          >×</button>
                        </div>
                      ))}
                    </div>
                    <input
                      ref={emojiInputRef}
                      type="text"
                      autoFocus
                      aria-label="Add emoji"
                      placeholder="Add emoji, press Enter"
                      value={emojiDraft}
                      onChange={(e) => { setEmojiDraft(e.target.value); setEmojiError(''); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDraftEmoji(); } if (e.key === 'Escape') { e.stopPropagation(); setCustomOpen(false); } }}
                      className="w-full rounded-lg outline-none"
                      style={{ height: 32, fontSize: 14, padding: '0 10px', border: '1px solid rgba(0,0,0,0.12)', backgroundColor: 'rgba(0,0,0,0.03)', boxSizing: 'border-box' }}
                    />
                    {emojiError && <div style={{ fontSize: 11, color: '#FF3B30', marginTop: 4 }}>{emojiError}</div>}
                    <div className="flex items-center justify-between" style={{ marginTop: 10 }}>
                      <button type="button" style={{ fontSize: 12, color: TEXT_MUTED, textDecoration: 'underline' }} onClick={() => setStickerSet(DEFAULT_STICKER_SET)}>Reset to defaults</button>
                      <Button size="sm" onClick={() => { setCustomOpen(false); setEmojiDraft(''); setEmojiError(''); }}>Done</Button>
                    </div>
                  </>
                ) : (
                  <>
                {STAMP_DEFAULTS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className="flex items-center justify-center rounded-full transition-all hover:scale-125 active:scale-95 tb-hv-bg"
                    style={{ '--hv-bg': 'rgba(0,0,0,0.04)', width: 32, height: 32, fontSize: 20, lineHeight: 1 } as React.CSSProperties}
                    onClick={() => setActiveStampEmoji(emoji)}
                  >
                    {emoji === MISSED_STAMP ? <span style={{ color: '#FF3B30', fontWeight: 600, fontSize: 18 }} title="Didn't happen">✕</span> : emoji}
                  </button>
                ))}
                <button
                  type="button"
                  aria-label="Edit stickers"
                  className="flex items-center justify-center rounded-full transition-all hover:scale-110 active:scale-95 tb-hv-bg"
                  style={{ '--hv-bg': 'rgba(0,0,0,0.08)', width: 32, height: 32, fontSize: 16, lineHeight: 1,
                    color: TEXT_MUTED, backgroundColor: 'rgba(0,0,0,0.04)', } as React.CSSProperties}
                  onClick={() => setCustomOpen((v) => !v)}
                >
                  +
                </button>
                  </>
                )}
              </div>
            </>
          )}

          {/* Active stamp hint */}
          {stampMode && activeStampEmoji && (
            <div
              className="absolute whitespace-nowrap rounded-full px-3 py-1"
              style={{
                right: 48,
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: 10, fontWeight: 500, color: PRIMARY,
                backgroundColor: 'rgba(141,162,134,0.08)',
                border: '1px solid rgba(141,162,134,0.15)',
              }}
            >
              Click to place · ↑↓ switch · Esc to exit
            </div>
          )}
        </div>

        {/* Add is now via calendar drag-to-create (events, time pre-filled) or the
            To-Do sidebar (tasks) — the generic + FAB was removed so new items always
            get a real time/context like Google Calendar. */}
      </div>
    </div>
  );
}
