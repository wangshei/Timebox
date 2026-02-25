/**
 * Single source of truth for category/calendar color selection.
 * Vibrant, clear, cheerful palette — easy to distinguish at a glance.
 */
export const PALETTE_COLORS = [
  { name: 'Blue', value: '#4A80F0' },           // Primary cornflower blue
  { name: 'Green', value: '#34C759' },           // Fresh emerald green
  { name: 'Purple', value: '#AF52DE' },          // Bright violet
  { name: 'Orange', value: '#FF9500' },          // Warm amber orange
  { name: 'Red', value: '#FF3B30' },             // Clear red
  { name: 'Teal', value: '#5AC8FA' },            // Sky teal
  { name: 'Indigo', value: '#5856D6' },          // Deep indigo
  { name: 'Pink', value: '#FF2D55' },            // Hot pink
  { name: 'Yellow', value: '#FFCC00' },          // Bright yellow
  { name: 'Mint', value: '#00C7BE' },            // Mint green
  { name: 'Brown', value: '#A2845E' },           // Warm brown
] as const;

/** Flat list of hex values for components that only need the color. */
export const PALETTE_HEX = PALETTE_COLORS.map((c) => c.value);

export type PaletteColorName = (typeof PALETTE_COLORS)[number]['name'];

/** Default color when creating a new calendar or category. */
export const DEFAULT_PALETTE_COLOR = PALETTE_COLORS[0].value; // Blue

/**
 * Semantic color tokens for the design system.
 */
export const THEME = {
  // Background palette
  background: '#F8F8F6',         // Barely-warm off-white canvas
  sidebar: '#EFEFE9',            // Slightly warmer panel bg
  card: '#FFFFFF',               // Pure white cards
  muted: '#F2F2F0',              // Muted surfaces

  // Text colors
  textPrimary: '#1C1C1E',        // Near-black
  textSecondary: '#636366',      // Medium gray
  textMuted: '#8E8E93',          // Light gray
  textPlaceholder: '#C7C7CC',    // Placeholder

  // Border colors
  borderLight: 'rgba(0,0,0,0.06)',
  borderMedium: 'rgba(0,0,0,0.10)',
  borderStrong: 'rgba(0,0,0,0.16)',

  // Primary blue
  primary: '#4A80F0',
  primaryHover: '#3A6EDE',
  primaryPale: '#EBF1FF',

  // Grid lines
  gridHour: 'rgba(0,0,0,0.07)',
  gridHalf: 'rgba(0,0,0,0.035)',

  // States
  successGreen: '#34C759',
  successLight: '#E8FAF0',
  warningOrange: '#FF9500',
  warningLight: '#FFF4E6',
  destructiveRed: '#FF3B30',
  destructiveLight: '#FFF0EF',
} as const;

// Keep MONET_THEME as an alias so existing imports don't break
export const MONET_THEME = THEME;
