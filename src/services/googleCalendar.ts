/**
 * Client-side Google Calendar service.
 * Handles OAuth, token management, and event fetching.
 * Tokens stored in localStorage for unauthenticated users.
 */

import { supabase } from '../supabaseClient';
import type { Event, CalendarContainer, Category, RecurrencePattern } from '../types';

// ─── Config ──────────────────────────────────────────────────────────────────
const GOOGLE_CLIENT_ID = '660640300058-deh7j9q1q00aa7385a7js6liksic1mdi.apps.googleusercontent.com';
const GOOGLE_SCOPES = 'https://www.googleapis.com/auth/calendar.readonly';
const GCAL_TOKENS_KEY = 'gcal_tokens';
const GCAL_EVENTS_KEY = 'gcal_imported_events';
const GCAL_CALENDARS_KEY = 'gcal_imported_calendars';
const GCAL_DISMISSED_KEY = 'gcal_dismissed_event_ids';
const GCAL_DISMISSED_CALS_KEY = 'gcal_dismissed_calendar_ids';
const GCAL_SELECTED_CALS_KEY = 'gcal_selected_calendar_ids';

function getRedirectUri(): string {
  // In Tauri desktop app, window.location.origin is tauri://localhost which
  // Google OAuth won't accept. Redirect through the web app instead.
  const origin = window.location.origin;
  if (origin.includes('tauri://') || origin.includes('localhost')) {
    return 'https://app.timeboxing.club/gcal-callback';
  }
  return `${origin}/gcal-callback`;
}

// ─── Token helpers ───────────────────────────────────────────────────────────

interface GcalTokens {
  access_token: string;
  refresh_token: string;
  expires_at: string; // ISO timestamp
  scope: string;
}

