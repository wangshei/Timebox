import React from 'react';
import { COLOR, RADIUS, SHADOW, Z } from '../../styles/tokens';

/** Positioned floating panel shell. Caller supplies absolute/fixed coordinates via `style`. */
export function Popover({ children, style, onClick, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      onClick={onClick}
      style={{
        background: COLOR.surface, border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.lg,
        boxShadow: SHADOW.sh2, padding: 8, zIndex: Z.popover, maxWidth: 'calc(100vw - 16px)',
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
