/**
 * Static demo data for the walkthrough overlay.
 * Mirrors the real type system but uses hardcoded 'demo-' prefixed IDs.
 * Never enters the Zustand store — only lives inside WalkthroughOverlay.
 */

import type { CalendarContainer, Category, Tag, TimeBlock, Event, Task } from '../types';
import type { SummaryRow } from '../store/selectors';

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Returns yesterday, today, tomorrow as YYYY-MM-DD strings. */
export function getDemoDates(): { day1: string; day2: string; day3: string } {
  const now = new Date();
  const d1 = new Date(now); d1.setDate(d1.getDate() - 1);
  const d2 = new Date(now);
  const d3 = new Date(now); d3.setDate(d3.getDate() + 1);
  return { day1: fmt(d1), day2: fmt(d2), day3: fmt(d3) };
}

/** Returns a Date for today at 14:30 (2:30 PM). */
export function getDemoNow(): Date {
  const now = new Date();
  now.setHours(14, 30, 0, 0);
  return now;
}

// ── Calendars ────────────────────────────────────────────────────────────────

export const DEMO_CALENDARS: CalendarContainer[] = [
  { id: 'demo-personal',      name: 'Personal',      color: '#5B718C' },
  { id: 'demo-growth',        name: 'Growth',        color: '#8DA387' },
  { id: 'demo-school',        name: 'School',        color: '#B3B46D' },
  { id: 'demo-relationships', name: 'Relationships', color: '#DE8D91' },
];

// ── Categories ───────────────────────────────────────────────────────────────

export const DEMO_CATEGORIES: Category[] = [
  // Personal
  { id: 'demo-cat-active',   name: 'Staying Active', color: '#D6E6FB', calendarContainerId: 'demo-personal', calendarContainerIds: ['demo-personal'] },
  { id: 'demo-cat-selfcare', name: 'Self-care',      color: '#B8CAF2', calendarContainerId: 'demo-personal', calendarContainerIds: ['demo-personal'] },
  { id: 'demo-cat-relaxing', name: 'Relaxing',       color: '#AFB7E7', calendarContainerId: 'demo-personal', calendarContainerIds: ['demo-personal'] },
  { id: 'demo-cat-hobbies',  name: 'Hobbies',        color: '#8E9DCA', calendarContainerId: 'demo-personal', calendarContainerIds: ['demo-personal'] },
  { id: 'demo-cat-general',  name: 'General',        color: '#DBE4D7', calendarContainerId: 'demo-personal', calendarContainerIds: ['demo-personal'] },
  // Growth
  { id: 'demo-cat-learning',  name: 'Learning',  color: '#8DA387', calendarContainerId: 'demo-growth', calendarContainerIds: ['demo-growth'] },
  { id: 'demo-cat-reading',   name: 'Reading',   color: '#6593A6', calendarContainerId: 'demo-growth', calendarContainerIds: ['demo-growth'] },
  { id: 'demo-cat-building',  name: 'Building',  color: '#4A6741', calendarContainerId: 'demo-growth', calendarContainerIds: ['demo-growth'] },
  // School
  { id: 'demo-cat-classes',     name: 'Classes',     color: '#DAD15F', calendarContainerId: 'demo-school', calendarContainerIds: ['demo-school'] },
  { id: 'demo-cat-assignments', name: 'Assignments', color: '#C5C255', calendarContainerId: 'demo-school', calendarContainerIds: ['demo-school'] },
  { id: 'demo-cat-projects',    name: 'Projects',    color: '#B3B46D', calendarContainerId: 'demo-school', calendarContainerIds: ['demo-school'] },
  // Relationships
  { id: 'demo-cat-networking',  name: 'Networking',  color: '#DE8D91', calendarContainerId: 'demo-relationships', calendarContainerIds: ['demo-relationships'] },
  { id: 'demo-cat-socializing', name: 'Socializing', color: '#F4B6B6', calendarContainerId: 'demo-relationships', calendarContainerIds: ['demo-relationships'] },
  { id: 'demo-cat-family',      name: 'Family',      color: '#F4CCAC', calendarContainerId: 'demo-relationships', calendarContainerIds: ['demo-relationships'] },
];

// ── Tags ─────────────────────────────────────────────────────────────────────

