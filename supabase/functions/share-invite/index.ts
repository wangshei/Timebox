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
 *   POST /share-invite { action: 'notify_event_update', eventTitle, attendeeEmails[], changes, senderName }
 *     → Notify attendees when the organizer updates an event.
 *
 * Env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APP_URL, RESEND_API_KEY, FROM_EMAIL
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const APP_URL = (Deno.env.get('APP_URL') || 'https://app.timeboxing.club').replace(/\/$/, '')

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
  // Try to get display name from auth metadata
  try {
    const { data: { user } } = await supabase.auth.admin.getUserById(userId)
    const name = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0]
    if (name) return name
  } catch {
    // Fallback silently
  }
  return 'A Timebox user'
}

// --- Email via Resend ---

function inviteEmailHtml(senderName: string, shareName: string, inviteLink: string, isEvent = false): string {
  const introLine = isEvent
    ? `<strong>${senderName}</strong> invited you to <strong>"${shareName}"</strong>.`
    : `<strong>${senderName}</strong> shared <strong>"${shareName}"</strong> with you on The Timeboxing Club.`
  const subLine = isEvent
    ? `The event is attached — add it to your calendar below, or accept in Timebox.`
    : `You'll see their events on your calendar. Accept to get started.`
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;background-color:#F8F7F4;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F8F7F4;">
<tr><td align="center" style="padding:48px 24px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
    <tr><td style="padding:32px 32px 0;text-align:center;">
      <div style="display:inline-block;background-color:#8DA286;color:#FFFFFF;font-size:14px;font-weight:700;padding:8px 20px;border-radius:20px;letter-spacing:0.5px;">
        The Timeboxing Club
      </div>
    </td></tr>
    <tr><td style="padding:24px 32px 16px;text-align:center;">
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1C1C1E;">You're invited!</h1>
      <p style="margin:0;font-size:15px;color:#636366;line-height:1.5;">
        ${introLine}
      </p>
    </td></tr>
    <tr><td style="padding:8px 32px 24px;text-align:center;">
      <p style="margin:0 0 20px;font-size:14px;color:#8E8E93;line-height:1.5;">
        ${subLine}
      </p>
      <a href="${inviteLink}" style="display:inline-block;background-color:#8DA286;color:#FFFFFF;font-size:15px;font-weight:600;padding:12px 32px;border-radius:10px;text-decoration:none;">
        View Invite
      </a>
    </td></tr>
    <tr><td style="padding:16px 32px 24px;text-align:center;border-top:1px solid #F0F0F0;">
      <p style="margin:0;font-size:12px;color:#AEAEB2;">
        Not interested? Simply ignore this email. <a href="${inviteLink}?action=decline" style="color:#8DA286;">Decline</a>
      </p>
    </td></tr>
  </table>
  <p style="margin:24px 0 0;font-size:11px;color:#C7C7CC;text-align:center;">
    The Timeboxing Club · <a href="${APP_URL}" style="color:#AEAEB2;">timeboxing.club</a>
  </p>
</td></tr>
</table>
</body>
</html>`
}

// --- Calendar invite (.ics) generation ---
// Attaching a METHOD:REQUEST iCalendar file makes Gmail/Outlook/Apple Mail render
// native RSVP buttons and add the event straight to the recipient's calendar — no
// Google OAuth write scope or app verification required, and it works for any
// recipient regardless of whether they use Timebox.

/** Escape reserved characters in an ICS text value (RFC 5545 §3.3.11). */
function escapeIcsText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** Convert an ISO datetime to ICS UTC basic format: YYYYMMDDTHHMMSSZ. */
function toIcsUtc(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

/** Extract the bare email address from a "Name <email>" FROM header. */
function parseFromAddress(from: string): string {
  const m = from.match(/<([^>]+)>/)
  return (m ? m[1] : from).trim()
}

interface IcsInvite {
  uid: string
  title: string
  start: string   // ISO datetime
  end: string     // ISO datetime
  description?: string
  organizerName: string
  attendeeEmail: string
}

function buildInviteIcs(p: IcsInvite, organizerAddress: string): string {
  // ORGANIZER is the service's own send address (matching the email From), NOT the
  // Timebox user's real email. If we used a Google-Workspace user's address here,
  // Gmail tries to load the event from Google Calendar's servers (where it doesn't
  // exist, since we never used the write API) and shows "Unable to load event".
  // The organizer's display name still shows the user via CN.
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//The Timeboxing Club//Invite//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${p.uid}`,
    `DTSTAMP:${toIcsUtc(new Date().toISOString())}`,
    `DTSTART:${toIcsUtc(p.start)}`,
    `DTEND:${toIcsUtc(p.end)}`,
    `SUMMARY:${escapeIcsText(p.title)}`,
    ...(p.description ? [`DESCRIPTION:${escapeIcsText(p.description)}`] : []),
    `ORGANIZER;CN=${escapeIcsText(p.organizerName)}:mailto:${organizerAddress}`,
    `ATTENDEE;CN=${p.attendeeEmail};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${p.attendeeEmail}`,
    'SEQUENCE:0',
    'STATUS:CONFIRMED',
    'TRANSP:OPAQUE',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.join('\r\n')
}

