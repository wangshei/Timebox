/**
 * Share & Invite Edge Function
 *
 * Endpoints:
 *   POST /share-invite { action: 'create_share', scope, scopeId, displayName, emails[], includeExisting, pushToGoogle }
 *     → Create a new calendar share and invite members.
 *
 *   POST /share-invite { action: 'add_member', shareId, email, pushToGoogle }
 *     → Add a member to an existing share.
 *
 *   POST /share-invite { action: 'remove_member', shareId, memberId }
 *     → Remove a member from a share.
 *
 *   POST /share-invite { action: 'respond', token, status: 'accepted'|'declined' }
 *     → Accept or decline a share invite (works without auth for non-users).
 *
 *   POST /share-invite { action: 'my_shares' }
 *     → List shares the current user owns.
 *
 *   POST /share-invite { action: 'shared_with_me' }
 *     → List shares the current user is a member of.
 *
 * Env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APP_URL
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const APP_URL = Deno.env.get('APP_URL') ?? 'https://timeboxing.club'

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

function generateToken(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

async function getUserName(userId: string): Promise<string> {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('user_preferences')
    .select('user_name')
    .eq('user_id', userId)
    .single()
  return data?.user_name ?? 'A Timebox user'
}

// --- Create Share ---

async function createShare(userId: string, body: Record<string, unknown>) {
  const supabase = getSupabaseAdmin()
  const { scope, scopeId, displayName, emails, includeExisting, pushToGoogle } = body

  if (!scope || !scopeId || !emails || !Array.isArray(emails)) {
    throw new Error('Missing required fields: scope, scopeId, emails')
  }

  // Create the share
  const shareData: Record<string, unknown> = {
    owner_id: userId,
    scope,
    display_name: displayName ?? null,
    include_existing: includeExisting ?? true,
    push_to_google: pushToGoogle ?? true,
  }
  if (scope === 'calendar') shareData.calendar_container_id = scopeId
  else if (scope === 'category') shareData.category_id = scopeId
  else if (scope === 'tag') shareData.tag_id = scopeId
  else if (scope === 'event') shareData.event_id = scopeId

  const { data: share, error: shareError } = await supabase
    .from('calendar_shares')
    .insert(shareData)
    .select()
    .single()

  if (shareError) throw new Error(`Failed to create share: ${shareError.message}`)

  // Add members
  const members = (emails as string[]).map((email: string) => ({
    share_id: share.id,
    email: email.toLowerCase(),
    push_to_google: pushToGoogle ?? true,
    token: generateToken(),
  }))

  const { data: insertedMembers, error: memberError } = await supabase
    .from('share_members')
    .insert(members)
    .select()

  if (memberError) throw new Error(`Failed to add members: ${memberError.message}`)

  // Check if any members are existing Timebox users
  for (const member of insertedMembers ?? []) {
    const { data: existingUser } = await supabase
      .from('auth.users' as string)
      .select('id')
      .eq('email', member.email)
      .single()

    if (existingUser) {
      await supabase
        .from('share_members')
        .update({ user_id: existingUser.id })
        .eq('id', member.id)
    }
  }

  // TODO: Send invite emails to non-users with the event page link
  // For now, log the invite tokens
  const senderName = await getUserName(userId)
  const inviteLinks = (insertedMembers ?? []).map((m: Record<string, unknown>) => ({
    email: m.email,
    link: `${APP_URL}/invite/${m.token}`,
  }))

  return {
    shareId: share.id,
    memberCount: (insertedMembers ?? []).length,
    inviteLinks,
    senderName,
  }
}

// --- Add Member ---

async function addMember(userId: string, body: Record<string, unknown>) {
  const supabase = getSupabaseAdmin()
  const { shareId, email, pushToGoogle } = body

  // Verify ownership
  const { data: share } = await supabase
    .from('calendar_shares')
    .select('id')
    .eq('id', shareId)
    .eq('owner_id', userId)
    .single()

  if (!share) throw new Error('Share not found or not owned by user')

  const { data: member, error } = await supabase
    .from('share_members')
    .insert({
      share_id: shareId,
      email: (email as string).toLowerCase(),
      push_to_google: pushToGoogle ?? true,
      token: generateToken(),
    })
    .select()
    .single()

  if (error) throw new Error(`Failed to add member: ${error.message}`)
  return { memberId: member.id, token: member.token }
}

// --- Remove Member ---

async function removeMember(userId: string, body: Record<string, unknown>) {
  const supabase = getSupabaseAdmin()
  const { shareId, memberId } = body

  // Verify ownership
  const { data: share } = await supabase
    .from('calendar_shares')
    .select('id')
    .eq('id', shareId)
    .eq('owner_id', userId)
    .single()

  if (!share) throw new Error('Share not found or not owned by user')

  await supabase.from('share_members').delete().eq('id', memberId).eq('share_id', shareId)
  return { success: true }
}

// --- Respond to invite (no auth required) ---

async function respondToInvite(body: Record<string, unknown>) {
  const supabase = getSupabaseAdmin()
  const { token, status } = body

  if (!token || !['accepted', 'declined'].includes(status as string)) {
    throw new Error('Invalid token or status')
  }

  const { data: member, error } = await supabase
    .from('share_members')
    .update({
      status,
      responded_at: new Date().toISOString(),
    })
    .eq('token', token)
    .select()
    .single()

  if (error || !member) throw new Error('Invalid invite token')
  return { success: true, status: member.status }
}

// --- My Shares ---

async function myShares(userId: string) {
  const supabase = getSupabaseAdmin()
  const { data: shares } = await supabase
    .from('calendar_shares')
    .select('*, share_members(*)')
    .eq('owner_id', userId)

  return { shares: shares ?? [] }
}

// --- Shared With Me ---

async function sharedWithMe(userId: string) {
  const supabase = getSupabaseAdmin()

  // Find memberships by user_id
  const { data: memberships } = await supabase
    .from('share_members')
    .select('*, calendar_shares(*)')
    .eq('user_id', userId)
    .eq('status', 'accepted')

  return { shares: memberships ?? [] }
}

// --- Handler ---

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { action } = body

    // respond action doesn't need auth
    if (action === 'respond') {
      const result = await respondToInvite(body)
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const userId = await getUserId(req)
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let result: unknown
    switch (action) {
      case 'create_share':
        result = await createShare(userId, body)
        break
      case 'add_member':
        result = await addMember(userId, body)
        break
      case 'remove_member':
        result = await removeMember(userId, body)
        break
      case 'my_shares':
        result = await myShares(userId)
        break
      case 'shared_with_me':
        result = await sharedWithMe(userId)
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
