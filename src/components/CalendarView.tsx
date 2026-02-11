import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Calendar, Plus } from 'lucide-react';
import { Mode, View, TimeBlock, Category, Tag, CalendarContainer, Task } from '../types';
import { resolveTimeBlocks } from '../utils/dataResolver';
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
  onDoneAsPlanned?: (blockId: string) => void;
  onDidSomethingElse?: (plannedBlockId: string, recorded: import('./TimeBlockCard').RecordedBlockPayload) => void;
  onDeleteBlock?: (blockId: string) => void;
  onDropTask?: (taskId: string, params: import('./DayView').DropTaskParams) => void;
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
  onDoneAsPlanned,
  onDidSomethingElse,
  onDeleteBlock,
  onDropTask,
}: CalendarViewProps) {
  const [selectedBlock, setSelectedBlock] = useState<string | null>(null);
  const currentDate = useMemo(() => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    return new Date(y, m - 1, d);
  }, [selectedDate]);

  const visibleBlocks = useMemo(() => {
    return resolveTimeBlocks(timeBlocks, tasks, categories, tags, containers);
  }, [timeBlocks, tasks, categories, tags, containers]);

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
    onSelectedDateChange?.(newDate.toISOString().split('T')[0]);
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
    onSelectedDateChange?.(newDate.toISOString().split('T')[0]);
  };

  const navigateToday = () => {
    const today = new Date();
    onSelectedDateChange?.(today.toISOString().split('T')[0]);
  };

  return (
    <div className="flex-1 bg-white flex flex-col relative">
      {/* Header */}
      <div className={`border-b border-neutral-200 ${isMobile ? 'px-4 py-3' : 'px-6 py-3'}`}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 md:gap-3">
            <div className="flex items-center gap-0.5 md:gap-1">
              <button
                onClick={navigatePrevious}
                className="p-1.5 rounded-lg text-neutral-400 hover:bg-neutral-50 hover:text-neutral-600 transition-colors touch-manipulation"
              >
                <ChevronLeft className="w-4 h-4 md:w-5 md:h-5" />
              </button>
              <button
                onClick={navigateNext}
                className="p-1.5 rounded-lg text-neutral-400 hover:bg-neutral-50 hover:text-neutral-600 transition-colors touch-manipulation"
              >
                <ChevronRight className="w-4 h-4 md:w-5 md:h-5" />
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
            {/* Planning / Recording toggle — beside date, compact */}
            {onModeChange && (
              <div className="bg-neutral-50 rounded-md p-0.5 flex shrink-0 border border-neutral-100">
                <button
                  type="button"
                  onClick={() => onModeChange('planning')}
                  className={`py-1 px-2 rounded text-xs font-medium transition-all ${
                    mode === 'planning' ? 'bg-white text-neutral-800 shadow-sm border border-neutral-100' : 'text-neutral-600 hover:text-neutral-800 hover:bg-neutral-100/80'
                  }`}
                >
                  Plan
                </button>
                <button
                  type="button"
                  onClick={() => onModeChange('recording')}
                  className={`py-1 px-2 rounded text-xs font-medium transition-all ${
                    mode === 'recording' ? 'bg-white text-neutral-800 shadow-sm border border-neutral-100' : 'text-neutral-600 hover:text-neutral-800 hover:bg-neutral-100/80'
                  }`}
                >
                  Record
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {!isMobile && (
              <button
                onClick={navigateToday}
                className="px-2 py-1 text-xs text-neutral-600 bg-neutral-50 hover:bg-neutral-100 rounded-md transition-colors flex items-center gap-1 border border-neutral-100"
              >
                <Calendar className="w-3.5 h-3.5 text-neutral-500" />
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
      <div className="flex-1 overflow-y-auto">
        {view === 'day' && <DayView mode={mode} timeBlocks={visibleBlocks} selectedDate={selectedDate} selectedBlock={selectedBlock} onSelectBlock={setSelectedBlock} focusedCategoryId={focusedCategoryId} focusedCalendarId={focusedCalendarId} onDoneAsPlanned={onDoneAsPlanned} onDidSomethingElse={onDidSomethingElse} onDeleteBlock={onDeleteBlock} onDropTask={onDropTask} />}
        {view === 'week' && <WeekView mode={mode} timeBlocks={visibleBlocks} currentDate={currentDate} selectedBlock={selectedBlock} onSelectBlock={setSelectedBlock} focusedCategoryId={focusedCategoryId} focusedCalendarId={focusedCalendarId} onDoneAsPlanned={onDoneAsPlanned} onDidSomethingElse={onDidSomethingElse} onDeleteBlock={onDeleteBlock} />}
        {view === 'month' && <MonthView mode={mode} timeBlocks={visibleBlocks} currentDate={currentDate} selectedBlock={selectedBlock} onSelectBlock={setSelectedBlock} focusedCategoryId={focusedCategoryId} focusedCalendarId={focusedCalendarId} />}
      </div>

      {/* Floating Add Button — circle, muted neutral style */}
      {onOpenAddModal && (
        <button
          onClick={() => onOpenAddModal('event')}
          className="absolute bottom-6 right-6 w-14 h-14 rounded-full bg-neutral-100 hover:bg-neutral-200 border border-neutral-200 text-neutral-600 shadow-sm hover:shadow transition-all flex items-center justify-center"
          aria-label="Add new event"
        >
          <Plus className="w-6 h-6 text-neutral-600" />
        </button>
      )}
    </div>
  );
}