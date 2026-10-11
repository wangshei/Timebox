/** TS mirror of tokens.css. Keep both in sync. Use `var(--tb-*)` strings where possible. */
export const SPACE = { 0.5: 2, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32 } as const;
export const RADIUS = { sm: 6, md: 8, lg: 12, xl: 16, pill: 999 } as const;
export const FONT = {
  sans: 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
} as const;
export const FONT_SIZE = { '2xs': 10, xs: 11, sm: 12, base: 13, md: 15, lg: 18, xl: 28 } as const;
export const FONT_WEIGHT = { regular: 400, medium: 500, semibold: 600 } as const;
export const ICON = { xs: 12, sm: 14, md: 16, lg: 20 } as const;
export const COLOR = {
  text: '#1C1C1E',
  text2: '#636366',
  muted: '#8E8E93',
  faint: '#AEAEB2',
  border: 'rgba(0,0,0,0.08)',
  borderStrong: 'rgba(0,0,0,0.14)',
  surface: '#FFFFFF',
  surface2: '#FCFBF7',
  hover: 'rgba(0,0,0,0.05)',
  accent: '#8DA286',
  accentHover: '#7A9278',
  accentSoft: 'rgba(141,162,134,0.12)',
  accentRing: 'rgba(141,162,134,0.30)',
  danger: '#FF3B30',
  success: '#34C759',
  warning: '#FF9500',
  backdrop: 'rgba(0,0,0,0.35)',
} as const;
export const SHADOW = {
  sh1: '0 1px 3px rgba(0,0,0,0.10)',
  sh2: '0 4px 16px rgba(0,0,0,0.12)',
  sh3: '0 8px 32px rgba(0,0,0,0.14)',
  sheet: '0 -4px 24px rgba(0,0,0,0.12)',
} as const;
export const Z = { fab: 30, sticky: 40, dropdown: 100, popover: 200, modalBackdrop: 300, modal: 310, toast: 400, top: 500 } as const;
export const LAYOUT = { leftWidth: 224, rightWidth: 264, headerHeight: 48, touch: 44 } as const;
export const SAFE = {
  top: 'env(safe-area-inset-top, 0px)',
  bottom: 'env(safe-area-inset-bottom, 0px)',
  left: 'env(safe-area-inset-left, 0px)',
  right: 'env(safe-area-inset-right, 0px)',
} as const;
/** Shared calendar grid look (Day / 3-Day / Week / Month). */
export const GRID = {
  line: 'rgba(0,0,0,0.07)',
  half: 'rgba(0,0,0,0.035)',
  today: 'rgba(141,162,134,0.12)',
  headerH: 48,
  hourLabel: FONT_SIZE['2xs'],
} as const;
