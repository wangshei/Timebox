import React from 'react';
import { Mode } from '../types';
import { ResolvedTimeBlock } from '../utils/dataResolver';
import { TimeBlockCard, RecordedBlockPayload } from './TimeBlockCard';

interface WeekViewProps {
  mode: Mode;
  timeBlocks: ResolvedTimeBlock[];
  currentDate: Date;
  selectedBlock?: string | null;
  onSelectBlock?: (id: string | null) => void;
  focusedCategoryId?: string | null;
  focusedCalendarId?: string | null;
  onDoneAsPlanned?: (blockId: string) => void;
  onDidSomethingElse?: (plannedBlockId: string, recorded: RecordedBlockPayload) => void;
  onDeleteBlock?: (blockId: string) => void;
  onDeleteTask?: (taskId: string) => void;
  onDropTask?: (taskId: string, params: import('./DayView').DropTaskParams) => void;
  onMoveBlock?: (blockId: string, params: { date: string; startTime: string; endTime: string }) => void;
}

export function WeekView({ mode, timeBlocks, currentDate, selectedBlock, onSelectBlock, focusedCategoryId, focusedCalendarId, onDoneAsPlanned, onDidSomethingElse, onDeleteBlock, onDeleteTask, onDropTask, onMoveBlock }: WeekViewProps) {
  const [localSelectedBlock, setLocalSelectedBlock] = React.useState<string | null>(selectedBlock || null);
  const handleSelect = onSelectBlock || setLocalSelectedBlock;
  const currentSelected = selectedBlock !== undefined ? selectedBlock : localSelectedBlock;
  // Generate hours from 6 AM to 10 PM
  const hours = Array.from({ length: 17 }, (_, i) => i + 6);

  // Get start of week (Sunday)
  const startOfWeek = new Date(currentDate);
  startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());

  // Generate days of the week
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(startOfWeek);
    day.setDate(startOfWeek.getDate() + i);
    return day;
  });

  const parseTime = (time: string): number => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  };

  const getBlockStyle = (block: ResolvedTimeBlock) => {
    const startMinutes = parseTime(block.start);
    const endMinutes = parseTime(block.end);
    const duration = endMinutes - startMinutes;
    
    // Calculate position relative to 6 AM (360 minutes)
    const top = ((startMinutes - 360) / 60) * 64; // 64px per hour for week view
    const height = (duration / 60) * 64;
    
    return { top, height };
  };

  const formatDate = (date: Date): string => {
    return date.toISOString().split('T')[0];
  };

  const isToday = (date: Date): boolean =>
    date.toDateString() === new Date().toDateString();

  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const PX_PER_HOUR = 64;
  const START_HOUR = 6;
  const gridTopOffset = 16;
  const GRID_HEIGHT = 17 * PX_PER_HOUR;

  const snapToGrid = (totalMinutes: number) => Math.round(totalMinutes / 15) * 15;
  const offsetYToMinutes = (offsetY: number) => {
    const totalMinutes = START_HOUR * 60 + (offsetY / PX_PER_HOUR) * 60;
    return snapToGrid(totalMinutes);
  };
  const minsToTime = (mins: number) =>
    `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

  const [dragPreview, setDragPreview] = React.useState<{ date: string; startMins: number; endMins: number } | null>(null);
  const currentTimeMinutes = now.getHours() * 60 + now.getMinutes();
  const currentTimeTop =
    currentTimeMinutes >= START_HOUR * 60 && currentTimeMinutes <= (START_HOUR + 16) * 60
      ? ((currentTimeMinutes - START_HOUR * 60) / 60) * PX_PER_HOUR + gridTopOffset
      : null;

  return (
    <div className="flex-1 overflow-auto">
      <div className="flex min-w-max">
        {/* Time column */}
        <div className="w-12 md:w-16 flex-shrink-0 border-r border-neutral-200 px-1 md:px-2 py-4 md:py-6 sticky left-0 bg-white z-10">
          <div className="h-10 md:h-12" /> {/* Spacer for day headers */}
          {hours.map((hour) => (
            <div key={hour} className="relative" style={{ height: '64px' }}>
              <div className="absolute left-0 top-0 w-full text-xs text-neutral-400 text-right pr-1 md:pr-2">
                {hour === 12 ? '12PM' : hour > 12 ? `${hour - 12}PM` : `${hour}AM`}
              </div>
            </div>
          ))}
        </div>

        {/* Days columns */}
        <div className="flex flex-1">
          {weekDays.map((day, dayIndex) => {
            const dateStr = formatDate(day);
            const dayBlocks = timeBlocks.filter(block => block.date === dateStr);
            const today = isToday(day);
            const showCurrentTimeLine = today && currentTimeTop != null;

            return (
              <div key={dayIndex} className="flex-1 min-w-[100px] md:min-w-0 border-r border-neutral-200 last:border-r-0 relative">
                {/* Day header */}
                <div className={`h-10 md:h-12 border-b border-neutral-200 px-2 md:px-3 py-2 sticky top-0 bg-white z-10 ${today ? 'bg-neutral-50' : ''}`}>
                  <div className="text-xs text-neutral-500 uppercase">
                    {day.toLocaleDateString('en-US', { weekday: 'short' })}
                  </div>
                  <div className={`text-sm font-medium ${today ? 'text-neutral-700' : 'text-neutral-900'}`}>
                    {day.getDate()}
                  </div>
                </div>

                {/* Day grid */}
                <div className="relative px-1 md:px-2 py-4 md:py-6">
                  {/* Grid lines */}
                  {hours.map((hour) => (
                    <div key={hour} className="relative" style={{ height: '64px' }}>
                      <div className="absolute left-0 right-0 top-0 border-t border-neutral-100" />
                    </div>
                  ))}

                  {/* Time blocks */}
                  <div className="absolute left-1 md:left-2 right-1 md:right-2 top-4 md:top-6">
                    {dayBlocks.map((block) => {
                      const { top, height } = getBlockStyle(block);
                      return (
                        <TimeBlockCard
                          key={block.id}
                          block={block}
                          mode={mode}
                          style={{ top: `${top}px`, height: `${height}px` }}
                          isSelected={currentSelected === block.id}
                          onSelect={() => handleSelect(block.id)}
                          onDeselect={() => handleSelect(null)}
                          focusedCategoryId={focusedCategoryId}
                          focusedCalendarId={focusedCalendarId}
                          onDoneAsPlanned={onDoneAsPlanned}
                          onDidSomethingElse={onDidSomethingElse}
                          onDeleteBlock={onDeleteBlock}
                          compact
                        />
                      );
                    })}
                  </div>

                  {/* Current time line — only in today column */}
                  {showCurrentTimeLine && (
                    <div
                      className="absolute left-1 md:left-2 right-1 md:right-2 top-4 md:top-6 z-20 pointer-events-none flex items-center"
                      style={{ transform: `translateY(${currentTimeTop}px)` }}
                    >
                      <div className="w-1.5 h-1.5 rounded-full bg-neutral-500 flex-shrink-0" />
                      <div className="flex-1 h-px bg-neutral-400" />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}