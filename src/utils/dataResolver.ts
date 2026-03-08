import { TimeBlock, Task, Category, Tag, CalendarContainer, Event } from '../types';

/** Fallback when category/container list is empty or ID not found (avoids undefined in resolved block). */
const FALLBACK_CATEGORY: Category = { id: '__fallback__', name: 'Unknown', color: '#6b7280' };
const FALLBACK_CONTAINER: CalendarContainer = { id: '__fallback__', name: 'Unknown', color: '#6b7280' };

/**
 * Resolved TimeBlock with full objects instead of IDs
 * Used for component rendering
 */
export interface ResolvedTimeBlock {
  id: string;
  taskId?: string | null;
  title: string; // Resolved from Task or TimeBlock.title
  calendarContainerId: string;
  category: Category;
  tags: Tag[];
  start: string;
  end: string;
  date: string;
  mode: 'planned' | 'recorded';
  source: 'manual' | 'autoAssumed' | 'unplanned';
  calendarContainer: CalendarContainer;
  /** Priority inherited from linked Task (1–5), undefined if unset. */
  priority?: number;
  /** Due date inherited from linked Task (YYYY-MM-DD), undefined if unset. */
  dueDate?: string | null;
  /** Notes — from block itself or inherited from linked Task. */
  notes?: string | null;
  /** Description — from block itself or inherited from linked Task. */
  description?: string | null;
  /** Link — from block itself or inherited from linked Task. */
  link?: string | null;
}

/**
 * Resolve a TimeBlock with full Category, Tag, and CalendarContainer objects.
 * Uses fallback category/container when list is empty or ID not found so block never has undefined.
 */
export function resolveTimeBlock(
  block: TimeBlock,
  tasks: Task[],
  categories: Category[],
  tags: Tag[],
  containers: CalendarContainer[]
): ResolvedTimeBlock {
  const category = categories.find(c => c.id === block.categoryId) ?? categories[0] ?? FALLBACK_CATEGORY;
  const container = containers.find(c => c.id === block.calendarContainerId) ?? containers[0] ?? FALLBACK_CONTAINER;
  const blockTags = tags.filter(t => block.tagIds.includes(t.id));

  // Resolve from linked task when available
  const linkedTask = block.taskId ? tasks.find(t => t.id === block.taskId) : undefined;

  // Resolve title: prefer linked Task's title (live source of truth), fall back to block.title for standalone blocks
  let title = (linkedTask?.title) || block.title || '';

  return {
    ...block,
    title,
    category,
    tags: blockTags,
    calendarContainer: container,
    priority: typeof linkedTask?.priority === 'number' ? linkedTask.priority : undefined,
    dueDate: linkedTask?.dueDate ?? null,
    notes: block.notes || linkedTask?.notes || null,
    description: block.description || linkedTask?.description || null,
    link: block.link || linkedTask?.link || null,
  };
}

/**
 * Resolve multiple TimeBlocks
 */
export function resolveTimeBlocks(
  blocks: TimeBlock[],
  tasks: Task[],
  categories: Category[],
  tags: Tag[],
  containers: CalendarContainer[]
): ResolvedTimeBlock[] {
  return blocks.map(block => resolveTimeBlock(block, tasks, categories, tags, containers));
}

/**
 * Resolved Event with full objects instead of IDs
 */
export interface ResolvedEvent {
  id: string;
  title: string;
  calendarContainerId: string;
  category: Category;
  calendarContainer: CalendarContainer;
  start: string;
  end: string;
  date: string;
  endDate?: string;
  recurring: boolean;
  recurrencePattern?: string;
  recurrenceDays?: number[];
  recurrenceSeriesId?: string | null;
  link?: string | null;
  description?: string | null;
  notes?: string | null;
  /** Origin: 'unplanned' = created from actual panel, absent/undefined = planned. */
  source?: 'manual' | 'unplanned';
  attendanceStatus?: 'attended' | 'not_attended';
  /** Google Calendar event ID — set for events synced from Google. */
  googleEventId?: string | null;
  /** Google Calendar recurring event series ID — shared by all instances of a recurring event. */
  recurringGoogleEventId?: string | null;
  /** When set, this event came from a CalendarShare subscription (read-only for recipient). */
  sharedFromShareId?: string | null;
  /** When true, event is read-only (synced from Google or shared by another user). */
  readOnly?: boolean;
}

export function resolveEvent(
  event: Event,
  categories: Category[],
  containers: CalendarContainer[]
): ResolvedEvent {
  const category = categories.find(c => c.id === event.categoryId) ?? categories[0] ?? FALLBACK_CATEGORY;
  const container = containers.find(c => c.id === event.calendarContainerId) ?? containers[0] ?? FALLBACK_CONTAINER;
  return {
    ...event,
    category,
    calendarContainer: container,
  };
}

export function resolveEvents(
  events: Event[],
  categories: Category[],
  containers: CalendarContainer[]
): ResolvedEvent[] {
  return events.map(e => resolveEvent(e, categories, containers));
}

function parseTimeToMins(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function blocksOverlap(
  a: { date: string; taskId?: string | null; start: string; end: string },
  b: { date: string; taskId?: string | null; start: string; end: string }
): boolean {
  if (a.date !== b.date) return false;
  const aTask = a.taskId ?? '';
  const bTask = b.taskId ?? '';
  if (aTask !== bTask) return false;
  const aStart = parseTimeToMins(a.start);
  const aEnd = parseTimeToMins(a.end);
  const bStart = parseTimeToMins(b.start);
  const bEnd = parseTimeToMins(b.end);
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Main view: recorded blocks replace planned blocks for the same slot (same date, same taskId or both standalone, overlapping time).
 * Returns all recorded blocks plus planned blocks that have no overlapping recorded block.
 */
export function selectMainViewBlocks(blocks: ResolvedTimeBlock[]): ResolvedTimeBlock[] {
  const recorded = blocks.filter((b) => b.mode === 'recorded');
  const planned = blocks.filter((b) => b.mode === 'planned');
  const plannedToShow = planned.filter((p) => {
    const hasRecordedOverlap = recorded.some((r) => blocksOverlap(p, r));
    return !hasRecordedOverlap;
  });
  return [...recorded, ...plannedToShow];
}
