import React from 'react';
import { CalendarContainer, CalendarContainerVisibility } from '../types';

interface CalendarContainerListProps {
  containers: CalendarContainer[];
  visibility: CalendarContainerVisibility;
  onToggleVisibility: (containerId: string) => void;
  /** Click to focus: exaggerate this calendar's blocks, mute others. Optional. */
  focusedCalendarId?: string | null;
  onFocusCalendar?: (id: string) => void;
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
      <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">
        Calendars {onFocusCalendar ? '(click to focus)' : ''}
      </h3>
      {containers.map((container) => (
        <div key={container.id} className="flex items-center gap-1">
          <input
            id={`cal-${container.id}`}
            type="checkbox"
            checked={visibility[container.id] ?? true}
            onChange={() => onToggleVisibility(container.id)}
            className="w-4 h-4 rounded border-neutral-300 text-blue-600 focus:ring-blue-500 flex-shrink-0"
          />
          <button
            type="button"
            onClick={() => onFocusCalendar?.(container.id)}
            className={`flex-1 flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-sm transition-colors min-w-0 ${
              focusedCalendarId === container.id ? 'bg-neutral-200 text-neutral-900' : 'hover:bg-neutral-50 text-neutral-700'
            }`}
          >
            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: container.color }}
            />
            <span className="flex-1 truncate">{container.name}</span>
          </button>
        </div>
      ))}
    </div>
  );
}
