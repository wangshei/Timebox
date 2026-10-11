import React from 'react';
import { ICON } from '../../styles/tokens';

export type IconSize = keyof typeof ICON;

/** Wraps a Heroicons component (or any svg component) with a fixed token size. */
export function Icon({
  as: Component,
  size = 'md',
  style,
  className,
}: {
  as: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  size?: IconSize;
  style?: React.CSSProperties;
  className?: string;
}) {
  const px = ICON[size];
  return (
    <Component
      width={px}
      height={px}
      aria-hidden="true"
      className={className}
      style={{ width: px, height: px, flexShrink: 0, ...style }}
    />
  );
}
