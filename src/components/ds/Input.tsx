import React from 'react';
import { COLOR, RADIUS, FONT_SIZE } from '../../styles/tokens';

export type FieldSize = 'sm' | 'md' | 'touch';
const H: Record<FieldSize, number> = { sm: 28, md: 32, touch: 44 };

export function fieldStyle(size: FieldSize = 'md', invalid?: boolean): React.CSSProperties {
  return {
    height: H[size], padding: '0 12px', borderRadius: RADIUS.md,
    border: `1px solid ${invalid ? COLOR.danger : COLOR.borderStrong}`,
    background: COLOR.surface, color: COLOR.text, fontFamily: 'inherit', outline: 'none',
    // 16px on touch stops iOS focus-zoom
    fontSize: size === 'touch' ? 16 : FONT_SIZE.base, boxSizing: 'border-box', width: '100%',
  };
}

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'style'> {
  size?: FieldSize;
  invalid?: boolean;
  style?: React.CSSProperties;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { size = 'md', invalid, style, onFocus, onBlur, ...rest }, ref,
) {
  return (
    <input
      ref={ref}
      style={{ ...fieldStyle(size, invalid), ...style }}
      onFocus={(e) => { e.currentTarget.style.borderColor = COLOR.accent; e.currentTarget.style.boxShadow = `0 0 0 3px ${COLOR.accentRing}`; onFocus?.(e); }}
      onBlur={(e) => { e.currentTarget.style.borderColor = invalid ? COLOR.danger : COLOR.borderStrong; e.currentTarget.style.boxShadow = 'none'; onBlur?.(e); }}
      {...rest}
    />
  );
});
