import React from 'react';
import { Mode } from '../types';
import { ResolvedTimeBlock, ResolvedEvent } from '../utils/dataResolver';
import { getLocalDateString, isTodayLocal } from '../utils/dateTime';
import { computeOverlapLayout } from '../utils/overlapLayout';
import { TimeBlockCard, RecordedBlockPayload } from './TimeBlockCard';
import { EventCard } from './EventCard';

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
  onEditEvent?: (eventId: string) => void;
  onEditBlock?: (blockId: string) => void;
  events?: ResolvedEvent[];
  onDeleteEvent?: (eventId: string) => void;
  onCreateBlock?: (params: { date: string; startTime: string; endTime: string }) => string | undefined;
}

export function WeekView({ mode, timeBlocks, currentDate, selectedBlock, onSelectBlock, focusedCategoryId, focusedCalendarId, onDoneAsPlanned, onDidSomethingElse, onDeleteBlock, onDeleteTask, onDropTask, onMoveBlock, onEditEvent, onEditBlock, events = [], onDeleteEvent, onCreateBlock }: WeekViewProps) {
  const [localSelectedBlock, setLocalSelectedBlock] = React.useState<string | null>(selectedBlock || null);
  const handleSelect = onSelectBlock || setLocalSelectedBlock;
  const currentSelected = selectedBlock !== undefined ? selectedBlock : localSelectedBlock;
  // 24-hour grid (12–12) like Day view for consistent scroll and behavior
  const hours = Array.from({ length: 24 }, (_, i) => i);

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

  const PX_PER_HOUR = 64;
  const START_HOUR = 0;
  const gridTopOffset = 0;
  const GRID_HEIGHT = 24 * PX_PER_HOUR;

  const snapToGrid = (totalMinutes: number) => Math.round(totalMinutes / 15) * 15;
  const offsetYToMinutes = (offsetY: number) => {
    const totalMinutes = START_HOUR * 60 + (offsetY / PX_PER_HOUR) * 60;
    return snapToGrid(totalMinutes);
  };
  const minsToTime = (mins: number) =>
    `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

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

                {/* Day grid: single relative container height GRID_HEIGHT; all layers share this coordinate system */}
                <div
                  data-week-day-col={dateStr}
                  className="px-1 md:px-2"
                  onDragOver={(e) => {
                    const hasTask = e.dataTransfer.types.includes('application/x-timebox-task-id');
                    const hasBlock = e.dataTransfer.types.includes('application/x-timebox-block-id');
                    if (!hasTask && !hasBlock) return;
                    if (hasTask && !onDropTask) return;
                    if (hasBlock && !onMoveBlock) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    const gridEl = (e.currentTarget as HTMLDivElement).querySelector<HTMLDivElement>('[data-week-grid]');
                    const rect = gridEl?.getBoundingClientRect();
                    if (!rect) return;
                    const offsetY = e.clientY - rect.top;
                    if (offsetY < 0 || offsetY > GRID_HEIGHT) return;
                    const startMins = offsetYToMinutes(offsetY);
                    const durationStr = hasBlock
                      ? e.dataTransfer.getData('application/x-timebox-block-duration')
                      : e.dataTransfer.getData('application/x-timebox-task-duration');
                    const duration = durationStr ? Math.max(15, parseInt(durationStr, 10)) : 60;
                    setDragPreview({ date: dateStr, startMins, endMins: startMins + duration });
                  }}
                  onDragLeave={() => setDragPreview(null)}
                  onDrop={(e) => {
                    const taskId = e.dataTransfer.getData('application/x-timebox-task-id');
                    const blockId = e.dataTransfer.getData('application/x-timebox-block-id');
                    if (!taskId && !blockId) return;
                    e.preventDefault();
                    const gridEl = (e.currentTarget as HTMLDivElement).querySelector<HTMLDivElement>('[data-week-grid]');
                    const rect = gridEl?.getBoundingClientRect();
                    if (!rect) return;
                    const offsetY = e.clientY - rect.top;
                    const startMins = offsetYToMinutes(Math.max(0, Math.min(offsetY, GRID_HEIGHT)));

                    if (blockId && onMoveBlock) {
                      const durStr = e.dataTransfer.getData('application/x-timebox-block-duration');
                      const dur = durStr ? Math.max(15, parseInt(durStr, 10)) : 60;
                      onMoveBlock(blockId, { date: dateStr, startTime: minsToTime(startMins), endTime: minsToTime(startMins + dur) });
                    } else if (taskId && onDropTask) {
                      const durStr = e.dataTransfer.getData('application/x-timebox-task-duration');
                      const dur = durStr ? Math.max(15, parseInt(durStr, 10)) : 60;
                      onDropTask(taskId, { date: dateStr, startTime: minsToTime(startMins), blockMinutes: dur });
                    }
                    setDragPreview(null);
                  }}
                >
                  <div
                    data-week-grid
                    className={`relative ${onCreateBlock ? 'cursor-crosshair' : ''}`}
                    style={{ height: GRID_HEIGHT }}
                    onMouseDown={onCreateBlock ? (e: React.MouseEvent) => {
                      if (creatingBlock) return;
                      const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                      const offsetY = e.clientY - rect.top;
                      if (offsetY < 0 || offsetY > GRID_HEIGHT) return;
                      const startMins = offsetYToMinutes(offsetY);
                      setCreatingBlock({ date: dateStr, startMins, endMins: startMins + MIN_CREATE_MINUTES });
                    } : undefined}
                  >
                    {/* Grid lines - pointer-events-none */}
                    {hours.map((_, i) => (
                      <div
                        key={i}
                        className="absolute left-0 right-0 border-t border-neutral-100 pointer-events-none"
                        style={{ top: i * PX_PER_HOUR, height: PX_PER_HOUR }}
                      />
                    ))}

                    {/* Time blocks + events - pointer-events-none so clicks pass to grid for drag-to-create */}
                    <div className="absolute left-0 right-0 top-0 pointer-events-none" style={{ minHeight: GRID_HEIGHT }}>
                      {(() => {
                        const allItems = [
                          ...dayBlocks.map((b) => ({ id: b.id, start: b.start, end: b.end })),
                          ...dayEvents.map((e) => ({ id: `event-${e.id}`, start: e.start, end: e.end })),
                        ];
                        const dayOverlapMap = computeOverlapLayout(allItems);
                        return (
                          <>
                            {dayBlocks.map((block) => {
                              const { top, height } = getBlockStyle(block);
                              const layout = dayOverlapMap.get(block.id);
                              const widthPercent = layout ? 100 / layout.totalColumns : 100;
                              const leftPercent = layout ? layout.columnIndex * widthPercent : 0;
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
                                  onSelect={() => handleSelect(block.id)}
                                  onDeselect={() => handleSelect(null)}
                                  focusedCategoryId={focusedCategoryId}
                                  focusedCalendarId={focusedCalendarId}
                                  onDoneAsPlanned={onDoneAsPlanned}
                                  onDidSomethingElse={onDidSomethingElse}
                                  onEditBlock={onEditBlock}
                                  onDeleteBlock={onDeleteBlock}
                                  onDeleteTask={onDeleteTask}
                                  compact
                                />
                              );
                            })}
                            {dayEvents.map((event) => {
                              const startMinutes = parseTime(event.start);
                              const endMinutes = parseTime(event.end);
                              const duration = endMinutes - startMinutes;
                              const top = ((startMinutes - START_HOUR * 60) / 60) * PX_PER_HOUR;
                              const height = Math.max((duration / 60) * PX_PER_HOUR, 16);
                              const layout = dayOverlapMap.get(`event-${event.id}`);
                              const widthPercent = layout ? 100 / layout.totalColumns : 100;
                              const leftPercent = layout ? layout.columnIndex * widthPercent : 0;
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
                        className="absolute left-0 right-0 top-0 z-30 pointer-events-none rounded border-2 border-dashed border-blue-400 bg-blue-100/50"
                        style={{
                          top: `${((dragPreview.startMins - START_HOUR * 60) / 60) * PX_PER_HOUR}px`,
                          height: `${((dragPreview.endMins - dragPreview.startMins) / 60) * PX_PER_HOUR}px`,
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