import React, { useEffect } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { COLOR, RADIUS, SHADOW, Z, FONT_SIZE, FONT_WEIGHT, SAFE } from '../../styles/tokens';
import { IconButton } from './IconButton';

const WIDTH = { sm: 400, md: 440, lg: 560 } as const;

export interface ModalProps {
  title?: React.ReactNode;
  onClose: () => void;
  size?: keyof typeof WIDTH;
  footer?: React.ReactNode;
  children: React.ReactNode;
  /** Close when clicking the backdrop (default true). */
  dismissOnBackdrop?: boolean;
}

export function Modal({ title, onClose, size = 'md', footer, children, dismissOnBackdrop = true }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      onClick={dismissOnBackdrop ? onClose : undefined}
      style={{
        position: 'fixed', inset: 0, background: COLOR.backdrop, zIndex: Z.modalBackdrop,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: `max(16px, ${SAFE.top}) max(16px, ${SAFE.right}) max(16px, ${SAFE.bottom}) max(16px, ${SAFE.left})`,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: WIDTH[size], maxWidth: '100%', maxHeight: '100%', display: 'flex', flexDirection: 'column',
          background: COLOR.surface, borderRadius: RADIUS.xl, boxShadow: SHADOW.sh3, zIndex: Z.modal, overflow: 'hidden',
        }}
      >
        {title !== undefined && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 48, padding: '0 8px 0 20px', borderBottom: `1px solid ${COLOR.border}`, flexShrink: 0 }}>
            <div style={{ fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold, color: COLOR.text }}>{title}</div>
            <IconButton icon={XMarkIcon} aria-label="Close" onClick={onClose} />
          </div>
        )}
        <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>{children}</div>
        {footer && <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 20px', borderTop: `1px solid ${COLOR.border}`, flexShrink: 0 }}>{footer}</div>}
      </div>
    </div>
  );
}
