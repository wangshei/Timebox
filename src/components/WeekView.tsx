import React from 'react';
import { Mode } from '../types';
import { ResolvedTimeBlock, ResolvedEvent } from '../utils/dataResolver';
import { getLocalDateString, isTodayLocal } from '../utils/dateTime';
import { computeOverlapLayout } from '../utils/overlapLayout';
import { TimeBlockCard } from './TimeBlockCard';
import { EventCard } from './EventCard';
import {
  PX_PER_HOUR, SNAP_MINUTES, TASK_BLOCK_WIDTH_PERCENT,
  snapToGrid, minutesToTimeString as minsToTime, parseTimeToMins,
  offsetYToMinutes as offsetYToMinsUtil,
} from '../utils/gridUtils';

interface WeekViewProps {
  mode: Mode;
  timeBlocks: ResolvedTimeBlock[];
  currentDate: Date;
  selectedBlock?: string | null;
  onSelectBlock?: (id: string | null) => void;
  focusedCategoryId?: string | null;
  focusedCalendarId?: string | null;
  onConfirm?: (blockId: string) => void;
  onUnconfirm?: (blockId: string) => void;
  onDeleteBlock?: (blockId: string) => void;
  onDeleteTask?: (taskId: string) => void;
  onDropTask?: (taskId: string, params: import('./DayView').DropTaskParams) => void;
  onMoveBlock?: (blockId: string, params: { date: string; startTime: string; endTime: string }) => void;
  onResizeBlock?: (blockId: string, params: { date: string; endTime: string }) => void;
  onMoveEvent?: (eventId: string, params: { date: string; startTime: string; endTime: string }) => void;
  onResizeEvent?: (eventId: string, params: { date: string; endTime: string }) => void;
  onEditEvent?: (eventId: string) => void;
  onEditBlock?: (blockId: string) => void;
  events?: ResolvedEvent[];
  onDeleteEvent?: (eventId: string) => void;
  onCreateBlock?: (params: { date: string; startTime: string; endTime: string }) => string | undefined;
}

