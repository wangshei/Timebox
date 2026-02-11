import React from 'react';
import { Mode } from '../types';
import { ResolvedTimeBlock } from '../utils/dataResolver';
import { TimeBlockCard, RecordedBlockPayload } from './TimeBlockCard';

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
}

const PX_PER_HOUR = 80;
const START_HOUR = 6;

export function DayView({ mode, timeBlocks, selectedDate, selectedBlock, onSelectBlock, focusedCategoryId, focusedCalendarId, onDoneAsPlanned, onDidSomethingElse, onDeleteBlock }: DayViewProps) {
  const [now, setNow] = React.useState(() => new Date());
  const todayStr = now.toISOString().slice(0, 10);
  const isViewingToday = selectedDate === todayStr;

  React.useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

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

        {/* Time blocks */}
        <div className="absolute left-14 md:left-20 right-0 top-0">
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