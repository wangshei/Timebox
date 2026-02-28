import React, { useState, useMemo } from 'react';
import { ChevronLeftIcon, ChevronRightIcon, CalendarIcon, PlusIcon } from '@heroicons/react/24/solid';
import { Mode, View, TimeBlock, Category, Tag, CalendarContainer, Task, Event } from '../types';
import { resolveTimeBlocks, resolveEvents, selectMainViewBlocks } from '../utils/dataResolver';
import { getLocalDateString } from '../utils/dateTime';
import { isPlannedIntent, isRecordedBlock } from '../store/selectors';
import { DayView } from './DayView';
import { ThreeDayView } from './ThreeDayView';
import { WeekView } from './WeekView';
import { MonthView } from './MonthView';
import { SegmentedControl } from './ui/SegmentedControl';

const PRIMARY = '#8DA286';
const BG = '#FDFDFB';
const BORDER = 'rgba(0,0,0,0.08)';
const TEXT_PRIMARY = '#1C1C1E';
const TEXT_MUTED = '#8E8E93';
const TEXT_SECONDARY = '#636366';

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
  onSkip?: (blockId: string) => void;
  onUnconfirm?: (blockId: string) => void;
  onDeleteBlock?: (blockId: string) => void;
  onDeleteTask?: (taskId: string) => void;
  onDropTask?: (taskId: string, params: import('./DayView').DropTaskParams) => void;
  onCreateBlock?: (params: import('./DayView').CreateBlockParams) => string | undefined;
  onMoveBlock?: (blockId: string, params: { date: string; startTime: string; endTime: string }) => void;
  onResizeBlock?: (blockId: string, params: { date: string; endTime: string }) => void;
  onEditEvent?: (eventId: string) => void;
  onEditBlock?: (blockId: string) => void;
  events?: Event[];
  onDeleteEvent?: (eventId: string) => void;
  onDeleteEventSeries?: (eventId: string, scope: 'this' | 'all' | 'all_after') => void;
  onMoveEvent?: (eventId: string, params: { date: string; startTime: string; endTime: string }) => void;
  onResizeEvent?: (eventId: string, params: { date: string; endTime: string }) => void;
}

const VIEW_OPTIONS = [
  { value: 'day' as View, label: 'Day', shortLabel: 'D' },
  { value: '3day' as View, label: '3 Day', shortLabel: '3D' },
  { value: 'week' as View, label: 'Week', shortLabel: 'W' },
  { value: 'month' as View, label: 'Month', shortLabel: 'M' },
];

