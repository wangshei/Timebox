import React from 'react';
import { Mode } from '../types';
import { ResolvedTimeBlock, ResolvedEvent } from '../utils/dataResolver';
import { getLocalDateString, isTodayLocal } from '../utils/dateTime';
import { computeOverlapLayout } from '../utils/overlapLayout';
import { TimeBlockCard } from './TimeBlockCard';
import { EventCard } from './EventCard';
import {
  PX_PER_HOUR, SNAP_MINUTES,
  snapToGrid, minutesToTimeString as minsToTime, parseTimeToMins,
  offsetYToMinutes as offsetYToMinsUtil,
} from '../utils/gridUtils';
import type { DropTaskParams, CreateBlockParams } from './DayView';
import { BLOCK_PREVIEW, THEME } from '../constants/colors';
import { hexToRgba } from '../utils/color';
import { activeDrag } from '../utils/dragState';

interface ThreeDayViewProps {
  mode: Mode;
  timeBlocks: ResolvedTimeBlock[];
  /** The anchor date — view shows this date + next 2 days */
  currentDate: Date;
  selectedBlock?: string | null;
  onSelectBlock?: (id: string | null) => void;
  focusedCategoryId?: string | null;
  focusedCalendarId?: string | null;
  onConfirm?: (blockId: string) => void;
  onSkip?: (blockId: string) => void;
  onUnconfirm?: (blockId: string) => void;
  onDeleteBlock?: (blockId: string) => void;
  onDeleteTask?: (taskId: string) => void;
  onDropTask?: (taskId: string, params: DropTaskParams) => void;
  onMoveBlock?: (blockId: string, params: { date: string; startTime: string; endTime: string }) => void;
  onResizeBlock?: (blockId: string, params: { date: string; endTime: string }) => void;
  onMoveEvent?: (eventId: string, params: { date: string; startTime: string; endTime: string }) => void;
  onResizeEvent?: (eventId: string, params: { date: string; endTime: string }) => void;
  onEditEvent?: (eventId: string) => void;
  onEditBlock?: (blockId: string) => void;
  events?: ResolvedEvent[];
  onDeleteEvent?: (eventId: string) => void;
  onDeleteEventSeries?: (eventId: string, scope: 'this' | 'all' | 'all_after') => void;
  onCreateBlock?: (params: CreateBlockParams) => string | undefined;
  /** When true, hides the left 52px time gutter column (used for right panel in 3-day compare). */
  hideTimeGutter?: boolean;
  /** Optional label shown above day headers (e.g. "PLAN" or "ACTUAL"). */
  panelLabel?: string;
  /** When true, all block interactions are disabled (used for plan panel in compare mode). */
  locked?: boolean;
  /** When true, show difference highlights on blocks. */
  showDifferences?: boolean;
}

const PRIMARY = THEME.primary;
const GRID_HOUR = 'rgba(0,0,0,0.07)';
const GRID_HALF = 'rgba(0,0,0,0.035)';
const BG_CANVAS = '#FDFDFB';
const BG_TODAY = 'rgba(141,162,134,0.05)';

