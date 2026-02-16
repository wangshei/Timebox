/**
 * Single source of truth for category/calendar color selection.
 * Rainbow order: Red → Orange → Yellow → Green → Teal → Blue → Purple, plus neutrals.
 * Use PALETTE_HEX for swatches; pair with a "Custom" native color input in the UI.
 */
export const PALETTE_COLORS = [
  { name: 'Red', value: '#D93D3D' },
  { name: 'Orange', value: '#EC8309' },
  { name: 'Yellow', value: '#E6B800' },
  { name: 'Green', value: '#7FB800' },
  { name: 'Teal', value: '#13B49F' },
  { name: 'Blue', value: '#0044A8' },
  { name: 'Indigo', value: '#5B5B9E' },
  { name: 'Purple', value: '#9F5FB0' },
  { name: 'Pink', value: '#E85C8B' },
  { name: 'Brown', value: '#8B7355' },
  { name: 'Gray', value: '#5B5B5B' },
] as const;

/** Flat list of hex values for components that only need the color (e.g. swatch grids). */
export const PALETTE_HEX = PALETTE_COLORS.map((c) => c.value);

export type PaletteColorName = (typeof PALETTE_COLORS)[number]['name'];

/** Default color when creating a new calendar or category. */
export const DEFAULT_PALETTE_COLOR = PALETTE_COLORS[5].value; // Blue #0044A8
