import React from 'react';
import { createPortal } from 'react-dom';
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
import { DueBadge } from './DueBadge';
import { useNow, useNowFrozen } from '../contexts/NowContext';
import { activeDrag, registerDropZone, unregisterDropZone } from '../utils/dragState';
import { useStore } from '../store/useStore';
import { getEventSegmentsForDate } from '../utils/crossDateEvents';
import { computeOverlapTruncation, TruncationItem } from '../utils/overlapTruncation';

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
  hideTimeGutter?: boolean;
  panelLabel?: string;
  locked?: boolean;
  showDifferences?: boolean;
  /** When true, columns shrink to fit (no min-w-max, reduced column minWidth). Used in compare split. */
  compact?: boolean;
  /** When true, ThreeDayView doesn't scroll internally — parent handles scrolling. */
  disableScroll?: boolean;
  onToggleEventAttendance?: (eventId: string, status: 'attended' | 'not_attended' | undefined) => void;
  onRescheduleLater?: (blockId: string) => void;
  onAddTimeToComplete?: (blockId: string, minutes: number) => void;
  /** Preview rectangle for pending drag-create while AddModal is open. */
  pendingBlockPreview?: { date: string; startTime: string; endTime: string } | null;
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
  hideTimeGutter, panelLabel, locked, showDifferences, compact, disableScroll,
  onToggleEventAttendance, onRescheduleLater, onAddTimeToComplete, pendingBlockPreview,
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

  const nowCtx = useNow();
  const frozen = useNowFrozen();
  const [now, setNow] = React.useState(() => frozen ? nowCtx : new Date());
  React.useEffect(() => {
    if (frozen) { setNow(nowCtx); return; }
    const t = setInterval(() => {
      if (!document.hidden) setNow(new Date());
    }, 60_000);
    return () => clearInterval(t);
  }, [frozen, nowCtx]);

  const todayStr = getLocalDateString(now);
  const nowMins = now.getHours() * 60 + now.getMinutes();

  // Tasks due on visible dates
  const allTasks = useStore((s) => s.tasks);
  const dueTasksByDate = React.useMemo(() => {
    const map: Record<string, { title: string }[]> = {};
    for (const day of threeDays) {
      const ds = getLocalDateString(day);
      map[ds] = allTasks.filter((t) => t.dueDate === ds && t.status !== 'done' && t.status !== 'archived');
    }
    return map;
  }, [allTasks, threeDays]);

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
    const height = Math.max((duration / 60) * PX_PER_HOUR, 20);
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
  const [creatingBlock, setCreatingBlock] = React.useState<{ date: string; startMins: number; endMins: number; anchorMins: number } | null>(null);
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
        const anchor = prev.anchorMins;
        let startMins: number;
        let endMins: number;
        if (currentMins >= anchor) {
          startMins = anchor;
          endMins = Math.max(currentMins, anchor + MIN_CREATE_MINUTES);
        } else {
          startMins = currentMins;
          endMins = Math.max(anchor, currentMins + MIN_CREATE_MINUTES);
        }
        const next = { ...prev, startMins, endMins };
        creatingBlockRef.current = next;
        return next;
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

  // Track registered drop zone elements for cleanup
  const registeredGridsRef = React.useRef<Set<HTMLElement>>(new Set());
  React.useEffect(() => {
    return () => {
      for (const el of registeredGridsRef.current) unregisterDropZone(el);
      registeredGridsRef.current.clear();
    };
  }, []);

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

  // Event resize state
  const [resizingEvent, setResizingEvent] = React.useState<{
    event: ResolvedEvent; startClientY: number;
  } | null>(null);

  React.useEffect(() => {
    if (!resizingEvent || !onResizeEvent) return;
    const { event, startClientY } = resizingEvent;
    const minEndMins = parseTimeToMins(event.start) + SNAP_MINUTES;
    const onMove = (e: MouseEvent) => {
      const deltaMins = ((e.clientY - startClientY) / PX_PER_HOUR) * 60;
      let newEndMins = parseTimeToMins(event.end) + deltaMins;
      newEndMins = Math.round(newEndMins / SNAP_MINUTES) * SNAP_MINUTES;
      newEndMins = Math.max(minEndMins, newEndMins);
      onResizeEvent(event.id, { date: event.date, endTime: minsToTime(newEndMins) });
    };
    const onUp = () => setResizingEvent(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [resizingEvent, onResizeEvent]);

  return (
    <div className={compact ? 'min-w-0' : ''} style={{ backgroundColor: BG_CANVAS }}>
      {/* Sticky header row — stays pinned at top while calendar scrolls */}
      <div
        className="flex sticky top-0 z-20"
        style={{
          borderBottom: `1px solid ${GRID_HOUR}`,
          backgroundColor: BG_CANVAS,
        }}
      >
        {/* Time gutter spacer */}
        {!hideTimeGutter && (
          <div
            className="flex-shrink-0 flex items-center justify-center"
            style={{
              width: compact ? 40 : 52,
              height: 48,
              borderRight: `1px solid ${GRID_HOUR}`,
              backgroundColor: BG_CANVAS,
            }}
          >
            {panelLabel && (
              <span className="font-semibold uppercase" style={{ color: '#8E8E93', fontSize: '9px', letterSpacing: '0.1em' }}>
                {panelLabel}
              </span>
            )}
          </div>
        )}
        {/* Date headers */}
        <div className={`flex flex-1 ${compact ? 'min-w-0' : ''}`}>
          {threeDays.map((day, dayIndex) => {
            const today = isToday(day);
            const isWeekend = day.getDay() === 0 || day.getDay() === 6;
            return (
              <div
                key={dayIndex}
                className="flex-1 min-w-0 flex flex-col px-3"
                style={{
                  height: 48,
                  minWidth: compact ? 0 : 160,
                  borderRight: dayIndex < 2 ? `1px solid ${GRID_HOUR}` : 'none',
                  backgroundColor: today ? BG_TODAY : BG_CANVAS,
                  position: 'relative',
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
                {(() => {
                  const ds = getLocalDateString(day);
                  const due = dueTasksByDate[ds] || [];
                  return due.length > 0 ? (
                    <div style={{ position: 'absolute', bottom: 4, right: 8 }}>
                      <DueBadge tasks={due} />
                    </div>
                  ) : null;
                })()}
              </div>
            );
          })}
        </div>
      </div>

      {/* Body: time column + day grids (scrolls with parent) */}
      <div className={`flex ${compact ? 'min-w-0 w-full' : ''}`}>
        {/* Time column */}
        {!hideTimeGutter && (
          <div
            className="flex-shrink-0 py-2"
            style={{
              width: compact ? 40 : 52,
              borderRight: `1px solid ${GRID_HOUR}`,
              backgroundColor: BG_CANVAS,
            }}
          >
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
        <div className={`flex flex-1 ${compact ? 'min-w-0' : ''}`}>
          {threeDays.map((day, dayIndex) => {
            const dateStr = formatDate(day);
            const dayBlocks = timeBlocks.filter(b => b.date === dateStr);
            const dayEventSegments = getEventSegmentsForDate(events, dateStr);
            const today = isToday(day);
            const showCurrentTimeLine = today && currentTimeTop != null;

            return (
              <div
                key={dayIndex}
                className="flex-1 min-w-0 relative"
                style={{
                  minWidth: compact ? 0 : 160,
                  borderRight: dayIndex < 2 ? `1px solid ${GRID_HOUR}` : 'none',
                }}
              >
                {/* Grid */}
                <div data-3day-col={dateStr} className="px-1.5">
                  <div
                    data-3day-grid
                    className={`relative ${!locked && (onDropTask || onMoveBlock) ? 'cursor-copy' : !locked && onCreateBlock ? 'cursor-crosshair' : ''}`}
                    style={{ height: GRID_HEIGHT }}
                    ref={(el: HTMLDivElement | null) => {
                      if (!el || locked) return;
                      if (!onDropTask && !onMoveBlock && !onMoveEvent) return;
                      registeredGridsRef.current.add(el);
                      registerDropZone(el, {
                        onOver: (clientX: number, clientY: number) => {
                          if (!activeDrag.type) return;
                          const rect = el.getBoundingClientRect();
                          const offsetY = clientY - rect.top;
                          if (offsetY < 0 || offsetY > GRID_HEIGHT) return;
                          const startMins = offsetYToMinutes(offsetY);
                          const duration = activeDrag.duration > 0 ? activeDrag.duration : 15;
                          const color = activeDrag.color || BLOCK_PREVIEW.color;
                          if (color) setDragColor(color);
                          setDragPreviewType(activeDrag.type === 'event' ? 'event' : activeDrag.type === 'block' ? 'block' : 'task');
                          setDragPreview({ date: dateStr, startMins, endMins: startMins + duration });
                        },
                        onLeave: () => { setDragPreview(null); setDragColor(BLOCK_PREVIEW.color); },
                        onDrop: (clientX: number, clientY: number) => {
                          const { type: dt, id: did, duration: ddur } = activeDrag;
                          if (!dt || !did) return;
                          const rect = el.getBoundingClientRect();
                          const offsetY = clientY - rect.top;
                          const startMins = offsetYToMinutes(Math.max(0, Math.min(offsetY, GRID_HEIGHT)));
                          const dur = Math.max(15, ddur > 0 ? ddur : 15);
                          if (dt === 'block' && onMoveBlock) {
                            onMoveBlock(did, { date: dateStr, startTime: minsToTime(startMins), endTime: minsToTime(startMins + dur) });
                          } else if (dt === 'event' && onMoveEvent) {
                            onMoveEvent(did, { date: dateStr, startTime: minsToTime(startMins), endTime: minsToTime(startMins + dur) });
                          } else if (dt === 'task' && onDropTask) {
                            onDropTask(did, { date: dateStr, startTime: minsToTime(startMins), blockMinutes: dur });
                          }
                          setDragPreview(null); setDragColor(BLOCK_PREVIEW.color);
                        },
                      });
                    }}
                    onMouseDown={!locked && onCreateBlock ? (e: React.MouseEvent) => {
                      if (creatingBlock) return;
                      const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                      const offsetY = e.clientY - rect.top;
                      if (offsetY < 0 || offsetY > GRID_HEIGHT) return;
                      const startMins = offsetYToMinutes(offsetY);
                      setCreatingBlock({ date: dateStr, startMins, endMins: startMins + MIN_CREATE_MINUTES, anchorMins: startMins });
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

                    {/* Today bg stripe (green for today column) */}
                    {today && (
                      <div
                        className="absolute inset-0 pointer-events-none"
                        style={{ backgroundColor: BG_TODAY }}
                      />
                    )}

                    {/* Blocks and events */}
                    <div className="absolute left-0 right-0 top-0 pointer-events-none" style={{ minHeight: GRID_HEIGHT }}>
                      {(() => {
                        // Compute truncation FIRST so hidden items can be excluded from overlap layout
                        const dayTruncMap = new Map<string, { effectiveStart: string; effectiveEnd: string; hidden: boolean }>();
                        if (!locked) {
                          const isPast = (date: string, end: string) =>
                            date < todayStr || (date === todayStr && parseTimeToMins(end) <= nowMins);
                          const truncItems: TruncationItem[] = [
                            ...dayBlocks.filter((b) => isPast(dateStr, b.end)).map((b) => ({
                              id: b.id, start: b.start, end: b.end,
                              priority: b.editedAt ?? 0,
                            })),
                            ...dayEventSegments.filter((seg) => isPast(dateStr, seg.displayEnd)).map((seg) => ({
                              id: `event-${seg.event.id}`, start: seg.displayStart, end: seg.displayEnd,
                              priority: seg.event.editedAt ?? 0,
                            })),
                          ];
                          for (const r of computeOverlapTruncation(truncItems)) dayTruncMap.set(r.id, r);
                        }
                        // Overlap layout — excludes hidden items, uses effective (truncated) times
                        const allItems = [
                          ...dayBlocks
                            .filter((b) => !dayTruncMap.get(b.id)?.hidden)
                            .map((b) => {
                              const trunc = dayTruncMap.get(b.id);
                              return { id: b.id, start: trunc ? trunc.effectiveStart : b.start, end: trunc ? trunc.effectiveEnd : b.end };
                            }),
                          ...dayEventSegments
                            .filter((seg) => !dayTruncMap.get(`event-${seg.event.id}`)?.hidden)
                            .map((seg) => {
                              const trunc = dayTruncMap.get(`event-${seg.event.id}`);
                              return { id: `event-${seg.event.id}`, start: trunc ? trunc.effectiveStart : seg.displayStart, end: trunc ? trunc.effectiveEnd : seg.displayEnd };
                            }),
                        ];
                        const dayOverlapMap = computeOverlapLayout(allItems);
                        return (
                          <>
                            {dayBlocks.map((block) => {
                              const bTrunc = dayTruncMap.get(block.id);
                              const bStartMins = bTrunc && !bTrunc.hidden ? parseTimeToMins(bTrunc.effectiveStart) : parseTimeToMins(block.start);
                              const bEndMins = bTrunc && !bTrunc.hidden ? parseTimeToMins(bTrunc.effectiveEnd) : parseTimeToMins(block.end);
                              const bDuration = bEndMins - bStartMins;
                              const top = (bStartMins / 60) * PX_PER_HOUR;
                              const height = (bDuration / 60) * PX_PER_HOUR;
                              const layout = dayOverlapMap.get(block.id);
                              const bColWidth = layout ? 100 / layout.totalColumns : 100;
                              const leftPercent = layout ? layout.columnIndex * bColWidth : 0;
                              const isLastCol = !layout || layout.columnIndex === layout.totalColumns - 1;
                              const widthPercent = isLastCol && leftPercent + bColWidth > 92 ? 92 - leftPercent : bColWidth;
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
                                    ...(bTrunc?.hidden && !showDifferences ? { opacity: 0.15 } : {}),
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
                                  onResizeStart={!locked && onResizeBlock ? (blockId, e) => {
                                    const found = dayBlocks.find(b => b.id === blockId);
                                    if (found) setResizingBlock({ block: found, startClientY: e.clientY });
                                  } : undefined}
                                  locked={locked}
                                  showDifferences={showDifferences}
                                  compact
                                  view="3day"
                                  onRescheduleLater={onRescheduleLater}
                                  onAddTimeToComplete={onAddTimeToComplete}
                                />
                              );
                            })}
                            {dayEventSegments.map((seg) => {
                              const eTruncKey = `event-${seg.event.id}`;
                              const eTrunc = dayTruncMap.get(eTruncKey);
                              const startMinutes = eTrunc && !eTrunc.hidden ? parseTimeToMins(eTrunc.effectiveStart) : parseTimeToMins(seg.displayStart);
                              const endMinutes = eTrunc && !eTrunc.hidden ? parseTimeToMins(eTrunc.effectiveEnd) : parseTimeToMins(seg.displayEnd);
                              const duration = endMinutes - startMinutes;
                              const top = (startMinutes / 60) * PX_PER_HOUR;
                              const height = Math.max((duration / 60) * PX_PER_HOUR, 18);
                              const layout = dayOverlapMap.get(eTruncKey);
                              const eColWidth = layout ? 100 / layout.totalColumns : 100;
                              const leftPercent = layout ? layout.columnIndex * eColWidth : 0;
                              const isLastEvCol = !layout || layout.columnIndex === layout.totalColumns - 1;
                              const widthPercent = isLastEvCol && leftPercent + eColWidth > 92 ? 92 - leftPercent : eColWidth;
                              return (
                                <EventCard
                                  key={seg.event.id}
                                  event={seg.event}
                                  style={{
                                    top: `${top}px`,
                                    height: `${height}px`,
                                    width: `${widthPercent}%`,
                                    left: `${leftPercent}%`,
                                    ...(eTrunc?.hidden && !showDifferences ? { opacity: 0.15 } : {}),
                                  }}
                                  isSelected={currentSelected === `event-${seg.event.id}`}
                                  onSelect={() => handleSelect(`event-${seg.event.id}`)}
                                  onDeselect={() => handleSelect(null)}
                                  onDeleteEvent={onDeleteEvent}
                                  onDeleteEventSeries={onDeleteEventSeries}
                                  onEditEvent={onEditEvent}
                                  plannedStyle={false}
                                  draggable={!!onMoveEvent}
                                  onResizeStart={onResizeEvent && seg.isEndSegment ? (e) => setResizingEvent({ event: seg.event, startClientY: e.clientY }) : undefined}
                                  onToggleAttendance={onToggleEventAttendance}
                                  showDifferences={showDifferences}
                                  isStartSegment={seg.isStartSegment}
                                  isEndSegment={seg.isEndSegment}
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

                    {/* Pending create-block preview (portaled above modal backdrop) */}
                    {!creatingBlock && pendingBlockPreview && pendingBlockPreview.date === dateStr && (() => {
                      const pStartMins = parseTimeToMins(pendingBlockPreview.startTime);
                      const pEndMins = parseTimeToMins(pendingBlockPreview.endTime);
                      const gridEl = document.querySelector(`[data-3day-col="${dateStr}"] [data-3day-grid]`);
                      const rect = gridEl?.getBoundingClientRect();
                      if (!rect) return null;
                      const topPx = rect.top + (pStartMins / 60) * PX_PER_HOUR;
                      const heightPx = ((pEndMins - pStartMins) / 60) * PX_PER_HOUR;
                      return createPortal(
                        <div
                          className="pointer-events-none rounded-r-md overflow-hidden"
                          style={{
                            position: 'fixed',
                            zIndex: 51,
                            top: `${topPx}px`,
                            height: `${heightPx}px`,
                            left: `${rect.left}px`,
                            width: `${rect.width}px`,
                            backgroundColor: hexToRgba(BLOCK_PREVIEW.color, 0.18),
                            borderLeft: `3px solid ${hexToRgba(BLOCK_PREVIEW.color, 0.6)}`,
                            border: `1.5px dashed ${hexToRgba(BLOCK_PREVIEW.color, 0.45)}`,
                            borderLeftWidth: '3px',
                            borderLeftStyle: 'solid',
                          }}
                        >
                          <span
                            className="absolute bottom-0.5 left-2 font-medium truncate"
                            style={{ color: THEME.textPrimary, fontSize: '10px' }}
                          >
                            {minsToTime(pStartMins)}–{minsToTime(pEndMins)}
                          </span>
                        </div>,
                        document.body,
                      );
                    })()}
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
