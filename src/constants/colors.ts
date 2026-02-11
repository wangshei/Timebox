/**
 * Style-guide color palette for categories and calendars.
 * Use in color picker: palette + Custom (user hex).
 */
export const PALETTE_COLORS = [
  { name: 'Red', value: '#ef4444' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Yellow', value: '#eab308' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Purple', value: '#a855f7' },
  { name: 'Gray', value: '#6b7280' },
] as const;

export type PaletteColorName = (typeof PALETTE_COLORS)[number]['name'];
