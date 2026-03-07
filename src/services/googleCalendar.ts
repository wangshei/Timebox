/**
 * Client-side Google Calendar service.
 * Calls Supabase edge functions for OAuth and sync.
 * Manages periodic polling for new events.
 */

import { supabase } from '../supabaseClient';
import type { GoogleSyncMode } from '../types/sharing';

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let pollTimer: ReturnType<typeof setInterval> | null = null;

async function callEdgeFunction(fnName: string, body: Record<string, unknown>) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const { data, error } = await supabase.functions.invoke(fnName, {
    body,
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}

/** Get the Google OAuth consent URL. Opens in a new window. */
export async function getGoogleAuthUrl(): Promise<string> {
  const result = await callEdgeFunction('gcal-auth', { action: 'get_auth_url' });
  return result.url;
}

/** Exchange the OAuth authorization code for tokens after redirect. */
export async function exchangeGoogleCode(code: string): Promise<void> {
  await callEdgeFunction('gcal-auth', { action: 'exchange_code', code });
}

/** List the user's Google Calendars for selection. */
export async function listGoogleCalendars(): Promise<Array<{
  id: string;
  summary: string;
  description?: string;
  backgroundColor: string;
  primary: boolean;
  accessRole: string;
}>> {
  const result = await callEdgeFunction('gcal-auth', { action: 'list_calendars' });
  return result.calendars;
}

/** Disconnect Google Calendar integration. */
export async function disconnectGoogle(): Promise<void> {
  stopPolling();
  await callEdgeFunction('gcal-auth', { action: 'disconnect' });
}

/** Start initial import based on the selected sync mode. */
export async function startImport(params: {
  googleCalendarId: string;
  syncMode: GoogleSyncMode;
  calendarContainerId: string;
  categoryId?: string;
}): Promise<{ imported: number }> {
  const result = await callEdgeFunction('gcal-sync', {
    action: 'initial_import',
    ...params,
  });
  return result;
}

/** Poll for new events from Google Calendar. */
export async function pollForUpdates(): Promise<{ updated: number }> {
  const result = await callEdgeFunction('gcal-sync', { action: 'poll' });
  return result;
}

/** Start automatic polling every 5 minutes. */
export function startPolling(onUpdate?: (result: { updated: number }) => void) {
  if (pollTimer) return; // already polling

  pollTimer = setInterval(async () => {
    try {
      const result = await pollForUpdates();
      if (result.updated > 0) {
        onUpdate?.(result);
        // eslint-disable-next-line no-console
        console.log(`[gcal] Synced ${result.updated} event(s) from Google Calendar`);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[gcal] Poll failed:', err);
    }
  }, POLL_INTERVAL_MS);

  // Also poll immediately on start
  pollForUpdates()
    .then((result) => {
      if (result.updated > 0) onUpdate?.(result);
    })
    .catch(() => {}); // silent on initial poll failure
}

/** Stop automatic polling. */
export function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

/** Check if the user has connected Google Calendar. */
export async function isGoogleConnected(): Promise<boolean> {
  if (!supabase) return false;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return false;

  const { data } = await supabase
    .from('google_tokens')
    .select('user_id')
    .eq('user_id', session.user.id)
    .single();

  return !!data;
}

/** Get the user's Google Calendar links (which calendars are synced). */
export async function getGoogleCalendarLinks(): Promise<Array<{
  id: string;
  googleCalendarId: string;
  googleCalendarName: string;
  syncMode: GoogleSyncMode;
  calendarContainerId: string;
  connectedAt: string;
  lastSyncedAt: string | null;
}>> {
  if (!supabase) return [];
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return [];

  const { data } = await supabase
    .from('google_calendar_links')
    .select('*')
    .eq('user_id', session.user.id);

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    googleCalendarId: row.google_calendar_id as string,
    googleCalendarName: row.google_calendar_name as string,
    syncMode: row.sync_mode as GoogleSyncMode,
    calendarContainerId: row.calendar_container_id as string,
    connectedAt: row.connected_at as string,
    lastSyncedAt: row.last_synced_at as string | null,
  }));
}
