import React from 'react';

/** Sentinel sticker emoji meaning "this didn't happen" — rendered as a red cross over the whole card. */
export const MISSED_STAMP = '✕';
const MISSED_RED = '#FF3B30';

/** Red cross spanning the card. Only the center badge is clickable (removes the sticker). */
export function MissedOverlay({ onRemove }: { onRemove?: () => void }) {
  return (
    <div className="absolute inset-0 z-10 pointer-events-none" aria-label="Didn't happen">
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        <line x1="2" y1="2" x2="98" y2="98" stroke={MISSED_RED} strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke" opacity="0.8" />
        <line x1="98" y1="2" x2="2" y2="98" stroke={MISSED_RED} strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke" opacity="0.8" />
      </svg>
      {onRemove && (
        <span
          className="absolute select-none pointer-events-auto cursor-pointer flex items-center justify-center"
          style={{
            left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
            width: 18, height: 18, borderRadius: '50%',
            backgroundColor: '#FFFFFF', color: MISSED_RED,
            fontSize: 12, fontWeight: 700, lineHeight: 1,
            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          }}
          title="Remove 'didn't happen' mark"
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); onRemove(); }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          ✕
        </span>
      )}
    </div>
  );
}
