import React from 'react';
import { COLOR, RADIUS } from '../../styles/tokens';

export interface ColorSwatchProps {
  color: string;
  selected?: boolean;
  size?: number;
  title?: string;
  onClick?: () => void;
  style?: React.CSSProperties;
}

/** Single color chip used by every color picker. */
export function ColorSwatch({ color, selected, size = 24, title, onClick, style }: ColorSwatchProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title ?? color}
      aria-pressed={selected}
      className="tb-swatch"
      style={{
        width: size, height: size, minWidth: size, minHeight: size, padding: 0, flexShrink: 0,
        backgroundColor: color, borderRadius: RADIUS.sm, cursor: onClick ? 'pointer' : 'default',
        border: selected ? '2px solid rgba(0,0,0,0.35)' : `1.5px solid ${COLOR.borderStrong}`,
        boxShadow: selected ? '0 0 0 1.5px rgba(255,255,255,0.9) inset' : 'none',
        ...style,
      }}
    />
  );
}
