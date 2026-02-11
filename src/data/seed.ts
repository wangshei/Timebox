/**
 * Single source of seed data for development and reference.
 * Used by App.tsx and tests. Replace with Supabase/API in v1.
 */

import type { CalendarContainer, Category, Tag } from '../types';

export const calendarContainers: CalendarContainer[] = [
  { id: 'personal', name: 'Personal', color: '#86C0F4' },
  { id: 'work', name: 'Work', color: '#9F5FB0' },
  { id: 'school', name: 'School', color: '#EC8309' },
];

export const categories: Category[] = [
  { id: '1', name: 'Deep Work', color: '#0044A8', calendarContainerId: 'work' },
  { id: '2', name: 'Meetings', color: '#9F5FB0', calendarContainerId: 'work' },
  { id: '3', name: 'Exercise', color: '#13B49F', calendarContainerId: 'personal' },
  { id: '4', name: 'Learning', color: '#EC8309', calendarContainerId: 'personal' },
];

export const tags: Tag[] = [
  { id: '1', name: 'Urgent', categoryId: '1' },
  { id: '2', name: 'Client work', categoryId: '1' },
  { id: '3', name: 'Personal', categoryId: '3' },
];

/** Old-format time blocks for initial state (embedded category/tags/calendar). */
export const initialTimeBlocks = [
  {
    id: '1',
    title: 'Morning workout',
    startTime: '07:00',
    endTime: '08:00',
    date: '2026-02-10',
    category: categories[2] as Category,
    tags: [tags[2]] as Tag[],
    type: 'planned' as const,
    calendar: 'personal' as const,
  },
  {
    id: '2',
    title: 'Client presentation prep',
    startTime: '09:00',
    endTime: '11:00',
    date: '2026-02-10',
    category: categories[0] as Category,
    tags: [tags[0], tags[1]] as Tag[],
    type: 'planned' as const,
    calendar: 'work' as const,
  },
  {
    id: '3',
    title: 'Team standup',
    startTime: '11:00',
    endTime: '11:30',
    date: '2026-02-10',
    category: categories[1] as Category,
    tags: [tags[1]] as Tag[],
    type: 'recorded' as const,
    calendar: 'work' as const,
  },
  {
    id: '4',
    title: 'Lunch break',
    startTime: '12:00',
    endTime: '13:00',
    date: '2026-02-10',
    category: categories[2] as Category,
    tags: [] as Tag[],
    type: 'recorded' as const,
    calendar: 'personal' as const,
  },
  {
    id: '5',
    title: 'Code review',
    startTime: '14:00',
    endTime: '15:30',
    date: '2026-02-10',
    category: categories[0] as Category,
    tags: [tags[1]] as Tag[],
    type: 'planned' as const,
    calendar: 'work' as const,
  },
  {
    id: '6',
    title: 'Design review',
    startTime: '10:00',
    endTime: '11:00',
    date: '2026-02-11',
    category: categories[1] as Category,
    tags: [tags[1]] as Tag[],
    type: 'planned' as const,
    calendar: 'work' as const,
  },
  {
    id: '7',
    title: 'Team workshop',
    startTime: '14:00',
    endTime: '16:00',
    date: '2026-02-12',
    category: categories[0] as Category,
    tags: [tags[0], tags[1]] as Tag[],
    type: 'planned' as const,
    calendar: 'work' as const,
  },
  {
    id: '8',
    title: 'Evening run',
    startTime: '18:00',
    endTime: '19:00',
    date: '2026-02-13',
    category: categories[2] as Category,
    tags: [tags[2]] as Tag[],
    type: 'planned' as const,
    calendar: 'personal' as const,
  },
];

/** Old-format tasks for initial state. */
export const initialTasks = [
  {
    id: '1',
    title: 'Finish Q1 report',
    estimatedHours: 3,
    recordedHours: 0,
    category: categories[0] as Category,
    tags: [tags[0], tags[1]] as Tag[],
    calendar: 'work' as const,
  },
  {
    id: '2',
    title: 'Update portfolio website',
    estimatedHours: 4,
    recordedHours: 1.5,
    category: categories[3] as Category,
    tags: [tags[2]] as Tag[],
    calendar: 'personal' as const,
  },
  {
    id: '3',
    title: 'Read React documentation',
    estimatedHours: 2,
    recordedHours: 0,
    category: categories[3] as Category,
    tags: [tags[2]] as Tag[],
    calendar: 'personal' as const,
  },
  {
    id: '4',
    title: 'Plan team offsite',
    estimatedHours: 1.5,
    recordedHours: 0.5,
    category: categories[1] as Category,
    tags: [tags[1]] as Tag[],
    calendar: 'work' as const,
  },
];
