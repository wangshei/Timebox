import React from 'react';
import { COLOR } from '../../styles/tokens';

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}

/** Switch: 36x20 track, 16 thumb. */
export function Toggle({ checked, onChange, label, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        position: 'relative', width: 36, height: 20, borderRadius: 999, border: 'none', padding: 0, flexShrink: 0,
        background: checked ? COLOR.accent : COLOR.faint, cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1, transition: 'background-color 0.15s ease',
      }}
    >
      <span style={{ position: 'absolute', top: 2, left: checked ? 18 : 2, width: 16, height: 16, borderRadius: 999, background: COLOR.surface, boxShadow: '0 1px 2px rgba(0,0,0,0.2)', transition: 'left 0.15s ease' }} />
    </button>
  );
}
