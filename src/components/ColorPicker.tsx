import React from 'react';
import { PALETTE_COLORS } from '../constants/colors';

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  /** Optional label above the picker */
  label?: string;
}

/** Style-guide palette (Red, Orange, Yellow, Green, Blue, Purple, Gray) + Custom. */
export function ColorPicker({ value, onChange, label }: ColorPickerProps) {
  return (
    <div className="space-y-1.5">
      {label && <span className="text-xs font-medium text-neutral-600">{label}</span>}
      <div className="flex flex-wrap items-center gap-2">
        {PALETTE_COLORS.map(({ name, value: hex }) => (
          <button
            key={name}
            type="button"
            onClick={() => onChange(hex)}
            className={`w-7 h-7 rounded-md border-2 transition-all flex-shrink-0 ${
              value.toLowerCase() === hex.toLowerCase()
                ? 'border-neutral-900 ring-1 ring-neutral-400'
                : 'border-neutral-200 hover:border-neutral-400'
            }`}
            style={{ backgroundColor: hex }}
            title={name}
            aria-label={name}
          />
        ))}
        <label className="flex items-center gap-1.5 cursor-pointer">
          <span className="text-xs text-neutral-500">Custom</span>
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-7 h-7 rounded border border-neutral-200 cursor-pointer"
          />
        </label>
      </div>
    </div>
  );
}
