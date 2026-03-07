/**
 * Google Calendar Sync Edge Function
 *
 * Endpoints:
 *   POST /gcal-sync { action: 'initial_import', googleCalendarId, syncMode, calendarContainerId }
 *     → Performs initial event import based on sync mode.
 *
 *   POST /gcal-sync { action: 'poll' }
 *     → Incremental sync using syncToken. Called periodically (every 5 min).
 *
 * Sync modes:
 *   - migrate_listen: Import ALL events, then only listen for invites from others
 *   - listen_with_history: Import past invites (not organizer), listen for new
 *   - listen_fresh: No import, only new invites from connectedAt onward
 *
 * Env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') ?? ''
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? ''

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}

async function getUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.replace('Bearer ', '')
  if (!token) return null
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  const { data } = await supabase.auth.getUser(token)
  return data?.user?.id ?? null
}

async function getAccessToken(userId: string): Promise<string> {
  const supabase = getSupabaseAdmin()
  const { data: tokenRow } = await supabase
    .from('google_tokens')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (!tokenRow) throw new Error('No Google tokens found. Connect Google Calendar first.')

  // Refresh if expired
  if (new Date(tokenRow.expires_at) <= new Date()) {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: tokenRow.refresh_token,
        grant_type: 'refresh_token',
      }),
    })
    if (!res.ok) throw new Error('Token refresh failed')
    const tokens = await res.json()

    await supabase.from('google_tokens').update({
      access_token: tokens.access_token,
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    }).eq('user_id', userId)

    return tokens.access_token
  }

  return tokenRow.access_token
}

// Fetch events from Google Calendar API
interface FetchEventsOpts {
  accessToken: string
  calendarId: string
  syncToken?: string
  timeMin?: string
  maxResults?: number
}

interface GoogleEvent {
  id: string
  summary?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
  organizer?: { email?: string; self?: boolean }
  attendees?: { email: string; responseStatus: string }[]
  status: string
  htmlLink?: string
  description?: string
  recurringEventId?: string
  updated: string
  created?: string
}

async function fetchGoogleEvents(opts: FetchEventsOpts): Promise<{ events: GoogleEvent[]; nextSyncToken?: string }> {
  const params = new URLSearchParams({
    maxResults: String(opts.maxResults ?? 250),
    singleEvents: 'true',
    orderBy: 'startTime',
  })
  if (opts.syncToken) {
    params.set('syncToken', opts.syncToken)
  } else if (opts.timeMin) {
    params.set('timeMin', opts.timeMin)
  }

  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(opts.calendarId)}/events?${params}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${opts.accessToken}` },
  })

  if (res.status === 410) {
    // syncToken expired — need full re-sync
    return { events: [], nextSyncToken: undefined }
  }
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Google Calendar API error: ${err}`)
  }

  const data = await res.json()
  return {
    events: data.items ?? [],
    nextSyncToken: data.nextSyncToken,
  }
}

// Convert a Google event to Timebox event format
function mapGoogleEvent(gEvent: GoogleEvent, calendarContainerId: string, categoryId: string): Record<string, unknown> | null {
  if (gEvent.status === 'cancelled') return null
  if (!gEvent.start) return null

  const startDt = gEvent.start.dateTime ?? gEvent.start.date
  const endDt = gEvent.end?.dateTime ?? gEvent.end?.date ?? startDt
  if (!startDt) return null

  // Parse datetime
  const startDate = new Date(startDt!)
  const endDate = new Date(endDt!)

  const date = startDate.toISOString().slice(0, 10)
  const start = `${String(startDate.getHours()).padStart(2, '0')}:${String(startDate.getMinutes()).padStart(2, '0')}`
  const end = `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`

  return {
    title: gEvent.summary ?? 'Untitled',
    calendar_container_id: calendarContainerId,
    category_id: categoryId,
    start,
    end,
    date,
    recurring: false,
    google_event_id: gEvent.id,
    read_only: true,
    source: 'manual',
    description: gEvent.description ?? null,
    link: gEvent.htmlLink ?? null,
  }
}

// Check if the user is NOT the organizer (i.e., this is an invite from someone else)
function isInviteFromOthers(gEvent: GoogleEvent): boolean {
  return gEvent.organizer?.self !== true
}

// --- Initial Import ---

async function initialImport(
  userId: string,
  googleCalendarId: string,
  syncMode: string,
  calendarContainerId: string,
  categoryId: string,
) {
  const supabase = getSupabaseAdmin()
  const accessToken = await getAccessToken(userId)
  const now = new Date().toISOString()

  // Determine time range based on sync mode
  let timeMin: string | undefined
  if (syncMode === 'listen_fresh') {
    // No import — just save the link and start listening
    timeMin = now
  } else if (syncMode === 'listen_with_history') {
    // Go back 6 months for past invites
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
    timeMin = sixMonthsAgo.toISOString()
  } else {
    // migrate_listen: import everything (Google defaults to now, so go back 2 years)
    const twoYearsAgo = new Date()
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)
    timeMin = twoYearsAgo.toISOString()
  }

  const { events, nextSyncToken } = await fetchGoogleEvents({
    accessToken,
    calendarId: googleCalendarId,
    timeMin,
    maxResults: 2500,
  })

  // Filter based on sync mode
  const filteredEvents = syncMode === 'migrate_listen'
    ? events // Import everything
    : events.filter(isInviteFromOthers) // Only invites from others

  // Map to Timebox format
  const mapped = filteredEvents
    .map((e) => mapGoogleEvent(e, calendarContainerId, categoryId))
    .filter(Boolean) as Record<string, unknown>[]

  // Upsert events (keyed by google_event_id)
  if (mapped.length > 0) {
    for (const evt of mapped) {
      evt.user_id = userId
    }
    const { error } = await supabase.from('events').upsert(
      mapped,
      { onConflict: 'user_id,google_event_id' }
    )
    if (error) throw new Error(`Event upsert failed: ${error.message}`)
  }

  // Save/update the calendar link
  await supabase.from('google_calendar_links').upsert({
    user_id: userId,
    calendar_container_id: calendarContainerId,
    google_calendar_id: googleCalendarId,
    sync_mode: syncMode,
    connected_at: now,
    sync_token: nextSyncToken ?? null,
    initial_import_done: true,
    last_synced_at: now,
  }, { onConflict: 'user_id,google_calendar_id' })

  return {
    imported: mapped.length,
    syncToken: nextSyncToken ?? null,
  }
}

// --- Incremental Poll ---

async function poll(userId: string) {
  const supabase = getSupabaseAdmin()
  const accessToken = await getAccessToken(userId)

  // Get all linked calendars
  const { data: links } = await supabase
    .from('google_calendar_links')
    .select('*')
    .eq('user_id', userId)

  if (!links || links.length === 0) return { updated: 0 }

  let totalUpdated = 0

  for (const link of links) {
    if (!link.sync_token) continue

    const { events, nextSyncToken } = await fetchGoogleEvents({
      accessToken,
      calendarId: link.google_calendar_id,
      syncToken: link.sync_token,
    })

    // After initial import, ALL modes only listen for invites from others
    const filteredEvents = link.sync_mode === 'migrate_listen' && !link.initial_import_done
      ? events
      : events.filter(isInviteFromOthers)

    // Handle cancelled events (deletions)
    const cancelled = events.filter((e) => e.status === 'cancelled')
    if (cancelled.length > 0) {
      const cancelledIds = cancelled.map((e) => e.id)
      await supabase.from('events')
        .delete()
        .eq('user_id', userId)
        .in('google_event_id', cancelledIds)
    }

    // Upsert new/updated events
    const mapped = filteredEvents
      .filter((e) => e.status !== 'cancelled')
      .map((e) => mapGoogleEvent(e, link.calendar_container_id, link.category_id ?? link.calendar_container_id))
      .filter(Boolean) as Record<string, unknown>[]

    if (mapped.length > 0) {
      for (const evt of mapped) {
        evt.user_id = userId
      }
      await supabase.from('events').upsert(
        mapped,
        { onConflict: 'user_id,google_event_id' }
      )
    }

    // Update sync token
    if (nextSyncToken) {
      await supabase.from('google_calendar_links').update({
        sync_token: nextSyncToken,
        last_synced_at: new Date().toISOString(),
      }).eq('id', link.id)
    }

    totalUpdated += mapped.length + cancelled.length
  }

  return { updated: totalUpdated }
}

// --- Handler ---

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const userId = await getUserId(req)
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()
    const { action } = body

    let result: unknown
    switch (action) {
      case 'initial_import':
        result = await initialImport(
          userId,
          body.googleCalendarId,
          body.syncMode,
          body.calendarContainerId,
          body.categoryId ?? body.calendarContainerId,
        )
        break
      case 'poll':
        result = await poll(userId)
        break
      default:
        throw new Error(`Unknown action: ${action}`)
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
