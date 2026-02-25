import React from 'react';
import { cn } from '../../components/ui/utils';

export interface GridAestheticProps {
  className?: string;
  hours?: number[];
  showCurrentTime?: boolean;
}

export function GridAesthetic({
  className,
  hours = [9, 10, 11, 12, 13, 14],
  showCurrentTime = true,
}: GridAestheticProps) {
  const rowHeight = 64; // PX_PER_HOUR

  const formatHour = (h: number) => {
    if (h === 0) return '12 AM';
    if (h === 12) return '12 PM';
    return h > 12 ? `${h - 12} PM` : `${h} AM`;
  };

  return (
    <div className={cn('relative bg-white border border-neutral-100 rounded-xl overflow-hidden shadow-sm', className)}>
      {/* Container simulating calendar grid */}
      <div className="relative w-full overflow-hidden" style={{ height: hours.length * rowHeight }}>
        {hours.map((hour, index) => (
          <div
            key={hour}
            className="absolute left-0 right-0 pointer-events-none"
            style={{ top: index * rowHeight, height: rowHeight }}
          >
            {/* Hour Label */}
            <div className="absolute left-4 top-0 w-12 text-[11px] font-medium text-neutral-400 leading-none -translate-y-1/2">
              {formatHour(hour)}
            </div>

            {/* Solid Hour Line */}
            <div
              className="absolute left-16 right-4 top-0 border-t border-neutral-200"
            />
            
            {/* Dashed Half-Hour Line (Optional based on design preference, reference showed solid for hour, maybe no half-hour) */}
            <div
              className="absolute left-16 right-4 top-1/2 border-t border-dashed border-neutral-100"
            />
          </div>
        ))}

        {/* Current Time Line */}
        {showCurrentTime && (
          <div
            className="absolute left-16 right-4 z-10 pointer-events-none flex items-center"
            style={{ top: 2.5 * rowHeight }} // Hardcoded to show midway for demonstration
          >
            {/* The dot/handle on the left */}
            <div className="w-2 h-2 rounded-full bg-red-500 absolute -left-1" />
            {/* The line itself */}
            <div className="w-full h-[2px] bg-red-500" />
            {/* The time label floating above */}
            <div className="absolute -left-14 text-[10px] font-semibold text-red-500 bg-white px-1">
              11:30 AM
            </div>
          </div>
        )}

        {/* Dummy Block for context */}
        <div
          className="absolute left-20 right-8 z-0 bg-blue-50/80 border-l-[3px] border-blue-500 rounded-lg p-3"
          style={{ top: 1 * rowHeight, height: 1.5 * rowHeight }}
        >
          <div className="text-xs font-semibold text-blue-700">Team Sync</div>
          <div className="text-[10px] text-blue-500 mt-0.5">10:00 AM - 11:30 AM</div>
        </div>
      </div>
    </div>
  );
}
