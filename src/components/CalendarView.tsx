import React, { useState, useMemo } from 'react';
import { ChevronLeftIcon, ChevronRightIcon, CalendarIcon, PlusIcon } from '@heroicons/react/24/solid';
import { Mode, View, TimeBlock, Category, Tag, CalendarContainer, Task, Event } from '../types';
import { resolveTimeBlocks, resolveEvents, selectMainViewBlocks } from '../utils/dataResolver';
import { getLocalDateString } from '../utils/dateTime';
import { DayView } from './DayView';
import { WeekView } from './WeekView';
import { MonthView } from './MonthView';

interface CalendarViewProps {
  mode: Mode;
  onModeChange?: (mode: Mode) => void;
  view: View;
  onViewChange: (view: View) => void;
  selectedDate: string;
  onSelectedDateChange?: (date: string) => void;
  timeBlocks: TimeBlock[];
  tasks: Task[];
  categories: Category[];
  tags: Tag[];
  containers: CalendarContainer[];
  containerVisibility: { [key: string]: boolean };
  focusedCategoryId?: string | null;
  focusedCalendarId?: string | null;
  isMobile?: boolean;
  onOpenAddModal?: (mode: 'task' | 'event') => void;
  onConfirm?: (blockId: string) => void;
  onUnconfirm?: (blockId: string) => void;
  onDeleteBlock?: (blockId: string) => void;
  onDeleteTask?: (taskId: string) => void;
  onDropTask?: (taskId: string, params: import('./DayView').DropTaskParams) => void;
  /** Create a time block from drag on empty grid (day view). */
  onCreateBlock?: (params: import('./DayView').CreateBlockParams) => string | undefined;
  /** Move a block to new time/date. */
  onMoveBlock?: (blockId: string, params: { date: string; startTime: string; endTime: string }) => void;
  /** Resize a block by dragging its bottom edge (end time only). */
  onResizeBlock?: (blockId: string, params: { date: string; endTime: string }) => void;
  onEditEvent?: (eventId: string) => void;
  onEditBlock?: (blockId: string) => void;
  events?: Event[];
  onDeleteEvent?: (eventId: string) => void;
  onMoveEvent?: (eventId: string, params: { date: string; startTime: string; endTime: string }) => void;
  onResizeEvent?: (eventId: string, params: { date: string; endTime: string }) => void;
}

