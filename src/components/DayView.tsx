import React from 'react';
import { Mode } from '../types';
import { ResolvedTimeBlock, ResolvedEvent } from '../utils/dataResolver';
import { getLocalDateString } from '../utils/dateTime';
import { computeOverlapLayout } from '../utils/overlapLayout';
import { TimeBlockCard, RecordedBlockPayload } from './TimeBlockCard';
import { EventCard } from './EventCard';

export const SNAP_MINUTES = 15;
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
  onDoneAsPlanned?: (blockId: string) => void;
  onDidSomethingElse?: (plannedBlockId: string, recorded: RecordedBlockPayload) => void;
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
  onEditEvent?: (eventId: string) => void;
  onEditBlock?: (blockId: string) => void;
  /** For compare mode: taskIds that have both planned and recorded blocks for this day. */
  compareMatchedTaskIds?: string[];
}

const PX_PER_HOUR = 64;
const START_HOUR = 0;

const GRID_HEIGHT = 24 * PX_PER_HOUR; // 24h grid (midnight-midnight)

function snapToGrid(totalMinutes: number): number {
  return Math.round(totalMinutes / SNAP_MINUTES) * SNAP_MINUTES;
}

function minutesToTimeString(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function DayView({ mode, timeBlocks, events = [], selectedDate, selectedBlock, onSelectBlock, focusedCategoryId, focusedCalendarId, onDoneAsPlanned, onDidSomethingElse, onDeleteBlock, onDeleteTask, onDeleteEvent, onDropTask, onCreateBlock, onMoveBlock, onResizeBlock, onEditEvent, onEditBlock, compareMatchedTaskIds }: DayViewProps) {
  const [now, setNow] = React.useState(() => new Date());
  const [isDragOver, setIsDragOver] = React.useState(false);
  const [dragPreview, setDragPreview] = React.useState<{ startMins: number; endMins: number } | null>(null);
  const dragPreviewRef = React.useRef<{ startMins: number; endMins: number } | null>(null);
  const [creatingBlock, setCreatingBlock] = React.useState<{ startMins: number; endMins: number } | null>(null);
  const creatingBlockRef = React.useRef<{ startMins: number; endMins: number } | null>(null);
  const [resizingBlock, setResizingBlock] = React.useState<{ block: ResolvedTimeBlock; startClientY: number; endMins: number } | null>(null);
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

  const offsetYToMinutes = (offsetY: number): number => {
    const totalMinutes = START_HOUR * 60 + (offsetY / PX_PER_HOUR) * 60;
    return snapToGrid(totalMinutes);
  };

  const handleDragOver = (e: React.DragEvent) => {
    const hasTask = e.dataTransfer.types.includes('application/x-timebox-task-id');
    const hasBlock = e.dataTransfer.types.includes('application/x-timebox-block-id');
    if (!hasTask && !hasBlock) return;
    if (hasTask && !onDropTask) return;
    if (hasBlock && !onMoveBlock) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = hasBlock ? 'move' : 'copy';
    setIsDragOver(true);
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return;
    const offsetY = e.clientY - rect.top;
    if (offsetY < 0 || offsetY > GRID_HEIGHT) return;
    const currentMins = offsetYToMinutes(offsetY);
    if (hasBlock) {
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
    const endMins = preview?.endMins ?? startMins + DEFAULT_DROP_MINUTES;
    const startTime = minutesToTimeString(startMins);
    const endTime = minutesToTimeString(endMins);

    if (blockId && onMoveBlock) {
      onMoveBlock(blockId, { date: selectedDate, startTime, endTime });
      return;
    }
    if (taskId && onDropTask) {
      const durStr = e.dataTransfer.getData('application/x-timebox-task-duration');
      const droppedMins = durStr && !Number.isNaN(parseInt(durStr, 10)) ? Math.max(MIN_CREATE_MINUTES, parseInt(durStr, 10)) : endMins - startMins;
      const blockMinutes = Math.max(MIN_CREATE_MINUTES, droppedMins);
      onDropTask(taskId, { date: selectedDate, startTime, blockMinutes });
    }
  };

  // Drag-to-create: mouseDown on the grid
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
        const endMins = Math.max(currentMins, prev.startMins + MIN_CREATE_MINUTES);
        creatingBlockRef.current = { startMins: prev.startMins, endMins };
        return { startMins: prev.startMins, endMins };
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
    const startMins = parseTime(block.start);
    const minEndMins = startMins + SNAP_MINUTES;
    const onMove = (e: MouseEvent) => {
      const deltaMins = ((e.clientY - startClientY) / PX_PER_HOUR) * 60;
      let newEndMins = parseTime(block.end) + deltaMins;
      newEndMins = Math.round(newEndMins / SNAP_MINUTES) * SNAP_MINUTES;
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

  const handleResizeStart = React.useCallback((block: ResolvedTimeBlock, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingBlock({ block, startClientY: e.clientY });
  }, []);

  const hours = Array.from({ length: 24 }, (_, i) => i);

  const parseTime = (time: string): number => {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  };

  const getBlockStyle = (block: ResolvedTimeBlock) => {
    const startMinutes = parseTime(block.start);
    const endMinutes = parseTime(block.end);
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

  // Overlap layout for all blocks and events
  const overlapMap = React.useMemo(() => {
    const allItems = [
      ...timeBlocks.map((b) => ({ id: b.id, start: b.start, end: b.end })),
      ...events.map((e) => ({ id: `event-${e.id}`, start: e.start, end: e.end })),
    ];
    return computeOverlapLayout(allItems);
  }, [timeBlocks, events]);

  return (
    <div
      ref={outerRef}
      className={`flex-1 min-w-0 overflow-y-auto ${mode === 'compare' ? 'px-2 md:px-4 py-4 md:py-6' : 'px-4 md:px-8 py-4 md:py-6'} ${
        mode === 'compare' && selectedIsPast ? 'bg-neutral-50' : ''
      }`}
    >
      {/* Main grid container: ALL mouse/drag handlers live here.
          Clicks on empty space (not caught by cards) bubble up to this element. */}
      <div
        ref={gridRef}
        className={`relative ${onCreateBlock ? 'cursor-crosshair' : ''}`}
        style={{ height: GRID_HEIGHT }}
        onMouseDown={handleGridMouseDown}
        onDragOver={onDropTask || onMoveBlock ? handleDragOver : undefined}
        onDragLeave={onDropTask || onMoveBlock ? handleDragLeave : undefined}
        onDrop={onDropTask || onMoveBlock ? handleDrop : undefined}
      >
        {/* Hour rows - pointer-events-none so they don't block grid interactions */}
        {hours.map((hour) => (
          <div
            key={hour}
            className="absolute left-0 right-0 pointer-events-none"
            style={{ top: hour * PX_PER_HOUR, height: PX_PER_HOUR }}
          >
            <div className="absolute left-0 top-0 w-12 md:w-16 text-xs text-neutral-400 leading-none">
              {hour === 0
                ? '12:00 AM'
                : hour === 12
                  ? '12:00 PM'
                  : hour > 12
                    ? `${hour - 12}:00 PM`
                    : `${hour}:00 AM`}
            </div>
            <div className="absolute left-14 md:left-20 right-0 top-0 border-t border-neutral-200" />
            <div
              className="absolute left-14 md:left-20 right-0 border-t border-neutral-100"
              style={{ top: `${PX_PER_HOUR / 2}px` }}
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
          {/* Time blocks */}
          {timeBlocks.map((block) => {
            const { top, height } = getBlockStyle(block);
            const layout = overlapMap.get(block.id);
            const widthPercent = layout ? 100 / layout.totalColumns : 100;
            const leftPercent = layout ? layout.columnIndex * widthPercent : 0;
            return (
              <TimeBlockCard
                key={block.id}
                block={block}
                mode={mode}
                style={{
                  top: `${top}px`,
                  height: `${height}px`,
                  width: `${widthPercent}%`,
                  left: `${leftPercent}%`,
                }}
                isSelected={selectedBlock === block.id}
                onSelect={() => onSelectBlock(block.id)}
                onDeselect={() => onSelectBlock(null)}
                focusedCategoryId={focusedCategoryId}
                focusedCalendarId={focusedCalendarId}
                onDoneAsPlanned={onDoneAsPlanned}
                onDidSomethingElse={onDidSomethingElse}
                onDeleteBlock={onDeleteBlock}
                onDeleteTask={onDeleteTask}
                onEditBlock={onEditBlock}
                onResizeStart={onResizeBlock ? (e) => handleResizeStart(block, e) : undefined}
                compareMatchedTaskIds={compareMatchedTaskIds}
              />
            );
          })}

          {/* Events */}
          {events.map((event) => {
            const startMinutes = parseTime(event.start);
            const endMinutes = parseTime(event.end);
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
                plannedStyle={mode === 'planning'}
              />
            );
          })}
        </div>

        {/* Current-time indicator */}
        {isViewingToday && currentTimeTop != null && (
          <>
            <div
              className="absolute left-14 md:left-20 right-0 z-30 pointer-events-none"
              style={{
                top: currentTimeTop,
                height: 0,
                width: '100%',
                borderTop: '3px solid rgb(239 68 68)',
              }}
              aria-hidden
            />
            <div
              className="absolute left-2 z-40 text-red-500 text-xs font-medium tabular-nums pointer-events-none"
              style={{ top: currentTimeTop - 8 }}
            >
              {now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
            </div>
          </>
        )}

        {/* Drag preview (task/block drop) */}
        {(onDropTask || onMoveBlock) && dragPreview && (
          <div
            className="absolute left-14 md:left-20 right-2 z-30 pointer-events-none rounded-lg border-2 border-dashed"
            style={{
              top: `${((dragPreview.startMins - START_HOUR * 60) / 60) * PX_PER_HOUR}px`,
              height: `${((dragPreview.endMins - dragPreview.startMins) / 60) * PX_PER_HOUR}px`,
              backgroundColor: 'rgba(59, 130, 246, 0.2)',
              borderColor: 'rgb(59, 130, 246)',
            }}
          >
            <span className="absolute bottom-1 left-2 text-xs font-medium text-blue-700">
              {minutesToTimeString(dragPreview.startMins)} - {minutesToTimeString(dragPreview.endMins)} ({dragPreview.endMins - dragPreview.startMins}m)
            </span>
          </div>
        )}

        {/* Create-block preview */}
        {creatingBlock && (
          <div
            className="absolute left-14 md:left-20 right-2 z-30 pointer-events-none rounded-lg border-2 border-dashed border-blue-500 bg-blue-200/40"
            style={{
              top: `${((creatingBlock.startMins - START_HOUR * 60) / 60) * PX_PER_HOUR}px`,
              height: `${((creatingBlock.endMins - creatingBlock.startMins) / 60) * PX_PER_HOUR}px`,
            }}
          >
            <span className="absolute bottom-1 left-2 text-xs font-medium text-blue-800">
              {minutesToTimeString(creatingBlock.startMins)} - {minutesToTimeString(creatingBlock.endMins)} ({creatingBlock.endMins - creatingBlock.startMins}m)
            </span>
          </div>
        )}

        {/* Drag-over highlight */}
        {isDragOver && (
          <div
            className="absolute left-14 md:left-20 right-0 top-0 pointer-events-none rounded-r-lg bg-blue-50/70 ring-2 ring-blue-200/80 ring-inset"
            style={{ height: GRID_HEIGHT }}
          />
        )}
      </div>
    </div>
  );
}