export const DEMO_TAGS: Tag[] = [
  { id: 'demo-tag-fitness',  name: 'Fitness',  type: 'hobby', categoryId: 'demo-cat-active' },
  { id: 'demo-tag-painting', name: 'Painting', type: 'hobby', categoryId: 'demo-cat-hobbies' },
  { id: 'demo-tag-ai',       name: 'AI/Tech',  type: 'project', categoryId: 'demo-cat-learning' },
];

// ── Demo Tasks (for right sidebar backlog) ───────────────────────────────────

export function getDemoTasks(dates: { day1: string; day2: string; day3: string }): Task[] {
  return [
    { id: 'demo-task-1', title: 'Review questions for midterm', estimatedMinutes: 90, calendarContainerId: 'demo-school', categoryId: 'demo-cat-assignments', tagIds: [], flexible: true, status: 'fully_planned', priority: 3 },
    { id: 'demo-task-3', title: 'Read AI book', estimatedMinutes: 60, calendarContainerId: 'demo-growth', categoryId: 'demo-cat-reading', tagIds: ['demo-tag-ai'], flexible: true, status: 'fully_planned', priority: 2 },
    { id: 'demo-task-5', title: 'Coffee chat follow-ups', estimatedMinutes: 30, calendarContainerId: 'demo-relationships', categoryId: 'demo-cat-networking', tagIds: [], flexible: true, status: 'fully_planned', priority: 2 },
    { id: 'demo-task-6', title: 'Portfolio update', estimatedMinutes: 60, calendarContainerId: 'demo-growth', categoryId: 'demo-cat-building', tagIds: [], flexible: true, status: 'fully_planned', priority: 3 },
    { id: 'demo-task-8', title: 'Finish wireframes', estimatedMinutes: 120, calendarContainerId: 'demo-school', categoryId: 'demo-cat-projects', tagIds: [], flexible: true, status: 'fully_planned', priority: 3 },
    { id: 'demo-task-12', title: 'Morning routine', estimatedMinutes: 45, calendarContainerId: 'demo-personal', categoryId: 'demo-cat-selfcare', tagIds: [], flexible: true, status: 'done', priority: 1 },
  ];
}

// ── Time Blocks ──────────────────────────────────────────────────────────────

export function getDemoTimeBlocks(dates: { day1: string; day2: string; day3: string }): TimeBlock[] {
  const { day1, day2, day3 } = dates;

  return [
    // DAY 1 — PLANNED
    { id: 'demo-b-d1p1', taskId: 'demo-task-12', calendarContainerId: 'demo-personal', categoryId: 'demo-cat-selfcare', tagIds: [], start: '08:00', end: '08:45', date: day1, mode: 'planned', source: 'manual', confirmationStatus: 'confirmed' },
    { id: 'demo-b-d1p3', taskId: 'demo-task-1', calendarContainerId: 'demo-school', categoryId: 'demo-cat-assignments', tagIds: [], start: '10:30', end: '12:00', date: day1, mode: 'planned', source: 'manual', confirmationStatus: 'confirmed' },
    { id: 'demo-b-d1p7', taskId: null, title: 'Gym', calendarContainerId: 'demo-personal', categoryId: 'demo-cat-active', tagIds: ['demo-tag-fitness'], start: '16:00', end: '17:00', date: day1, mode: 'planned', source: 'manual', confirmationStatus: 'skipped' },
    // DAY 1 — UNPLANNED
    { id: 'demo-b-d1a2', taskId: null, title: 'Emergency group meeting', calendarContainerId: 'demo-school', categoryId: 'demo-cat-projects', tagIds: [], start: '14:00', end: '16:00', date: day1, mode: 'planned', source: 'unplanned', confirmationStatus: 'confirmed' },

    // DAY 2 — PLANNED
    { id: 'demo-b-d2p2', taskId: 'demo-task-5', calendarContainerId: 'demo-relationships', categoryId: 'demo-cat-networking', tagIds: [], start: '13:00', end: '14:00', date: day2, mode: 'planned', source: 'manual' },
    { id: 'demo-b-d2p3', taskId: 'demo-task-6', calendarContainerId: 'demo-growth', categoryId: 'demo-cat-building', tagIds: [], start: '14:30', end: '15:30', date: day2, mode: 'planned', source: 'manual' },
    // DAY 2 — UNPLANNED
    { id: 'demo-b-d2a4', taskId: null, title: 'Lunch + catch up', calendarContainerId: 'demo-relationships', categoryId: 'demo-cat-socializing', tagIds: [], start: '11:30', end: '13:00', date: day2, mode: 'planned', source: 'unplanned', confirmationStatus: 'confirmed' },

    // DAY 3 — PLANNED
    { id: 'demo-b-d3p3', taskId: 'demo-task-8', calendarContainerId: 'demo-school', categoryId: 'demo-cat-projects', tagIds: [], start: '13:00', end: '15:00', date: day3, mode: 'planned', source: 'manual' },
    { id: 'demo-b-d3p5', taskId: 'demo-task-3', calendarContainerId: 'demo-growth', categoryId: 'demo-cat-reading', tagIds: ['demo-tag-ai'], start: '15:30', end: '16:30', date: day3, mode: 'planned', source: 'manual' },
  ];
}

