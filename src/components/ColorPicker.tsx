import React, { useState, useRef } from 'react';
import { PALETTE_COLORS } from '../constants/colors';

const SWATCH_PX = { sm: 20, md: 24 } as const;

/** Palette grouped by hue family — 4 rows × 5 columns */
const PALETTE_ROWS = [
  PALETTE_COLORS.slice(0, 5),   // Row 1 — Reds / Pinks / Peaches
  PALETTE_COLORS.slice(5, 10),  // Row 2 — Yellows
  PALETTE_COLORS.slice(10, 15), // Row 3 — Greens
  PALETTE_COLORS.slice(15, 20), // Row 4 — Blues
] as const;

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  label?: string;
  /** Swatch size: 'sm' or 'md'. */
  swatchSize?: 'sm' | 'md';
}

/**
 * Color selection: 4×5 palette grid grouped by hue family.
 * Custom: "+" button opens a small popup with hex input + native color picker.
 */
export function ColorPicker({
  value,
  onChange,
  label,
  swatchSize = 'md',
}: ColorPickerProps) {
  const [showCustom, setShowCustom] = useState(false);
  const [hexInput, setHexInput] = useState('');
  const nativePickerRef = useRef<HTMLInputElement>(null);

  const px = SWATCH_PX[swatchSize];
  const normalizedValue = value && /^#[0-9A-Fa-f]{6}$/.test(value) ? value : '#8DA387';
  const swatchStyle = { width: px, height: px, minWidth: px, minHeight: px };
  const isCustom = !PALETTE_COLORS.some(c => c.value.toLowerCase() === value.toLowerCase()) && value.startsWith('#');

  /** Resolve hex input to a valid #RRGGBB (with or without leading #) */
  const resolveHex = (raw: string): string | null => {
    const h = raw.trim().startsWith('#') ? raw.trim() : `#${raw.trim()}`;
    return /^#[0-9A-Fa-f]{6}$/.test(h) ? h : null;
  };

  const handleHexCommit = () => {
    const hex = resolveHex(hexInput);
    if (hex) {
      onChange(hex);
      setShowCustom(false);
    }
  };

  /** Preview color for the hex input swatch — use current value if input invalid */
  const previewColor = resolveHex(hexInput) ?? normalizedValue;

  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-xs font-medium" style={{ color: '#636366' }}>{label}</label>
      )}
      <div className="space-y-1 pt-1.5">
        {PALETTE_ROWS.map((row, rowIdx) => (
          <div key={rowIdx} className="flex gap-1">
            {row.map(({ name, value: hex }) => (
              <button
                key={name}
                type="button"
                onClick={() => onChange(hex)}
                style={{
                  ...swatchStyle,
                  backgroundColor: hex,
                  borderRadius: 5,
                  border: value.toLowerCase() === hex.toLowerCase()
                    ? '2px solid rgba(0,0,0,0.35)'
                    : '1.5px solid rgba(0,0,0,0.10)',
                  boxShadow: value.toLowerCase() === hex.toLowerCase()
                    ? '0 0 0 1.5px rgba(255,255,255,0.9) inset'
                    : 'none',
                  transition: 'transform 0.1s, border-color 0.1s',
                }}
                title={name}
                aria-label={name}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.15)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
              />
            ))}
          </div>
        ))}

        {/* Custom color row */}
        <div className="flex gap-1 pt-0.5 items-center" style={{ position: 'relative' }}>
          {/* "+" button */}
          <button
            type="button"
            onClick={() => {
              setHexInput(isCustom ? value : '');
              setShowCustom((v) => !v);
            }}
            style={{
              ...swatchStyle,
              borderRadius: 5,
              border: showCustom
                ? '2px solid rgba(141,162,134,0.5)'
                : '1.5px dashed rgba(0,0,0,0.22)',
              cursor: 'pointer',
              backgroundColor: showCustom ? 'rgba(141,162,134,0.08)' : 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: showCustom ? '#8DA286' : '#8E8E93',
              fontSize: px > 24 ? 16 : 13,
              lineHeight: 1,
              transition: 'border-color 0.1s, background-color 0.1s, color 0.1s',
            }}
            title="Custom color"
            aria-label="Pick custom color"
          >
            +
          </button>

          {/* Current custom color preview swatch */}
          {isCustom && (
            <div
              style={{
                ...swatchStyle,
                backgroundColor: value,
                borderRadius: 5,
                border: '2px solid rgba(0,0,0,0.35)',
                boxShadow: '0 0 0 1.5px rgba(255,255,255,0.9) inset',
                flexShrink: 0,
              }}
              title="Current custom color"
            />
          )}

          {/* Custom picker popup */}
          {showCustom && (
            <div
              className="absolute rounded-xl shadow-xl"
              style={{
                top: '100%',
                left: 0,
                marginTop: 6,
                zIndex: 50,
                backgroundColor: '#FFFFFF',
                border: '1px solid rgba(0,0,0,0.09)',
                padding: '12px',
                minWidth: 172,
                boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
              }}
            >
              <div
                className="text-[10px] font-semibold uppercase tracking-wider mb-2.5"
                style={{ color: '#AEAEB2', letterSpacing: '0.08em' }}
              >
                Custom color
              </div>

              {/* Color preview + hex input */}
              <div className="flex gap-2 items-center mb-2.5">
                {/* Native picker trigger (preview swatch) */}
                <label
                  style={{
                    width: 32,
                    height: 32,
                    minWidth: 32,
                    borderRadius: 7,
                    backgroundColor: previewColor,
                    border: '1.5px solid rgba(0,0,0,0.12)',
                    cursor: 'pointer',
                    display: 'block',
                    position: 'relative',
                    overflow: 'hidden',
                    flexShrink: 0,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                  }}
                  title="Open system color picker"
                >
                  <input
                    ref={nativePickerRef}
                    type="color"
                    value={normalizedValue}
                    onChange={(e) => {
                      setHexInput(e.target.value);
                      onChange(e.target.value);
                    }}
                    style={{
                      position: 'absolute',
                      inset: 0,
                      width: '100%',
                      height: '100%',
                      opacity: 0,
                      cursor: 'pointer',
                    }}
                    aria-label="Pick custom color"
                  />
                </label>

                {/* Hex input */}
                <input
                  type="text"
                  placeholder="#000000"
                  value={hexInput}
                  onChange={(e) => setHexInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleHexCommit();
                    if (e.key === 'Escape') setShowCustom(false);
                  }}
                  maxLength={7}
                  className="flex-1 text-xs px-2 py-1.5 rounded-lg outline-none"
                  style={{
                    border: '1px solid rgba(0,0,0,0.10)',
                    backgroundColor: '#F5F5F7',
                    color: '#1C1C1E',
                    fontFamily: 'ui-monospace, monospace',
                    letterSpacing: '0.02em',
                  }}
                />
              </div>

              {/* Apply / Cancel */}
              <div className="flex gap-1.5 mt-2 pt-2">
                <button
                  type="button"
                  onClick={handleHexCommit}
                  className="flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors"
                  style={{ backgroundColor: '#8DA286', color: '#1C1C1E' }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#7A9278'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#8DA286'; }}
                >
                  Apply
                </button>
                <button
                  type="button"
                  onClick={() => setShowCustom(false)}
                  className="py-1.5 px-2.5 text-xs rounded-lg transition-colors"
                  style={{ backgroundColor: 'rgba(0,0,0,0.05)', color: '#636366' }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.09)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)'; }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
