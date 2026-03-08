/**
 * Google Calendar OAuth2 Edge Function
 *
 * Endpoints:
 *   POST /gcal-auth { action: 'get_auth_url' }
 *     → Returns the Google OAuth consent URL for the user to authorize.
 *
 *   POST /gcal-auth { action: 'exchange_code', code: string }
 *     → Exchanges the authorization code for tokens, stores them in Supabase.
 *
 *   POST /gcal-auth { action: 'list_calendars' }
 *     → Lists the user's Google Calendars so they can pick which to import.
 *
 *   POST /gcal-auth { action: 'disconnect' }
 *     → Revokes tokens and removes the Google Calendar link.
 *
 * Env vars required:
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI,
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') ?? ''
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? ''
const GOOGLE_REDIRECT_URI = Deno.env.get('GOOGLE_REDIRECT_URI') ?? ''
const SCOPES = 'https://www.googleapis.com/auth/calendar.readonly'

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

// --- OAuth URL ---

function getAuthUrl(userId: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state: userId, // pass user ID through OAuth flow
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

// --- Token Exchange ---

async function exchangeCode(code: string, userId: string, redirectUri: string) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Token exchange failed: ${err}`)
  }
  const tokens = await res.json()

  // Store tokens in Supabase
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('google_tokens').upsert({
    user_id: userId,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    scope: tokens.scope,
  }, { onConflict: 'user_id' })

  if (error) throw new Error(`Failed to store tokens: ${error.message}`)
  return { success: true }
}

// --- Refresh Token ---

async function refreshAccessToken(userId: string): Promise<string> {
  const supabase = getSupabaseAdmin()
  const { data: tokenRow } = await supabase
    .from('google_tokens')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (!tokenRow?.refresh_token) throw new Error('No refresh token found')

  // Check if current token is still valid
  if (tokenRow.expires_at && new Date(tokenRow.expires_at) > new Date()) {
    return tokenRow.access_token
  }

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

// --- List Calendars ---

async function listCalendars(userId: string) {
  const accessToken = await refreshAccessToken(userId)
  const res = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error('Failed to fetch calendars')
  const data = await res.json()
  return (data.items ?? []).map((cal: Record<string, unknown>) => ({
    id: cal.id,
    summary: cal.summary,
    description: cal.description,
    backgroundColor: cal.backgroundColor,
    primary: cal.primary ?? false,
    accessRole: cal.accessRole,
  }))
}

// --- Disconnect ---

async function disconnect(userId: string) {
  const supabase = getSupabaseAdmin()
  const { data: tokenRow } = await supabase
    .from('google_tokens')
    .select('access_token')
    .eq('user_id', userId)
    .single()

  // Revoke token with Google
  if (tokenRow?.access_token) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${tokenRow.access_token}`, {
      method: 'POST',
    }).catch(() => {}) // best-effort
  }

  // Delete from DB
  await supabase.from('google_tokens').delete().eq('user_id', userId)
  await supabase.from('google_calendar_links').delete().eq('user_id', userId)

  return { success: true }
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

    const { action, code, redirect_uri } = await req.json()
    // Allow client to pass redirect_uri, fall back to env var
    const effectiveRedirectUri = redirect_uri || GOOGLE_REDIRECT_URI
    if (!effectiveRedirectUri && (action === 'get_auth_url' || action === 'exchange_code')) {
      throw new Error('No redirect_uri configured')
    }

    let result: unknown
    switch (action) {
      case 'get_auth_url':
        result = { url: getAuthUrl(userId, effectiveRedirectUri) }
        break
      case 'exchange_code':
        if (!code) throw new Error('Missing code')
        result = await exchangeCode(code, userId, effectiveRedirectUri)
        break
      case 'list_calendars':
        result = { calendars: await listCalendars(userId) }
        break
      case 'disconnect':
        result = await disconnect(userId)
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
