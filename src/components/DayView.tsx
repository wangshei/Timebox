import React from 'react';
import { Mode } from '../types';
import { ResolvedTimeBlock, ResolvedEvent } from '../utils/dataResolver';
import { getLocalDateString } from '../utils/dateTime';
import { computeOverlapLayout } from '../utils/overlapLayout';
import { TimeBlockCard } from './TimeBlockCard';
import { EventCard } from './EventCard';
import {
  PX_PER_HOUR, SNAP_MINUTES as SNAP_MINUTES_UTIL,
  minutesToTimeString,
  offsetYToMinutes as offsetYToMinsUtil,
  parseTimeToMins,
} from '../utils/gridUtils';
import { BLOCK_PREVIEW, THEME } from '../constants/colors';
import { hexToRgba } from '../utils/color';
import { DueBadge } from './DueBadge';
import { useNow, useNowFrozen } from '../contexts/NowContext';
import { activeDrag } from '../utils/dragState';
import { useStore } from '../store/useStore';
import { getEventSegmentsForDate } from '../utils/crossDateEvents';
import { computeOverlapTruncation, TruncationItem } from '../utils/overlapTruncation';

export { SNAP_MINUTES_UTIL as SNAP_MINUTES };
const DEFAULT_DROP_MINUTES = 15;
const MIN_CREATE_MINUTES = 15;

export interface DropTaskParams {
  date: string;
  startTime: string;
  blockMinutes: number;
}

export interface CreateBlockParams {
  date: string;
  startTime: string;
  endTime: string;
  /** When true, block was created from the actual/recorded panel in compare mode. */
  isRecordedPanel?: boolean;
}

interface DayViewProps {
  mode: Mode;
  timeBlocks: ResolvedTimeBlock[];
  events?: ResolvedEvent[];
  selectedDate: string;
  selectedBlock: string | null;
  onSelectBlock: (id: string | null) => void;
  focusedCategoryId?: string | null;
  focusedCalendarId?: string | null;
  onConfirm?: (blockId: string) => void;
  onSkip?: (blockId: string) => void;
  onUnconfirm?: (blockId: string) => void;
  onDeleteBlock?: (blockId: string) => void;
  onDeleteTask?: (taskId: string) => void;
  onDeleteEvent?: (eventId: string) => void;
  onDeleteEventSeries?: (eventId: string, scope: 'this' | 'all' | 'all_after') => void;
  onDropTask?: (taskId: string, params: DropTaskParams) => void;
  /** Create a time block by drag on empty grid. */
  onCreateBlock?: (params: CreateBlockParams) => string | undefined;
  /** Move an existing block to new time/date. */
  onMoveBlock?: (blockId: string, params: { date: string; startTime: string; endTime: string }) => void;
  /** Resize a block by dragging its bottom edge (end time only). */
  onResizeBlock?: (blockId: string, params: { date: string; endTime: string }) => void;
  /** Move an event to new time/date. */
  onMoveEvent?: (eventId: string, params: { date: string; startTime: string; endTime: string }) => void;
  /** Resize an event by dragging its bottom edge (end time only). */
  onResizeEvent?: (eventId: string, params: { date: string; endTime: string }) => void;
  onEditEvent?: (eventId: string) => void;
  onEditBlock?: (blockId: string) => void;
  /** For compare mode: taskIds that have both planned and recorded blocks for this day. */
  compareMatchedTaskIds?: string[];
  /** When true, all block interactions are disabled (used for plan panel in compare mode). */
  locked?: boolean;
  /** When true, show difference highlights on blocks. */
  showDifferences?: boolean;
  /** Show a sticky date header at the top of the scroll area. */
  showDateHeader?: boolean;
  /** When true, DayView doesn't scroll internally — parent handles scrolling. */
  disableScroll?: boolean;
  onToggleEventAttendance?: (eventId: string, status: 'attended' | 'not_attended' | undefined) => void;
  onRescheduleLater?: (blockId: string) => void;
}

const START_HOUR = 0;
const GRID_HEIGHT = 24 * PX_PER_HOUR; // 24h grid (midnight-midnight)

