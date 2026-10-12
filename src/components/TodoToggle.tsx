import React from 'react';
import { CheckIcon } from '@heroicons/react/24/outline';

/** Radio-style ring that toggles a note into a to-do (filled = to-do). Matches the list checkbox. */
export function TodoToggle({ checked, onChange, size = 14, style }: { checked: boolean; onChange: (v: boolean) => void; size?: number; style?: React.CSSProperties }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label="Todo"
      title={checked ? 'Todo (click to make it a note)' : 'Todo'}
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => { e.stopPropagation(); onChange(!checked); }}
      className="flex-shrink-0 flex items-center justify-center"
      style={{ width: size + 2, height: size + 2, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', ...style }}
    >
      <span
        className="flex items-center justify-center rounded-full"
        style={{
          width: size, height: size, boxSizing: 'border-box',
          border: `1.5px solid ${checked ? 'var(--tb-accent)' : 'rgba(0,0,0,0.3)'}`,
          backgroundColor: checked ? 'var(--tb-accent)' : 'transparent',
        }}
      >
        {checked && <CheckIcon style={{ width: size - 4, height: size - 4, color: '#FFFFFF' }} strokeWidth={3} />}
      </span>
    </button>
  );
}
