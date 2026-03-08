/**
 * Test data for Google Calendar integration and sharing features.
 * Used in development only — provides sample events to verify
 * how synced and shared events render on the calendar grid.
 *
 * Usage: import and call injectTestGcalEvents(store) from App.tsx
 * behind an `import.meta.env.DEV` guard.
 */

import type { Event, CalendarContainer, Category } from '../types';
import type { SharedCalendarView } from '../types/sharing';
import { getLocalDateString } from '../utils/dateTime';

// ─── Test calendar containers for Google-synced calendars ──────────────────

export const testGcalContainers: CalendarContainer[] = [
  { id: 'gcal-work', name: 'Work (Google)', color: '#4285F4' },       // Google blue
  { id: 'gcal-personal', name: 'Personal (Google)', color: '#0B8043' }, // Google green
];

export const testGcalCategories: Category[] = [
  { id: 'gcal-meetings', name: 'Meetings', color: '#4285F4', calendarContainerId: 'gcal-work' },
  { id: 'gcal-social', name: 'Social', color: '#0B8043', calendarContainerId: 'gcal-personal' },
];

// ─── Helper: generate dates relative to today ─────────────────────────────

function relativeDate(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

const today = getLocalDateString();

// ─── Sample events ────────────────────────────────────────────────────────

export const testGcalEvents: Event[] = [
  // --- Today's events ---
  {
    id: 'gcal-ev-1',
    title: 'Team Standup',
    calendarContainerId: 'gcal-work',
    categoryId: 'gcal-meetings',
    start: '09:00',
    end: '09:30',
    date: today,
    recurring: true,
    recurrencePattern: 'weekly',
    recurrenceDays: [1, 2, 3, 4, 5], // Mon-Fri
    googleEventId: 'google_abc123',
    readOnly: true,
    source: 'manual',
  },
  {
    id: 'gcal-ev-2',
    title: '1:1 with Manager',
    calendarContainerId: 'gcal-work',
    categoryId: 'gcal-meetings',
    start: '10:00',
    end: '10:30',
    date: today,
    recurring: true,
    recurrencePattern: 'weekly',
    recurrenceDays: [2], // Tuesday
    googleEventId: 'google_def456',
    readOnly: true,
    source: 'manual',
  },
  {
    id: 'gcal-ev-3',
    title: 'Lunch with Alex',
    calendarContainerId: 'gcal-personal',
    categoryId: 'gcal-social',
    start: '12:00',
    end: '13:00',
    date: today,
    recurring: false,
    googleEventId: 'google_ghi789',
    readOnly: true,
    source: 'manual',
    notes: 'Meet at the usual spot',
  },

  // --- Tomorrow ---
  {
    id: 'gcal-ev-4',
    title: 'Sprint Planning',
    calendarContainerId: 'gcal-work',
    categoryId: 'gcal-meetings',
    start: '14:00',
    end: '15:30',
    date: relativeDate(1),
    recurring: true,
    recurrencePattern: 'weekly',
    recurrenceDays: [1], // Monday
    googleEventId: 'google_jkl012',
    readOnly: true,
    source: 'manual',
    description: 'Review sprint backlog and plan next sprint',
  },
  {
    id: 'gcal-ev-5',
    title: 'Design Review',
    calendarContainerId: 'gcal-work',
    categoryId: 'gcal-meetings',
    start: '16:00',
    end: '16:45',
    date: relativeDate(1),
    recurring: false,
    googleEventId: 'google_mno345',
    readOnly: true,
    source: 'manual',
  },

  // --- Day after tomorrow ---
  {
    id: 'gcal-ev-6',
    title: 'Coffee with Sam',
    calendarContainerId: 'gcal-personal',
    categoryId: 'gcal-social',
    start: '08:30',
    end: '09:15',
    date: relativeDate(2),
    recurring: false,
    googleEventId: 'google_pqr678',
    readOnly: true,
    source: 'manual',
  },

  // --- Yesterday (past synced event) ---
  {
    id: 'gcal-ev-7',
    title: 'Product Sync',
    calendarContainerId: 'gcal-work',
    categoryId: 'gcal-meetings',
    start: '11:00',
    end: '11:45',
    date: relativeDate(-1),
    recurring: true,
    recurrencePattern: 'weekly',
    googleEventId: 'google_stu901',
    readOnly: true,
    source: 'manual',
    attendanceStatus: 'attended',
  },

  // --- A shared event (from another Timebox user) ---
  {
    id: 'shared-ev-1',
    title: 'Project Alpha Kickoff',
    calendarContainerId: 'gcal-work',
    categoryId: 'gcal-meetings',
    start: '13:00',
    end: '14:00',
    date: relativeDate(3),
    recurring: false,
    sharedFromShareId: 'share-abc',
    readOnly: true,
    source: 'manual',
    description: 'Shared by Sarah via Timeboxing Club',
  },
  {
    id: 'shared-ev-2',
    title: 'Weekly Team Retro',
    calendarContainerId: 'gcal-work',
    categoryId: 'gcal-meetings',
    start: '15:00',
    end: '15:45',
    date: relativeDate(4),
    recurring: true,
    recurrencePattern: 'weekly',
    recurrenceDays: [5], // Friday
    sharedFromShareId: 'share-abc',
    readOnly: true,
    source: 'manual',
  },
];

// ─── Shared calendar views (what appears in "Shared with me" sidebar) ─────

export const testSharedCalendars: SharedCalendarView[] = [
  {
    shareId: 'share-abc',
    ownerId: 'user-sarah',
    ownerName: 'Sarah Chen',
    displayName: "Sarah's Project Alpha",
    scope: 'tag',
    color: '#4285F4',
    eventCount: 2,
    events: [
      { title: 'Project Alpha Kickoff', date: '2026-03-11', start: '10:00', end: '11:00' },
      { title: 'Alpha Weekly Sync', date: '2026-03-09', start: '14:00', end: '14:30', recurring: true, recurrenceLabel: 'Every Monday' },
    ],
  },
  {
    shareId: 'share-def',
    ownerId: 'user-mike',
    ownerName: 'Mike Johnson',
    displayName: "Mike's 1-on-1s",
    scope: 'category',
    color: '#EA4335',
    eventCount: 1,
    events: [
      { title: '1:1 with Mike', date: '2026-03-10', start: '15:00', end: '15:30', recurring: true, recurrenceLabel: 'Every Tuesday' },
    ],
  },
];

/**
 * Inject test Google Calendar data into the store for localhost development.
 * Call this once after initial state is set up.
 */
export function injectTestGcalEvents(store: {
  getState: () => {
    calendarContainers: CalendarContainer[];
    categories: Category[];
    events: Event[];
  };
  setState: (partial: Record<string, unknown>) => void;
}) {
  const state = store.getState();

  // Only inject if not already present
  if (state.events.some((e) => e.googleEventId || e.sharedFromShareId)) return;

  const existingContainerIds = new Set(state.calendarContainers.map((c) => c.id));
  const existingCategoryIds = new Set(state.categories.map((c) => c.id));

  const newContainers = testGcalContainers.filter((c) => !existingContainerIds.has(c.id));
  const newCategories = testGcalCategories.filter((c) => !existingCategoryIds.has(c.id));

  store.setState({
    calendarContainers: [...state.calendarContainers, ...newContainers],
    categories: [...state.categories, ...newCategories],
    events: [...state.events, ...testGcalEvents],
    containerVisibility: {
      ...Object.fromEntries(state.calendarContainers.map((c) => [c.id, true])),
      ...Object.fromEntries(newContainers.map((c) => [c.id, true])),
    },
  });

  // eslint-disable-next-line no-console
  console.log(
    `[testGcalEvents] Injected ${testGcalEvents.length} test events, ` +
    `${newContainers.length} containers, ${newCategories.length} categories`
  );
}