export function CalendarView({
  mode, onModeChange, view, onViewChange, selectedDate, onSelectedDateChange,
  timeBlocks, tasks, categories, tags, containers, containerVisibility,
  focusedCategoryId = null, focusedCalendarId = null, isMobile = false,
  onOpenAddModal, onConfirm, onSkip, onUnconfirm, onDeleteBlock, onDeleteTask,
  onDropTask, onCreateBlock, onMoveBlock, onResizeBlock, onEditEvent, onEditBlock,
  events: eventsProp = [], onDeleteEvent, onDeleteEventSeries, onMoveEvent, onResizeEvent,
}: CalendarViewProps) {
  const [selectedBlock, setSelectedBlock] = useState<string | null>(null);
  const [showDifferences, setShowDifferences] = useState(false);

  // Reset showDifferences when exiting compare mode
  React.useEffect(() => {
    if (mode !== 'compare') setShowDifferences(false);
  }, [mode]);

  const todayStr = getLocalDateString();

  const currentDate = useMemo(() => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    return new Date(y, m - 1, d);
  }, [selectedDate]);

  const visibleBlocks = useMemo(
    () => resolveTimeBlocks(timeBlocks, tasks, categories, tags, containers),
    [timeBlocks, tasks, categories, tags, containers]
  );

  const mainViewBlocks = useMemo(() => selectMainViewBlocks(visibleBlocks), [visibleBlocks]);

  // Compare mode block sets — plan side vs actual side
  const planBlocks = useMemo(
    () => visibleBlocks.filter((b) => isPlannedIntent(b)),
    [visibleBlocks]
  );
  const actualBlocks = useMemo(
    () => visibleBlocks.filter((b) => isRecordedBlock(b, todayStr) || b.source === 'unplanned'),
    [visibleBlocks, todayStr]
  );

  const resolvedEvents = useMemo(
    () => resolveEvents(eventsProp, categories, containers),
    [eventsProp, categories, containers]
  );

  const getHeaderTitle = () => {
    if (view === 'day') {
      const dayName = currentDate.toLocaleDateString('en-US', { weekday: 'long' });
      const dateStr = currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return { dayName, dateStr };
    } else if (view === '3day') {
      const end = new Date(currentDate);
      end.setDate(currentDate.getDate() + 2);
      const startStr = currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return `${startStr} – ${endStr}`;
    } else if (view === 'week') {
      const startOfWeek = new Date(currentDate);
      startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      return `${startOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${endOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    } else {
      return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
  };

  const navigatePrevious = () => {
    const newDate = new Date(currentDate);
    if (view === 'day') newDate.setDate(currentDate.getDate() - 1);
    else if (view === '3day') newDate.setDate(currentDate.getDate() - 3);
    else if (view === 'week') newDate.setDate(currentDate.getDate() - 7);
    else newDate.setMonth(currentDate.getMonth() - 1);
    onSelectedDateChange?.(getLocalDateString(newDate));
  };

  const navigateNext = () => {
    const newDate = new Date(currentDate);
    if (view === 'day') newDate.setDate(currentDate.getDate() + 1);
    else if (view === '3day') newDate.setDate(currentDate.getDate() + 3);
    else if (view === 'week') newDate.setDate(currentDate.getDate() + 7);
    else newDate.setMonth(currentDate.getMonth() + 1);
    onSelectedDateChange?.(getLocalDateString(newDate));
  };

  const navigateToday = () => onSelectedDateChange?.(getLocalDateString());

  const headerTitle = getHeaderTitle();

  return (
    <div className="flex-1 flex flex-col relative min-w-0" style={{ backgroundColor: BG }}>
      {/* Header */}
      <div
        className={isMobile ? 'px-4 py-2' : 'px-5 py-2'}
        style={{ borderBottom: `1px solid ${BORDER}`, backgroundColor: BG }}
      >
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {/* Left: nav + title */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-0.5">
              <button
                onClick={navigatePrevious}
                className="p-1.5 rounded-lg transition-colors touch-manipulation"
                style={{ color: TEXT_MUTED }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.06)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <ChevronLeftIcon className="h-4 w-4" />
              </button>
              <button
                onClick={navigateNext}
                className="p-1.5 rounded-lg transition-colors touch-manipulation"
                style={{ color: TEXT_MUTED }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.06)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <ChevronRightIcon className="h-4 w-4" />
              </button>
            </div>

            <div className="min-w-0">
              {!isMobile && view === 'day' ? (
                <h1 className="text-sm font-semibold truncate" style={{ color: TEXT_PRIMARY }}>
                  <span>{(headerTitle as any).dayName}</span>
                  <span className="font-normal ml-1.5" style={{ color: TEXT_SECONDARY, fontSize: '13px' }}>
                    {(headerTitle as any).dateStr}
                  </span>
                </h1>
              ) : (
                <h1
                  className={`font-semibold truncate ${isMobile ? 'text-xs' : 'text-sm'}`}
                  style={{ color: TEXT_PRIMARY }}
                >
                  {isMobile && view === 'day'
                    ? currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    : typeof headerTitle === 'string' ? headerTitle : `${(headerTitle as any).dayName}`}
                </h1>
              )}
            </div>

            {/* Compare toggle */}
            {onModeChange && (
              <button
                type="button"
                onClick={() => onModeChange(mode === 'compare' ? 'overall' : 'compare')}
                className="py-1.5 px-3 rounded-lg text-xs font-medium transition-all shrink-0"
                style={{
                  backgroundColor: mode === 'compare' ? 'rgba(141,162,134,0.12)' : 'rgba(0,0,0,0.05)',
                  color: mode === 'compare' ? PRIMARY : TEXT_SECONDARY,
                  border: mode === 'compare' ? `1px solid rgba(141,162,134,0.28)` : `1px solid ${BORDER}`,
                }}
              >
                Compare
              </button>
            )}

            {/* Show Difference button — only visible in compare mode */}
            {mode === 'compare' && (
              <button
                type="button"
                onClick={() => setShowDifferences((v) => !v)}
                className="py-1.5 px-3 rounded-lg text-xs font-medium transition-all shrink-0"
                style={{
                  backgroundColor: showDifferences ? 'rgba(255,59,48,0.08)' : 'transparent',
                  color: '#FF3B30',
                  border: '1px solid rgba(255,59,48,0.45)',
                }}
              >
                Show Difference
              </button>
            )}
          </div>

          {/* Right: today + view selector */}
          <div className="flex items-center gap-2">
            {!isMobile && (
              <button
                onClick={navigateToday}
                className="px-3 py-1.5 text-xs rounded-lg transition-colors flex items-center gap-1 font-medium"
                style={{ color: TEXT_SECONDARY, backgroundColor: 'rgba(0,0,0,0.05)', border: `1px solid ${BORDER}` }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.08)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)')}
              >
                <CalendarIcon className="h-3.5 w-3.5" />
                Today
              </button>
            )}

            <SegmentedControl
              options={isMobile
                ? VIEW_OPTIONS.map(o => ({ ...o, label: o.shortLabel ?? o.label }))
                : VIEW_OPTIONS}
              value={view}
              onChange={onViewChange}
              compact={isMobile}
            />
          </div>
        </div>
      </div>

      {/* Calendar Content */}
      {view === 'day' && mode === 'compare' ? (
        /* Day compare: plan | actual split */
        <div className="flex-1 flex overflow-hidden min-h-0 min-w-0" style={{ borderTop: `1px solid ${BORDER}` }}>
          <div className="flex-1 min-w-0 flex flex-col min-h-0" style={{ borderRight: `1px solid ${BORDER}`, backgroundColor: '#FFFFFF' }}>
            <div className="px-3 py-1.5 shrink-0 section-label" style={{ backgroundColor: 'rgba(0,0,0,0.03)', borderBottom: `1px solid ${BORDER}` }}>
              Plan
            </div>
            <DayView
              mode="overall"
              timeBlocks={planBlocks}
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
              onDeleteEventSeries={onDeleteEventSeries}
              onEditEvent={onEditEvent}
              onEditBlock={onEditBlock}
              locked
              showDifferences={showDifferences}
            />
          </div>
          <div className="flex-1 min-w-0 flex flex-col min-h-0" style={{ backgroundColor: BG }}>
            <div className="px-3 py-1.5 shrink-0 section-label" style={{ backgroundColor: 'rgba(0,0,0,0.04)', borderBottom: `1px solid ${BORDER}` }}>
              Actual
            </div>
            <DayView
              mode="compare"
              timeBlocks={actualBlocks}
              events={resolvedEvents}
              selectedDate={selectedDate}
              selectedBlock={selectedBlock}
              onSelectBlock={setSelectedBlock}
              focusedCategoryId={focusedCategoryId}
              focusedCalendarId={focusedCalendarId}
              onConfirm={onConfirm}
              onSkip={onSkip}
              onUnconfirm={onUnconfirm}
              onDeleteBlock={onDeleteBlock}
              onDeleteTask={onDeleteTask}
              onDeleteEvent={onDeleteEvent}
              onDeleteEventSeries={onDeleteEventSeries}
              onDropTask={onDropTask}
              onCreateBlock={onCreateBlock}
              onMoveBlock={onMoveBlock}
              onResizeBlock={onResizeBlock}
              onMoveEvent={onMoveEvent}
              onResizeEvent={onResizeEvent}
              onEditEvent={onEditEvent}
              onEditBlock={onEditBlock}
              showDifferences={showDifferences}
            />
          </div>
        </div>
      ) : view === '3day' && mode === 'compare' ? (
        /* 3-day compare: 3+3 split */
        <div className="flex-1 flex overflow-hidden min-h-0">
          <div className="flex-1 flex flex-col min-h-0" style={{ borderRight: `1px solid ${BORDER}` }}>
            <div className="px-3 py-1.5 shrink-0 section-label" style={{ backgroundColor: 'rgba(0,0,0,0.03)', borderBottom: `1px solid ${BORDER}` }}>
              Plan
            </div>
            <ThreeDayView
              mode="overall"
              timeBlocks={planBlocks}
              currentDate={currentDate}
              selectedBlock={selectedBlock}
              onSelectBlock={setSelectedBlock}
              focusedCategoryId={focusedCategoryId}
              focusedCalendarId={focusedCalendarId}
              onConfirm={onConfirm}
              onUnconfirm={onUnconfirm}
              onDeleteBlock={onDeleteBlock}
              onDeleteTask={onDeleteTask}
              events={resolvedEvents}
              onDeleteEvent={onDeleteEvent}
              onDeleteEventSeries={onDeleteEventSeries}
              onEditEvent={onEditEvent}
              onEditBlock={onEditBlock}
              locked
              showDifferences={showDifferences}
            />
          </div>
          <div className="flex-1 flex flex-col min-h-0">
            <div className="px-3 py-1.5 shrink-0 section-label" style={{ backgroundColor: 'rgba(0,0,0,0.04)', borderBottom: `1px solid ${BORDER}` }}>
              Actual
            </div>
            <ThreeDayView
              mode="compare"
              timeBlocks={actualBlocks}
              currentDate={currentDate}
              selectedBlock={selectedBlock}
              onSelectBlock={setSelectedBlock}
              focusedCategoryId={focusedCategoryId}
              focusedCalendarId={focusedCalendarId}
              onConfirm={onConfirm}
              onSkip={onSkip}
              onUnconfirm={onUnconfirm}
              onDeleteBlock={onDeleteBlock}
              onDeleteTask={onDeleteTask}
              onDropTask={onDropTask}
              onMoveBlock={onMoveBlock}
              onResizeBlock={onResizeBlock}
              onMoveEvent={onMoveEvent}
              onResizeEvent={onResizeEvent}
              events={resolvedEvents}
              onDeleteEvent={onDeleteEvent}
              onDeleteEventSeries={onDeleteEventSeries}
              onCreateBlock={onCreateBlock}
              onEditEvent={onEditEvent}
              onEditBlock={onEditBlock}
              hideTimeGutter
              showDifferences={showDifferences}
            />
          </div>
        </div>
      ) : (
        /* Normal single-panel views (day/3day/week/month non-compare, or week/month compare) */
        <div className="flex-1 overflow-y-auto min-h-0">
          {view === 'day' && (
            <DayView
              mode={mode}
              timeBlocks={mainViewBlocks}
              events={resolvedEvents}
              selectedDate={selectedDate}
              selectedBlock={selectedBlock}
              onSelectBlock={setSelectedBlock}
              focusedCategoryId={focusedCategoryId}
              focusedCalendarId={focusedCalendarId}
              onConfirm={onConfirm}
              onSkip={onSkip}
              onUnconfirm={onUnconfirm}
              onDeleteBlock={onDeleteBlock}
              onDeleteTask={onDeleteTask}
              onDeleteEvent={onDeleteEvent}
              onDeleteEventSeries={onDeleteEventSeries}
              onDropTask={onDropTask}
              onCreateBlock={onCreateBlock}
              onMoveBlock={onMoveBlock}
              onResizeBlock={onResizeBlock}
              onMoveEvent={onMoveEvent}
              onResizeEvent={onResizeEvent}
              onEditEvent={onEditEvent}
              onEditBlock={onEditBlock}
            />
          )}
          {view === '3day' && (
            <ThreeDayView
              mode={mode}
              timeBlocks={mainViewBlocks}
              currentDate={currentDate}
              selectedBlock={selectedBlock}
              onSelectBlock={setSelectedBlock}
              focusedCategoryId={focusedCategoryId}
              focusedCalendarId={focusedCalendarId}
              onConfirm={onConfirm}
              onSkip={onSkip}
              onUnconfirm={onUnconfirm}
              onDeleteBlock={onDeleteBlock}
              onDeleteTask={onDeleteTask}
              onDropTask={onDropTask}
              onMoveBlock={onMoveBlock}
              onResizeBlock={onResizeBlock}
              onMoveEvent={onMoveEvent}
              onResizeEvent={onResizeEvent}
              events={resolvedEvents}
              onDeleteEvent={onDeleteEvent}
              onDeleteEventSeries={onDeleteEventSeries}
              onCreateBlock={onCreateBlock}
              onEditEvent={onEditEvent}
              onEditBlock={onEditBlock}
            />
          )}
          {view === 'week' && (
            <WeekView
              mode={mode}
              timeBlocks={mainViewBlocks}
              currentDate={currentDate}
              selectedBlock={selectedBlock}
              onSelectBlock={setSelectedBlock}
              focusedCategoryId={focusedCategoryId}
              focusedCalendarId={focusedCalendarId}
              onConfirm={onConfirm}
              onSkip={onSkip}
              onUnconfirm={onUnconfirm}
              onDeleteBlock={onDeleteBlock}
              onDeleteTask={onDeleteTask}
              onDropTask={onDropTask}
              onMoveBlock={onMoveBlock}
              onResizeBlock={onResizeBlock}
              onMoveEvent={onMoveEvent}
              onResizeEvent={onResizeEvent}
              events={resolvedEvents}
              onDeleteEvent={onDeleteEvent}
              onDeleteEventSeries={onDeleteEventSeries}
              onCreateBlock={onCreateBlock}
              onEditEvent={onEditEvent}
              onEditBlock={onEditBlock}
              showDifferences={mode === 'compare' ? showDifferences : undefined}
            />
          )}
          {view === 'month' && (
            <MonthView
              mode={mode}
              timeBlocks={mainViewBlocks}
              currentDate={currentDate}
              selectedBlock={selectedBlock}
              onSelectBlock={setSelectedBlock}
              focusedCategoryId={focusedCategoryId}
              focusedCalendarId={focusedCalendarId}
              onSelectDate={(d) => { onSelectedDateChange?.(d); onViewChange('3day'); }}
              events={eventsProp}
            />
          )}
        </div>
      )}

      {/* Floating Add Button */}
      {onOpenAddModal && (
        <button
          type="button"
          onClick={() => onOpenAddModal('event')}
          className="absolute bottom-6 right-6 z-20 flex items-center justify-center shadow-lg transition-all active:scale-95"
          style={{
            width: 52, height: 52, borderRadius: '50%',
            backgroundColor: PRIMARY,
            boxShadow: '0 4px 16px rgba(141,162,134,0.45)',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#B3B46D')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = PRIMARY)}
          aria-label="Add task or event"
        >
          <PlusIcon className="h-6 w-6 text-white" />
        </button>
      )}
    </div>
  );
}
