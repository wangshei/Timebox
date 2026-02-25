import React from 'react';
import { Mode } from '../types';
import { ResolvedTimeBlock, ResolvedEvent } from '../utils/dataResolver';
import { getLocalDateString } from '../utils/dateTime';
import { computeOverlapLayout } from '../utils/overlapLayout';
import { TimeBlockCard } from './TimeBlockCard';
import { EventCard } from './EventCard';
import {
  PX_PER_HOUR, SNAP_MINUTES as SNAP_MINUTES_UTIL, TASK_BLOCK_WIDTH_PERCENT,
  minutesToTimeString,
  offsetYToMinutes as offsetYToMinsUtil,
  parseTimeToMins,
} from '../utils/gridUtils';

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
  onUnconfirm?: (blockId: string) => void;
  onDeleteBlock?: (blockId: string) => void;
  onDeleteTask?: (taskId: string) => void;
  onDeleteEvent?: (eventId: string) => void;
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
}

const START_HOUR = 0;
const GRID_HEIGHT = 24 * PX_PER_HOUR; // 24h grid (midnight-midnight)

export function DayView({ mode, timeBlocks, events = [], selectedDate, selectedBlock, onSelectBlock, focusedCategoryId, focusedCalendarId, onConfirm, onUnconfirm, onDeleteBlock, onDeleteTask, onDeleteEvent, onDropTask, onCreateBlock, onMoveBlock, onResizeBlock, onMoveEvent, onResizeEvent, onEditEvent, onEditBlock, compareMatchedTaskIds }: DayViewProps) {
  const [now, setNow] = React.useState(() => new Date());
  const [isDragOver, setIsDragOver] = React.useState(false);
  const [dragPreview, setDragPreview] = React.useState<{ startMins: number; endMins: number } | null>(null);
  const dragPreviewRef = React.useRef<{ startMins: number; endMins: number } | null>(null);
  const [creatingBlock, setCreatingBlock] = React.useState<{ startMins: number; endMins: number } | null>(null);
  const creatingBlockRef = React.useRef<{ startMins: number; endMins: number } | null>(null);
  const [resizingBlock, setResizingBlock] = React.useState<{ block: ResolvedTimeBlock; startClientY: number; endMins: number } | null>(null);
  const [resizingEvent, setResizingEvent] = React.useState<{ event: ResolvedEvent; startClientY: number; endMins: number } | null>(null);
  const gridRef = React.useRef<HTMLDivElement>(null);
  const outerRef = React.useRef<HTMLDivElement>(null);
  // Normalize: use same format for both sides; trim selectedDate in case of whitespace
  const todayStr = getLocalDateString(now);
  const isViewingToday =
    typeof selectedDate === 'string' && selectedDate.trim() === todayStr;

  React.useEffect(() => {
    dragPreviewRef.current = dragPreview;
  }, [dragPreview]);

  React.useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

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
      const durationStr = e.dataTransfer.getData('application/x-timebox-event-duration');
      const duration = durationStr ? Math.max(MIN_CREATE_MINUTES, parseInt(durationStr, 10)) : DEFAULT_DROP_MINUTES;
      setDragPreview({ startMins: currentMins, endMins: currentMins + duration });
    } else if (hasBlock) {
      const durationStr = e.dataTransfer.getData('application/x-timebox-block-duration');
      const duration = durationStr ? Math.max(MIN_CREATE_MINUTES, parseInt(durationStr, 10)) : DEFAULT_DROP_MINUTES;
      setDragPreview({ startMins: currentMins, endMins: currentMins + duration });
    } else {
      const durationStr = e.dataTransfer.getData('application/x-timebox-task-duration');
      const duration = durationStr ? Math.max(MIN_CREATE_MINUTES, parseInt(durationStr, 10)) : DEFAULT_DROP_MINUTES;
      setDragPreview({ startMins: currentMins, endMins: currentMins + duration });
    }
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
    setDragPreview(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    const taskId = e.dataTransfer.getData('application/x-timebox-task-id');
    const blockId = e.dataTransfer.getData('application/x-timebox-block-id');
    const eventId = e.dataTransfer.getData('application/x-timebox-event-id');
    const preview = dragPreviewRef.current ?? dragPreview;
    setIsDragOver(false);
    setDragPreview(null);
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
    const startMins = offsetYToMinutes(offsetY);
    setCreatingBlock({ startMins, endMins: startMins + MIN_CREATE_MINUTES });
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
        const minDuration = MIN_CREATE_MINUTES;
        let startMins = prev.startMins;
        let endMins = prev.endMins;
        if (currentMins >= prev.startMins) {
          endMins = Math.max(currentMins, prev.startMins + minDuration);
        } else {
          startMins = currentMins;
          endMins = Math.max(prev.endMins, currentMins + minDuration);
        }
        creatingBlockRef.current = { startMins, endMins };
        return { startMins, endMins };
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
    const height = (duration / 60) * PX_PER_HOUR;
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

  // Scroll to ~7 AM on first paint
  React.useEffect(() => {
    if (outerRef.current) {
      const scrollTo7AM = 7 * PX_PER_HOUR;
      outerRef.current.scrollTop = scrollTo7AM;
    }
  }, []);

  // Compare mode helper
  const selectedIsPast =
    mode === 'compare' &&
    selectedDate < todayStr;

  // Overlap layout only for events and event-type blocks (no taskId). Tasks get slimmer left-aligned width.
  const overlapMap = React.useMemo(() => {
    const eventLikeItems = [
      ...timeBlocks.filter((b) => !b.taskId).map((b) => ({ id: b.id, start: b.start, end: b.end })),
      ...events.map((e) => ({ id: `event-${e.id}`, start: e.start, end: e.end })),
    ];
    return computeOverlapLayout(eventLikeItems);
  }, [timeBlocks, events]);

  const blockStylesMap = React.useMemo(() => {
    const map = new Map<string, React.CSSProperties>();
    timeBlocks.forEach((block) => {
      const { top, height } = getBlockStyle(block);
      const isTask = !!block.taskId;
      const layout = overlapMap.get(block.id);
      const widthPercent = isTask
        ? TASK_BLOCK_WIDTH_PERCENT
        : layout
          ? 100 / layout.totalColumns
          : 100;
      const leftPercent = isTask ? 0 : layout ? layout.columnIndex * (100 / (layout.totalColumns || 1)) : 0;
      map.set(block.id, {
        top: `${top}px`,
        height: `${height}px`,
        width: `${widthPercent}%`,
        left: `${leftPercent}%`,
      });
    });
    return map;
  }, [timeBlocks, overlapMap]);

  const nowMins = now.getHours() * 60 + now.getMinutes();

  return (
    <div
      ref={outerRef}
      className={`flex-1 min-w-0 overflow-y-auto ${mode === 'compare' ? 'px-2 md:px-3 py-3' : 'px-3 md:px-6 py-4'}`}
      style={mode === 'compare' && selectedIsPast ? { backgroundColor: 'rgba(0,0,0,0.025)' } : undefined}
    >
      {/* Main grid container: ALL mouse/drag handlers live here.
          Clicks on empty space (not caught by cards) bubble up to this element. */}
      <div
        ref={gridRef}
        className={`relative ${onCreateBlock ? 'cursor-crosshair' : ''}`}
        style={{ height: GRID_HEIGHT }}
        onMouseDown={handleGridMouseDown}
        onDragOver={onDropTask || onMoveBlock || onMoveEvent ? handleDragOver : undefined}
        onDragLeave={onDropTask || onMoveBlock || onMoveEvent ? handleDragLeave : undefined}
        onDrop={onDropTask || onMoveBlock || onMoveEvent ? handleDrop : undefined}
      >
        {/* Grid: hour rows with warm lines; past slots slightly warmer */}
        {hours.map((hour) => {
          const slotEndMins = (hour + 1) * 60;
          const isPastSlot =
            mode === 'overall' &&
            (selectedDate < todayStr || (selectedDate === todayStr && slotEndMins <= nowMins));
          const isHalfHour = false; // placeholder, used below
          void isHalfHour;
          return (
            <div
              key={hour}
              className="absolute left-0 right-0 pointer-events-none"
              style={{ top: hour * PX_PER_HOUR, height: PX_PER_HOUR }}
            >
              {/* Time label */}
              <div
                className="absolute left-0 top-0 w-12 md:w-16 text-xs leading-none font-medium"
                style={{ color: '#AEAEB2', fontSize: '10px' }}
              >
                {hour === 0
                  ? '12am'
                  : hour === 12
                    ? '12pm'
                    : hour > 12
                      ? `${hour - 12}pm`
                      : `${hour}am`}
              </div>
              {/* Hour line + optional past-slot fill */}
              <div
                className="absolute left-14 md:left-20 right-0 top-0"
                style={{
                  height: PX_PER_HOUR,
                  borderTop: '1px solid rgba(0,0,0,0.07)',
                  backgroundColor: isPastSlot ? 'rgba(0,0,0,0.025)' : 'transparent',
                }}
              />
              {/* Half-hour line */}
              <div
                className="absolute left-14 md:left-20 right-0"
                style={{
                  top: `${PX_PER_HOUR / 2}px`,
                  borderTop: '1px solid rgba(0,0,0,0.035)',
                }}
              />
            </div>
          );
        })}

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
                onUnconfirm={onUnconfirm}
                onDeleteBlock={onDeleteBlock}
                onDeleteTask={onDeleteTask}
                onEditBlock={onEditBlock}
                onResizeStart={onResizeBlock ? handleResizeStartByBlockId : undefined}
                compareMatchedTaskIds={compareMatchedTaskIds}
              />
            );
          })}

          {/* Events: fill slot, overlap when multiple; show description + tag */}
          {events.map((event) => {
            const startMinutes = parseTimeToMins(event.start);
            const endMinutes = parseTimeToMins(event.end);
            const duration = endMinutes - startMinutes;
            const top = ((startMinutes - START_HOUR * 60) / 60) * PX_PER_HOUR;
            const height = Math.max((duration / 60) * PX_PER_HOUR, 20);
            const layout = overlapMap.get(`event-${event.id}`);
            const widthPercent = layout ? 100 / layout.totalColumns : 100;
            const leftPercent = layout ? layout.columnIndex * widthPercent : 0;
            return (
              <EventCard
                key={event.id}
                event={event}
                style={{
                  top: `${top}px`,
                  height: `${height}px`,
                  width: `${widthPercent}%`,
                  left: `${leftPercent}%`,
                }}
                isSelected={selectedBlock === `event-${event.id}`}
                onSelect={() => onSelectBlock(`event-${event.id}`)}
                onDeselect={() => onSelectBlock(null)}
                onDeleteEvent={onDeleteEvent}
                onEditEvent={onEditEvent}
                plannedStyle={false}
                draggable={!!onMoveEvent}
                onResizeStart={onResizeEvent ? (e) => handleEventResizeStart(event, e) : undefined}
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
                borderTop: '2px solid #4A80F0',
              }}
              aria-hidden
            />
            <div
              className="absolute left-0 z-40 text-xs font-semibold tabular-nums pointer-events-none"
              style={{ top: currentTimeTop - 8, color: '#4A80F0', fontSize: '10px' }}
            >
              {now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
            </div>
          </>
        )}

        {/* Drag preview (task/block drop) */}
        {(onDropTask || onMoveBlock || onMoveEvent) && dragPreview && (
          <div
            className="absolute left-14 md:left-20 right-2 z-30 pointer-events-none rounded-xl"
            style={{
              top: `${((dragPreview.startMins - START_HOUR * 60) / 60) * PX_PER_HOUR}px`,
              height: `${((dragPreview.endMins - dragPreview.startMins) / 60) * PX_PER_HOUR}px`,
              backgroundColor: 'rgba(74,128,240,0.10)',
              border: '2px dashed rgba(74,128,240,0.45)',
            }}
          >
            <span className="absolute bottom-1 left-2 text-xs font-medium" style={{ color: '#4A80F0' }}>
              {minutesToTimeString(dragPreview.startMins)}–{minutesToTimeString(dragPreview.endMins)} ({dragPreview.endMins - dragPreview.startMins}m)
            </span>
          </div>
        )}

        {/* Create-block preview */}
        {creatingBlock && (
          <div
            className="absolute left-14 md:left-20 right-2 z-30 pointer-events-none rounded-xl"
            style={{
              top: `${((creatingBlock.startMins - START_HOUR * 60) / 60) * PX_PER_HOUR}px`,
              height: `${((creatingBlock.endMins - creatingBlock.startMins) / 60) * PX_PER_HOUR}px`,
              backgroundColor: 'rgba(74,128,240,0.08)',
              border: '2px dashed rgba(74,128,240,0.40)',
            }}
          >
            <span className="absolute bottom-1 left-2 text-xs font-medium" style={{ color: '#4A80F0' }}>
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
              backgroundColor: 'rgba(74,128,240,0.03)',
              boxShadow: 'inset 0 0 0 2px rgba(74,128,240,0.20)',
            }}
          />
        )}
      </div>
    </div>
  );
}
