import React, { useState, useRef, useLayoutEffect, memo } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Mode } from '../types';
import { ResolvedTimeBlock } from '../utils/dataResolver';
import { getLocalDateString } from '../utils/dateTime';
import { getTextClassForBackground, hexToRgba, lighten, desaturate } from '../utils/color';
import { CalendarIcon, CheckIcon, ClockIcon, PencilIcon, TrashIcon, XMarkIcon } from '@heroicons/react/24/solid';
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
  /** React key (not used by component, but included to satisfy some typecheckers). */
  key?: string;
  block: ResolvedTimeBlock;
  mode: Mode;
  style: React.CSSProperties;
  isSelected: boolean;
  /** Preferred: stable callback; card calls onSelectBlock(block.id) / onSelectBlock(null). */
  onSelectBlock?: (id: string | null) => void;
  /** Legacy: use when onSelectBlock not provided. */
  onSelect?: () => void;
  onDeselect?: () => void;
  /** Today's date string (YYYY-MM-DD) — from parent to avoid new Date() per block. */
  todayStr?: string;
  /** Current time in minutes since midnight — from parent to avoid new Date() per block. */
  nowMins?: number;
  /** Toggle confirmed: call when circle is clicked and block is unconfirmed (mark as confirmed). */
  onConfirm?: (blockId: string) => void;
  /** Toggle confirmed: call when circle is clicked and block is confirmed (undo confirm). */
  onUnconfirm?: (blockId: string) => void;
  onEditBlock?: (blockId: string) => void;
  onDeleteBlock?: (blockId: string) => void;
  onDeleteTask?: (taskId: string) => void;
  /** Called when user mousedowns on the bottom-edge resize handle. Card calls with (block.id, e) for stable callback. */
  onResizeStart?: (blockId: string, e: React.MouseEvent) => void;
  /** For compare mode: taskIds that have both planned and recorded blocks that day. */
  compareMatchedTaskIds?: string[];
  focusedCategoryId?: string | null;
  focusedCalendarId?: string | null;
  compact?: boolean;
}

const FOCUS_MUTED_OPACITY = 0.35;

const completionCircleVariants = cva(
  'shrink-0 rounded-full flex items-center justify-center border-2 transition-colors w-5 h-5 min-w-[20px] min-h-[20px]',
  {
    variants: {
      state: {
        unconfirmed: 'bg-transparent border-neutral-400 hover:border-[var(--circle-color)]',
        confirmed: 'border-transparent',
      },
    },
    defaultVariants: { state: 'unconfirmed' },
  }
);

