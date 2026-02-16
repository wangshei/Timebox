import { TimeBlock, Task, Category, Tag, CalendarContainer } from '../types';

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
  source: 'manual' | 'autoAssumed';
  calendarContainer: CalendarContainer;
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
  
  // Resolve title: from linked Task if exists, otherwise from TimeBlock.title
  let title = block.title || '';
  if (!title && block.taskId) {
    const task = tasks.find(t => t.id === block.taskId);
    title = task?.title || '';
  }
  
  return {
    ...block,
    title,
    category,
    tags: blockTags,
    calendarContainer: container,
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