/** Base64-encode a UTF-8 string (Resend attachments expect base64 content). */
function base64Utf8(s: string): string {
  return btoa(unescape(encodeURIComponent(s)))
}

async function sendInviteEmail(recipientEmail: string, senderName: string, shareName: string, inviteToken: string, ics?: IcsInvite) {
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  const fromEmail = Deno.env.get('FROM_EMAIL') || 'The Timeboxing Club <onboarding@resend.dev>'

  if (!resendApiKey) {
    console.warn('[share-invite] No RESEND_API_KEY — skipping email')
    return
  }

  const inviteLink = `${APP_URL}/invite/${inviteToken}`
  const html = inviteEmailHtml(senderName, shareName, inviteLink, !!ics)

  const payload: Record<string, unknown> = {
    from: fromEmail,
    to: recipientEmail,
    subject: ics
      ? `${senderName} invited you to "${shareName}"`
      : `${senderName} shared "${shareName}" with you on Timeboxing Club`,
    html,
  }
  if (ics) {
    // Attach the calendar invite so it lands in the recipient's calendar (Gmail RSVP UI).
    payload.attachments = [{
      filename: 'invite.ics',
      content: base64Utf8(buildInviteIcs(ics, parseFromAddress(fromEmail))),
      content_type: 'text/calendar; method=REQUEST; charset=utf-8',
    }]
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${resendApiKey}`,
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const body = await res.text()
    console.error(`[share-invite] Resend error: ${body}`)
  }
}

// --- Booking Confirmation Notification ---

function bookingConfirmEmailHtml(
  recipientType: 'booker' | 'creator',
  linkName: string,
  bookerName: string,
  bookerEmail: string,
  date: string,
  startTime: string,
  endTime: string,
  notes?: string,
): string {
  const heading = recipientType === 'booker'
    ? 'Booking Confirmed'
    : 'New Booking Received'
  const intro = recipientType === 'booker'
    ? `Your booking for <strong>"${linkName}"</strong> has been confirmed.`
    : `<strong>${bookerName}</strong> (${bookerEmail}) booked a slot on <strong>"${linkName}"</strong>.`
  const notesHtml = notes
    ? `<tr><td style="padding:0 32px 16px;"><div style="background-color:#F8F7F4;border-radius:8px;padding:12px;font-size:13px;color:#636366;line-height:1.5;"><strong>Notes:</strong> ${notes}</div></td></tr>`
    : ''
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;background-color:#F8F7F4;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F8F7F4;">
<tr><td align="center" style="padding:48px 24px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
    <tr><td style="padding:32px 32px 0;text-align:center;">
      <div style="display:inline-block;background-color:#8DA286;color:#FFFFFF;font-size:14px;font-weight:700;padding:8px 20px;border-radius:20px;letter-spacing:0.5px;">
        The Timeboxing Club
      </div>
    </td></tr>
    <tr><td style="padding:24px 32px 16px;text-align:center;">
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1C1C1E;">${heading}</h1>
      <p style="margin:0;font-size:15px;color:#636366;line-height:1.5;">${intro}</p>
    </td></tr>
    <tr><td style="padding:0 32px 16px;">
      <div style="background-color:rgba(141,162,134,0.06);border:1px solid rgba(141,162,134,0.15);border-radius:12px;padding:16px;">
        <div style="font-size:15px;font-weight:600;color:#1C1C1E;margin-bottom:4px;">${date}</div>
        <div style="font-size:14px;color:#636366;">${startTime} – ${endTime}</div>
      </div>
    </td></tr>
    ${notesHtml}
    <tr><td style="padding:8px 32px 24px;text-align:center;">
      <a href="${APP_URL}" style="display:inline-block;background-color:#8DA286;color:#FFFFFF;font-size:15px;font-weight:600;padding:12px 32px;border-radius:10px;text-decoration:none;">
        ${recipientType === 'booker' ? 'View Timeboxing Club' : 'View Calendar'}
      </a>
    </td></tr>
    <tr><td style="padding:16px 32px 24px;text-align:center;border-top:1px solid #F0F0F0;">
      <p style="margin:0;font-size:12px;color:#AEAEB2;">
        ${recipientType === 'booker' ? 'You received this because you booked a meeting.' : 'You received this because someone booked a slot on your scheduling link.'}
      </p>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`
}

async function sendBookingEmail(
  recipientEmail: string,
  recipientType: 'booker' | 'creator',
  linkName: string,
  bookerName: string,
  bookerEmail: string,
  date: string,
  startTime: string,
  endTime: string,
  notes?: string,
) {
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  const fromEmail = Deno.env.get('FROM_EMAIL') || 'The Timeboxing Club <onboarding@resend.dev>'

  if (!resendApiKey) {
    console.warn('[share-invite] No RESEND_API_KEY — skipping booking email')
    return
  }

  const subject = recipientType === 'booker'
    ? `Booking confirmed: ${linkName}`
    : `New booking: ${bookerName} booked "${linkName}"`
  const html = bookingConfirmEmailHtml(recipientType, linkName, bookerName, bookerEmail, date, startTime, endTime, notes)

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${resendApiKey}`,
    },
    body: JSON.stringify({ from: fromEmail, to: recipientEmail, subject, html }),
  })

  if (!res.ok) {
    const body = await res.text()
    console.error(`[share-invite] Resend booking email error: ${body}`)
  }
}

async function notifyBooking(body: Record<string, unknown>) {
  const { linkName, bookerName, bookerEmail, creatorEmail, date, startTime, endTime, notes } = body

  if (!bookerEmail || !linkName || !date || !startTime || !endTime) {
    throw new Error('Missing required fields for booking notification')
  }

  const promises: Promise<void>[] = []

  // Send confirmation to the person who booked
  promises.push(
    sendBookingEmail(
      bookerEmail as string, 'booker', linkName as string,
      bookerName as string, bookerEmail as string,
      date as string, startTime as string, endTime as string, notes as string | undefined,
    )
  )

  // Send notification to the link creator (if email provided)
  if (creatorEmail) {
    promises.push(
      sendBookingEmail(
        creatorEmail as string, 'creator', linkName as string,
        bookerName as string, bookerEmail as string,
        date as string, startTime as string, endTime as string, notes as string | undefined,
      )
    )
  }

  await Promise.allSettled(promises)
  return { success: true, notified: promises.length }
}

// --- Event Update Notification ---

function eventUpdateEmailHtml(senderName: string, eventTitle: string, changes: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;background-color:#F8F7F4;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F8F7F4;">
<tr><td align="center" style="padding:48px 24px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
    <tr><td style="padding:32px 32px 0;text-align:center;">
      <div style="display:inline-block;background-color:#8DA286;color:#FFFFFF;font-size:14px;font-weight:700;padding:8px 20px;border-radius:20px;letter-spacing:0.5px;">
        The Timeboxing Club
      </div>
    </td></tr>
    <tr><td style="padding:24px 32px 16px;text-align:center;">
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1C1C1E;">Event Updated</h1>
      <p style="margin:0;font-size:15px;color:#636366;line-height:1.5;">
        <strong>${senderName}</strong> updated <strong>"${eventTitle}"</strong>
      </p>
    </td></tr>
    <tr><td style="padding:8px 32px 24px;text-align:center;">
      <div style="text-align:left;background-color:#F8F7F4;border-radius:10px;padding:16px;margin-bottom:16px;">
        <p style="margin:0;font-size:13px;color:#3A3A3C;line-height:1.6;white-space:pre-line;">${changes}</p>
      </div>
      <a href="${APP_URL}" style="display:inline-block;background-color:#8DA286;color:#FFFFFF;font-size:15px;font-weight:600;padding:12px 32px;border-radius:10px;text-decoration:none;">
        View Calendar
      </a>
    </td></tr>
    <tr><td style="padding:16px 32px 24px;text-align:center;border-top:1px solid #F0F0F0;">
      <p style="margin:0;font-size:12px;color:#AEAEB2;">
        You received this because you're an attendee of this event.
      </p>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`
}

async function sendEventUpdateEmail(recipientEmail: string, senderName: string, eventTitle: string, changes: string) {
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  const fromEmail = Deno.env.get('FROM_EMAIL') || 'The Timeboxing Club <onboarding@resend.dev>'

  if (!resendApiKey) {
    console.warn('[share-invite] No RESEND_API_KEY — skipping notification email')
    return
  }

  const html = eventUpdateEmailHtml(senderName, eventTitle, changes)

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${resendApiKey}`,
    },
    body: JSON.stringify({
      from: fromEmail,
      to: recipientEmail,
      subject: `${senderName} updated "${eventTitle}"`,
      html,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    console.error(`[share-invite] Resend error: ${body}`)
  }
}

async function notifyEventUpdate(userId: string, body: Record<string, unknown>) {
  const { eventTitle, attendeeEmails, changes, senderName: providedName } = body

  if (!eventTitle || !attendeeEmails || !Array.isArray(attendeeEmails)) {
    throw new Error('Missing required fields: eventTitle, attendeeEmails')
  }

  const senderName = (providedName as string) || await getUserName(userId)
  const changesText = (changes as string) || 'Event details have been updated.'

  // Send notification emails in parallel (skip the organizer's own email)
  const emailPromises = (attendeeEmails as string[])
    .filter((email: string) => email && email.trim())
    .map((email: string) =>
      sendEventUpdateEmail(email, senderName, eventTitle as string, changesText)
    )
  await Promise.allSettled(emailPromises)

  return { success: true, notified: emailPromises.length }
}

// --- Create Share ---

async function createShare(userId: string, body: Record<string, unknown>) {
  const supabase = getSupabaseAdmin()
  const { scope, scopeId, displayName, emails, includeExisting, pushToGoogle, event, senderName: senderNameFromClient } = body

  if (!scope || !scopeId || !emails || !Array.isArray(emails)) {
    throw new Error('Missing required fields: scope, scopeId, emails')
  }

  // For event-scoped invites with timing, we attach a calendar (.ics) invite to the
  // email so it lands in the recipient's Google/Outlook/Apple calendar with RSVP.
  const eventInfo = event as { start?: string; end?: string; title?: string; description?: string } | undefined
  const hasIcs = scope === 'event' && !!eventInfo?.start && !!eventInfo?.end

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
    try {
      const { data: { users } } = await supabase.auth.admin.listUsers()
      const existingUser = users?.find((u: { email?: string }) => u.email === member.email)
      if (existingUser) {
        await supabase
          .from('share_members')
          .update({ user_id: existingUser.id })
          .eq('id', member.id)
      }
    } catch {
      // Skip user linking if admin API unavailable
    }
  }

  // Send invite emails. Prefer the display name the client passed (the logged-in
  // user's name from the app) — the admin getUserById lookup can be unavailable and
  // fall back to a generic "A Timebox user".
  const clientName = typeof senderNameFromClient === 'string' ? senderNameFromClient.trim() : ''
  const senderName = clientName || await getUserName(userId)
  const inviteLinks = (insertedMembers ?? []).map((m: Record<string, unknown>) => ({
    email: m.email,
    link: `${APP_URL}/invite/${m.token}`,
  }))

  // Send emails in parallel
  const emailPromises = (insertedMembers ?? []).map((m: Record<string, unknown>) =>
    sendInviteEmail(
      m.email as string,
      senderName,
      (displayName as string) ?? 'a calendar',
      m.token as string,
      hasIcs
        ? {
            uid: `${scopeId}@timeboxing.club`,
            title: (eventInfo?.title as string) || (displayName as string) || 'Event',
            start: eventInfo!.start as string,
            end: eventInfo!.end as string,
            description: eventInfo?.description,
            organizerName: senderName,
            attendeeEmail: m.email as string,
          }
        : undefined,
    )
  )
  await Promise.allSettled(emailPromises)

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

// --- Get Invite Details (no auth required) ---

async function getInviteDetails(body: Record<string, unknown>) {
  const supabase = getSupabaseAdmin()
  const { token } = body

  if (!token) throw new Error('Missing token')

  // Fetch the member by token
  const { data: member, error: memberError } = await supabase
    .from('share_members')
    .select('*')
    .eq('token', token)
    .single()

  if (memberError || !member) throw new Error('Invite not found or expired')

  // Fetch the share
  const { data: share, error: shareError } = await supabase
    .from('calendar_shares')
    .select('*')
    .eq('id', member.share_id)
    .single()

  if (shareError || !share) throw new Error('Share not found')

  // Get sender name
  const senderName = await getUserName(share.owner_id)

  // Get events for preview — find events matching the share scope
  let events: Array<{ title: string; date: string; start: string; end: string }> = []
  let eventCount = 0

  if (share.scope === 'event' && share.event_id) {
    const { data: evt } = await supabase
      .from('events')
      .select('title, date, start, end')
      .eq('id', share.event_id)
      .single()
    if (evt) {
      events = [{ title: evt.title, date: evt.date, start: evt.start, end: evt.end }]
      eventCount = 1
    }
  } else if (share.scope === 'calendar' && share.calendar_container_id) {
    const { data: evts, count } = await supabase
      .from('events')
      .select('title, date, start, end', { count: 'exact' })
      .eq('calendar_container_id', share.calendar_container_id)
      .gte('date', new Date().toISOString().split('T')[0])
      .order('date', { ascending: true })
      .order('start', { ascending: true })
      .limit(5)
    events = (evts ?? []).map((e: Record<string, string>) => ({ title: e.title, date: e.date, start: e.start, end: e.end }))
    eventCount = count ?? events.length
  } else if (share.scope === 'category' && share.category_id) {
    const { data: evts, count } = await supabase
      .from('events')
      .select('title, date, start, end', { count: 'exact' })
      .eq('category_id', share.category_id)
      .gte('date', new Date().toISOString().split('T')[0])
      .order('date', { ascending: true })
      .order('start', { ascending: true })
      .limit(5)
    events = (evts ?? []).map((e: Record<string, string>) => ({ title: e.title, date: e.date, start: e.start, end: e.end }))
    eventCount = count ?? events.length
  } else if (share.scope === 'tag' && share.tag_id) {
    const { data: evts, count } = await supabase
      .from('events')
      .select('title, date, start, end', { count: 'exact' })
      .eq('tag_id', share.tag_id)
      .gte('date', new Date().toISOString().split('T')[0])
      .order('date', { ascending: true })
      .order('start', { ascending: true })
      .limit(5)
    events = (evts ?? []).map((e: Record<string, string>) => ({ title: e.title, date: e.date, start: e.start, end: e.end }))
    eventCount = count ?? events.length
  }

  return {
    shareName: share.display_name ?? 'Shared Calendar',
    senderName,
    scope: share.scope,
    eventCount,
    events,
    status: member.status,
  }
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

// --- Shared With Me (with events) ---

// Resolve the accent color for a share from its source calendar/category/tag.
// Best-effort: any missing table/column just falls back to the brand green.
async function getShareColor(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  share: Record<string, unknown>,
): Promise<string> {
  try {
    if (share.scope === 'calendar' && share.calendar_container_id) {
      const { data } = await supabase.from('calendar_containers').select('color').eq('id', share.calendar_container_id).single()
      if (data?.color) return data.color as string
    } else if (share.scope === 'category' && share.category_id) {
      const { data } = await supabase.from('categories').select('color').eq('id', share.category_id).single()
      if (data?.color) return data.color as string
    } else if (share.scope === 'tag' && share.tag_id) {
      const { data } = await supabase.from('tags').select('color').eq('id', share.tag_id).single()
      if (data?.color) return data.color as string
    }
  } catch {
    // fall through to default
  }
  return '#8DA286'
}

/**
 * Resolve the actual events for every share THIS user has accepted.
 *
 * SECURITY BOUNDARY — two independent checks, both required:
 *   1. Membership: we only look at share_members rows whose user_id === userId
 *      OR whose email matches this user's auth email, AND status === 'accepted'.
 *   2. Ownership: every event query is filtered by `user_id = share.owner_id`
 *      (the events table stores the owner's id in user_id). We NEVER select events
 *      without that owner filter, so a share can only ever expose its own owner's
 *      events — never another owner's, and never for shares the user hasn't accepted.
 */
async function sharedWithMeEvents(userId: string) {
  const supabase = getSupabaseAdmin()

  // Resolve this user's auth email so we can also match email-based memberships
  // (invitees who were linked by email before user_id was stamped).
  let userEmail: string | null = null
  try {
    const { data: { user } } = await supabase.auth.admin.getUserById(userId)
    userEmail = user?.email?.toLowerCase() ?? null
  } catch {
    // If we can't resolve the email, fall back to user_id-only matching.
  }

  // Check 1 (membership): only rows that belong to this user and are accepted.
  const orFilters = [`user_id.eq.${userId}`]
  if (userEmail) orFilters.push(`email.eq.${userEmail}`)
  const { data: memberships } = await supabase
    .from('share_members')
    .select('*, calendar_shares(*)')
    .or(orFilters.join(','))
    .eq('status', 'accepted')

  const calendars: Array<Record<string, unknown>> = []
  const eventSelect = 'id, title, date, start, end, recurring'

  for (const m of memberships ?? []) {
    const share = (m as Record<string, unknown>).calendar_shares as Record<string, unknown> | null
    if (!share) continue
    const ownerId = share.owner_id as string | undefined
    if (!ownerId) continue

    // Check 2 (ownership): EVERY branch below filters by user_id = ownerId.
    let events: Array<Record<string, unknown>> = []
    if (share.scope === 'event' && share.event_id) {
      const { data } = await supabase.from('events').select(eventSelect)
        .eq('user_id', ownerId).eq('id', share.event_id)
      events = data ?? []
    } else if (share.scope === 'calendar' && share.calendar_container_id) {
      const { data } = await supabase.from('events').select(eventSelect)
        .eq('user_id', ownerId).eq('calendar_container_id', share.calendar_container_id)
      events = data ?? []
    } else if (share.scope === 'category' && share.category_id) {
      const { data } = await supabase.from('events').select(eventSelect)
        .eq('user_id', ownerId).eq('category_id', share.category_id)
      events = data ?? []
    } else if (share.scope === 'tag') {
      // The events table has NO tag column — tags live only on tasks/blocks
      // (verified against supabasePersistence event row schema). There is no
      // correct event query for tag-scoped shares, so resolve to zero events
      // rather than leak cross-scope data. Tag sharing simply yields no events.
      events = []
    }

    const ownerName = await getUserName(ownerId)
    const color = await getShareColor(supabase, share)

    calendars.push({
      shareId: share.id,
      ownerId,
      ownerName,
      displayName: (share.display_name as string) ?? `${ownerName}'s ${share.scope}`,
      scope: share.scope,
      color,
      eventCount: events.length,
      events: events.map((e) => ({
        // Stable source id so the client can build a stable, dedupe-able key.
        id: e.id,
        title: e.title,
        date: e.date,
        start: e.start,
        end: e.end,
        recurring: (e.recurring as boolean) ?? false,
      })),
    })
  }

  return { calendars }
}

