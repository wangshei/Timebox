import React, { useState, useRef, useLayoutEffect, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Task } from '../App';
import {
  Bars3Icon,
  CalendarIcon,
  CheckIcon,
  ClockIcon,
  PencilIcon,
  XMarkIcon,
  StarIcon,
} from '@heroicons/react/24/solid';
import { StarIcon as StarOutlineIcon } from '@heroicons/react/24/outline';
import { activeDrag } from '../utils/dragState';
import { THEME } from '../constants/colors';

interface TaskCardProps {
  /** React key (not used by component, but included to satisfy some typecheckers). */
  key?: string;
  task: Task;
  viewMode?: 'overview' | 'plan';
  /** When 'left', popover opens to the left of the card (e.g. in right sidebar). Default 'right'. */
  popoverSide?: 'left' | 'right';
  onScheduleTask?: () => void;
  onEditTask?: () => void;
  onDeleteTask?: () => void;
  /** Toggle the task's done status. */
  onMarkTaskDone?: () => void;
  /** Break task into smaller tasks (e.g. 30min, 1h chunks) and add to backlog. */
  onBreakIntoChunks?: (taskId: string, chunkMinutes: number) => void;
  /** Split this task into two: one with chunkMinutes, original reduced by that amount. */
  onSplitTask?: (taskId: string, chunkMinutes: number) => void;
  /** Cycle priority rating (1–5 stars, then back to unset). */
  onTogglePin?: () => void;
}

const SPLIT_BLOCK_OPTIONS = [30, 60, 90, 120] as const;

