/**
 * Single source of truth for category/calendar color selection.
 * Muted, natural palette — rows grouped by hue family.
 *
 * Row 1 — Reds / Pinks / Peaches (6)
 * Row 2 — Yellows (4)
 * Row 3 — Greens (4)
 * Row 4 — Blues (6)
 */
export const PALETTE_COLORS = [
  // Row 1 — Reds / Pinks / Peaches (5)
  { name: 'Blush',   value: '#F8E7DD' },
  { name: 'Peach',   value: '#F3DDC7' },
  { name: 'Apricot', value: '#F4CCAC' },
  { name: 'Rose',    value: '#F4B6B6' },
  { name: 'Mauve',   value: '#DE8D91' },
  // Row 2 — Yellows (5)
  { name: 'Cream',   value: '#F3EFDC' },
  { name: 'Straw',   value: '#E7E5BC' },
  { name: 'Lime',    value: '#D6E089' },
  { name: 'Gold',    value: '#DAD15F' },
  { name: 'Olive',   value: '#B3B46D' },
  // Row 3 — Greens (5)
  { name: 'Mist',    value: '#DBE4D7' },
  { name: 'Sage',    value: '#C6D8C7' },
  { name: 'Fern',    value: '#A4C7A6' },
  { name: 'Forest',  value: '#8DA387' },
  { name: 'Teal',    value: '#6593A6' },
  // Row 4 — Blues (5)
  { name: 'Sky',     value: '#D6E6FB' },
  { name: 'Periwinkle', value: '#B8CAF2' },
  { name: 'Lavender', value: '#AFB7E7' },
  { name: 'Cornflower', value: '#8E9DCA' },
  { name: 'Navy',    value: '#5B718C' },
] as const;

/** Flat list of hex values for components that only need the color. */
export const PALETTE_HEX = PALETTE_COLORS.map((c) => c.value);

export type PaletteColorName = (typeof PALETTE_COLORS)[number]['name'];

/** Default color when creating a new calendar or category. */
export const DEFAULT_PALETTE_COLOR = PALETTE_COLORS[12].value; // Fern green

import { COLOR } from '../styles/tokens';

/**
 * Semantic color tokens for the design system.
 * Parchment palette: warm earthy tones, sage green primary.
 */
export const THEME = {
  // Background palette
  background: 'rgba(219,228,215,0.05)', // 5% sage tint — near-white canvas
  sidebar: COLOR.surface2,            // Slightly lighter parchment (solid)
  secondaryBg: '#DBE4D7',        // Input bg, subtle sections
  card: COLOR.surface,               // Pure white cards / modals
  muted: '#F2F2F0',              // Muted surfaces

  // Text colors — single source for body/heading text; change here to update app-wide
  textPrimary: '#5F615F',        // Primary text (dark gray)
  textSecondary: COLOR.text2,      // Medium gray
  textMuted: '#5F615F',          // Muted text (same as primary for consistency)
  textPlaceholder: '#C7C7CC',    // Placeholder

  // Border colors
  borderLight: 'rgba(0,0,0,0.06)',
  borderMedium: 'rgba(0,0,0,0.10)',
  borderStrong: 'rgba(0,0,0,0.16)',

  // Primary sage green — use DARK text on this bg (#1C1C1E, not white)
  primary: COLOR.accent,
  primaryHover: COLOR.accentHover,       // 10% darker sage
  primaryPale: '#DBE4D7',        // Pale sage for tints

  // Accent — warm yellow-green for highlights
  accent: '#D9D781',

  // Grid lines
  gridHour: 'rgba(0,0,0,0.07)',
  gridHalf: 'rgba(0,0,0,0.035)',

  // States
  successGreen: COLOR.success,
  successLight: '#E8FAF0',
  warningOrange: COLOR.warning,
  warningLight: '#FFF4E6',
  destructiveRed: COLOR.danger,
  destructiveLight: '#FFF0EF',
} as const;

// Keep MONET_THEME as an alias so existing imports don't break
export const MONET_THEME = THEME;

/** Used for drag preview and create-block preview when no calendar/category is set. Matches saved block visual language. */
export const BLOCK_PREVIEW = {
  /** Event-style: left stripe + light fill (same as saved events). */
  stripeAlpha: 0.5,
  bgAlpha: 0.1,
  borderDash: '2px dashed',
  /** Fallback when no category/calendar (use primary). */
  color: THEME.primary,
} as const;
