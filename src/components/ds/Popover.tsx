import React, { useLayoutEffect, useRef, useState } from 'react';
import { COLOR, RADIUS, SHADOW, Z } from '../../styles/tokens';

const MARGIN = 8;

/**
 * Floating panel shell. Caller supplies absolute/fixed coordinates via `style`.
 * After layout it measures itself and nudges (translate) back inside the viewport.
 */
export const Popover = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function Popover({ children, style, ...rest }, fwdRef) {
    const innerRef = useRef<HTMLDivElement | null>(null);
    const [shift, setShift] = useState({ x: 0, y: 0 });

    useLayoutEffect(() => {
      const el = innerRef.current;
      if (!el) return;
      const clamp = () => {
        const r = el.getBoundingClientRect();
        const baseLeft = r.left - shift.x;
        const baseRight = r.right - shift.x;
        const baseTop = r.top - shift.y;
        const baseBottom = r.bottom - shift.y;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        let x = 0;
        let y = 0;
        if (baseRight > vw - MARGIN) x = vw - MARGIN - baseRight;
        if (baseLeft + x < MARGIN) x = MARGIN - baseLeft;
        if (baseBottom > vh - MARGIN) y = vh - MARGIN - baseBottom;
        if (baseTop + y < MARGIN) y = MARGIN - baseTop;
        x = Math.round(x);
        y = Math.round(y);
        if (x !== shift.x || y !== shift.y) setShift({ x, y });
      };
      clamp();
      window.addEventListener('resize', clamp);
      return () => window.removeEventListener('resize', clamp);
    });

    return (
      <div
        ref={(node) => {
          innerRef.current = node;
          if (typeof fwdRef === 'function') fwdRef(node);
          else if (fwdRef) (fwdRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
        }}
        style={{
          background: COLOR.surface, border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.lg,
          boxShadow: SHADOW.sh2, padding: 8, zIndex: Z.popover, maxWidth: `calc(100vw - ${MARGIN * 2}px)`,
          ...style,
          ...(shift.x || shift.y ? { transform: `${style?.transform ?? ''} translate(${shift.x}px, ${shift.y}px)`.trim() } : {}),
        }}
        {...rest}
      >
        {children}
      </div>
    );
  },
);
