import React, { useState, useRef, useLayoutEffect, useEffect, memo } from 'react';
import { createPortal } from 'react-dom';
import { Mode } from '../types';
import { ResolvedTimeBlock } from '../utils/dataResolver';
import { getLocalDateString } from '../utils/dateTime';
import { getTextClassForBackground, hexToRgba, lighten, desaturate } from '../utils/color';
import { THEME } from '../constants/colors';
import { activeDrag } from '../utils/dragState';
import { CalendarIcon, CheckIcon, ClockIcon, PencilIcon, TrashIcon, XMarkIcon, LockClosedIcon, ArrowsRightLeftIcon, StarIcon, ArrowPathIcon } from '@heroicons/react/24/solid';
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
  onSkip?: (blockId: string) => void;
  onUnconfirm?: (blockId: string) => void;
  onEditBlock?: (blockId: string) => void;
  onDeleteBlock?: (blockId: string) => void;
  onDeleteTask?: (taskId: string) => void;
  onResizeStart?: (blockId: string, e: React.MouseEvent) => void;
  compareMatchedTaskIds?: string[];
  focusedCategoryId?: string | null;
  focusedCalendarId?: string | null;
  compact?: boolean;
  /** Optional hint for view; used for subtle typography tweaks (e.g. week vs 3-day). */
  view?: 'day' | '3day' | 'week';
  /** When true (plan panel in compare mode): blocks are read-only; shows lock on hover. */
  locked?: boolean;
  /** When true: show red/yellow dashed border based on difference status. */
  showDifferences?: boolean;
  /** Reschedule this block to the next available slot later today. */
  onRescheduleLater?: (blockId: string) => void;
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
  onSkip,
  onUnconfirm,
  onEditBlock,
  onDeleteBlock,
  onDeleteTask,
  onResizeStart,
  compareMatchedTaskIds,
  focusedCategoryId,
  focusedCalendarId,
  compact = false,
  view = 'day',
  locked = false,
  showDifferences = false,
  onRescheduleLater,
}: TimeBlockCardProps) {
  const [showPopover, setShowPopover] = useState(false);
  const [popoverRect, setPopoverRect] = useState<{ top: number; left: number } | null>(null);
  const [popoverDragOffset, setPopoverDragOffset] = useState({ x: 0, y: 0 });
  const blockRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const popoverOpenedAtRef = useRef<number>(0);

  // Close popover when clicking outside (portal-based — popover is NOT inside blockRef)
  useEffect(() => {
    if (!showPopover || !isSelected) return;
    const close = (e: PointerEvent) => {
      if (Date.now() - popoverOpenedAtRef.current < 120) return;
      if (blockRef.current?.contains(e.target as Node)) return;
      if (popoverRef.current?.contains(e.target as Node)) return;
      setShowPopover(false);
      doDeselect();
    };
    document.addEventListener('pointerdown', close, true);
    return () => document.removeEventListener('pointerdown', close, true);
  }, [showPopover, isSelected]);

  // Compute portal popover position from block's viewport rect, measuring actual popover height
  useLayoutEffect(() => {
    if (!showPopover || !isSelected || !blockRef.current) return;
    const el = blockRef.current;
    const popoverWidth = 224;
    const gap = 8;
    const update = () => {
      const rect = el.getBoundingClientRect();
      const popoverH = popoverRef.current?.offsetHeight ?? 200;
      // Try above the block
      let top = rect.top - popoverH - gap;
      let left = rect.left;
      // Flip below if above would go off screen
      if (top < gap) top = rect.bottom + gap;
      left = Math.max(gap, Math.min(left, window.innerWidth - popoverWidth - gap));
      top = Math.max(gap, Math.min(top, window.innerHeight - popoverH - gap));
      setPopoverRect({ top, left });
    };
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

  const isCompareMode = mode === 'compare';
  // A block is "confirmed" if explicitly confirmed, or if it uses the legacy mode='recorded' pattern
  const confirmed = block.confirmationStatus === 'confirmed' || block.mode === 'recorded';
  const skipped = block.confirmationStatus === 'skipped';
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
  type TimeState = 'future' | 'pastPending' | 'pastConfirmed' | 'pastSkipped';
  const timeState: TimeState = isPast
    ? confirmed
      ? 'pastConfirmed'
      : skipped
        ? 'pastSkipped'
        : 'pastPending'
    : 'future';

  const blockVisualState = isCompareMode
    ? confirmed
      ? 'pastConfirmed'
      : 'ghost'
    : timeState;

  const isEvent = !block.taskId;
  const isTask = !!block.taskId;

  // Urgency detection: red styling for past-due or due-within-1-day tasks
  const isUrgent = (() => {
    if (!isTask || !block.dueDate || confirmed || skipped) return false;
    const now = new Date();
    const todayLocal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const tom = new Date(now); tom.setDate(tom.getDate() + 1);
    const tomorrowLocal = `${tom.getFullYear()}-${String(tom.getMonth() + 1).padStart(2, '0')}-${String(tom.getDate()).padStart(2, '0')}`;
    return block.dueDate <= tomorrowLocal;
  })();
  const URGENT_TEXT = '#D63031';
  const URGENT_BG = 'rgba(255, 59, 48, 0.07)';
  const URGENT_BORDER = 'rgba(255, 59, 48, 0.25)';

  // Past planned blocks are frozen — the plan is history. Only actuals can change.
  // This prevents dragging/resizing. Confirm/skip/popover still work.
  const isPastPlanned = isPast && block.mode === 'planned';
  const isLockedPast = !locked && isPastPlanned;

  const handleCircleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmed) {
      // Events: skip (didn't happen); Tasks: unconfirm (revert to pending)
      if (isEvent) onSkip?.(block.id);
      else onUnconfirm?.(block.id);
    } else {
      onConfirm?.(block.id);
    }
  };

  /** Renders the confirmation status circle (top-right corner).
   *  Shows for all past blocks (always visible) and future task blocks (hover-only). Clickable unless locked. */
  const renderStatusCircle = (size: number) => {
    const isFutureTask = !isPast && !isCompareMode && isTask;
    const isFutureEvent = !isPast && !isCompareMode && isEvent;
    // Hide for future events — they don't need a done circle
    if (isFutureEvent) return null;
    const circleSize = size;
    const iconSize = Math.max(8, size - 4);
    const isClickable = !locked && (onConfirm || onUnconfirm || onSkip);
    // Hit target is larger than the visual circle for easier clicking
    const hitPad = 4;

    return (
      <button
        type="button"
        onClick={isClickable ? handleCircleClick : undefined}
        className={cn(
          'absolute flex items-center justify-center transition-all z-10',
          isClickable ? 'cursor-pointer' : 'cursor-default pointer-events-none',
          isFutureTask && !confirmed && 'opacity-0 group-hover:opacity-100',
        )}
        style={{
          top: 0,
          right: 0,
          width: circleSize + hitPad * 2,
          height: circleSize + hitPad * 2,
        }}
        title={confirmed ? 'Mark as not done' : skipped ? 'Mark as done' : 'Mark as done'}
        aria-label={confirmed ? 'Mark as not done' : 'Mark as done'}
      >
        <div
          className="flex items-center justify-center rounded-full"
          style={{
            width: circleSize,
            height: circleSize,
            ...(confirmed
              ? { backgroundColor: blockColor, border: `1.5px solid ${blockColor}` }
              : skipped
                ? { backgroundColor: 'rgba(0,0,0,0.12)', border: '1.5px solid rgba(0,0,0,0.15)' }
                : { backgroundColor: 'transparent', border: `1.5px solid ${hexToRgba(blockColor, 0.45)}` }),
          }}
        >
          {confirmed && <CheckIcon style={{ width: iconSize, height: iconSize, color: '#FFFFFF' }} />}
          {skipped && <XMarkIcon style={{ width: iconSize, height: iconSize, color: '#636366' }} />}
        </div>
      </button>
    );
  };

  const getBaseOpacity = () => {
    if (blockVisualState === 'ghost') return 0.22;
    if (blockVisualState === 'future') return 1;
    // Past blocks are transparent per user spec (past → transparent, now → full)
    if (blockVisualState === 'pastPending') return isCompareMode ? 0.55 : 0.5;
    if (blockVisualState === 'pastConfirmed') return isTask ? 0.6 : 0.55;
    if (blockVisualState === 'pastSkipped') return 0.3;
    return 1;
  };

  // Diff status for "Show Differences" mode
  const getDiffStatus = (): 'missing' | 'timing' | 'unplanned' | 'skipped' | null => {
    if (!showDifferences) return null;
    if (block.source === 'unplanned') return 'unplanned';
    // Skipped = planned but explicitly marked "didn't do it"
    if (isPast && skipped && block.mode === 'planned' && block.source !== 'unplanned') return 'skipped';
    // Missing = planned but not yet confirmed/skipped (didn't happen)
    if (isPast && !confirmed && !skipped && block.mode === 'planned' && block.source !== 'unplanned') return 'missing';
    if (confirmed && block.recordedStart && block.recordedEnd &&
        (block.recordedStart !== block.start || block.recordedEnd !== block.end)) return 'timing';
    return null;
  };
  const diffStatus = getDiffStatus();

  const getOpacity = () => {
    // When showDifferences is on, fade "same" (no-diff) past items so different ones stand out.
    // Future blocks haven't happened yet — nothing to compare, so show at normal opacity.
    if (showDifferences && diffStatus === null && isPast) return 0.25;
    // Blocks with a detected diff should pop at full opacity so they stand out
    if (showDifferences && diffStatus !== null) return 1;
    let base = getBaseOpacity();
    if (isCompareMode && matchedSet) {
      const isMatched = block.taskId && matchedSet.has(block.taskId);
      base = isMatched ? base * 0.4 : Math.min(1, base + 0.25);
    }
    if (focusedCategoryId != null) {
      const catId = (block as any).category?.id ?? (block as any).categoryId;
      return catId === focusedCategoryId ? base : FOCUS_MUTED_OPACITY;
    }
    if (focusedCalendarId != null) {
      return block.calendarContainerId === focusedCalendarId ? base : FOCUS_MUTED_OPACITY;
    }
    return base;
  };

  const getBlockColor = () => (block as any).category?.color ?? (block as any).calendarContainer?.color ?? THEME.primary;
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
      if (isUrgent) {
        return {
          backgroundColor: URGENT_BG,
          borderTop: `3px solid ${URGENT_TEXT}`,
          borderLeft: `1px solid ${URGENT_BORDER}`,
          borderRight: `1px solid ${URGENT_BORDER}`,
          borderBottom: `1px solid ${URGENT_BORDER}`,
          borderRadius: 5,
          boxShadow: '0 2px 6px rgba(255,59,48,0.12), 0 1px 2px rgba(0,0,0,0.06)',
          opacity,
          ...vars,
        };
      }
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
    if (blockVisualState === 'pastPending') {
      if (isCompareMode) {
        // In compare mode plan panel: show dashed border to indicate "unconfirmed plan"
        return {
          backgroundColor: '#FDFAF3',
          borderTop: `3px solid ${hexToRgba(blockColor, 0.45)}`,
          borderLeft: `1px dashed ${hexToRgba(blockColor, 0.25)}`,
          borderRight: `1px dashed ${hexToRgba(blockColor, 0.25)}`,
          borderBottom: `1px dashed ${hexToRgba(blockColor, 0.25)}`,
          borderRadius: 5,
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          opacity,
          ...vars,
        };
      }
      // Default view: past + not done — faded, locked feel (not warm beige)
      if (isUrgent) {
        return {
          backgroundColor: 'rgba(255, 59, 48, 0.04)',
          borderTop: `3px solid rgba(255, 59, 48, 0.3)`,
          borderLeft: `1px dashed rgba(255, 59, 48, 0.15)`,
          borderRight: `1px dashed rgba(255, 59, 48, 0.15)`,
          borderBottom: `1px dashed rgba(255, 59, 48, 0.15)`,
          borderRadius: 5,
          opacity,
          ...vars,
        };
      }
      return {
        backgroundColor: 'rgba(0,0,0,0.03)',
        borderTop: `3px solid ${hexToRgba(blockColor, 0.3)}`,
        borderLeft: `1px dashed ${hexToRgba(blockColor, 0.15)}`,
        borderRight: `1px dashed ${hexToRgba(blockColor, 0.15)}`,
        borderBottom: `1px dashed ${hexToRgba(blockColor, 0.15)}`,
        borderRadius: 5,
        opacity,
        ...vars,
      };
    }
    if (blockVisualState === 'pastSkipped') {
      // Marked as not done — very muted, desaturated
      const mutedColor = desaturate(blockColor, 0.8);
      return {
        backgroundColor: 'rgba(0,0,0,0.025)',
        borderTop: `2px solid ${hexToRgba(mutedColor, 0.2)}`,
        borderLeft: `1px solid ${hexToRgba(mutedColor, 0.08)}`,
        borderRight: `1px solid ${hexToRgba(mutedColor, 0.08)}`,
        borderBottom: `1px solid ${hexToRgba(mutedColor, 0.08)}`,
        borderRadius: 5,
        opacity,
        ...vars,
      };
    }
    // Past confirmed (done): show category color bg + solid border (settled, completed feel)
    return {
      backgroundColor: hexToRgba(blockColor, 0.12),
      borderTop: `3px solid ${hexToRgba(blockColor, 0.35)}`,
      borderLeft: `1px solid ${hexToRgba(blockColor, 0.18)}`,
      borderRight: `1px solid ${hexToRgba(blockColor, 0.18)}`,
      borderBottom: `1px solid ${hexToRgba(blockColor, 0.18)}`,
      borderRadius: 5,
      opacity,
      ...vars,
    };
  };

  const getTitleColor = (): string => {
    if (isUrgent) return URGENT_TEXT;
    if (isEvent && blockVisualState === 'ghost') return '#AEAEB2';
    return THEME.textPrimary;
  };

  const titleTextClass = ''; // color applied via style now

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
  // Compact (week / 3-day compact) tiers
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
      ghost.style.color = THEME.textPrimary;
      ghost.style.backgroundColor = hexToRgba(color, 0.15);
      ghost.style.border = `2px solid ${color}`;
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, 8, 8);
      requestAnimationFrame(() => document.body.removeChild(ghost));
    }
  };

  // Shared popover content — same layout as EventCard detail popup
  const PopoverContent = () => (
    <>
      <div
        className="cursor-grab active:cursor-grabbing pb-2 -mx-3 px-3 -mt-1 pt-1 rounded-t-xl"
        style={{ borderBottom: '1px solid rgba(0,0,0,0.08)' }}
        onMouseDown={handlePopoverDragStart}
      >
        <div className="font-semibold text-sm truncate" style={{ color: THEME.textPrimary }}>{block.title || 'Untitled'}</div>
      </div>
      <div className="pt-2">
        <div className="flex items-center gap-2 text-xs mb-1.5" style={{ color: THEME.textSecondary }}>
          <ClockIcon className="flex-shrink-0" style={{ width: 14, height: 14, minWidth: 14, minHeight: 14, color: THEME.textMuted }} />
          <span>{getTimeRange()} – {getDuration()}</span>
        </div>
        <div className="flex items-center gap-2 text-xs mb-1.5" style={{ color: THEME.textSecondary }}>
          <CalendarIcon className="flex-shrink-0" style={{ width: 14, height: 14, minWidth: 14, minHeight: 14, color: THEME.textMuted }} />
          <span>{block.date}</span>
        </div>
        {block.category && (
          <div className="flex items-center gap-2 text-xs mb-1.5" style={{ color: THEME.textSecondary }}>
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: block.category.color }} />
            <span>{block.category.name}</span>
          </div>
        )}
        {block.calendarContainer && (
          <div className="flex items-center gap-2 text-xs mb-3" style={{ color: THEME.textSecondary }}>
            <div className="w-3 h-3 rounded flex-shrink-0" style={{ backgroundColor: hexToRgba(block.calendarContainer.color, 0.25), border: `2px solid ${block.calendarContainer.color}` }} />
            <span>{block.calendarContainer.name}</span>
          </div>
        )}
        {!locked && (isTask || isEvent) && (onConfirm || onUnconfirm) && (
          <div className="mb-2">
            <button
              type="button"
              className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-xl transition-colors"
              style={{ color: confirmed ? THEME.textSecondary : blockColor, backgroundColor: 'transparent' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = confirmed ? 'rgba(0,0,0,0.04)' : hexToRgba(blockColor, 0.1); }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              onClick={() => {
                if (confirmed) {
                  if (isEvent) onSkip?.(block.id);
                  else onUnconfirm?.(block.id);
                } else {
                  onConfirm?.(block.id);
                }
                setShowPopover(false);
                doDeselect();
              }}
            >
              <CheckIcon className="flex-shrink-0" style={{ width: 14, height: 14, minWidth: 14, minHeight: 14 }} />
              {confirmed ? 'Mark as not done' : 'Mark as done'}
            </button>
          </div>
        )}
        {!locked && isTask && onRescheduleLater && (
          <div className="mb-2">
            <button
              type="button"
              className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-xl transition-colors"
              style={{ color: THEME.textSecondary, backgroundColor: 'transparent' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.04)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              onClick={() => {
                onRescheduleLater(block.id);
                setShowPopover(false);
                doDeselect();
              }}
            >
              <ArrowPathIcon className="flex-shrink-0" style={{ width: 14, height: 14, minWidth: 14, minHeight: 14 }} />
              Reschedule later
            </button>
          </div>
        )}
        {(block as any).notes && (
          <div className="text-xs italic mb-2 pt-1" style={{ borderTop: '1px solid rgba(0,0,0,0.05)', color: THEME.textSecondary }}>
            {(block as any).notes}
          </div>
        )}
        {(block as any).description && (
          <div className="text-xs whitespace-pre-wrap mb-2" style={{ color: THEME.textSecondary }}>{(block as any).description}</div>
        )}
        {(block as any).link && (
          <div className="mb-2">
            <a href={(block as any).link} target="_blank" rel="noopener noreferrer" className="text-xs hover:underline truncate block max-w-full" style={{ color: '#8DA286' }}>
              {(block as any).link}
            </a>
          </div>
        )}
        <div className="my-1" style={{ borderTop: '1px solid rgba(0,0,0,0.08)' }} />
        {!isPastPlanned && (
        <div className="flex gap-1.5">
          {onEditBlock && (
            <button
              type="button"
              className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-xl transition-colors"
              style={{ color: THEME.textSecondary, backgroundColor: 'transparent' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.04)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              onClick={(e) => { e.stopPropagation(); onEditBlock(block.id); setShowPopover(false); doDeselect(); }}
            >
              <PencilIcon className="h-3.5 w-3.5" />
              Edit
            </button>
          )}
          {(onDeleteBlock || (onDeleteTask && block.taskId)) && (
            <button
              type="button"
              className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-xl transition-colors"
              style={{ color: '#B85050', backgroundColor: 'transparent' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(184,80,80,0.07)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              onClick={(e) => {
                e.stopPropagation();
                if (block.taskId && onDeleteTask) {
                  onDeleteTask(block.taskId);
                } else {
                  onDeleteBlock?.(block.id);
                }
                setShowPopover(false);
                doDeselect();
              }}
            >
              <TrashIcon className="h-3.5 w-3.5" />
              Delete
            </button>
          )}
        </div>
        )}
      </div>
    </>
  );

  // ─── Compact mode (week view) ───────────────────────────────────────────
  if (compact) {
    const compactTitleFontSize = (() => {
      const base =
        compactTier === 'tiny'
          ? 10
          : isTask
            ? 12
            : 11;
      // Week view: only shrink event titles by ~2px; tasks stay at base size.
      if (!isTask && view === 'week') {
        return Math.max(8, base - 2);
      }
      return base;
    })();
    const blockStyle = getBlockInlineStyle();
    // Events: rounded right side. Tasks: borderRadius from inline style.
    const containerClass = isEvent
      ? 'h-full overflow-hidden min-w-0 rounded-r-sm'
      : 'h-full overflow-hidden min-w-0';

    const diffBorder = diffStatus === 'timing'
      ? '2px solid rgba(255,214,10,0.9)'
      : (diffStatus === 'missing' || diffStatus === 'unplanned' || diffStatus === 'skipped')
        ? '2px solid rgba(255,59,48,0.75)'
        : undefined;

    const effectivelyLocked = locked;
    const noDrag = locked || isLockedPast;

    return (
      <div
        ref={blockRef}
        className={cn('absolute group pointer-events-auto', 'overflow-hidden', noDrag ? 'cursor-default' : 'cursor-grab active:cursor-grabbing')}
        style={style}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={() => { if (!effectivelyLocked) { doSelect(); popoverOpenedAtRef.current = Date.now(); setShowPopover((v) => !v); } }}
        draggable={!noDrag}
        onDragStart={!noDrag ? handleBlockDragStart : undefined}
        onDragEnd={!noDrag ? () => { activeDrag.type = null; } : undefined}
      >
        <div
          data-slot="block-container"
          className={cn('relative', containerClass)}
          style={{
            ...blockStyle,
            boxShadow: diffBorder
              ? `inset 0 0 0 2px ${diffStatus === 'timing' ? 'rgba(255,214,10,0.9)' : 'rgba(255,59,48,0.75)'}`
              : isSelected && !effectivelyLocked ? `0 0 0 1.5px ${blockColor}` : undefined,
          }}
        >
          {/* Lock hover overlay for plan panel only */}
          {locked && (
            <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity rounded-sm z-10 pointer-events-none"
              style={{ backgroundColor: 'rgba(0,0,0,0.06)' }}>
              <LockClosedIcon className="flex-shrink-0" style={{ width: 10, height: 10, minWidth: 10, minHeight: 10, color: '#636366' }} />
            </div>
          )}
          {/* Status circle — top-right, all past blocks */}
          {renderStatusCircle(16)}
          {/* micro: just colored fill, no content */}
          {compactTier === 'micro' ? null : (
            <div
              className="flex items-start h-full min-w-0 w-full gap-1.5"
              style={{ padding: compactTier === 'tiny' ? '1px 3px' : '2px 5px' }}
            >
              {isEvent && compactTier !== 'tiny' && (
                <LockClosedIcon className="flex-shrink-0 mt-0.5 h-1.5 w-1.5 opacity-40" style={{ color: blockColor }} />
              )}
              <div className="min-w-0 flex-1 overflow-hidden flex flex-col">
                <div
                  className={cn(
                    isTask ? 'font-semibold' : 'font-medium',
                    'leading-snug min-w-0 break-words',
                    isTask && confirmed && 'line-through decoration-current/40',
                    titleTextClass,
                  )}
                  style={{
                    fontSize: compactTitleFontSize,
                    overflow: 'hidden',
                    wordBreak: 'break-word',
                    color: getTitleColor(),
                    ...(isTask && confirmed ? { textDecorationSkipInk: 'none' } : {}),
                  }}
                >
                  {block.title || 'Untitled'}
                </div>
              </div>
            </div>
          )}

          {/* Priority stars — bottom-right corner, compact, tasks only */}
          {isTask && typeof block.priority === 'number' && block.priority >= 1 &&
            compactTier !== 'micro' && compactTier !== 'tiny' && (
            <div
              className="absolute flex items-center"
              style={{ bottom: 2, right: 2, gap: 1, pointerEvents: 'none' }}
            >
              {[1, 2, 3, 4, 5].filter((l) => l <= block.priority!).map((l) => (
                <StarIcon key={l} style={{ width: 6, height: 6, color: blockColor, opacity: 0.65 }} />
              ))}
            </div>
          )}
        </div>

        {/* Resize handle — compact mode (all blocks, not locked/past) */}
        {onResizeStart && !noDrag && compactTier !== 'micro' && (
          <div
            className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize opacity-0 group-hover:opacity-100 transition-opacity"
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onResizeStart(block.id, e); }}
          >
            <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full" style={{ backgroundColor: hexToRgba(blockColor, 0.35) }} />
          </div>
        )}

        {/* Compact popover — portaled to document.body so it's never clipped by overflow parents */}
        {showPopover && isSelected && typeof document !== 'undefined' && createPortal(
          <div
            ref={popoverRef}
            className="fixed rounded-xl p-3 min-w-56"
            style={{
              zIndex: 200,
              top: popoverRect?.top ?? -9999,
              left: popoverRect?.left ?? -9999,
              transform: `translate(${popoverDragOffset.x}px, ${popoverDragOffset.y}px)`,
              backgroundColor: '#FFFFFF',
              border: '1px solid rgba(0,0,0,0.09)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.10)',
            }}
          >
            <PopoverContent />
          </div>,
          document.body
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

  const effectivelyLockedFull = locked;
  const noDragFull = locked || isLockedPast;

  return (
    <div
      ref={blockRef}
      className={cn('absolute group pointer-events-auto', 'overflow-hidden', noDragFull ? 'cursor-default' : 'cursor-grab active:cursor-grabbing')}
      style={style}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={() => { if (!effectivelyLockedFull) { doSelect(); popoverOpenedAtRef.current = Date.now(); setShowPopover((v) => !v); } }}
      draggable={!noDragFull}
      onDragStart={!noDragFull ? handleBlockDragStart : undefined}
      onDragEnd={!noDragFull ? () => { activeDrag.type = null; } : undefined}
    >
      <div
        data-slot="block-container"
        className={cn('relative', containerClass)}
        style={{
          ...blockStyle,
          boxShadow: diffStatus
            ? `inset 0 0 0 2px ${diffStatus === 'timing' ? 'rgba(255,214,10,0.9)' : 'rgba(255,59,48,0.75)'}`
            : isSelected && !effectivelyLockedFull ? `0 0 0 2px ${blockColor}, 0 0 0 4px rgba(255,255,255,0.8)` : undefined,
        }}
      >
        {/* Lock hover overlay for plan panel only */}
        {locked && (
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-sm z-10 pointer-events-none"
            style={{ backgroundColor: 'rgba(0,0,0,0.06)' }}>
            <LockClosedIcon className="flex-shrink-0" style={{ width: 12, height: 12, minWidth: 12, minHeight: 12, color: '#636366' }} />
          </div>
        )}
        {/* Status circle — top-right, all past blocks */}
        {renderStatusCircle(18)}
        {sizeTier === 'micro' ? (
          /* micro: just a colored sliver — no text */
          <div className="h-full w-full" />
        ) : sizeTier === 'tiny' ? (
          /* tiny: single-line title only */
          <div className="flex items-center h-full min-w-0" style={{ padding: fullPadding, gap: 2 }}>
            {isEvent && !locked && (
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
          /* small+: title at top, meta + tags below */
          <div className="flex flex-col justify-between h-full min-w-0 overflow-hidden" style={{ padding: fullPadding }}>
            {/* Title row — wraps to fill block */}
            <div className="flex items-start min-w-0 overflow-hidden flex-1 min-h-0" style={{ gap: 2 }}>
              <span
                className={cn(
                  isTask ? 'font-semibold' : 'font-medium',
                  'leading-snug min-w-0 break-words',
                  isTask && confirmed && 'line-through decoration-current/40',
                )}
                style={{
                  fontSize: isTask ? 13 : 11,
                  color: getTitleColor(),
                  textDecorationSkipInk: 'none',
                  overflow: 'hidden',
                  wordBreak: 'break-word',
                }}
              >
                {block.title || 'Untitled'}
              </span>
            </div>

            {/* Bottom row: category chip + (optionally) time-range on non-task blocks */}
            {showMeta && (
              <div className="flex items-end justify-between gap-1 mt-1 min-w-0">
                {block.category && showCategory ? (
                  <span
                    className="text-[9px] font-medium px-1.5 py-[1px] rounded-full truncate max-w-[50%]"
                    style={{ backgroundColor: hexToRgba(blockColor, 0.15), color: blockColor }}
                  >
                    {block.category.name}
                  </span>
                ) : (
                  <span />
                )}
                {(isEvent || view !== 'day') && (
                  <span
                    className="text-[10px] tabular-nums shrink-0"
                    style={{ color: THEME.textPrimary, opacity: 0.5 }}
                  >
                    {fmtShort(block.start)}–{fmtShort(block.end)}
                  </span>
                )}
              </div>
            )}

            {/* Tags — rich only */}
            {showTags && (
              <div className="flex flex-wrap gap-x-2 gap-y-2 mt-1 overflow-hidden" style={{ maxHeight: '36px' }}>
                {block.tags.slice(0, 4).map((tag) => (
                  <Chip
                    key={tag.id}
                    variant="subtle"
                    color={blockColor}
                    contrastBackgroundHex={undefined}
                    className="text-[9px] py-0.5 px-1.5"
                    style={{ borderColor: hexToRgba(blockColor, 1) }}
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

        {/* Priority stars — bottom-right corner, tasks only, category color */}
        {isTask && typeof block.priority === 'number' && block.priority >= 1 &&
          sizeTier !== 'micro' && sizeTier !== 'tiny' && (
          <div
            className="absolute flex items-center"
            style={{ bottom: 4, right: 4, gap: 1, pointerEvents: 'none' }}
          >
            {[1, 2, 3, 4, 5].filter((l) => l <= block.priority!).map((l) => (
              <StarIcon key={l} style={{ width: 7, height: 7, color: blockColor, opacity: 0.7 }} />
            ))}
          </div>
        )}

        {/* Resize handle (all blocks, small+, not locked/past) */}
        {onResizeStart && !noDragFull && sizeTier !== 'micro' && sizeTier !== 'tiny' && (
          <div
            className="absolute bottom-0 left-0 right-0 h-3 cursor-ns-resize opacity-0 group-hover:opacity-100 transition-opacity"
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onResizeStart(block.id, e); }}
          >
            <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full" style={{ backgroundColor: hexToRgba(blockColor, 0.35) }} />
          </div>
        )}
      </div>

      {/* Full popover — portaled to document.body so it's never clipped by overflow parents */}
      {showPopover && isSelected && typeof document !== 'undefined' && createPortal(
        <div
          ref={popoverRef}
          className="fixed rounded-xl p-3 min-w-56"
          style={{
            zIndex: 200,
            top: popoverRect?.top ?? -9999,
            left: popoverRect?.left ?? -9999,
            transform: `translate(${popoverDragOffset.x}px, ${popoverDragOffset.y}px)`,
            backgroundColor: '#FFFFFF',
            border: '1px solid rgba(0,0,0,0.09)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.10)',
          }}
        >
          <PopoverContent />
        </div>,
        document.body
      )}
    </div>
  );
}

export const TimeBlockCard = memo(TimeBlockCardInner);
