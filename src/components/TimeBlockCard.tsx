import React, { useState, useRef, useLayoutEffect, memo } from 'react';
import { Mode } from '../types';
import { ResolvedTimeBlock } from '../utils/dataResolver';
import { getLocalDateString } from '../utils/dateTime';
import { getTextClassForBackground, hexToRgba, lighten, desaturate } from '../utils/color';
import { THEME } from '../constants/colors';
import { activeDrag } from '../utils/dragState';
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

  const getBlockColor = () => block.category?.color ?? block.calendarContainer?.color ?? THEME.primary;
  const blockColor = getBlockColor();

  /**
   * Visual language:
   * - Events: Clean white/light background with a strong left color stripe. Structured, "locked in" feel.
   * - Tasks: Drag-preview aesthetic — light tinted fill + dashed border. Clean, flexible feel.
   *   Future: 45% fill + dashed border (active, needs to be done)
   *   PastUnconfirmed: 18% fill + dashed border (faded, needs action)
   *   PastConfirmed: 15% fill + solid border (done, muted)
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
        background: `linear-gradient(${hexToRgba(blockColor, 0.18)}, ${hexToRgba(blockColor, 0.18)}), #FDFDFB`,
        border: `1px solid ${hexToRgba(blockColor, 0.2)}`,
        opacity,
        ...vars,
      };
    }

    if (isEvent) {
      // Events: prominent left stripe on light background
      // Past states: desaturate color for a grayer, more faded look
      const eventDisplayColor = (blockVisualState === 'pastUnconfirmed' || blockVisualState === 'pastConfirmed')
        ? desaturate(blockColor, 0.45)
        : blockColor;
      const bgAlpha = blockVisualState === 'pastConfirmed' ? 0.06 : blockVisualState === 'pastUnconfirmed' ? 0.08 : 0.1;
      const stripeAlpha = blockVisualState === 'pastConfirmed' ? 0.30 : blockVisualState === 'pastUnconfirmed' ? 0.50 : 1;
      return {
        borderLeft: `3px solid ${hexToRgba(eventDisplayColor, stripeAlpha)}`,
        backgroundColor: hexToRgba(eventDisplayColor, bgAlpha),
        opacity,
        ...vars,
      };
    }

    // Tasks: sticky-note aesthetic — colored top border + warm cream bg + subtle shadow
    if (blockVisualState === 'future') {
      return {
        backgroundColor: '#FFF9EC',
        borderTop: `3px solid ${blockColor}`,
        borderLeft: `1px solid ${hexToRgba(blockColor, 0.22)}`,
        borderRight: `1px solid ${hexToRgba(blockColor, 0.22)}`,
        borderBottom: `1px solid ${hexToRgba(blockColor, 0.22)}`,
        borderRadius: 5,
        boxShadow: '0 2px 6px rgba(0,0,0,0.10), 0 1px 2px rgba(0,0,0,0.06)',
        opacity,
        ...vars,
      };
    }
    if (blockVisualState === 'pastUnconfirmed') {
      return {
        backgroundColor: '#FDFAF3',
        borderTop: `3px solid ${hexToRgba(blockColor, 0.45)}`,
        borderLeft: `1px solid ${hexToRgba(blockColor, 0.12)}`,
        borderRight: `1px solid ${hexToRgba(blockColor, 0.12)}`,
        borderBottom: `1px solid ${hexToRgba(blockColor, 0.12)}`,
        borderRadius: 5,
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        opacity,
        ...vars,
      };
    }
    // Past confirmed: neutral, settled
    return {
      backgroundColor: 'rgba(0,0,0,0.035)',
      borderTop: `3px solid ${hexToRgba(blockColor, 0.25)}`,
      borderLeft: `1px solid ${hexToRgba(blockColor, 0.10)}`,
      borderRight: `1px solid ${hexToRgba(blockColor, 0.10)}`,
      borderBottom: `1px solid ${hexToRgba(blockColor, 0.10)}`,
      borderRadius: 5,
      opacity,
      ...vars,
    };
  };

  const getTitleColor = (): string => {
    if (isEvent) {
      if (blockVisualState === 'ghost') return 'text-[#AEAEB2]';
      return 'text-[#1C1C1E]';
    }
    // Tasks now have lighter tinted backgrounds — use dark text always
    return 'text-[#1C1C1E]';
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

  // ─── Adaptive size tiers ─────────────────────────────────────────────────
  // Compact (week view) tiers
  const compactTier =
    heightPx < 18 ? 'micro' :
    heightPx < 32 ? 'tiny'  :
    heightPx < 50 ? 'small' : 'medium';

  // Full (day / 3-day view) tiers
  const sizeTier =
    heightPx < 22  ? 'micro'  :
    heightPx < 36  ? 'tiny'   :
    heightPx < 52  ? 'small'  :
    heightPx < 72  ? 'medium' :
    heightPx < 100 ? 'full'   : 'rich';

  // Events show time at small+ (>= 52px); tasks only at medium+ to avoid clutter
  const showMeta = isEvent
    ? sizeTier !== 'micro' && sizeTier !== 'tiny'
    : sizeTier === 'medium' || sizeTier === 'full' || sizeTier === 'rich';
  const showCategory = sizeTier === 'full' || sizeTier === 'rich';
  const showTags = sizeTier === 'rich' && block.tags.length > 0;
  const showNotes = sizeTier === 'rich' && !!(block as any).notes;

  const getDurationMinutes = () => {
    const [startHour, startMin] = block.start.split(':').map(Number);
    const [endHour, endMin] = block.end.split(':').map(Number);
    return (endHour * 60 + endMin) - (startHour * 60 + startMin);
  };

  const handleBlockDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/x-timebox-block-id', block.id);
    e.dataTransfer.setData('application/x-timebox-block-duration', String(getDurationMinutes()));
    e.dataTransfer.setData('application/x-timebox-block-color', getBlockColor());
    e.dataTransfer.setData('text/plain', block.title || 'Block');
    e.dataTransfer.effectAllowed = 'move';
    activeDrag.type = block.taskId ? 'task' : 'event';
    activeDrag.duration = getDurationMinutes();
    activeDrag.color = getBlockColor();
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
    // Events: rounded right side. Tasks: borderRadius from inline style.
    const containerClass = isEvent
      ? 'h-full overflow-hidden min-w-0 rounded-r-sm'
      : 'h-full overflow-hidden min-w-0';

    return (
      <div
        className="absolute cursor-grab active:cursor-grabbing pointer-events-auto"
        style={style}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={() => { doSelect(); setShowPopover((v) => !v); }}
        draggable
        onDragStart={handleBlockDragStart}
        onDragEnd={() => { activeDrag.type = null; }}
      >
        <div
          data-slot="block-container"
          className={containerClass}
          style={{
            ...blockStyle,
            boxShadow: isSelected ? `0 0 0 1.5px ${blockColor}` : undefined,
          }}
        >
          {/* micro: just colored fill, no content */}
          {compactTier === 'micro' ? null : (
            <div
              className="flex items-center h-full min-w-0"
              style={{ padding: compactTier === 'tiny' ? '1px 3px' : '2px 5px', gap: 2 }}
            >
              {isEvent && compactTier !== 'tiny' && (
                <LockClosedIcon className="flex-shrink-0 h-1.5 w-1.5 opacity-40" style={{ color: blockColor }} />
              )}
              <div className="min-w-0 flex-1 overflow-hidden">
                <div
                  className={cn(isTask ? 'font-semibold' : 'font-medium', 'truncate leading-none', titleTextClass)}
                  style={{ fontSize: compactTier === 'tiny' ? 10 : isTask ? 12 : 11 }}
                >
                  {block.title || 'Untitled'}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Compact popover */}
        {showPopover && isSelected && (
          <>
            <div className="fixed inset-0 z-10" style={{ pointerEvents: 'auto' }} onClick={() => { setShowPopover(false); doDeselect(); }} aria-hidden />
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

  // ─── Full mode (day / 3-day view) ───────────────────────────────────────
  const blockStyle = getBlockInlineStyle();
  // Events: rounded right side. Tasks: borderRadius from inline style.
  const containerClass = isEvent
    ? 'h-full overflow-hidden min-w-0 rounded-r-md'
    : 'h-full overflow-hidden min-w-0';

  // Padding scales with size
  const fullPadding =
    sizeTier === 'micro' ? '1px 6px' :
    sizeTier === 'tiny'  ? '2px 8px' :
    isEvent ? '5px 8px 5px 10px' : '5px 8px';

  // Format short time like "9:00" or "9am"
  const fmtShort = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    const hour = h ?? 0;
    const min = m ?? 0;
    const suffix = hour >= 12 ? 'pm' : 'am';
    const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return min === 0 ? `${h12}${suffix}` : `${h12}:${String(min).padStart(2, '0')}${suffix}`;
  };

  return (
    <div
      ref={blockRef}
      className="absolute cursor-grab active:cursor-grabbing group pointer-events-auto"
      style={style}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={() => { doSelect(); setShowPopover((v) => !v); }}
      draggable
      onDragStart={handleBlockDragStart}
      onDragEnd={() => { activeDrag.type = null; }}
    >
      <div
        data-slot="block-container"
        className={cn('relative', containerClass)}
        style={{
          ...blockStyle,
          boxShadow: isSelected ? `0 0 0 2px ${blockColor}, 0 0 0 4px rgba(255,255,255,0.8)` : undefined,
        }}
      >
        {sizeTier === 'micro' ? (
          /* micro: just a colored sliver — no text */
          <div className="h-full w-full" />
        ) : sizeTier === 'tiny' ? (
          /* tiny: single-line title only */
          <div className="flex items-center h-full min-w-0" style={{ padding: fullPadding, gap: 4 }}>
            {isEvent && (
              <LockClosedIcon className="flex-shrink-0 opacity-35" style={{ width: 8, height: 8, color: blockColor }} />
            )}
            <span
              className={cn('font-medium truncate leading-none min-w-0', titleTextClass)}
              style={{ fontSize: 10 }}
            >
              {block.title || 'Untitled'}
            </span>
          </div>
        ) : (
          /* small+: title at top, time at bottom-right */
          <div className="flex flex-col justify-between h-full min-w-0" style={{ padding: fullPadding }}>
            {/* Title — wraps naturally, no ellipsis */}
            <span
              className={cn(
                isTask ? 'font-semibold' : 'font-medium',
                'leading-snug min-w-0',
                titleTextClass,
                isTask && confirmed && 'line-through decoration-current/40',
              )}
              style={{
                fontSize: isTask ? 13 : 11,
                textDecorationSkipInk: 'none',
                overflow: 'hidden',
                wordBreak: 'break-word',
              }}
            >
              {block.title || 'Untitled'}
            </span>

            {/* Bottom row: time-range right-aligned + optional category */}
            {showMeta && (
              <div className="flex items-end justify-between gap-1 mt-1 min-w-0">
                {block.category && showCategory ? (
                  <span
                    className="text-[9px] font-medium px-1.5 py-[1px] rounded-full truncate max-w-[50%]"
                    style={{ backgroundColor: hexToRgba(blockColor, 0.15), color: blockColor }}
                  >
                    {block.category.name}
                  </span>
                ) : <span />}
                <span
                  className="text-[10px] tabular-nums shrink-0"
                  style={{ color: '#1C1C1E', opacity: 0.5 }}
                >
                  {fmtShort(block.start)}–{fmtShort(block.end)}
                </span>
              </div>
            )}

            {/* Tags — rich only */}
            {showTags && (
              <div className="flex flex-wrap gap-1 mt-1 overflow-hidden" style={{ maxHeight: '28px' }}>
                {block.tags.slice(0, 4).map((tag) => (
                  <Chip
                    key={tag.id}
                    variant="subtle"
                    color={blockColor}
                    contrastBackgroundHex={undefined}
                    className="text-[9px] py-0.5 px-1.5"
                  >
                    {tag.name}
                  </Chip>
                ))}
              </div>
            )}

            {/* Notes — rich only */}
            {showNotes && (
              <div
                className="mt-0.5 italic line-clamp-2 opacity-65"
                style={{ fontSize: 9.5, color: '#636366' }}
              >
                {(block as any).notes}
              </div>
            )}
          </div>
        )}

        {/* Confirm circle — tiny overlay top-right (tasks only) */}
        {isTask && sizeTier !== 'micro' && sizeTier !== 'tiny' && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleCircleClick(e); }}
            className="absolute top-1.5 right-1.5 flex items-center justify-center rounded-full transition-all"
            style={{
              width: 12, height: 12,
              opacity: confirmed ? 1 : 0.6,
              ...(confirmed
                ? { backgroundColor: blockColor, border: `1.5px solid ${blockColor}` }
                : { backgroundColor: 'transparent', border: `1.5px solid ${hexToRgba(blockColor, 0.5)}` }),
            }}
            title={confirmed ? 'Mark not done' : 'Mark done'}
            aria-label={confirmed ? 'Mark not done' : 'Mark done'}
          >
            {confirmed && <CheckIcon className="h-[6px] w-[6px]" style={{ color: '#FFFFFF' }} />}
          </button>
        )}

        {/* Resize handle (tasks only, small+) */}
        {onResizeStart && isTask && sizeTier !== 'micro' && sizeTier !== 'tiny' && (
          <div
            className="absolute bottom-0 left-0 right-0 h-3 cursor-ns-resize opacity-0 group-hover:opacity-100 transition-opacity"
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onResizeStart(block.id, e); }}
          >
            <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full" style={{ backgroundColor: hexToRgba(blockColor, 0.35) }} />
          </div>
        )}
      </div>

      {/* Full popover */}
      {showPopover && isSelected && (
        <>
          <div
            className="fixed inset-0 z-10"
            style={{ pointerEvents: 'auto' }}
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
