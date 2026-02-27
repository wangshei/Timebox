import React, { useState, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Task } from '../App';
import { Bars3Icon, CalendarIcon, CheckIcon, ClockIcon, PencilIcon, XMarkIcon } from '@heroicons/react/24/solid';

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
  /** Mark all planned blocks of this task as done (create recorded for each). */
  onMarkTaskDone?: () => void;
  /** Break task into smaller tasks (e.g. 30min, 1h chunks) and add to backlog. */
  onBreakIntoChunks?: (taskId: string, chunkMinutes: number) => void;
  /** Split this task into two: one with chunkMinutes, original reduced by that amount. */
  onSplitTask?: (taskId: string, chunkMinutes: number) => void;
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
}: TaskCardProps) {
  const [showPopover, setShowPopover] = useState(false);
  const [splitBlockMinutes, setSplitBlockMinutes] = useState(60);
  const [popoverRect, setPopoverRect] = useState<{ top: number; left: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Derive time values — displayTasks provides estimatedHours and recordedHours
  const estimatedMins = Math.round((task.estimatedHours ?? 0) * 60);
  const recordedMins = Math.round((task.recordedHours ?? 0) * 60);
  const remainingMins = Math.max(0, estimatedMins - recordedMins);
  const progress = estimatedMins > 0 ? Math.min(100, (recordedMins / estimatedMins) * 100) : 0;
  const catColor = task.category?.color ?? '#8DA286';

  // Position overview popover with fixed coords
  useLayoutEffect(() => {
    if (!showPopover || viewMode !== 'overview' || !cardRef.current) return;
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
    e.dataTransfer.setData('application/x-timebox-task-id', task.id);
    const durationMins = Math.max(15, recordedMins > 0 ? remainingMins : estimatedMins);
    e.dataTransfer.setData('application/x-timebox-task-duration', String(durationMins));
    e.dataTransfer.setData('application/x-timebox-task-color', catColor);
    e.dataTransfer.setData('text/plain', task.title);
    e.dataTransfer.effectAllowed = 'copy';
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
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h3 className="font-semibold text-sm leading-snug mb-1" style={{ color: '#1C1C1E' }}>{task.title}</h3>
        <div className="flex flex-wrap gap-2 text-xs" style={{ color: '#636366' }}>
          <span className="flex items-center gap-1">
            <ClockIcon className="h-3.5 w-3.5" />
            {fmtMins(estimatedMins)} estimated
          </span>
          {'dueDate' in task && task.dueDate && (
            <span className="flex items-center gap-1">
              <CalendarIcon className="h-3.5 w-3.5" />
              Due {task.dueDate}
            </span>
          )}
        </div>
      </div>

      {/* Progress */}
      {recordedMins > 0 && (
        <div className="space-y-1.5">
          <div className="text-xs font-medium" style={{ color: '#636366' }}>Progress</div>
          <div className="w-full rounded-full h-2 overflow-hidden" style={{ backgroundColor: hexRgba(catColor, 0.12) }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(progress, 100)}%`, backgroundColor: catColor }} />
          </div>
          <div className="text-xs" style={{ color: '#636366' }}>
            {fmtMins(recordedMins)} done · {fmtMins(remainingMins)} left
          </div>
        </div>
      )}

      {/* Category & Tags */}
      <div className="space-y-1.5">
        <div className="text-xs font-medium" style={{ color: '#636366' }}>Labels</div>
        <div className="flex flex-wrap gap-1.5">
          {task.category && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full"
              style={{ backgroundColor: hexRgba(catColor, 0.12), border: `1px solid ${hexRgba(catColor, 0.25)}` }}>
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: catColor }} />
              <span className="text-xs font-medium" style={{ color: catColor }}>{task.category.name}</span>
            </div>
          )}
          {task.tags.map(tag => (
            <span key={tag.id} className="text-xs px-2 py-1 rounded-full"
              style={{ backgroundColor: hexRgba(catColor, 0.07), color: catColor, border: `1px solid ${hexRgba(catColor, 0.18)}` }}>
              {tag.name}
            </span>
          ))}
        </div>
      </div>

      {/* Description */}
      {'description' in task && task.description && (
        <div className="text-xs whitespace-pre-wrap leading-relaxed" style={{ color: '#636366' }}>{task.description}</div>
      )}
      {/* Link */}
      {'link' in task && task.link && (
        <a href={task.link} target="_blank" rel="noopener noreferrer"
          className="text-xs truncate block max-w-full hover:underline"
          style={{ color: '#8DA286' }}>
          {task.link}
        </a>
      )}

      {/* Actions */}
      <div className="space-y-0.5 pt-2" style={{ borderTop: '1px solid rgba(0,0,0,0.08)' }}>
        {/* Break into blocks */}
        {onBreakIntoChunks && estimatedMins > 0 && (
          <div className="px-1 pb-2">
            <div className="text-xs font-medium mb-1.5" style={{ color: '#636366' }}>Break into blocks</div>
            <div className="flex flex-wrap gap-1.5">
              {[30, 60, 90].map((mins) => (
                <button key={mins} type="button"
                  onClick={() => { onBreakIntoChunks(task.id, mins); setShowPopover(false); }}
                  className="px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors"
                  style={{ border: '1px solid rgba(0,0,0,0.12)', color: '#636366', backgroundColor: 'transparent' }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = hexRgba(catColor, 0.06))}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}>
                  {mins < 60 ? `${mins}m` : `${mins / 60}h`}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Get a block (split) */}
        {onSplitTask && estimatedMins > 0 && (
          <div className="px-1 pb-2">
            <div className="text-xs font-medium mb-1.5" style={{ color: '#636366' }}>Get a block</div>
            <div className="flex flex-wrap items-center gap-1.5">
              {SPLIT_BLOCK_OPTIONS.map((mins) => (
                <button key={mins} type="button"
                  onClick={() => setSplitBlockMinutes(mins)}
                  className="px-2.5 py-1.5 text-xs font-medium rounded-lg transition-all"
                  style={{
                    border: splitBlockMinutes === mins ? `1.5px solid ${catColor}` : '1px solid rgba(0,0,0,0.12)',
                    backgroundColor: splitBlockMinutes === mins ? hexRgba(catColor, 0.1) : 'transparent',
                    color: splitBlockMinutes === mins ? catColor : '#636366',
                  }}>
                  {mins < 60 ? `${mins}m` : `${mins / 60}h`}
                </button>
              ))}
              <button type="button"
                onClick={() => { onSplitTask(task.id, splitBlockMinutes); setShowPopover(false); }}
                className="px-2.5 py-1.5 text-xs font-medium rounded-lg"
                style={{ backgroundColor: hexRgba(catColor, 0.12), color: catColor, border: `1px solid ${hexRgba(catColor, 0.3)}` }}>
                Split
              </button>
            </div>
          </div>
        )}

        <button type="button"
          className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors"
          style={{ color: '#636366' }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = hexRgba(catColor, 0.07))}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          onClick={() => { onScheduleTask?.(); setShowPopover(false); }}>
          <CalendarIcon className="h-4 w-4" />
          {recordedMins > 0 ? 'Schedule again' : 'Schedule task'}
        </button>

        {onMarkTaskDone && (
          <button type="button"
            className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors"
            style={{ color: '#6A8C5A' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(106,140,90,0.08)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            onClick={() => { onMarkTaskDone(); setShowPopover(false); }}>
            <CheckIcon className="h-4 w-4" />
            Mark as done
          </button>
        )}

        <button type="button"
          className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors"
          style={{ color: '#636366' }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.04)')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          onClick={() => { onEditTask?.(); setShowPopover(false); }}>
          <PencilIcon className="h-4 w-4" />
          Edit details
        </button>

        <button type="button"
          className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors"
          style={{ color: '#C87868' }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(200,120,104,0.08)')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          onClick={() => { onDeleteTask?.(); setShowPopover(false); }}>
          <XMarkIcon className="h-4 w-4" />
          Delete task
        </button>
      </div>
    </div>
  );

  // ─── PLAN MODE ───────────────────────────────────────────────────────────────
  if (viewMode === 'plan') {
    const displayMins = recordedMins > 0 ? remainingMins : estimatedMins;
    const cardHeight = Math.max(displayMins, 60); // 1px per min, min 60px

    return (
      <>
        <div
          className="cursor-grab active:cursor-grabbing group relative"
          style={{ height: `${cardHeight}px` }}
          onClick={() => setShowPopover((v) => !v)}
          draggable
          onDragStart={handleDragStart}
        >
          <div className="h-full rounded-xl p-3 overflow-hidden transition-[box-shadow] duration-150"
            style={{
              backgroundColor: hexRgba(catColor, 0.88),
              border: `1.5px solid ${hexRgba(catColor, 0.55)}`,
              boxShadow: showPopover ? `0 0 0 2.5px ${catColor}, 0 4px 12px ${hexRgba(catColor, 0.25)}` : `0 2px 8px ${hexRgba(catColor, 0.2)}`,
            }}>
            <div className="flex flex-col h-full text-white overflow-hidden">
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium text-sm leading-snug flex-1 line-clamp-2">{task.title}</span>
                <span className="text-xs opacity-80 whitespace-nowrap shrink-0">{fmtMins(displayMins)}</span>
              </div>
              {recordedMins > 0 && cardHeight >= 80 && (
                <div className="mt-1 text-xs opacity-70">{fmtMins(recordedMins)} done · {fmtMins(remainingMins)} left</div>
              )}
              {cardHeight >= 100 && task.tags.length > 0 && (
                <div className="mt-auto flex flex-wrap gap-1 pt-1">
                  {task.tags.map(tag => (
                    <span key={tag.id} className="text-xs px-1.5 py-0.5 rounded-full bg-white/20">{tag.name}</span>
                  ))}
                </div>
              )}
            </div>
            {/* Resize handle */}
            <div className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-8 h-1 bg-white/40 rounded-full" />
            </div>
          </div>
        </div>

        {/* Plan-mode popover */}
        {showPopover && (
          <>
            <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setShowPopover(false); }} />
            <div
              className={`absolute z-20 top-0 rounded-xl shadow-2xl p-4 min-w-72 ${popoverSide === 'left' ? 'right-full mr-2' : 'left-full ml-2'}`}
              style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.09)', boxShadow: '0 12px 40px rgba(0,0,0,0.12)' }}>
              {renderPopoverContent()}
            </div>
          </>
        )}
      </>
    );
  }

  // ─── OVERVIEW MODE ────────────────────────────────────────────────────────────
  return (
    <>
      <div
        ref={cardRef}
        className="group relative cursor-grab active:cursor-grabbing rounded-xl p-3 transition-all duration-150 ease-out active:scale-[0.99]"
        style={{
          backgroundColor: '#FFFFFF',
          borderTop: '1px solid rgba(0,0,0,0.09)',
          borderRight: '1px solid rgba(0,0,0,0.09)',
          borderBottom: '1px solid rgba(0,0,0,0.09)',
          borderLeft: `3px solid ${catColor}`,
          boxShadow: showPopover
            ? `0 0 0 2px ${hexRgba(catColor, 0.2)}, 0 4px 16px rgba(0,0,0,0.08)`
            : '0 1px 3px rgba(0,0,0,0.04)',
          outline: showPopover ? `1.5px solid ${hexRgba(catColor, 0.6)}` : 'none',
          outlineOffset: '1px',
        }}
        onClick={(e) => { if (e.detail === 1) setShowPopover((v) => !v); }}
        draggable
        onDragStart={handleDragStart}
      >
        {/* Drag handle */}
        <div className="absolute top-3 right-2.5 opacity-0 group-hover:opacity-50 transition-opacity">
          <Bars3Icon className="h-3.5 w-3.5" style={{ color: catColor }} />
        </div>

        <div className="flex flex-col gap-2 pr-5">
          {/* Title + duration badge */}
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-medium text-sm leading-snug line-clamp-2 flex-1" style={{ color: '#1C1C1E' }}>
              {task.title}
            </h3>
            <span
              className="text-xs whitespace-nowrap shrink-0 px-1.5 py-0.5 rounded-md font-medium"
              style={{ backgroundColor: hexRgba(catColor, 0.1), color: catColor }}>
              {fmtMins(estimatedMins)}
            </span>
          </div>

          {/* Progress (if in progress) */}
          {recordedMins > 0 && (
            <div className="space-y-1">
              <div className="w-full rounded-full h-1.5 overflow-hidden" style={{ backgroundColor: hexRgba(catColor, 0.1) }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(progress, 100)}%`, backgroundColor: catColor }} />
              </div>
              <div className="text-xs" style={{ color: '#636366' }}>
                {fmtMins(recordedMins)} done · {fmtMins(remainingMins)} left
              </div>
            </div>
          )}

          {/* Category + tags */}
          <div className="flex flex-wrap gap-1.5 items-center">
            {task.category && (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{ backgroundColor: hexRgba(catColor, 0.12), color: catColor, border: `1px solid ${hexRgba(catColor, 0.25)}` }}>
                {task.category.name}
              </span>
            )}
            {task.tags.slice(0, 3).map(tag => (
              <span key={tag.id} className="text-xs px-2 py-0.5 rounded-full"
                style={{ backgroundColor: hexRgba(catColor, 0.07), color: catColor, border: `1px solid ${hexRgba(catColor, 0.18)}` }}>
                {tag.name}
              </span>
            ))}
            {task.tags.length > 3 && (
              <span className="text-xs" style={{ color: '#636366' }}>+{task.tags.length - 3}</span>
            )}
          </div>

          {/* Due date */}
          {'dueDate' in task && task.dueDate && (
            <div className="flex items-center gap-1 text-xs" style={{ color: '#636366' }}>
              <CalendarIcon className="h-3 w-3" />
              <span>Due {task.dueDate}</span>
            </div>
          )}
        </div>
      </div>

      {/* Popover portal — fixed position so it escapes overflow:hidden sidebar */}
      {showPopover && popoverRect && typeof document !== 'undefined' && createPortal(
        <>
          <div className="fixed inset-0 z-40"
            onClick={(e) => { e.stopPropagation(); setShowPopover(false); }} />
          <div className="fixed z-50 rounded-xl p-4 min-w-[292px] max-w-xs"
            style={{
              top: popoverRect.top,
              left: popoverRect.left,
              backgroundColor: '#FFFFFF',
              border: '1px solid rgba(0,0,0,0.09)',
              boxShadow: '0 12px 40px rgba(0,0,0,0.14)',
            }}>
            {renderPopoverContent()}
          </div>
        </>,
        document.body
      )}
    </>
  );
}
