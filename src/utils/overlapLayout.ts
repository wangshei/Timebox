/**
 * Google Calendar–style overlap layout.
 *
 * Groups items by time overlap, then assigns each item a column index
 * and a total column count so they can render side-by-side.
 *
 * Works for any object that has `start` and `end` time strings ("HH:mm").
 */

export interface OverlapItem {
  id: string;
  start: string; // "HH:mm"
  end: string;   // "HH:mm"
}

export interface OverlapLayout {
  columnIndex: number;
  totalColumns: number;
}

function parseTime(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Compute overlap layout for a list of items.
 * Returns a Map from item.id → { columnIndex, totalColumns }.
 *
 * Algorithm:
 * 1. Sort items by start time, then by end time descending (longer blocks first).
 * 2. Greedily build collision groups: an item joins the current group if it
 *    overlaps with any item already in the group.
 * 3. Within each group, assign columns by finding the first column not occupied
 *    at the item's start time.
 * 4. totalColumns = max columns used in the group (applied to every item in the group).
 */
export function computeOverlapLayout<T extends OverlapItem>(items: T[]): Map<string, OverlapLayout> {
  const result = new Map<string, OverlapLayout>();
  if (items.length === 0) return result;

  // Sort: earliest start first; ties broken by longest duration first.
  const sorted = [...items].sort((a, b) => {
    const aStart = parseTime(a.start);
    const bStart = parseTime(b.start);
    if (aStart !== bStart) return aStart - bStart;
    return parseTime(b.end) - parseTime(a.end);
  });

  // Build collision groups.
  // A group is a maximal set of items where each item overlaps with at least one other.
  const groups: T[][] = [];
  let currentGroup: T[] = [];
  let groupEnd = 0; // the latest end time in the current group

  for (const item of sorted) {
    const itemStart = parseTime(item.start);
    const itemEnd = parseTime(item.end);

    if (currentGroup.length === 0 || itemStart < groupEnd) {
      // Overlaps with the group
      currentGroup.push(item);
      groupEnd = Math.max(groupEnd, itemEnd);
    } else {
      // No overlap — finalize current group and start a new one.
      groups.push(currentGroup);
      currentGroup = [item];
      groupEnd = itemEnd;
    }
  }
  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  // Assign columns within each group.
  for (const group of groups) {
    // Each column tracks the end time of its last-placed item.
    const columns: number[] = [];

    for (const item of group) {
      const itemStart = parseTime(item.start);

      // Find the first column where the item fits (no overlap).
      let placed = false;
      for (let col = 0; col < columns.length; col++) {
        if (itemStart >= columns[col]) {
          columns[col] = parseTime(item.end);
          result.set(item.id, { columnIndex: col, totalColumns: 0 }); // totalColumns set below
          placed = true;
          break;
        }
      }
      if (!placed) {
        result.set(item.id, { columnIndex: columns.length, totalColumns: 0 });
        columns.push(parseTime(item.end));
      }
    }

    // Set totalColumns for every item in the group.
    const totalColumns = columns.length;
    for (const item of group) {
      const layout = result.get(item.id)!;
      layout.totalColumns = totalColumns;
    }
  }

  return result;
}
