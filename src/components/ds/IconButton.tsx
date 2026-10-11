import React from 'react';
import { COLOR, RADIUS } from '../../styles/tokens';
import { Icon, IconSize } from './Icon';

export type IconButtonSize = 'sm' | 'md' | 'lg' | 'touch';
const BOX: Record<IconButtonSize, number> = { sm: 24, md: 28, lg: 36, touch: 44 };
const GLYPH: Record<IconButtonSize, IconSize> = { sm: 'xs', md: 'md', lg: 'md', touch: 'lg' };

export interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'style'> {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  'aria-label': string;
  size?: IconButtonSize;
  variant?: 'ghost' | 'outline' | 'active';
  active?: boolean;
  iconSize?: IconSize;
  style?: React.CSSProperties;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, size = 'md', variant = 'ghost', active, iconSize, style, className, type = 'button', disabled, ...rest },
  ref,
) {
  const on = active || variant === 'active';
  const box = BOX[size];
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled}
      className={`tb-hover ${className ?? ''}`.trim()}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        width: box, height: box, borderRadius: RADIUS.md, cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        border: variant === 'outline' || on ? `1px solid ${on ? COLOR.accentRing : COLOR.borderStrong}` : '1px solid transparent',
        background: on ? COLOR.accentSoft : 'transparent',
        color: on ? COLOR.text : COLOR.text2, padding: 0, fontFamily: 'inherit',
        ...style,
      }}
      {...rest}
    >
      <Icon as={icon} size={iconSize ?? GLYPH[size]} />
    </button>
  );
});