export function DayView({ mode, timeBlocks, events = [], selectedDate, selectedBlock, onSelectBlock, focusedCategoryId, focusedCalendarId, onConfirm, onSkip, onUnconfirm, onDeleteBlock, onDeleteTask, onDeleteEvent, onDeleteEventSeries, onDropTask, onCreateBlock, onMoveBlock, onResizeBlock, onMoveEvent, onResizeEvent, onEditEvent, onEditBlock, compareMatchedTaskIds, locked, showDifferences, showDateHeader, disableScroll, onToggleEventAttendance, onRescheduleLater }: DayViewProps) {
  const nowCtx = useNow();
  const frozen = useNowFrozen();
  const [now, setNow] = React.useState(() => frozen ? nowCtx : new Date());
  const [isDragOver, setIsDragOver] = React.useState(false);
  const [dragPreview, setDragPreview] = React.useState<{ startMins: number; endMins: number } | null>(null);
  const [dragPreviewType, setDragPreviewType] = React.useState<'task' | 'block' | 'event'>('task');
  const [dragColor, setDragColor] = React.useState<string>(BLOCK_PREVIEW.color);
  const dragPreviewRef = React.useRef<{ startMins: number; endMins: number } | null>(null);
  const [creatingBlock, setCreatingBlock] = React.useState<{ startMins: number; endMins: number; anchorMins: number } | null>(null);
  const creatingBlockRef = React.useRef<{ startMins: number; endMins: number; anchorMins: number } | null>(null);
  const [resizingBlock, setResizingBlock] = React.useState<{ block: ResolvedTimeBlock; startClientY: number; endMins: number } | null>(null);
  const [resizingEvent, setResizingEvent] = React.useState<{ event: ResolvedEvent; startClientY: number; endMins: number } | null>(null);
  const gridRef = React.useRef<HTMLDivElement>(null);
  const outerRef = React.useRef<HTMLDivElement>(null);
  // Tasks due on this date
  const allTasks = useStore((s) => s.tasks);
  const dueTasks = React.useMemo(
    () => allTasks.filter((t) => t.dueDate === selectedDate && t.status !== 'done' && t.status !== 'archived'),
    [allTasks, selectedDate],
  );

  // Normalize: use same format for both sides; trim selectedDate in case of whitespace
  const todayStr = getLocalDateString(now);
  const isViewingToday =
    typeof selectedDate === 'string' && selectedDate.trim() === todayStr;

  React.useEffect(() => {
    dragPreviewRef.current = dragPreview;
  }, [dragPreview]);

  React.useEffect(() => {
    if (frozen) { setNow(nowCtx); return; }
    const t = setInterval(() => {
      if (!document.hidden) setNow(new Date());
    }, 60_000);
    return () => clearInterval(t);
  }, [frozen, nowCtx]);

  const offsetYToMinutes = (offsetY: number): number => offsetYToMinsUtil(offsetY, PX_PER_HOUR);

  const handleDragOver = (e: React.DragEvent) => {
    const hasTask = e.dataTransfer.types.includes('application/x-timebox-task-id');
    const hasBlock = e.dataTransfer.types.includes('application/x-timebox-block-id');
    const hasEvent = e.dataTransfer.types.includes('application/x-timebox-event-id');
    if (!hasTask && !hasBlock && !hasEvent) return;
    if (hasTask && !onDropTask) return;
    if (hasBlock && !onMoveBlock) return;
    if (hasEvent && !onMoveEvent) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = hasBlock || hasEvent ? 'move' : 'copy';
    setIsDragOver(true);
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return;
    const offsetY = e.clientY - rect.top;
    if (offsetY < 0 || offsetY > GRID_HEIGHT) return;
    const currentMins = offsetYToMinutes(offsetY);
    if (hasEvent) {
      const duration = activeDrag.type === 'event' && activeDrag.duration > 0 ? activeDrag.duration : DEFAULT_DROP_MINUTES;
      const color = activeDrag.color || BLOCK_PREVIEW.color;
      if (color) setDragColor(color);
      setDragPreviewType('event');
      setDragPreview({ startMins: currentMins, endMins: currentMins + duration });
    } else if (hasBlock) {
      const duration = activeDrag.type === 'block' || activeDrag.type === 'task' ? (activeDrag.duration || DEFAULT_DROP_MINUTES) : DEFAULT_DROP_MINUTES;
      const color = activeDrag.color || BLOCK_PREVIEW.color;
      if (color) setDragColor(color);
      setDragPreviewType('block');
      setDragPreview({ startMins: currentMins, endMins: currentMins + duration });
    } else {
      const duration = activeDrag.type === 'task' && activeDrag.duration > 0 ? activeDrag.duration : DEFAULT_DROP_MINUTES;
      const color = activeDrag.color || BLOCK_PREVIEW.color;
      if (color) setDragColor(color);
      setDragPreviewType('task');
      setDragPreview({ startMins: currentMins, endMins: currentMins + duration });
    }
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
    setDragPreview(null);
    setDragColor(BLOCK_PREVIEW.color);
  };

  const handleDrop = (e: React.DragEvent) => {
    const taskId = e.dataTransfer.getData('application/x-timebox-task-id');
    const blockId = e.dataTransfer.getData('application/x-timebox-block-id');
    const eventId = e.dataTransfer.getData('application/x-timebox-event-id');
    const preview = dragPreviewRef.current ?? dragPreview;
    setIsDragOver(false);
    setDragPreview(null);
    setDragColor(BLOCK_PREVIEW.color);
    dragPreviewRef.current = null;
    e.preventDefault();

    const rect = gridRef.current?.getBoundingClientRect();
    const fallbackMins = rect
      ? offsetYToMinutes(Math.max(0, Math.min(e.clientY - rect.top, GRID_HEIGHT)))
      : 9 * 60;
    const startMins = preview?.startMins ?? fallbackMins;
    const startTime = minutesToTimeString(startMins);

    if (blockId && onMoveBlock) {
      const durStr = e.dataTransfer.getData('application/x-timebox-block-duration');
      const duration = durStr && !Number.isNaN(parseInt(durStr, 10))
        ? Math.max(MIN_CREATE_MINUTES, parseInt(durStr, 10))
        : (preview ? preview.endMins - preview.startMins : DEFAULT_DROP_MINUTES);
      const endTime = minutesToTimeString(startMins + duration);
      onMoveBlock(blockId, { date: selectedDate, startTime, endTime });
      return;
    }
    if (eventId && onMoveEvent) {
      const durStr = e.dataTransfer.getData('application/x-timebox-event-duration');
      const duration = durStr && !Number.isNaN(parseInt(durStr, 10))
        ? Math.max(MIN_CREATE_MINUTES, parseInt(durStr, 10))
        : (preview ? preview.endMins - preview.startMins : DEFAULT_DROP_MINUTES);
      const endTime = minutesToTimeString(startMins + duration);
      onMoveEvent(eventId, { date: selectedDate, startTime, endTime });
      return;
    }
    if (taskId && onDropTask) {
      const durStr = e.dataTransfer.getData('application/x-timebox-task-duration');
      const droppedMins = durStr && !Number.isNaN(parseInt(durStr, 10))
        ? Math.max(MIN_CREATE_MINUTES, parseInt(durStr, 10))
        : (preview ? preview.endMins - preview.startMins : DEFAULT_DROP_MINUTES);
      const blockMinutes = Math.max(MIN_CREATE_MINUTES, droppedMins);
      onDropTask(taskId, { date: selectedDate, startTime, blockMinutes });
    }
  };

  // Drag-to-create: mouseDown on the grid (drag down or up to set range)
  const handleGridMouseDown = (e: React.MouseEvent) => {
    if (!onCreateBlock || creatingBlock) return;
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return;
    const offsetY = e.clientY - rect.top;
    if (offsetY < 0 || offsetY > GRID_HEIGHT) return;
    const anchorMins = offsetYToMinutes(offsetY);
    setCreatingBlock({ startMins: anchorMins, endMins: anchorMins + MIN_CREATE_MINUTES, anchorMins });
  };

  React.useEffect(() => {
    creatingBlockRef.current = creatingBlock;
  }, [creatingBlock]);

  React.useEffect(() => {
    if (!creatingBlock) return;
    const rect = gridRef.current?.getBoundingClientRect();
    const onMove = (e: MouseEvent) => {
      if (!rect) return;
      const offsetY = e.clientY - rect.top;
      const currentMins = offsetYToMinutes(Math.max(0, Math.min(offsetY, GRID_HEIGHT)));
      setCreatingBlock((prev) => {
        if (!prev) return null;
        const anchor = prev.anchorMins;
        let startMins: number;
        let endMins: number;
        if (currentMins >= anchor) {
          // Dragging down from anchor
          startMins = anchor;
          endMins = Math.max(currentMins, anchor + MIN_CREATE_MINUTES);
        } else {
          // Dragging up from anchor
          startMins = currentMins;
          endMins = Math.max(anchor, currentMins + MIN_CREATE_MINUTES);
        }
        creatingBlockRef.current = { startMins, endMins, anchorMins: anchor };
        return { startMins, endMins, anchorMins: anchor };
      });
    };
    const onUp = () => {
      const cur = creatingBlockRef.current ?? creatingBlock;
      setCreatingBlock(null);
      creatingBlockRef.current = null;
      if (!cur || !onCreateBlock) return;
      const startTime = minutesToTimeString(cur.startMins);
      const endTime = minutesToTimeString(cur.endMins);
      onCreateBlock({ date: selectedDate, startTime, endTime });
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [creatingBlock, selectedDate, onCreateBlock]);

  React.useEffect(() => {
    if (!resizingBlock || !onResizeBlock) return;
    const { block, startClientY } = resizingBlock;
    const startMins = parseTimeToMins(block.start);
    const minEndMins = startMins + SNAP_MINUTES_UTIL;
    const onMove = (e: MouseEvent) => {
      const deltaMins = ((e.clientY - startClientY) / PX_PER_HOUR) * 60;
      let newEndMins = parseTimeToMins(block.end) + deltaMins;
      newEndMins = Math.round(newEndMins / SNAP_MINUTES_UTIL) * SNAP_MINUTES_UTIL;
      newEndMins = Math.max(minEndMins, newEndMins);
      onResizeBlock(block.id, { date: block.date, endTime: minutesToTimeString(newEndMins) });
    };
    const onUp = () => setResizingBlock(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [resizingBlock, onResizeBlock]);

  React.useEffect(() => {
    if (!resizingEvent || !onResizeEvent) return;
    const { event, startClientY } = resizingEvent;
    const startMins = parseTimeToMins(event.start);
    const minEndMins = startMins + SNAP_MINUTES_UTIL;
    const onMove = (e: MouseEvent) => {
      const deltaMins = ((e.clientY - startClientY) / PX_PER_HOUR) * 60;
      let newEndMins = parseTimeToMins(event.end) + deltaMins;
      newEndMins = Math.round(newEndMins / SNAP_MINUTES_UTIL) * SNAP_MINUTES_UTIL;
      newEndMins = Math.max(minEndMins, newEndMins);
      onResizeEvent(event.id, { date: event.date, endTime: minutesToTimeString(newEndMins) });
    };
    const onUp = () => setResizingEvent(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [resizingEvent, onResizeEvent]);

  const handleResizeStart = React.useCallback((block: ResolvedTimeBlock, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingBlock({ block, startClientY: e.clientY });
  }, []);

  const handleResizeStartByBlockId = React.useCallback((blockId: string, e: React.MouseEvent) => {
    const block = timeBlocks.find((b) => b.id === blockId);
    if (block) handleResizeStart(block, e);
  }, [timeBlocks, handleResizeStart]);

  const handleEventResizeStart = React.useCallback((event: ResolvedEvent, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingEvent({ event, startClientY: e.clientY });
  }, []);

  const hours = React.useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);

  const getBlockStyle = (block: ResolvedTimeBlock) => {
    const startMinutes = parseTimeToMins(block.start);
    const endMinutes = parseTimeToMins(block.end);
    const duration = endMinutes - startMinutes;
    const top = ((startMinutes - START_HOUR * 60) / 60) * PX_PER_HOUR;
    const height = Math.max((duration / 60) * PX_PER_HOUR, 20);
    return { top, height };
  };

  // Current-time line
  const currentTimeMinutes = now.getHours() * 60 + now.getMinutes();
  const currentTimeTopRaw =
    currentTimeMinutes >= START_HOUR * 60 && currentTimeMinutes < (START_HOUR + 24) * 60
      ? ((currentTimeMinutes - START_HOUR * 60) / 60) * PX_PER_HOUR
      : null;
  const currentTimeTop =
    currentTimeTopRaw != null ? Math.max(0, Math.min(currentTimeTopRaw, GRID_HEIGHT - 2)) : null;

  // Scroll to ~7 AM on first paint (skip when parent handles scrolling)
  React.useEffect(() => {
    if (outerRef.current && !disableScroll) {
      const scrollTo7AM = 7 * PX_PER_HOUR;
      outerRef.current.scrollTop = scrollTo7AM;
    }
  }, [disableScroll]);

  // Compare mode helper
  const selectedIsPast =
    mode === 'compare' &&
    selectedDate < todayStr;

  // Compute event segments for this day (handles cross-date events)
  const eventSegments = React.useMemo(
    () => getEventSegmentsForDate(events, selectedDate),
    [events, selectedDate]
  );

  // Overlap layout for ALL blocks and events (tasks share column with events using overlap algorithm).
  const overlapMap = React.useMemo(() => {
    const allItems = [
      ...timeBlocks.map((b) => ({ id: b.id, start: b.start, end: b.end })),
      ...eventSegments.map((seg) => ({ id: `event-${seg.event.id}`, start: seg.displayStart, end: seg.displayEnd })),
    ];
    return computeOverlapLayout(allItems);
  }, [timeBlocks, eventSegments]);

  // Overlap truncation — applied in all modes except locked (Plan panel)
  const truncationMap = React.useMemo(() => {
    if (locked) return new Map<string, { effectiveStart: string; effectiveEnd: string; hidden: boolean }>();
    const items: TruncationItem[] = [
      ...timeBlocks.map((b) => ({
        id: b.id,
        start: b.start,
        end: b.end,
        priority: b.source === 'unplanned' ? 3
          : (b.confirmationStatus === 'confirmed') ? 2
          : 1,
      })),
      ...eventSegments.map((seg) => ({
        id: `event-${seg.event.id}`,
        start: seg.displayStart,
        end: seg.displayEnd,
        priority: seg.event.source === 'unplanned' ? 3
          : (seg.event.attendanceStatus === 'attended') ? 2
          : 1,
      })),
    ];
    const results = computeOverlapTruncation(items);
    const map = new Map<string, { effectiveStart: string; effectiveEnd: string; hidden: boolean }>();
    for (const r of results) map.set(r.id, r);
    return map;
  }, [locked, timeBlocks, eventSegments]);

  const blockStylesMap = React.useMemo(() => {
    const map = new Map<string, React.CSSProperties>();
    timeBlocks.forEach((block) => {
      const trunc = truncationMap.get(block.id);
      const startMins = trunc && !trunc.hidden ? parseTimeToMins(trunc.effectiveStart) : parseTimeToMins(block.start);
      const endMins = trunc && !trunc.hidden ? parseTimeToMins(trunc.effectiveEnd) : parseTimeToMins(block.end);
      const duration = endMins - startMins;
      const top = ((startMins - START_HOUR * 60) / 60) * PX_PER_HOUR;
      const height = Math.max((duration / 60) * PX_PER_HOUR, 20);
      const layout = overlapMap.get(block.id);
      const colWidth = layout ? 100 / layout.totalColumns : 100;
      const leftPercent = layout ? layout.columnIndex * colWidth : 0;
      // Cap rightmost column so there's always a clickable gutter for creating new blocks
      const isLastColumn = !layout || layout.columnIndex === layout.totalColumns - 1;
      const widthPercent = isLastColumn && leftPercent + colWidth > 92 ? 92 - leftPercent : colWidth;
      map.set(block.id, {
        top: `${top}px`,
        height: `${height}px`,
        width: `${widthPercent}%`,
        left: `${leftPercent}%`,
        ...(trunc?.hidden ? { opacity: 0.15 } : {}),
      });
    });
    return map;
  }, [timeBlocks, overlapMap, truncationMap]);

  const nowMins = now.getHours() * 60 + now.getMinutes();

  return (
    <div
      ref={outerRef}
      className={`flex-1 min-w-0 ${disableScroll || showDateHeader ? '' : 'overflow-y-auto'} ${mode === 'compare' ? 'px-2 md:px-3 py-3' : 'px-3 md:px-6 py-4'}`}
      style={mode === 'compare' && selectedIsPast ? { backgroundColor: 'rgba(0,0,0,0.025)' } : undefined}
    >
      {/* Sticky date header — matches ThreeDayView's sticky day headers */}
      {showDateHeader && (() => {
        const dateObj = (() => { const [y, m, d] = selectedDate.split('-').map(Number); return new Date(y, m - 1, d); })();
        const dayAbbrev = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
        const dateNumber = dateObj.getDate();
        const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
        return (
          <div
            className="sticky top-0 z-20 flex items-center gap-3 px-3"
            style={{
              height: 48,
              borderBottom: '1px solid rgba(0,0,0,0.07)',
              backgroundColor: isViewingToday ? 'rgba(141,162,134,0.05)' : '#FDFDFB',
              position: 'relative',
            }}
          >
            <div className="flex flex-col">
              <div
                className="font-semibold uppercase"
                style={{
                  color: isViewingToday ? '#8DA286' : isWeekend ? '#AEAEB2' : '#C7C7CC',
                  fontSize: '10px',
                  letterSpacing: '0.08em',
                }}
              >
                {dayAbbrev}
              </div>
              <div
                className="font-bold leading-none"
                style={{
                  color: isViewingToday ? '#8DA286' : isWeekend ? '#8E8E93' : '#3A3A3C',
                  fontSize: isViewingToday ? 20 : 17,
                }}
              >
                {dateNumber}
              </div>
            </div>
            {dueTasks.length > 0 && (
              <div style={{ position: 'absolute', bottom: 4, right: 8 }}>
                <DueBadge tasks={dueTasks} />
              </div>
            )}
          </div>
        );
      })()}

      {/* Main grid container: ALL mouse/drag handlers live here.
          Clicks on empty space (not caught by cards) bubble up to this element. */}
      <div
        ref={gridRef}
        className={`relative ${!locked && onCreateBlock ? 'cursor-crosshair' : ''}`}
        style={{ height: GRID_HEIGHT }}
        onMouseDown={!locked ? handleGridMouseDown : undefined}
        onDragOver={!locked && (onDropTask || onMoveBlock || onMoveEvent) ? handleDragOver : undefined}
        onDragLeave={!locked && (onDropTask || onMoveBlock || onMoveEvent) ? handleDragLeave : undefined}
        onDrop={!locked && (onDropTask || onMoveBlock || onMoveEvent) ? handleDrop : undefined}
      >
        {/* Today green tint for future portion of current day */}
        {mode === 'overall' && selectedDate === todayStr && currentTimeTop != null && currentTimeTop < GRID_HEIGHT && (
          <div
            className="absolute left-14 md:left-20 right-0 pointer-events-none"
            style={{ top: currentTimeTop, height: GRID_HEIGHT - currentTimeTop, backgroundColor: 'rgba(141,162,134,0.05)' }}
          />
        )}

        {/* Grid: hour rows */}
        {hours.map((hour) => (
          <div
            key={hour}
            className="absolute left-0 right-0 pointer-events-none"
            style={{ top: hour * PX_PER_HOUR, height: PX_PER_HOUR }}
          >
            <div
              className="absolute left-0 top-0 w-12 md:w-16 text-xs leading-none font-medium"
              style={{ color: '#AEAEB2', fontSize: '10px' }}
            >
              {hour === 0 ? '12am' : hour === 12 ? '12pm' : hour > 12 ? `${hour - 12}pm` : `${hour}am`}
            </div>
            <div
              className="absolute left-14 md:left-20 right-0 top-0"
              style={{ height: PX_PER_HOUR, borderTop: '1px solid rgba(0,0,0,0.07)' }}
            />
            <div
              className="absolute left-14 md:left-20 right-0"
              style={{ top: `${PX_PER_HOUR / 2}px`, borderTop: '1px solid rgba(0,0,0,0.035)' }}
            />
          </div>
        ))}

        {/* Cards area: absolutely positioned to match the grid area, pointer-events-none
            so empty space clicks pass through to the main container. Individual cards
            have pointer-events-auto + onMouseDown stopPropagation. */}
        <div
          className="absolute left-14 md:left-20 right-0 top-0 pointer-events-none"
          style={{ height: GRID_HEIGHT }}
        >
          {/* Time blocks: tasks = slimmer left-aligned; event-type blocks = fill slot with overlap */}
          {timeBlocks.map((block) => {
            const style = blockStylesMap.get(block.id);
            if (!style) return null;
            return (
              <TimeBlockCard
                key={block.id}
                block={block}
                mode={mode}
                style={style}
                isSelected={selectedBlock === block.id}
                onSelectBlock={onSelectBlock}
                todayStr={todayStr}
                nowMins={nowMins}
                focusedCategoryId={focusedCategoryId}
                focusedCalendarId={focusedCalendarId}
                onConfirm={onConfirm}
                onSkip={onSkip}
                onUnconfirm={onUnconfirm}
                onDeleteBlock={onDeleteBlock}
                onDeleteTask={onDeleteTask}
                onEditBlock={onEditBlock}
                onResizeStart={onResizeBlock ? handleResizeStartByBlockId : undefined}
                compareMatchedTaskIds={compareMatchedTaskIds}
                locked={locked}
                showDifferences={showDifferences}
                onRescheduleLater={onRescheduleLater}
              />
            );
          })}

          {/* Events: fill slot, overlap when multiple; show description + tag */}
          {eventSegments.map((seg) => {
            const truncKey = `event-${seg.event.id}`;
            const trunc = truncationMap.get(truncKey);
            const startMinutes = trunc && !trunc.hidden ? parseTimeToMins(trunc.effectiveStart) : parseTimeToMins(seg.displayStart);
            const endMinutes = trunc && !trunc.hidden ? parseTimeToMins(trunc.effectiveEnd) : parseTimeToMins(seg.displayEnd);
            const duration = endMinutes - startMinutes;
            const top = ((startMinutes - START_HOUR * 60) / 60) * PX_PER_HOUR;
            const height = Math.max((duration / 60) * PX_PER_HOUR, 20);
            const layout = overlapMap.get(`event-${seg.event.id}`);
            const evColWidth = layout ? 100 / layout.totalColumns : 100;
            const leftPercent = layout ? layout.columnIndex * evColWidth : 0;
            // Cap rightmost column so there's always a clickable gutter for creating new blocks
            const isLastEvCol = !layout || layout.columnIndex === layout.totalColumns - 1;
            const widthPercent = isLastEvCol && leftPercent + evColWidth > 92 ? 92 - leftPercent : evColWidth;
            return (
              <EventCard
                key={seg.event.id}
                event={seg.event}
                style={{
                  top: `${top}px`,
                  height: `${height}px`,
                  width: `${widthPercent}%`,
                  left: `${leftPercent}%`,
                  ...(trunc?.hidden ? { opacity: 0.15 } : {}),
                }}
                isSelected={selectedBlock === `event-${seg.event.id}`}
                onSelect={() => onSelectBlock(`event-${seg.event.id}`)}
                onDeselect={() => onSelectBlock(null)}
                onDeleteEvent={onDeleteEvent}
                onDeleteEventSeries={onDeleteEventSeries}
                onEditEvent={onEditEvent}
                plannedStyle={false}
                draggable={!!onMoveEvent}
                onResizeStart={onResizeEvent && seg.isEndSegment ? (e) => handleEventResizeStart(seg.event, e) : undefined}
                onToggleAttendance={onToggleEventAttendance}
                showDifferences={showDifferences}
                isStartSegment={seg.isStartSegment}
                isEndSegment={seg.isEndSegment}
              />
            );
          })}
        </div>

        {/* Current-time indicator — warm waterlily blue */}
        {isViewingToday && currentTimeTop != null && (
          <>
            <div
              className="absolute left-14 md:left-20 right-0 z-30 pointer-events-none"
              style={{
                top: currentTimeTop,
                height: 0,
                borderTop: '2px solid #8DA286',
              }}
              aria-hidden
            />
            <div
              className="absolute left-0 z-40 text-xs font-semibold tabular-nums pointer-events-none"
              style={{ top: currentTimeTop - 8, color: THEME.primary, fontSize: '10px' }}
            >
              {now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
            </div>
          </>
        )}

        {/* Drag preview — task-style (filled) or event-style (stripe) based on drag type */}
        {(onDropTask || onMoveBlock || onMoveEvent) && dragPreview && (() => {
          const isEventPreview = dragPreviewType === 'event';
          const previewStyle: React.CSSProperties = isEventPreview
            ? {
                backgroundColor: hexToRgba(dragColor, BLOCK_PREVIEW.bgAlpha),
                borderLeft: `3px solid ${hexToRgba(dragColor, BLOCK_PREVIEW.stripeAlpha)}`,
                borderTop: '1px dashed rgba(0,0,0,0.08)',
                borderRight: '1px dashed rgba(0,0,0,0.08)',
                borderBottom: '1px dashed rgba(0,0,0,0.08)',
              }
            : {
                backgroundColor: '#FFF9EC',
                borderTop: `3px solid ${dragColor}`,
                borderLeft: `1px solid ${hexToRgba(dragColor, 0.22)}`,
                borderRight: `1px solid ${hexToRgba(dragColor, 0.22)}`,
                borderBottom: `1px solid ${hexToRgba(dragColor, 0.22)}`,
                borderRadius: 5,
                boxShadow: '0 2px 6px rgba(0,0,0,0.10)',
              };
          const previewClass = isEventPreview
            ? 'absolute left-14 md:left-20 right-2 z-30 pointer-events-none rounded-r-md overflow-hidden'
            : 'absolute left-14 md:left-20 right-2 z-30 pointer-events-none overflow-hidden';
          return (
            <div
              className={previewClass}
              style={{
                top: `${((dragPreview.startMins - START_HOUR * 60) / 60) * PX_PER_HOUR}px`,
                height: `${((dragPreview.endMins - dragPreview.startMins) / 60) * PX_PER_HOUR}px`,
                ...previewStyle,
              }}
            >
              <span className="absolute bottom-1 left-2 text-xs font-medium" style={{ color: THEME.textPrimary }}>
                {minutesToTimeString(dragPreview.startMins)}–{minutesToTimeString(dragPreview.endMins)} ({dragPreview.endMins - dragPreview.startMins}m)
              </span>
            </div>
          );
        })()}

        {/* Create-block preview — event-style (left stripe) since block creation always creates an event-type block */}
        {creatingBlock && (
          <div
            className="absolute left-14 md:left-20 right-2 z-30 pointer-events-none rounded-r-md overflow-hidden"
            style={{
              top: `${((creatingBlock.startMins - START_HOUR * 60) / 60) * PX_PER_HOUR}px`,
              height: `${((creatingBlock.endMins - creatingBlock.startMins) / 60) * PX_PER_HOUR}px`,
              backgroundColor: hexToRgba(BLOCK_PREVIEW.color, BLOCK_PREVIEW.bgAlpha),
              borderLeft: `3px solid ${hexToRgba(BLOCK_PREVIEW.color, BLOCK_PREVIEW.stripeAlpha)}`,
              borderTop: '1px dashed rgba(0,0,0,0.08)',
              borderRight: '1px dashed rgba(0,0,0,0.08)',
              borderBottom: '1px dashed rgba(0,0,0,0.08)',
            }}
          >
            <span className="absolute bottom-1 left-2 text-xs font-medium" style={{ color: THEME.textPrimary }}>
              {minutesToTimeString(creatingBlock.startMins)}–{minutesToTimeString(creatingBlock.endMins)} ({creatingBlock.endMins - creatingBlock.startMins}m)
            </span>
          </div>
        )}

        {/* Drag-over highlight */}
        {isDragOver && (
          <div
            className="absolute left-14 md:left-20 right-0 top-0 pointer-events-none rounded-r-lg"
            style={{
              height: GRID_HEIGHT,
              backgroundColor: hexToRgba(THEME.primary, 0.04),
              boxShadow: `inset 0 0 0 2px ${hexToRgba(THEME.primary, 0.23)}`,
            }}
          />
        )}
      </div>
    </div>
  );
}
