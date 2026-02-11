import React from 'react';
import { Mode } from '../types';
import { ResolvedTimeBlock } from '../utils/dataResolver';
import { TimeBlockCard, RecordedBlockPayload } from './TimeBlockCard';

export const SNAP_MINUTES = 15;
const DEFAULT_DROP_MINUTES = 15;
const MIN_CREATE_MINUTES = 15;

export interface DropTaskParams {
  date: string;
  startTime: string;
  blockMinutes: number;
  splitCount?: number;
}

export interface CreateBlockParams {
  date: string;
  startTime: string;
  endTime: string;
}

interface DayViewProps {
  mode: Mode;
  timeBlocks: ResolvedTimeBlock[];
  selectedDate: string;
  selectedBlock: string | null;
  onSelectBlock: (id: string | null) => void;
  focusedCategoryId?: string | null;
  focusedCalendarId?: string | null;
  onDoneAsPlanned?: (blockId: string) => void;
  onDidSomethingElse?: (plannedBlockId: string, recorded: RecordedBlockPayload) => void;
  onDeleteBlock?: (blockId: string) => void;
  onDeleteTask?: (taskId: string) => void;
  onDropTask?: (taskId: string, params: DropTaskParams) => void;
  /** Create a time block by drag on empty grid. */
  onCreateBlock?: (params: CreateBlockParams) => string | undefined;
  /** Move an existing block to new time/date; may split rest into a new block. */
  onMoveBlock?: (blockId: string, params: { date: string; startTime: string; endTime: string }) => void;
  /** For compare mode: taskIds that have both planned and recorded blocks for this day. */
  compareMatchedTaskIds?: string[];
}

const PX_PER_HOUR = 64;
const START_HOUR = 0;

const GRID_HEIGHT = 24 * PX_PER_HOUR; // 24h grid (midnight–midnight)

function snapToGrid(totalMinutes: number): number {
  return Math.round(totalMinutes / SNAP_MINUTES) * SNAP_MINUTES;
}

