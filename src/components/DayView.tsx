import React from 'react';
import { Mode } from '../types';
import { ResolvedTimeBlock } from '../utils/dataResolver';
import { TimeBlockCard, RecordedBlockPayload } from './TimeBlockCard';

export interface DropTaskParams {
  date: string;
  startTime: string;
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

export function DayView({ mode, timeBlocks, selectedDate, selectedBlock, onSelectBlock, focusedCategoryId, focusedCalendarId, onDoneAsPlanned, onDidSomethingElse, onDeleteBlock, onDropTask }: DayViewProps) {
  const [now, setNow] = React.useState(() => new Date());
  const [isDragOver, setIsDragOver] = React.useState(false);
  const gridRef = React.useRef<HTMLDivElement>(null);
  const todayStr = now.toISOString().slice(0, 10);
  const isViewingToday = selectedDate === todayStr;

  React.useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const handleDragOver = (e: React.DragEvent) => {
    if (!onDropTask || !e.dataTransfer.types.includes('application/x-timebox-task-id')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragOver(true);
  };

  const handleDragLeave = () => setIsDragOver(false);

  const handleDrop = (e: React.DragEvent) => {
    setIsDragOver(false);
    if (!onDropTask) return;
    const taskId = e.dataTransfer.getData('application/x-timebox-task-id');
    if (!taskId) return;
    e.preventDefault();
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return;
    const offsetY = e.clientY - rect.top;
    if (offsetY < 0 || offsetY > GRID_HEIGHT) return;
    // Snap to 30 min: 6am + offset
    const totalMinutes = START_HOUR * 60 + (offsetY / PX_PER_HOUR) * 60;
    const snapMinutes = Math.round(totalMinutes / 30) * 30;
    const hour = Math.floor(snapMinutes / 60);
    const min = snapMinutes % 60;
    const startTime = `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    onDropTask(taskId, { date: selectedDate, startTime });
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
            className={`absolute left-14 md:left-20 right-0 top-0 z-10 rounded-r-lg transition-colors ${
              isDragOver ? 'bg-blue-50/80 ring-2 ring-blue-200 ring-inset' : ''
            }`}
            style={{ height: `${GRID_HEIGHT}px` }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          />
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