// ── Events ───────────────────────────────────────────────────────────────────

export function getDemoEvents(dates: { day1: string; day2: string; day3: string }): Event[] {
  const { day1, day2, day3 } = dates;

  return [
    // DAY 1
    { id: 'demo-e-d1p2', title: 'Product Design Lecture', calendarContainerId: 'demo-school', categoryId: 'demo-cat-classes', start: '09:00', end: '10:15', date: day1, recurring: true, recurrencePattern: 'weekly' },
    { id: 'demo-e-d1p4', title: 'Lunch with classmates', calendarContainerId: 'demo-relationships', categoryId: 'demo-cat-socializing', start: '12:00', end: '13:00', date: day1, recurring: false },
    // DAY 2
    { id: 'demo-e-d2p1', title: 'Product Strategy Class', calendarContainerId: 'demo-school', categoryId: 'demo-cat-classes', start: '09:00', end: '10:30', date: day2, recurring: true, recurrencePattern: 'weekly' },
    { id: 'demo-e-d2p4', title: 'Entrepreneurship Club', calendarContainerId: 'demo-growth', categoryId: 'demo-cat-learning', start: '16:00', end: '17:00', date: day2, recurring: true, recurrencePattern: 'weekly' },
    // DAY 3
    { id: 'demo-e-d3p2', title: 'Tech & Society Lecture', calendarContainerId: 'demo-school', categoryId: 'demo-cat-classes', start: '09:30', end: '10:45', date: day3, recurring: true, recurrencePattern: 'weekly' },
    { id: 'demo-e-d3p3', title: 'Coffee chat', calendarContainerId: 'demo-relationships', categoryId: 'demo-cat-networking', start: '11:00', end: '12:00', date: day3, recurring: false },
  ];
}

// ── Visibility ───────────────────────────────────────────────────────────────

export const DEMO_VISIBILITY: { [key: string]: boolean } = {
  'demo-personal': true,
  'demo-growth': true,
  'demo-school': true,
  'demo-relationships': true,
};

// ── Pre-computed Plan vs Actual summary for analytics panel ──────────────────

export function getDemoPlanVsActual(): SummaryRow[] {
  return [
    { id: 'demo-cat-classes',     name: 'Classes',        color: '#DAD15F', plannedHours: 4.0, recordedHours: 3.0, deltaHours: -1.0 },
    { id: 'demo-cat-assignments', name: 'Assignments',    color: '#C5C255', plannedHours: 2.5, recordedHours: 1.5, deltaHours: -1.0 },
    { id: 'demo-cat-socializing', name: 'Socializing',    color: '#F4B6B6', plannedHours: 1.0, recordedHours: 2.5, deltaHours: 1.5 },
    { id: 'demo-cat-projects',    name: 'Projects',       color: '#B3B46D', plannedHours: 2.0, recordedHours: 4.0, deltaHours: 2.0 },
    { id: 'demo-cat-building',    name: 'Building',       color: '#4A6741', plannedHours: 1.0, recordedHours: 1.0, deltaHours: 0.0 },
    { id: 'demo-cat-networking',  name: 'Networking',     color: '#DE8D91', plannedHours: 1.0, recordedHours: 0.0, deltaHours: -1.0 },
  ];
}
