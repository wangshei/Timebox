import React from 'react';
import { Mode } from '../types';
import { ResolvedTimeBlock, ResolvedEvent } from '../utils/dataResolver';
import { getLocalDateString, isTodayLocal, getStartOfWeek } from '../utils/dateTime';
import { computeOverlapLayout } from '../utils/overlapLayout';
import { TimeBlockCard } from './TimeBlockCard';
import { EventCard } from './EventCard';
import {
  PX_PER_HOUR, SNAP_MINUTES,
  snapToGrid, minutesToTimeString as minsToTime, parseTimeToMins,
  offsetYToMinutes as offsetYToMinsUtil,
} from '../utils/gridUtils';
import { BLOCK_PREVIEW, THEME } from '../constants/colors';
import { hexToRgba } from '../utils/color';
import { activeDrag, registerDropZone, unregisterDropZone } from '../utils/dragState';
import { DueBadge } from './DueBadge';
import { useStore } from '../store/useStore';
import { getEventSegmentsForDate } from '../utils/crossDateEvents';
import { computeOverlapTruncation, TruncationItem } from '../utils/overlapTruncation';

interface WeekViewProps {
  mode: Mode;
  timeBlocks: ResolvedTimeBlock[];
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
  onDropTask?: (taskId: string, params: import('./DayView').DropTaskParams) => void;
  onMoveBlock?: (blockId: string, params: { date: string; startTime: string; endTime: string }) => void;
  onResizeBlock?: (blockId: string, params: { date: string; endTime: string }) => void;
  onMoveEvent?: (eventId: string, params: { date: string; startTime: string; endTime: string }) => void;
  onResizeEvent?: (eventId: string, params: { date: string; endTime: string }) => void;
  onEditEvent?: (eventId: string) => void;
  onEditBlock?: (blockId: string) => void;
  events?: ResolvedEvent[];
  onDeleteEvent?: (eventId: string) => void;
  onDeleteEventSeries?: (eventId: string, scope: 'this' | 'all' | 'all_after') => void;
  onCreateBlock?: (params: { date: string; startTime: string; endTime: string }) => string | undefined;
  locked?: boolean;
  showDifferences?: boolean;
  /** When true, week shows Mon–Sun; when false, Sun–Sat. */
  weekStartsOnMonday?: boolean;
  onToggleEventAttendance?: (eventId: string, status: 'attended' | 'not_attended' | undefined) => void;
  onRescheduleLater?: (blockId: string) => void;
  onAddTimeToComplete?: (blockId: string, minutes: number) => void;
  /** When set, blocks are in stamp mode — clicking stamps this emoji. */
  activeStampEmoji?: string | null;
}

