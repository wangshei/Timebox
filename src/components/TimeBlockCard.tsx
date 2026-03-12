import React, { useState, useRef, useLayoutEffect, useEffect, memo } from 'react';
import { createPortal } from 'react-dom';
import { Mode } from '../types';
import { ResolvedTimeBlock } from '../utils/dataResolver';
import { getLocalDateString } from '../utils/dateTime';
import { getTextClassForBackground, hexToRgba, lighten, desaturate } from '../utils/color';
import { THEME } from '../constants/colors';
import { activeDrag, initPointerDrag } from '../utils/dragState';
import { CalendarIcon, CheckIcon, ClockIcon, PencilIcon, TrashIcon, XMarkIcon, LockClosedIcon, ArrowsRightLeftIcon, StarIcon, ArrowPathIcon } from '@heroicons/react/24/solid';
import { useStore } from '../store/useStore';
import { cn } from './ui/utils';
import { Chip } from './ui/chip';
import { useNow } from '../contexts/NowContext';

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
  onAddTimeToComplete?: (blockId: string, minutes: number) => void;
  /** When set, block is in stamp mode — clicking stamps this emoji onto the block. */
  activeStampEmoji?: string | null;
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
  onAddTimeToComplete,
  activeStampEmoji,
}: TimeBlockCardProps) {
  const updateTimeBlock = useStore((s) => s.updateTimeBlock);
  const [showPopover, setShowPopover] = useState(false);
  const [popoverRect, setPopoverRect] = useState<{ top: number; left: number } | null>(null);
  const [popoverDragOffset, setPopoverDragOffset] = useState({ x: 0, y: 0 });
  const [showDetails, setShowDetails] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const addSticker = useStore((s) => s.addSticker);
  const stickers = useStore((s) => s.stickers);
  const deleteSticker = useStore((s) => s.deleteSticker);
  const blockStickers = React.useMemo(() => stickers.filter((s) => s.blockId === block.id), [stickers, block.id]);
  const [stampBounce, setStampBounce] = useState(false);
  const [selectedStickerId, setSelectedStickerId] = useState<string | null>(null);

  const handleStamp = (e: React.MouseEvent) => {
    if (!activeStampEmoji || !blockRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = blockRef.current.getBoundingClientRect();
    const offsetXPercent = Math.max(5, Math.min(95, ((e.clientX - rect.left) / rect.width) * 100));
    const offsetYPercent = Math.max(5, Math.min(95, ((e.clientY - rect.top) / rect.height) * 100));
    addSticker({
      emoji: activeStampEmoji,
      date: block.date,
      blockId: block.id,
      offsetXPercent,
      offsetYPercent,
    });
    setStampBounce(true);
    setTimeout(() => setStampBounce(false), 300);
  };

  const blockRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const popoverOpenedAtRef = useRef<number>(0);
  const dragEndedRef = useRef(false);

  // Close popover when clicking outside (portal-based — popover is NOT inside blockRef)
  useEffect(() => {
    if (!showPopover || !isSelected) return;
    const close = (e: PointerEvent) => {
      if (Date.now() - popoverOpenedAtRef.current < 200) return;
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
    const popoverWidth = 220;
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

  const handlePopoverDragStart = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX - popoverDragOffset.x;
    const startY = e.clientY - popoverDragOffset.y;
    const onMove = (ev: PointerEvent) => {
      setPopoverDragOffset({ x: ev.clientX - startX, y: ev.clientY - startY });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const isCompareMode = mode === 'compare';
  // A block is "confirmed" if explicitly confirmed, or if it uses the legacy mode='recorded' pattern
  const confirmed = block.confirmationStatus === 'confirmed' || block.mode === 'recorded';
  const skipped = block.confirmationStatus === 'skipped';
  const matchedSet = compareMatchedTaskIds ? new Set(compareMatchedTaskIds) : null;

  const doSelect = onSelectBlock ? () => onSelectBlock(block.id) : (onSelect ?? (() => {}));
  const doDeselect = onSelectBlock ? () => onSelectBlock(null) : (onDeselect ?? (() => {}));

  const nowDate = useNow();
  const nowFallback = todayStrProp === undefined || nowMinsProp === undefined ? nowDate : null;
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

  // Past planned TASK blocks are frozen — the plan is history. Only actuals can change.
  // This prevents dragging/resizing. Confirm/skip/popover still work.
  // Events and confirmed/recorded past blocks remain draggable/resizable.
  const isPastPlanned = isPast && block.mode === 'planned' && isTask;
  const isLockedPast = !locked && isPastPlanned;
  const allowResizePast = isPast && (confirmed || block.mode === 'recorded');

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
          isFutureTask && !confirmed && 'opacity-0 group-hover:opacity-100 group-active:opacity-100',
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
    // Past tasks already use low-alpha fills/borders — no extra opacity needed
    if (blockVisualState === 'pastPending') return isTask ? 1 : (isCompareMode ? 0.55 : 0.5);
    if (blockVisualState === 'pastConfirmed') return isTask ? 1 : 0.55;
    if (blockVisualState === 'pastSkipped') return isTask ? 1 : 0.3;
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
    // Timing changed — block was moved/resized from its original position
    if (block.originalStart != null && block.originalEnd != null &&
        (block.originalStart !== block.start || block.originalEnd !== block.end)) return 'timing';
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
    heightPx < 14 ? 'micro' :
    heightPx < 32 ? 'tiny'  :
    heightPx < 50 ? 'small' : 'medium';

  // Full (day / 3-day view) tiers
  const sizeTier =
    heightPx < 14  ? 'micro'  :
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
  const showNotes = false; // notes shown only in popover, not inline

  const getDurationMinutes = () => {
    const [startHour, startMin] = block.start.split(':').map(Number);
    const [endHour, endMin] = block.end.split(':').map(Number);
    return (endHour * 60 + endMin) - (startHour * 60 + startMin);
  };

  const handlePointerDragStart = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, input, textarea, [data-no-drag]')) return;
    const color = getBlockColor();
    initPointerDrag(e, {
      type: 'block' as const,
      id: block.id,
      duration: getDurationMinutes(),
      color,
      title: block.title || 'Block',
      createGhost: () => {
        const ghost = document.createElement('div');
        ghost.style.cssText = `padding:6px 12px;border-radius:8px;font-size:13px;font-weight:500;white-space:nowrap;max-width:200px;overflow:hidden;text-overflow:ellipsis;box-shadow:0 4px 12px rgba(0,0,0,0.15);`;
        ghost.textContent = block.title || 'Block';
        ghost.style.color = THEME.textPrimary;
        ghost.style.backgroundColor = hexToRgba(color, 0.15);
        ghost.style.border = `2px solid ${color}`;
        return ghost;
      },
      onDragStart: () => { setShowPopover(false); },
      onDragEnd: () => { dragEndedRef.current = true; },
    });
  };

  // Shared popover content — same layout as EventCard detail popup
  const PopoverContent = () => (
    <>
      <div
        className="cursor-grab active:cursor-grabbing pb-1.5 -mx-3 px-3 -mt-0.5 pt-1 rounded-t-xl"
        style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}
        onMouseDown={handlePopoverDragStart}
      >
        <div className="font-semibold leading-snug" style={{ color: THEME.textPrimary, fontSize: 12 }}>{block.title || 'Untitled'}</div>
        <div className="flex items-center gap-1.5 mt-0.5" style={{ color: THEME.textMuted, fontSize: 10 }}>
          <span>{getTimeRange()}</span>
          <span style={{ color: 'rgba(0,0,0,0.2)' }}>·</span>
          <span>{getDuration()}</span>
        </div>
      </div>
      <div className="pt-2">
        {/* Metadata row */}
        <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
          {block.calendarContainer && (
            <div className="flex items-center gap-1" style={{ color: THEME.textSecondary, fontSize: 10 }}>
              <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: block.calendarContainer.color }} />
              <span>{block.calendarContainer.name}</span>
            </div>
          )}
          {block.calendarContainer && block.category && (
            <span style={{ color: 'rgba(0,0,0,0.15)', fontSize: 10 }}>·</span>
          )}
          {block.category && (
            <div className="flex items-center gap-1" style={{ color: THEME.textSecondary, fontSize: 10 }}>
              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: block.category.color }} />
              <span>{block.category.name}</span>
            </div>
          )}
        </div>

        {/* Details toggle — grouped with info above */}
        {(block.notes || block.description || block.link) && (
          <div className="mb-1">
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
              <div className="mt-1 pl-0.5">
                {block.notes && (
                  <div className="italic mb-1 break-words leading-relaxed" style={{ color: THEME.textSecondary, fontSize: 10 }}>
                    {block.notes}
                  </div>
                )}
                {block.description && (
                  <div className="whitespace-pre-wrap mb-1 break-words leading-relaxed" style={{ color: THEME.textSecondary, fontSize: 10 }}>{block.description}</div>
                )}
                {block.link && (
                  <a href={block.link} target="_blank" rel="noopener noreferrer" className="hover:underline break-all" style={{ color: '#8DA286', fontSize: 10 }}>
                    {block.link}
                  </a>
                )}
              </div>
            )}
          </div>
        )}

        {/* Stickers on this block — show in popover with remove */}
        {blockStickers.length > 0 && (
          <div className="-mx-3 px-3 pt-1.5 pb-0.5" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
            <div className="flex items-center gap-1 flex-wrap">
              {blockStickers.map((sticker) => (
                <button
                  key={sticker.id}
                  type="button"
                  className="relative group/stamp rounded-md transition-all hover:scale-110"
                  style={{ fontSize: 18, lineHeight: 1, padding: '2px 1px' }}
                  title="Click to remove"
                  onClick={() => deleteSticker(sticker.id)}
                >
                  {sticker.emoji}
                  <span
                    className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-red-400 text-white flex items-center justify-center opacity-0 group-hover/stamp:opacity-100 transition-opacity"
                    style={{ fontSize: 8, lineHeight: 1 }}
                  >
                    ×
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Mark done / Reschedule / Add time — below the line */}
        <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }} className="pt-1 -mx-3 px-3">
        {!locked && (isTask || isEvent) && (onConfirm || onUnconfirm) && (
          <button
            type="button"
            className="w-full flex items-center gap-1.5 py-1.5 font-medium rounded-md transition-colors"
            style={{ color: confirmed ? THEME.textSecondary : blockColor, fontSize: 11 }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = confirmed ? 'rgba(0,0,0,0.03)' : hexToRgba(blockColor, 0.07); }}
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
            <CheckIcon className="flex-shrink-0" style={{ width: 12, height: 12, minWidth: 12, minHeight: 12 }} />
            {confirmed ? 'Mark as not done' : 'Mark as done'}
          </button>
        )}
        {!locked && isTask && onRescheduleLater && (
          <button
            type="button"
            className="w-full flex items-center gap-1.5 py-1.5 font-medium rounded-md transition-colors"
            style={{ color: THEME.textSecondary, fontSize: 11 }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.03)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
            onClick={() => {
              onRescheduleLater(block.id);
              setShowPopover(false);
              doDeselect();
            }}
          >
            <ArrowPathIcon className="flex-shrink-0" style={{ width: 12, height: 12, minWidth: 12, minHeight: 12 }} />
            Reschedule later
          </button>
        )}
        {!locked && isTask && onAddTimeToComplete && (
          <>
            <button
              type="button"
              className="w-full flex items-center gap-1.5 py-1.5 font-medium rounded-md transition-colors"
              style={{ color: THEME.textSecondary, fontSize: 11 }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.03)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              onClick={() => setShowTimePicker((v) => !v)}
            >
              <ClockIcon className="flex-shrink-0" style={{ width: 12, height: 12, minWidth: 12, minHeight: 12 }} />
              Add time to complete
              <svg width="7" height="7" viewBox="0 0 8 8" className="ml-auto" style={{ transform: showTimePicker ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>
                <path d="M2 1L6 4L2 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </svg>
            </button>
            {showTimePicker && (
              <div className="flex items-center gap-1 pb-1.5 pl-5">
                {[{ label: '15m', mins: 15 }, { label: '30m', mins: 30 }, { label: '1h', mins: 60 }, { label: '2h', mins: 120 }].map((opt) => (
                  <button
                    key={opt.mins}
                    type="button"
                    className="px-2 py-0.5 font-medium rounded-full transition-colors"
                    style={{ color: THEME.textSecondary, backgroundColor: 'rgba(0,0,0,0.04)', border: `1px solid rgba(0,0,0,0.07)`, fontSize: 9 }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = hexToRgba(blockColor, 0.12); e.currentTarget.style.borderColor = hexToRgba(blockColor, 0.25); e.currentTarget.style.color = blockColor; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.04)'; e.currentTarget.style.borderColor = 'rgba(0,0,0,0.07)'; e.currentTarget.style.color = THEME.textSecondary; }}
                    onClick={() => {
                      onAddTimeToComplete(block.id, opt.mins);
                      setShowPopover(false);
                      doDeselect();
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        </div>

        {/* Edit / Delete — below another line */}
        <div className="-mx-3 px-3 pt-0.5" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }} />
        {!isPastPlanned && (
        <div className="flex gap-1 -mx-3 px-3">
          {onEditBlock && (
            <button
              type="button"
              className="flex-1 flex items-center justify-center gap-1 py-1.5 font-medium rounded-md transition-colors"
              style={{ color: THEME.textSecondary, fontSize: 11 }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.03)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              onClick={(e) => { e.stopPropagation(); onEditBlock(block.id); setShowPopover(false); doDeselect(); }}
            >
              <PencilIcon style={{ width: 11, height: 11 }} />
              Edit
            </button>
          )}
          {(onDeleteBlock || (onDeleteTask && block.taskId)) && (
            <button
              type="button"
              className="flex-1 flex items-center justify-center gap-1 py-1.5 font-medium rounded-md transition-colors"
              style={{ color: '#C45050', fontSize: 11 }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(196,80,80,0.06)'; }}
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
              <TrashIcon style={{ width: 11, height: 11 }} />
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

    const diffColor = diffStatus === 'unplanned' ? 'rgba(52,199,89,0.75)'
      : diffStatus === 'timing' ? 'rgba(255,214,10,0.9)'
      : (diffStatus === 'missing' || diffStatus === 'skipped') ? 'rgba(255,59,48,0.75)'
      : undefined;

    const effectivelyLocked = locked;
    const noDrag = locked || isLockedPast;

    return (
      <div
        ref={blockRef}
        className={cn('absolute group pointer-events-auto', 'overflow-hidden', noDrag ? 'cursor-default' : 'cursor-grab active:cursor-grabbing')}
        style={style}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => { if (dragEndedRef.current) { dragEndedRef.current = false; return; } if (activeStampEmoji) { handleStamp(e); return; } if (!effectivelyLocked) { doSelect(); popoverOpenedAtRef.current = Date.now(); setShowPopover(true); setShowDetails(false); setShowTimePicker(false); } }}
        onPointerDown={!noDrag && !activeStampEmoji ? handlePointerDragStart : undefined}
      >
        <div
          data-slot="block-container"
          className={cn('relative', containerClass)}
          style={{
            ...blockStyle,
            boxShadow: diffColor
              ? `inset 0 0 0 2px ${diffColor}`
              : isSelected && !effectivelyLocked ? `0 0 0 1.5px ${blockColor}` : undefined,
            cursor: activeStampEmoji ? 'pointer' : undefined,
            transition: stampBounce ? 'transform 0.15s ease' : undefined,
            transform: stampBounce ? 'scale(1.03)' : undefined,
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

          {/* Stickers — compact, bottom-left */}
          {blockStickers.length > 0 && compactTier !== 'micro' && compactTier !== 'tiny' && (
            <div
              className="absolute flex items-center pointer-events-none"
              style={{ bottom: 1, left: 3, gap: 0 }}
            >
              {blockStickers.slice(0, 3).map((sticker, i) => (
                <span
                  key={sticker.id}
                  style={{
                    fontSize: 10,
                    lineHeight: 1,
                    transform: `rotate(${(i % 2 === 0 ? -1 : 1) * (4 + i * 3)}deg)`,
                  }}
                >
                  {sticker.emoji}
                </span>
              ))}
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

        {/* Resize handle — compact mode (all blocks, not locked/past; or confirmed past) */}
        {onResizeStart && (!noDrag || allowResizePast) && compactTier !== 'micro' && (
          <div
            className="absolute bottom-0 left-0 right-0 h-2 z-10 cursor-ns-resize opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity"
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onResizeStart(block.id, e); }}
          >
            <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full" style={{ backgroundColor: hexToRgba(blockColor, 0.35) }} />
          </div>
        )}

        {/* Compact popover — portaled to document.body so it's never clipped by overflow parents */}
        {showPopover && isSelected && typeof document !== 'undefined' && createPortal(
          <div
            ref={popoverRef}
            className="fixed rounded-xl p-3"
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
      className={cn('absolute group pointer-events-auto', 'overflow-hidden', activeStampEmoji ? 'cursor-pointer' : noDragFull ? 'cursor-default' : 'cursor-grab active:cursor-grabbing')}
      style={style}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => { if (dragEndedRef.current) { dragEndedRef.current = false; return; } if (activeStampEmoji) { handleStamp(e); return; } if (!effectivelyLockedFull) { doSelect(); popoverOpenedAtRef.current = Date.now(); setShowPopover(true); setShowDetails(false); setShowTimePicker(false); } }}
      onPointerDown={!noDragFull && !activeStampEmoji ? handlePointerDragStart : undefined}
    >
      <div
        data-slot="block-container"
        className={cn('relative', containerClass)}
        style={{
          ...blockStyle,
          boxShadow: diffStatus
            ? `inset 0 0 0 2px ${diffStatus === 'timing' ? 'rgba(255,214,10,0.9)' : 'rgba(255,59,48,0.75)'}`
            : isSelected && !effectivelyLockedFull ? `0 0 0 2px ${blockColor}, 0 0 0 4px rgba(255,255,255,0.8)` : undefined,
          transition: stampBounce ? 'transform 0.15s ease' : undefined,
          transform: stampBounce ? 'scale(1.03)' : undefined,
        }}
      >
        {/* Lock hover overlay for plan panel only */}
        {locked && (
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity rounded-sm z-10 pointer-events-none"
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
                {block.notes}
              </div>
            )}
          </div>
        )}

        {/* Positioned stickers — placed at exact click position */}
        {blockStickers.length > 0 && sizeTier !== 'micro' && sizeTier !== 'tiny' && (
          <>
            {blockStickers.map((sticker) => (
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

        {/* Resize handle (all blocks, small+, not locked/past; or confirmed past) */}
        {onResizeStart && (!noDragFull || allowResizePast) && sizeTier !== 'micro' && sizeTier !== 'tiny' && (
          <div
            className="absolute bottom-0 left-0 right-0 h-3 z-10 cursor-ns-resize opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity"
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
          className="fixed rounded-2xl p-4"
          style={{
            zIndex: 200,
            width: 240,
            maxWidth: 240,
            top: popoverRect?.top ?? -9999,
            left: popoverRect?.left ?? -9999,
            transform: `translate(${popoverDragOffset.x}px, ${popoverDragOffset.y}px)`,
            backgroundColor: '#FFFFFF',
            border: '1px solid rgba(0,0,0,0.08)',
            boxShadow: '0 6px 24px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.04)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <PopoverContent />
        </div>,
        document.body
      )}
    </div>
  );
}

export const TimeBlockCard = memo(TimeBlockCardInner);
