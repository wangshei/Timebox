import React, { useState } from 'react';
import { TrashIcon, CalendarIcon, ClockIcon } from '@heroicons/react/24/solid';
import { ResolvedEvent } from '../utils/dataResolver';

interface EventCardProps {
  event: ResolvedEvent;
  style: React.CSSProperties;
  isSelected: boolean;
  onSelect: () => void;
  onDeselect: () => void;
  onDeleteEvent?: (eventId: string) => void;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return null;
  return {
    r: parseInt(m[1], 16),
    g: parseInt(m[2], 16),
    b: parseInt(m[3], 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) => v.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function lighten(hex: string, ratio: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const r = Math.round(rgb.r + (255 - rgb.r) * ratio);
  const g = Math.round(rgb.g + (255 - rgb.g) * ratio);
  const b = Math.round(rgb.b + (255 - rgb.b) * ratio);
  return rgbToHex(r, g, b);
}

export function EventCard({
  event,
  style,
  isSelected,
  onSelect,
  onDeselect,
  onDeleteEvent,
}: EventCardProps) {
  const [showPopover, setShowPopover] = useState(false);

  const baseColor = event.category?.color ?? '#6b7280';
  const bgColor = lighten(baseColor, 0.82);
  const borderColor = baseColor;

  const heightPx =
    typeof style.height === 'number'
      ? style.height
      : typeof style.height === 'string'
        ? parseFloat(style.height)
        : 0;

  const getDuration = () => {
    const [startHour, startMin] = event.start.split(':').map(Number);
    const [endHour, endMin] = event.end.split(':').map(Number);
    const minutes = (endHour * 60 + endMin) - (startHour * 60 + startMin);
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
    if (hours > 0) return `${hours}h`;
    return `${mins}m`;
  };

  return (
    <div
      className="absolute cursor-pointer group pr-1 pointer-events-auto"
      style={style}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={() => {
        onSelect();
        setShowPopover(true);
      }}
    >
      <div
        className={`h-full rounded-lg px-3 py-2 border-2 border-dashed transition-all ${
          isSelected ? 'ring-2 ring-blue-400 ring-offset-1' : ''
        }`}
        style={{
          backgroundColor: bgColor,
          borderColor,
        }}
      >
        <div className="flex flex-col h-full">
          <div className="flex items-start justify-between gap-2">
            <span className="font-medium text-sm leading-snug truncate" style={{ color: borderColor }}>
              {event.title || 'Untitled Event'}
            </span>
            <span className="text-xs whitespace-nowrap opacity-70" style={{ color: borderColor }}>
              {getDuration()}
            </span>
          </div>
          {heightPx >= 48 && (
            <div className="mt-0.5 text-xs opacity-60" style={{ color: borderColor }}>
              {event.start} – {event.end}
            </div>
          )}
          {heightPx >= 64 && event.category && (
            <div className="mt-auto flex items-center gap-1">
              <span
                className="text-xs px-2 py-0.5 rounded-full truncate max-w-[120px]"
                style={{ backgroundColor: `${borderColor}20`, color: borderColor }}
              >
                {event.category.name}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Detail popover */}
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
          <div className="absolute z-20 top-full mt-2 left-0 bg-white rounded-lg shadow-lg border border-neutral-200 p-3 min-w-56">
            {/* Event title */}
            <div className="font-semibold text-sm text-neutral-800 mb-2">
              {event.title || 'Untitled Event'}
            </div>

            {/* Time */}
            <div className="flex items-center gap-2 text-xs text-neutral-500 mb-1.5">
              <ClockIcon className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{event.start} – {event.end} ({getDuration()})</span>
            </div>

            {/* Date */}
            <div className="flex items-center gap-2 text-xs text-neutral-500 mb-1.5">
              <CalendarIcon className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{event.date}</span>
            </div>

            {/* Category */}
            {event.category && (
              <div className="flex items-center gap-2 text-xs text-neutral-500 mb-1.5">
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: event.category.color }}
                />
                <span>{event.category.name}</span>
              </div>
            )}

            {/* Calendar */}
            {event.calendarContainer && (
              <div className="flex items-center gap-2 text-xs text-neutral-500 mb-3">
                <div
                  className="w-3 h-3 rounded flex-shrink-0 border"
                  style={{ backgroundColor: event.calendarContainer.color, borderColor: event.calendarContainer.color }}
                />
                <span>{event.calendarContainer.name}</span>
              </div>
            )}

            {/* Divider + Delete */}
            {onDeleteEvent && (
              <>
                <div className="border-t border-neutral-200 my-1" />
                <button
                  type="button"
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-md transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteEvent(event.id);
                    setShowPopover(false);
                    onDeselect();
                  }}
                >
                  <TrashIcon className="h-4 w-4" />
                  Delete event
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
