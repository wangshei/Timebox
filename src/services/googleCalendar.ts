/**
 * Client-side Google Calendar service.
 * Handles OAuth, token management, and event fetching.
 * Tokens stored in localStorage for unauthenticated users.
 */

import { supabase } from '../supabaseClient';
import type { Event, CalendarContainer, Category } from '../types';

// ─── Config ──────────────────────────────────────────────────────────────────
const GOOGLE_CLIENT_ID = '660640300058-deh7j9q1q00aa7385a7js6liksic1mdi.apps.googleusercontent.com';
const GOOGLE_SCOPES = 'https://www.googleapis.com/auth/calendar.readonly';
const GCAL_TOKENS_KEY = 'gcal_tokens';
const GCAL_EVENTS_KEY = 'gcal_imported_events';
const GCAL_CALENDARS_KEY = 'gcal_imported_calendars';

function getRedirectUri(): string {
  return `${window.location.origin}/gcal-callback`;
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
  localStorage.removeItem('gcal_pending_sync_mode');
  localStorage.removeItem('gcal_device_id');
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
  organizer?: { email: string; self?: boolean };
  description?: string;
  htmlLink?: string;
  recurringEventId?: string;
}

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

// ─── Import flow ─────────────────────────────────────────────────────────────

export interface GcalImportResult {
  calendars: CalendarContainer[];
  categories: Category[];
  events: Event[];
}

/**
 * Fetch all calendars and events from Google, returning them as Timebox entities.
 * Each Google calendar → one CalendarContainer + one Category.
 * Each Google event → one read-only Event.
 */
export async function importGoogleCalendarEvents(): Promise<GcalImportResult> {
  const gcalCalendars = await fetchGoogleCalendars();
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
      for (const evt of gcalEvents) {
        if (evt.status === 'cancelled' || !evt.summary) continue;
        const start = parseGcalDateTime(evt.start);
        const end = parseGcalDateTime(evt.end);
        // Skip all-day events for now (they don't have times)
        if (!evt.start.dateTime) continue;

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
          readOnly: true,
          source: 'manual',
          description: evt.description || undefined,
        });
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
