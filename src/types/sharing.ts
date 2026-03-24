/**
 * Types for Google Calendar integration and calendar sharing/invites.
 */

// ─── Google Calendar Integration ───────────────────────────────────────────

/** How the user wants to sync their Google Calendar into Timebox. */
export type GoogleSyncMode =
  | 'migrate_listen'      // Import all existing events, then only listen for invites from others
  | 'listen_with_history' // No bulk import, but pull past invites + listen for new ones
  | 'listen_fresh';       // No import. Only new invites from others going forward.

/** A link between a Timebox CalendarContainer and a Google Calendar. */
export interface GoogleCalendarLink {
  id: string;
  userId: string;
  calendarContainerId: string;   // local CalendarContainer this maps to
  googleCalendarId: string;      // e.g. "primary" or "user@gmail.com"
  googleCalendarName: string;    // display name from Google
  syncMode: GoogleSyncMode;
  connectedAt: string;           // ISO timestamp — "listen_fresh" ignores events before this
  syncToken?: string;            // Google's incremental sync cursor
  initialImportDone: boolean;
  lastSyncedAt?: string;         // ISO timestamp of last successful sync
}

/** A Google Calendar event mapped into Timebox, before becoming a full Event. */
export interface GoogleEventRaw {
  googleEventId: string;
  summary: string;
  start: string;                 // ISO datetime or date
  end: string;
  organizer: { email: string; self: boolean };
  attendees?: { email: string; responseStatus: string }[];
  status: 'confirmed' | 'tentative' | 'cancelled';
  htmlLink?: string;
  description?: string;
  recurringEventId?: string;
  updated: string;               // ISO timestamp
}

// ─── Calendar Sharing & Invites ────────────────────────────────────────────

/** What level of the hierarchy is being shared. */
export type ShareScope = 'calendar' | 'category' | 'tag' | 'event';

/** A share/subscription at any level of the calendar hierarchy. */
export interface CalendarShare {
  id: string;
  ownerId: string;               // Timebox user who created the share

  // Scope — exactly one of these is set
  scope: ShareScope;
  calendarContainerId?: string;
  categoryId?: string;
  tagId?: string;
  eventId?: string;              // for single-event invites

  members: ShareMember[];

  displayName?: string;          // override name for recipients, e.g. "Sarah's Project Alpha"
  includeExisting: boolean;      // share existing events or only new ones
  pushToGoogle: boolean;         // default: also push events to non-users' GCal

  createdAt: string;
  updatedAt?: string;
}

/** A member of a share — can be a Timebox user or external email. */
export interface ShareMember {
  id: string;
  shareId: string;
  email: string;
  userId?: string;               // set if they're a Timebox user
  role: 'viewer' | 'editor' | 'admin';
  status: 'pending' | 'accepted' | 'declined';
  pushToGoogle: boolean;         // also create GCal events for this member
  token: string;                 // for accept/unsubscribe URL
  invitedAt: string;
  respondedAt?: string;
}

/** An invite notification for a Timebox user. */
export interface ShareInvite {
  id: string;
  shareId: string;
  memberId: string;              // ShareMember.id
  recipientUserId?: string;      // if Timebox user
  recipientEmail: string;
  senderName: string;
  shareName: string;             // e.g. "Project Alpha" or "Work Calendar"
  scope: ShareScope;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: string;
}

/** A shared calendar that appears in the recipient's sidebar. */
export interface SharedCalendarView {
  shareId: string;
  ownerId: string;
  ownerName: string;
  displayName: string;           // "Sarah's Project Alpha"
  scope: ShareScope;
  color: string;                 // inherited from source calendar/category
  eventCount: number;            // for the "3 events this week" label
  events?: SharedEventPreview[]; // preview of events in this share
}

/** Minimal event info for sidebar preview under shared calendars. */
export interface SharedEventPreview {
  title: string;
  date: string;                  // YYYY-MM-DD or description like "Every Monday"
  start: string;                 // HH:MM
  end: string;                   // HH:MM
  recurring?: boolean;
  recurrenceLabel?: string;      // "Every Monday", "Every weekday", etc.
}
