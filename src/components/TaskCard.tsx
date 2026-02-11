import React, { useState } from 'react';
import { Task } from '../App';
import { GripVertical, Calendar, Clock, Edit3, X } from 'lucide-react';

interface TaskCardProps {
  task: Task;
  viewMode?: 'overview' | 'plan';
  onScheduleTask?: () => void;
  onEditTask?: () => void;
  onDeleteTask?: () => void;
}

export function TaskCard({ task, viewMode = 'overview', onScheduleTask, onEditTask, onDeleteTask }: TaskCardProps) {
  const [showPopover, setShowPopover] = useState(false);
  const progress = (task.recordedHours / task.estimatedHours) * 100;
  
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
    e.dataTransfer.setData('text/plain', task.title);
    e.dataTransfer.effectAllowed = 'copy';
    if (e.dataTransfer.setDragImage) {
      const ghost = document.createElement('div');
      ghost.className = 'bg-white border border-neutral-200 rounded-lg shadow-lg px-3 py-2 text-sm text-neutral-800';
      ghost.textContent = task.title;
      ghost.style.position = 'absolute';
      ghost.style.top = '-9999px';
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, 0, 0);
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
            className={`h-full rounded-lg p-3 border transition-all ${
              showPopover ? 'border-blue-400 ring-2 ring-blue-400 ring-offset-1' : 'border-neutral-200 hover:border-neutral-300 hover:shadow-sm'
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
              <GripVertical className="w-3 h-3 text-white/60" />
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
            <div className="absolute z-20 top-0 left-full ml-2 bg-white rounded-lg shadow-xl border border-neutral-200 p-4 min-w-72">
              <div className="space-y-4">
                {/* Header */}
                <div>
                  <h3 className="font-medium text-neutral-900 mb-1">{task.title}</h3>
                  <div className="flex items-center gap-3 text-xs text-neutral-500">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      {task.estimatedHours}h estimated
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: calendarColors[task.calendar] }}
                      />
                      {task.calendar}
                    </div>
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

                {/* Actions */}
                <div className="pt-2 border-t border-neutral-200 space-y-1">
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 rounded-md transition-colors"
                    onClick={() => { onScheduleTask?.(); setShowPopover(false); }}
                  >
                    <Calendar className="w-4 h-4" />
                    Schedule task
                  </button>
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 rounded-md transition-colors"
                    onClick={() => { onEditTask?.(); setShowPopover(false); }}
                  >
                    <Edit3 className="w-4 h-4" />
                    Edit details
                  </button>
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-md transition-colors"
                    onClick={() => { onDeleteTask?.(); setShowPopover(false); }}
                  >
                    <X className="w-4 h-4" />
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
        className={`bg-white border rounded-lg p-4 hover:shadow-sm transition-all cursor-grab active:cursor-grabbing group ${
          showPopover ? 'border-blue-400 ring-2 ring-blue-400 ring-offset-1' : 'border-neutral-200 hover:border-neutral-300'
        }`}
        style={{ minHeight: `${cardHeight}px` }}
        onClick={handleClick}
        draggable
        onDragStart={handleDragStart}
      >
        <div className="flex items-start gap-3 h-full">
          {/* Drag handle */}
          <div className="opacity-0 group-hover:opacity-100 transition-opacity text-neutral-400">
            <GripVertical className="w-4 h-4" />
          </div>

          <div className="flex-1 space-y-3">
            {/* Title and duration */}
            <div>
              <h3 className="font-medium text-sm text-neutral-900 leading-snug mb-1">
                {task.title}
              </h3>
              <div className="flex items-center gap-2">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: calendarColors[task.calendar] }}
                />
                <span className="text-xs text-neutral-500">
                  {task.estimatedHours}h total
                </span>
              </div>
            </div>

            {/* Progress bar */}
            {task.recordedHours > 0 && (
              <div className="space-y-1.5">
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

            {/* Category and tags */}
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
          <div className="absolute z-20 top-0 left-full ml-2 bg-white rounded-lg shadow-xl border border-neutral-200 p-4 min-w-72">
            <div className="space-y-4">
              {/* Header */}
              <div>
                <h3 className="font-medium text-neutral-900 mb-1">{task.title}</h3>
                <div className="flex items-center gap-3 text-xs text-neutral-500">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    {task.estimatedHours}h estimated
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: calendarColors[task.calendar] }}
                    />
                    {task.calendar}
                  </div>
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

              {/* Actions */}
              <div className="pt-2 border-t border-neutral-200 space-y-1">
                <button
                  type="button"
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 rounded-md transition-colors"
                  onClick={() => { onScheduleTask?.(); setShowPopover(false); }}
                >
                  <Calendar className="w-4 h-4" />
                  Schedule task
                </button>
                <button
                  type="button"
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 rounded-md transition-colors"
                  onClick={() => { onEditTask?.(); setShowPopover(false); }}
                >
                  <Edit3 className="w-4 h-4" />
                  Edit details
                </button>
                <button
                  type="button"
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-md transition-colors"
                  onClick={() => { onDeleteTask?.(); setShowPopover(false); }}
                >
                  <X className="w-4 h-4" />
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