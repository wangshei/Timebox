import React from 'react';
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
  compact = false,
}: CalendarContainerListProps) {
  return (
    <div className="space-y-0.5">
      {containers.map((container) => (
        <div key={container.id} className="flex items-center gap-1.5 min-w-0">
          <input
            id={`cal-${container.id}`}
            type="checkbox"
            checked={visibility[container.id] ?? true}
            onChange={() => onToggleVisibility(container.id)}
            className="w-3.5 h-3.5 rounded border-neutral-300 text-blue-600 focus:ring-blue-500 flex-shrink-0"
          />
          <button
            type="button"
            onClick={() => onFocusCalendar?.(container.id)}
            className={`flex-1 flex items-center gap-2 pl-2 pr-1.5 py-1.5 rounded-r text-left text-sm transition-colors min-w-0 border-l-[3px] ${
              focusedCalendarId === container.id ? 'text-neutral-900 font-medium' : 'text-neutral-700 hover:opacity-90'
            }`}
            style={{ borderLeftColor: container.color, backgroundColor: `${container.color}12` }}
          >
            <span className="flex-1 truncate">{container.name}</span>
          </button>
        </div>
      ))}
    </div>
  );
}
