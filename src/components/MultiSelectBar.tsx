import React from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { TrashIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useStore } from '../store/useStore';
import { useHistoryStore } from '../store/useHistoryStore';
import { useMultiSelect } from '../store/useMultiSelect';
import { hasInvitedGuests } from '../utils/inviteSeries';
import { deleteEventScoped, isOwnedEvent, isRepeatingSeriesRow, type DeleteScope } from '../services/eventActions';
import { CategoryChipPicker } from './CategoryChipPicker';
import { Popover } from './ds/Popover';
import { Button } from './ds/Button';
import { IconButton } from './ds/IconButton';
import { Modal } from './ds/Modal';
import { COLOR, FONT_SIZE, Z } from '../styles/tokens';
import type { Event, TimeBlock } from '../types';

const BAR_W = 330;
const BAR_H = 44;

const isReadOnlyEvent = (e: Event) => !!(e.readOnly || e.googleEventId || e.sharedFromShareId || e.id.startsWith('gcal-evt-'));
const toastUndo = (message: string) => toast(message, { action: { label: 'Undo', onClick: () => useHistoryStore.getState().undo() }, duration: 6000 });

type Pending =
  | { kind: 'category'; catId: string }
  | { kind: 'delete' };

/** Floating action bar for the desktop multi-selection: bulk category change and delete. */
export function MultiSelectBar() {
  const keys = useMultiSelect((s) => s.keys);
  const last = useMultiSelect((s) => s.last);
  const events = useStore((s) => s.events);
  const timeBlocks = useStore((s) => s.timeBlocks);
  const [pos, setPos] = React.useState<{ left: number; top: number } | null>(null);
  const [pending, setPending] = React.useState<Pending | null>(null);
  const userName = useStore((s) => s.userName);
  const [notify, setNotify] = React.useState(true);

  const items = React.useMemo(() => {
    const evs: Event[] = [];
    const blks: TimeBlock[] = [];
    for (const k of keys) {
      if (k.startsWith('event:')) { const e = events.find((x) => x.id === k.slice(6)); if (e) evs.push(e); }
      else if (k.startsWith('block:')) { const b = timeBlocks.find((x) => x.id === k.slice(6)); if (b) blks.push(b); }
    }
    return { evs, blks, count: evs.length + blks.length };
  }, [keys, events, timeBlocks]);

  // Drop selection entries whose item no longer exists (deleted / undone).
  React.useEffect(() => {
    if (keys.length && items.count < keys.length) {
      const live = new Set([...items.evs.map((e) => `event:${e.id}`), ...items.blks.map((b) => `block:${b.id}`)]);
      const st = useMultiSelect.getState();
      keys.filter((k) => !live.has(k)).forEach((k) => st.toggle(k));
    }
  }, [keys, items]);

  // Anchor the bar near the last-selected card (clamped on screen); follow scroll/resize.
  React.useLayoutEffect(() => {
    if (keys.length < 2 || !last) { setPos(null); return; }
    const place = () => {
      const el = document.querySelector(`[data-multisel-key="${last}"]`);
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (!el) { setPos({ left: Math.max(8, (vw - BAR_W) / 2), top: vh - BAR_H - 24 }); return; }
      const r = el.getBoundingClientRect();
      let top = r.bottom + 8;
      if (top + BAR_H > vh - 8) top = Math.max(8, r.top - BAR_H - 8);
      const left = Math.max(8, Math.min(r.left, vw - BAR_W - 8));
      setPos({ left, top: Math.max(8, Math.min(top, vh - BAR_H - 8)) });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => { window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place); };
  }, [keys, last]);

  // Dragging on a calendar grid (create / move / resize) must never highlight text.
  React.useEffect(() => {
    const GRID = '[data-3day-grid],[data-week-grid],[data-day-grid]';
    let down = false;
    const onDown = (e: MouseEvent) => { down = e.button === 0 && !!(e.target as HTMLElement)?.closest?.(GRID); };
    const onSel = (e: Event) => { if (down) e.preventDefault(); };
    const onUp = () => { if (down) { down = false; window.getSelection()?.removeAllRanges(); } };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('selectstart', onSel, true);
    window.addEventListener('mouseup', onUp, true);
    return () => { document.removeEventListener('mousedown', onDown, true); document.removeEventListener('selectstart', onSel, true); window.removeEventListener('mouseup', onUp, true); };
  }, []);

  const clear = () => useMultiSelect.getState().clear();

  const requestDelete = React.useCallback(() => {
    if (!useMultiSelect.getState().keys.length) return;
    setPending({ kind: 'delete' });
  }, []);

  // Esc clears, Delete/Backspace deletes the batch, clicking empty space clears.
  React.useEffect(() => {
    if (!keys.length) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, select, [contenteditable]')) return;
      if (pending) return;
      if (e.key === 'Escape') clear();
      else if ((e.key === 'Delete' || e.key === 'Backspace') && keys.length >= 1) { e.preventDefault(); requestDelete(); }
    };
    const onDown = (e: MouseEvent) => {
      if (pending) return;
      if ((e.target as HTMLElement)?.closest?.('[data-multisel-key],[data-multisel-bar],[data-cal-popover]')) return;
      clear();
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown, true);
    return () => { window.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown, true); };
  }, [keys.length, pending, requestDelete]);

  const { evs, blks } = items;
  const repeatingEvs = evs.filter((e) => isRepeatingSeriesRow(e));
  const guestEvs = evs.filter((e) => isOwnedEvent(e) && hasInvitedGuests(e));
  const commonCat = (() => {
    const ids = new Set<string>([...evs.map((e) => e.categoryId), ...blks.map((b) => b.categoryId)]);
    return ids.size === 1 ? [...ids][0] : undefined;
  })();

  const applyCategory = (catId: string, scope: DeleteScope) => {
    const st = useStore.getState();
    const cat = st.categories.find((c) => c.id === catId);
    if (!cat) return;
    const editable = evs.filter((e) => !isReadOnlyEvent(e));
    const skipped = evs.length - editable.length;
    useHistoryStore.getState().saveSnapshot();
    const targets = new Map<string, Event>();
    for (const e of editable) {
      targets.set(e.id, e);
      if (scope !== 'this' && e.recurrenceSeriesId) {
        st.events.filter((x) => x.recurrenceSeriesId === e.recurrenceSeriesId && (scope === 'all' || x.date >= e.date) && !isReadOnlyEvent(x))
          .forEach((x) => targets.set(x.id, x));
      }
    }
    const changes = cat.calendarContainerId ? { categoryId: catId, calendarContainerId: cat.calendarContainerId } : { categoryId: catId };
    if (targets.size) st.updateEvents([...targets.keys()].map((id) => ({ id, changes })));
    // Blocks: a todo/note's blocks move with its task so the list and calendar agree.
    const taskIds = new Set(blks.map((b) => b.taskId).filter(Boolean) as string[]);
    taskIds.forEach((tid) => st.updateTask(tid, { categoryId: catId }));
    const blockIds = new Set(blks.map((b) => b.id));
    st.timeBlocks.filter((b) => blockIds.has(b.id) || (b.taskId && taskIds.has(b.taskId))).forEach((b) => st.updateTimeBlock(b.id, { categoryId: catId }));
    const n = targets.size + blks.length;
    toastUndo(`Moved ${n} item${n === 1 ? '' : 's'} to ${cat.name}${skipped ? ` (skipped ${skipped} read-only Google event${skipped === 1 ? '' : 's'})` : ''}`);
    clear();
  };

  const onPickCategory = (catId: string) => {
    if (repeatingEvs.length) setPending({ kind: 'category', catId });
    else applyCategory(catId, 'this');
  };

  const applyDelete = (scope: DeleteScope) => {
    const st = useStore.getState();
    useHistoryStore.getState().saveSnapshot();
    evs.forEach((e) => deleteEventScoped(e.id, scope, notify && isOwnedEvent(e) && hasInvitedGuests(e), userName || undefined, false));
    // Scheduled todos/notes are removed from the calendar (the todo stays); plain blocks are deleted.
    blks.forEach((b) => st.deleteTimeBlock(b.id));
    const n = evs.length + blks.length;
    toastUndo(`Deleted ${n} item${n === 1 ? '' : 's'}`);
    clear();
  };

  const [scope, setScope] = React.useState<DeleteScope>('this');
  React.useEffect(() => { if (pending) setScope('this'); }, [pending]);

  if (keys.length < 2 && !pending) return null;
  const n = items.count;

  return createPortal(
    <>
      {pos && keys.length >= 2 && !pending && (
        <Popover
          data-multisel-bar
          style={{ position: 'fixed', left: pos.left, top: pos.top, width: BAR_W, height: BAR_H, zIndex: Z.popover, display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px 0 12px' }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <span style={{ fontSize: FONT_SIZE.sm, fontWeight: 600, color: COLOR.text, whiteSpace: 'nowrap' }}>{n} selected</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <CategoryChipPicker value={commonCat} onChange={onPickCategory} placeholder="Category…" placement="down" />
          </div>
          <IconButton icon={TrashIcon} size="sm" aria-label="Delete selected" title="Delete" onClick={requestDelete} />
          <IconButton icon={XMarkIcon} size="sm" aria-label="Clear selection" title="Clear (Esc)" onClick={clear} />
        </Popover>
      )}
      {pending && (
        <Modal
          title={pending.kind === 'delete' ? `Delete ${n} item${n === 1 ? '' : 's'}` : `Change category for ${n} items`}
          size="sm"
          onClose={() => setPending(null)}
          footer={pending.kind === 'delete' ? (
            <>
              <Button variant="ghost" onClick={() => setPending(null)}>Cancel</Button>
              <Button variant="danger" onClick={() => { setPending(null); applyDelete(repeatingEvs.length ? scope : 'this'); }}>Delete</Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setPending(null)}>Cancel</Button>
              <Button variant="primary" autoFocus onClick={() => { const p = pending; setPending(null); applyCategory(p.catId, scope); }}>Apply</Button>
            </>
          )}
        >
          {repeatingEvs.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
              <div style={{ fontSize: FONT_SIZE.sm, color: COLOR.muted }}>
                {repeatingEvs.length === 1 ? `"${repeatingEvs[0].title}" repeats.` : `${repeatingEvs.length} selected events repeat.`} Apply to:
              </div>
              {([['this', 'This event', 'Only the selected occurrences'], ['all_after', 'This and following events', 'From each selected date forward'], ['all', 'All events', 'Every event in each series']] as const).map(([v, label, desc]) => (
                <label key={v} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer', fontSize: FONT_SIZE.base, color: COLOR.text }}>
                  <input type="radio" name="ms-scope" checked={scope === v} onChange={() => setScope(v)} style={{ marginTop: 3 }} />
                  <span>{label}<span style={{ display: 'block', fontSize: FONT_SIZE['2xs'], color: COLOR.muted }}>{desc}</span></span>
                </label>
              ))}
            </div>
          )}
          {pending.kind === 'delete' && (
            <>
              <div style={{ fontSize: FONT_SIZE.sm, color: COLOR.muted }}>
                {blks.some((b) => b.taskId) ? 'Scheduled todos and notes are removed from the calendar; the todo itself stays in your list. ' : ''}You can undo this afterwards.
              </div>
              {guestEvs.length > 0 && (
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, fontSize: FONT_SIZE.base, color: COLOR.text, cursor: 'pointer' }}>
                  <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
                  Email a cancellation to guests of {guestEvs.length} event{guestEvs.length === 1 ? '' : 's'}
                </label>
              )}
            </>
          )}
          {pending.kind === 'category' && repeatingEvs.length === 0 && null}
        </Modal>
      )}
    </>,
    document.body
  );
}
