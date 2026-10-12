import React from 'react';
import { COLOR, RADIUS, SHADOW, Z, FONT_SIZE } from '../styles/tokens';
import type { CreateMode } from '../utils/createMode';

interface InlineCreateProps {
  mode: CreateMode;
  /** Viewport position to place the card near. */
  anchor: { x: number; y: number };
  /** Human-readable range, e.g. "Mon 9:00 → Wed 11:00". */
  label: string;
  /** Called with a non-empty trimmed title. */
  onSave: (title: string) => void;
  onCancel: () => void;
}

/**
 * Compact title input shown right after a drag-to-create on the calendar grid.
 * Enter / blur saves (empty title cancels); Esc cancels.
 */
export function InlineCreate({ mode, anchor, label, onSave, onCancel }: InlineCreateProps) {
  const [title, setTitle] = React.useState('');
  const doneRef = React.useRef(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    // Focus after the originating mouseup/click has settled so it can't steal focus back.
    inputRef.current?.focus();
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  const finish = (save: boolean) => {
    if (doneRef.current) return;
    doneRef.current = true;
    const t = title.trim();
    if (save && t) onSave(t); else onCancel();
  };

  const W = 220;
  const left = Math.max(8, Math.min(anchor.x + 8, window.innerWidth - W - 8));
  const top = Math.max(8, Math.min(anchor.y - 20, window.innerHeight - 80));

  return (
    <div
      data-inline-create
      style={{
        position: 'fixed', left, top, width: W, zIndex: Z.popover,
        background: COLOR.surface, border: `1px solid ${COLOR.borderStrong}`,
        borderLeft: `4px solid ${COLOR.accent}`, borderRadius: RADIUS.md,
        boxShadow: SHADOW.sh2, padding: '6px 8px',
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <input
        ref={inputRef}
        value={title}
        placeholder={mode === 'todo' ? 'New todo' : 'New event'}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') { e.preventDefault(); finish(true); }
          else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
        }}
        onBlur={() => finish(true)}
        style={{
          width: '100%', border: 'none', outline: 'none', background: 'transparent',
          fontSize: FONT_SIZE.base, color: COLOR.text, padding: 0,
        }}
      />
      <div style={{ fontSize: FONT_SIZE['2xs'], color: COLOR.muted, marginTop: 2 }}>{label}</div>
    </div>
  );
}