function minutesToTimeString(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function DayView({ mode, timeBlocks, selectedDate, selectedBlock, onSelectBlock, focusedCategoryId, focusedCalendarId, onDoneAsPlanned, onDidSomethingElse, onDeleteBlock, onDeleteTask, onDropTask, onCreateBlock, onMoveBlock, compareMatchedTaskIds }: DayViewProps) {
  const [now, setNow] = React.useState(() => new Date());
  const [isDragOver, setIsDragOver] = React.useState(false);
  const [dragPreview, setDragPreview] = React.useState<{ startMins: number; endMins: number } | null>(null);
  const dragPreviewRef = React.useRef<{ startMins: number; endMins: number } | null>(null);
  const [creatingBlock, setCreatingBlock] = React.useState<{ startMins: number; endMins: number } | null>(null);
  const creatingBlockRef = React.useRef<{ startMins: number; endMins: number } | null>(null);
  const gridRef = React.useRef<HTMLDivElement>(null);
  const todayStr = now.toISOString().slice(0, 10);
  const isViewingToday = selectedDate === todayStr;

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
      // Tasks drag as their full duration (no stretching needed).
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
      const blockMinutes = Math.max(MIN_CREATE_MINUTES, endMins - startMins);
      const splitStr = e.dataTransfer.getData('application/x-timebox-task-split-count');
      const splitCount = splitStr ? parseInt(splitStr, 10) : undefined;
      onDropTask(taskId, { date: selectedDate, startTime, blockMinutes, splitCount });
    }
  };

  const getGridRect = () => gridRef.current?.getBoundingClientRect();

  const handleEmptyGridMouseDown = (e: React.MouseEvent) => {
    if (!onCreateBlock || creatingBlock) return;
    const rect = getGridRect();
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
    const rect = getGridRect();
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

  // Generate hours from 12 AM to 11 PM
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

  const currentTimeTop: number | null = isViewingToday
    ? (() => {
        const mins = now.getHours() * 60 + now.getMinutes();
        if (mins < 0 || mins > 24 * 60) return null;
        return ((mins - START_HOUR * 60) / 60) * PX_PER_HOUR;
      })()
    : null;

  const outerRef = React.useRef<HTMLDivElement>(null);

  // On mount / when date changes, scroll so current time is roughly centered (for today).
  React.useEffect(() => {
    if (!outerRef.current) return;
    if (!isViewingToday || currentTimeTop == null) {
      outerRef.current.scrollTop = 0;
      return;
    }
    const containerHeight = outerRef.current.clientHeight;
    const target = Math.max(0, currentTimeTop - containerHeight / 2);
    outerRef.current.scrollTop = target;
  }, [isViewingToday, currentTimeTop]);

  const selectedIsPast = (() => {
    const today = new Date();
    const todayStripped = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const [y, m, d] = selectedDate.split('-').map(Number);
    const sel = new Date(y, m - 1, d);
    return sel < todayStripped;
  })();

  return (
    <div
      ref={outerRef}
      className={`flex-1 overflow-y-auto px-4 md:px-8 py-4 md:py-6 ${
        mode === 'compare' && selectedIsPast ? 'bg-neutral-50' : ''
      }`}
    >
      <div className="relative">
        {/* Time labels and grid lines */}
        {hours.map((hour) => (
          <div key={hour} className="relative" style={{ height: `${PX_PER_HOUR}px` }}>
            <div className="absolute left-0 top-0 w-12 md:w-16 text-xs text-neutral-400">
              {hour === 0
                ? '12:00 AM'
                : hour === 12
                  ? '12:00 PM'
                  : hour > 12
                    ? `${hour - 12}:00 PM`
                    : `${hour}:00 AM`}
            </div>
            <div className="absolute left-14 md:left-20 right-0 top-0 border-t border-neutral-200" />
            <div className="absolute left-14 md:left-20 right-0 top-10 border-t border-neutral-100" />
          </div>
        ))}

        {/* Grid: drop zone (task drag) + mousedown for create-block. Always rendered so ref and create work. */}
        <div
          ref={gridRef}
          className={`absolute left-14 md:left-20 right-0 top-0 z-10 rounded-r-lg transition-[background-color,box-shadow] duration-200 ease-out ${
            isDragOver ? 'bg-blue-50/70 ring-2 ring-blue-200/80 ring-inset' : ''
          } ${onCreateBlock ? 'cursor-crosshair' : ''}`}
          style={{ height: `${GRID_HEIGHT}px` }}
          onDragOver={onDropTask || onMoveBlock ? handleDragOver : undefined}
          onDragLeave={onDropTask || onMoveBlock ? handleDragLeave : undefined}
          onDrop={onDropTask || onMoveBlock ? handleDrop : undefined}
          onMouseDown={onCreateBlock ? handleEmptyGridMouseDown : undefined}
        />

        {/* Drag preview — task drop or block move */}
        {(onDropTask || onMoveBlock) && dragPreview && (
          <div
            className="absolute left-14 md:left-20 right-2 top-0 z-30 pointer-events-none rounded-lg border-2 border-dashed border-blue-400 bg-blue-100/50 transition-[top,height] duration-150 ease-out"
            style={{
              top: `${((dragPreview.startMins - START_HOUR * 60) / 60) * PX_PER_HOUR}px`,
              height: `${((dragPreview.endMins - dragPreview.startMins) / 60) * PX_PER_HOUR}px`,
            }}
          >
            <span className="absolute bottom-1 left-2 text-xs font-medium text-blue-700">
              {minutesToTimeString(dragPreview.startMins)} → {minutesToTimeString(dragPreview.endMins)} · {dragPreview.endMins - dragPreview.startMins} min
            </span>
          </div>
        )}

        {/* Create-block preview — drag on empty grid */}
        {creatingBlock && (
          <div
            className="absolute left-14 md:left-20 right-2 top-0 z-30 pointer-events-none rounded-lg border-2 border-dashed border-blue-500 bg-blue-200/40"
            style={{
              top: `${((creatingBlock.startMins - START_HOUR * 60) / 60) * PX_PER_HOUR}px`,
              height: `${((creatingBlock.endMins - creatingBlock.startMins) / 60) * PX_PER_HOUR}px`,
            }}
          >
            <span className="absolute bottom-1 left-2 text-xs font-medium text-blue-800">
              {minutesToTimeString(creatingBlock.startMins)} → {minutesToTimeString(creatingBlock.endMins)} · {creatingBlock.endMins - creatingBlock.startMins} min
            </span>
          </div>
        )}

        {/* Time blocks — wrapper accepts drop so dropping on a block also moves/creates */}
        <div className="absolute left-14 md:left-20 right-0 top-0 pointer-events-none">
          <div
            className="pointer-events-auto min-h-full"
            style={{ minHeight: GRID_HEIGHT }}
            onDragOver={onDropTask || onMoveBlock ? handleDragOver : undefined}
            onDragLeave={onDropTask || onMoveBlock ? handleDragLeave : undefined}
            onDrop={onDropTask || onMoveBlock ? handleDrop : undefined}
          >
          {timeBlocks.map((block) => {
            const { top, height } = getBlockStyle(block);
            return (
              <TimeBlockCard
                key={block.id}
                block={block}
                mode={mode}
                style={{ top: `${top}px`, height: `${height}px` }}
                isSelected={selectedBlock === block.id}
                onSelect={() => onSelectBlock(block.id)}
                onDeselect={() => onSelectBlock(null)}
                focusedCategoryId={focusedCategoryId}
                focusedCalendarId={focusedCalendarId}
                onDoneAsPlanned={onDoneAsPlanned}
                onDidSomethingElse={onDidSomethingElse}
                onDeleteBlock={onDeleteBlock}
                onDeleteTask={onDeleteTask}
                compareMatchedTaskIds={compareMatchedTaskIds}
              />
            );
          })}
          </div>
        </div>

        {/* Current time line — only when viewing today */}
        {currentTimeTop != null && (
          <div
            className="absolute left-14 md:left-20 right-0 top-0 z-20 pointer-events-none flex items-center"
            style={{ transform: `translateY(${currentTimeTop}px)` }}
          >
            <div className="w-2 h-2 rounded-full bg-neutral-500 flex-shrink-0" />
            <div className="flex-1 h-px bg-neutral-400" />
          </div>
        )}
      </div>
    </div>
  );
}