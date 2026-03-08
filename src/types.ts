// Core entities matching the refined v0 spec

export type Mode = 'overall' | 'compare';
export type View = 'day' | '3day' | 'week' | 'month';

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
  /** When set, this category is available for these calendars (shared). Empty/null = all calendars. */
  calendarContainerIds?: string[] | null;
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
  /** Priority 1–5 (higher = more important). */
  priority?: number;
  status?: 'inbox' | 'partially_planned' | 'fully_planned' | 'partially_done' | 'done' | 'archived';
  /** Optional due date (YYYY-MM-DD). Shown on card when set. */
  dueDate?: string | null;
  /** Optional URL. Shown on card when set. */
  link?: string | null;
  /** Optional description. Shown in detail when set. */
  description?: string | null;
  /** Quick inline notes — shown in the task detail popup. */
  notes?: string | null;
  /** Legacy fields kept for backward compatibility. */
  pinned?: boolean;
  emoji?: string | null;

  // Derived (computed from TimeBlocks, not stored)
  // plannedMinutes: number;
  // recordedMinutes: number;
  // progress: number;
}

/**
 * Whether a past planned block has been reviewed.
 * - 'pending'   — in the past, not yet confirmed or skipped (needs review)
 * - 'confirmed' — marked as done (actual times may differ via recordedStart/End)
 * - 'skipped'   — marked as not done / missed
 * Future blocks (date ≥ today) leave this undefined.
 */
export type ConfirmationStatus = 'pending' | 'confirmed' | 'skipped';

export interface TimeBlock {
  id: string;
  taskId?: string | null; // links to Task, nullable for standalone blocks
  title?: string; // for standalone blocks or when task title differs
  calendarContainerId: string;
  categoryId: string;
  tagIds: string[];
  start: string; // planned start — "HH:mm"
  end: string;   // planned end   — "HH:mm"
  date: string;  // YYYY-MM-DD
  mode: 'planned' | 'recorded'; // 'recorded' is legacy; new blocks are always 'planned'
  /** How the block was created. 'unplanned' = added retroactively during review (no plan). */
  source: 'manual' | 'autoAssumed' | 'unplanned';
  /** Review state for past planned blocks. Undefined for future blocks. */
  confirmationStatus?: ConfirmationStatus;
  /** Actual start time if it differed from planned — set when confirming. "HH:mm" */
  recordedStart?: string | null;
  /** Actual end time if it differed from planned — set when confirming. "HH:mm" */
  recordedEnd?: string | null;
  link?: string | null;
  description?: string | null;
  /** Quick inline notes — shown inside the block and in the popover. */
  notes?: string | null;
  /** Original planned start before any move — preserved for diff detection. */
  originalStart?: string | null;
  /** Original planned end before any move/resize — preserved for diff detection. */
  originalEnd?: string | null;
  /** Timestamp (ms) of last edit — used for overlap truncation priority. */
  editedAt?: number;
}

/** Recurrence pattern for events. */
export type RecurrencePattern =
  | 'none'
  | 'daily'
  | 'every_other_day'
  | 'weekly'
  | 'monthly'
  | 'custom'; // custom = specific days of week, stored in recurrenceDays

export interface Event {
  id: string;
  title: string;
  calendarContainerId: string;
  categoryId: string;
  start: string;
  end: string;
  date: string;
  /** For cross-date events (e.g. 10pm-8am): the end date. Undefined = same as date. */
  endDate?: string;
  recurring: boolean;
  recurrencePattern?: RecurrencePattern;
  /** For custom: e.g. [0,1,2,3,4] = Mon–Fri (0=Sun, 6=Sat). */
  recurrenceDays?: number[];
  /** For "all after" edits: id of the first event in the series. */
  recurrenceSeriesId?: string | null;
  link?: string | null;
  location?: string | null;
  description?: string | null;
  /** Quick inline notes — shown in the detail popup. */
  notes?: string | null;
  /** Origin: 'manual' = planned, 'unplanned' = added from actual/recorded panel. */
  source?: 'manual' | 'unplanned';
  /** Attendance status for past events. Undefined = unreviewed, 'attended' = happened, 'not_attended' = didn't happen. */
  attendanceStatus?: 'attended' | 'not_attended';
  /** Original planned start before any move — preserved for diff detection. */
  originalStart?: string | null;
  /** Original planned end before any move/resize — preserved for diff detection. */
  originalEnd?: string | null;
  /** Timestamp (ms) of last edit — used for overlap truncation priority. */
  editedAt?: number;

  // ─── Google Calendar / Sharing fields ─────────────────────
  /** Google Calendar event ID — set for events synced from Google. */
  googleEventId?: string | null;
  /** Google Calendar recurring event series ID — shared by all instances of a recurring event. */
  recurringGoogleEventId?: string | null;
  /** When set, this event came from a CalendarShare subscription (read-only for recipient). */
  sharedFromShareId?: string | null;
  /** When set, this event is read-only (synced from Google or shared by another user). */
  readOnly?: boolean;
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
