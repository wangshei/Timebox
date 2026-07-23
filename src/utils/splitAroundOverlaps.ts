/**
 * Carve a target time range around a set of "blocker" ranges, returning the
 * remaining free fragments. Used by the "Split" action so an overlapping item
 * can fill only the gaps left by the items it overlaps — no double-counted time.
 */

export interface TimeRange {
  start: string; // "HH:mm"
  end: string;   // "HH:mm"
}

function toMins(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function toStr(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** True if two same-day ranges intersect (touching edges don't count). */
export function rangesOverlap(a: TimeRange, b: TimeRange): boolean {
  return toMins(a.start) < toMins(b.end) && toMins(b.start) < toMins(a.end);
}

/**
 * Subtract every blocker range from `target`, returning the remaining fragments
 * in chronological order. Fragments shorter than `minMinutes` are dropped.
 *
 * e.g. target 9:00–11:00 minus [9:30–10:00] → [9:00–9:30, 10:00–11:00].
 */
export function splitAroundOverlaps(
  target: TimeRange,
  blockers: TimeRange[],
  minMinutes = 5,
): TimeRange[] {
  let remaining: [number, number][] = [[toMins(target.start), toMins(target.end)]];

  for (const b of blockers) {
    const cs = toMins(b.start);
    const ce = toMins(b.end);
    const next: [number, number][] = [];
    for (const [rs, re] of remaining) {
      // No overlap — keep the fragment whole.
      if (re <= cs || rs >= ce) {
        next.push([rs, re]);
        continue;
      }
      // Keep the non-overlapping portions before/after the blocker.
      if (rs < cs) next.push([rs, cs]);
      if (re > ce) next.push([ce, re]);
      // The overlapping middle is dropped (owned by the blocker).
    }
    remaining = next;
  }

  return remaining
    .filter(([s, e]) => e - s >= minMinutes)
    .sort((a, b) => a[0] - b[0])
    .map(([s, e]) => ({ start: toStr(s), end: toStr(e) }));
}
