import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
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

const SPLIT_BLOCK_OPTIONS = [30, 60, 90, 120] as const; // minutes: 30m, 1h, 1.5h, 2h

export function TaskCard({ task, viewMode = 'overview', popoverSide = 'right', onScheduleTask, onEditTask, onDeleteTask, onMarkTaskDone, onBreakIntoChunks, onSplitTask }: TaskCardProps) {
  const [showPopover, setShowPopover] = useState(false);
  const [splitBlockMinutes, setSplitBlockMinutes] = useState(60);
  const [popoverRect, setPopoverRect] = useState<{ top: number; left: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const progress = (task.recordedHours / task.estimatedHours) * 100;

  // Position overview popover with fixed coords; clamp to viewport so it doesn't go off-screen
  useLayoutEffect(() => {
    if (!showPopover || viewMode !== 'overview' || !cardRef.current) return;
    const el = cardRef.current;
    const popoverWidth = 288;
    const popoverMaxHeight = 420;
    const gap = 8;
    const update = () => {
      const rect = el.getBoundingClientRect();
      let left = popoverSide === 'left' ? rect.left - popoverWidth - gap : rect.right + gap;
      let top = rect.top;
      left = Math.max(gap, Math.min(left, typeof window !== 'undefined' ? window.innerWidth - popoverWidth - gap : left));
      top = Math.max(gap, Math.min(top, typeof window !== 'undefined' ? window.innerHeight - popoverMaxHeight - gap : top));
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
  
  // Calculate remaining hours for partially completed tasks
  const remainingHours = task.recordedHours > 0 
    ? Math.max(0, task.estimatedHours - task.recordedHours)
    : task.estimatedHours;
  
  // Use remaining hours for height calculation in plan mode if partially completed
  const displayHours = task.recordedHours > 0 ? remainingHours : task.estimatedHours;
  const heightPerHour = viewMode === 'plan' ? 60 : 40;
  const cardHeight = Math.max(displayHours * heightPerHour, viewMode === 'plan' ? 60 : 80);

  const calendarColors = {
    personal: '#86C0F4',
    work: '#9F5FB0',
    school: '#EC8309',
  };

  const getDurationText = (hours: number) => {
    const h = Math.floor(hours);
    const minutes = Math.round((hours - h) * 60);
    if (h > 0 && minutes > 0) return `${h}h ${minutes}m`;
    if (h > 0) return `${h}h`;
    return `${minutes}m`;
  };

  const handleClick = (e: React.MouseEvent) => {
    // Only show popover on click, not on drag
    if (e.detail === 1) { // Single click
      setShowPopover(true);
    }
  };

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/x-timebox-task-id', task.id);
    const durationMinutes = Math.max(15, Math.round(displayHours * 60));
    e.dataTransfer.setData('application/x-timebox-task-duration', String(durationMinutes));
    e.dataTransfer.setData('text/plain', task.title);
    e.dataTransfer.effectAllowed = 'copy';
    if (e.dataTransfer.setDragImage) {
      const ghost = document.createElement('div');
      const color = (task as { category?: { color?: string } }).category?.color ?? '#2563eb';
      ghost.className = 'rounded-lg shadow-lg px-3 py-2 text-sm font-medium';
      ghost.textContent = task.title;
      ghost.style.position = 'absolute';
      ghost.style.top = '-9999px';
      ghost.style.color = '#1f2937';
      if (color.startsWith('#')) {
        const r = parseInt(color.slice(1, 3), 16), g = parseInt(color.slice(3, 5), 16), b = parseInt(color.slice(5, 7), 16);
        ghost.style.backgroundColor = `rgba(${r}, ${g}, ${b}, 0.2)`;
        ghost.style.border = `2px solid ${color}`;
      } else {
        ghost.style.backgroundColor = 'rgba(59, 130, 246, 0.2)';
        ghost.style.border = '2px solid rgb(59, 130, 246)';
      }
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, 8, 8);
      requestAnimationFrame(() => document.body.removeChild(ghost));
    }
  };

  // Plan mode: looks like calendar time blocks
  if (viewMode === 'plan') {
    const showTags = cardHeight >= 100; // Only show tags if block is tall enough

    return (
      <>
        <div
          className="cursor-grab active:cursor-grabbing group relative"
          style={{ height: `${cardHeight}px` }}
          onClick={handleClick}
          draggable
          onDragStart={handleDragStart}
        >
          <div
            className={`h-full rounded-lg p-3 border transition-[border-color,box-shadow,transform] duration-150 ease-out ${
              showPopover ? 'border-blue-400 ring-2 ring-blue-400 ring-offset-1' : 'border-neutral-200 hover:border-neutral-300 hover:shadow-sm active:scale-[0.99]'
            }`}
            style={{
              backgroundColor: task.category.color,
              opacity: 0.95,
            }}
          >
            <div className="flex flex-col h-full text-white overflow-hidden">
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium text-sm leading-snug flex-1 line-clamp-2">{task.title}</span>
                <span className="text-xs opacity-90 whitespace-nowrap">{getDurationText(displayHours)}</span>
              </div>

              {/* Progress indicator for partially completed */}
              {task.recordedHours > 0 && cardHeight >= 80 && (
                <div className="mt-2">
                  <div className="text-xs opacity-75">
                    {task.recordedHours}h done · {remainingHours}h left
                  </div>
                </div>
              )}

              {showTags && (
                <div className="mt-auto flex items-center gap-1.5 flex-wrap">
                  {task.tags.map(tag => (
                    <span
                      key={tag.id}
                      className="text-xs px-2 py-0.5 rounded-full bg-white/20 backdrop-blur-sm"
                    >
                      {tag.name}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Drag handle */}
            <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <Bars3Icon className="h-3 w-3 text-white/60" />
            </div>

            {/* Resize handle */}
            <div className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-8 h-1 bg-white/40 rounded-full" />
            </div>
          </div>
        </div>

        {/* Popover */}
        {showPopover && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={(e) => {
                e.stopPropagation();
                setShowPopover(false);
              }}
            />
            <div
              className={`absolute z-20 top-0 bg-white rounded-lg shadow-xl border border-neutral-200 p-4 min-w-72 ${
                popoverSide === 'left' ? 'right-full mr-2' : 'left-full ml-2'
              }`}
            >
              <div className="space-y-4">
                {/* Header */}
                <div>
                  <h3 className="font-medium text-neutral-900 mb-1">{task.title}</h3>
                  <div className="flex items-center gap-3 text-xs text-neutral-500 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <ClockIcon className="h-3.5 w-3.5" />
                      {task.estimatedHours}h estimated
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: calendarColors[task.calendar] }}
                      />
                      {task.calendar}
                    </div>
                    {'dueDate' in task && task.dueDate && (
                      <div className="flex items-center gap-1.5">
                        <CalendarIcon className="h-3.5 w-3.5" />
                        Due {task.dueDate}
                      </div>
                    )}
                  </div>
                </div>

                {/* Progress */}
                {task.recordedHours > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-neutral-700">Progress</div>
                    <div className="w-full bg-neutral-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(progress, 100)}%`,
                          backgroundColor: task.category.color,
                        }}
                      />
                    </div>
                    <div className="text-xs text-neutral-500">
                      {task.recordedHours}h completed · {remainingHours}h remaining
                    </div>
                  </div>
                )}

                {/* Category and Tags */}
                <div className="space-y-2">
                  <div className="text-xs font-medium text-neutral-700">Labels</div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <div className="flex items-center gap-1.5 px-2 py-1 bg-neutral-100 rounded-md">
                      <div
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: task.category.color }}
                      />
                      <span className="text-xs text-neutral-700">{task.category.name}</span>
                    </div>
                    {task.tags.map(tag => (
                      <span
                        key={tag.id}
                        className="text-xs px-2 py-1 bg-neutral-100 text-neutral-600 rounded-md"
                      >
                        {tag.name}
                      </span>
                    ))}
                  </div>
                </div>

                {'description' in task && task.description && (
                  <div className="text-xs text-neutral-600 whitespace-pre-wrap">{task.description}</div>
                )}
                {'link' in task && task.link && (
                  <div>
                    <a href={task.link} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline truncate block max-w-full">
                      {task.link}
                    </a>
                  </div>
                )}

                {/* Actions */}
                <div className="pt-2 border-t border-neutral-200 space-y-1">
                  {onBreakIntoChunks && task.estimatedHours > 0 && (
                    <div className="px-1 pb-2">
                      <div className="text-xs font-medium text-neutral-700 mb-1">Break into blocks</div>
                      <div className="flex flex-wrap gap-1.5">
                        <button type="button" onClick={() => { onBreakIntoChunks(task.id, 30); setShowPopover(false); }} className="px-2 py-1.5 text-xs font-medium rounded border border-neutral-200 hover:bg-neutral-50">30 min</button>
                        <button type="button" onClick={() => { onBreakIntoChunks(task.id, 60); setShowPopover(false); }} className="px-2 py-1.5 text-xs font-medium rounded border border-neutral-200 hover:bg-neutral-50">1 h</button>
                      </div>
                    </div>
                  )}
                  {onSplitTask && task.estimatedHours > 0 && (
                  <div className="px-1 pb-2">
                    <div className="text-xs font-medium text-neutral-700 mb-1">Get a block</div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {SPLIT_BLOCK_OPTIONS.map((mins) => (
                        <button
                          key={mins}
                          type="button"
                          onClick={() => setSplitBlockMinutes(mins)}
                          className={`px-2 py-1.5 text-xs font-medium rounded border transition-all ${
                            splitBlockMinutes === mins ? 'bg-blue-50 border-blue-500 text-blue-700' : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                          }`}
                        >
                          {mins === 60 ? '1h' : mins < 60 ? `${mins}m` : `${mins / 60}h`}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => { onSplitTask(task.id, splitBlockMinutes); setShowPopover(false); }}
                        className="px-2 py-1.5 text-xs font-medium rounded border border-green-600 text-green-700 bg-green-50 hover:bg-green-100"
                      >
                        Split
                      </button>
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 rounded-md transition-colors"
                  onClick={() => { onScheduleTask?.(); setShowPopover(false); }}
                >
                  <CalendarIcon className="h-4 w-4" />
                  {task.recordedHours > 0 ? 'Schedule again' : 'Schedule task'}
                </button>
                {onMarkTaskDone && (
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-green-700 hover:bg-green-50 rounded-md transition-colors"
                    onClick={() => { onMarkTaskDone(); setShowPopover(false); }}
                  >
                    <CheckIcon className="h-4 w-4" />
                    Check as done
                  </button>
                )}
                <button
                  type="button"
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 rounded-md transition-colors"
                  onClick={() => { onEditTask?.(); setShowPopover(false); }}
                >
                  <PencilIcon className="h-4 w-4" />
                  Edit details
                </button>
                <button
                  type="button"
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-md transition-colors"
                  onClick={() => { onDeleteTask?.(); setShowPopover(false); }}
                >
                  <XMarkIcon className="h-4 w-4" />
                  Delete task
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
  }

  // Overview mode: compact card view
  return (
    <>
      <div
        ref={cardRef}
        className={`bg-white border rounded-lg p-4 h-24 hover:shadow-sm transition-[border-color,box-shadow,transform] duration-150 ease-out cursor-grab active:cursor-grabbing active:scale-[0.99] group ${
          showPopover ? 'border-blue-400 ring-2 ring-blue-400 ring-offset-1' : 'border-neutral-200 hover:border-neutral-300'
        }`}
        onClick={handleClick}
        draggable
        onDragStart={handleDragStart}
      >
        <div className="flex items-start gap-3 h-full">
          {/* Drag handle */}
          <div className="opacity-0 group-hover:opacity-100 transition-opacity text-neutral-400">
            <Bars3Icon className="h-4 w-4" />
          </div>

          <div className="flex-1 flex flex-col justify-between min-w-0">
            {/* Title and duration */}
            <div>
              <h3 className="font-medium text-sm text-neutral-900 leading-snug mb-1 line-clamp-2">
                {task.title}
              </h3>
              <div className="flex items-center gap-2 flex-wrap">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: calendarColors[task.calendar] }}
                />
                <span className="text-xs text-neutral-500">
                  {task.estimatedHours}h total
                </span>
                {'dueDate' in task && task.dueDate && (
                  <span className="text-xs text-neutral-500">
                    · Due {task.dueDate}
                  </span>
                )}
              </div>
            </div>

            {/* Progress bar */}
            {task.recordedHours > 0 && (
              <div className="space-y-1.5 mb-1">
                <div className="w-full bg-neutral-100 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(progress, 100)}%`,
                      backgroundColor: task.category.color,
                    }}
                  />
                </div>
                <div className="text-xs text-neutral-500">
                  {task.recordedHours}h / {task.estimatedHours}h
                </div>
              </div>
            )}

            {/* Category and tags (wrap) */}
            <div className="flex flex-wrap gap-1.5">
              <div className="flex items-center gap-1.5 px-2 py-1 bg-neutral-100 rounded-md">
                <div
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: task.category.color }}
                />
                <span className="text-xs text-neutral-700">{task.category.name}</span>
              </div>
              {task.tags.map(tag => (
                <span
                  key={tag.id}
                  className="text-xs px-2 py-1 bg-neutral-100 text-neutral-600 rounded-md"
                >
                  {tag.name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Popover: portal with fixed position so it's visible outside overflow:hidden sidebar */}
      {showPopover && (typeof document !== 'undefined' && popoverRect
        ? createPortal(
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowPopover(false);
                }}
              />
              <div
                className="fixed z-50 bg-white rounded-lg shadow-xl border border-neutral-200 p-4 min-w-72"
                style={{ top: popoverRect.top, left: popoverRect.left }}
              >
            <div className="space-y-4">
              {/* Header */}
              <div>
                <h3 className="font-medium text-neutral-900 mb-1">{task.title}</h3>
                <div className="flex items-center gap-3 text-xs text-neutral-500 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <ClockIcon className="h-3.5 w-3.5" />
                    {task.estimatedHours}h estimated
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: calendarColors[task.calendar] }}
                    />
                    {task.calendar}
                  </div>
                  {'dueDate' in task && task.dueDate && (
                    <div className="flex items-center gap-1.5">
                      <CalendarIcon className="h-3.5 w-3.5" />
                      Due {task.dueDate}
                    </div>
                  )}
                </div>
              </div>

              {/* Progress */}
              {task.recordedHours > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-medium text-neutral-700">Progress</div>
                  <div className="w-full bg-neutral-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(progress, 100)}%`,
                        backgroundColor: task.category.color,
                      }}
                    />
                  </div>
                  <div className="text-xs text-neutral-500">
                    {task.recordedHours}h completed · {remainingHours}h remaining
                  </div>
                </div>
              )}

              {/* Category and Tags */}
              <div className="space-y-2">
                <div className="text-xs font-medium text-neutral-700">Labels</div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <div className="flex items-center gap-1.5 px-2 py-1 bg-neutral-100 rounded-md">
                    <div
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: task.category.color }}
                    />
                    <span className="text-xs text-neutral-700">{task.category.name}</span>
                  </div>
                  {task.tags.map(tag => (
                    <span
                      key={tag.id}
                      className="text-xs px-2 py-1 bg-neutral-100 text-neutral-600 rounded-md"
                    >
                      {tag.name}
                    </span>
                  ))}
                </div>
              </div>

              {/* Description */}
              {'description' in task && task.description && (
                <div className="text-xs text-neutral-600 whitespace-pre-wrap">{task.description}</div>
              )}
              {/* Link */}
              {'link' in task && task.link && (
                <div>
                  <a href={task.link} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline truncate block max-w-full">
                    {task.link}
                  </a>
                </div>
              )}

              {/* Actions */}
              <div className="pt-2 border-t border-neutral-200 space-y-1">
                {onBreakIntoChunks && task.estimatedHours > 0 && (
                  <div className="px-1 pb-2">
                    <div className="text-xs font-medium text-neutral-700 mb-1">Break into blocks</div>
                    <div className="flex flex-wrap gap-1.5">
                      <button type="button" onClick={() => { onBreakIntoChunks(task.id, 30); setShowPopover(false); }} className="px-2 py-1.5 text-xs font-medium rounded border border-neutral-200 hover:bg-neutral-50">30 min</button>
                      <button type="button" onClick={() => { onBreakIntoChunks(task.id, 60); setShowPopover(false); }} className="px-2 py-1.5 text-xs font-medium rounded border border-neutral-200 hover:bg-neutral-50">1 h</button>
                    </div>
                  </div>
                )}
                {onSplitTask && task.estimatedHours > 0 && (
                  <div className="px-1 pb-2">
                    <div className="text-xs font-medium text-neutral-700 mb-1">Get a block</div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {SPLIT_BLOCK_OPTIONS.map((mins) => (
                        <button
                          key={mins}
                          type="button"
                          onClick={() => setSplitBlockMinutes(mins)}
                          className={`px-2 py-1.5 text-xs font-medium rounded border transition-all ${
                            splitBlockMinutes === mins ? 'bg-blue-50 border-blue-500 text-blue-700' : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                          }`}
                        >
                          {mins === 60 ? '1h' : mins < 60 ? `${mins}m` : `${mins / 60}h`}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => { onSplitTask(task.id, splitBlockMinutes); setShowPopover(false); }}
                        className="px-2 py-1.5 text-xs font-medium rounded border border-green-600 text-green-700 bg-green-50 hover:bg-green-100"
                      >
                        Split
                      </button>
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 rounded-md transition-colors"
                  onClick={() => { onScheduleTask?.(); setShowPopover(false); }}
                >
                  <CalendarIcon className="h-4 w-4" />
                  {task.recordedHours > 0 ? 'Schedule again' : 'Schedule task'}
                </button>
                {onMarkTaskDone && (
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-green-700 hover:bg-green-50 rounded-md transition-colors"
                    onClick={() => { onMarkTaskDone(); setShowPopover(false); }}
                  >
                    <CheckIcon className="h-4 w-4" />
                    Check as done
                  </button>
                )}
                <button
                  type="button"
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 rounded-md transition-colors"
                  onClick={() => { onEditTask?.(); setShowPopover(false); }}
                >
                  <PencilIcon className="h-4 w-4" />
                  Edit details
                </button>
                <button
                  type="button"
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-md transition-colors"
                  onClick={() => { onDeleteTask?.(); setShowPopover(false); }}
                >
                  <XMarkIcon className="h-4 w-4" />
                  Delete task
                </button>
              </div>
            </div>
          </div>
        </>,
        document.body
      )
        : null)}
    </>
  );
}