const blockContainerVariants = cva(
  'h-full transition-all relative overflow-hidden min-w-0',
  {
    variants: {
      type: {
        event: 'rounded-lg border',
        task: 'rounded-xl shadow-md font-[family-name:var(--font-handwriting)]',
      },
      timeState: {
        future: '',
        pastUnconfirmed: '',
        pastConfirmed: '',
        ghost: '',
      },
    },
    compoundVariants: [
      { type: 'event', timeState: 'future', className: 'border-neutral-200/80 shadow-sm' },
      { type: 'event', timeState: 'pastUnconfirmed', className: 'border-neutral-200/60 shadow-sm' },
      { type: 'event', timeState: 'pastConfirmed', className: 'border-0 border-l-2 border-[var(--block-color)] shadow-none' },
      { type: 'event', timeState: 'ghost', className: 'border-neutral-200/50' },
      { type: 'task', timeState: 'future', className: 'shadow-md' },
      { type: 'task', timeState: 'pastUnconfirmed', className: 'shadow-sm' },
      { type: 'task', timeState: 'pastConfirmed', className: 'shadow-sm' },
      { type: 'task', timeState: 'ghost', className: 'shadow-sm' },
    ],
    defaultVariants: { type: 'event', timeState: 'future' },
  }
);

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

  const POPOVER_MAX_H = 420;
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

  // Compare mode: ghost (planned column) or pastConfirmed (recorded column)
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
    if (blockVisualState === 'ghost') return 0.25;
    if (blockVisualState === 'future') return 1;
    if (blockVisualState === 'pastUnconfirmed' || blockVisualState === 'pastConfirmed') return isTask ? 0.82 : 0.78;
    return 1;
  };

  // When a category or calendar is focused, exaggerate matching blocks and mute others
  const getOpacity = () => {
    let base = getBaseOpacity();

    // In compare mode, dim matched tasks and highlight mismatches.
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

  const getBlockColor = () => block.category?.color ?? block.calendarContainer?.color ?? '#6b7280';
  const blockColor = getBlockColor();
  const foldColor = lighten(blockColor, 0.1);

  /** Inline style: only backgroundColor and CSS variables for borders/fold. */
  const getBlockInlineStyle = (): React.CSSProperties => {
    const base = blockColor;
    const opacity = getOpacity();
    const vars: Record<string, string> = {
      '--block-color': base,
      '--block-fold-color': foldColor,
      '--circle-color': base,
    };
    if (blockVisualState === 'ghost') {
      return { backgroundColor: hexToRgba(base, 0.2), opacity, ...vars };
    }
    if (isEvent) {
      const softened = hexToRgba(base, 0.92);
      if (blockVisualState === 'future') return { backgroundColor: softened, opacity, ...vars };
      if (blockVisualState === 'pastUnconfirmed' || blockVisualState === 'pastConfirmed') return { backgroundColor: desaturate(softened, 0.2), opacity, ...vars };
      return { backgroundColor: hexToRgba(base, 0.2), opacity, ...vars };
    }
    const softened = hexToRgba(base, 0.95);
    if (blockVisualState === 'future') return { backgroundColor: softened, opacity, ...vars };
    if (blockVisualState === 'pastUnconfirmed' || blockVisualState === 'pastConfirmed') return { backgroundColor: desaturate(softened, 0.15), opacity, ...vars };
    return { backgroundColor: hexToRgba(base, 0.25), opacity, ...vars };
  };

  const titleBgHex =
    blockVisualState === 'pastUnconfirmed' || blockVisualState === 'pastConfirmed'
      ? isEvent
        ? lighten(desaturate(blockColor, 0.2), 0.6)
        : lighten(desaturate(blockColor, 0.15), 0.55)
      : blockColor;
  const titleTextClass = getTextClassForBackground(titleBgHex);
  const checkIconClass = getTextClassForBackground(blockColor);

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
  const showTags = heightPx >= 72;

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
      ghost.className = 'rounded-lg shadow-lg px-3 py-2 text-sm font-medium';
      ghost.textContent = block.title || 'Block';
      ghost.style.position = 'absolute';
      ghost.style.top = '-9999px';
      ghost.style.backgroundColor = hexToRgba(color, 0.2);
      ghost.style.border = `2px solid ${color}`;
      ghost.style.color = '#1f2937';
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, 8, 8);
      requestAnimationFrame(() => document.body.removeChild(ghost));
    }
  };

  // Compact mode for week view
  if (compact) {
    return (
      <div
        className="absolute cursor-grab active:cursor-grabbing pointer-events-auto"
        style={style}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={() => {
          doSelect();
          setShowPopover(true);
        }}
        draggable
        onDragStart={handleBlockDragStart}
      >
        <div
          data-slot="block-container"
          className={cn(
            blockContainerVariants({ type: isTask ? 'task' : 'event', timeState: blockVisualState }),
            isTask && 'after:content-[""] after:absolute after:top-0 after:right-0 after:w-3 after:h-3 after:border-b after:border-l after:rounded-bl after:border-[var(--block-fold-color)]',
            isSelected && 'ring-1 ring-blue-400'
          )}
          style={getBlockInlineStyle()}
        >
          <div className="flex items-start gap-2 h-full px-1.5 py-1 min-w-0">
            <button
              type="button"
              onClick={handleCircleClick}
              data-slot="completion-circle"
              className={cn(completionCircleVariants({ state: confirmed ? 'confirmed' : 'unconfirmed' }), 'mt-0.5 -ml-0.5 p-0.5')}
              style={
                confirmed
                  ? { backgroundColor: blockColor, ['--circle-color' as string]: blockColor }
                  : { ['--circle-color' as string]: blockColor }
              }
              title={confirmed ? 'Mark not done' : 'Mark done'}
              aria-label={confirmed ? 'Mark not done' : 'Mark done'}
            >
              {confirmed && <CheckIcon className={cn('h-3 w-3', checkIconClass)} />}
            </button>
            <div className="min-w-0 flex-1">
              <div
                className={cn(
                  'text-xs font-medium truncate',
                  titleTextClass,
                  isTask && confirmed && 'line-through decoration-neutral-400/70'
                )}
              >
                {block.title || 'Untitled'}
              </div>
              <div className="text-[10px] text-neutral-500 truncate mt-0.5">
                {getTimeRange()}
              </div>
            </div>
          </div>
        </div>

        {/* Popover: details + Edit + Delete */}
        {showPopover && isSelected && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => { setShowPopover(false); doDeselect(); }} aria-hidden />
            <div className="absolute z-20 top-full mt-2 left-0 bg-white rounded-lg shadow-lg border border-neutral-200 p-3 min-w-56">
              <div className="font-semibold text-sm text-neutral-800 mb-2 truncate">{block.title || 'Untitled'}</div>
              <div className="flex items-center gap-2 text-xs text-neutral-500 mb-1.5">
                <ClockIcon className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{getTimeRange()} ({getDuration()})</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-neutral-500 mb-1.5">
                <CalendarIcon className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{block.date}</span>
              </div>
              {block.category && (
                <div className="flex items-center gap-2 text-xs text-neutral-500 mb-1.5">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: block.category.color }} />
                  <span>{block.category.name}</span>
                </div>
              )}
              {block.calendarContainer && (
                <div className="flex items-center gap-2 text-xs text-neutral-500 mb-3">
                  <div className="w-3 h-3 rounded flex-shrink-0 border" style={{ backgroundColor: block.calendarContainer.color, borderColor: block.calendarContainer.color }} />
                  <span>{block.calendarContainer.name}</span>
                </div>
              )}
              {block.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 p-1 mb-2">
                  {block.tags.slice(0, 5).map((tag) => (
                    <Chip key={tag.id} variant="outline" color={blockColor} className="max-w-[80px]">
                      {tag.name}
                    </Chip>
                  ))}
                </div>
              )}
              <div className="border-t border-neutral-200 my-1" />
              <div className="flex gap-1">
                {onEditBlock && (
                  <button type="button" className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm text-neutral-700 hover:bg-neutral-50 rounded-md transition-colors" onClick={() => { onEditBlock(block.id); setShowPopover(false); doDeselect(); }}>
                    <PencilIcon className="h-4 w-4" /> Edit
                  </button>
                )}
                {onDeleteBlock && (
                  <button type="button" className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm text-red-600 hover:bg-red-50 rounded-md transition-colors" onClick={() => { onDeleteBlock(block.id); setShowPopover(false); doDeselect(); }}>
                    <TrashIcon className="h-4 w-4" /> Delete
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div
      ref={blockRef}
      className="absolute cursor-grab active:cursor-grabbing group pr-1 pointer-events-auto"
      style={style}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={() => {
        doSelect();
        setShowPopover(true);
      }}
      draggable
      onDragStart={handleBlockDragStart}
    >
      <div
        data-slot="block-container"
        className={cn(
          blockContainerVariants({ type: isTask ? 'task' : 'event', timeState: blockVisualState }),
          isTask && 'after:content-[""] after:absolute after:top-0 after:right-0 after:w-5 after:h-5 after:border-b after:border-l after:rounded-bl-lg after:border-[var(--block-fold-color)]',
          isSelected && 'ring-2 ring-blue-400 ring-offset-1'
        )}
        style={getBlockInlineStyle()}
      >
          <div className="flex flex-col h-full p-3 min-w-0">
          <div className="flex items-start gap-2 min-w-0 flex-shrink-0">
            <button
              type="button"
              onClick={handleCircleClick}
              data-slot="completion-circle"
              className={cn(completionCircleVariants({ state: confirmed ? 'confirmed' : 'unconfirmed' }), 'mt-0.5 -ml-0.5 p-0.5')}
              style={
                confirmed
                  ? { backgroundColor: blockColor, ['--circle-color' as string]: blockColor }
                  : { ['--circle-color' as string]: blockColor }
              }
              title={confirmed ? 'Mark not done' : 'Mark done'}
              aria-label={confirmed ? 'Mark not done' : 'Mark done'}
            >
              {confirmed && <CheckIcon className={cn('h-3 w-3', checkIconClass)} />}
            </button>
            <span
              className={cn(
                'font-medium text-sm leading-snug truncate flex-1 min-w-0',
                titleTextClass,
                isTask && confirmed && 'line-through decoration-neutral-400/70'
              )}
              style={{ textDecorationSkipInk: 'none' }}
            >
              {block.title || 'Untitled'}
            </span>
          </div>
          <div className={cn('flex flex-wrap items-center gap-1.5 mt-1.5 min-w-0 text-xs', titleTextClass)}>
            <span className="whitespace-nowrap opacity-90">{getTimeRange()}</span>
            {block.category && (
              <Chip variant="subtle" color={blockColor} contrastBackgroundHex={titleBgHex} className="max-w-[100px] text-[10px]">
                {block.category.name}
              </Chip>
            )}
            {showTags && block.tags.length > 0 && (
              <span className="flex flex-wrap gap-1 p-1 items-center">
                {block.tags.map((tag) => (
                  <Chip key={tag.id} variant="outline" color={blockColor} contrastBackgroundHex={titleBgHex} className="max-w-[80px] text-[10px] shrink-0">
                    {tag.name}
                  </Chip>
                ))}
              </span>
            )}
          </div>
        </div>

        {onResizeStart && (
          <div
            className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize opacity-0 group-hover:opacity-100 transition-opacity"
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onResizeStart(block.id, e); }}
          >
            <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-8 h-1 bg-white/40 rounded-full" />
          </div>
        )}
      </div>

      {/* Popover: position top-right if would overflow bottom; draggable */}
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
            className="absolute z-20 bg-white rounded-lg shadow-lg border border-neutral-200 p-3 min-w-56"
            style={{
              ...(popoverPosition === 'bottom-left'
                ? { top: '100%', left: 0, marginTop: 8 }
                : { bottom: '100%', right: 0, marginBottom: 8 }),
              transform: `translate(${popoverDragOffset.x}px, ${popoverDragOffset.y}px)`,
            }}
          >
            <div
              className="cursor-grab active:cursor-grabbing border-b border-neutral-100 pb-2 -mx-3 px-3 -mt-1 pt-1 rounded-t-lg"
              onMouseDown={handlePopoverDragStart}
            >
              <div className="font-semibold text-sm text-neutral-800 truncate">{block.title || 'Untitled'}</div>
            </div>
            <div className="pt-2">
            <div className="flex items-center gap-2 text-xs text-neutral-500 mb-1.5">
              <ClockIcon className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{getTimeRange()} ({getDuration()})</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-neutral-500 mb-1.5">
              <CalendarIcon className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{block.date}</span>
            </div>
            {block.category && (
              <div className="flex items-center gap-2 text-xs text-neutral-500 mb-1.5">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: block.category.color }} />
                <span>{block.category.name}</span>
              </div>
            )}
            {block.calendarContainer && (
              <div className="flex items-center gap-2 text-xs text-neutral-500 mb-3">
                <div className="w-3 h-3 rounded flex-shrink-0 border" style={{ backgroundColor: block.calendarContainer.color, borderColor: block.calendarContainer.color }} />
                <span>{block.calendarContainer.name}</span>
              </div>
            )}
            {block.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 p-1 mb-2">
                {block.tags.slice(0, 5).map((tag) => (
                  <Chip key={tag.id} variant="outline" color={blockColor} className="max-w-[80px]">
                    {tag.name}
                  </Chip>
                ))}
              </div>
            )}
            <div className="border-t border-neutral-200 my-1" />
            <div className="flex gap-1">
              {onEditBlock && (
                <button type="button" className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm text-neutral-700 hover:bg-neutral-50 rounded-md transition-colors" onClick={() => { onEditBlock(block.id); setShowPopover(false); doDeselect(); }}>
                  <PencilIcon className="h-4 w-4" /> Edit
                </button>
              )}
              {onDeleteBlock && (
                <button type="button" className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm text-red-600 hover:bg-red-50 rounded-md transition-colors" onClick={() => { onDeleteBlock(block.id); setShowPopover(false); doDeselect(); }}>
                  <XMarkIcon className="h-4 w-4" /> Delete
                </button>
              )}
            </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export const TimeBlockCard = memo(TimeBlockCardInner);