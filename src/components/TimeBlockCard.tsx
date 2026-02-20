import React, { useState } from 'react';
import { Mode } from '../types';
import { ResolvedTimeBlock } from '../utils/dataResolver';
import { CheckIcon, PencilIcon, XMarkIcon } from '@heroicons/react/24/solid';

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
  onSelect: () => void;
  onDeselect: () => void;
  onDoneAsPlanned?: (blockId: string) => void;
  onDidSomethingElse?: (plannedBlockId: string, recorded: RecordedBlockPayload) => void;
  onEditBlock?: (blockId: string) => void;
  onDeleteBlock?: (blockId: string) => void;
  onDeleteTask?: (taskId: string) => void;
  /** Called when user mousedowns on the bottom-edge resize handle; parent should start resize drag. */
  onResizeStart?: (e: React.MouseEvent) => void;
  /** For compare mode: taskIds that have both planned and recorded blocks that day. */
  compareMatchedTaskIds?: string[];
  focusedCategoryId?: string | null;
  focusedCalendarId?: string | null;
  compact?: boolean;
}

const FOCUS_MUTED_OPACITY = 0.35;

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return null;
  return {
    r: parseInt(m[1], 16),
    g: parseInt(m[2], 16),
    b: parseInt(m[3], 16),
  };
}

function hexToRgba(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) => v.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Lighten a hex color by mixing it with white (ratio 0–1)
function lighten(hex: string, ratio: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const r = Math.round(rgb.r + (255 - rgb.r) * ratio);
  const g = Math.round(rgb.g + (255 - rgb.g) * ratio);
  const b = Math.round(rgb.b + (255 - rgb.b) * ratio);
  return rgbToHex(r, g, b);
}

