import React from 'react';
import { PALETTE_COLORS } from '../constants/colors';

const SWATCH_PX = { sm: 24, md: 32 } as const;

/** Rainbow gradient for "Custom" swatch to indicate color picker (not the current color). */
const RAINBOW_GRADIENT =
  'linear-gradient(to right, #D93D3D, #EC8309, #E6B800, #7FB800, #13B49F, #0044A8, #5B5B9E, #9F5FB0)';

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  label?: string;
  /** Swatch size: 'sm' or 'md'. Layout is always a compact grid (2–3 rows). */
  swatchSize?: 'sm' | 'md';
}

/**
 * Color selection: palette swatches in a compact 2–3 row grid + Custom (rainbow) that opens native picker.
 */
export function ColorPicker({
  value,
  onChange,
  label,
  swatchSize = 'md',
}: ColorPickerProps) {
  const px = SWATCH_PX[swatchSize];
  const normalizedValue = value && /^#[0-9A-Fa-f]{6}$/.test(value) ? value : '#6b7280';
  const swatchStyle = { width: px, height: px, minWidth: px, minHeight: px };

  return (
    <div className="space-y-2">
      {label && (
        <label className="block text-sm font-medium text-neutral-700">{label}</label>
      )}
      <div
        className="grid gap-1.5 w-full max-w-[240px]"
        style={{
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
        }}
      >
        {PALETTE_COLORS.map(({ name, value: hex }) => (
          <button
            key={name}
            type="button"
            onClick={() => onChange(hex)}
            style={swatchStyle}
            className={`relative overflow-hidden rounded-md border-2 transition-all flex-shrink-0 p-0 justify-self-center ${
              value.toLowerCase() === hex.toLowerCase()
                ? 'border-neutral-600 ring-2 ring-offset-1 ring-neutral-400'
                : 'border-neutral-200 hover:border-neutral-400 hover:scale-105'
            }`}
            title={name}
            aria-label={name}
          >
            <span
              className="absolute inset-0 rounded-[4px]"
              style={{ backgroundColor: hex }}
              aria-hidden
            />
          </button>
        ))}
        {/* Custom: rainbow stripe = color picker; click opens native picker */}
        <label
          style={swatchStyle}
          className="relative overflow-hidden rounded-md border-2 border-dashed border-neutral-400 hover:border-neutral-500 cursor-pointer flex-shrink-0 block justify-self-center"
          title="Pick custom color"
        >
          <span
            className="absolute inset-0 rounded-[4px] opacity-90"
            style={{ background: RAINBOW_GRADIENT }}
            aria-hidden
          />
          <input
            type="color"
            value={normalizedValue}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 w-full h-full cursor-pointer opacity-0"
            aria-label="Pick custom color"
          />
        </label>
      </div>
    </div>
  );
}