export function WeekView({ mode, timeBlocks, currentDate, selectedBlock, onSelectBlock, focusedCategoryId, focusedCalendarId, onConfirm, onSkip, onUnconfirm, onDeleteBlock, onDeleteTask, onDropTask, onMoveBlock, onResizeBlock, onMoveEvent, onResizeEvent, onEditEvent, onEditBlock, events = [], onDeleteEvent, onDeleteEventSeries, onCreateBlock, locked, showDifferences, weekStartsOnMonday = false, onToggleEventAttendance, onRescheduleLater, onAddTimeToComplete, activeStampEmoji }: WeekViewProps) {
  const [localSelectedBlock, setLocalSelectedBlock] = React.useState<string | null>(selectedBlock || null);
  const handleSelect = onSelectBlock || setLocalSelectedBlock;
  const currentSelected = selectedBlock !== undefined ? selectedBlock : localSelectedBlock;
  const addStickerAction = useStore((s) => s.addSticker);
  const allStickers = useStore((s) => s.stickers);
  const deleteStickerAction = useStore((s) => s.deleteSticker);
  const [selectedStickerId, setSelectedStickerId] = React.useState<string | null>(null);
  const hours = React.useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);


  const weekDays = React.useMemo(() => {
    const startOfWeek = getStartOfWeek(currentDate, weekStartsOnMonday);
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(startOfWeek);
      day.setDate(startOfWeek.getDate() + i);
      return day;
    });
  }, [currentDate, weekStartsOnMonday]);

  // Tasks due on visible dates
  const allTasks = useStore((s) => s.tasks);
  const dueTasksByDate = React.useMemo(() => {
    const map: Record<string, { title: string }[]> = {};
    for (const day of weekDays) {
      const ds = getLocalDateString(day);
      map[ds] = allTasks.filter((t) => t.dueDate === ds && t.status !== 'done' && t.status !== 'archived');
    }
    return map;
  }, [allTasks, weekDays]);

  const getBlockStyle = (block: ResolvedTimeBlock) => {
    const startMinutes = parseTimeToMins(block.start);
    const endMinutes = parseTimeToMins(block.end);
    const duration = endMinutes - startMinutes;
    const top = ((startMinutes - START_HOUR * 60) / 60) * PX_PER_HOUR;
    const height = Math.max((duration / 60) * PX_PER_HOUR, 18);
    return { top, height };
  };

  const formatDate = (date: Date): string => getLocalDateString(date);

  const isToday = (date: Date): boolean => isTodayLocal(getLocalDateString(date));

  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const t = setInterval(() => {
      if (!document.hidden) setNow(new Date());
    }, 60_000);
    return () => clearInterval(t);
  }, []);

  const todayStr = getLocalDateString(now);
  const nowMins = now.getHours() * 60 + now.getMinutes();

  const START_HOUR = 0;
  const GRID_HEIGHT = 24 * PX_PER_HOUR;

  const offsetYToMinutes = (offsetY: number) => offsetYToMinsUtil(offsetY, PX_PER_HOUR);

  const [dragPreview, setDragPreview] = React.useState<{ date: string; startMins: number; endMins: number } | null>(null);

  // Track registered drop zone elements for cleanup
  const registeredGridsRef = React.useRef<Set<HTMLElement>>(new Set());
  React.useEffect(() => {
    return () => {
      for (const el of registeredGridsRef.current) unregisterDropZone(el);
      registeredGridsRef.current.clear();
    };
  }, []);

  // Drag-to-create state
  const MIN_CREATE_MINUTES = 15;
  const [creatingBlock, setCreatingBlock] = React.useState<{ date: string; startMins: number; endMins: number; anchorMins: number } | null>(null);
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
    <div style={{ backgroundColor: '#FDFDFB' }}>
      {/* Sticky header row — stays pinned at top while parent scrolls */}
      <div
        className="flex sticky top-0 z-20"
        style={{
          borderBottom: '1px solid rgba(0,0,0,0.07)',
          backgroundColor: '#FDFDFB',
        }}
      >
        {/* Time gutter spacer (matches time column width) */}
        <div
          className="flex-shrink-0"
          style={{
            width: 52,
            borderRight: '1px solid rgba(0,0,0,0.07)',
          }}
        />
        {/* Date headers */}
        <div className="flex flex-1">
            {weekDays.map((day, dayIndex) => {
              const today = isToday(day);
              return (
                <div
                  key={dayIndex}
                  className="flex-1 flex flex-col px-1.5 md:px-2"
                  style={{
                    height: 48,
                    minWidth: 90,
                    borderRight: dayIndex < 6 ? '1px solid rgba(0,0,0,0.06)' : 'none',
                    backgroundColor: today ? 'rgba(141,162,134,0.07)' : 'transparent',
                    position: 'relative',
                  }}
                >
                  <div className="flex items-center gap-1 pt-2">
                    <div className="flex flex-col gap-0.5">
                      <div className="font-semibold uppercase" style={{ color: today ? THEME.primary : THEME.textPlaceholder, fontSize: '9px', letterSpacing: '0.07em' }}>
                        {day.toLocaleDateString('en-US', { weekday: 'short' })}
                      </div>
                      <div className="font-semibold leading-none" style={{ color: today ? THEME.primary : THEME.textPrimary, fontSize: '14px' }}>
                        {day.getDate()}
                      </div>
                    </div>
                  </div>
                  {(() => {
                    const ds = getLocalDateString(day);
                    const due = dueTasksByDate[ds] || [];
                    return due.length > 0 ? (
                      <div style={{ position: 'absolute', bottom: 3, right: 4 }}>
                        <DueBadge tasks={due} compact />
                      </div>
                    ) : null;
                  })()}
                </div>
              );
            })}
        </div>
      </div>

      {/* Body: time column + day grids (scrolls with parent) */}
      <div className="flex">
        {/* Time column */}
        <div
          className="flex-shrink-0 py-2"
          style={{
            width: 52,
            borderRight: '1px solid rgba(0,0,0,0.07)',
            backgroundColor: '#FDFDFB',
          }}
        >
            {hours.map((hour) => (
              <div key={hour} className="relative" style={{ height: PX_PER_HOUR + 'px' }}>
                <div
                  className="absolute w-full text-right font-medium"
                  style={{
                    right: 8,
                    top: -7,
                    color: '#AEAEB2',
                    fontSize: '10px',
                    letterSpacing: '-0.01em',
                  }}
                >
                  {hour === 0 ? '12am' : hour === 12 ? '12pm' : hour > 12 ? `${hour - 12}pm` : `${hour}am`}
                </div>
              </div>
            ))}
        </div>

        {/* Day columns */}
        <div className="flex flex-1">
            {weekDays.map((day, dayIndex) => {
              const dateStr = formatDate(day);
              const dayBlocks = timeBlocks.filter(block => block.date === dateStr);
              const dayEventSegments = getEventSegmentsForDate(events, dateStr);
              const today = isToday(day);
              const showCurrentTimeLine = today && currentTimeTop != null;

              return (
                <div
                  key={dayIndex}
                  className="flex-1 min-w-[90px] md:min-w-0 relative"
                  style={{ borderRight: dayIndex < 6 ? '1px solid rgba(0,0,0,0.06)' : 'none' }}
                  data-week-day-col={dateStr}
                >
                  {/* Day grid */}
                  <div className="px-1 md:px-2">
                    <div
                      data-week-grid
                      className={`relative ${activeStampEmoji ? 'cursor-copy' : !locked && (onDropTask || onMoveBlock) ? 'cursor-copy' : !locked && onCreateBlock ? 'cursor-crosshair' : ''}`}
                      style={{ height: GRID_HEIGHT }}
                      ref={(el: HTMLDivElement | null) => {
                        if (!el || locked) return;
                        if (!onDropTask && !onMoveBlock && !onMoveEvent) return;
                        registeredGridsRef.current.add(el);
                        registerDropZone(el, {
                          onOver: (_: number, clientY: number) => {
                            if (!activeDrag.type) return;
                            const rect = el.getBoundingClientRect();
                            const offsetY = clientY - rect.top;
                            if (offsetY < 0 || offsetY > GRID_HEIGHT) return;
                            const startMins = offsetYToMinutes(offsetY);
                            const duration = activeDrag.duration > 0 ? activeDrag.duration : 15;
                            setDragPreview({ date: dateStr, startMins, endMins: startMins + duration });
                          },
                          onLeave: () => setDragPreview(null),
                          onDrop: (_: number, clientY: number) => {
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
                            setDragPreview(null);
                          },
                        });
                      }}
                      onMouseDown={activeStampEmoji ? (e: React.MouseEvent) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                        const offsetY = e.clientY - rect.top;
                        if (offsetY < 0 || offsetY > GRID_HEIGHT) return;
                        const timeMins = offsetYToMinutes(offsetY);
                        const xPercent = Math.max(5, Math.min(95, ((e.clientX - rect.left) / rect.width) * 100));
                        addStickerAction({
                          emoji: activeStampEmoji,
                          date: dateStr,
                          timeMinutes: timeMins,
                          offsetXPercent: xPercent,
                          offsetYPercent: 0,
                        });
                      } : !locked && onCreateBlock ? (e: React.MouseEvent) => {
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
                        <div key={i} className="absolute left-0 right-0 pointer-events-none" style={{ top: i * PX_PER_HOUR, height: PX_PER_HOUR }}>
                          <div className="absolute left-0 right-0 top-0 h-px" style={{ borderTop: '1px solid rgba(0,0,0,0.07)' }} />
                          <div className="absolute left-0 right-0 h-px" style={{ top: PX_PER_HOUR / 2, borderTop: '1px solid rgba(0,0,0,0.035)' }} />
                        </div>
                      ))}

                      {/* Blocks + events */}
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
                          const dayTimeStickers = allStickers.filter((s) => s.date === dateStr && !s.blockId && !s.eventId);
                          return (
                            <>
                              {/* Time-anchored stickers */}
                              {dayTimeStickers.map((sticker) => {
                                const sTop = ((sticker.timeMinutes ?? 0) / 60) * PX_PER_HOUR;
                                return (
                                  <span
                                    key={sticker.id}
                                    className="absolute z-20 select-none pointer-events-auto cursor-pointer"
                                    style={{
                                      left: `${sticker.offsetXPercent ?? 50}%`,
                                      top: `${sTop}px`,
                                      transform: 'translate(-50%, -50%)',
                                      fontSize: 14,
                                      lineHeight: 1,
                                      filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.12))',
                                      transition: 'transform 0.1s',
                                    }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      e.preventDefault();
                                      deleteStickerAction(sticker.id);
                                    }}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = 'translate(-50%, -50%) scale(1.2)'; }}
                                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = 'translate(-50%, -50%)'; }}
                                  >
                                    {sticker.emoji}
                                  </span>
                                );
                              })}
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
                                    style={{ top: `${top}px`, height: `${height}px`, width: `${widthPercent}%`, left: `${leftPercent}%`, ...(bTrunc?.hidden ? { opacity: 0.15 } : {}) }}
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
                                    view="week"
                                    onRescheduleLater={onRescheduleLater}
                                    onAddTimeToComplete={onAddTimeToComplete}
                                    activeStampEmoji={activeStampEmoji}
                                  />
                                );
                              })}
                              {dayEventSegments.map((seg) => {
                                const eTruncKey = `event-${seg.event.id}`;
                                const eTrunc = dayTruncMap.get(eTruncKey);
                                const startMinutes = eTrunc && !eTrunc.hidden ? parseTimeToMins(eTrunc.effectiveStart) : parseTimeToMins(seg.displayStart);
                                const endMinutes = eTrunc && !eTrunc.hidden ? parseTimeToMins(eTrunc.effectiveEnd) : parseTimeToMins(seg.displayEnd);
                                const duration = endMinutes - startMinutes;
                                const top = ((startMinutes - START_HOUR * 60) / 60) * PX_PER_HOUR;
                                const height = Math.max((duration / 60) * PX_PER_HOUR, 16);
                                const layout = dayOverlapMap.get(eTruncKey);
                                const eColWidth = layout ? 100 / layout.totalColumns : 100;
                                const leftPercent = layout ? layout.columnIndex * eColWidth : 0;
                                const isLastEvCol = !layout || layout.columnIndex === layout.totalColumns - 1;
                                const widthPercent = isLastEvCol && leftPercent + eColWidth > 92 ? 92 - leftPercent : eColWidth;
                                return (
                                  <EventCard
                                    key={seg.event.id}
                                    event={seg.event}
                                    style={{ top: `${top}px`, height: `${height}px`, width: `${widthPercent}%`, left: `${leftPercent}%`, ...(eTrunc?.hidden ? { opacity: 0.15 } : {}) }}
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
                                    compact={true}
                                    activeStampEmoji={activeStampEmoji}
                                  />
                                );
                              })}
                            </>
                          );
                        })()}
                      </div>

                      {/* Current time indicator */}
                      {showCurrentTimeLine && currentTimeTop != null && (
                        <>
                          <div className="absolute left-0 right-0 z-30 pointer-events-none" style={{ top: currentTimeTop, height: 0, width: '100%', borderTop: `2px solid ${THEME.primary}` }} aria-hidden />
                          <div className="absolute left-1 z-40 font-medium tabular-nums pointer-events-none" style={{ top: currentTimeTop, transform: 'translateY(-50%)', color: THEME.primary, fontSize: '9px' }}>
                            {currentTimeLabel}
                          </div>
                        </>
                      )}

                      {/* Drag preview */}
                      {dragPreview && dragPreview.date === dateStr && (
                        <div
                          className="absolute left-0 right-0 top-0 z-30 pointer-events-none rounded-r rounded-l overflow-hidden"
                          style={{
                            top: `${((dragPreview.startMins - START_HOUR * 60) / 60) * PX_PER_HOUR}px`,
                            height: `${((dragPreview.endMins - dragPreview.startMins) / 60) * PX_PER_HOUR}px`,
                            backgroundColor: hexToRgba(BLOCK_PREVIEW.color, BLOCK_PREVIEW.bgAlpha),
                            borderLeft: `4px solid ${hexToRgba(BLOCK_PREVIEW.color, BLOCK_PREVIEW.stripeAlpha)}`,
                            borderTop: '1px dashed rgba(0,0,0,0.08)',
                            borderRight: '1px dashed rgba(0,0,0,0.08)',
                            borderBottom: '1px dashed rgba(0,0,0,0.08)',
                          }}
                        />
                      )}

                      {/* Create-block preview */}
                      {creatingBlock && creatingBlock.date === dateStr && (
                        <div
                          className="absolute left-0 right-0 top-0 z-30 pointer-events-none rounded-r rounded-l overflow-hidden"
                          style={{
                            top: `${((creatingBlock.startMins - START_HOUR * 60) / 60) * PX_PER_HOUR}px`,
                            height: `${((creatingBlock.endMins - creatingBlock.startMins) / 60) * PX_PER_HOUR}px`,
                            backgroundColor: hexToRgba(BLOCK_PREVIEW.color, BLOCK_PREVIEW.bgAlpha),
                            borderLeft: `4px solid ${hexToRgba(BLOCK_PREVIEW.color, BLOCK_PREVIEW.stripeAlpha)}`,
                            borderTop: '1px dashed rgba(0,0,0,0.08)',
                            borderRight: '1px dashed rgba(0,0,0,0.08)',
                            borderBottom: '1px dashed rgba(0,0,0,0.08)',
                          }}
                        >
                          <span className="absolute bottom-0.5 left-1 font-medium truncate" style={{ color: THEME.textPrimary, fontSize: '10px' }}>
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