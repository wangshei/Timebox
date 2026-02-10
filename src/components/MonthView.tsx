import React from 'react';
import { Mode } from '../types';
import { ResolvedTimeBlock } from '../utils/dataResolver';

interface MonthViewProps {
  mode: Mode;
  timeBlocks: ResolvedTimeBlock[];
  currentDate: Date;
  selectedBlock?: string | null;
  onSelectBlock?: (id: string | null) => void;
}

export function MonthView({ mode, timeBlocks, currentDate, selectedBlock, onSelectBlock }: MonthViewProps) {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Get first day of month
  const firstDay = new Date(year, month, 1);
  const firstDayOfWeek = firstDay.getDay();

  // Get number of days in month
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Get days from previous month to show
  const prevMonthDays = firstDayOfWeek;
  const prevMonth = month === 0 ? 11 : month - 1;
  const prevMonthYear = month === 0 ? year - 1 : year;
  const daysInPrevMonth = new Date(prevMonthYear, prevMonth + 1, 0).getDate();

  // Generate all days to show in the calendar
  const calendarDays: { date: Date; isCurrentMonth: boolean }[] = [];

  // Previous month days
  for (let i = prevMonthDays - 1; i >= 0; i--) {
    calendarDays.push({
      date: new Date(prevMonthYear, prevMonth, daysInPrevMonth - i),
      isCurrentMonth: false,
    });
  }

  // Current month days
  for (let i = 1; i <= daysInMonth; i++) {
    calendarDays.push({
      date: new Date(year, month, i),
      isCurrentMonth: true,
    });
  }

  // Next month days to fill the grid
  const remainingDays = 42 - calendarDays.length; // 6 rows × 7 days
  const nextMonth = month === 11 ? 0 : month + 1;
  const nextMonthYear = month === 11 ? year + 1 : year;
  for (let i = 1; i <= remainingDays; i++) {
    calendarDays.push({
      date: new Date(nextMonthYear, nextMonth, i),
      isCurrentMonth: false,
    });
  }

  const formatDate = (date: Date): string => {
    return date.toISOString().split('T')[0];
  };

  const isToday = (date: Date): boolean => {
    const today = new Date(2026, 1, 10); // Feb 10, 2026
    return date.toDateString() === today.toDateString();
  };

  const getBlocksForDate = (date: Date): ResolvedTimeBlock[] => {
    const dateStr = formatDate(date);
    return timeBlocks.filter(block => block.date === dateStr);
  };

  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="flex-1 overflow-y-auto p-3 md:p-6">
      <div className="grid grid-cols-7 gap-px bg-neutral-200 border border-neutral-200 rounded-lg overflow-hidden">
        {/* Week day headers */}
        {weekDays.map((day) => (
          <div
            key={day}
            className="bg-neutral-50 px-2 md:px-3 py-2 text-xs font-medium text-neutral-600 text-center"
          >
            {day}
          </div>
        ))}

        {/* Calendar days */}
        {calendarDays.map((day, index) => {
          const blocks = getBlocksForDate(day.date);
          const today = isToday(day.date);
          const plannedBlocks = blocks.filter(b => b.mode === 'planned');
          const recordedBlocks = blocks.filter(b => b.mode === 'recorded');

          return (
            <div
              key={index}
              className={`bg-white min-h-20 md:min-h-28 p-1.5 md:p-2 ${
                !day.isCurrentMonth ? 'opacity-50' : ''
              } ${today ? 'bg-blue-50' : ''}`}
            >
              <div className={`text-xs md:text-sm mb-1 md:mb-2 ${today ? 'text-blue-600 font-semibold' : 'text-neutral-900'}`}>
                {day.date.getDate()}
              </div>

              <div className="space-y-0.5 md:space-y-1">
                {blocks.slice(0, 2).map((block) => {
                  const isPlanningMode = mode === 'planning';
                  const isPlanned = block.mode === 'planned';
                  const isRecorded = block.mode === 'recorded';

                  const getOpacity = () => {
                    if (isPlanningMode) {
                      return isPlanned ? 0.9 : 0.4;
                    } else {
                      return isRecorded ? 0.9 : 0.25;
                    }
                  };

                  return (
                    <div
                      key={block.id}
                      className="text-xs px-1.5 md:px-2 py-0.5 md:py-1 rounded text-white truncate cursor-pointer hover:opacity-100 transition-opacity touch-manipulation border-l-2"
                      style={{
                        backgroundColor: block.category.color,
                        borderLeftColor: block.calendarContainer.color,
                        opacity: getOpacity(),
                      }}
                      onClick={() => onSelectBlock?.(block.id)}
                    >
                      <span className="hidden md:inline">{block.start} </span>
                      {block.title}
                    </div>
                  );
                })}
                {blocks.length > 2 && (
                  <div className="text-xs text-neutral-500 px-1.5 md:px-2">
                    +{blocks.length - 2} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}