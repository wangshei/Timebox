// Core entities matching the refined v0 spec

export type Mode = 'planning' | 'recording' | 'compare';
export type View = 'day' | 'week' | 'month';

export interface CalendarContainer {
  id: string;
  name: string;
  color: string;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  /** When set, category appears under this calendar in the left panel. */
  calendarContainerId?: string | null;
}

export interface Tag {
  id: string;
  name: string;
  type?: 'project' | 'hobby';
  /** When set, tag appears under this category in the left panel. */
  categoryId?: string | null;
}

export interface Task {
  id: string;
  title: string;
  estimatedMinutes: number; // Changed from estimatedHours
  calendarContainerId: string; // Changed from calendar string union
  categoryId: string;
  tagIds: string[];
  flexible: boolean; // NEW: default true
  status?: 'inbox' | 'partially_planned' | 'fully_planned' | 'partially_done' | 'done' | 'archived';
  
  // Derived (computed from TimeBlocks, not stored)
  // plannedMinutes: number;
  // recordedMinutes: number;
  // progress: number;
}

export interface TimeBlock {
  id: string;
  taskId?: string | null; // NEW: links to Task, nullable for standalone blocks
  title?: string; // Optional: for standalone blocks or when task title differs
  calendarContainerId: string; // Changed from calendar string union
  categoryId: string;
  tagIds: string[];
  start: string; // ISO datetime string or "HH:mm" format
  end: string; // ISO datetime string or "HH:mm" format
  date: string; // YYYY-MM-DD format for day/week/month views
  mode: 'planned' | 'recorded'; // Changed from 'type'
  source: 'manual' | 'autoAssumed'; // NEW: tracks how it was created
}

export interface Event {
  id: string;
  title: string;
  calendarContainerId: string;
  categoryId: string;
  start: string;
  end: string;
  date: string;
  recurring: boolean;
  recurrencePattern?: string; // e.g. 'daily', 'weekly', 'weekdays'
}

export interface User {
  id: string;
  timezone: string;
  defaultCalendarContainerId: string;
  settings: {
    defaultBlockMinutes: number; // default: 60
    endOfDayAssumption: 'assume_done_as_planned' | 'assume_not_done'; // v0: hard-coded to first
  };
}

// Helper types for UI state
export interface CalendarContainerVisibility {
  [containerId: string]: boolean;
}

// Analytics types
export interface TimeByCategory {
  category: Category;
  hours: number;
}

export interface TimeByCalendarContainer {
  container: CalendarContainer;
  hours: number;
}

export interface TimeByTag {
  tag: Tag;
  hours: number;
}
