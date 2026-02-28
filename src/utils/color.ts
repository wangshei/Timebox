/**
 * Centralized color utilities for dynamic background/text contrast.
 * Use getLuminance and getTextClassForBackground for any component with dynamic bg color.
 */

import { THEME } from '../constants/colors';

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return null;
  return {
    r: parseInt(m[1], 16),
    g: parseInt(m[2], 16),
    b: parseInt(m[3], 16),
  };
}

/**
 * Relative luminance (0–1). &lt; 0.5 = dark, ≥ 0.5 = light.
 * https://www.w3.org/TR/WCAG20-TECHS/G17.html
 */
export function getLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0.5;
  const [rs, gs, bs] = [rgb.r, rgb.g, rgb.b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Returns Tailwind text class for contrast on the given background.
 * Use wherever background is dynamic (block title, tag, category chip, completion circle icon).
 */
export function getTextClassForBackground(hex: string): 'text-white' | 'text-neutral-900' {
  return getLuminance(hex) < 0.5 ? 'text-white' : 'text-neutral-900';
}

const DEFAULT_CANVAS = '#FDFDFB';

/**
 * Blend a color with alpha over a background. Returns the resulting hex.
 */
export function blendOver(hex: string, alpha: number, backgroundHex: string = DEFAULT_CANVAS): string {
  const fg = hexToRgb(hex);
  const bg = hexToRgb(backgroundHex);
  if (!fg || !bg) return hex;
  const r = Math.round(fg.r * alpha + bg.r * (1 - alpha));
  const g = Math.round(fg.g * alpha + bg.g * (1 - alpha));
  const b = Math.round(fg.b * alpha + bg.b * (1 - alpha));
  const toHex = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Returns whether contrast text on this background should be white (true) or dark (false).
 * Use for event/block cards when the background is a solid hex or an rgba overlay on the canvas.
 */
export function isDarkBackground(hex: string, alpha?: number, backgroundHex: string = DEFAULT_CANVAS): boolean {
  const effectiveHex = alpha != null ? blendOver(hex, alpha, backgroundHex) : hex;
  return getLuminance(effectiveHex) < 0.5;
}

/**
 * Returns the contrast text color for a dynamic background: white when the background is dark, otherwise dark gray.
 * Use for event blocks and any block with a colored background.
 * hex: the foreground (category/block) color; alpha: if set, the background is hex at this alpha over backgroundHex.
 */
export function getContrastTextColor(
  hex: string,
  alpha?: number,
  backgroundHex: string = DEFAULT_CANVAS
): string {
  return isDarkBackground(hex, alpha, backgroundHex) ? '#FFFFFF' : THEME.textPrimary;
}

export function hexToRgba(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Lighten hex by mixing with white (ratio 0–1). */
export function lighten(hex: string, ratio: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const r = rgb.r + (255 - rgb.r) * ratio;
  const g = rgb.g + (255 - rgb.g) * ratio;
  const b = rgb.b + (255 - rgb.b) * ratio;
  return rgbToHex(r, g, b);
}

/** Desaturate by mixing with gray (ratio 0–1). */
export function desaturate(hex: string, ratio: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const l = (rgb.r * 0.299 + rgb.g * 0.587 + rgb.b * 0.114) | 0;
  const r = Math.round(rgb.r + (l - rgb.r) * ratio);
  const g = Math.round(rgb.g + (l - rgb.g) * ratio);
  const b = Math.round(rgb.b + (l - rgb.b) * ratio);
  return rgbToHex(r, g, b);
}