export function getStoredTokens(): GcalTokens | null {
  const raw = localStorage.getItem(GCAL_TOKENS_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function storeTokens(tokens: GcalTokens) {
  localStorage.setItem(GCAL_TOKENS_KEY, JSON.stringify(tokens));
}

/** Check if Google Calendar is connected (tokens exist in localStorage). */
export function isGoogleConnected(): boolean {
  return getStoredTokens() !== null;
}

/** Disconnect: remove tokens and imported data from localStorage. */
export function disconnectGoogle(): void {
  localStorage.removeItem(GCAL_TOKENS_KEY);
  localStorage.removeItem(GCAL_EVENTS_KEY);
  localStorage.removeItem(GCAL_CALENDARS_KEY);
  localStorage.removeItem(GCAL_DISMISSED_KEY);
  localStorage.removeItem(GCAL_DISMISSED_CALS_KEY);
  localStorage.removeItem(GCAL_SELECTED_CALS_KEY);
  localStorage.removeItem('gcal_pending_sync_mode');
  localStorage.removeItem('gcal_connected_at');
  localStorage.removeItem('gcal_device_id');
}

/** Get the set of gcal event IDs the user has dismissed (removed from Timebox). */
export function getGcalDismissedIds(): Set<string> {
  const raw = localStorage.getItem(GCAL_DISMISSED_KEY);
  if (!raw) return new Set();
  try { return new Set(JSON.parse(raw)); } catch { return new Set(); }
}

/** Mark a gcal event ID as dismissed so it won't come back on re-import. */
export function dismissGcalEventId(eventId: string): void {
  const ids = getGcalDismissedIds();
  ids.add(eventId);
  localStorage.setItem(GCAL_DISMISSED_KEY, JSON.stringify([...ids]));
}

/** Mark multiple gcal event IDs as dismissed. */
export function dismissGcalEventIds(eventIds: string[]): void {
  const ids = getGcalDismissedIds();
  for (const id of eventIds) ids.add(id);
  localStorage.setItem(GCAL_DISMISSED_KEY, JSON.stringify([...ids]));
}

/** Get the set of gcal calendar container IDs the user has dismissed (deleted from Timebox). */
export function getGcalDismissedCalendarIds(): Set<string> {
  const raw = localStorage.getItem(GCAL_DISMISSED_CALS_KEY);
  if (!raw) return new Set();
  try { return new Set(JSON.parse(raw)); } catch { return new Set(); }
}

/** Mark a gcal calendar container ID as dismissed so it won't come back on re-import. */
export function dismissGcalCalendarId(calendarId: string): void {
  const ids = getGcalDismissedCalendarIds();
  ids.add(calendarId);
  localStorage.setItem(GCAL_DISMISSED_CALS_KEY, JSON.stringify([...ids]));
}

/**
 * Get the set of Google Calendar IDs the user has chosen to import.
 * Returns null if no selection has been made yet (import all by default for backwards compat).
 */
export function getGcalSelectedCalendarIds(): Set<string> | null {
  const raw = localStorage.getItem(GCAL_SELECTED_CALS_KEY);
  if (!raw) return null;
  try { return new Set(JSON.parse(raw)); } catch { return null; }
}

/** Save the set of Google Calendar IDs the user wants to import. Uses raw gcal IDs (not container IDs). */
export function setGcalSelectedCalendarIds(ids: string[]): void {
  localStorage.setItem(GCAL_SELECTED_CALS_KEY, JSON.stringify(ids));
}

/** Get a valid access token, refreshing if expired. */
async function getAccessToken(): Promise<string> {
  const tokens = getStoredTokens();
  if (!tokens) throw new Error('Not connected to Google Calendar');

  // Check if token is still valid (with 60s buffer)
  if (new Date(tokens.expires_at).getTime() > Date.now() + 60_000) {
    return tokens.access_token;
  }

  // Refresh via edge function (needs client_secret on server)
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const res = await fetch(`${supabaseUrl}/functions/v1/gcal-auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'refresh_token',
      refresh_token: tokens.refresh_token,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Token refresh failed');

  // Update stored tokens
  storeTokens({
    ...tokens,
    access_token: data.access_token,
    expires_at: data.expires_at,
  });
  return data.access_token;
}

// ─── OAuth ───────────────────────────────────────────────────────────────────

/** Get the Google OAuth consent URL. Built client-side — no auth needed. */
export function getGoogleAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: getRedirectUri(),
    response_type: 'code',
    scope: GOOGLE_SCOPES,
    access_type: 'offline',
    prompt: 'consent',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/** Exchange the OAuth authorization code for tokens after redirect. */
export async function exchangeGoogleCode(code: string): Promise<void> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  if (!supabaseUrl) throw new Error('Supabase not configured');

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (supabase) {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }
  }

  const res = await fetch(`${supabaseUrl}/functions/v1/gcal-auth`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      action: 'exchange_code',
      code,
      redirect_uri: getRedirectUri(),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Edge Function returned a non-2xx status code');
  }

  // Store tokens in localStorage (always, for client-side access)
  if (data.tokens) {
    storeTokens(data.tokens);
  }
}

// ─── Google Calendar API (direct, using stored access token) ─────────────────

interface GcalCalendar {
  id: string;
  summary: string;
  backgroundColor: string;
  primary?: boolean;
}

interface GcalEvent {
  id: string;
  summary?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  status: string;
  creator?: { email: string; self?: boolean };
  organizer?: { email: string; self?: boolean };
  attendees?: Array<{ email: string; self?: boolean; responseStatus?: string }>;
  description?: string;
  htmlLink?: string;
  hangoutLink?: string;
  conferenceData?: {
    entryPoints?: Array<{ entryPointType?: string; uri?: string }>;
  };
  location?: string;
  recurringEventId?: string;
}

/** Extract the best meeting/conference link from a Google Calendar event. */
function extractEventLink(evt: GcalEvent): string | undefined {
  // 1. Conference data (Zoom, Meet, Teams, etc.)
  if (evt.conferenceData?.entryPoints) {
    const video = evt.conferenceData.entryPoints.find(
      (ep) => ep.entryPointType === 'video' && ep.uri
    );
    if (video?.uri) return video.uri;
  }
  // 2. Hangout link (older Google Meet)
  if (evt.hangoutLink) return evt.hangoutLink;
  // 3. Location if it's a URL
  if (evt.location && /^https?:\/\//i.test(evt.location.trim())) {
    return evt.location.trim();
  }
  // 4. Google Calendar HTML link as fallback
  return evt.htmlLink || undefined;
}

/** Extract location text (non-URL portion) from a Google Calendar event. */
function extractEventLocation(evt: GcalEvent): string | undefined {
  if (!evt.location) return undefined;
  // If location is just a URL, don't duplicate it (already captured as link)
  if (/^https?:\/\//i.test(evt.location.trim())) return undefined;
  return evt.location;
}

/** Check if an event is one that others invited the user to (not self-organized). */
function isInviteFromOthers(evt: GcalEvent): boolean {
  // If the user is the organizer, it's their own event
  if (evt.organizer?.self) return false;
  // If the user is the creator and there's no separate organizer, it's their own
  if (evt.creator?.self && !evt.organizer) return false;
  // If there are attendees and the user is one of them, it's an invite
  if (evt.attendees?.some(a => a.self)) return true;
  // If there's an organizer that isn't self, treat as invite
  if (evt.organizer && !evt.organizer.self) return true;
  return false;
}

/** Check if the user is the organizer of this event. */
function isUserOrganizer(evt: GcalEvent): boolean {
  if (evt.organizer?.self) return true;
  if (evt.creator?.self && !evt.organizer) return true;
  return false;
}

/** Check if an event involves other people (has non-self attendees). */
function hasOtherAttendees(evt: GcalEvent): boolean {
  if (!evt.attendees || evt.attendees.length === 0) return false;
  return evt.attendees.some(a => !a.self);
}

/** Map Google Calendar attendees to our attendee format. */
function mapAttendees(evt: GcalEvent): Array<{ email: string; name?: string; self?: boolean; responseStatus?: string }> | undefined {
  if (!evt.attendees || evt.attendees.length === 0) return undefined;
  return evt.attendees.map(a => ({
    email: a.email,
    self: a.self,
    responseStatus: a.responseStatus,
  }));
}

type SyncMode = 'migrate_listen' | 'listen_with_history' | 'listen_fresh';

/** Fetch the user's Google Calendar list. */
export async function fetchGoogleCalendars(): Promise<GcalCalendar[]> {
  const token = await getAccessToken();
  const res = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to list calendars: ${res.status}`);
  const data = await res.json();
  return (data.items ?? []).map((c: Record<string, unknown>) => ({
    id: c.id as string,
    summary: c.summary as string,
    backgroundColor: (c.backgroundColor as string) || '#4285F4',
    primary: c.primary === true,
  }));
}

/** Fetch events from a Google Calendar (last 90 days + next 90 days). */
async function fetchCalendarEvents(calendarId: string): Promise<GcalEvent[]> {
  const token = await getAccessToken();
  const now = new Date();
  const timeMin = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const timeMax = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString();

  const allEvents: GcalEvent[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '250',
    });
    if (pageToken) params.set('pageToken', pageToken);

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) throw new Error(`Failed to fetch events: ${res.status}`);
    const data = await res.json();
    allEvents.push(...(data.items ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);

  return allEvents;
}

/** Parse a Google event datetime into { date: 'YYYY-MM-DD', time: 'HH:mm' }. */
function parseGcalDateTime(dt: { dateTime?: string; date?: string }): { date: string; time: string } {
  if (dt.dateTime) {
    const d = new Date(dt.dateTime);
    return {
      date: d.toLocaleDateString('en-CA'), // YYYY-MM-DD
      time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
    };
  }
  // All-day event
  return { date: dt.date ?? '', time: '00:00' };
}

// ─── Recurrence detection ────────────────────────────────────────────────────

/**
 * Detect the recurrence pattern from a set of expanded Google Calendar instances.
 * Analyzes the gaps between occurrence dates to determine daily/weekly/monthly/custom.
 */
function detectRecurrencePattern(instances: GcalEvent[]): { pattern: RecurrencePattern; days?: number[] } {
  if (instances.length < 2) return { pattern: 'weekly' }; // Default for single instance

  // Parse dates
  const dates = instances
    .map(e => {
      if (!e.start.dateTime) return null;
      const d = new Date(e.start.dateTime);
      return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    })
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime());

  if (dates.length < 2) return { pattern: 'weekly' };

  // Calculate gaps in days between consecutive occurrences
  const gaps: number[] = [];
  for (let i = 1; i < dates.length; i++) {
    gaps.push(Math.round((dates[i].getTime() - dates[i - 1].getTime()) / 86400000));
  }

  // Check if all gaps are the same
  const allSame = gaps.every(g => g === gaps[0]);

  if (allSame && gaps[0] === 1) return { pattern: 'daily' };
  if (allSame && gaps[0] === 2) return { pattern: 'every_other_day' };
  if (allSame && gaps[0] === 7) return { pattern: 'weekly' };

  // Check monthly: gaps ~28-31 days
  if (allSame && gaps[0] >= 28 && gaps[0] <= 31) return { pattern: 'monthly' };

  // Check for custom weekly pattern (repeats on specific days of the week)
  const weekdays = new Set(dates.map(d => d.getDay()));
  // If all gaps are multiples of 7 or fit a weekly cycle, treat as custom days
  const maxGap = Math.max(...gaps);
  if (maxGap <= 7 && weekdays.size > 1) {
    return { pattern: 'custom', days: [...weekdays].sort() };
  }

  // If gaps are consistent within a 7-day cycle, it's custom days
  if (weekdays.size >= 1 && weekdays.size <= 5 && gaps.every(g => g <= 7)) {
    return { pattern: 'custom', days: [...weekdays].sort() };
  }

  // Fallback: weekly
  return { pattern: 'weekly' };
}

