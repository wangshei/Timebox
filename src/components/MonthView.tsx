import React from 'react';
import { GRID, COLOR } from '../styles/tokens';
import { Mode, Event } from '../types';
import { ResolvedTimeBlock } from '../utils/dataResolver';
import { getLocalDateString, isTodayLocal } from '../utils/dateTime';

interface MonthViewProps {
  mode: Mode;
  timeBlocks: ResolvedTimeBlock[];
  currentDate: Date;
  selectedBlock?: string | null;
  onSelectBlock?: (id: string | null) => void;
  focusedCategoryId?: string | null;
  focusedCalendarId?: string | null;
  onSelectDate?: (dateStr: string) => void;
  events?: Event[];
  /** When true, first column is Monday; when false, Sunday. */
  weekStartsOnMonday?: boolean;
  /** Drag across 2+ day cells: create a multi-day all-day-span event. */
  onCreateRange?: (params: { date: string; endDate: string; startTime: string; endTime: string; anchor: { x: number; y: number } }) => void;
}

const BG_TODAY = GRID.today;

export function MonthView({ mode, timeBlocks, currentDate, selectedBlock, onSelectBlock, focusedCategoryId, focusedCalendarId, onSelectDate, events = [], weekStartsOnMonday = false, onCreateRange }: MonthViewProps) {
  const [rangeDrag, setRangeDrag] = React.useState<{ anchor: string; cur: string } | null>(null);
  const rangeRef = React.useRef(rangeDrag);
  const suppressClick = React.useRef(false);
  React.useEffect(() => {
    if (!rangeDrag) return;
    const dateAt = (x: number, y: number) =>
      (document.elementFromPoint(x, y)?.closest('[data-month-date]') as HTMLElement | null)?.getAttribute('data-month-date') ?? null;
    const onMove = (e: MouseEvent) => {
      const d = dateAt(e.clientX, e.clientY);
      if (!d) return;
      setRangeDrag((p) => { if (!p || p.cur === d) return p; const n = { ...p, cur: d }; rangeRef.current = n; return n; });
    };
    const onUp = (e: MouseEvent) => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      const r = rangeRef.current;
      rangeRef.current = null;
      setRangeDrag(null);
      if (!r || r.anchor === r.cur) return;
      suppressClick.current = true;
      setTimeout(() => { suppressClick.current = false; }, 0);
      const [a, b] = r.anchor < r.cur ? [r.anchor, r.cur] : [r.cur, r.anchor];
      onCreateRange?.({ date: a, endDate: b, startTime: '00:00', endTime: '23:59', anchor: { x: e.clientX, y: e.clientY } });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [rangeDrag !== null, onCreateRange]);
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Get first day of month
  const firstDay = new Date(year, month, 1);
  // Sunday=0; for Monday start we want Monday=0 so offset: (getDay() + 6) % 7
  const firstDayOfWeek = weekStartsOnMonday ? (firstDay.getDay() + 6) % 7 : firstDay.getDay();

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

  const formatDate = (date: Date): string => getLocalDateString(date);

  const isToday = (date: Date): boolean => isTodayLocal(getLocalDateString(date));

  const getBlocksForDate = (date: Date): ResolvedTimeBlock[] => {
    const dateStr = formatDate(date);
    return timeBlocks.filter(block => block.date === dateStr);
  };

  const weekDays = weekStartsOnMonday ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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
          const dateStr = formatDate(day.date);
          const dayEvents = events.filter(e => e.date <= dateStr && dateStr <= (e.endDate ?? e.date));
          const today = isToday(day.date);
          const inRange = !!rangeDrag && dateStr >= (rangeDrag.anchor < rangeDrag.cur ? rangeDrag.anchor : rangeDrag.cur) && dateStr <= (rangeDrag.anchor < rangeDrag.cur ? rangeDrag.cur : rangeDrag.anchor) && rangeDrag.anchor !== rangeDrag.cur;
          const dayBg = inRange ? COLOR.accentSoft : today ? BG_TODAY : undefined;
          const plannedBlocks = blocks.filter(b => b.mode === 'planned');
          const recordedBlocks = blocks.filter(b => b.mode === 'recorded');
          const allItems = [...blocks.map(b => ({ ...b, _type: 'block' as const })), ...dayEvents.map(e => ({ ...e, _type: 'event' as const }))];
          const totalItems = allItems.length;

          return (
            <div
              key={index}
              className={`${`min-h-20 md:min-h-28 p-1.5 md:p-2 cursor-pointer relative overflow-hidden ${
                !day.isCurrentMonth ? 'opacity-50' : ''
              }`} ${!dayBg ? 'tb-hv-bg' : ''}`}
              style={{ '--hv-bg': '#fafafa', backgroundColor: '#ffffff', ...(dayBg ? { backgroundImage: `linear-gradient(${dayBg}, ${dayBg})` } : {}) } as React.CSSProperties}
              data-month-date={dateStr}
              onMouseDown={onCreateRange ? (e) => { if (e.button !== 0) return; const r = { anchor: dateStr, cur: dateStr }; rangeRef.current = r; setRangeDrag(r); } : undefined}
              onClick={() => { if (suppressClick.current) return; onSelectDate?.(formatDate(day.date)); }}
            >
              {/* Current day indicator — red line on left for today */}
              {today && (
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500 rounded-l" aria-hidden />
              )}
              <div className={`text-xs md:text-sm mb-1 md:mb-2 flex items-center gap-1 ${today ? 'text-blue-600 font-semibold' : 'text-neutral-900'}`}>
                {day.date.getDate()}
                {today && <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" aria-label="Today" />}
              </div>

              <div className="space-y-0.5 md:space-y-1 min-w-0 overflow-hidden">
                {blocks.slice(0, dayEvents.length > 0 ? 1 : 2).map((block) => {
                  const isCompareMode = mode === 'compare';
                  const isRecorded = block.mode === 'recorded';
                  let baseOpacity: number;
                  if (isCompareMode) {
                    baseOpacity = isRecorded ? 0.9 : 0.25;
                  } else {
                    baseOpacity = 0.8;
                  }
                  const muted = 0.35;
                  const opacity =
                    focusedCategoryId != null
                      ? block.category.id === focusedCategoryId ? baseOpacity : muted
                      : focusedCalendarId != null
                        ? block.calendarContainerId === focusedCalendarId ? baseOpacity : muted
                        : baseOpacity;

                  return (
                    <div
                      key={block.id}
                      className="text-xs px-1.5 md:px-2 py-0.5 md:py-1 rounded text-white truncate cursor-pointer hover:opacity-100 transition-opacity touch-manipulation border-l-2"
                      style={{
                        backgroundColor: block.category.color,
                        borderLeftColor: block.calendarContainer.color,
                        opacity,
                      }}
                      onClick={(e) => { e.stopPropagation(); onSelectBlock?.(block.id); }}
                    >
                      <span className="hidden md:inline">{block.start} </span>
                      {block.title}
                    </div>
                  );
                })}
                {dayEvents.slice(0, blocks.length > 0 ? 1 : 2).map((event) => (
                  <div
                    key={event.id}
                    className="text-xs px-1.5 md:px-2 py-0.5 md:py-1 rounded truncate cursor-pointer hover:opacity-100 transition-opacity touch-manipulation border-l-2 border-dashed"
                    style={{
                      backgroundColor: '#e0e7ff',
                      borderLeftColor: '#6366f1',
                      color: '#4338ca',
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="hidden md:inline">{event.start} </span>
                    {event.title}
                  </div>
                ))}
                {totalItems > 2 && (
                  <div className="text-xs text-neutral-500 px-1.5 md:px-2">
                    +{totalItems - 2} more
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