export function CalendarView({ 
  mode, 
  onModeChange, 
  view, 
  onViewChange, 
  selectedDate,
  onSelectedDateChange,
  timeBlocks, 
  tasks,
  categories,
  tags,
  containers,
  containerVisibility,
  focusedCategoryId = null,
  focusedCalendarId = null,
  isMobile = false,
  onOpenAddModal,
  onConfirm,
  onUnconfirm,
  onDeleteBlock,
  onDeleteTask,
  onDropTask,
  onCreateBlock,
  onMoveBlock,
  onResizeBlock,
  onEditEvent,
  onEditBlock,
  events: eventsProp = [],
  onDeleteEvent,
  onMoveEvent,
  onResizeEvent,
}: CalendarViewProps) {
  const [selectedBlock, setSelectedBlock] = useState<string | null>(null);
  const currentDate = useMemo(() => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    return new Date(y, m - 1, d);
  }, [selectedDate]);

  const visibleBlocks = useMemo(() => {
    return resolveTimeBlocks(timeBlocks, tasks, categories, tags, containers);
  }, [timeBlocks, tasks, categories, tags, containers]);

  /** Main view: recorded replaces planned per slot; single unified timeline */
  const mainViewBlocks = useMemo(
    () => selectMainViewBlocks(visibleBlocks),
    [visibleBlocks]
  );

  const resolvedEvents = useMemo(() => {
    return resolveEvents(eventsProp, categories, containers);
  }, [eventsProp, categories, containers]);

  const compareMatchedTaskIds = useMemo(() => {
    if (mode !== 'compare') return [];
    const dayBlocks = visibleBlocks.filter((b) => b.date === selectedDate && b.taskId);
    const perTask = new Map<string, Set<'planned' | 'recorded'>>();
    dayBlocks.forEach((b) => {
      if (!b.taskId) return;
      const set = perTask.get(b.taskId) ?? new Set();
      set.add(b.mode);
      perTask.set(b.taskId, set);
    });
    const result: string[] = [];
    perTask.forEach((set, taskId) => {
      if (set.has('planned') && set.has('recorded')) result.push(taskId);
    });
    return result;
  }, [mode, visibleBlocks, selectedDate]);

  const getHeaderTitle = () => {
    const options: Intl.DateTimeFormatOptions = { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    };
    
    if (view === 'day') {
      const dayName = currentDate.toLocaleDateString('en-US', { weekday: 'long' });
      const dateStr = currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return { dayName, dateStr };
    } else if (view === 'week') {
      const startOfWeek = new Date(currentDate);
      startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      
      return `${startOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    } else {
      return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
  };

  const navigatePrevious = () => {
    const newDate = new Date(currentDate);
    if (view === 'day') {
      newDate.setDate(currentDate.getDate() - 1);
    } else if (view === 'week') {
      newDate.setDate(currentDate.getDate() - 7);
    } else {
      newDate.setMonth(currentDate.getMonth() - 1);
    }
    onSelectedDateChange?.(getLocalDateString(newDate));
  };

  const navigateNext = () => {
    const newDate = new Date(currentDate);
    if (view === 'day') {
      newDate.setDate(currentDate.getDate() + 1);
    } else if (view === 'week') {
      newDate.setDate(currentDate.getDate() + 7);
    } else {
      newDate.setMonth(currentDate.getMonth() + 1);
    }
    onSelectedDateChange?.(getLocalDateString(newDate));
  };

  const navigateToday = () => {
    onSelectedDateChange?.(getLocalDateString());
  };

  return (
    <div className="flex-1 flex flex-col relative min-w-0" style={{ backgroundColor: '#FAF8F4' }}>
      {/* Header */}
      <div className={isMobile ? 'px-4 py-2.5' : 'px-5 py-2.5'} style={{ borderBottom: '1px solid rgba(160,140,120,0.18)', backgroundColor: '#FAF8F4' }}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 md:gap-3">
            <div className="flex items-center gap-0.5">
              <button
                onClick={navigatePrevious}
                className="p-1.5 rounded-lg transition-colors touch-manipulation"
                style={{ color: '#A08C78' }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(160,140,120,0.12)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <ChevronLeftIcon className="h-4 w-4" />
              </button>
              <button
                onClick={navigateNext}
                className="p-1.5 rounded-lg transition-colors touch-manipulation"
                style={{ color: '#A08C78' }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(160,140,120,0.12)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <ChevronRightIcon className="h-4 w-4" />
              </button>
            </div>
            <div className="min-w-0">
              {!isMobile && view === 'day' ? (
                <h1 className="text-base md:text-lg font-semibold truncate" style={{ color: '#2C2820' }}>
                  <span>{(getHeaderTitle() as any).dayName}</span>
                  <span className="font-normal ml-1.5" style={{ color: '#8A7A6E' }}>({(getHeaderTitle() as any).dateStr})</span>
                </h1>
              ) : (
                <h1 className={`font-semibold truncate ${isMobile ? 'text-sm' : 'text-base md:text-lg'}`} style={{ color: '#2C2820' }}>
                  {isMobile && view === 'day'
                    ? currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    : getHeaderTitle()}
                </h1>
              )}
            </div>
            {/* Compare toggle */}
            {onModeChange && (
              <button
                type="button"
                onClick={() => onModeChange(mode === 'compare' ? 'overall' : 'compare')}
                className="py-1 px-2.5 rounded-lg text-xs font-medium transition-all shrink-0"
                style={{
                  backgroundColor: mode === 'compare' ? 'rgba(91,155,173,0.12)' : 'rgba(160,140,120,0.1)',
                  color: mode === 'compare' ? '#5B9BAD' : '#8A7A6E',
                  border: mode === 'compare' ? '1px solid rgba(91,155,173,0.3)' : '1px solid rgba(160,140,120,0.2)',
                }}
                title={mode === 'compare' ? 'Back to calendar' : 'Compare planned vs recorded'}
              >
                Compare
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {!isMobile && (
              <button
                onClick={navigateToday}
                className="px-2.5 py-1 text-xs rounded-lg transition-colors flex items-center gap-1"
                style={{ color: '#8A7A6E', backgroundColor: 'rgba(160,140,120,0.1)', border: '1px solid rgba(160,140,120,0.18)' }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(160,140,120,0.18)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(160,140,120,0.1)')}
              >
                <CalendarIcon className="h-3.5 w-3.5" />
                Today
              </button>
            )}

            {/* View Selector — Day / Week / Month */}
            <div className="rounded-lg p-0.5 flex" style={{ backgroundColor: 'rgba(160,140,120,0.1)', border: '1px solid rgba(160,140,120,0.18)' }}>
              <button
                type="button"
                onClick={() => onViewChange('day')}
                className="px-2.5 py-1 text-xs font-medium rounded-md transition-all touch-manipulation"
                style={{
                  backgroundColor: view === 'day' ? '#FDFBF8' : 'transparent',
                  color: view === 'day' ? '#2C2820' : '#8A7A6E',
                  boxShadow: view === 'day' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                }}
              >
                {isMobile ? 'D' : 'Day'}
              </button>
              <button
                type="button"
                onClick={() => onViewChange('week')}
                className="px-2.5 py-1 text-xs font-medium rounded-md transition-all touch-manipulation"
                style={{
                  backgroundColor: view === 'week' ? '#FDFBF8' : 'transparent',
                  color: view === 'week' ? '#2C2820' : '#8A7A6E',
                  boxShadow: view === 'week' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                }}
              >
                {isMobile ? 'W' : 'Week'}
              </button>
              <button
                type="button"
                onClick={() => onViewChange('month')}
                className="px-2.5 py-1 text-xs font-medium rounded-md transition-all touch-manipulation"
                style={{
                  backgroundColor: view === 'month' ? '#FDFBF8' : 'transparent',
                  color: view === 'month' ? '#2C2820' : '#8A7A6E',
                  boxShadow: view === 'month' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                }}
              >
                {isMobile ? 'M' : 'Month'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Calendar Content */}
      {view === 'day' && mode === 'compare' ? (
        <div className="flex-1 flex overflow-hidden min-h-0 min-w-0" style={{ borderTop: '1px solid rgba(160,140,120,0.18)' }}>
          <div className="flex-1 min-w-0 flex flex-col min-h-0" style={{ borderRight: '1px solid rgba(160,140,120,0.18)', backgroundColor: '#FDFBF8' }}>
            <div className="px-3 py-1.5 shrink-0 text-[10px] font-semibold uppercase tracking-widest" style={{ backgroundColor: 'rgba(160,140,120,0.07)', borderBottom: '1px solid rgba(160,140,120,0.15)', color: '#A08C78' }}>Plan</div>
            <DayView
              mode="overall"
              timeBlocks={visibleBlocks.filter((b) => b.mode === 'planned')}
              events={resolvedEvents}
              selectedDate={selectedDate}
              selectedBlock={selectedBlock}
              onSelectBlock={setSelectedBlock}
              focusedCategoryId={focusedCategoryId}
              focusedCalendarId={focusedCalendarId}
              onDeleteBlock={onDeleteBlock}
              onDeleteTask={onDeleteTask}
              onDeleteEvent={onDeleteEvent}
              onConfirm={onConfirm}
              onUnconfirm={onUnconfirm}
              onDropTask={onDropTask}
              onCreateBlock={onCreateBlock}
              onMoveBlock={onMoveBlock}
              onMoveEvent={onMoveEvent}
              onResizeEvent={onResizeEvent}
              onEditEvent={onEditEvent}
              onEditBlock={onEditBlock}
            />
          </div>
          <div className="flex-1 min-w-0 flex flex-col min-h-0" style={{ backgroundColor: '#F5F1EB' }}>
            <div className="px-3 py-1.5 shrink-0 text-[10px] font-semibold uppercase tracking-widest" style={{ backgroundColor: 'rgba(160,140,120,0.12)', borderBottom: '1px solid rgba(160,140,120,0.18)', color: '#A08C78' }}>Recorded</div>
            <DayView
              mode="compare"
              timeBlocks={visibleBlocks.filter((b) => b.mode === 'recorded')}
              events={resolvedEvents}
              selectedDate={selectedDate}
              selectedBlock={selectedBlock}
              onSelectBlock={setSelectedBlock}
              focusedCategoryId={focusedCategoryId}
              focusedCalendarId={focusedCalendarId}
              onConfirm={onConfirm}
              onUnconfirm={onUnconfirm}
              onDeleteBlock={onDeleteBlock}
              onDeleteTask={onDeleteTask}
              onDeleteEvent={onDeleteEvent}
              onMoveEvent={onMoveEvent}
              onResizeEvent={onResizeEvent}
              onEditEvent={onEditEvent}
              onEditBlock={onEditBlock}
            />
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {view === 'day' && <DayView mode={mode} timeBlocks={mode === 'compare' ? visibleBlocks : mainViewBlocks} events={resolvedEvents} selectedDate={selectedDate} selectedBlock={selectedBlock} onSelectBlock={setSelectedBlock} focusedCategoryId={focusedCategoryId} focusedCalendarId={focusedCalendarId} onConfirm={onConfirm} onUnconfirm={onUnconfirm} onDeleteBlock={onDeleteBlock} onDeleteTask={onDeleteTask} onDeleteEvent={onDeleteEvent} onDropTask={mode === 'overall' ? onDropTask : undefined} onCreateBlock={onCreateBlock} onMoveBlock={mode === 'overall' ? onMoveBlock : undefined} onResizeBlock={mode === 'overall' ? onResizeBlock : undefined} onMoveEvent={mode === 'overall' ? onMoveEvent : undefined} onResizeEvent={mode === 'overall' ? onResizeEvent : undefined} onEditEvent={onEditEvent} onEditBlock={onEditBlock} />}
          {view === 'week' && <WeekView mode={mode} timeBlocks={mode === 'compare' ? visibleBlocks : mainViewBlocks} currentDate={currentDate} selectedBlock={selectedBlock} onSelectBlock={setSelectedBlock} focusedCategoryId={focusedCategoryId} focusedCalendarId={focusedCalendarId} onConfirm={onConfirm} onUnconfirm={onUnconfirm} onDeleteBlock={onDeleteBlock} onDeleteTask={onDeleteTask} onDropTask={mode === 'overall' ? onDropTask : undefined} onMoveBlock={mode === 'overall' ? onMoveBlock : undefined} onResizeBlock={mode === 'overall' ? onResizeBlock : undefined} onMoveEvent={mode === 'overall' ? onMoveEvent : undefined} onResizeEvent={mode === 'overall' ? onResizeEvent : undefined} events={resolvedEvents} onDeleteEvent={onDeleteEvent} onCreateBlock={onCreateBlock} onEditEvent={onEditEvent} onEditBlock={onEditBlock} />}
          {view === 'month' && <MonthView mode={mode} timeBlocks={mode === 'compare' ? visibleBlocks : mainViewBlocks} currentDate={currentDate} selectedBlock={selectedBlock} onSelectBlock={setSelectedBlock} focusedCategoryId={focusedCategoryId} focusedCalendarId={focusedCalendarId} onSelectDate={(d) => { onSelectedDateChange?.(d); onViewChange('day'); }} events={eventsProp} />}
        </div>
      )}

      {/* Floating Add Button */}
      {onOpenAddModal && (
        <button
          type="button"
          onClick={() => onOpenAddModal('event')}
          className="absolute bottom-6 right-6 z-20 w-13 h-13 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-95"
          style={{
            width: 52, height: 52,
            backgroundColor: '#5B9BAD',
            border: '1.5px solid rgba(91,155,173,0.5)',
            boxShadow: '0 4px 16px rgba(91,155,173,0.35)',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#4E8A9C')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#5B9BAD')}
          aria-label="Add task or event"
        >
          <PlusIcon className="h-6 w-6 text-white" />
        </button>
      )}
    </div>
  );
}