import React from 'react';
import { CalendarIcon } from '@heroicons/react/24/solid';
import { CalendarContainer, CalendarContainerVisibility } from '../types';

interface CalendarContainerListProps {
  containers: CalendarContainer[];
  visibility: CalendarContainerVisibility;
  onToggleVisibility: (containerId: string) => void;
  focusedCalendarId?: string | null;
  onFocusCalendar?: (id: string) => void;
  /** Notion-like: no section heading, tighter rows, left-aligned */
  compact?: boolean;
}

export function CalendarContainerList({
  containers,
  visibility,
  onToggleVisibility,
  focusedCalendarId = null,
  onFocusCalendar,
}: CalendarContainerListProps) {
  return (
    <div className="space-y-0.5">
      {containers.map((container) => {
        const isFocused = focusedCalendarId === container.id;
        return (
          <div key={container.id} className="flex items-center gap-1.5 min-w-0">
            <input
              id={`cal-${container.id}`}
              type="checkbox"
              checked={visibility[container.id] ?? true}
              onChange={() => onToggleVisibility(container.id)}
              className="w-3.5 h-3.5 rounded flex-shrink-0 cursor-pointer"
              style={{
                accentColor: container.color,
                border: `1.5px solid rgba(0,0,0,0.14)`,
              }}
            />
            <button
              type="button"
              onClick={() => onFocusCalendar?.(container.id)}
              className="flex-1 flex items-center gap-2 pl-2 pr-1.5 py-1.5 rounded-r text-left transition-all min-w-0 border-l-[3px]"
              style={{
                borderLeftColor: container.color,
                backgroundColor: isFocused ? `${container.color}22` : `${container.color}10`,
                color: isFocused ? '#1C1C1E' : '#636366',
                fontWeight: isFocused ? 600 : 400,
                fontSize: '12px',
              }}
            >
              <CalendarIcon className="h-3.5 w-3.5 flex-shrink-0" style={{ color: container.color, opacity: 0.75 }} />
              <span className="flex-1 truncate">{container.name}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
