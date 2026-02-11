import React from 'react';
import { Mode } from '../types';
import { ResolvedTimeBlock } from '../utils/dataResolver';
import { TimeBlockCard, RecordedBlockPayload } from './TimeBlockCard';

export const SNAP_MINUTES = 15;
const DEFAULT_DROP_MINUTES = 60;

export interface DropTaskParams {
  date: string;
  startTime: string;
  blockMinutes: number;
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
  onDropTask?: (taskId: string, params: DropTaskParams) => void;
}

const PX_PER_HOUR = 80;
const START_HOUR = 6;

const GRID_HEIGHT = 17 * PX_PER_HOUR; // 6am–10pm

function snapToGrid(totalMinutes: number): number {
  return Math.round(totalMinutes / SNAP_MINUTES) * SNAP_MINUTES;
}

function minutesToTimeString(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function DayView({ mode, timeBlocks, selectedDate, selectedBlock, onSelectBlock, focusedCategoryId, focusedCalendarId, onDoneAsPlanned, onDidSomethingElse, onDeleteBlock, onDropTask }: DayViewProps) {
  const [now, setNow] = React.useState(() => new Date());
  const [isDragOver, setIsDragOver] = React.useState(false);
  const [dragPreview, setDragPreview] = React.useState<{ startMins: number; endMins: number } | null>(null);
  const gridRef = React.useRef<HTMLDivElement>(null);
  const todayStr = now.toISOString().slice(0, 10);
  const isViewingToday = selectedDate === todayStr;

  React.useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const offsetYToMinutes = (offsetY: number): number => {
    const totalMinutes = START_HOUR * 60 + (offsetY / PX_PER_HOUR) * 60;
    return snapToGrid(totalMinutes);
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!onDropTask || !e.dataTransfer.types.includes('application/x-timebox-task-id')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragOver(true);
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return;
    const offsetY = e.clientY - rect.top;
    if (offsetY < 0 || offsetY > GRID_HEIGHT) return;
    const currentMins = offsetYToMinutes(offsetY);
    setDragPreview((prev) => {
      if (!prev) {
        return { startMins: currentMins, endMins: currentMins + DEFAULT_DROP_MINUTES };
      }
      const startMins = Math.min(prev.startMins, currentMins);
      const endMins = Math.max(prev.endMins, currentMins, startMins + DEFAULT_DROP_MINUTES);
      return { startMins, endMins };
    });
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
    setDragPreview(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    const taskId = e.dataTransfer.getData('application/x-timebox-task-id');
    const preview = dragPreview;
    setIsDragOver(false);
    setDragPreview(null);
    if (!onDropTask || !taskId) return;
    e.preventDefault();
    const startTime = preview
      ? minutesToTimeString(preview.startMins)
      : (() => {
          const rect = gridRef.current?.getBoundingClientRect();
          if (!rect) return '09:00';
          const offsetY = e.clientY - rect.top;
          const mins = offsetYToMinutes(Math.max(0, Math.min(offsetY, GRID_HEIGHT)));
          return minutesToTimeString(mins);
        })();
    const blockMinutes = preview ? preview.endMins - preview.startMins : DEFAULT_DROP_MINUTES;
    onDropTask(taskId, { date: selectedDate, startTime, blockMinutes });
  };

  // Generate hours from 6 AM to 10 PM
  const hours = Array.from({ length: 17 }, (_, i) => i + 6);

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
        if (mins < START_HOUR * 60 || mins > (START_HOUR + 16) * 60) return null;
        return ((mins - START_HOUR * 60) / 60) * PX_PER_HOUR;
      })()
    : null;

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-8 py-4 md:py-6">
      <div className="relative">
        {/* Time labels and grid lines */}
        {hours.map((hour) => (
          <div key={hour} className="relative" style={{ height: `${PX_PER_HOUR}px` }}>
            <div className="absolute left-0 top-0 w-12 md:w-16 text-xs text-neutral-400">
              {hour === 12 ? '12:00 PM' : hour > 12 ? `${hour - 12}:00 PM` : `${hour}:00 AM`}
            </div>
            <div className="absolute left-14 md:left-20 right-0 top-0 border-t border-neutral-200" />
            <div className="absolute left-14 md:left-20 right-0 top-10 border-t border-neutral-100" />
          </div>
        ))}

        {/* Drop zone for drag-task-to-calendar */}
        {onDropTask && (
          <div
            ref={gridRef}
            className={`absolute left-14 md:left-20 right-0 top-0 z-10 rounded-r-lg transition-[background-color,box-shadow] duration-200 ease-out ${
              isDragOver ? 'bg-blue-50/70 ring-2 ring-blue-200/80 ring-inset' : ''
            }`}
            style={{ height: `${GRID_HEIGHT}px` }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          />
        )}

        {/* Drag preview block — shows 1h default, extends as user drags */}
        {onDropTask && dragPreview && (
          <div
            className="absolute left-14 md:left-20 right-2 top-0 z-30 pointer-events-none rounded-lg border-2 border-dashed border-blue-400 bg-blue-100/50 transition-[top,height] duration-150 ease-out"
            style={{
              top: `${((dragPreview.startMins - START_HOUR * 60) / 60) * PX_PER_HOUR}px`,
              height: `${((dragPreview.endMins - dragPreview.startMins) / 60) * PX_PER_HOUR}px`,
            }}
          >
            <span className="absolute bottom-1 left-2 text-xs font-medium text-blue-700">
              {dragPreview.endMins - dragPreview.startMins} min
            </span>
          </div>
        )}

        {/* Time blocks */}
        <div className="absolute left-14 md:left-20 right-0 top-0 pointer-events-none">
          <div className="pointer-events-auto">
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