export function ThreeDayView({
  mode, timeBlocks, currentDate, selectedBlock, onSelectBlock,
  focusedCategoryId, focusedCalendarId, onConfirm, onSkip, onUnconfirm,
  onDeleteBlock, onDeleteTask, onDropTask, onMoveBlock, onResizeBlock,
  onMoveEvent, onResizeEvent, onEditEvent, onEditBlock,
  events = [], onDeleteEvent, onDeleteEventSeries, onCreateBlock,
  hideTimeGutter, panelLabel, locked, showDifferences,
}: ThreeDayViewProps) {
  const [localSelectedBlock, setLocalSelectedBlock] = React.useState<string | null>(selectedBlock || null);
  const handleSelect = onSelectBlock || setLocalSelectedBlock;
  const currentSelected = selectedBlock !== undefined ? selectedBlock : localSelectedBlock;

  const hours = React.useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);

  // Three days: anchor date + next 2
  const threeDays = React.useMemo(() => {
    return Array.from({ length: 3 }, (_, i) => {
      const d = new Date(currentDate);
      d.setDate(currentDate.getDate() + i);
      return d;
    });
  }, [currentDate]);

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

  const formatDate = (date: Date): string => getLocalDateString(date);
  const isToday = (date: Date): boolean => isTodayLocal(getLocalDateString(date));

  const getBlockStyle = (block: ResolvedTimeBlock) => {
    const startMinutes = parseTimeToMins(block.start);
    const endMinutes = parseTimeToMins(block.end);
    const duration = endMinutes - startMinutes;
    const top = ((startMinutes - START_HOUR * 60) / 60) * PX_PER_HOUR;
    const height = (duration / 60) * PX_PER_HOUR;
    return { top, height };
  };

  const currentTimeMinutes = now.getHours() * 60 + now.getMinutes();
  const currentTimeTopRaw =
    currentTimeMinutes >= 0 && currentTimeMinutes < 24 * 60
      ? ((currentTimeMinutes) / 60) * PX_PER_HOUR
      : null;
  const currentTimeTop =
    currentTimeTopRaw != null
      ? Math.max(0, Math.min(currentTimeTopRaw, GRID_HEIGHT - 2))
      : null;
  const currentTimeLabel = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  // Drag-to-create state
  const MIN_CREATE_MINUTES = 15;
  const [creatingBlock, setCreatingBlock] = React.useState<{ date: string; startMins: number; endMins: number } | null>(null);
  const creatingBlockRef = React.useRef(creatingBlock);
  React.useEffect(() => { creatingBlockRef.current = creatingBlock; }, [creatingBlock]);

  React.useEffect(() => {
    if (!creatingBlock) return;
    const gridEl = document.querySelector<HTMLDivElement>(`[data-3day-col="${creatingBlock.date}"] [data-3day-grid]`);
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

  // Drag preview
  const [dragPreview, setDragPreview] = React.useState<{ date: string; startMins: number; endMins: number } | null>(null);
  const [dragPreviewType, setDragPreviewType] = React.useState<'task' | 'block' | 'event'>('task');
  const [dragColor, setDragColor] = React.useState<string>(BLOCK_PREVIEW.color);

  // Resize state
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

  return (
    <div className="flex-1 overflow-auto" style={{ backgroundColor: BG_CANVAS }}>
      <div className="flex min-w-max">
        {/* Time column — hidden when hideTimeGutter is set (right panel in compare) */}
        {!hideTimeGutter && (
          <div
            className="flex-shrink-0 py-2 sticky left-0 z-10"
            style={{
              width: 52,
              borderRight: `1px solid ${GRID_HOUR}`,
              backgroundColor: BG_CANVAS,
            }}
          >
            {/* Spacer for day headers — shows panel label if provided */}
            <div
              className="flex items-center justify-center"
              style={{ height: 48 }}
            >
              {panelLabel && (
                <span
                  className="font-bold uppercase tracking-widest"
                  style={{ color: '#AEAEB2', fontSize: '9px', letterSpacing: '0.12em' }}
                >
                  {panelLabel}
                </span>
              )}
            </div>
            {hours.map((hour) => (
              <div key={hour} className="relative" style={{ height: PX_PER_HOUR + 'px' }}>
                <div
                  className="absolute w-full text-right font-medium"
                  style={{ right: 8, top: -7, color: '#AEAEB2', fontSize: '10px', letterSpacing: '-0.01em' }}
                >
                  {hour === 0 ? '12am' : hour === 12 ? '12pm' : hour > 12 ? `${hour - 12}pm` : `${hour}am`}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Three day columns */}
        <div className="flex flex-1">
          {threeDays.map((day, dayIndex) => {
            const dateStr = formatDate(day);
            const dayBlocks = timeBlocks.filter(b => b.date === dateStr);
            const dayEvents = events.filter(e => e.date === dateStr);
            const today = isToday(day);
            const showCurrentTimeLine = today && currentTimeTop != null;
            const isWeekend = day.getDay() === 0 || day.getDay() === 6;

            return (
              <div
                key={dayIndex}
                className="flex-1 relative"
                style={{
                  minWidth: 160,
                  borderRight: dayIndex < 2 ? `1px solid ${GRID_HOUR}` : 'none',
                }}
              >
                {/* Day header — prominent for today */}
                <div
                  className="sticky top-0 z-10 flex flex-col px-3"
                  style={{
                    height: 48,
                    borderBottom: `1px solid ${GRID_HOUR}`,
                    backgroundColor: today ? BG_TODAY : BG_CANVAS,
                  }}
                >
                  <div className="flex items-center gap-2 pt-2">
                    <div className="flex flex-col">
                      <div
                        className="font-semibold uppercase"
                        style={{
                          color: today ? PRIMARY : isWeekend ? '#AEAEB2' : '#C7C7CC',
                          fontSize: '10px',
                          letterSpacing: '0.08em',
                        }}
                      >
                        {day.toLocaleDateString('en-US', { weekday: 'short' })}
                      </div>
                      <div
                        className="font-bold leading-none"
                        style={{
                          color: today ? PRIMARY : isWeekend ? '#8E8E93' : '#3A3A3C',
                          fontSize: today ? 20 : 17,
                        }}
                      >
                        {day.getDate()}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Grid */}
                <div data-3day-col={dateStr} className="px-1.5">
                  <div
                    data-3day-grid
                    className={`relative ${!locked && (onDropTask || onMoveBlock) ? 'cursor-copy' : !locked && onCreateBlock ? 'cursor-crosshair' : ''}`}
                    style={{ height: GRID_HEIGHT }}
                    onDragOver={locked ? undefined : (e) => {
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
                      const duration = hasEvent
                        ? (activeDrag.type === 'event' && activeDrag.duration > 0 ? activeDrag.duration : 15)
                        : hasBlock
                          ? (activeDrag.type === 'block' || activeDrag.type === 'task' ? (activeDrag.duration || 15) : 15)
                          : (activeDrag.type === 'task' && activeDrag.duration > 0 ? activeDrag.duration : 15);
                      const color = activeDrag.color || BLOCK_PREVIEW.color;
                      if (color) setDragColor(color);
                      setDragPreviewType(hasEvent ? 'event' : hasBlock ? 'block' : 'task');
                      setDragPreview({ date: dateStr, startMins, endMins: startMins + duration });
                    }}
                    onDragLeave={locked ? undefined : (e) => {
                      const grid = e.currentTarget as HTMLDivElement;
                      const related = e.relatedTarget as Node | null;
                      if (!related || !grid.contains(related)) {
                        setDragPreview(null);
                        setDragColor(BLOCK_PREVIEW.color);
                      }
                    }}
                    onDrop={locked ? undefined : (e) => {
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
                      setDragColor(BLOCK_PREVIEW.color);
                    }}
                    onMouseDown={!locked && onCreateBlock ? (e: React.MouseEvent) => {
                      if (creatingBlock) return;
                      const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                      const offsetY = e.clientY - rect.top;
                      if (offsetY < 0 || offsetY > GRID_HEIGHT) return;
                      const startMins = offsetYToMinutes(offsetY);
                      setCreatingBlock({ date: dateStr, startMins, endMins: startMins + MIN_CREATE_MINUTES });
                    } : undefined}
                  >
                    {/* Grid lines */}
                    {hours.map((_, i) => (
                      <div
                        key={i}
                        className="absolute left-0 right-0 pointer-events-none"
                        style={{ top: i * PX_PER_HOUR, height: PX_PER_HOUR }}
                      >
                        <div className="absolute left-0 right-0 top-0 h-px" style={{ borderTop: `1px solid ${GRID_HOUR}` }} />
                        <div className="absolute left-0 right-0 h-px" style={{ top: PX_PER_HOUR / 2, borderTop: `1px solid ${GRID_HALF}` }} />
                      </div>
                    ))}

                    {/* Today bg stripe */}
                    {today && (
                      <div
                        className="absolute inset-0 pointer-events-none"
                        style={{ backgroundColor: BG_TODAY }}
                      />
                    )}

                    {/* Blocks and events */}
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
                              const leftPercent = layout ? layout.columnIndex * (100 / (layout.totalColumns || 1)) : 0;
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
                                  onSkip={onSkip}
                                  onUnconfirm={onUnconfirm}
                                  onEditBlock={onEditBlock}
                                  onDeleteBlock={onDeleteBlock}
                                  onDeleteTask={onDeleteTask}
                                  onResizeStart={onResizeBlock ? (blockId, e) => {
                                    const found = dayBlocks.find(b => b.id === blockId);
                                    if (found) setResizingBlock({ block: found, startClientY: e.clientY });
                                  } : undefined}
                                  compact
                                  view="3day"
                                  locked={locked}
                                  showDifferences={showDifferences}
                                />
                              );
                            })}
                            {dayEvents.map((event) => {
                              const startMinutes = parseTimeToMins(event.start);
                              const endMinutes = parseTimeToMins(event.end);
                              const duration = endMinutes - startMinutes;
                              const top = (startMinutes / 60) * PX_PER_HOUR;
                              const height = Math.max((duration / 60) * PX_PER_HOUR, 18);
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
                                  onDeleteEventSeries={onDeleteEventSeries}
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

                    {/* Current-time indicator */}
                    {showCurrentTimeLine && currentTimeTop != null && (
                      <>
                        <div
                          className="absolute left-0 right-0 z-30 pointer-events-none"
                          style={{
                            top: currentTimeTop,
                            height: 0,
                            width: '100%',
                            borderTop: `2px solid ${PRIMARY}`,
                          }}
                          aria-hidden
                        />
                        {/* Dot at the left edge */}
                        <div
                          className="absolute z-30 pointer-events-none"
                          style={{
                            top: currentTimeTop,
                            left: -4,
                            transform: 'translateY(-50%)',
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            backgroundColor: PRIMARY,
                          }}
                          aria-hidden
                        />
                        <div
                          className="absolute left-2 z-40 font-medium tabular-nums pointer-events-none"
                          style={{ top: currentTimeTop, transform: 'translateY(-50%)', color: PRIMARY, fontSize: '9px' }}
                        >
                          {currentTimeLabel}
                        </div>
                      </>
                    )}

                    {/* Drag preview — task-style (filled) or event-style (stripe) */}
                    {dragPreview && dragPreview.date === dateStr && (() => {
                      const isEventPreview = dragPreviewType === 'event';
                      return (
                        <div
                          className={`absolute left-0 right-0 z-30 pointer-events-none overflow-hidden ${isEventPreview ? 'rounded-r-md' : ''}`}
                          style={{
                            top: `${(dragPreview.startMins / 60) * PX_PER_HOUR}px`,
                            height: `${((dragPreview.endMins - dragPreview.startMins) / 60) * PX_PER_HOUR}px`,
                            ...(isEventPreview
                              ? {
                                  backgroundColor: hexToRgba(dragColor, BLOCK_PREVIEW.bgAlpha),
                                  borderLeft: `3px solid ${hexToRgba(dragColor, BLOCK_PREVIEW.stripeAlpha)}`,
                                  borderTop: '1px dashed rgba(0,0,0,0.08)',
                                  borderRight: '1px dashed rgba(0,0,0,0.08)',
                                  borderBottom: '1px dashed rgba(0,0,0,0.08)',
                                }
                              : {
                                  backgroundColor: '#FFF9EC',
                                  borderTop: `3px solid ${dragColor}`,
                                  borderLeft: `1px solid ${hexToRgba(dragColor, 0.22)}`,
                                  borderRight: `1px solid ${hexToRgba(dragColor, 0.22)}`,
                                  borderBottom: `1px solid ${hexToRgba(dragColor, 0.22)}`,
                                  borderRadius: 5,
                                  boxShadow: '0 2px 6px rgba(0,0,0,0.10)',
                                }),
                          }}
                        />
                      );
                    })()}

                    {/* Create-block preview — event-style (left stripe) */}
                    {creatingBlock && creatingBlock.date === dateStr && (
                      <div
                        className="absolute left-0 right-0 z-30 pointer-events-none rounded-r-md overflow-hidden"
                        style={{
                          top: `${(creatingBlock.startMins / 60) * PX_PER_HOUR}px`,
                          height: `${((creatingBlock.endMins - creatingBlock.startMins) / 60) * PX_PER_HOUR}px`,
                          backgroundColor: hexToRgba(BLOCK_PREVIEW.color, BLOCK_PREVIEW.bgAlpha),
                          borderLeft: `3px solid ${hexToRgba(BLOCK_PREVIEW.color, BLOCK_PREVIEW.stripeAlpha)}`,
                          borderTop: '1px dashed rgba(0,0,0,0.08)',
                          borderRight: '1px dashed rgba(0,0,0,0.08)',
                          borderBottom: '1px dashed rgba(0,0,0,0.08)',
                        }}
                      >
                        <span
                          className="absolute bottom-0.5 left-2 font-medium truncate"
                          style={{ color: THEME.textPrimary, fontSize: '10px' }}
                        >
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
