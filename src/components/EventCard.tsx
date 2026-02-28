import React, { useState, useRef, useLayoutEffect, useEffect } from 'react';
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
  const [now, setNow] = useState(() => new Date());
  const cardRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

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
        'absolute w-full min-w-0 pointer-events-auto group',
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
          'h-full w-full px-3 py-2 transition-all flex flex-col min-h-0',
          compact && 'overflow-hidden',
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
          <div className="flex flex-col h-full min-w-0" style={{ color: eventTextColor }}>
            <div className="flex items-start min-w-0 flex-shrink-0 gap-1">
              <span
                className="font-medium text-sm leading-snug min-w-0 flex-1"
                style={{
                  fontSize: 12,
                  whiteSpace: 'normal',
                  wordBreak: 'break-word',
                  overflow: 'hidden',
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
          <div className="flex flex-col h-full min-w-0" style={{ color: eventTextColor }}>
            <div className="flex items-start justify-between gap-2 min-w-0 flex-shrink-0">
              <span
                className="font-medium leading-snug min-w-0"
                style={{
                  fontSize: 14,
                  whiteSpace: 'normal',
                  wordBreak: 'break-word',
                  overflow: 'hidden',
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
              <div className="mt-auto flex items-end gap-1 pt-1 shrink-0">
                <Chip
                  variant="subtle"
                  color={categoryColor}
                  contrastBackgroundHex={plannedStyle ? undefined : categoryColor}
                  className="max-w-[120px]"
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

      {/* Detail popover: position top-right if would overflow bottom, draggable */}
      {showPopover && isSelected && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={(e) => {
              e.stopPropagation();
              setShowPopover(false);
              setDeleteConfirmState(null);
              setPopoverDragOffset({ x: 0, y: 0 });
              onDeselect();
            }}
          />
          <div
            ref={popoverRef}
            className="absolute z-20 rounded-xl p-3 min-w-56"
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid rgba(0,0,0,0.09)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.10)',
              ...(popoverPosition === 'bottom-left'
                ? { top: '100%', left: 0, marginTop: 8 }
                : { bottom: '100%', right: 0, marginBottom: 8 }),
              transform: `translate(${popoverDragOffset.x}px, ${popoverDragOffset.y}px)`,
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
                <div className="flex flex-col gap-1">
                  <div className="text-xs font-medium mb-0.5" style={{ color: THEME.textSecondary }}>Delete:</div>
                  <div className="flex gap-1">
                    {(['this', 'all', 'all_after'] as const).map((scope) => (
                      <button
                        key={scope}
                        type="button"
                        className="flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors"
                        style={{ color: '#B85050' }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(184,80,80,0.08)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteEventSeries?.(event.id, scope);
                          setShowPopover(false);
                          setDeleteConfirmState(null);
                          onDeselect();
                        }}
                      >
                        {scope === 'this' ? 'This event' : scope === 'all' ? 'All events' : 'All after'}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex gap-1">
                  {onEditEvent && (
                    <button
                      type="button"
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-lg transition-colors"
                      style={{ color: THEME.textSecondary }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditEvent(event.id);
                        setShowPopover(false);
                        onDeselect();
                      }}
                    >
                      <PencilIcon className="h-4 w-4" />
                      Edit
                    </button>
                  )}
                  {(onDeleteEvent || onDeleteEventSeries) && (
                    <button
                      type="button"
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-lg transition-colors"
                      style={{ color: '#B85050' }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(184,80,80,0.08)'; }}
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
                      <TrashIcon className="h-4 w-4" />
                      Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
