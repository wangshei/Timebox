/**
 * Single source of truth for category/calendar color selection.
 * Palette inspired by Monet's impressionist paintings — soft, atmospheric,
 * nature-inspired colors from water lilies, gardens, and landscapes.
 * Use PALETTE_HEX for swatches; pair with a "Custom" native color input in the UI.
 */
export const PALETTE_COLORS = [
  { name: 'Waterlily Blue', value: '#5B9BAD' },   // Monet's pond blues
  { name: 'Garden Sage', value: '#7A9E7A' },       // Soft garden greens
  { name: 'Iris Purple', value: '#8B78B8' },       // Monet's purple irises
  { name: 'Rose Pink', value: '#C8787C' },         // Garden roses, warm pink
  { name: 'Warm Ochre', value: '#C49A50' },        // Warm fields, golden light
  { name: 'River Teal', value: '#4E9A94' },        // Flowing water, teal depths
  { name: 'Dawn Lavender', value: '#A090C0' },     // Atmospheric sky tones
  { name: 'Sunset Coral', value: '#C87868' },      // Evening warmth
  { name: 'Wheat Gold', value: '#B89840' },        // Harvested fields
  { name: 'Moss Green', value: '#6A8C5A' },        // Deep garden moss
  { name: 'Dusty Rose', value: '#B88090' },        // Faded roses, muted warmth
] as const;

/** Flat list of hex values for components that only need the color (e.g. swatch grids). */
export const PALETTE_HEX = PALETTE_COLORS.map((c) => c.value);

export type PaletteColorName = (typeof PALETTE_COLORS)[number]['name'];

/** Default color when creating a new calendar or category. */
export const DEFAULT_PALETTE_COLOR = PALETTE_COLORS[0].value; // Waterlily Blue

/**
 * Semantic color tokens for the Monet-inspired theme.
 * Used in CSS custom properties and component-level styling.
 */
export const MONET_THEME = {
  // Background palette
  background: '#FAF8F4',         // Warm canvas white
  backgroundAlt: '#F5F1EB',      // Slightly warmer for sidebars
  backgroundAccent: '#EDE8E0',   // Subtle accent surfaces

  // Text colors
  textPrimary: '#2C2820',        // Warm dark (not cold black)
  textSecondary: '#6B6058',      // Warm medium gray
  textMuted: '#9E968C',          // Light warm gray

  // Border colors
  borderLight: '#E8E0D4',        // Very light warm border
  borderMedium: '#D4C8B8',       // Medium warm border
  borderStrong: '#B4A898',       // Stronger warm border

  // Accent: a muted warm blue for interactive elements
  accent: '#5B9BAD',             // Waterlily Blue (primary action)
  accentHover: '#4A8899',        // Darker on hover
  accentLight: '#EAF3F6',        // Very light tint for focus/selected

  // Success/done states
  successGreen: '#7A9E7A',
  successLight: '#EBF3EB',

  // Warning
  warningOchre: '#C49A50',
  warningLight: '#FDF5E8',
} as const;
