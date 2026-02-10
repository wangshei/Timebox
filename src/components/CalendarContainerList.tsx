import React from 'react';
import { CalendarContainer, CalendarContainerVisibility } from '../types';

interface CalendarContainerListProps {
  containers: CalendarContainer[];
  visibility: CalendarContainerVisibility;
  onToggleVisibility: (containerId: string) => void;
}

export function CalendarContainerList({
  containers,
  visibility,
  onToggleVisibility,
}: CalendarContainerListProps) {
  return (
    <div className="space-y-1">
      <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-3">
        Calendars
      </h3>
      {containers.map((container) => (
        <label
          key={container.id}
          className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-neutral-50 cursor-pointer group"
        >
          <input
            type="checkbox"
            checked={visibility[container.id] ?? true}
            onChange={() => onToggleVisibility(container.id)}
            className="w-4 h-4 rounded border-neutral-300 text-blue-600 focus:ring-blue-500"
          />
          <div
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: container.color }}
          />
          <span className="text-sm text-neutral-700 flex-1">{container.name}</span>
        </label>
      ))}
    </div>
  );
}
