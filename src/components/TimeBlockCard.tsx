import React, { useState, useRef, useLayoutEffect, memo } from 'react';
import { Mode } from '../types';
import { ResolvedTimeBlock } from '../utils/dataResolver';
import { getLocalDateString } from '../utils/dateTime';
import { getTextClassForBackground, hexToRgba, lighten, desaturate } from '../utils/color';
import { CalendarIcon, CheckIcon, ClockIcon, PencilIcon, TrashIcon, XMarkIcon, LockClosedIcon, ArrowsRightLeftIcon } from '@heroicons/react/24/solid';
import { cn } from './ui/utils';
import { Chip } from './ui/chip';

/** Payload for creating a recorded block (e.g. "done differently") */
export type RecordedBlockPayload = {
  taskId?: string | null;
  title?: string;
  calendarContainerId: string;
  categoryId: string;
  tagIds: string[];
  start: string;
  end: string;
  date: string;
};

interface TimeBlockCardProps {
  key?: string;
  block: ResolvedTimeBlock;
  mode: Mode;
  style: React.CSSProperties;
  isSelected: boolean;
  onSelectBlock?: (id: string | null) => void;
  onSelect?: () => void;
  onDeselect?: () => void;
  todayStr?: string;
  nowMins?: number;
  onConfirm?: (blockId: string) => void;
  onUnconfirm?: (blockId: string) => void;
  onEditBlock?: (blockId: string) => void;
  onDeleteBlock?: (blockId: string) => void;
  onDeleteTask?: (taskId: string) => void;
  onResizeStart?: (blockId: string, e: React.MouseEvent) => void;
  compareMatchedTaskIds?: string[];
  focusedCategoryId?: string | null;
  focusedCalendarId?: string | null;
  compact?: boolean;
}

const FOCUS_MUTED_OPACITY = 0.3;

