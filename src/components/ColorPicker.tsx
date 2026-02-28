import React, { useState } from 'react';
import { HexColorPicker } from 'react-colorful';
import { PALETTE_COLORS } from '../constants/colors';

const SWATCH_PX = { sm: 20, md: 24 } as const;

/**
 * Palette grouped by hue family — 4 rows × 5 columns.
 * Each group has a tinted background.
 */
const PALETTE_GROUPS = [
  { label: 'Warm',   colors: PALETTE_COLORS.slice(0, 5),  bg: 'rgba(222,141,145,0.10)' },
  { label: 'Yellow', colors: PALETTE_COLORS.slice(5, 10), bg: 'rgba(218,209,95,0.12)'  },
  { label: 'Green',  colors: PALETTE_COLORS.slice(10, 15), bg: 'rgba(141,163,135,0.12)' },
  { label: 'Blue',   colors: PALETTE_COLORS.slice(15, 20), bg: 'rgba(91,113,140,0.10)'  },
] as const;

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  label?: string;
  /** Swatch size: 'sm' or 'md'. */
  swatchSize?: 'sm' | 'md';
}

/**
 * Color selection:
 * - 4×5 palette grid with per-hue-group tinted backgrounds
 * - "+" button toggles the react-colorful HexColorPicker + hex input
 */
export function ColorPicker({
  value,
  onChange,
  label,
  swatchSize = 'md',
}: ColorPickerProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [hexInput, setHexInput] = useState('');

  const px = SWATCH_PX[swatchSize];
  const normalizedValue = value && /^#[0-9A-Fa-f]{6}$/.test(value) ? value : '#8DA387';

  /** Resolve hex input to a valid #RRGGBB */
  const resolveHex = (raw: string): string | null => {
    const h = raw.trim().startsWith('#') ? raw.trim() : `#${raw.trim()}`;
    return /^#[0-9A-Fa-f]{6}$/.test(h) ? h : null;
  };

  const handleHexCommit = () => {
    const hex = resolveHex(hexInput);
    if (hex) { onChange(hex); setHexInput(''); }
  };

  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-xs font-medium" style={{ color: '#636366' }}>{label}</label>
      )}

      <div style={{ paddingTop: label ? 4 : 0 }}>
        {/* ── Palette groups ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {PALETTE_GROUPS.map((group, gi) => (
            <div
              key={gi}
              style={{ backgroundColor: group.bg, borderRadius: 6, padding: '4px 5px' }}
            >
              <div className="flex gap-1 justify-center">
                {group.colors.map(({ name, value: hex }) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => onChange(hex)}
                    style={{
                      width: px, height: px, minWidth: px, minHeight: px,
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
            </div>
          ))}
        </div>

        {/* ── Thin divider + "+" toggle row ── */}
        <div style={{ height: 1, backgroundColor: 'rgba(0,0,0,0.06)', margin: '6px 0' }} />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setShowPicker((v) => !v);
              setHexInput('');
            }}
            style={{
              width: px, height: px, minWidth: px,
              borderRadius: 5,
              border: showPicker
                ? '2px solid rgba(141,162,134,0.5)'
                : '1.5px dashed rgba(0,0,0,0.22)',
              backgroundColor: showPicker ? 'rgba(141,162,134,0.08)' : 'transparent',
              color: showPicker ? '#8DA286' : '#8E8E93',
              fontSize: 14, lineHeight: 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
              transition: 'border-color 0.1s, background-color 0.1s, color 0.1s',
              flexShrink: 0,
            }}
            title="Custom color"
            aria-label="Pick custom color"
          >
            +
          </button>
          {/* Live preview of current color */}
          <div
            style={{
              width: px, height: px, minWidth: px,
              borderRadius: 4,
              backgroundColor: normalizedValue,
              border: '1.5px solid rgba(0,0,0,0.12)',
              flexShrink: 0,
              boxShadow: '0 1px 3px rgba(0,0,0,0.10)',
            }}
            title={normalizedValue}
          />
          <span style={{ fontSize: 11, color: '#8E8E93', fontFamily: 'ui-monospace, monospace', letterSpacing: '0.02em' }}>
            {normalizedValue.toUpperCase()}
          </span>
        </div>

        {/* ── Expanded: react-colorful picker + hex input ── */}
        {showPicker && (
          <div style={{ marginTop: 8 }}>
            <HexColorPicker
              color={normalizedValue}
              onChange={onChange}
              style={{ width: '100%' }}
            />
            {/* Hex input row */}
            <div className="flex items-center gap-1.5" style={{ marginTop: 7 }}>
              <div
                style={{
                  width: px, height: px, minWidth: px,
                  borderRadius: 4,
                  backgroundColor: normalizedValue,
                  border: '1.5px solid rgba(0,0,0,0.12)',
                  flexShrink: 0,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.10)',
                }}
              />
              <input
                type="text"
                placeholder={normalizedValue}
                value={hexInput}
                onChange={(e) => setHexInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleHexCommit();
                  if (e.key === 'Escape') { setHexInput(''); setShowPicker(false); }
                }}
                onBlur={handleHexCommit}
                maxLength={7}
                className="flex-1 text-xs px-2 py-1 rounded-md outline-none"
                style={{
                  border: '1px solid rgba(0,0,0,0.10)',
                  backgroundColor: '#F5F5F7',
                  color: '#1C1C1E',
                  fontFamily: 'ui-monospace, monospace',
                  fontSize: 11,
                  letterSpacing: '0.02em',
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
