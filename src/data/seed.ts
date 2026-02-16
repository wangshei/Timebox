/**
 * Single source of seed data for development and reference.
 * Used by App.tsx and tests. Replace with Supabase/API in v1.
 */

import type { CalendarContainer, Category, Tag } from '../types';

/** Default: one Personal calendar. Users can add more. */
export const calendarContainers: CalendarContainer[] = [
  { id: 'personal', name: 'Personal', color: '#0044A8' },
];

export const categories: Category[] = [];

export const tags: Tag[] = [];

/** Old-format time blocks for initial state. Default: none (clean start with Personal calendar). */
export const initialTimeBlocks: {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  date: string;
  category: Category;
  tags: Tag[];
  type: 'planned' | 'recorded';
  calendar: 'personal' | 'work' | 'school';
}[] = [];

/** Old-format tasks for initial state. Default: none (clean start with Personal calendar). */
export const initialTasks: {
  id: string;
  title: string;
  estimatedHours: number;
  recordedHours: number;
  category: Category;
  tags: Tag[];
  calendar: 'personal' | 'work' | 'school';
}[] = [];
