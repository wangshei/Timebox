/**
 * Overlap truncation for compare mode's actual panel.
 * Higher-priority items claim their time; lower-priority items get truncated.
 *
 * Priority levels:
 *  3 = unplanned (highest — these represent what actually happened)
 *  2 = confirmed/attended
 *  1 = planned/pending (lowest)
 */

export interface TruncationItem {
  id: string;
  start: string; // "HH:mm"
  end: string;   // "HH:mm"
  priority: number; // higher = more important
}

export interface TruncatedItem {
  id: string;
  effectiveStart: string; // "HH:mm"
  effectiveEnd: string;   // "HH:mm"
  hidden: boolean;
}

function parseToMins(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function minsToStr(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Given items for a single day, compute effective start/end after higher-priority
 * items claim their time ranges.
 *
 * Algorithm:
 * 1. Sort items by priority descending (highest first).
 * 2. Maintain a list of "claimed" time ranges.
 * 3. For each item in priority order, subtract claimed ranges from its time range.
 * 4. The remaining range becomes its effective time. If nothing remains, mark hidden.
 */
export function computeOverlapTruncation(items: TruncationItem[]): TruncatedItem[] {
  // Sort by priority descending
  const sorted = [...items].sort((a, b) => b.priority - a.priority);

  // Claimed ranges as [startMins, endMins] intervals
  const claimed: [number, number][] = [];

  const results: Map<string, TruncatedItem> = new Map();

  for (const item of sorted) {
    const startMins = parseToMins(item.start);
    const endMins = parseToMins(item.end);

    // Subtract claimed ranges from this item's range
    let remaining: [number, number][] = [[startMins, endMins]];

    for (const [cs, ce] of claimed) {
      const next: [number, number][] = [];
      for (const [rs, re] of remaining) {
        // No overlap
        if (re <= cs || rs >= ce) {
          next.push([rs, re]);
          continue;
        }
        // Partial overlaps — keep non-overlapping portions
        if (rs < cs) next.push([rs, cs]);
        if (re > ce) next.push([ce, re]);
        // The overlapping portion is removed
      }
      remaining = next;
    }

    // Filter out tiny fragments (< 5 minutes)
    remaining = remaining.filter(([s, e]) => e - s >= 5);

    if (remaining.length === 0) {
      results.set(item.id, {
        id: item.id,
        effectiveStart: item.start,
        effectiveEnd: item.end,
        hidden: true,
      });
    } else {
      // Use the largest remaining fragment
      remaining.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]));
      const [effStart, effEnd] = remaining[0];
      results.set(item.id, {
        id: item.id,
        effectiveStart: minsToStr(effStart),
        effectiveEnd: minsToStr(effEnd),
        hidden: false,
      });
    }

    // Claim this item's original range
    claimed.push([startMins, endMins]);
  }

  // Return in original order
  return items.map((item) => results.get(item.id)!);
}
