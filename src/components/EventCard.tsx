import React, { useState, useRef, useLayoutEffect, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { TrashIcon, CalendarIcon, ClockIcon, PencilIcon, ArrowPathIcon } from '@heroicons/react/24/solid';
import { ResolvedEvent } from '../utils/dataResolver';
import type { RecurrencePattern } from '../types';
import { cn } from './ui/utils';
import { getTextClassForBackground, getContrastTextColor, hexToRgba, desaturate, lighten } from '../utils/color';
import { getLocalDateString } from '../utils/dateTime';
import { THEME } from '../constants/colors';
import { Chip } from './ui/chip';
import { activeDrag } from '../utils/dragState';

const POPOVER_WIDTH = 224;
const POPOVER_MAX_HEIGHT = 420;
const GAP = 8;

function patternLabel(pattern: RecurrencePattern | undefined): string {
  switch (pattern) {
    case 'daily': return 'Daily';
    case 'every_other_day': return 'Every other day';
    case 'weekly': return 'Weekly';
    case 'monthly': return 'Monthly';
    case 'custom': return 'Custom days';
    default: return 'Recurring';
  }
}

interface EventCardProps {
  key?: React.Key;
  event: ResolvedEvent;
  style: React.CSSProperties;
  isSelected: boolean;
  onSelect: () => void;
  onDeselect: () => void;
  onDeleteEvent?: (eventId: string) => void;
  onDeleteEventSeries?: (eventId: string, scope: 'this' | 'all' | 'all_after') => void;
  onEditEvent?: (eventId: string) => void;
  /** When true, use same transparent + border style as planned time blocks */
  plannedStyle?: boolean;
  /** When true and onMoveEvent is used, card is draggable */
  draggable?: boolean;
  /** Called when user mousedowns on the bottom-edge resize handle */
  onResizeStart?: (e: React.MouseEvent) => void;
  /** When true, shows compact card without duration, description, or category chip */
  compact?: boolean;
}

export function EventCard({
  event,
  style,
  isSelected,
  onSelect,
  onDeselect,
  onDeleteEvent,
  onDeleteEventSeries,
  onEditEvent,
  plannedStyle = false,
  draggable = false,
  onResizeStart,
  compact = false,
}: EventCardProps) {
  const [showPopover, setShowPopover] = useState(false);
  const [deleteConfirmState, setDeleteConfirmState] = useState<null | 'confirm'>(null);
  const [popoverPosition, setPopoverPosition] = useState<'bottom-left' | 'top-right'>('bottom-left');
  const [popoverDragOffset, setPopoverDragOffset] = useState({ x: 0, y: 0 });
  const [popoverRect, setPopoverRect] = useState<{ top: number; left: number } | null>(null);
  const [now, setNow] = useState(() => new Date());
  const cardRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  useLayoutEffect(() => {
    if (!showPopover || !isSelected || !cardRef.current) {
      setPopoverRect(null);
      return;
    }
    const el = cardRef.current;
    const rect = el.getBoundingClientRect();
    const viewportH = typeof window !== 'undefined' ? window.innerHeight : 800;
    const spaceBelow = viewportH - rect.bottom;
    const preferBelow = spaceBelow >= POPOVER_MAX_HEIGHT + GAP;
    const top = preferBelow ? rect.bottom + GAP : rect.top - POPOVER_MAX_HEIGHT - GAP;
    const left = Math.max(GAP, Math.min(rect.left, (typeof window !== 'undefined' ? window.innerWidth : 400) - POPOVER_WIDTH - GAP));
    setPopoverRect({ top, left });
    const update = () => {
      if (!el.isConnected) return;
      const r = el.getBoundingClientRect();
      const sb = (typeof window !== 'undefined' ? window.innerHeight : 800) - r.bottom;
      setPopoverRect({
        top: sb >= POPOVER_MAX_HEIGHT + GAP ? r.bottom + GAP : r.top - POPOVER_MAX_HEIGHT - GAP,
        left: Math.max(GAP, Math.min(r.left, (typeof window !== 'undefined' ? window.innerWidth : 400) - POPOVER_WIDTH - GAP)),
      });
    };
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [showPopover, isSelected]);

  const todayStr = getLocalDateString(now);
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const eventEndMins = (() => {
    const [h, m] = event.end.split(':').map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  })();
  const isPast = event.date < todayStr || (event.date === todayStr && eventEndMins <= nowMins);

  const categoryColor = event.category?.color ?? THEME.primary;
  const calendarColor = event.calendarContainer?.color ?? THEME.primary;
  const baseBg = plannedStyle ? hexToRgba(categoryColor, 0.2) : categoryColor;
  // Background uses rgba directly — keeps text/chips at full opacity (no container opacity hack)
  const bgColor = plannedStyle
    ? baseBg
    : isPast
      ? hexToRgba(desaturate(categoryColor, 0.50), 0.22)
      : hexToRgba(categoryColor, 0.65);
  const opacity = 1; // Applied via rgba background, not container — text stays fully opaque
  // White text when background is dark (current events with 0.65 alpha); otherwise use theme primary
  const eventTextColor =
    plannedStyle || isPast
      ? THEME.textPrimary
      : getContrastTextColor(categoryColor, 0.65);
  const borderStyle = plannedStyle
    ? { border: `2px solid ${categoryColor}`, borderLeft: `4px solid ${calendarColor}` }
    : isPast
      ? { borderLeft: `4px solid ${hexToRgba(calendarColor, 0.40)}` }
      : { borderLeft: `4px solid ${calendarColor}` };

  const heightPx =
    typeof style.height === 'number'
      ? style.height
      : typeof style.height === 'string'
        ? parseFloat(style.height)
        : 0;

  const getDuration = () => {
    const [startHour, startMin] = event.start.split(':').map(Number);
    const [endHour, endMin] = event.end.split(':').map(Number);
    const minutes = (endHour * 60 + endMin) - (startHour * 60 + startMin);
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
    if (hours > 0) return `${hours}h`;
    return `${mins}m`;
  };

  const getDurationMinutes = () => {
    const [startHour, startMin] = event.start.split(':').map(Number);
    const [endHour, endMin] = event.end.split(':').map(Number);
    return (endHour * 60 + endMin) - (startHour * 60 + startMin);
  };

  const handleDragStart = (e: React.DragEvent) => {
    if (!draggable) return;
    e.dataTransfer.setData('application/x-timebox-event-id', event.id);
    e.dataTransfer.setData('application/x-timebox-event-duration', String(getDurationMinutes()));
    e.dataTransfer.setData('application/x-timebox-event-color', categoryColor);
    e.dataTransfer.setData('text/plain', event.title || 'Event');
    e.dataTransfer.effectAllowed = 'move';
    activeDrag.type = 'event';
    activeDrag.duration = getDurationMinutes();
    activeDrag.color = categoryColor;
    if (e.dataTransfer.setDragImage && event.title) {
      const ghost = document.createElement('div');
      ghost.className = 'rounded-lg shadow-lg px-3 py-2 text-sm font-medium';
      ghost.textContent = event.title;
      ghost.style.position = 'absolute';
      ghost.style.top = '-9999px';
      ghost.style.backgroundColor = hexToRgba(categoryColor, 0.95);
      ghost.style.borderLeft = `4px solid ${calendarColor}`;
      ghost.style.color = getTextClassForBackground(categoryColor) === 'text-white' ? '#fff' : '#1f2937';
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, 8, 8);
      requestAnimationFrame(() => document.body.removeChild(ghost));
    }
  };

  useLayoutEffect(() => {
    if (!showPopover || !isSelected || !cardRef.current || !popoverRef.current) return;
    const cardRect = cardRef.current.getBoundingClientRect();
    const viewportH = typeof window !== 'undefined' ? window.innerHeight : 800;
    const spaceBelow = viewportH - cardRect.bottom;
    const preferTop = spaceBelow < POPOVER_MAX_HEIGHT + GAP;
    setPopoverPosition(preferTop ? 'top-right' : 'bottom-left');
  }, [showPopover, isSelected]);

  const handlePopoverDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX - popoverDragOffset.x;
    const startY = e.clientY - popoverDragOffset.y;
    const onMove = (ev: MouseEvent) => {
      setPopoverDragOffset({ x: ev.clientX - startX, y: ev.clientY - startY });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div
      ref={cardRef}
      className={cn(
        'absolute w-full min-w-0 overflow-hidden pointer-events-auto group',
        draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
      )}
      style={style}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={() => {
        onSelect();
        setShowPopover((v) => !v);
      }}
      draggable={draggable}
      onDragStart={handleDragStart}
      onDragEnd={() => { activeDrag.type = null; }}
    >
      <div
        className={cn(
          'h-full w-full px-3 py-2 transition-all flex flex-col min-h-0 overflow-hidden',
          plannedStyle ? '' : 'border-l-4',
          isSelected && 'ring-2 ring-offset-1'
        )}
        style={{
          backgroundColor: bgColor,
          opacity,
          ...(isSelected ? { '--tw-ring-color': '#8DA286' } as React.CSSProperties : {}),
          ...borderStyle,
        }}
      >
        {compact ? (
          <div className="flex flex-col h-full min-w-0 w-full overflow-hidden" style={{ color: eventTextColor }}>
            <div className="flex items-start min-w-0 w-full flex-1 gap-1.5 overflow-hidden min-h-0">
              <span
                className="font-medium text-sm leading-snug min-w-0 flex-1 break-words"
                style={{
                  fontSize: 12,
                  overflow: 'hidden',
                  wordBreak: 'break-word',
                }}
              >
                {event.title || 'Untitled Event'}
              </span>
              {event.recurring && event.recurrencePattern && event.recurrencePattern !== 'none' && (
                <ArrowPathIcon className="flex-shrink-0 mt-0.5 opacity-60" style={{ width: 10, height: 10, minWidth: 10, minHeight: 10 }} />
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col h-full min-w-0 w-full overflow-hidden" style={{ color: eventTextColor }}>
            <div className="flex items-center justify-between gap-2 min-w-0 w-full flex-shrink-0 overflow-hidden">
              <span
                className="font-medium leading-snug min-w-0 flex-1 truncate"
                style={{
                  fontSize: 14,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {event.title || 'Untitled Event'}
              </span>
              <div className="flex items-center gap-1 shrink-0">
                {event.recurring && event.recurrencePattern && event.recurrencePattern !== 'none' && (
                  <ArrowPathIcon className="opacity-60 flex-shrink-0" style={{ width: 12, height: 12, minWidth: 12, minHeight: 12 }} />
                )}
                <span className="text-xs whitespace-nowrap opacity-90">
                  {getDuration()}
                </span>
              </div>
            </div>
            {heightPx >= 72 && event.description && (
              <p className="mt-1 text-xs opacity-90 line-clamp-2 min-w-0 flex-shrink-0">
                {event.description}
              </p>
            )}
            {heightPx >= 56 && event.category && (
              <div className="mt-auto flex items-end gap-2 pt-1 shrink-0 min-w-0 overflow-hidden">
                <Chip
                  variant="subtle"
                  color={categoryColor}
                  contrastBackgroundHex={plannedStyle ? undefined : categoryColor}
                  className="max-w-full min-w-0"
                >
                  {event.category.name}
                </Chip>
              </div>
            )}
          </div>
        )}
      </div>

      {onResizeStart && (
        <div
          className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize opacity-0 group-hover:opacity-100 transition-opacity"
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onResizeStart(e); }}
        >
          <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-8 h-1 bg-white/40 rounded-full" />
        </div>
      )}

      {/* Detail popover — portaled so it isn't clipped by grid overflow */}
      {showPopover && isSelected && typeof document !== 'undefined' && createPortal(
        <>
          <div
            className="fixed inset-0 z-[9998]"
            onClick={(e) => {
              e.stopPropagation();
              setShowPopover(false);
              setDeleteConfirmState(null);
              setPopoverDragOffset({ x: 0, y: 0 });
              onDeselect();
            }}
          />
          {popoverRect && (
          <div
            ref={popoverRef}
            className="fixed z-[9999] rounded-xl p-3 min-w-56"
            style={{
              top: popoverRect.top + popoverDragOffset.y,
              left: popoverRect.left + popoverDragOffset.x,
              backgroundColor: '#FFFFFF',
              border: '1px solid rgba(0,0,0,0.09)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.10)',
            }}
          >
            <div
              className="cursor-grab active:cursor-grabbing pb-2 -mx-3 px-3 -mt-1 pt-1 rounded-t-xl"
              style={{ borderBottom: '1px solid rgba(0,0,0,0.08)' }}
              onMouseDown={handlePopoverDragStart}
            >
              <div className="font-semibold text-sm truncate" style={{ color: THEME.textPrimary }}>
                {event.title || 'Untitled Event'}
              </div>
            </div>
            <div className="pt-2">
              <div className="flex items-center gap-2 text-xs mb-1.5" style={{ color: THEME.textSecondary }}>
                <ClockIcon className="flex-shrink-0" style={{ width: 14, height: 14, minWidth: 14, minHeight: 14, color: THEME.textMuted }} />
                <span>{event.start} – {event.end} ({getDuration()})</span>
              </div>
              <div className="flex items-center gap-2 text-xs mb-1.5" style={{ color: THEME.textSecondary }}>
                <CalendarIcon className="flex-shrink-0" style={{ width: 14, height: 14, minWidth: 14, minHeight: 14, color: THEME.textMuted }} />
                <span>{event.date}</span>
              </div>
              {event.category && (
                <div className="flex items-center gap-2 text-xs mb-1.5" style={{ color: THEME.textSecondary }}>
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: event.category.color }}
                  />
                  <span>{event.category.name}</span>
                </div>
              )}
              {event.calendarContainer && (
                <div className="flex items-center gap-2 text-xs mb-3" style={{ color: THEME.textSecondary }}>
                  <div
                    className="w-3 h-3 rounded flex-shrink-0"
                    style={{ backgroundColor: hexToRgba(event.calendarContainer.color, 0.25), border: `2px solid ${event.calendarContainer.color}` }}
                  />
                  <span>{event.calendarContainer.name}</span>
                </div>
              )}
              {event.recurring && event.recurrencePattern && event.recurrencePattern !== 'none' && (
                <div className="flex items-center gap-2 text-xs mb-1.5" style={{ color: THEME.textSecondary }}>
                  <ArrowPathIcon className="flex-shrink-0" style={{ width: 14, height: 14, minWidth: 14, minHeight: 14, color: THEME.textMuted }} />
                  <span>Repeats {patternLabel(event.recurrencePattern).toLowerCase()}</span>
                </div>
              )}
              {event.notes && (
                <div className="text-xs italic mb-2 pt-1" style={{ borderTop: '1px solid rgba(0,0,0,0.05)', color: THEME.textSecondary }}>
                  {event.notes}
                </div>
              )}
              {event.description && (
                <div className="text-xs whitespace-pre-wrap mb-2" style={{ color: THEME.textSecondary }}>{event.description}</div>
              )}
              {event.link && (
                <div className="mb-2">
                  <a href={event.link} target="_blank" rel="noopener noreferrer" className="text-xs hover:underline truncate block max-w-full" style={{ color: '#8DA286' }}>
                    {event.link}
                  </a>
                </div>
              )}
              <div className="my-1" style={{ borderTop: '1px solid rgba(0,0,0,0.08)' }} />
              {deleteConfirmState === 'confirm' ? (
                <div className="flex flex-col gap-1.5">
                  <div className="text-xs font-medium mb-0.5" style={{ color: THEME.textSecondary }}>Which events to delete?</div>
                  {([
                    { scope: 'this' as const, label: 'This event', desc: 'Only this occurrence' },
                    { scope: 'all_after' as const, label: 'This and all after', desc: 'From this date forward' },
                    { scope: 'all' as const, label: 'All events', desc: 'Every event in the series' },
                  ]).map(({ scope, label, desc }) => (
                    <button
                      key={scope}
                      type="button"
                      className="text-left px-3 py-2 rounded-xl transition-all"
                      style={{ border: '1.5px solid rgba(184,80,80,0.18)', color: '#B85050', backgroundColor: 'transparent' }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(184,80,80,0.07)'; e.currentTarget.style.borderColor = '#B85050'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.borderColor = 'rgba(184,80,80,0.18)'; }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteEventSeries?.(event.id, scope);
                        setShowPopover(false);
                        setDeleteConfirmState(null);
                        onDeselect();
                      }}
                    >
                      <div className="text-xs font-medium">{label}</div>
                      <div className="text-xs mt-0.5 opacity-70">{desc}</div>
                    </button>
                  ))}
                  <button
                    type="button"
                    className="mt-0.5 w-full py-1.5 text-xs font-medium rounded-xl transition-colors"
                    style={{ color: '#636366', backgroundColor: 'rgba(0,0,0,0.04)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.07)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.04)'; }}
                    onClick={(e) => { e.stopPropagation(); setDeleteConfirmState(null); }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex gap-1.5">
                  {onEditEvent && (
                    <button
                      type="button"
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-xl transition-colors"
                      style={{ color: THEME.textSecondary, backgroundColor: 'transparent' }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.04)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditEvent(event.id);
                        setShowPopover(false);
                        onDeselect();
                      }}
                    >
                      <PencilIcon className="h-3.5 w-3.5" />
                      Edit
                    </button>
                  )}
                  {(onDeleteEvent || onDeleteEventSeries) && (
                    <button
                      type="button"
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-xl transition-colors"
                      style={{ color: '#B85050', backgroundColor: 'transparent' }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(184,80,80,0.07)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (event.recurring && event.recurrenceSeriesId && onDeleteEventSeries) {
                          setDeleteConfirmState('confirm');
                        } else {
                          onDeleteEvent?.(event.id);
                          setShowPopover(false);
                          onDeselect();
                        }
                      }}
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
          )}
        </>,
        document.body
      )}
    </div>
  );
}
