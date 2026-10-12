import { useEffect, useSyncExternalStore } from 'react';
import { fetchStickerSetFromSupabase, persistStickerSetToSupabase } from '../supabasePersistence';

export const DEFAULT_STICKER_SET = ['🔋', '🪫', '😁', '☺️', '🤯', '😵'];
const KEY = 'timebox-sticker-set';

function read(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.every((x) => typeof x === 'string')) return arr;
    }
  } catch { /* ignore */ }
  return DEFAULT_STICKER_SET;
}

let current: string[] = read();
const listeners = new Set<() => void>();
let synced = false;

function emit() { listeners.forEach((l) => l()); }

export function setStickerSet(next: string[]) {
  current = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
  emit();
  void persistStickerSetToSupabase(next);
}

/** Returns the first emoji grapheme if the string is a single emoji, else null. */
export function parseEmoji(input: string): string | null {
  const v = input.trim();
  if (!v) return null;
  const segs = typeof Intl !== 'undefined' && (Intl as any).Segmenter
    ? [...new (Intl as any).Segmenter(undefined, { granularity: 'grapheme' }).segment(v)].map((s: any) => s.segment as string)
    : [v];
  if (segs.length !== 1) return null;
  const g = segs[0];
  return /\p{Extended_Pictographic}|\p{Regional_Indicator}|[0-9#*]️?⃣/u.test(g) ? g : null;
}

export function useStickerSet(): string[] {
  useEffect(() => {
    if (synced) return;
    synced = true;
    fetchStickerSetFromSupabase().then((remote) => {
      if (remote) {
        current = remote;
        try { localStorage.setItem(KEY, JSON.stringify(remote)); } catch { /* ignore */ }
        emit();
      }
    }).catch(() => { synced = false; });
  }, []);
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => current);
}
