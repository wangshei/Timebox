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
            className={`flex-1 flex items-center gap-2 px-1.5 py-1 rounded text-left text-sm transition-colors min-w-0 ${
              focusedCalendarId === container.id ? 'bg-neutral-100 text-neutral-900' : 'hover:bg-neutral-50 text-neutral-700'
            }`}
          >
            <div
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: container.color }}
            />
            <span className="flex-1 truncate text-left">{container.name}</span>
          </button>
        </div>
      ))}
    </div>
  );
}
