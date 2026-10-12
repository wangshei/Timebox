import { useSyncExternalStore } from 'react';

/** Persistent create mode: what a drag on the empty calendar grid creates. */
export type CreateMode = 'event' | 'todo';
const KEY = 'timebox.createMode';

function read(): CreateMode {
  try { return localStorage.getItem(KEY) === 'todo' ? 'todo' : 'event'; } catch { return 'event'; }
}

let current: CreateMode = read();
const listeners = new Set<() => void>();

export function getCreateMode(): CreateMode { return current; }

export function setCreateMode(m: CreateMode) {
  if (m === current) return;
  current = m;
  try { localStorage.setItem(KEY, m); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}

export function useCreateMode(): [CreateMode, (m: CreateMode) => void] {
  const m = useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => current,
  );
  return [m, setCreateMode];
}