/** Format minutes → "2h 30m" */
function fmtMins(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

/** Convert hex color to rgba string */
function hexRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const full = clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function TaskCard({
  task,
  viewMode = 'overview',
  popoverSide = 'right',
  onScheduleTask,
  onEditTask,
  onDeleteTask,
  onMarkTaskDone,
  onBreakIntoChunks,
  onSplitTask,
  onTogglePin,
}: TaskCardProps) {
  const [showPopover, setShowPopover] = useState(false);
  const [splitBlockMinutes, setSplitBlockMinutes] = useState(60);
  const [popoverRect, setPopoverRect] = useState<{ top: number; left: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const popoverOpenedAtRef = useRef<number>(0);
  const dragEndedRef = useRef(false);

  useEffect(() => {
    if (!showPopover) return;
    const close = (e: PointerEvent) => {
      if (Date.now() - popoverOpenedAtRef.current < 120) return;
      if (cardRef.current?.contains(e.target as Node)) return;
      if (popoverRef.current?.contains(e.target as Node)) return;
      setShowPopover(false);
    };
    document.addEventListener('pointerdown', close, true);
    return () => document.removeEventListener('pointerdown', close, true);
  }, [showPopover]);

  const estimatedMins = Math.round((task.estimatedHours ?? 0) * 60);
  const recordedMins = Math.round((task.recordedHours ?? 0) * 60);
  const remainingMins = Math.max(0, estimatedMins - recordedMins);
  const progress = estimatedMins > 0 ? Math.min(100, (recordedMins / estimatedMins) * 100) : 0;
  const catColor = task.category?.color ?? '#8DA286';
  const isDone = task.status === 'done';
  const priority = typeof task.priority === 'number' && task.priority >= 1 && task.priority <= 5
    ? task.priority
    : 0;

  useLayoutEffect(() => {
    if (!showPopover || !cardRef.current) return;
    const el = cardRef.current;
    const popoverWidth = 292;
    const popoverMaxHeight = 460;
    const gap = 8;
    const update = () => {
      const rect = el.getBoundingClientRect();
      let left = popoverSide === 'left' ? rect.left - popoverWidth - gap : rect.right + gap;
      let top = rect.top;
      left = Math.max(gap, Math.min(left, window.innerWidth - popoverWidth - gap));
      top = Math.max(gap, Math.min(top, window.innerHeight - popoverMaxHeight - gap));
      setPopoverRect({ top, left });
    };
    update();
    const obs = new ResizeObserver(update);
    obs.observe(el);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      obs.disconnect();
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [showPopover, viewMode, popoverSide]);

  const handleDragStart = (e: React.DragEvent) => {
    setShowPopover(false);
    dragEndedRef.current = false;
    e.dataTransfer.setData('application/x-timebox-task-id', task.id);
    const durationMins = Math.max(15, recordedMins > 0 ? remainingMins : estimatedMins);
    e.dataTransfer.setData('application/x-timebox-task-duration', String(durationMins));
    e.dataTransfer.setData('application/x-timebox-task-color', catColor);
    e.dataTransfer.setData('text/plain', task.title);
    e.dataTransfer.effectAllowed = 'copy';
    activeDrag.type = 'task';
    activeDrag.duration = durationMins;
    activeDrag.color = catColor;
    if (e.dataTransfer.setDragImage) {
      const ghost = document.createElement('div');
      ghost.style.cssText = [
        'position:absolute', 'top:-9999px',
        `padding:5px 12px`, `border-radius:8px`, `font-size:13px`, `font-weight:500`,
        `color:${catColor}`,
        `background:${hexRgba(catColor, 0.12)}`,
        `border:1.5px solid ${hexRgba(catColor, 0.4)}`,
        'font-family:system-ui,sans-serif',
      ].join(';');
      ghost.textContent = task.title;
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, 8, 14);
      requestAnimationFrame(() => document.body.removeChild(ghost));
    }
  };

  // Shared popover content (overview + plan modes)
  const renderPopoverContent = () => (
    <div>
      {/* Colored top accent + title */}
      <div
        className="pb-2.5 mb-2.5 -mx-3 px-3"
        style={{ borderBottom: '1px solid rgba(0,0,0,0.08)' }}
      >
        <div className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: catColor }} />
          {task.category && (
            <span className="text-xs font-medium" style={{ color: catColor }}>{task.category.name}</span>
          )}
          {/* Priority stars beside category, using category color */}
          {priority > 0 && (
            <div className="flex items-center gap-0.5 ml-auto">
              {[1, 2, 3, 4, 5].filter((l) => l <= priority).map((l) => (
                <StarIcon key={l} style={{ width: 10, height: 10, color: catColor, opacity: 0.85 }} />
              ))}
            </div>
          )}
        </div>
        <h3 className="font-semibold text-sm leading-snug" style={{ color: THEME.textPrimary }}>{task.title}</h3>
        <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs" style={{ color: THEME.textPrimary }}>
          <span className="flex items-center gap-1">
            <ClockIcon className="flex-shrink-0" style={{ width: 12, height: 12, minWidth: 12, minHeight: 12 }} />
            {fmtMins(estimatedMins)}
          </span>
          {'dueDate' in task && task.dueDate && (
            <span className="flex items-center gap-1">
              <CalendarIcon className="flex-shrink-0" style={{ width: 12, height: 12, minWidth: 12, minHeight: 12 }} />
              Due {task.dueDate}
            </span>
          )}
        </div>
      </div>

      {/* Progress */}
      {recordedMins > 0 && (
        <div className="mb-2.5">
          <div className="w-full rounded-full h-1.5 overflow-hidden mb-1" style={{ backgroundColor: hexRgba(catColor, 0.12) }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(progress, 100)}%`, backgroundColor: catColor }} />
          </div>
          <div className="text-xs" style={{ color: THEME.textPrimary }}>
            {fmtMins(recordedMins)} done · {fmtMins(remainingMins)} left
          </div>
        </div>
      )}

      {/* Tags */}
      {task.tags.length > 0 && (
        <div className="flex flex-wrap gap-x-1 gap-y-2 mb-2.5">
          {task.tags.map(tag => (
            <span key={tag.id} className="text-xs px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: hexRgba(catColor, 0.08), color: catColor, border: `1px solid ${hexRgba(catColor, 0.18)}` }}>
              {tag.name}
            </span>
          ))}
        </div>
      )}

      {/* Description */}
      {'description' in task && task.description && (
        <div className="text-xs whitespace-pre-wrap leading-relaxed mb-2.5" style={{ color: '#636366' }}>{task.description}</div>
      )}
      {/* Quick notes */}
      {'notes' in task && task.notes && (
        <div className="text-xs italic leading-relaxed mb-2.5 pt-1" style={{ borderTop: '1px solid rgba(0,0,0,0.05)', color: '#636366' }}>{task.notes}</div>
      )}
      {/* Link */}
      {'link' in task && task.link && (
        <a href={task.link} target="_blank" rel="noopener noreferrer"
          className="text-xs truncate block max-w-full hover:underline mb-2.5"
          style={{ color: '#8DA286' }}>
          {task.link}
        </a>
      )}

      {/* Quick scheduling sections */}
      {(onBreakIntoChunks || onSplitTask) && estimatedMins > 0 && (
        <div className="mb-2 -mx-3 px-3 py-2" style={{ borderTop: '1px solid rgba(0,0,0,0.06)', borderBottom: '1px solid rgba(0,0,0,0.06)', backgroundColor: 'rgba(0,0,0,0.02)' }}>
          {onBreakIntoChunks && (
            <div className="mb-1.5">
              <div className="text-xs mb-1.5" style={{ color: THEME.textPrimary }}>Break into blocks</div>
              <div className="flex flex-wrap gap-x-1 gap-y-2">
                {[30, 60, 90].map((mins) => (
                  <button key={mins} type="button"
                    onClick={() => { onBreakIntoChunks(task.id, mins); setShowPopover(false); }}
                    className="px-2 py-1 text-xs font-medium rounded-md transition-colors"
                    style={{ border: '1px solid rgba(0,0,0,0.10)', color: '#636366', backgroundColor: 'transparent' }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = hexRgba(catColor, 0.06))}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}>
                    {mins < 60 ? `${mins}m` : `${mins / 60}h`}
                  </button>
                ))}
              </div>
            </div>
          )}
          {onSplitTask && (
            <div>
              <div className="text-xs mb-1.5" style={{ color: THEME.textPrimary }}>Get a block</div>
              <div className="flex flex-wrap gap-x-1 gap-y-2 mb-2">
                {SPLIT_BLOCK_OPTIONS.map((mins) => (
                  <button key={mins} type="button"
                    onClick={() => setSplitBlockMinutes(mins)}
                    className="px-2 py-1 text-xs font-medium rounded-md transition-all"
                    style={{
                      border: splitBlockMinutes === mins ? `1.5px solid ${catColor}` : '1px solid rgba(0,0,0,0.10)',
                      backgroundColor: splitBlockMinutes === mins ? hexRgba(catColor, 0.1) : 'transparent',
                      color: splitBlockMinutes === mins ? catColor : '#636366',
                    }}>
                    {mins < 60 ? `${mins}m` : `${mins / 60}h`}
                  </button>
                ))}
              </div>
              <button type="button"
                onClick={() => { onSplitTask(task.id, splitBlockMinutes); setShowPopover(false); }}
                className="w-full py-1.5 text-xs font-medium rounded-md"
                style={{ backgroundColor: hexRgba(catColor, 0.12), color: catColor, border: `1px solid ${hexRgba(catColor, 0.25)}` }}>
                Split off {splitBlockMinutes < 60 ? `${splitBlockMinutes}m` : `${splitBlockMinutes / 60}h`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="space-y-px" style={{ borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: 6, marginTop: 6 }}>
        <button type="button"
          className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-lg transition-colors"
          style={{ color: '#636366' }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = hexRgba(catColor, 0.07))}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          onClick={() => { onScheduleTask?.(); setShowPopover(false); }}>
          <CalendarIcon className="flex-shrink-0" style={{ width: 14, height: 14, minWidth: 14, minHeight: 14 }} />
          {recordedMins > 0 ? 'Schedule again' : 'Schedule todo'}
        </button>

        {onMarkTaskDone && (
          <button type="button"
            className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-lg transition-colors"
            style={{ color: isDone ? THEME.textPrimary : '#6A8C5A' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = isDone ? 'rgba(0,0,0,0.04)' : 'rgba(106,140,90,0.08)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            onClick={() => { onMarkTaskDone(); setShowPopover(false); }}>
            <CheckIcon className="flex-shrink-0" style={{ width: 14, height: 14, minWidth: 14, minHeight: 14 }} />
            {isDone ? 'Mark as not done' : 'Mark as done'}
          </button>
        )}

        <button type="button"
          className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-lg transition-colors"
          style={{ color: '#636366' }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.04)')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          onClick={() => { onEditTask?.(); setShowPopover(false); }}>
          <PencilIcon className="flex-shrink-0" style={{ width: 14, height: 14, minWidth: 14, minHeight: 14 }} />
          Edit details
        </button>

        <button type="button"
          className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-lg transition-colors"
          style={{ color: '#C87868' }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(200,120,104,0.08)')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          onClick={() => { onDeleteTask?.(); setShowPopover(false); }}>
          <XMarkIcon className="flex-shrink-0" style={{ width: 14, height: 14, minWidth: 14, minHeight: 14 }} />
          Delete todo
        </button>
      </div>
    </div>
  );

  // ─── PLAN MODE ───────────────────────────────────────────────────────────────
  if (viewMode === 'plan') {
    const displayMins = recordedMins > 0 ? remainingMins : estimatedMins;
    // Scale 1.5×: 30min→45px, 1h→90px (exactly 2× taller), 2h→180px
    const cardHeight = Math.max(Math.round(displayMins * 1.5), 45);

    return (
      <>
        <div
          ref={cardRef}
          className="cursor-grab active:cursor-grabbing group relative"
          style={{ height: `${cardHeight}px`, ...(showPopover ? { zIndex: 101 } : {}) }}
          onClick={() => {
            if (dragEndedRef.current) { dragEndedRef.current = false; return; }
            popoverOpenedAtRef.current = Date.now();
            setShowPopover((v) => !v);
          }}
          draggable
          onDragStart={handleDragStart}
          onDragEnd={() => {
            activeDrag.type = null;
            dragEndedRef.current = true;
            window.setTimeout(() => { dragEndedRef.current = false; }, 200);
          }}
        >
          {/* Calendar-block style: cream bg, colored top border, dark text */}
          <div
            className="h-full overflow-hidden"
            style={{
              backgroundColor: '#FFF9EC',
              borderTop: `3px solid ${catColor}`,
              borderLeft: `1px solid ${hexRgba(catColor, 0.22)}`,
              borderRight: `1px solid ${hexRgba(catColor, 0.22)}`,
              borderBottom: `1px solid ${hexRgba(catColor, 0.22)}`,
              borderRadius: 5,
              boxShadow: showPopover
                ? `0 0 0 2px ${catColor}, 0 4px 12px ${hexRgba(catColor, 0.25)}`
                : '0 2px 6px rgba(0,0,0,0.10), 0 1px 2px rgba(0,0,0,0.06)',
            }}
          >
            <div className="flex flex-col h-full overflow-hidden" style={{ padding: '4px 7px' }}>
              {/* Title + total time */}
              <div className="flex items-start justify-between gap-1">
                <span
                  className="font-semibold leading-snug flex-1 line-clamp-2"
                  style={{
                    fontSize: 13,
                    color: THEME.textPrimary,
                    wordBreak: 'break-word',
                    overflow: 'hidden',
                    textDecorationLine: isDone ? 'line-through' : 'none',
                    opacity: isDone ? 0.55 : 1,
                  }}
                >
                  {task.title}
                </span>
                <span
                  className="shrink-0 tabular-nums"
                  style={{ fontSize: 10, color: THEME.textPrimary, opacity: 0.55, marginLeft: 2, whiteSpace: 'nowrap' }}
                >
                  {fmtMins(estimatedMins)}
                </span>
              </div>

              {/* Priority stars are shown in absolute bottom-right corner (see below) */}

              {/* Due date — pushed to bottom */}
              {cardHeight >= 65 && task.dueDate && (
                <div
                  className="mt-auto flex items-center gap-0.5"
                  style={{ fontSize: 10, color: THEME.textPrimary, opacity: 0.5 }}
                >
                  <CalendarIcon className="flex-shrink-0" style={{ width: 10, height: 10, minWidth: 10, minHeight: 10 }} />
                  <span className="truncate">{task.dueDate}</span>
                </div>
              )}
            </div>

            {/* Done circle — top-right corner, direct action without popup */}
            {onMarkTaskDone && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onMarkTaskDone(); }}
                className="absolute flex items-center justify-center rounded-full transition-all"
                style={{
                  top: 4, right: 4,
                  width: 18, height: 18,
                  border: `1.5px solid ${isDone ? catColor : hexRgba(catColor, 0.5)}`,
                  backgroundColor: isDone ? catColor : 'transparent',
                  flexShrink: 0,
                }}
                title={isDone ? 'Mark as not done' : 'Mark as done'}
              >
                {isDone && <CheckIcon style={{ width: 10, height: 10, color: '#FFFFFF' }} />}
              </button>
            )}

            {/* Priority stars — bottom-right corner, category color */}
            {priority > 0 && cardHeight >= 36 && (
              <div
                className="absolute flex items-center"
                style={{ bottom: 4, right: 5, gap: 1.5, pointerEvents: 'none' }}
              >
                {[1, 2, 3, 4, 5].filter((l) => l <= priority).map((l) => (
                  <StarIcon key={l} style={{ width: 7, height: 7, color: catColor, opacity: 0.75 }} />
                ))}
              </div>
            )}

            {/* Resize handle */}
            <div className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize opacity-0 group-hover:opacity-100 transition-opacity">
              <div
                className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-8 h-1 rounded-full"
                style={{ backgroundColor: hexRgba(catColor, 0.35) }}
              />
            </div>
          </div>
        </div>

        {showPopover && popoverRect && typeof document !== 'undefined' && createPortal(
          <div
            ref={popoverRef}
            className="fixed rounded-xl p-3 min-w-[268px] max-w-xs"
            style={{
              zIndex: 200,
              top: popoverRect.top,
              left: popoverRect.left,
              backgroundColor: '#FFFFFF',
              border: '1px solid rgba(0,0,0,0.09)',
              boxShadow: '0 12px 40px rgba(0,0,0,0.12)',
            }}>
            {renderPopoverContent()}
          </div>,
          document.body
        )}
      </>
    );
  }

  // ─── OVERVIEW MODE — todo-list style ──────────────────────────────────────
  return (
    <>
      <div
        ref={cardRef}
        className="group relative cursor-pointer"
        style={{
          borderBottom: '1px solid rgba(0,0,0,0.05)',
          ...(showPopover ? { zIndex: 101 } : {}),
        }}
        onClick={(e) => {
          if (e.detail !== 1) return;
          if (dragEndedRef.current) { dragEndedRef.current = false; return; }
          // Don't open popover if clicking interactive children
          popoverOpenedAtRef.current = Date.now();
          setShowPopover((v) => !v);
        }}
        draggable
        onDragStart={handleDragStart}
        onDragEnd={() => {
          activeDrag.type = null;
          dragEndedRef.current = true;
          window.setTimeout(() => { dragEndedRef.current = false; }, 200);
        }}
      >
        <div
          className="flex items-start gap-2 px-2 py-2 rounded-lg transition-colors"
          style={{ backgroundColor: showPopover ? hexRgba(catColor, 0.04) : 'transparent' }}
          onMouseEnter={(e) => { if (!showPopover) e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.025)'; }}
          onMouseLeave={(e) => { if (!showPopover) e.currentTarget.style.backgroundColor = 'transparent'; }}
        >
          {/* Done circle — left side */}
          {onMarkTaskDone ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMarkTaskDone();
              }}
              className="flex-shrink-0 flex items-center justify-center rounded-full transition-all mt-0.5"
              style={{
                width: 16,
                height: 16,
                border: `1.5px solid ${isDone ? catColor : 'rgba(0,0,0,0.22)'}`,
                backgroundColor: isDone ? catColor : 'transparent',
              }}
              title={isDone ? 'Mark as not done' : 'Mark as done'}
              aria-label={isDone ? 'Mark as not done' : 'Mark as done'}
            >
              {isDone && <CheckIcon className="h-2.5 w-2.5" style={{ color: '#FFFFFF' }} />}
            </button>
          ) : (
            <div className="flex-shrink-0 mt-0.5" style={{ width: 16, height: 16 }} />
          )}

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Title row */}
            <div className="flex items-start justify-between gap-2">
              <span
                className="text-sm font-medium leading-snug flex-1 min-w-0"
                style={{
                  color: isDone ? '#AEAEB2' : THEME.textPrimary,
                  textDecorationLine: isDone ? 'line-through' : 'none',
                  textDecorationColor: 'rgba(0,0,0,0.3)',
                  wordBreak: 'break-word',
                }}
              >
                {task.title}
              </span>

              {/* Right: priority stars + time */}
              <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                {onTogglePin && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onTogglePin();
                    }}
                    className="flex items-center gap-0.5 transition-opacity"
                    style={{
                      color: '#F5A623',
                      opacity: priority > 0 ? 1 : 0,
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = priority > 0 ? '1' : '0'; }}
                    title="Cycle priority"
                    aria-label="Cycle priority"
                  >
                    {priority > 0
                      ? [1, 2, 3, 4, 5].filter((l) => l <= priority).map((l) => (
                          <StarIcon key={l} className="h-2.5 w-2.5" />
                        ))
                      : <StarOutlineIcon className="h-2.5 w-2.5" />
                    }
                  </button>
                )}
                <span
                  className="text-xs font-medium tabular-nums"
                  style={{ color: isDone ? '#AEAEB2' : catColor }}
                >
                  {fmtMins(estimatedMins)}
                </span>
              </div>
            </div>

            {/* Due date */}
            {'dueDate' in task && task.dueDate && !isDone && (
              <div className="mt-0.5" style={{ fontSize: 11, color: THEME.textPrimary, lineHeight: 1.4 }}>
                Due {task.dueDate}
              </div>
            )}

            {/* Progress bar — show when task has scheduled blocks */}
            {task.blockCount >= 1 && !isDone && (
              <div className="mt-1.5 space-y-0.5">
                <div className="w-full rounded-full overflow-hidden" style={{ height: 3, backgroundColor: hexRgba(catColor, 0.12) }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${Math.min(progress, 100)}%`, backgroundColor: catColor }}
                  />
                </div>
                <div className="text-xs" style={{ color: THEME.textPrimary }}>
                  {recordedMins > 0
                    ? `${fmtMins(recordedMins)} done · `
                    : ''}{task.blockCount} {task.blockCount === 1 ? 'block' : 'blocks'} · {fmtMins(estimatedMins)} total
                </div>
              </div>
            )}
          </div>

          {/* Drag handle — subtle on hover */}
          <div className="flex-shrink-0 opacity-0 group-hover:opacity-30 transition-opacity mt-0.5">
            <Bars3Icon className="h-3 w-3" style={{ color: catColor }} />
          </div>
        </div>
      </div>

      {/* Popover portal */}
      {showPopover && popoverRect && typeof document !== 'undefined' && createPortal(
        <div
          ref={popoverRef}
          className="fixed rounded-xl p-3 min-w-[272px] max-w-xs"
          style={{
            zIndex: 200,
            top: popoverRect.top,
            left: popoverRect.left,
            backgroundColor: '#FFFFFF',
            border: '1px solid rgba(0,0,0,0.09)',
            boxShadow: '0 12px 40px rgba(0,0,0,0.14)',
          }}>
          {renderPopoverContent()}
        </div>,
        document.body
      )}
    </>
  );
}
