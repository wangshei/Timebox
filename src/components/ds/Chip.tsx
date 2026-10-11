import React from 'react';
import { XMarkIcon } from '@heroicons/react/24/solid';
import { COLOR, RADIUS, FONT_SIZE, FONT_WEIGHT } from '../../styles/tokens';
import { Icon } from './Icon';

export interface ChipProps {
  children: React.ReactNode;
  color?: string;
  selected?: boolean;
  size?: 'sm' | 'md';
  onClick?: () => void;
  onRemove?: () => void;
  style?: React.CSSProperties;
}

export function Chip({ children, color, selected, size = 'md', onClick, onRemove, style }: ChipProps) {
  const tint = color ?? COLOR.accent;
  return (
    <span
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, height: size === 'sm' ? 22 : 26,
        padding: size === 'sm' ? '0 8px' : '0 12px', borderRadius: RADIUS.pill,
        fontSize: size === 'sm' ? FONT_SIZE.xs : FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium,
        color: COLOR.text, cursor: onClick ? 'pointer' : 'default', whiteSpace: 'nowrap',
        background: selected ? COLOR.accentSoft : COLOR.hover,
        border: `1px solid ${selected ? tint : 'transparent'}`, ...style,
      }}
    >
      {color && <span style={{ width: 8, height: 8, borderRadius: RADIUS.pill, background: color }} />}
      {children}
      {onRemove && (
        <button type="button" aria-label="Remove" onClick={(e) => { e.stopPropagation(); onRemove(); }} style={{ border: 'none', background: 'none', padding: 0, display: 'inline-flex', cursor: 'pointer', color: COLOR.muted }}>
          <Icon as={XMarkIcon} size="xs" />
        </button>
      )}
    </span>
  );
}
