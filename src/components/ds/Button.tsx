import React from 'react';
import { COLOR, RADIUS, FONT_SIZE, FONT_WEIGHT } from '../../styles/tokens';
import { Icon } from './Icon';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

const SIZE: Record<ButtonSize, { h: number; fs: number; r: number; px: number }> = {
  sm: { h: 28, fs: FONT_SIZE.sm, r: RADIUS.sm, px: 8 },
  md: { h: 32, fs: FONT_SIZE.base, r: RADIUS.md, px: 12 },
  lg: { h: 44, fs: FONT_SIZE.md, r: RADIUS.lg, px: 16 },
};

export interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'style'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
  /** Toggled-on look (accent tint) for toggle-style buttons. */
  active?: boolean;
  style?: React.CSSProperties;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, iconPosition = 'left', fullWidth, active, children, style, className, disabled, type = 'button', ...rest },
  ref,
) {
  const s = SIZE[size];
  const base: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    height: s.h, padding: `0 ${s.px}px`, fontSize: s.fs, fontWeight: FONT_WEIGHT.medium,
    borderRadius: s.r, border: '1px solid transparent', cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1, whiteSpace: 'nowrap', width: fullWidth ? '100%' : undefined,
    fontFamily: 'inherit', transition: 'background-color 0.15s ease, border-color 0.15s ease',
  };
  const v: Record<ButtonVariant, React.CSSProperties> = {
    primary: { background: COLOR.accent, color: COLOR.text },
    secondary: { background: active ? COLOR.accentSoft : COLOR.surface, color: COLOR.text, borderColor: active ? COLOR.accentRing : COLOR.borderStrong },
    ghost: { background: active ? COLOR.accentSoft : 'transparent', color: COLOR.text2 },
    danger: { background: 'transparent', color: COLOR.danger, borderColor: COLOR.danger },
    link: { background: 'transparent', color: COLOR.accentHover, padding: 0, height: 'auto' },
  };
  const iconEl = icon ? <Icon as={icon} size={size === 'sm' ? 'xs' : size === 'lg' ? 'lg' : 'sm'} /> : null;
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled}
      className={`${variant === 'primary' || variant === 'link' ? '' : 'tb-hover'} ${className ?? ''}`.trim()}
      style={{ ...base, ...v[variant], ...style }}
      {...rest}
    >
      {iconPosition === 'left' && iconEl}
      {children}
      {iconPosition === 'right' && iconEl}
    </button>
  );
});