export function TimeBlockCard({
  block,
  mode,
  style,
  isSelected,
  onSelect,
  onDeselect,
  onDoneAsPlanned,
  onDidSomethingElse,
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
  
  const isPlanningMode = mode === 'planning';
  const isRecordingMode = mode === 'recording';
  const isCompareMode = mode === 'compare';
  const isPlanned = block.mode === 'planned';
  const isRecorded = block.mode === 'recorded';
  const matchedSet = compareMatchedTaskIds ? new Set(compareMatchedTaskIds) : null;

  // Base opacity from mode and block type
  const getBaseOpacity = () => {
    if (isPlanningMode) {
      return isPlanned ? 1 : 0.5;
    }
    if (isRecordingMode) {
      return isRecorded ? 1 : 0.3;
    }
    // compare: recorded = strong, planned = ghosted
    if (isCompareMode) {
      return isRecorded ? 1 : 0.25;
    }
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

  const getBackgroundColor = () => {
    const base = getBlockColor();
    // Planned blocks: transparent fill + colored border. Recorded: solid color.
    if (isRecorded) return base;
    return hexToRgba(base, 0.2);
  };

  const getBorderStyle = () => {
    const color = getBlockColor();
    if (isRecorded && !isPlanningMode) return { borderLeft: `4px solid ${color}` as const };
    // Planned: full border in block color
    return { border: `2px solid ${color}`, borderLeft: `4px solid ${color}` };
  };

  const buildRecordedPayload = (overrides: Partial<RecordedBlockPayload> = {}): RecordedBlockPayload => ({
    taskId: block.taskId ?? undefined,
    title: block.title,
    calendarContainerId: block.calendarContainerId,
    categoryId: block.category?.id ?? block.categoryId ?? '',
    tagIds: block.tags.map((t) => t.id),
    start: block.start,
    end: block.end,
    date: block.date,
    ...overrides,
  });

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
          onSelect();
          setShowPopover(true);
        }}
        draggable
        onDragStart={handleBlockDragStart}
      >
        <div
          className={`h-full rounded px-1.5 py-1 transition-all ${isSelected ? 'ring-1 ring-blue-400' : ''}`}
          style={{
            backgroundColor: getBackgroundColor(),
            opacity: getOpacity(),
            ...getBorderStyle(),
          }}
        >
          <div className={`text-xs truncate font-medium ${isPlanned ? 'text-neutral-800' : 'text-white'}`}>
            {block.title || 'Untitled'}
          </div>
        </div>

        {/* Popover */}
        {showPopover && isSelected && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={(e) => {
                e.stopPropagation();
                setShowPopover(false);
                onDeselect();
              }}
            />
            <div className="absolute z-20 top-full mt-2 left-0 bg-white rounded-lg shadow-lg border border-neutral-200 p-2 min-w-48">
              {mode === 'recording' && isPlanned && (
                <>
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 rounded-md transition-colors"
                    onClick={() => { onDoneAsPlanned?.(block.id); setShowPopover(false); onDeselect(); }}
                  >
                    <CheckIcon className="h-4 w-4" />
                    Done as planned
                  </button>
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 rounded-md transition-colors"
                    onClick={() => { onDidSomethingElse?.(block.id, buildRecordedPayload()); setShowPopover(false); onDeselect(); }}
                  >
                    <PencilIcon className="h-4 w-4" />
                    Done differently
                  </button>
                  <div className="border-t border-neutral-200 my-1" />
                </>
              )}
              {onEditBlock && (
                <button
                  type="button"
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 rounded-md transition-colors"
                  onClick={() => { onEditBlock(block.id); setShowPopover(false); onDeselect(); }}
                >
                  <PencilIcon className="h-4 w-4" />
                  Edit block
                </button>
              )}
              {onDeleteBlock && (
                <button
                  type="button"
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-md transition-colors"
                  onClick={() => { onDeleteBlock(block.id); setShowPopover(false); onDeselect(); }}
                >
                  <XMarkIcon className="h-4 w-4" />
                  Delete block
                </button>
              )}
              {onDeleteTask && block.taskId && (
                <button
                  type="button"
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-700 hover:bg-red-50 rounded-md transition-colors"
                  onClick={() => { onDeleteTask(block.taskId!); setShowPopover(false); onDeselect(); }}
                >
                  <XMarkIcon className="h-4 w-4" />
                  Delete task
                </button>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div
      className="absolute cursor-grab active:cursor-grabbing group pr-1 pointer-events-auto"
      style={style}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={() => {
        onSelect();
        setShowPopover(true);
      }}
      draggable
      onDragStart={handleBlockDragStart}
    >
      <div
        className={`h-full rounded-lg p-3 border transition-all ${
          isRecorded && !isPlanningMode
            ? 'border-neutral-300 shadow-sm'
            : 'border-neutral-200'
        } ${isSelected ? 'ring-2 ring-blue-400 ring-offset-1' : ''}`}
        style={{
          backgroundColor: getBackgroundColor(),
          opacity: getOpacity(),
          ...getBorderStyle(),
        }}
      >
        <div className={`flex flex-col h-full ${isPlanned ? 'text-neutral-800' : 'text-white'}`}>
          <div className="flex items-start justify-between gap-2">
            <span className="font-medium text-sm leading-snug">{block.title || 'Untitled'}</span>
            <span className="text-xs opacity-90 whitespace-nowrap">{getDuration()}</span>
          </div>
          
          {showTags && (
            <div className="mt-auto flex items-center gap-1.5 flex-nowrap overflow-hidden">
              {block.tags.map((tag) => (
                <span
                  key={tag.id}
                  className="text-xs px-2 py-0.5 rounded-full bg-white/20 backdrop-blur-sm truncate max-w-[120px] shrink-0"
                >
                  {tag.name}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Resize handle — only when onResizeStart provided (planning mode) */}
        {onResizeStart && (
          <div
            className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize opacity-0 group-hover:opacity-100 transition-opacity"
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onResizeStart(e); }}
          >
            <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-8 h-1 bg-white/40 rounded-full" />
          </div>
        )}
      </div>

      {/* Popover */}
      {showPopover && isSelected && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={(e) => {
              e.stopPropagation();
              setShowPopover(false);
              onDeselect();
            }}
          />
          <div className="absolute z-20 top-full mt-2 left-0 bg-white rounded-lg shadow-lg border border-neutral-200 p-2 min-w-48">
            {mode === 'recording' && isPlanned && (
              <>
                <button
                  type="button"
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 rounded-md transition-colors"
                  onClick={() => { onDoneAsPlanned?.(block.id); setShowPopover(false); onDeselect(); }}
                >
                  <CheckIcon className="w-4 h-4" />
                  Done as planned
                </button>
                <button
                  type="button"
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 rounded-md transition-colors"
                  onClick={() => { onDidSomethingElse?.(block.id, buildRecordedPayload()); setShowPopover(false); onDeselect(); }}
                >
                  <PencilIcon className="w-4 h-4" />
                  Done differently
                </button>
                <div className="border-t border-neutral-200 my-1" />
              </>
            )}
            {onEditBlock && (
              <button
                type="button"
                className="w-full flex items-center gap-3 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 rounded-md transition-colors"
                onClick={() => { onEditBlock(block.id); setShowPopover(false); onDeselect(); }}
              >
                <PencilIcon className="h-4 w-4" />
                Edit block
              </button>
            )}
            {onDeleteBlock && (
              <button
                type="button"
                className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-md transition-colors"
                onClick={() => { onDeleteBlock(block.id); setShowPopover(false); onDeselect(); }}
              >
                <XMarkIcon className="h-4 w-4" />
                Delete block
              </button>
            )}
            {onDeleteTask && block.taskId && (
              <button
                type="button"
                className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-700 hover:bg-red-50 rounded-md transition-colors"
                onClick={() => { onDeleteTask(block.taskId!); setShowPopover(false); onDeselect(); }}
              >
                <XMarkIcon className="w-4 h-4" />
                Delete task
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}