export function WeekView({ mode, timeBlocks, currentDate, selectedBlock, onSelectBlock, focusedCategoryId, focusedCalendarId, onConfirm, onUnconfirm, onDeleteBlock, onDeleteTask, onDropTask, onMoveBlock, onResizeBlock, onMoveEvent, onResizeEvent, onEditEvent, onEditBlock, events = [], onDeleteEvent, onCreateBlock }: WeekViewProps) {
  const [localSelectedBlock, setLocalSelectedBlock] = React.useState<string | null>(selectedBlock || null);
  const handleSelect = onSelectBlock || setLocalSelectedBlock;
  const currentSelected = selectedBlock !== undefined ? selectedBlock : localSelectedBlock;
  const hours = React.useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);

  const weekDays = React.useMemo(() => {
    const startOfWeek = new Date(currentDate);
    startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(startOfWeek);
      day.setDate(startOfWeek.getDate() + i);
      return day;
    });
  }, [currentDate]);

  const getBlockStyle = (block: ResolvedTimeBlock) => {
    const startMinutes = parseTimeToMins(block.start);
    const endMinutes = parseTimeToMins(block.end);
    const duration = endMinutes - startMinutes;
    const top = ((startMinutes - START_HOUR * 60) / 60) * PX_PER_HOUR;
    const height = (duration / 60) * PX_PER_HOUR;
    return { top, height };
  };

  const formatDate = (date: Date): string => getLocalDateString(date);

  const isToday = (date: Date): boolean => isTodayLocal(getLocalDateString(date));

  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const todayStr = getLocalDateString(now);
  const nowMins = now.getHours() * 60 + now.getMinutes();

  const START_HOUR = 0;
  const GRID_HEIGHT = 24 * PX_PER_HOUR;

  const offsetYToMinutes = (offsetY: number) => offsetYToMinsUtil(offsetY, PX_PER_HOUR);

  const [dragPreview, setDragPreview] = React.useState<{ date: string; startMins: number; endMins: number } | null>(null);

  // Drag-to-create state
  const MIN_CREATE_MINUTES = 15;
  const [creatingBlock, setCreatingBlock] = React.useState<{ date: string; startMins: number; endMins: number } | null>(null);
  const creatingBlockRef = React.useRef(creatingBlock);
  React.useEffect(() => { creatingBlockRef.current = creatingBlock; }, [creatingBlock]);

  React.useEffect(() => {
    if (!creatingBlock) return;
    const gridEl = document.querySelector<HTMLDivElement>(`[data-week-day-col="${creatingBlock.date}"] [data-week-grid]`);
    if (!gridEl) return;
    const onMove = (e: MouseEvent) => {
      const rect = gridEl.getBoundingClientRect();
      const offsetY = e.clientY - rect.top;
      const currentMins = offsetYToMinutes(Math.max(0, Math.min(offsetY, GRID_HEIGHT)));
      setCreatingBlock((prev) => {
        if (!prev) return null;
        const endMins = Math.max(currentMins, prev.startMins + MIN_CREATE_MINUTES);
        creatingBlockRef.current = { ...prev, endMins };
        return { ...prev, endMins };
      });
    };
    const onUp = () => {
      const cur = creatingBlockRef.current ?? creatingBlock;
      setCreatingBlock(null);
      creatingBlockRef.current = null;
      if (!cur || !onCreateBlock) return;
      onCreateBlock({ date: cur.date, startTime: minsToTime(cur.startMins), endTime: minsToTime(cur.endMins) });
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [creatingBlock, onCreateBlock]);

  const [resizingBlock, setResizingBlock] = React.useState<{
    block: ResolvedTimeBlock; startClientY: number;
  } | null>(null);

  React.useEffect(() => {
    if (!resizingBlock || !onResizeBlock) return;
    const { block, startClientY } = resizingBlock;
    const minEndMins = parseTimeToMins(block.start) + SNAP_MINUTES;
    const onMove = (e: MouseEvent) => {
      const deltaMins = ((e.clientY - startClientY) / PX_PER_HOUR) * 60;
      let newEndMins = parseTimeToMins(block.end) + deltaMins;
      newEndMins = Math.round(newEndMins / SNAP_MINUTES) * SNAP_MINUTES;
      newEndMins = Math.max(minEndMins, newEndMins);
      onResizeBlock(block.id, { date: block.date, endTime: minsToTime(newEndMins) });
    };
    const onUp = () => setResizingBlock(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [resizingBlock, onResizeBlock]);

  const currentTimeMinutes = now.getHours() * 60 + now.getMinutes();
  const currentTimeTopRaw =
    currentTimeMinutes >= START_HOUR * 60 && currentTimeMinutes < 24 * 60
      ? ((currentTimeMinutes - START_HOUR * 60) / 60) * PX_PER_HOUR
      : null;
  const currentTimeTop =
    currentTimeTopRaw != null
      ? Math.max(0, Math.min(currentTimeTopRaw, GRID_HEIGHT - 2))
      : null;
  const currentTimeLabel = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  return (
    <div className="flex-1 overflow-auto">
      <div className="flex min-w-max">
        {/* Time column */}
        <div className="w-12 md:w-16 flex-shrink-0 border-r border-neutral-200 px-1 md:px-2 py-4 md:py-6 sticky left-0 bg-white z-10">
          <div className="h-10 md:h-12" /> {/* Spacer for day headers */}
          {hours.map((hour) => (
            <div key={hour} className="relative" style={{ height: PX_PER_HOUR + 'px' }}>
              <div className="absolute left-0 top-0 w-full text-xs text-neutral-400 text-right pr-1 md:pr-2">
                {hour === 0 ? '12AM' : hour === 12 ? '12PM' : hour > 12 ? `${hour - 12}PM` : `${hour}AM`}
              </div>
            </div>
          ))}
        </div>

        {/* Days columns */}
        <div className="flex flex-1">
          {weekDays.map((day, dayIndex) => {
            const dateStr = formatDate(day);
            const dayBlocks = timeBlocks.filter(block => block.date === dateStr);
            const dayEvents = events.filter(e => e.date === dateStr);
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

                {/* Day grid: drop target on the grid itself so drag-from-sidebar lands correctly */}
                <div data-week-day-col={dateStr} className="px-1 md:px-2">
                  <div
                    data-week-grid
                    className={`relative ${onDropTask || onMoveBlock ? 'cursor-copy' : onCreateBlock ? 'cursor-crosshair' : ''}`}
                    style={{ height: GRID_HEIGHT }}
                    onDragOver={(e) => {
                      const hasTask = e.dataTransfer.types.includes('application/x-timebox-task-id');
                      const hasBlock = e.dataTransfer.types.includes('application/x-timebox-block-id');
                      const hasEvent = e.dataTransfer.types.includes('application/x-timebox-event-id');
                      if (!hasTask && !hasBlock && !hasEvent) return;
                      if (hasTask && !onDropTask) return;
                      if (hasBlock && !onMoveBlock) return;
                      if (hasEvent && !onMoveEvent) return;
                      e.preventDefault();
                      e.stopPropagation();
                      e.dataTransfer.dropEffect = hasBlock || hasEvent ? 'move' : 'copy';
                      const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                      const offsetY = e.clientY - rect.top;
                      if (offsetY < 0 || offsetY > GRID_HEIGHT) return;
                      const startMins = offsetYToMinutes(offsetY);
                      const durationStr = hasEvent
                        ? e.dataTransfer.getData('application/x-timebox-event-duration')
                        : hasBlock
                          ? e.dataTransfer.getData('application/x-timebox-block-duration')
                          : e.dataTransfer.getData('application/x-timebox-task-duration');
                      const duration = durationStr ? Math.max(15, parseInt(durationStr, 10)) : 15;
                      setDragPreview({ date: dateStr, startMins, endMins: startMins + duration });
                    }}
                    onDragLeave={(e) => {
                      const grid = e.currentTarget as HTMLDivElement;
                      const related = e.relatedTarget as Node | null;
                      if (!related || !grid.contains(related)) setDragPreview(null);
                    }}
                    onDrop={(e) => {
                      const taskId = e.dataTransfer.getData('application/x-timebox-task-id');
                      const blockId = e.dataTransfer.getData('application/x-timebox-block-id');
                      const eventId = e.dataTransfer.getData('application/x-timebox-event-id');
                      if (!taskId && !blockId && !eventId) return;
                      e.preventDefault();
                      e.stopPropagation();
                      const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                      const offsetY = e.clientY - rect.top;
                      const startMins = offsetYToMinutes(Math.max(0, Math.min(offsetY, GRID_HEIGHT)));

                      if (blockId && onMoveBlock) {
                        const durStr = e.dataTransfer.getData('application/x-timebox-block-duration');
                        const dur = durStr ? Math.max(15, parseInt(durStr, 10)) : 15;
                        onMoveBlock(blockId, { date: dateStr, startTime: minsToTime(startMins), endTime: minsToTime(startMins + dur) });
                      } else if (eventId && onMoveEvent) {
                        const durStr = e.dataTransfer.getData('application/x-timebox-event-duration');
                        const dur = durStr ? Math.max(15, parseInt(durStr, 10)) : 15;
                        onMoveEvent(eventId, { date: dateStr, startTime: minsToTime(startMins), endTime: minsToTime(startMins + dur) });
                      } else if (taskId && onDropTask) {
                        const durStr = e.dataTransfer.getData('application/x-timebox-task-duration');
                        const dur = durStr ? Math.max(15, parseInt(durStr, 10)) : 15;
                        onDropTask(taskId, { date: dateStr, startTime: minsToTime(startMins), blockMinutes: dur });
                      }
                      setDragPreview(null);
                    }}
                    onMouseDown={onCreateBlock ? (e: React.MouseEvent) => {
                      if (creatingBlock) return;
                      const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                      const offsetY = e.clientY - rect.top;
                      if (offsetY < 0 || offsetY > GRID_HEIGHT) return;
                      const startMins = offsetYToMinutes(offsetY);
                      setCreatingBlock({ date: dateStr, startMins, endMins: startMins + MIN_CREATE_MINUTES });
                    } : undefined}
                  >
                    {/* Grid lines: hour (strong), half-hour (subtle) */}
                    {hours.map((_, i) => (
                      <div
                        key={i}
                        className="absolute left-0 right-0 pointer-events-none"
                        style={{ top: i * PX_PER_HOUR, height: PX_PER_HOUR }}
                      >
                        <div className="absolute left-0 right-0 top-0 border-t border-neutral-200 h-px" />
                        <div className="absolute left-0 right-0 border-t border-neutral-100 h-px" style={{ top: PX_PER_HOUR / 2 }} />
                      </div>
                    ))}

                    {/* Time blocks (tasks = slimmer left-aligned; event-type = overlap) + events */}
                    <div className="absolute left-0 right-0 top-0 pointer-events-none" style={{ minHeight: GRID_HEIGHT }}>
                      {(() => {
                        const eventLikeItems = [
                          ...dayBlocks.filter((b) => !b.taskId).map((b) => ({ id: b.id, start: b.start, end: b.end })),
                          ...dayEvents.map((e) => ({ id: `event-${e.id}`, start: e.start, end: e.end })),
                        ];
                        const dayOverlapMap = computeOverlapLayout(eventLikeItems);
                        return (
                          <>
                            {dayBlocks.map((block) => {
                              const { top, height } = getBlockStyle(block);
                              const isTask = !!block.taskId;
                              const layout = dayOverlapMap.get(block.id);
                              const widthPercent = isTask
                                ? TASK_BLOCK_WIDTH_PERCENT
                                : layout
                                  ? 100 / layout.totalColumns
                                  : 100;
                              const leftPercent = isTask ? 0 : layout ? layout.columnIndex * (100 / (layout.totalColumns || 1)) : 0;
                              return (
                                <TimeBlockCard
                                  key={block.id}
                                  block={block}
                                  mode={mode}
                                  style={{
                                    top: `${top}px`,
                                    height: `${height}px`,
                                    width: `${widthPercent}%`,
                                    left: `${leftPercent}%`,
                                  }}
                                  isSelected={currentSelected === block.id}
                                  onSelectBlock={handleSelect}
                                  todayStr={todayStr}
                                  nowMins={nowMins}
                                  focusedCategoryId={focusedCategoryId}
                                  focusedCalendarId={focusedCalendarId}
                                  onConfirm={onConfirm}
                                  onUnconfirm={onUnconfirm}
                                  onEditBlock={onEditBlock}
                                  onDeleteBlock={onDeleteBlock}
                                  onDeleteTask={onDeleteTask}
                                  onResizeStart={onResizeBlock ? (blockId, e) => {
                                    const found = dayBlocks.find(b => b.id === blockId);
                                    if (found) setResizingBlock({ block: found, startClientY: e.clientY });
                                  } : undefined}
                                  compact
                                />
                              );
                            })}
                            {dayEvents.map((event) => {
                              const startMinutes = parseTimeToMins(event.start);
                              const endMinutes = parseTimeToMins(event.end);
                              const duration = endMinutes - startMinutes;
                              const top = ((startMinutes - START_HOUR * 60) / 60) * PX_PER_HOUR;
                              const height = Math.max((duration / 60) * PX_PER_HOUR, 16);
                              const layout = dayOverlapMap.get(`event-${event.id}`);
                              const widthPercent = layout ? 100 / layout.totalColumns : 100;
                              const leftPercent = layout ? layout.columnIndex * (100 / (layout.totalColumns || 1)) : 0;
                              return (
                                <EventCard
                                  key={event.id}
                                  event={event}
                                  style={{
                                    top: `${top}px`,
                                    height: `${height}px`,
                                    width: `${widthPercent}%`,
                                    left: `${leftPercent}%`,
                                  }}
                                  isSelected={currentSelected === `event-${event.id}`}
                                  onSelect={() => handleSelect(`event-${event.id}`)}
                                  onDeselect={() => handleSelect(null)}
                                  onDeleteEvent={onDeleteEvent}
                                  onEditEvent={onEditEvent}
                                  plannedStyle={false}
                                  draggable={!!onMoveEvent}
                                />
                              );
                            })}
                          </>
                        );
                      })()}
                    </div>

                    {/* Current-time indicator: two independent layers — full-width line (single div) + time label */}
                    {showCurrentTimeLine && currentTimeTop != null && (
                      <>
                        <div
                          className="absolute left-0 right-0 z-30 pointer-events-none"
                          style={{
                            top: currentTimeTop,
                            height: 0,
                            width: '100%',
                            borderTop: '3px solid rgb(239 68 68)',
                          }}
                          aria-hidden
                        />
                        <div
                          className="absolute left-2 z-40 text-red-500 text-xs font-medium tabular-nums pointer-events-none"
                          style={{ top: currentTimeTop, transform: 'translateY(-50%)' }}
                        >
                          {currentTimeLabel}
                        </div>
                      </>
                    )}

                    {/* Drag preview (drop), z-30 */}
                    {dragPreview && dragPreview.date === dateStr && (
                      <div
                        className="absolute left-0 right-0 top-0 z-30 pointer-events-none rounded border-2 border-dashed"
                        style={{
                          top: `${((dragPreview.startMins - START_HOUR * 60) / 60) * PX_PER_HOUR}px`,
                          height: `${((dragPreview.endMins - dragPreview.startMins) / 60) * PX_PER_HOUR}px`,
                          backgroundColor: 'rgba(59, 130, 246, 0.2)',
                          borderColor: 'rgb(59, 130, 246)',
                        }}
                      />
                    )}

                    {/* Create-block preview, z-30 */}
                    {creatingBlock && creatingBlock.date === dateStr && (
                      <div
                        className="absolute left-0 right-0 top-0 z-30 pointer-events-none rounded border-2 border-dashed border-blue-500 bg-blue-200/40"
                        style={{
                          top: `${((creatingBlock.startMins - START_HOUR * 60) / 60) * PX_PER_HOUR}px`,
                          height: `${((creatingBlock.endMins - creatingBlock.startMins) / 60) * PX_PER_HOUR}px`,
                        }}
                      >
                        <span className="absolute bottom-0.5 left-1 text-xs font-medium text-blue-800 truncate">
                          {minsToTime(creatingBlock.startMins)}–{minsToTime(creatingBlock.endMins)}
                        </span>
                      </div>
                    )}
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