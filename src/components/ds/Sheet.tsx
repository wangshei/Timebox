import React from 'react';
import { COLOR, RADIUS, SHADOW, Z, SAFE } from '../../styles/tokens';

export interface SheetProps {
  children: React.ReactNode;
  /** Called when the dimmed backdrop is tapped. */
  onBackdropClick?: (e: React.MouseEvent) => void;
  /** CSS max-height of the sheet. Defaults to 90dvh. */
  maxHeight?: string;
  /** Stop click events inside the sheet from bubbling to ancestors. */
  stopClicks?: boolean;
}

/** Mobile bottom sheet: backdrop, grab handle, safe-area padding, dvh max-height. */
export function Sheet({ children, onBackdropClick, maxHeight = '90dvh', stopClicks }: SheetProps) {
  return (
    <>
      <div
        onClick={onBackdropClick}
        style={{ position: 'fixed', inset: 0, zIndex: Z.modalBackdrop, backgroundColor: COLOR.backdrop, WebkitTapHighlightColor: 'transparent' }}
      />
      <div
        onClick={stopClicks ? (e) => e.stopPropagation() : undefined}
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: Z.modal,
          backgroundColor: COLOR.surface, borderRadius: `${RADIUS.xl}px ${RADIUS.xl}px 0 0`,
          boxShadow: SHADOW.sheet, maxHeight, overflowY: 'auto',
          paddingBottom: `calc(${SAFE.bottom} + 16px)`, animation: 'slideUp 0.2s ease-out',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 4px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.12)' }} />
        </div>
        {children}
      </div>
    </>
  );
}
