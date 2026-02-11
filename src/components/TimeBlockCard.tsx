import React, { useState } from 'react';
import { Mode } from '../types';
import { ResolvedTimeBlock } from '../utils/dataResolver';
import { Check, Edit3, X } from 'lucide-react';

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
  block: ResolvedTimeBlock;
  mode: Mode;
  style: React.CSSProperties;
  isSelected: boolean;
  onSelect: () => void;
  onDeselect: () => void;
  onDoneAsPlanned?: (blockId: string) => void;
  onDidSomethingElse?: (plannedBlockId: string, recorded: RecordedBlockPayload) => void;
  onDeleteBlock?: (blockId: string) => void;
  focusedCategoryId?: string | null;
  focusedCalendarId?: string | null;
  compact?: boolean;
}

const FOCUS_MUTED_OPACITY = 0.35;

export function TimeBlockCard({ block, mode, style, isSelected, onSelect, onDeselect, onDoneAsPlanned, onDidSomethingElse, onDeleteBlock, focusedCategoryId, focusedCalendarId, compact = false }: TimeBlockCardProps) {
  const [showPopover, setShowPopover] = useState(false);
  
  const isPlanningMode = mode === 'planning';
  const isPlanned = block.mode === 'planned';
  const isRecorded = block.mode === 'recorded';

  // Base opacity from mode and block type
  const getBaseOpacity = () => {
    if (isPlanningMode) {
      return isPlanned ? 1 : 0.5;
    } else {
      return isRecorded ? 1 : 0.3;
    }
  };

  // When a category or calendar is focused, exaggerate matching blocks and mute others
  const getOpacity = () => {
    const base = getBaseOpacity();
    if (focusedCategoryId != null) {
      return block.category.id === focusedCategoryId ? base : FOCUS_MUTED_OPACITY;
    }
    if (focusedCalendarId != null) {
      return block.calendarContainerId === focusedCalendarId ? base : FOCUS_MUTED_OPACITY;
    }
    return base;
  };

  const buildRecordedPayload = (overrides: Partial<RecordedBlockPayload> = {}): RecordedBlockPayload => ({
    taskId: block.taskId ?? undefined,
    title: block.title,
    calendarContainerId: block.calendarContainerId,
    categoryId: block.category.id,
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

  // Compact mode for week view
  if (compact) {
    return (
      <div
        className="absolute left-0 right-0 cursor-pointer"
        style={style}
        onClick={() => {
          onSelect();
          setShowPopover(true);
        }}
      >
        <div
          className={`h-full rounded px-1.5 py-1 border transition-all ${
            isRecorded && !isPlanningMode
              ? 'border-neutral-300'
              : 'border-transparent'
          } ${isSelected ? 'ring-1 ring-blue-400' : ''}`}
          style={{
            backgroundColor: block.category.color,
            opacity: getOpacity(),
            borderLeft: `4px solid ${block.calendarContainer.color}`,
          }}
        >
          <div className="text-white text-xs truncate font-medium">
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
                    <Check className="w-4 h-4" />
                    Done as planned
                  </button>
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 rounded-md transition-colors"
                    onClick={() => { onDidSomethingElse?.(block.id, buildRecordedPayload()); setShowPopover(false); onDeselect(); }}
                  >
                    <Edit3 className="w-4 h-4" />
                    Done differently
                  </button>
                  <div className="border-t border-neutral-200 my-1" />
                </>
              )}
              {onDeleteBlock && (
                <button
                  type="button"
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-md transition-colors"
                  onClick={() => { onDeleteBlock(block.id); setShowPopover(false); onDeselect(); }}
                >
                  <X className="w-4 h-4" />
                  Delete block
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
      className="absolute left-0 right-2 cursor-pointer group"
      style={style}
      onClick={() => {
        onSelect();
        setShowPopover(true);
      }}
    >
      <div
        className={`h-full rounded-lg p-3 border transition-all ${
          isRecorded && !isPlanningMode
            ? 'border-neutral-300 shadow-sm'
            : 'border-neutral-200'
        } ${isSelected ? 'ring-2 ring-blue-400 ring-offset-1' : ''}`}
        style={{
          backgroundColor: block.category.color,
          opacity: getOpacity(),
          borderLeft: `4px solid ${block.calendarContainer.color}`,
        }}
      >
        <div className="flex flex-col h-full text-white">
          <div className="flex items-start justify-between gap-2">
            <span className="font-medium text-sm leading-snug">{block.title || 'Untitled'}</span>
            <span className="text-xs opacity-90 whitespace-nowrap">{getDuration()}</span>
          </div>
          
          <div className="mt-auto flex items-center gap-1.5 flex-wrap">
            {block.tags.map(tag => (
              <span
                key={tag.id}
                className="text-xs px-2 py-0.5 rounded-full bg-white/20 backdrop-blur-sm"
              >
                {tag.name}
              </span>
            ))}
          </div>
        </div>

        {/* Resize handle */}
        <div className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-8 h-1 bg-white/40 rounded-full" />
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
                  <Check className="w-4 h-4" />
                  Done as planned
                </button>
                <button
                  type="button"
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 rounded-md transition-colors"
                  onClick={() => { onDidSomethingElse?.(block.id, buildRecordedPayload()); setShowPopover(false); onDeselect(); }}
                >
                  <Edit3 className="w-4 h-4" />
                  Done differently
                </button>
                <div className="border-t border-neutral-200 my-1" />
              </>
            )}
            {onDeleteBlock && (
              <button
                type="button"
                className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-md transition-colors"
                onClick={() => { onDeleteBlock(block.id); setShowPopover(false); onDeselect(); }}
              >
                <X className="w-4 h-4" />
                Delete block
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}