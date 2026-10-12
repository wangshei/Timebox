import React from 'react';
import { ArrowsPointingOutIcon } from '@heroicons/react/24/outline';
import { IconButton } from './ds/IconButton';
import { COLOR, RADIUS, SHADOW, Z, FONT_SIZE } from '../styles/tokens';
import { TodoToggle } from './TodoToggle';
import type { CreateMode } from '../utils/createMode';

interface InlineCreateProps {
  mode: CreateMode;
  /** Viewport position to place the card near. */
  anchor: { x: number; y: number };
  /** Human-readable range, e.g. "Mon 9:00 → Wed 11:00". */
  label: string;
  /** Called with a non-empty trimmed title. */
  onSave: (title: string, isTodo: boolean) => void;
  onCancel: () => void;
  /** Expand into the full add form, carrying the typed title (may be empty). */
  onExpand?: (title: string, pos: { x: number; y: number }, isTodo: boolean) => void;
}

/**
 * Compact title input shown right after a drag-to-create on the calendar grid.
 * Enter / blur saves (empty title cancels); Esc cancels.
 */
export function InlineCreate({ mode, anchor, label, onSave, onCancel, onExpand }: InlineCreateProps) {
  const [title, setTitle] = React.useState('');
  const [isTodo, setIsTodo] = React.useState(mode === 'todo');
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
    if (save && t) onSave(t, isTodo); else onCancel();
  };

  const W = 220;
  const left = Math.max(8, Math.min(anchor.x + 8, window.innerWidth - W - 8));
  const top = Math.max(8, Math.min(anchor.y - 20, window.innerHeight - 80));

  const expand = () => {
    if (doneRef.current || !onExpand) return;
    doneRef.current = true;
    onExpand(title.trim(), { x: left, y: top }, isTodo);
  };

  return (
    <div
      data-inline-create
      style={{
        position: 'fixed', left, top, width: W, zIndex: Z.popover,
        background: mode === 'todo' ? COLOR.noteBg : COLOR.surface,
        border: `1px solid ${mode === 'todo' ? COLOR.noteBorder : COLOR.borderStrong}`,
        borderLeft: `4px solid ${mode === 'todo' ? 'rgba(180,150,100,0.45)' : COLOR.accent}`, borderRadius: RADIUS.md,
        boxShadow: SHADOW.sh2, padding: '6px 8px',
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
        // Keep the input from blurring (and saving) when the popup itself is pressed.
        if (e.target !== inputRef.current) e.preventDefault();
      }}
      onClick={(e) => { if (e.target !== inputRef.current) expand(); }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {mode === 'todo' && <TodoToggle checked={isTodo} onChange={setIsTodo} />}
      <input
        ref={inputRef}
        value={title}
        placeholder={mode === 'todo' ? (isTodo ? 'New todo' : 'New note') : 'New event'}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') { e.preventDefault(); finish(true); }
          else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
        }}
        onBlur={(e) => {
          const next = e.relatedTarget as Node | null;
          if (next && e.currentTarget.parentElement?.contains(next)) return;
          finish(true);
        }}
        style={{
          flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
          fontSize: FONT_SIZE.base, color: COLOR.text, padding: 0,
        }}
      />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2, cursor: onExpand ? 'pointer' : undefined }}>
        <span style={{ fontSize: FONT_SIZE['2xs'], color: COLOR.muted }}>{mode === 'todo' && !isTodo ? 'Note · 1h block' : label}</span>
        {onExpand && <IconButton icon={ArrowsPointingOutIcon} size="sm" aria-label="More options" title="More options" onClick={(e) => { e.stopPropagation(); expand(); }} />}
      </div>
    </div>
  );
}