// ─── Import flow ─────────────────────────────────────────────────────────────

export interface GcalImportResult {
  calendars: CalendarContainer[];
  categories: Category[];
  events: Event[];
}

/**
 * Fetch all calendars and events from Google, returning them as Timebox entities.
 * Respects the sync mode chosen by the user:
 *   - migrate_listen: Import ALL existing events, then only invites going forward
 *   - listen_with_history: Only events others invited the user to (past + future)
 *   - listen_fresh: Only future invites from others (no history)
 */
export async function importGoogleCalendarEvents(): Promise<GcalImportResult> {
  const syncMode = (localStorage.getItem('gcal_pending_sync_mode') || 'listen_with_history') as SyncMode;
  const connectedAt = localStorage.getItem('gcal_connected_at') || new Date().toISOString();
  // Store connection timestamp for listen_fresh mode
  if (!localStorage.getItem('gcal_connected_at')) {
    localStorage.setItem('gcal_connected_at', connectedAt);
  }

  const allGcalCalendars = await fetchGoogleCalendars();

  // Filter to only user-selected calendars (null = no selection yet = import all)
  const selectedIds = getGcalSelectedCalendarIds();
  const gcalCalendars = selectedIds
    ? allGcalCalendars.filter(c => selectedIds.has(c.id))
    : allGcalCalendars;
  const containers: CalendarContainer[] = [];
  const categories: Category[] = [];
  const events: Event[] = [];

  for (const gcal of gcalCalendars) {
    const containerId = `gcal-${gcal.id.replace(/[^a-zA-Z0-9]/g, '-')}`;
    const categoryId = `gcal-cat-${gcal.id.replace(/[^a-zA-Z0-9]/g, '-')}`;

    containers.push({
      id: containerId,
      name: gcal.summary || 'Google Calendar',
      color: gcal.backgroundColor,
    });

    categories.push({
      id: categoryId,
      name: gcal.primary ? 'Primary' : gcal.summary || 'Events',
      color: gcal.backgroundColor,
      calendarContainerId: containerId,
    });

    // Fetch events for this calendar
    try {
      const gcalEvents = await fetchCalendarEvents(gcal.id);

      // Separate recurring vs one-off events
      const recurringGroups = new Map<string, GcalEvent[]>();
      const oneOffEvents: GcalEvent[] = [];

      for (const evt of gcalEvents) {
        if (evt.status === 'cancelled' || !evt.summary) continue;
        if (!evt.start.dateTime) continue;

        // Apply sync mode filter
        // Always import: invites from others + user-created events with other attendees
        if (syncMode === 'listen_with_history') {
          if (!isInviteFromOthers(evt) && !hasOtherAttendees(evt)) continue;
        } else if (syncMode === 'listen_fresh') {
          if (!isInviteFromOthers(evt) && !hasOtherAttendees(evt)) continue;
          const evtStart = new Date(evt.start.dateTime);
          if (evtStart < new Date(connectedAt)) continue;
        }

        if (evt.recurringEventId) {
          const group = recurringGroups.get(evt.recurringEventId) ?? [];
          group.push(evt);
          recurringGroups.set(evt.recurringEventId, group);
        } else {
          oneOffEvents.push(evt);
        }
      }

      // Process one-off events
      for (const evt of oneOffEvents) {
        const start = parseGcalDateTime(evt.start);
        const end = parseGcalDateTime(evt.end);
        const organizer = isUserOrganizer(evt);
        events.push({
          id: `gcal-evt-${evt.id}`,
          title: evt.summary,
          calendarContainerId: containerId,
          categoryId,
          start: start.time,
          end: end.time,
          date: start.date,
          endDate: start.date !== end.date ? end.date : undefined,
          recurring: false,
          googleEventId: evt.id,
          readOnly: !organizer,
          isOrganizer: organizer,
          source: 'manual',
          description: evt.description || undefined,
          link: extractEventLink(evt),
          location: extractEventLocation(evt),
          attendees: mapAttendees(evt),
        });
      }

      // Process recurring event groups — create one Timebox series per group
      for (const [recurringId, instances] of recurringGroups) {
        if (instances.length === 0) continue;
        // Sort by start date
        instances.sort((a, b) => (a.start.dateTime ?? '').localeCompare(b.start.dateTime ?? ''));

        const first = instances[0];
        const { pattern, days } = detectRecurrencePattern(instances);
        const seriesId = `gcal-series-${recurringId}`;

        // Create one Timebox event per instance, all sharing the series ID
        const organizer = isUserOrganizer(first);
        for (const evt of instances) {
          const start = parseGcalDateTime(evt.start);
          const end = parseGcalDateTime(evt.end);
          events.push({
            id: `gcal-evt-${evt.id}`,
            title: evt.summary ?? first.summary ?? 'Event',
            calendarContainerId: containerId,
            categoryId,
            start: start.time,
            end: end.time,
            date: start.date,
            endDate: start.date !== end.date ? end.date : undefined,
            recurring: true,
            recurrencePattern: pattern,
            recurrenceDays: days,
            recurrenceSeriesId: seriesId,
            googleEventId: evt.id,
            recurringGoogleEventId: recurringId,
            readOnly: !organizer,
            isOrganizer: organizer,
            source: 'manual',
            description: evt.description || first.description || undefined,
            link: extractEventLink(evt) || extractEventLink(first),
            location: extractEventLocation(evt) || extractEventLocation(first),
            attendees: mapAttendees(evt) || mapAttendees(first),
          });
        }
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[gcal] Failed to fetch events for ${gcal.summary}:`, err);
    }
  }

  // Cache in localStorage so events survive page refresh
  localStorage.setItem(GCAL_EVENTS_KEY, JSON.stringify(events));
  localStorage.setItem(GCAL_CALENDARS_KEY, JSON.stringify({ containers, categories }));

  // eslint-disable-next-line no-console
  console.log(`[gcal] Imported ${events.length} events from ${gcalCalendars.length} calendars`);

  return { calendars: containers, categories, events };
}

/** Load cached Google Calendar data from localStorage. */
export function loadCachedGcalData(): GcalImportResult | null {
  const eventsRaw = localStorage.getItem(GCAL_EVENTS_KEY);
  const calsRaw = localStorage.getItem(GCAL_CALENDARS_KEY);
  if (!eventsRaw || !calsRaw) return null;
  try {
    const events = JSON.parse(eventsRaw) as Event[];
    const { containers, categories } = JSON.parse(calsRaw);
    return { calendars: containers, categories, events };
  } catch {
    return null;
  }
}
