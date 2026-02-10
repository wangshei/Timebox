import React from 'react';
import { Mode, TimeBlock } from '../App';
import { TimeBlockCard } from './TimeBlockCard';

interface WeekViewProps {
  mode: Mode;
  timeBlocks: TimeBlock[];
  currentDate: Date;
  selectedBlock: string | null;
  onSelectBlock: (id: string | null) => void;
}

export function WeekView({ mode, timeBlocks, currentDate, selectedBlock, onSelectBlock }: WeekViewProps) {
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

  const getBlockStyle = (block: TimeBlock) => {
    const startMinutes = parseTime(block.startTime);
    const endMinutes = parseTime(block.endTime);
    const duration = endMinutes - startMinutes;
    
    // Calculate position relative to 6 AM (360 minutes)
    const top = ((startMinutes - 360) / 60) * 64; // 64px per hour for week view
    const height = (duration / 60) * 64;
    
    return { top, height };
  };

  const formatDate = (date: Date): string => {
    return date.toISOString().split('T')[0];
  };

  const isToday = (date: Date): boolean => {
    const today = new Date(2026, 1, 10); // Feb 10, 2026
    return date.toDateString() === today.toDateString();
  };

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

            return (
              <div key={dayIndex} className="flex-1 min-w-[100px] md:min-w-0 border-r border-neutral-200 last:border-r-0">
                {/* Day header */}
                <div className={`h-10 md:h-12 border-b border-neutral-200 px-2 md:px-3 py-2 sticky top-0 bg-white z-10 ${today ? 'bg-blue-50' : ''}`}>
                  <div className="text-xs text-neutral-500 uppercase">
                    {day.toLocaleDateString('en-US', { weekday: 'short' })}
                  </div>
                  <div className={`text-sm font-medium ${today ? 'text-blue-600' : 'text-neutral-900'}`}>
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
                          isSelected={selectedBlock === block.id}
                          onSelect={() => onSelectBlock(block.id)}
                          onDeselect={() => onSelectBlock(null)}
                          compact
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}