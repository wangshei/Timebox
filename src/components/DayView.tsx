import React from 'react';
import { Mode } from '../types';
import { ResolvedTimeBlock } from '../utils/dataResolver';
import { TimeBlockCard } from './TimeBlockCard';

interface DayViewProps {
  mode: Mode;
  timeBlocks: ResolvedTimeBlock[];
  selectedBlock: string | null;
  onSelectBlock: (id: string | null) => void;
}

export function DayView({ mode, timeBlocks, selectedBlock, onSelectBlock }: DayViewProps) {
  // Generate hours from 6 AM to 10 PM
  const hours = Array.from({ length: 17 }, (_, i) => i + 6);

  const parseTime = (time: string): number => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  };

  const getBlockStyle = (block: ResolvedTimeBlock) => {
    const startMinutes = parseTime(block.start);
    const endMinutes = parseTime(block.end);
    const duration = endMinutes - startMinutes;
    
    // Calculate position relative to 6 AM (360 minutes)
    const top = ((startMinutes - 360) / 60) * 80; // 80px per hour
    const height = (duration / 60) * 80;
    
    return { top, height };
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-8 py-4 md:py-6">
      <div className="relative">
        {/* Time labels and grid lines */}
        {hours.map((hour) => (
          <div key={hour} className="relative" style={{ height: '80px' }}>
            <div className="absolute left-0 top-0 w-12 md:w-16 text-xs text-neutral-400">
              {hour === 12 ? '12:00 PM' : hour > 12 ? `${hour - 12}:00 PM` : `${hour}:00 AM`}
            </div>
            <div className="absolute left-14 md:left-20 right-0 top-0 border-t border-neutral-200" />
            <div className="absolute left-14 md:left-20 right-0 top-10 border-t border-neutral-100" />
          </div>
        ))}

        {/* Time blocks */}
        <div className="absolute left-14 md:left-20 right-0 top-0">
          {timeBlocks.map((block) => {
            const { top, height } = getBlockStyle(block);
            return (
              <TimeBlockCard
                key={block.id}
                block={block}
                mode={mode}
                style={{ top: `${top}px`, height: `${height}px` }}
                isSelected={selectedBlock === block.id}
                onSelect={() => onSelectBlock(block.id)}
                onDeselect={() => onSelectBlock(null)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}