function TimeBlockCardInner({
  block,
  mode,
  style,
  isSelected,
  onSelectBlock,
  onSelect,
  onDeselect,
  todayStr: todayStrProp,
  nowMins: nowMinsProp,
  onConfirm,
  onUnconfirm,
  onEditBlock,
  onDeleteBlock,
  onDeleteTask,
  onResizeStart,
  compareMatchedTaskIds,
  focusedCategoryId,
  focusedCalendarId,
  compact = false,
}: TimeBlockCardProps) {
  const [showPopover, setShowPopover] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState<'bottom-left' | 'top-right'>('bottom-left');
  const [popoverDragOffset, setPopoverDragOffset] = useState({ x: 0, y: 0 });
  const blockRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const POPOVER_MAX_H = 440;
  const GAP = 8;

  useLayoutEffect(() => {
    if (!showPopover || !isSelected || !blockRef.current || !popoverRef.current) return;
    const rect = blockRef.current.getBoundingClientRect();
    const viewportH = typeof window !== 'undefined' ? window.innerHeight : 800;
    const spaceBelow = viewportH - rect.bottom;
    setPopoverPosition(spaceBelow < POPOVER_MAX_H + GAP ? 'top-right' : 'bottom-left');
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

  const isCompareMode = mode === 'compare';
  const confirmed = block.mode === 'recorded';
  const matchedSet = compareMatchedTaskIds ? new Set(compareMatchedTaskIds) : null;

  const doSelect = onSelectBlock ? () => onSelectBlock(block.id) : (onSelect ?? (() => {}));
  const doDeselect = onSelectBlock ? () => onSelectBlock(null) : (onDeselect ?? (() => {}));

  const nowFallback = todayStrProp === undefined || nowMinsProp === undefined ? new Date() : null;
  const todayStr = todayStrProp ?? (nowFallback ? getLocalDateString(nowFallback) : '');
  const nowMins = nowMinsProp ?? (nowFallback ? nowFallback.getHours() * 60 + nowFallback.getMinutes() : 0);

  const blockEndMins = (() => {
    const [h, m] = block.end.split(':').map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  })();
  const isPast = block.date < todayStr || (block.date === todayStr && blockEndMins <= nowMins);
  type TimeState = 'future' | 'pastUnconfirmed' | 'pastConfirmed';
  const timeState: TimeState = isPast
    ? confirmed
      ? 'pastConfirmed'
      : 'pastUnconfirmed'
    : 'future';

  const blockVisualState = isCompareMode
    ? confirmed
      ? 'pastConfirmed'
      : 'ghost'
    : timeState;

  const isEvent = !block.taskId;
  const isTask = !!block.taskId;

  const handleCircleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmed) onUnconfirm?.(block.id);
    else onConfirm?.(block.id);
  };

  const getBaseOpacity = () => {
    if (blockVisualState === 'ghost') return 0.22;
    if (blockVisualState === 'future') return 1;
    if (blockVisualState === 'pastUnconfirmed') return 0.75;
    if (blockVisualState === 'pastConfirmed') return isTask ? 0.82 : 0.78;
    return 1;
  };

  const getOpacity = () => {
    let base = getBaseOpacity();
    if (isCompareMode && matchedSet) {
      const isMatched = block.taskId && matchedSet.has(block.taskId);
      base = isMatched ? base * 0.4 : Math.min(1, base + 0.25);
    }
    if (focusedCategoryId != null) {
      return (block.category?.id ?? block.categoryId) === focusedCategoryId ? base : FOCUS_MUTED_OPACITY;
    }
    if (focusedCalendarId != null) {
      return block.calendarContainerId === focusedCalendarId ? base : FOCUS_MUTED_OPACITY;
    }
    return base;
  };

  const getBlockColor = () => block.category?.color ?? block.calendarContainer?.color ?? '#4A80F0';
  const blockColor = getBlockColor();

  /**
   * Visual language:
   * - Events: Clean white/light background with a strong left color stripe. Structured, "locked in" feel.
   * - Tasks: Warm, slightly tinted background in the category color. Organic rounded corners. "Flexible" feel.
   */
  const getBlockInlineStyle = (): React.CSSProperties => {
    const opacity = getOpacity();
    const vars: Record<string, string> = {
      '--block-color': blockColor,
      '--circle-color': blockColor,
    };

    if (blockVisualState === 'ghost') {
      if (isEvent) {
        return {
          borderLeft: `3px solid ${hexToRgba(blockColor, 0.4)}`,
          backgroundColor: hexToRgba(blockColor, 0.06),
          opacity,
          ...vars,
        };
      }
      return {
        backgroundColor: hexToRgba(blockColor, 0.12),
        opacity,
        ...vars,
      };
    }

    if (isEvent) {
      // Events: prominent left stripe on light background
      const bgAlpha = blockVisualState === 'pastConfirmed' ? 0.07 : 0.1;
      const stripeAlpha = blockVisualState === 'pastConfirmed' ? 0.5 : 1;
      return {
        borderLeft: `4px solid ${hexToRgba(blockColor, stripeAlpha)}`,
        backgroundColor: hexToRgba(blockColor, bgAlpha),
        opacity,
        ...vars,
      };
    }

    // Tasks: warm tinted background, no left stripe
    const bgAlpha = blockVisualState === 'pastConfirmed' ? 0.65 : blockVisualState === 'pastUnconfirmed' ? 0.75 : 0.88;
    return {
      backgroundColor: hexToRgba(blockColor, bgAlpha),
      opacity,
      ...vars,
    };
  };

  const getTitleColor = (): string => {
    if (isEvent) {
      // Event titles in dark warm text, with subtle color tint
      if (blockVisualState === 'ghost') return 'text-[#AEAEB2]';
      return 'text-[#1C1C1E]';
    }
    // Task titles: get contrast vs the saturated bg
    const bgForContrast = blockColor;
    return getTextClassForBackground(bgForContrast);
  };

  const titleTextClass = getTitleColor();

  const getTimeRange = () => {
    const fmt = (t: string) => {
      const [h, m] = t.split(':').map(Number);
      const hour = h ?? 0;
      const min = m ?? 0;
      if (hour === 0 && min === 0) return '12:00 AM';
      if (hour === 12 && min === 0) return '12:00 PM';
      if (hour > 12) return `${hour - 12}:${String(min).padStart(2, '0')} PM`;
      return `${hour}:${String(min).padStart(2, '0')} AM`;
    };
    return `${fmt(block.start)} – ${fmt(block.end)}`;
  };

  const getDuration = () => {
    const [startHour, startMin] = block.start.split(':').map(Number);
    const [endHour, endMin] = block.end.split(':').map(Number);
    const minutes = (endHour * 60 + endMin) - (startHour * 60 + startMin);
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
    if (hours > 0) return `${hours}h`;
    return `${mins}m`;
  };

  const heightPx =
    typeof style.height === 'number'
      ? style.height
      : typeof style.height === 'string'
        ? parseFloat(style.height)
        : 0;
  const showMeta = heightPx >= 56;
  const showTags = heightPx >= 80;
  const showNotes = heightPx >= 100 && !!(block as any).notes;

  const getDurationMinutes = () => {
    const [startHour, startMin] = block.start.split(':').map(Number);
    const [endHour, endMin] = block.end.split(':').map(Number);
    return (endHour * 60 + endMin) - (startHour * 60 + startMin);
  };

  const handleBlockDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/x-timebox-block-id', block.id);
    e.dataTransfer.setData('application/x-timebox-block-duration', String(getDurationMinutes()));
    e.dataTransfer.setData('text/plain', block.title || 'Block');
    e.dataTransfer.effectAllowed = 'move';
    if (e.dataTransfer.setDragImage) {
      const ghost = document.createElement('div');
      const color = getBlockColor();
      ghost.style.cssText = `position:absolute;top:-9999px;padding:6px 12px;border-radius:8px;font-size:13px;font-weight:500;`;
      ghost.textContent = block.title || 'Block';
      ghost.style.color = '#1C1C1E';
      ghost.style.backgroundColor = hexToRgba(color, 0.15);
      ghost.style.border = `2px solid ${color}`;
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, 8, 8);
      requestAnimationFrame(() => document.body.removeChild(ghost));
    }
  };

  // Shared popover content
  const PopoverContent = () => (
    <div className="space-y-1">
      <div
        className="cursor-grab active:cursor-grabbing pb-2 -mx-3 px-3 -mt-1 pt-1 rounded-t-xl mb-2"
        style={{ borderBottom: '1px solid rgba(0,0,0,0.08)' }}
        onMouseDown={handlePopoverDragStart}
      >
        <div className="flex items-start gap-2">
          {/* Type badge */}
          <span
            className="mt-0.5 flex-shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-full tracking-wide uppercase"
            style={{
              backgroundColor: isEvent ? hexToRgba(blockColor, 0.12) : hexToRgba(blockColor, 0.18),
              color: blockColor,
            }}
          >
            {isEvent ? '📌 Event' : '✏️ Task'}
          </span>
          <span className="font-semibold text-sm leading-snug" style={{ color: '#1C1C1E' }}>{block.title || 'Untitled'}</span>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs py-0.5" style={{ color: '#636366' }}>
        <ClockIcon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: blockColor }} />
        <span>{getTimeRange()} · {getDuration()}</span>
      </div>
      <div className="flex items-center gap-2 text-xs py-0.5" style={{ color: '#636366' }}>
        <CalendarIcon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: blockColor }} />
        <span>{block.date}</span>
      </div>
      {block.category && (
        <div className="flex items-center gap-2 py-0.5">
          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: block.category.color }} />
          <span className="text-xs" style={{ color: '#636366' }}>{block.category.name}</span>
        </div>
      )}
      {block.calendarContainer && (
        <div className="flex items-center gap-2 py-0.5">
          <div className="w-3 h-3 rounded flex-shrink-0" style={{ backgroundColor: hexToRgba(block.calendarContainer.color, 0.3), border: `2px solid ${block.calendarContainer.color}` }} />
          <span className="text-xs" style={{ color: '#636366' }}>{block.calendarContainer.name}</span>
        </div>
      )}
      {block.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
          {block.tags.slice(0, 6).map((tag) => (
            <span
              key={tag.id}
              className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: hexToRgba(blockColor, 0.12),
                color: blockColor,
                border: `1px solid ${hexToRgba(blockColor, 0.25)}`,
              }}
            >
              {tag.name}
            </span>
          ))}
        </div>
      )}
      {(block as any).notes && (
        <div className="mt-1 pt-1 text-xs italic" style={{ borderTop: '1px solid rgba(0,0,0,0.05)', color: '#636366' }}>
          {(block as any).notes}
        </div>
      )}
      <div className="flex gap-1 pt-2" style={{ borderTop: '1px solid rgba(0,0,0,0.08)', marginTop: 6 }}>
        {onEditBlock && (
          <button
            type="button"
            className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-lg transition-colors"
            style={{ color: '#636366' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
            onClick={() => { onEditBlock(block.id); setShowPopover(false); doDeselect(); }}
          >
            <PencilIcon className="h-3.5 w-3.5" /> Edit
          </button>
        )}
        {onDeleteBlock && (
          <button
            type="button"
            className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-lg transition-colors"
            style={{ color: '#B85050' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(184,80,80,0.08)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
            onClick={() => { onDeleteBlock(block.id); setShowPopover(false); doDeselect(); }}
          >
            <TrashIcon className="h-3.5 w-3.5" /> Delete
          </button>
        )}
      </div>
    </div>
  );

  // ─── Compact mode (week view) ───────────────────────────────────────────
  if (compact) {
    const blockStyle = getBlockInlineStyle();
    const containerClass = isEvent
      ? 'h-full overflow-hidden min-w-0 rounded-r-lg'
      : 'h-full overflow-hidden min-w-0 rounded-xl shadow-sm';

    return (
      <div
        className="absolute cursor-grab active:cursor-grabbing pointer-events-auto"
        style={style}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={() => { doSelect(); setShowPopover(true); }}
        draggable
        onDragStart={handleBlockDragStart}
      >
        <div
          data-slot="block-container"
          className={cn(
            containerClass,
            isSelected && (isEvent ? 'ring-2 ring-offset-1' : 'ring-2 ring-offset-1'),
          )}
          style={{
            ...blockStyle,
            ...(isSelected ? { '--tw-ring-color': blockColor } as any : {}),
            boxShadow: isSelected ? `0 0 0 2px ${blockColor}` : undefined,
          }}
        >
          <div className="flex items-start h-full px-1.5 py-1 min-w-0 gap-1">
            {/* Completion circle for tasks */}
            {isTask && (
              <button
                type="button"
                onClick={handleCircleClick}
                className="flex-shrink-0 mt-0.5 w-3.5 h-3.5 min-w-[14px] rounded-full border-2 flex items-center justify-center transition-colors"
                style={
                  confirmed
                    ? { backgroundColor: blockColor, borderColor: blockColor }
                    : { backgroundColor: 'transparent', borderColor: 'rgba(255,255,255,0.7)' }
                }
                title={confirmed ? 'Mark not done' : 'Mark done'}
              >
                {confirmed && <CheckIcon className="h-2 w-2 text-white" />}
              </button>
            )}
            {/* Lock icon for events */}
            {isEvent && (
              <LockClosedIcon
                className="flex-shrink-0 mt-0.5 h-2.5 w-2.5 opacity-50"
                style={{ color: blockColor }}
              />
            )}
            <div className="min-w-0 flex-1">
              <div className={cn('text-[10px] font-semibold truncate leading-snug', titleTextClass)}>
                {block.title || 'Untitled'}
              </div>
              {showMeta && (
                <div className="text-[9px] opacity-70 truncate mt-0.5" style={{ color: isEvent ? '#636366' : 'inherit' }}>
                  {block.start.slice(0, 5)}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Compact popover */}
        {showPopover && isSelected && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => { setShowPopover(false); doDeselect(); }} aria-hidden />
            <div
              ref={popoverRef}
              className="absolute z-20 rounded-xl shadow-xl border p-3 min-w-56 max-w-xs"
              style={{
                top: '100%', left: 0, marginTop: 6,
                backgroundColor: '#FFFFFF',
                borderColor: 'rgba(0,0,0,0.09)',
              }}
            >
              <PopoverContent />
            </div>
          </>
        )}
      </div>
    );
  }

  // ─── Full mode (day view) ────────────────────────────────────────────────
  const blockStyle = getBlockInlineStyle();
  const containerClass = isEvent
    ? 'h-full overflow-hidden min-w-0 rounded-r-lg'   // events: stripe + rounded right
    : 'h-full overflow-hidden min-w-0 rounded-xl shadow-sm'; // tasks: fully rounded, warm

  return (
    <div
      ref={blockRef}
      className="absolute cursor-grab active:cursor-grabbing group pr-1 pointer-events-auto"
      style={style}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={() => { doSelect(); setShowPopover(true); }}
      draggable
      onDragStart={handleBlockDragStart}
    >
      <div
        data-slot="block-container"
        className={cn(containerClass)}
        style={{
          ...blockStyle,
          boxShadow: isSelected ? `0 0 0 2px ${blockColor}, 0 0 0 4px rgba(255,255,255,0.8)` : undefined,
        }}
      >
        <div className="flex flex-col h-full min-w-0" style={{ padding: isEvent ? '6px 8px 6px 10px' : '8px 10px' }}>
          {/* Header row */}
          <div className="flex items-start gap-1.5 min-w-0 flex-shrink-0">
            {/* Task: completion circle */}
            {isTask && (
              <button
                type="button"
                onClick={handleCircleClick}
                className="flex-shrink-0 mt-0.5 w-4 h-4 min-w-[16px] rounded-full border-2 flex items-center justify-center transition-all"
                style={
                  confirmed
                    ? { backgroundColor: 'rgba(255,255,255,0.9)', borderColor: 'rgba(255,255,255,0.9)' }
                    : { backgroundColor: 'transparent', borderColor: 'rgba(255,255,255,0.65)' }
                }
                title={confirmed ? 'Mark not done' : 'Mark done'}
                aria-label={confirmed ? 'Mark not done' : 'Mark done'}
              >
                {confirmed && <CheckIcon className="h-2.5 w-2.5" style={{ color: blockColor }} />}
              </button>
            )}
            {/* Event: lock icon */}
            {isEvent && (
              <LockClosedIcon
                className="flex-shrink-0 mt-0.5 h-3 w-3 opacity-40"
                style={{ color: blockColor }}
              />
            )}

            <span
              className={cn(
                'font-semibold text-xs leading-snug flex-1 min-w-0',
                titleTextClass,
                isTask && confirmed && 'line-through decoration-current/40',
                heightPx < 36 && 'truncate',
              )}
              style={{ textDecorationSkipInk: 'none' }}
            >
              {block.title || 'Untitled'}
            </span>

            {/* Type indicator pill (tiny, top-right) */}
            <span
              className="flex-shrink-0 text-[8px] font-bold opacity-60 tracking-widest uppercase mt-0.5 leading-none"
              style={{ color: isEvent ? blockColor : 'rgba(255,255,255,0.85)' }}
            >
              {isEvent ? 'EVT' : 'TSK'}
            </span>
          </div>

          {/* Meta row */}
          {showMeta && (
            <div className={cn(
              'flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-1 min-w-0 text-[10px]',
              isEvent ? 'text-[#636366]' : 'text-white/75',
            )}>
              <span className="whitespace-nowrap opacity-90">{getTimeRange()}</span>
              {block.category && heightPx >= 64 && (
                <span
                  className="px-1.5 py-0.5 rounded-full font-medium"
                  style={
                    isEvent
                      ? { backgroundColor: hexToRgba(blockColor, 0.15), color: blockColor }
                      : { backgroundColor: 'rgba(255,255,255,0.22)', color: 'rgba(255,255,255,0.9)' }
                  }
                >
                  {block.category.name}
                </span>
              )}
            </div>
          )}

          {/* Tags row */}
          {showTags && block.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {block.tags.slice(0, 4).map((tag) => (
                <span
                  key={tag.id}
                  className="text-[9px] font-medium px-1.5 py-0.5 rounded-full"
                  style={
                    isEvent
                      ? { backgroundColor: hexToRgba(blockColor, 0.12), color: blockColor }
                      : { backgroundColor: 'rgba(255,255,255,0.22)', color: 'rgba(255,255,255,0.88)' }
                  }
                >
                  {tag.name}
                </span>
              ))}
            </div>
          )}

          {/* Notes preview */}
          {showNotes && (
            <div
              className="mt-1 text-[10px] italic line-clamp-2 opacity-70"
              style={{ color: isEvent ? '#636366' : 'rgba(255,255,255,0.85)' }}
            >
              {(block as any).notes}
            </div>
          )}
        </div>

        {/* Resize handle (tasks only) */}
        {onResizeStart && isTask && (
          <div
            className="absolute bottom-0 left-0 right-0 h-3 cursor-ns-resize opacity-0 group-hover:opacity-100 transition-opacity"
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onResizeStart(block.id, e); }}
          >
            <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-white/50 rounded-full" />
          </div>
        )}
      </div>

      {/* Full popover */}
      {showPopover && isSelected && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={(e) => {
              e.stopPropagation();
              setShowPopover(false);
              setPopoverDragOffset({ x: 0, y: 0 });
              doDeselect();
            }}
          />
          <div
            ref={popoverRef}
            className="absolute z-20 rounded-xl shadow-xl border p-3 min-w-60 max-w-xs"
            style={{
              ...(popoverPosition === 'bottom-left'
                ? { top: '100%', left: 0, marginTop: 8 }
                : { bottom: '100%', right: 0, marginBottom: 8 }),
              transform: `translate(${popoverDragOffset.x}px, ${popoverDragOffset.y}px)`,
              backgroundColor: '#FFFFFF',
              borderColor: 'rgba(0,0,0,0.09)',
            }}
          >
            <PopoverContent />
          </div>
        </>
      )}
    </div>
  );
}

export const TimeBlockCard = memo(TimeBlockCardInner);
