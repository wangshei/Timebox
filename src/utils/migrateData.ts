import { TimeBlock, Task, Category, Tag, CalendarContainer } from '../types';

/**
 * Convert old format TimeBlock (with embedded objects) to new format (with IDs)
 */
export function convertOldTimeBlockToNew(
  oldBlock: {
    id: string;
    title: string;
    startTime: string;
    endTime: string;
    date: string;
    category: Category;
    tags: Tag[];
    type: 'planned' | 'recorded';
    calendar: 'personal' | 'work' | 'school';
  },
  containers: CalendarContainer[]
): TimeBlock {
  // Map old calendar string to container ID
  const containerMap: { [key: string]: string } = {
    personal: 'personal',
    work: 'work',
    school: 'school',
  };

  return {
    id: oldBlock.id,
    title: oldBlock.title, // Keep title for now (will be resolved from Task later)
    calendarContainerId: containerMap[oldBlock.calendar] || 'personal',
    categoryId: oldBlock.category.id,
    tagIds: oldBlock.tags.map(t => t.id),
    start: oldBlock.startTime,
    end: oldBlock.endTime,
    date: oldBlock.date,
    mode: oldBlock.type,
    source: 'manual',
  };
}

/**
 * Convert old format Task to new format
 */
export function convertOldTaskToNew(
  oldTask: {
    id: string;
    title: string;
    estimatedHours: number;
    recordedHours: number;
    category: Category;
    tags: Tag[];
    calendar: 'personal' | 'work' | 'school';
  },
  containers: CalendarContainer[]
): Task {
  const containerMap: { [key: string]: string } = {
    personal: 'personal',
    work: 'work',
    school: 'school',
  };

  return {
    id: oldTask.id,
    title: oldTask.title,
    estimatedMinutes: oldTask.estimatedHours * 60,
    calendarContainerId: containerMap[oldTask.calendar] || 'personal',
    categoryId: oldTask.category.id,
    tagIds: oldTask.tags.map(t => t.id),
    flexible: true, // Default to flexible
  };
}
