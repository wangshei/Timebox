import React, { useState } from 'react';
import { TimeBlock, Mode } from '../App';
import { Check, Edit3, X } from 'lucide-react';

interface TimeBlockCardProps {
  block: TimeBlock;
  mode: Mode;
  style: React.CSSProperties;
  isSelected: boolean;
  onSelect: () => void;
  onDeselect: () => void;
  compact?: boolean; // Add compact mode for week/month views
}

export function TimeBlockCard({ block, mode, style, isSelected, onSelect, onDeselect, compact = false }: TimeBlockCardProps) {
  const [showPopover, setShowPopover] = useState(false);
  
  const isPlanningMode = mode === 'planning';
  const isPlanned = block.type === 'planned';
  const isRecorded = block.type === 'recorded';

  // Determine opacity based on mode and block type
  const getOpacity = () => {
    if (isPlanningMode) {
      return isPlanned ? 1 : 0.5;
    } else {
      return isRecorded ? 1 : 0.3;
    }
  };

  const getDuration = () => {
    const [startHour, startMin] = block.startTime.split(':').map(Number);
    const [endHour, endMin] = block.endTime.split(':').map(Number);
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
          }}
        >
          <div className="text-white text-xs truncate font-medium">
            {block.title}
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
              <button className="w-full flex items-center gap-3 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 rounded-md transition-colors">
                <Check className="w-4 h-4" />
                Done as planned
              </button>
              <button className="w-full flex items-center gap-3 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 rounded-md transition-colors">
                <Edit3 className="w-4 h-4" />
                Done differently
              </button>
              <div className="border-t border-neutral-200 my-1" />
              <button className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-md transition-colors">
                <X className="w-4 h-4" />
                Delete block
              </button>
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
        }}
      >
        <div className="flex flex-col h-full text-white">
          <div className="flex items-start justify-between gap-2">
            <span className="font-medium text-sm leading-snug">{block.title}</span>
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
            <button className="w-full flex items-center gap-3 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 rounded-md transition-colors">
              <Check className="w-4 h-4" />
              Done as planned
            </button>
            <button className="w-full flex items-center gap-3 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 rounded-md transition-colors">
              <Edit3 className="w-4 h-4" />
              Done differently
            </button>
            <div className="border-t border-neutral-200 my-1" />
            <button className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-md transition-colors">
              <X className="w-4 h-4" />
              Delete block
            </button>
          </div>
        </>
      )}
    </div>
  );
}