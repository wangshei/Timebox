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
    <div className="flex-1 bg-white flex flex-col relative min-w-0">
      {/* Header */}
      <div className={`border-b border-neutral-200 ${isMobile ? 'px-4 py-3' : 'px-6 py-3'}`}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 md:gap-3">
            <div className="flex items-center gap-0.5 md:gap-1">
              <button
                onClick={navigatePrevious}
                className="p-1.5 rounded-lg text-neutral-400 hover:bg-neutral-50 hover:text-neutral-600 transition-colors touch-manipulation"
              >
                <ChevronLeftIcon className="h-4 w-4 md:h-5 md:w-5" />
              </button>
              <button
                onClick={navigateNext}
                className="p-1.5 rounded-lg text-neutral-400 hover:bg-neutral-50 hover:text-neutral-600 transition-colors touch-manipulation"
              >
                <ChevronRightIcon className="h-4 w-4 md:h-5 md:w-5" />
              </button>
            </div>
            <div className="min-w-0">
              {!isMobile && view === 'day' ? (
                <h1 className="text-base md:text-lg font-medium text-neutral-900 truncate">
                  <span>{(getHeaderTitle() as any).dayName}</span>
                  <span className="font-normal text-neutral-500"> ({(getHeaderTitle() as any).dateStr})</span>
                </h1>
              ) : (
                <h1 className={`font-medium text-neutral-900 truncate ${isMobile ? 'text-sm' : 'text-base md:text-lg'}`}>
                  {isMobile && view === 'day'
                    ? currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    : getHeaderTitle()}
                </h1>
              )}
            </div>
            {/* Compare toggle — click to show planned vs recorded side by side; click off for main calendar */}
            {onModeChange && (
              <button
                type="button"
                onClick={() => onModeChange(mode === 'compare' ? 'overall' : 'compare')}
                className={`py-1 px-2 rounded text-xs font-medium transition-all border shrink-0 ${
                  mode === 'compare'
                    ? 'bg-white text-neutral-800 shadow-sm border-neutral-200'
                    : 'bg-neutral-50 border-neutral-100 text-neutral-600 hover:text-neutral-800 hover:bg-neutral-100/80'
                }`}
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
                className="px-2 py-1 text-xs text-neutral-600 bg-neutral-50 hover:bg-neutral-100 rounded-md transition-colors flex items-center gap-1 border border-neutral-100"
              >
                <CalendarIcon className="h-3.5 w-3.5 text-neutral-500" />
                Today
              </button>
            )}

            {/* View Selector — D / W / M */}
            <div className="bg-neutral-50 rounded-md p-0.5 flex border border-neutral-100">
              <button
                type="button"
                onClick={() => onViewChange('day')}
                className={`px-2 py-1 text-xs font-medium rounded transition-all touch-manipulation ${
                  view === 'day' ? 'bg-white text-neutral-800 shadow-sm border border-neutral-100' : 'text-neutral-600 hover:text-neutral-800 hover:bg-neutral-100/80'
                }`}
              >
                {isMobile ? 'D' : 'Day'}
              </button>
              <button
                type="button"
                onClick={() => onViewChange('week')}
                className={`px-2 py-1 text-xs font-medium rounded transition-all touch-manipulation ${
                  view === 'week' ? 'bg-white text-neutral-800 shadow-sm border border-neutral-100' : 'text-neutral-600 hover:text-neutral-800 hover:bg-neutral-100/80'
                }`}
              >
                {isMobile ? 'W' : 'Week'}
              </button>
              <button
                type="button"
                onClick={() => onViewChange('month')}
                className={`px-2 py-1 text-xs font-medium rounded transition-all touch-manipulation ${
                  view === 'month' ? 'bg-white text-neutral-800 shadow-sm border border-neutral-100' : 'text-neutral-600 hover:text-neutral-800 hover:bg-neutral-100/80'
                }`}
              >
                {isMobile ? 'M' : 'Month'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Calendar Content */}
      {view === 'day' && mode === 'compare' ? (
        <div className="flex-1 flex overflow-hidden border-t border-neutral-100 min-h-0 min-w-0">
          <div className="flex-1 min-w-0 border-r border-neutral-100 flex flex-col min-h-0 bg-white">
            <div className="px-3 py-1.5 bg-neutral-50 border-b border-neutral-100 text-xs font-medium text-neutral-500 uppercase tracking-wide shrink-0">Plan</div>
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
          <div className="flex-1 min-w-0 flex flex-col min-h-0 bg-neutral-100">
            <div className="px-3 py-1.5 bg-neutral-100 border-b border-neutral-200 text-xs font-medium text-neutral-500 uppercase tracking-wide shrink-0">Recorded</div>
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

      {/* Floating Add Button — visible in day/week/month, draggable add popup opens */}
      {onOpenAddModal && (
        <button
          type="button"
          onClick={() => onOpenAddModal('event')}
          className="absolute bottom-6 right-6 z-20 w-14 h-14 rounded-full bg-neutral-100 hover:bg-neutral-200 border border-neutral-200 text-neutral-600 shadow-sm hover:shadow transition-all flex items-center justify-center"
          aria-label="Add task or event"
        >
          <PlusIcon className="h-6 w-6 text-neutral-600" />
        </button>
      )}
    </div>
  );
}