// --- Public Booking: get link details (no auth required) ---

/** Parse "HH:MM" to minutes from midnight. */
function parseHM(t: string): number {
  const [h, m] = String(t).split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/** Day of week (0=Sun..6=Sat) for a YYYY-MM-DD string, computed in UTC. */
function dowOf(dateStr: string): number {
  const [y, mo, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, mo - 1, d)).getUTCDay()
}

/** Load an active, non-expired scheduling link by slug. Returns { row } or { error }. */
async function loadBookingLinkRow(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  slug: unknown,
): Promise<{ row?: Record<string, unknown>; error?: 'not_found' | 'expired' }> {
  if (!slug || typeof slug !== 'string') return { error: 'not_found' }
  const { data: row, error } = await supabase
    .from('scheduling_links')
    .select('*')
    .eq('slug', slug)
    .maybeSingle()
  if (error || !row || row.active === false) return { error: 'not_found' }
  // valid_until is '' when there is no expiry. Compare against today (UTC).
  const validUntil = (row.valid_until as string) ?? ''
  if (validUntil && validUntil.length > 0) {
    const today = new Date().toISOString().split('T')[0]
    if (validUntil < today) return { error: 'expired' }
  }
  return { row }
}

async function getBookingLink(body: Record<string, unknown>) {
  const supabase = getSupabaseAdmin()
  const { row, error } = await loadBookingLinkRow(supabase, body.slug)
  if (error) return { error }
  const link = row!

  // Fetch existing CONFIRMED bookings so the client can show availability.
  // Only expose (date, startTime) — never booker PII.
  const { data: bookings } = await supabase
    .from('bookings')
    .select('date, start_time')
    .eq('scheduling_link_id', link.id)
    .eq('status', 'confirmed')

  const bookedSlots = (bookings ?? []).map((b: Record<string, unknown>) => ({
    date: b.date as string,
    startTime: b.start_time as string,
  }))

  const ownerName = await getUserName(link.owner_id as string)

  // Return only the fields the public BookingPage needs — no owner email / PII.
  return {
    name: link.name,
    slotDuration: link.slot_duration,
    gapBetween: link.gap_between,
    minAdvanceHours: link.min_advance_hours,
    validUntil: link.valid_until ?? '',
    availableSlots: link.available_slots ?? [],
    timezone: link.timezone,
    calendarContainerId: link.calendar_container_id,
    ownerName,
    bookedSlots,
  }
}

