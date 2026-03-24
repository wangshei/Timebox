import React, { useState, useRef, useLayoutEffect, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { TrashIcon, CalendarIcon, ClockIcon, PencilIcon, ArrowPathIcon, CheckIcon, XMarkIcon } from '@heroicons/react/24/solid';
import { ResolvedEvent } from '../utils/dataResolver';
import type { RecurrencePattern } from '../types';
import { cn } from './ui/utils';
import { getTextClassForBackground, getContrastTextColor, hexToRgba, desaturate, lighten } from '../utils/color';
import { getLocalDateString } from '../utils/dateTime';
import { THEME } from '../constants/colors';
import { Chip } from './ui/chip';
import { activeDrag, initPointerDrag } from '../utils/dragState';
import { useNow, useNowFrozen } from '../contexts/NowContext';
import { useStore } from '../store/useStore';

const POPOVER_WIDTH = 220;
const POPOVER_MAX_HEIGHT = 420;

/** Convert URLs in plain text to clickable links. Escapes HTML to prevent XSS. */
function linkifyText(text: string): string {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escaped.replace(
    /https?:\/\/[^\s<>"')\]]+/gi,
    (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:#8DA286;text-decoration:underline" onclick="event.stopPropagation()">${url}</a>`
  );
}
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
  /** Toggle attendance for past events */
  onToggleAttendance?: (eventId: string, status: 'attended' | 'not_attended' | undefined) => void;
  /** When true, show red dashed outline for diff status (unplanned / not attended). */
  showDifferences?: boolean;
  /** Segment indicators for cross-date events */
  isStartSegment?: boolean;
  isEndSegment?: boolean;
  /** When set, blocks are in stamp mode — clicking stamps this emoji. */
  activeStampEmoji?: string | null;
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
  onToggleAttendance,
  showDifferences = false,
  isStartSegment = true,
  isEndSegment = true,
  activeStampEmoji,
}: EventCardProps) {
  const [showPopover, setShowPopover] = useState(false);
  const [deleteConfirmState, setDeleteConfirmState] = useState<null | 'confirm' | 'confirm_gcal'>(null);
  const [popoverRect, setPopoverRect] = useState<{ top: number; left: number } | null>(null);
  const [popoverDragOffset, setPopoverDragOffset] = useState({ x: 0, y: 0 });
  const [showDetails, setShowDetails] = useState(false);
  const nowCtx = useNow();
  const frozen = useNowFrozen();
  const [now, setNow] = useState(() => frozen ? nowCtx : new Date());
  const cardRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const popoverOpenedAtRef = useRef<number>(0);
  const dragEndedRef = useRef(false);
  const addSticker = useStore((s) => s.addSticker);
  const stickers = useStore((s) => s.stickers);
  const deleteSticker = useStore((s) => s.deleteSticker);
  const eventStickers = React.useMemo(() => stickers.filter((s) => s.eventId === event.id), [stickers, event.id]);

  const handleStamp = (e: React.MouseEvent) => {
    if (!activeStampEmoji || !cardRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = cardRef.current.getBoundingClientRect();
    const offsetXPercent = Math.max(5, Math.min(95, ((e.clientX - rect.left) / rect.width) * 100));
    const offsetYPercent = Math.max(5, Math.min(95, ((e.clientY - rect.top) / rect.height) * 100));
    addSticker({
      emoji: activeStampEmoji,
      date: event.date,
      eventId: event.id,
      offsetXPercent,
      offsetYPercent,
    });
  };

  useEffect(() => {
    if (frozen) { setNow(nowCtx); return; }
    const t = setInterval(() => {
      if (!document.hidden) setNow(new Date());
    }, 60_000);
    return () => clearInterval(t);
  }, [frozen, nowCtx]);

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
  const notAttended = event.attendanceStatus === 'not_attended';
  const bgColor = plannedStyle
    ? baseBg
    : notAttended
      ? 'rgba(0,0,0,0.025)'
      : isPast
        ? hexToRgba(desaturate(categoryColor, 0.50), 0.22)
        : hexToRgba(categoryColor, 0.65);
  const opacity = notAttended ? 0.5 : 1;
  // White text when background is dark (current events with 0.65 alpha); otherwise use theme primary
  const eventTextColor =
    plannedStyle || isPast || notAttended
      ? THEME.textPrimary
      : getContrastTextColor(categoryColor, 0.65);
  const borderStyle = plannedStyle
    ? { border: `2px solid ${categoryColor}`, borderLeft: `4px solid ${calendarColor}` }
    : notAttended
      ? { borderLeft: `4px solid ${hexToRgba(calendarColor, 0.15)}` }
      : isPast
        ? { borderLeft: `4px solid ${hexToRgba(calendarColor, 0.40)}` }
        : { borderLeft: `4px solid ${calendarColor}` };

  // Diff status for "Show Differences" mode
  const diffStatus: 'unplanned' | 'missing' | 'timing' | null = (() => {
    if (!showDifferences) return null;
    if (event.source === 'unplanned') return 'unplanned';
    if (isPast && event.attendanceStatus === 'not_attended') return 'missing';
    // Timing changed — event was moved/resized from its original position
    if (event.originalStart != null && event.originalEnd != null &&
        (event.originalStart !== event.start || event.originalEnd !== event.end)) return 'timing';
    return null;
  })();
  const diffColor = diffStatus === 'unplanned' ? 'rgba(52,199,89,0.75)'
    : diffStatus === 'timing' ? 'rgba(255,214,10,0.9)'
    : diffStatus === 'missing' ? 'rgba(255,59,48,0.75)'
    : undefined;
  const diffBoxShadow = diffColor ? `inset 0 0 0 2px ${diffColor}` : undefined;
  // Fade "same" (no-diff) past events when showDifferences is on so different ones stand out.
  // Future events haven't happened yet — nothing to compare, so show at normal opacity.
  // Events with a detected diff get full opacity so they pop against faded "same" items.
  const diffFadeOpacity = showDifferences && diffStatus !== null ? 1
    : showDifferences && diffStatus === null && isPast ? 0.25
    : undefined;

  // Cross-date segment border-radius adjustments
  const segmentRadius: React.CSSProperties = {};
  if (!isStartSegment) { segmentRadius.borderTopLeftRadius = 0; segmentRadius.borderTopRightRadius = 0; }
  if (!isEndSegment) { segmentRadius.borderBottomLeftRadius = 0; segmentRadius.borderBottomRightRadius = 0; }

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

  const handlePointerDragStart = (e: React.PointerEvent) => {
    if (!draggable) return;
    if ((e.target as HTMLElement).closest('button, input, textarea, [data-no-drag]')) return;
    initPointerDrag(e, {
      type: 'event',
      id: event.id,
      duration: getDurationMinutes(),
      color: categoryColor,
      title: event.title || 'Event',
      createGhost: () => {
        const ghost = document.createElement('div');
        ghost.style.cssText = `padding:6px 12px;border-radius:8px;font-size:13px;font-weight:500;white-space:nowrap;max-width:200px;overflow:hidden;text-overflow:ellipsis;box-shadow:0 4px 12px rgba(0,0,0,0.15);`;
        ghost.textContent = event.title || 'Event';
        ghost.style.backgroundColor = hexToRgba(categoryColor, 0.95);
        ghost.style.borderLeft = `4px solid ${calendarColor}`;
        ghost.style.color = getTextClassForBackground(categoryColor) === 'text-white' ? '#fff' : '#1f2937';
        return ghost;
      },
      onDragStart: () => { setShowPopover(false); },
      onDragEnd: () => { dragEndedRef.current = true; },
    });
  };

  // Close popover when clicking outside (portal-based — popover is NOT inside cardRef)
  useEffect(() => {
    if (!showPopover || !isSelected) return;
    const close = (e: PointerEvent) => {
      if (Date.now() - popoverOpenedAtRef.current < 200) return;
      if (cardRef.current?.contains(e.target as Node)) return;
      if (popoverRef.current?.contains(e.target as Node)) return;
      setShowPopover(false);
      onDeselect();
    };
    document.addEventListener('pointerdown', close, true);
    return () => document.removeEventListener('pointerdown', close, true);
  }, [showPopover, isSelected]);

  // Compute portal popover position from card's viewport rect, measuring actual popover height
  useLayoutEffect(() => {
    if (!showPopover || !isSelected || !cardRef.current) return;
    const el = cardRef.current;
    const update = () => {
      const rect = el.getBoundingClientRect();
      const popoverH = popoverRef.current?.offsetHeight ?? 200;
      // Try above the card
      let top = rect.top - popoverH - GAP;
      let left = rect.left;
      // Flip below if above would go off screen
      if (top < GAP) top = rect.bottom + GAP;
      left = Math.max(GAP, Math.min(left, window.innerWidth - POPOVER_WIDTH - GAP));
      top = Math.max(GAP, Math.min(top, window.innerHeight - popoverH - GAP));
      setPopoverRect({ top, left });
    };
    // Run after a microtask so the portal element is measured at its real size
    queueMicrotask(update);
    const obs = new ResizeObserver(update);
    obs.observe(el);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      obs.disconnect();
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
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
        'absolute w-full min-w-0 pointer-events-auto group overflow-hidden',
        draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
      )}
      style={style}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        if (dragEndedRef.current) { dragEndedRef.current = false; return; }
        if (activeStampEmoji) { handleStamp(e); return; }
        onSelect();
        popoverOpenedAtRef.current = Date.now();
        setShowPopover(true);
        setShowDetails(false);
      }}
      onPointerDown={!activeStampEmoji && draggable ? handlePointerDragStart : undefined}
    >
      <div
        className={cn(
          `h-full w-full transition-all flex flex-col min-h-0 overflow-hidden ${compact ? 'px-1.5 py-1' : 'px-3 py-2'}`,
          plannedStyle ? '' : 'border-l-4',
          isSelected && 'ring-2 ring-offset-1'
        )}
        style={{
          backgroundColor: bgColor,
          opacity: diffFadeOpacity ?? opacity,
          ...(isSelected ? { '--tw-ring-color': '#8DA286' } as React.CSSProperties : {}),
          ...borderStyle,
          boxShadow: diffBoxShadow,
          ...segmentRadius,
        }}
      >
        {compact ? (
          <div className="flex flex-col h-full min-w-0 w-full overflow-hidden" style={{ color: eventTextColor }}>
            <div className="flex items-start min-w-0 w-full flex-1 gap-1.5 overflow-hidden min-h-0">
              <span
                className="font-medium leading-snug min-w-0 flex-1 truncate"
                style={{
                  fontSize: 10,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {event.title || 'Untitled Event'}
              </span>
              {event.googleEventId && (
                <span className="flex-shrink-0 mt-0.5 opacity-50" style={{ fontSize: 8, lineHeight: 1 }} title="Synced from Google Calendar">G</span>
              )}
              {event.sharedFromShareId && !event.googleEventId && (
                <span className="flex-shrink-0 mt-0.5 opacity-50" style={{ fontSize: 8, lineHeight: 1 }} title="Shared event">S</span>
              )}
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
                {event.link && /meet\.google|zoom\.us|teams\.microsoft/i.test(event.link) && (
                  <a
                    href={event.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0 rounded px-1 py-0.5 transition-colors"
                    style={{ backgroundColor: 'rgba(141,162,134,0.15)', color: '#8DA286', fontSize: 9, fontWeight: 600, textDecoration: 'none', lineHeight: 1 }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(141,162,134,0.25)')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(141,162,134,0.15)')}
                    onClick={(e) => e.stopPropagation()}
                    title="Join meeting"
                  >
                    Join
                  </a>
                )}
                {event.googleEventId && (
                  <span className="opacity-50 flex-shrink-0" style={{ fontSize: 9, lineHeight: 1 }} title="Synced from Google Calendar">G</span>
                )}
                {event.sharedFromShareId && !event.googleEventId && (
                  <span className="opacity-50 flex-shrink-0" style={{ fontSize: 9, lineHeight: 1 }} title="Shared event">S</span>
                )}
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

      {/* Positioned stickers */}
      {eventStickers.length > 0 && (
        <>
          {eventStickers.map((sticker) => (
            <span
              key={sticker.id}
              className="absolute z-10 select-none pointer-events-auto cursor-pointer"
              style={{
                left: `${sticker.offsetXPercent}%`,
                top: `${sticker.offsetYPercent}%`,
                transform: 'translate(-50%, -50%)',
                fontSize: 16,
                lineHeight: 1,
                filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.12))',
                transition: 'transform 0.1s',
              }}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                deleteSticker(sticker.id);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = 'translate(-50%, -50%) scale(1.2)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = 'translate(-50%, -50%)'; }}
            >
              {sticker.emoji}
            </span>
          ))}
        </>
      )}

      {onResizeStart && (
        <div
          className="absolute bottom-0 left-0 right-0 h-2 z-10 cursor-ns-resize opacity-0 group-hover:opacity-100 transition-opacity"
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onResizeStart(e); }}
        >
          <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-8 h-1 bg-white/40 rounded-full" />
        </div>
      )}

      {/* Detail popover — portaled to document.body so it's never clipped by overflow parents */}
      {showPopover && isSelected && typeof document !== 'undefined' && createPortal(
          <div
            ref={popoverRef}
            className="fixed rounded-xl p-3 overflow-hidden"
            style={{
              zIndex: 200,
              width: 220,
              maxWidth: 220,
              top: popoverRect?.top ?? -9999,
              left: popoverRect?.left ?? -9999,
              transform: `translate(${popoverDragOffset.x}px, ${popoverDragOffset.y}px)`,
              backgroundColor: '#FFFFFF',
              border: '1px solid rgba(0,0,0,0.08)',
              boxShadow: '0 6px 24px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.04)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="cursor-grab active:cursor-grabbing pb-1.5 -mx-3 px-3 -mt-0.5 pt-1 rounded-t-xl"
              style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}
              onMouseDown={handlePopoverDragStart}
            >
              <div className="font-semibold truncate" style={{ color: THEME.textPrimary, fontSize: 12 }}>
                {event.title || 'Untitled Event'}
              </div>
            </div>
            <div className="pt-2">
              {/* Info section */}
              <div className="flex items-center gap-1.5 mb-1" style={{ color: THEME.textSecondary, fontSize: 10 }}>
                <ClockIcon className="flex-shrink-0" style={{ width: 11, height: 11, minWidth: 11, minHeight: 11, color: THEME.textMuted }} />
                <span>{event.start} – {event.end} ({getDuration()})</span>
              </div>
              <div className="flex items-center gap-1.5 mb-1" style={{ color: THEME.textSecondary, fontSize: 10 }}>
                <CalendarIcon className="flex-shrink-0" style={{ width: 11, height: 11, minWidth: 11, minHeight: 11, color: THEME.textMuted }} />
                <span>{event.date}</span>
              </div>
              {event.category && (
                <div className="flex items-center gap-1.5 mb-1" style={{ color: THEME.textSecondary, fontSize: 10 }}>
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: event.category.color }}
                  />
                  <span>{event.category.name}</span>
                </div>
              )}
              {event.calendarContainer && (
                <div className="flex items-center gap-1.5 mb-1" style={{ color: THEME.textSecondary, fontSize: 10 }}>
                  <div
                    className="w-2 h-2 rounded flex-shrink-0"
                    style={{ backgroundColor: hexToRgba(event.calendarContainer.color, 0.25), border: `1.5px solid ${event.calendarContainer.color}` }}
                  />
                  <span>{event.calendarContainer.name}</span>
                </div>
              )}
              {event.recurring && event.recurrencePattern && event.recurrencePattern !== 'none' && (
                <div className="flex items-center gap-1.5 mb-1" style={{ color: THEME.textSecondary, fontSize: 10 }}>
                  <ArrowPathIcon className="flex-shrink-0" style={{ width: 11, height: 11, minWidth: 11, minHeight: 11, color: THEME.textMuted }} />
                  <span>Repeats {patternLabel(event.recurrencePattern).toLowerCase()}</span>
                </div>
              )}

              {/* Attendees */}
              {event.attendees && event.attendees.length > 0 && (
                <div className="mt-1 mb-1">
                  <div className="flex items-center gap-1.5 mb-1" style={{ color: THEME.textMuted, fontSize: 10 }}>
                    <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" style={{ flexShrink: 0, opacity: 0.6 }}>
                      <path d="M8 8a3 3 0 100-6 3 3 0 000 6zm-4 6c0-2.2 1.8-4 4-4s4 1.8 4 4H4zm9-7a2.5 2.5 0 100-5 2.5 2.5 0 000 5zm1 7c0-.7-.1-1.4-.4-2h2.4c.6 0 1 .4 1 1v1h-3z" />
                    </svg>
                    <span style={{ fontWeight: 500 }}>{event.attendees.length} attendee{event.attendees.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="pl-4 flex flex-col gap-0.5">
                    {event.attendees.slice(0, 5).map((a, i) => (
                      <div key={i} className="flex items-center gap-1.5" style={{ fontSize: 10, color: THEME.textSecondary }}>
                        <div
                          className="flex-shrink-0 rounded-full flex items-center justify-center"
                          style={{
                            width: 14, height: 14, fontSize: 7, fontWeight: 600,
                            backgroundColor: a.self ? hexToRgba(categoryColor, 0.15) : 'rgba(0,0,0,0.06)',
                            color: a.self ? categoryColor : THEME.textMuted,
                          }}
                        >
                          {(a.name || a.email).charAt(0).toUpperCase()}
                        </div>
                        <span className="truncate" style={{ maxWidth: 140 }}>
                          {a.self ? 'You' : (a.name || a.email)}
                        </span>
                        {a.responseStatus && a.responseStatus !== 'needsAction' && (
                          <span style={{ fontSize: 8, color: a.responseStatus === 'accepted' ? '#34C759' : a.responseStatus === 'declined' ? '#FF3B30' : THEME.textMuted }}>
                            {a.responseStatus === 'accepted' ? '✓' : a.responseStatus === 'declined' ? '✕' : '?'}
                          </span>
                        )}
                      </div>
                    ))}
                    {event.attendees.length > 5 && (
                      <div style={{ fontSize: 9, color: THEME.textMuted }}>+{event.attendees.length - 5} more</div>
                    )}
                  </div>
                </div>
              )}

              {/* Details toggle — grouped with info above */}
              {(event.notes || event.description || event.link) && (
                <div className="mt-0.5 mb-1">
                  <button
                    type="button"
                    className="flex items-center gap-1 font-medium py-0.5"
                    style={{ color: THEME.textMuted, fontSize: 10 }}
                    onClick={() => setShowDetails(d => !d)}
                  >
                    <svg width="7" height="7" viewBox="0 0 8 8" style={{ transform: showDetails ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>
                      <path d="M2 1L6 4L2 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                    </svg>
                    Details
                  </button>
                  {showDetails && (
                    <div className="mt-1">
                      {event.link && (
                        <a
                          href={event.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 mb-1 px-1.5 py-1 rounded-md transition-colors"
                          style={{ backgroundColor: 'rgba(141,162,134,0.08)', textDecoration: 'none', display: 'inline-flex' }}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(141,162,134,0.15)')}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(141,162,134,0.08)')}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {/meet\.google|zoom\.us|teams\.microsoft/i.test(event.link) ? (
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1 3.5a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1H2a1 1 0 01-1-1v-3z" stroke="#8DA286" strokeWidth="1"/><path d="M7 4l2-1v4l-2-1" stroke="#8DA286" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          ) : (
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M8 5.5v2a1 1 0 01-1 1H3a1 1 0 01-1-1v-5a1 1 0 011-1h2" stroke="#8DA286" strokeWidth="1" strokeLinecap="round"/><path d="M6 1.5h2.5V4" stroke="#8DA286" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/><path d="M5 5L8.5 1.5" stroke="#8DA286" strokeWidth="1" strokeLinecap="round"/></svg>
                          )}
                          <span style={{ color: '#8DA286', fontSize: 10, fontWeight: 500 }}>
                            {/meet\.google/i.test(event.link) ? 'Join Google Meet'
                              : /zoom\.us/i.test(event.link) ? 'Join Zoom'
                              : /teams\.microsoft/i.test(event.link) ? 'Join Teams'
                              : /calendar\.google/i.test(event.link) ? 'Open in Google Calendar'
                              : 'Open link'}
                          </span>
                        </a>
                      )}
                      {event.location && (
                        <div className="flex items-center gap-1 mb-1" style={{ fontSize: 10, color: THEME.textMuted }}>
                          <svg width="9" height="9" viewBox="0 0 9 9" fill="none"><path d="M4.5 8C4.5 8 7.5 5.5 7.5 3.5a3 3 0 10-6 0C1.5 5.5 4.5 8 4.5 8z" stroke="currentColor" strokeWidth="0.9"/><circle cx="4.5" cy="3.5" r="1" stroke="currentColor" strokeWidth="0.9"/></svg>
                          <span>{event.location}</span>
                        </div>
                      )}
                      {event.notes && (
                        <div className="italic mb-1 break-words" style={{ color: THEME.textSecondary, fontSize: 10 }}>
                          {event.notes}
                        </div>
                      )}
                      {event.description && (
                        <div className="whitespace-pre-wrap mb-1 break-words" style={{ color: THEME.textSecondary, fontSize: 10 }}
                          dangerouslySetInnerHTML={{ __html: linkifyText(event.description) }}
                        />
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Attendance button — below the line */}
              <div className="my-0.5" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }} />
              {isPast && onToggleAttendance && (
                <button
                  type="button"
                  className="w-full flex items-center justify-center gap-1 py-1.5 font-medium rounded-md transition-colors"
                  style={{
                    fontSize: 11,
                    color: event.attendanceStatus === 'not_attended' ? THEME.textSecondary : event.attendanceStatus === 'attended' ? THEME.textSecondary : categoryColor,
                    backgroundColor: 'transparent',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = event.attendanceStatus === 'not_attended' || event.attendanceStatus === 'attended' ? 'rgba(0,0,0,0.04)' : hexToRgba(categoryColor, 0.1); }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (event.attendanceStatus === 'not_attended') {
                      onToggleAttendance(event.id, undefined);
                    } else {
                      onToggleAttendance(event.id, 'not_attended');
                    }
                    setShowPopover(false);
                    onDeselect();
                  }}
                >
                  {event.attendanceStatus === 'not_attended' ? (
                    <>
                      <CheckIcon className="flex-shrink-0" style={{ width: 12, height: 12 }} />
                      Undo not attended
                    </>
                  ) : (
                    <>
                      <XMarkIcon className="flex-shrink-0" style={{ width: 12, height: 12 }} />
                      Mark as not attended
                    </>
                  )}
                </button>
              )}

              {/* Source badge for synced/shared events */}
              {event.googleEventId && (
                <div className="flex items-center gap-1.5 mb-1 mt-0.5" style={{ color: THEME.textMuted, fontSize: 10 }}>
                  {event.readOnly ? (
                    <>
                      <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" style={{ flexShrink: 0, opacity: 0.6 }}>
                        <path d="M8 1a4 4 0 0 0-4 4v2H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-1V5a4 4 0 0 0-4-4zm-2 4a2 2 0 1 1 4 0v2H6V5z" />
                      </svg>
                      <span>{event.sharedFromShareId ? 'Shared event (read-only)' : 'Synced from Google Calendar'}</span>
                    </>
                  ) : (
                    <>
                      <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" style={{ flexShrink: 0, opacity: 0.5 }}>
                        <path d="M8 16A8 8 0 108 0a8 8 0 000 16zm1-11v2h2a1 1 0 110 2H9v2a1 1 0 11-2 0V9H5a1 1 0 010-2h2V5a1 1 0 012 0z" />
                      </svg>
                      <span>Your event · Google Calendar</span>
                    </>
                  )}
                </div>
              )}
              {!event.googleEventId && event.readOnly && (
                <div className="flex items-center gap-1.5 mb-1 mt-0.5" style={{ color: THEME.textMuted, fontSize: 10 }}>
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" style={{ flexShrink: 0, opacity: 0.6 }}>
                    <path d="M8 1a4 4 0 0 0-4 4v2H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-1V5a4 4 0 0 0-4-4zm-2 4a2 2 0 1 1 4 0v2H6V5z" />
                  </svg>
                  <span>{event.sharedFromShareId ? 'Shared event (read-only)' : 'Read-only'}</span>
                </div>
              )}

              {/* Remove from Timebox — for Google/shared read-only events */}
              {event.readOnly && onDeleteEvent && (
                <>
                  <div className="my-0.5" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }} />
                  {deleteConfirmState === 'confirm_gcal' ? (
                    <div className="flex flex-col gap-1">
                      <div className="font-medium mb-0.5" style={{ color: THEME.textSecondary, fontSize: 10 }}>Remove which events?</div>
                      <button
                        type="button"
                        className="text-left px-2.5 py-1.5 rounded-lg transition-all"
                        style={{ border: '1px solid rgba(184,80,80,0.18)', color: '#B85050', backgroundColor: 'transparent' }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(184,80,80,0.07)'; e.currentTarget.style.borderColor = '#B85050'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.borderColor = 'rgba(184,80,80,0.18)'; }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteEvent(event.id);
                          setShowPopover(false);
                          setDeleteConfirmState(null);
                          onDeselect();
                        }}
                      >
                        <div className="font-medium" style={{ fontSize: 10 }}>This event only</div>
                        <div className="mt-0.5 opacity-70" style={{ fontSize: 9 }}>Remove this single occurrence</div>
                      </button>
                      <button
                        type="button"
                        className="text-left px-2.5 py-1.5 rounded-lg transition-all"
                        style={{ border: '1px solid rgba(184,80,80,0.18)', color: '#B85050', backgroundColor: 'transparent' }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(184,80,80,0.07)'; e.currentTarget.style.borderColor = '#B85050'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.borderColor = 'rgba(184,80,80,0.18)'; }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteEventSeries?.(event.id, 'all_after');
                          setShowPopover(false);
                          setDeleteConfirmState(null);
                          onDeselect();
                        }}
                      >
                        <div className="font-medium" style={{ fontSize: 10 }}>This & all following</div>
                        <div className="mt-0.5 opacity-70" style={{ fontSize: 9 }}>Remove from this date forward</div>
                      </button>
                      <button
                        type="button"
                        className="mt-0.5 w-full py-1 font-medium rounded-lg transition-colors"
                        style={{ color: '#636366', backgroundColor: 'rgba(0,0,0,0.04)', fontSize: 10 }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.07)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.04)'; }}
                        onClick={(e) => { e.stopPropagation(); setDeleteConfirmState(null); }}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="w-full flex items-center justify-center gap-1 py-1.5 font-medium rounded-md transition-colors"
                      style={{ color: '#B85050', backgroundColor: 'transparent', fontSize: 11 }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(184,80,80,0.07)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                      onClick={(e) => {
                        e.stopPropagation();
                        // If this is a recurring Google event, show scope picker
                        if (event.googleEventId && event.recurringGoogleEventId && onDeleteEventSeries) {
                          setDeleteConfirmState('confirm_gcal');
                        } else {
                          onDeleteEvent(event.id);
                          setShowPopover(false);
                          onDeselect();
                        }
                      }}
                    >
                      <TrashIcon style={{ width: 11, height: 11 }} />
                      Remove from Timebox
                    </button>
                  )}
                </>
              )}

              {/* Edit / Delete — below another line (hidden for read-only events) */}
              {!event.readOnly && <>
              <div className="my-0.5" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }} />
              {deleteConfirmState === 'confirm' ? (
                <div className="flex flex-col gap-1">
                  <div className="font-medium mb-0.5" style={{ color: THEME.textSecondary, fontSize: 10 }}>Which events to delete?</div>
                  {([
                    { scope: 'this' as const, label: 'This event', desc: 'Only this occurrence' },
                    { scope: 'all_after' as const, label: 'This and all after', desc: 'From this date forward' },
                    { scope: 'all' as const, label: 'All events', desc: 'Every event in the series' },
                  ]).map(({ scope, label, desc }) => (
                    <button
                      key={scope}
                      type="button"
                      className="text-left px-2.5 py-1.5 rounded-lg transition-all"
                      style={{ border: '1px solid rgba(184,80,80,0.18)', color: '#B85050', backgroundColor: 'transparent' }}
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
                      <div className="font-medium" style={{ fontSize: 10 }}>{label}</div>
                      <div className="mt-0.5 opacity-70" style={{ fontSize: 9 }}>{desc}</div>
                    </button>
                  ))}
                  <button
                    type="button"
                    className="mt-0.5 w-full py-1 font-medium rounded-lg transition-colors"
                    style={{ color: '#636366', backgroundColor: 'rgba(0,0,0,0.04)', fontSize: 10 }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.07)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.04)'; }}
                    onClick={(e) => { e.stopPropagation(); setDeleteConfirmState(null); }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex gap-1">
                  {onEditEvent && (
                    <button
                      type="button"
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 font-medium rounded-md transition-colors"
                      style={{ color: THEME.textSecondary, backgroundColor: 'transparent', fontSize: 11 }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.04)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditEvent(event.id);
                        setShowPopover(false);
                        onDeselect();
                      }}
                    >
                      <PencilIcon style={{ width: 11, height: 11 }} />
                      Edit
                    </button>
                  )}
                  {(onDeleteEvent || onDeleteEventSeries) && (
                    <button
                      type="button"
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 font-medium rounded-md transition-colors"
                      style={{ color: '#B85050', backgroundColor: 'transparent', fontSize: 11 }}
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
                      <TrashIcon style={{ width: 11, height: 11 }} />
                      Delete
                    </button>
                  )}
                </div>
              )}
              </>}
            </div>
          </div>,
          document.body
      )}
    </div>
  );
}
