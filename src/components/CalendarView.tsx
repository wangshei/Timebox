import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar, Plus } from 'lucide-react';
import { Mode, View, TimeBlock } from '../App';
import { DayView } from './DayView';
import { WeekView } from './WeekView';
import { MonthView } from './MonthView';

interface CalendarViewProps {
  mode: Mode;
  onModeChange?: (mode: Mode) => void;
  view: View;
  onViewChange: (view: View) => void;
  timeBlocks: TimeBlock[];
  isMobile?: boolean;
  onOpenAddModal?: (mode: 'task' | 'event') => void;
}

export function CalendarView({ mode, onModeChange, view, onViewChange, timeBlocks, isMobile = false, onOpenAddModal }: CalendarViewProps) {
  const [selectedBlock, setSelectedBlock] = useState<string | null>(null);
  const [currentDate, setCurrentDate] = useState(new Date(2026, 1, 10)); // Feb 10, 2026

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
    setCurrentDate(newDate);
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
    setCurrentDate(newDate);
  };

  const navigateToday = () => {
    setCurrentDate(new Date(2026, 1, 10)); // Reset to Feb 10, 2026 (today)
  };

  return (
    <div className="flex-1 bg-white flex flex-col relative">
      {/* Header */}
      <div className={`border-b border-neutral-200 ${isMobile ? 'px-4 py-4' : 'px-8 py-5'}`}>
        {/* Mobile mode toggle */}
        {isMobile && onModeChange && (
          <div className="mb-3">
            <div className="bg-neutral-100 rounded-full p-1 flex max-w-xs mx-auto">
              <button
                onClick={() => onModeChange('planning')}
                className={`flex-1 py-2 px-3 rounded-full transition-all text-sm ${
                  mode === 'planning'
                    ? 'bg-white text-neutral-900 shadow-sm'
                    : 'text-neutral-600'
                }`}
              >
                Planning
              </button>
              <button
                onClick={() => onModeChange('recording')}
                className={`flex-1 py-2 px-3 rounded-full transition-all text-sm ${
                  mode === 'recording'
                    ? 'bg-white text-neutral-900 shadow-sm'
                    : 'text-neutral-600'
                }`}
              >
                Recording
              </button>
            </div>
          </div>
        )}

        <div className={`flex items-center justify-between ${isMobile ? 'mb-3' : 'mb-4'}`}>
          <div className="flex items-center gap-2 md:gap-4">
            <div className="flex items-center gap-1 md:gap-2">
              <button
                onClick={navigatePrevious}
                className="p-1.5 hover:bg-neutral-100 rounded-lg transition-colors touch-manipulation"
              >
                <ChevronLeft className="w-5 h-5 text-neutral-600" />
              </button>
              <button
                onClick={navigateNext}
                className="p-1.5 hover:bg-neutral-100 rounded-lg transition-colors touch-manipulation"
              >
                <ChevronRight className="w-5 h-5 text-neutral-600" />
              </button>
            </div>
            <div>
              {!isMobile && view === 'day' ? (
                <h1 className="text-xl">
                  <span className="font-medium text-neutral-900">{(getHeaderTitle() as any).dayName}</span>
                  {' '}
                  <span className="font-normal text-neutral-500">({(getHeaderTitle() as any).dateStr})</span>
                </h1>
              ) : (
                <h1 className={`font-medium text-neutral-900 ${isMobile ? 'text-base' : 'text-xl'}`}>
                  {isMobile && view === 'day' 
                    ? currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    : getHeaderTitle()}
                </h1>
              )}
              {!isMobile && view !== 'day' && (
                <p className="text-sm text-neutral-500 mt-0.5">
                  {mode === 'planning' ? 'Planning your time' : 'Recording your time'}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            {!isMobile && (
              <button
                onClick={navigateToday}
                className="px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100 rounded-lg transition-colors flex items-center gap-2"
              >
                <Calendar className="w-4 h-4" />
                Today
              </button>
            )}

            {/* View Selector */}
            <div className="bg-neutral-100 rounded-lg p-1 flex">
              <button
                onClick={() => onViewChange('day')}
                className={`${isMobile ? 'px-2 py-1' : 'px-3 py-1.5'} text-sm rounded-md transition-all touch-manipulation ${
                  view === 'day'
                    ? 'bg-white text-neutral-900 shadow-sm'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                {isMobile ? 'D' : 'Day'}
              </button>
              <button
                onClick={() => onViewChange('week')}
                className={`${isMobile ? 'px-2 py-1' : 'px-3 py-1.5'} text-sm rounded-md transition-all touch-manipulation ${
                  view === 'week'
                    ? 'bg-white text-neutral-900 shadow-sm'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                {isMobile ? 'W' : 'Week'}
              </button>
              <button
                onClick={() => onViewChange('month')}
                className={`${isMobile ? 'px-2 py-1' : 'px-3 py-1.5'} text-sm rounded-md transition-all touch-manipulation ${
                  view === 'month'
                    ? 'bg-white text-neutral-900 shadow-sm'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                {isMobile ? 'M' : 'Month'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Calendar Content */}
      <div className="flex-1 overflow-hidden">
        {view === 'day' && <DayView mode={mode} timeBlocks={timeBlocks} currentDate={currentDate} />}
        {view === 'week' && <WeekView mode={mode} timeBlocks={timeBlocks} currentDate={currentDate} />}
        {view === 'month' && <MonthView mode={mode} timeBlocks={timeBlocks} currentDate={currentDate} />}
      </div>

      {/* Floating Add Button */}
      {onOpenAddModal && (
        <button
          onClick={() => onOpenAddModal('event')}
          className="absolute bottom-6 right-6 w-14 h-14 bg-[#0044A8] hover:bg-[#003380] text-white rounded-full shadow-lg hover:shadow-xl transition-all flex items-center justify-center"
          aria-label="Add new event"
        >
          <Plus className="w-6 h-6" />
        </button>
      )}
    </div>
  );
}