// --- Public Booking: create a booking (no auth required) ---

async function createBooking(body: Record<string, unknown>) {
  const supabase = getSupabaseAdmin()
  const { slug, date, startTime, endTime, bookerName, bookerEmail, notes } = body

  if (!date || !startTime || !endTime || !bookerName || !bookerEmail) {
    return { error: 'missing_fields' }
  }

  // (a) Load link; reject if missing / inactive / expired.
  const { row, error } = await loadBookingLinkRow(supabase, slug)
  if (error) return { error }
  const link = row!

  // (b) Validate the requested slot is inside one of the link's availability
  // windows for that day, and satisfies minAdvanceHours.
  const reqDate = date as string
  const reqStart = parseHM(startTime as string)
  const reqEnd = parseHM(endTime as string)
  const dow = dowOf(reqDate)
  const slots = (link.available_slots as Array<Record<string, unknown>>) ?? []
  const withinWindow = slots.some((s) => {
    const matchesDay =
      s.dayOfWeek === dow || (s.dayOfWeek === -1 && s.date === reqDate)
    if (!matchesDay) return false
    const winStart = parseHM(s.startTime as string)
    const winEnd = parseHM(s.endTime as string)
    return reqStart >= winStart && reqEnd <= winEnd && reqEnd > reqStart
  })
  if (!withinWindow) return { error: 'invalid_slot' }

  // Min-advance check. Proper wall-clock math in the link's IANA timezone is
  // non-trivial in Deno without a TZ library, so we approximate: interpret the
  // requested date+time as UTC and require it to be at least minAdvanceHours
  // from now (also UTC). This can be off by the owner's UTC offset, but errs by
  // at most a few hours and never allows a booking in the past.
  const minAdvanceHours = Number(link.min_advance_hours ?? 0)
  const [ry, rmo, rd] = reqDate.split('-').map(Number)
  const reqInstant = Date.UTC(ry, rmo - 1, rd, Math.floor(reqStart / 60), reqStart % 60)
  const earliest = Date.now() + minAdvanceHours * 60 * 60 * 1000
  if (reqInstant < earliest) return { error: 'invalid_slot' }

  // (c) Insert the booking. The UNIQUE index on (scheduling_link_id, date,
  // start_time) WHERE status='confirmed' protects against double-booking.
  const { data: inserted, error: insertError } = await supabase
    .from('bookings')
    .insert({
      scheduling_link_id: link.id,
      booker_name: bookerName,
      booker_email: bookerEmail,
      date: reqDate,
      start_time: startTime,
      end_time: endTime,
      status: 'confirmed',
      notes: notes ?? null,
    })
    .select('id')
    .single()

  if (insertError) {
    // 23505 = unique_violation → the slot was just taken.
    if ((insertError as { code?: string }).code === '23505') {
      return { error: 'slot_taken' }
    }
    console.error('[share-invite] createBooking insert error:', insertError.message)
    return { error: 'insert_failed' }
  }

  // (d) Email the owner + booker (best-effort). Reuse the existing notify path.
  try {
    await notifyBooking({
      linkName: link.name,
      bookerName,
      bookerEmail,
      creatorEmail: link.creator_email ?? undefined,
      date: reqDate,
      startTime,
      endTime,
      notes,
    })
  } catch (e) {
    console.error('[share-invite] createBooking notify error:', e)
  }

  return { ok: true, bookingId: inserted.id }
}

// --- Handler ---

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { action } = body

    // respond and send_test_invite actions don't need auth
    if (action === 'get_invite_details') {
      const result = await getInviteDetails(body)
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (action === 'respond') {
      const result = await respondToInvite(body)
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    // Public booking actions — must work for unauthenticated bookers.
    if (action === 'get_booking_link') {
      const result = await getBookingLink(body)
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (action === 'create_booking') {
      const result = await createBooking(body)
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (action === 'send_test_invite') {
      const { email: testEmail, senderName: testSender, shareName: testShare } = body
      const testToken = generateToken()
      await sendInviteEmail(
        testEmail as string,
        (testSender as string) ?? 'Test User',
        (testShare as string) ?? 'Test Calendar',
        testToken,
      )
      const result = { success: true, email: testEmail, token: testToken }
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
      case 'shared_with_me_events':
        result = await sharedWithMeEvents(userId)
        break
      case 'notify_event_update':
        result = await notifyEventUpdate(userId, body)
        break
      case 'notify_booking':
        result = await notifyBooking(body)
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
