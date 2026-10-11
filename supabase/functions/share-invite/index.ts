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
 *   POST /share-invite { action: 'cancel_share', eventId, event:{title,start,end}, emails?, seriesId?, senderName? }
 *     → Send METHOD:CANCEL .ics to invitees and revoke the event's share.
 *
 *   create_share / resend_invite / add_member / notify_event_update also accept optional
 *   seriesId and event.{rrule, until, location} to send recurring invites (RRULE in the .ics).
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

// --- Security helpers (B-24 / B-32) ---

/** HTML-escape a user-provided value before interpolating into an email template. */
function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Strip CR/LF so a value can't inject headers/lines (subjects, ICS properties). */
function oneLine(v: unknown): string {
  return String(v ?? '').replace(/[\r\n]+/g, ' ').trim()
}

// Best-effort per-user rate limiting (per function instance; resets on cold start).
const RATE_WINDOW_MS = 60 * 60 * 1000
const RATE_MAX_EMAILS = 100       // emails per user per hour
const MAX_RECIPIENTS_PER_CALL = 25
const rateBuckets = new Map<string, number[]>()

function consumeEmailQuota(userId: string, count: number) {
  if (count > MAX_RECIPIENTS_PER_CALL) {
    throw new Error(`Too many recipients (max ${MAX_RECIPIENTS_PER_CALL} per request)`)
  }
  const now = Date.now()
  const recent = (rateBuckets.get(userId) ?? []).filter((t) => now - t < RATE_WINDOW_MS)
  if (recent.length + count > RATE_MAX_EMAILS) {
    throw new Error('Rate limit exceeded: too many invitation emails sent recently. Try again later.')
  }
  for (let i = 0; i < count; i++) recent.push(now)
  rateBuckets.set(userId, recent)
}

const EMAIL_RE = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/
function cleanEmails(list: unknown): string[] {
  if (!Array.isArray(list)) return []
  const out = new Set<string>()
  for (const e of list) {
    const v = String(e ?? '').trim().toLowerCase()
    if (v && v.length <= 254 && EMAIL_RE.test(v)) out.add(v)
  }
  return [...out]
}

const SCOPE_TABLE: Record<string, string> = {
  calendar: 'calendar_containers',
  category: 'categories',
  tag: 'tags',
  event: 'events',
}

/** Throws unless the JWT caller owns the row (events / calendars / categories / tags). */
async function assertOwnsScope(userId: string, scope: string, scopeId: string) {
  const table = SCOPE_TABLE[scope]
  if (!table) throw new Error(`Invalid scope: ${scope}`)
  const supabase = getSupabaseAdmin()
  const { data } = await supabase.from(table).select('id').eq('id', scopeId).eq('user_id', userId).maybeSingle()
  if (!data) throw new Error('Not found or not owned by you')
}

/** Look up an auth user id by email across ALL pages, case-insensitively (B-56). */
async function buildUserEmailIndex(): Promise<Map<string, string>> {
  const supabase = getSupabaseAdmin()
  const idx = new Map<string, string>()
  try {
    for (let page = 1; page <= 50; page++) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
      if (error) break
      const users = data?.users ?? []
      for (const u of users) if (u.email) idx.set(u.email.toLowerCase(), u.id)
      if (users.length < 1000) break
    }
  } catch { /* admin API unavailable */ }
  return idx
}

// --- Email via Resend ---

function inviteEmailHtml(senderNameRaw: string, shareNameRaw: string, inviteLinkRaw: string, isEvent = false, gcalUrlRaw = ''): string {
  const senderName = esc(senderNameRaw)
  const shareName = esc(shareNameRaw)
  const inviteLink = esc(inviteLinkRaw)
  const gcalUrl = esc(gcalUrlRaw)
  const introLine = isEvent
    ? `<strong>${senderName}</strong> invited you to <strong>"${shareName}"</strong>.`
    : `<strong>${senderName}</strong> shared <strong>"${shareName}"</strong> with you on The Timeboxing Club.`
  const subLine = isEvent
    ? `Add it to your calendar below, or accept in Timebox.`
    : `You'll see their events on your calendar. Accept to get started.`
  // For event invites, a Google Calendar "add event" button (pre-filled → one click Save)
  // is the most reliable way to land the event on the recipient's calendar.
  const gcalButton = (isEvent && gcalUrl)
    ? `<a href="${gcalUrl}" target="_blank" style="display:inline-block;background-color:#8DA286;color:#FFFFFF;font-size:15px;font-weight:600;padding:12px 32px;border-radius:10px;text-decoration:none;margin:0 0 12px;">Add to Google Calendar</a><br/>`
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
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1C1C1E;">You're invited!</h1>
      <p style="margin:0;font-size:15px;color:#636366;line-height:1.5;">
        ${introLine}
      </p>
    </td></tr>
    <tr><td style="padding:8px 32px 24px;text-align:center;">
      <p style="margin:0 0 20px;font-size:14px;color:#8E8E93;line-height:1.5;">
        ${subLine}
      </p>
      ${gcalButton}
      <a href="${inviteLink}" style="display:inline-block;background-color:${isEvent ? 'transparent' : '#8DA286'};color:${isEvent ? '#8DA286' : '#FFFFFF'};font-size:15px;font-weight:600;padding:12px 32px;border-radius:10px;text-decoration:none;${isEvent ? 'border:1px solid #8DA286;' : ''}">
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

/** Fold a content line to ≤75 chars per RFC 5545 §3.1 (continuation lines start with a
 *  space). Long unfolded lines can make strict parsers drop the whole property. */
function foldIcsLine(line: string): string {
  if (line.length <= 75) return line
  const chunks = [line.slice(0, 75)]
  for (let i = 75; i < line.length; i += 74) chunks.push(' ' + line.slice(i, i + 74))
  return chunks.join('\r\n')
}

/** Join ICS content lines, folding each to the 75-char limit. */
function assembleIcs(lines: string[]): string {
  return lines.map(foldIcsLine).join('\r\n')
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

/** The .ics ORGANIZER address. When RSVP_INBOUND_EMAIL is configured, use it so guests'
 *  calendar RSVP replies route to the inbound address (→ rsvp-inbound webhook). Otherwise
 *  fall back to the From address (RSVP capture simply won't happen). */
function organizerAddress(fromEmail: string): string {
  return (Deno.env.get('RSVP_INBOUND_EMAIL') || '').trim() || parseFromAddress(fromEmail)
}

/** A monotonically increasing ICS SEQUENCE (seconds since epoch). Each edit produces a
 *  strictly higher value than the last, so updates/cancels supersede the original invite
 *  (SEQUENCE 0) and each other in calendar clients. */
function nowSequence(): number {
  return Math.floor(new Date().getTime() / 1000)
}

/** Build a Google Calendar "add event" template URL. Clicking it opens Google Calendar
 *  with the event pre-filled — the recipient just clicks Save. This is the most reliable
 *  way to land on someone's Google Calendar (no OAuth, no .ics parsing quirks). */
function googleCalendarUrl(p: { title: string; start: string; end: string; description?: string }): string {
  const dates = `${toIcsUtc(p.start)}/${toIcsUtc(p.end)}`
  const params = new URLSearchParams({ action: 'TEMPLATE', text: p.title, dates })
  if (p.description) params.set('details', p.description)
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

interface IcsInvite {
  uid: string
  title: string
  start: string   // ISO datetime
  end: string     // ISO datetime
  description?: string
  organizerName: string
  attendeeEmail: string       // the recipient of this particular email
  attendeeEmails?: string[]   // the FULL guest list, so each participant sees the others
  location?: string
  rrule?: string              // e.g. "FREQ=WEEKLY;BYDAY=MO" (no "RRULE:" prefix needed)
  until?: string              // ISO datetime; appended as UNTIL= when rrule has none
}

/** Validate/normalise a client-supplied RRULE into a safe ICS RRULE value, or ''. */
function sanitizeRrule(rrule?: string, until?: string): string {
  if (!rrule) return ''
  let r = oneLine(rrule).replace(/^RRULE:/i, '').toUpperCase()
  if (!/^[A-Z0-9=;,+\-]+$/.test(r) || !/(^|;)FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)(;|$)/.test(r) || r.length > 200) return ''
  if (until && !/(^|;)(UNTIL|COUNT)=/.test(r)) {
    const d = new Date(until)
    if (!isNaN(d.getTime())) r += `;UNTIL=${toIcsUtc(d.toISOString())}`
  }
  return r
}

function buildInviteIcs(p: IcsInvite, organizerAddr: string, sequence = 0): string {
  // ORGANIZER is the service's own send address (matching the email From), NOT the
  // Timebox user's real email. If we used a Google-Workspace user's address here,
  // Gmail tries to load the event from Google Calendar's servers (where it doesn't
  // exist, since we never used the write API) and shows "Unable to load event".
  // The organizer's display name still shows the user via CN.
  //
  // SEQUENCE lets a later REQUEST with the same UID UPDATE the guest's existing
  // calendar entry in place (0 = original invite; >0 = edit).
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
    ...(p.location ? [`LOCATION:${escapeIcsText(p.location)}`] : []),
    ...(sanitizeRrule(p.rrule, p.until) ? [`RRULE:${sanitizeRrule(p.rrule, p.until)}`] : []),
    `ORGANIZER;CN=${escapeIcsText(p.organizerName)}:mailto:${organizerAddr}`,
    // List every guest so each participant can see the others on their calendar.
    ...(() => {
      const guests = (p.attendeeEmails && p.attendeeEmails.length > 0) ? p.attendeeEmails : [p.attendeeEmail]
      const seen = new Set<string>()
      return guests
        .filter((e) => e && !seen.has(e.toLowerCase()) && seen.add(e.toLowerCase()))
        .map((email) => `ATTENDEE;CN=${email};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${email}`)
    })(),
    `SEQUENCE:${sequence}`,
    'STATUS:CONFIRMED',
    'TRANSP:OPAQUE',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return assembleIcs(lines)
}

/** Build a METHOD:CANCEL calendar object so the event is removed from the guest's
 *  calendar. Must reuse the invite's UID and use a higher SEQUENCE than the REQUEST. */
function buildCancelIcs(p: IcsInvite, organizerAddr: string, sequence: number): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//The Timeboxing Club//Invite//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:CANCEL',
    'BEGIN:VEVENT',
    `UID:${p.uid}`,
    `DTSTAMP:${toIcsUtc(new Date().toISOString())}`,
    `DTSTART:${toIcsUtc(p.start)}`,
    `DTEND:${toIcsUtc(p.end)}`,
    `SUMMARY:${escapeIcsText(p.title)}`,
    `ORGANIZER;CN=${escapeIcsText(p.organizerName)}:mailto:${organizerAddr}`,
    `ATTENDEE;CN=${p.attendeeEmail};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=FALSE:mailto:${p.attendeeEmail}`,
    `SEQUENCE:${sequence}`,
    'STATUS:CANCELLED',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return assembleIcs(lines)
}

/** Base64-encode a UTF-8 string (Resend attachments expect base64 content). */
function base64Utf8(s: string): string {
  return btoa(unescape(encodeURIComponent(s)))
}

/** Email a removed guest a cancellation so the event leaves their calendar. */
async function sendCancelEmail(recipientEmail: string, senderName: string, ics: IcsInvite, cancelVerb = 'removed you from') {
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  const fromEmail = Deno.env.get('FROM_EMAIL') || 'The Timeboxing Club <onboarding@resend.dev>'
  if (!resendApiKey) {
    console.warn('[share-invite] No RESEND_API_KEY — skipping cancel email')
    return
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendApiKey}` },
    body: JSON.stringify({
      from: fromEmail,
      to: recipientEmail,
      subject: `Cancelled: "${oneLine(ics.title)}"`,
      html: `<p style="font-family:system-ui,sans-serif;font-size:15px;color:#1C1C1E;">${esc(senderName)} ${cancelVerb} <strong>"${esc(ics.title)}"</strong>. It has been removed from your calendar.</p>`,
      attachments: [{
        filename: 'cancel.ics',
        content: base64Utf8(buildCancelIcs(ics, organizerAddress(fromEmail), nowSequence())),
        content_type: 'text/calendar; method=CANCEL; charset=utf-8',
      }],
    }),
  })
  if (!res.ok) {
    const b = await res.text()
    console.error(`[share-invite] Resend cancel error: ${b}`)
  }
}

async function sendInviteEmail(recipientEmail: string, senderName: string, shareName: string, inviteToken: string, ics?: IcsInvite) {
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  const fromEmail = Deno.env.get('FROM_EMAIL') || 'The Timeboxing Club <onboarding@resend.dev>'

  if (!resendApiKey) {
    console.warn('[share-invite] No RESEND_API_KEY — skipping email')
    return
  }

  const inviteLink = `${APP_URL}/invite/${inviteToken}`
  const gcalUrl = ics ? googleCalendarUrl({ title: ics.title, start: ics.start, end: ics.end, description: ics.description }) : ''
  const html = inviteEmailHtml(senderName, shareName, inviteLink, !!ics, gcalUrl)

  const payload: Record<string, unknown> = {
    from: fromEmail,
    to: recipientEmail,
    subject: ics
      ? `${oneLine(senderName)} invited you to "${oneLine(shareName)}"`
      : `${oneLine(senderName)} shared "${oneLine(shareName)}" with you on Timeboxing Club`,
    html,
  }
  if (ics) {
    // Attach the calendar invite so it lands in the recipient's calendar (Gmail RSVP UI).
    payload.attachments = [{
      filename: 'invite.ics',
      content: base64Utf8(buildInviteIcs(ics, organizerAddress(fromEmail))),
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
  linkName = esc(linkName); bookerName = esc(bookerName); bookerEmail = esc(bookerEmail)
  date = esc(date); startTime = esc(startTime); endTime = esc(endTime)
  if (notes) notes = esc(notes)
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
    ? `Booking confirmed: ${oneLine(linkName)}`
    : `New booking: ${oneLine(bookerName)} booked "${oneLine(linkName)}"`
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

function eventUpdateEmailHtml(senderNameRaw: string, eventTitleRaw: string, changesRaw: string): string {
  const senderName = esc(senderNameRaw)
  const eventTitle = esc(eventTitleRaw)
  const changes = esc(changesRaw)
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

async function sendEventUpdateEmail(recipientEmail: string, senderName: string, eventTitle: string, changes: string, ics?: IcsInvite) {
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  const fromEmail = Deno.env.get('FROM_EMAIL') || 'The Timeboxing Club <onboarding@resend.dev>'

  if (!resendApiKey) {
    console.warn('[share-invite] No RESEND_API_KEY — skipping notification email')
    return
  }

  const html = eventUpdateEmailHtml(senderName, eventTitle, changes)

  const payload: Record<string, unknown> = {
    from: fromEmail,
    to: recipientEmail,
    subject: `${oneLine(senderName)} updated "${oneLine(eventTitle)}"`,
    html,
  }
  if (ics) {
    // Attach a revised REQUEST .ics (same UID, higher SEQUENCE) so the guest's existing
    // calendar entry updates in place instead of creating a duplicate.
    payload.attachments = [{
      filename: 'invite.ics',
      content: base64Utf8(buildInviteIcs(ics, organizerAddress(fromEmail), nowSequence())),
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


type EventInfo = {
  start?: string; end?: string; title?: string; description?: string; location?: string
  attendeeEmails?: string[]; rrule?: string; until?: string
}

/** Event uid: series id (shared by all occurrences of a recurring invite) or event id. */
function icsUid(seriesId: unknown, eventId: unknown): string {
  return `${String(seriesId || eventId)}@timeboxing.club`
}

/** Fetch (or create) the single share row for (owner, scope, scopeId). Race-safe via the
 *  unique indexes added in 20261012_calendar_shares_unique.sql. */
async function getOrCreateShare(
  userId: string, scope: string, scopeId: string, fields: Record<string, unknown>,
) {
  const supabase = getSupabaseAdmin()
  const col = scope === 'calendar' ? 'calendar_container_id' : scope === 'category' ? 'category_id' : scope === 'tag' ? 'tag_id' : 'event_id'
  const find = async () => {
    const { data } = await supabase.from('calendar_shares').select('*')
      .eq('owner_id', userId).eq('scope', scope).eq(col, scopeId)
      .order('created_at', { ascending: true }).limit(1).maybeSingle()
    return data
  }
  const existing = await find()
  if (existing) {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (fields.display_name) patch.display_name = fields.display_name
    await supabase.from('calendar_shares').update(patch).eq('id', existing.id)
    return existing
  }
  const { data: created, error } = await supabase.from('calendar_shares')
    .insert({ owner_id: userId, scope, [col]: scopeId, ...fields }).select().single()
  if (error) {
    const raced = await find() // unique violation from a concurrent call
    if (raced) return raced
    throw new Error(`Failed to create share: ${error.message}`)
  }
  return created
}

/** Upsert members by (share_id,email), keeping existing tokens so links stay stable.
 *  Returns every requested member row (existing + new) plus which were newly created. */
async function upsertMembers(shareId: string, emails: string[], pushToGoogle: boolean) {
  const supabase = getSupabaseAdmin()
  const { data: existing } = await supabase.from('share_members').select('*')
    .eq('share_id', shareId).in('email', emails)
  const have = new Map((existing ?? []).map((m: Record<string, unknown>) => [m.email as string, m]))
  const toInsert = emails.filter((e) => !have.has(e)).map((email) => ({
    share_id: shareId, email, push_to_google: pushToGoogle, token: generateToken(),
  }))
  let inserted: Record<string, unknown>[] = []
  if (toInsert.length > 0) {
    const { data, error } = await supabase.from('share_members').insert(toInsert).select()
    if (error) throw new Error(`Failed to add members: ${error.message}`)
    inserted = data ?? []
    // Link new members to existing Timebox accounts (all pages, case-insensitive).
    const idx = await buildUserEmailIndex()
    for (const m of inserted) {
      const uid = idx.get(String(m.email).toLowerCase())
      if (uid) {
        await supabase.from('share_members').update({ user_id: uid }).eq('id', m.id as string)
        m.user_id = uid
      }
    }
  }
  const members = emails.map((e) => have.get(e) ?? inserted.find((m) => m.email === e)).filter(Boolean) as Record<string, unknown>[]
  return { members, createdCount: inserted.length }
}

async function notifyEventUpdate(userId: string, body: Record<string, unknown>) {
  const { eventTitle, attendeeEmails, changes, senderName: providedName, eventId, event, seriesId } = body

  if (!eventId || !eventTitle || !Array.isArray(attendeeEmails)) {
    throw new Error('Missing required fields: eventId, eventTitle, attendeeEmails')
  }
  await assertOwnsScope(userId, 'event', String(eventId))

  // Only email people actually on this event (its attendees column or share members).
  const supabase = getSupabaseAdmin()
  const allowed = new Set<string>()
  const { data: ev } = await supabase.from('events').select('attendees').eq('id', String(eventId)).maybeSingle()
  for (const a of Array.isArray(ev?.attendees) ? ev!.attendees : []) {
    if (a && typeof a.email === 'string') allowed.add(a.email.toLowerCase())
  }
  const { data: shares } = await supabase.from('calendar_shares').select('id')
    .eq('owner_id', userId).eq('scope', 'event').eq('event_id', String(eventId))
  const shareIds = (shares ?? []).map((x: { id: string }) => x.id)
  if (shareIds.length > 0) {
    const { data: ms } = await supabase.from('share_members').select('email').in('share_id', shareIds)
    for (const m of ms ?? []) allowed.add(String(m.email).toLowerCase())
  }
  const recipients = cleanEmails(attendeeEmails).filter((e) => allowed.has(e))
  consumeEmailQuota(userId, recipients.length)

  const senderName = oneLine(providedName) || await getUserName(userId)
  const changesText = (changes as string) || 'Event details have been updated.'

  const evt = event as EventInfo | undefined
  const canPushIcs = !!evt?.start && !!evt?.end

  const results = await Promise.allSettled(recipients.map((email) =>
    sendEventUpdateEmail(email, senderName, String(eventTitle), changesText,
      canPushIcs
        ? {
            uid: icsUid(seriesId, eventId),
            title: String(eventTitle),
            start: evt!.start as string,
            end: evt!.end as string,
            description: evt?.description,
            location: evt?.location,
            rrule: evt?.rrule,
            until: evt?.until,
            organizerName: senderName,
            attendeeEmail: email,
            attendeeEmails: recipients,
          }
        : undefined,
    )
  ))
  return { success: true, notified: results.length }
}

// --- Create Share ---

async function createShare(userId: string, body: Record<string, unknown>) {
  const supabase = getSupabaseAdmin()
  const { scope, scopeId, displayName, emails, includeExisting, pushToGoogle, event, seriesId, senderName: senderNameFromClient } = body

  if (!scope || !scopeId || !Array.isArray(emails)) {
    throw new Error('Missing required fields: scope, scopeId, emails')
  }
  await assertOwnsScope(userId, String(scope), String(scopeId))
  const guestList = cleanEmails(emails)
  if (guestList.length === 0) throw new Error('No valid email addresses')
  consumeEmailQuota(userId, guestList.length)

  const eventInfo = event as EventInfo | undefined
  const hasIcs = scope === 'event' && !!eventInfo?.start && !!eventInfo?.end
  const allGuests = cleanEmails(eventInfo?.attendeeEmails).length > 0 ? cleanEmails(eventInfo?.attendeeEmails) : guestList

  // B-05: reuse the existing share for this (owner, scope, target) instead of inserting a duplicate.
  const share = await getOrCreateShare(userId, String(scope), String(scopeId), {
    display_name: (displayName as string) ?? null,
    include_existing: includeExisting ?? true,
    push_to_google: pushToGoogle ?? true,
  })
  const { members } = await upsertMembers(share.id, guestList, (pushToGoogle as boolean) ?? true)

  const clientName = typeof senderNameFromClient === 'string' ? oneLine(senderNameFromClient) : ''
  const senderName = clientName || await getUserName(userId)
  const inviteLinks = members.map((m) => ({ email: m.email, link: `${APP_URL}/invite/${m.token}` }))

  await Promise.allSettled(members.map((m) =>
    sendInviteEmail(
      m.email as string,
      senderName,
      (displayName as string) ?? 'a calendar',
      m.token as string,
      hasIcs
        ? {
            uid: icsUid(seriesId, scopeId),
            title: (eventInfo?.title as string) || (displayName as string) || 'Event',
            start: eventInfo!.start as string,
            end: eventInfo!.end as string,
            description: eventInfo?.description,
            location: eventInfo?.location,
            rrule: eventInfo?.rrule,
            until: eventInfo?.until,
            organizerName: senderName,
            attendeeEmail: m.email as string,
            attendeeEmails: allGuests,
          }
        : undefined,
    )
  ))

  return { shareId: share.id, memberCount: members.length, inviteLinks, senderName }
}

// --- Resend Invite ---
// Re-send the invite email (+ .ics) to people already invited, without creating duplicate
// shares. Reuses the event's existing share/member tokens, creating any that are missing.
async function resendInvite(userId: string, body: Record<string, unknown>) {
  const { eventId, emails, event, seriesId, senderName: senderNameFromClient } = body

  if (!eventId || !Array.isArray(emails) || emails.length === 0) {
    throw new Error('Missing required fields: eventId, emails')
  }
  await assertOwnsScope(userId, 'event', String(eventId))
  const guestList = cleanEmails(emails)
  consumeEmailQuota(userId, guestList.length)

  const eventInfo = event as EventInfo | undefined
  const hasIcs = !!eventInfo?.start && !!eventInfo?.end
  const displayName = (eventInfo?.title as string) || 'Event'
  const allGuests = cleanEmails(eventInfo?.attendeeEmails).length > 0 ? cleanEmails(eventInfo?.attendeeEmails) : guestList

  const share = await getOrCreateShare(userId, 'event', String(eventId), { display_name: displayName })
  const { members } = await upsertMembers(share.id, guestList, true)

  const clientName = typeof senderNameFromClient === 'string' ? oneLine(senderNameFromClient) : ''
  const senderName = clientName || await getUserName(userId)

  let sent = 0
  for (const member of members) {
    await sendInviteEmail(
      member.email as string,
      senderName,
      displayName,
      member.token as string,
      hasIcs
        ? {
            uid: icsUid(seriesId, eventId),
            title: displayName,
            start: eventInfo!.start as string,
            end: eventInfo!.end as string,
            description: eventInfo?.description,
            location: eventInfo?.location,
            rrule: eventInfo?.rrule,
            until: eventInfo?.until,
            organizerName: senderName,
            attendeeEmail: member.email as string,
            attendeeEmails: allGuests,
          }
        : undefined,
    )
    sent++
  }

  return { success: true, sent }
}

// --- Add Member (B-53: now emails the guest) ---

async function addMember(userId: string, body: Record<string, unknown>) {
  const supabase = getSupabaseAdmin()
  const { shareId, email, pushToGoogle, event, seriesId, senderName: senderNameFromClient } = body

  const { data: share } = await supabase
    .from('calendar_shares')
    .select('id, scope, event_id, display_name')
    .eq('id', shareId)
    .eq('owner_id', userId)
    .maybeSingle()
  if (!share) throw new Error('Share not found or not owned by user')

  const guest = cleanEmails([email])
  if (guest.length === 0) throw new Error('Invalid email address')
  consumeEmailQuota(userId, 1)

  const { members, createdCount } = await upsertMembers(share.id, guest, (pushToGoogle as boolean) ?? true)
  const member = members[0]

  const clientName = typeof senderNameFromClient === 'string' ? oneLine(senderNameFromClient) : ''
  const senderName = clientName || await getUserName(userId)
  const eventInfo = event as EventInfo | undefined
  const hasIcs = share.scope === 'event' && !!eventInfo?.start && !!eventInfo?.end
  await sendInviteEmail(
    guest[0], senderName, share.display_name || eventInfo?.title || 'a calendar', member.token as string,
    hasIcs
      ? {
          uid: icsUid(seriesId, share.event_id),
          title: (eventInfo?.title as string) || share.display_name || 'Event',
          start: eventInfo!.start as string,
          end: eventInfo!.end as string,
          description: eventInfo?.description,
          location: eventInfo?.location,
          rrule: eventInfo?.rrule,
          until: eventInfo?.until,
          organizerName: senderName,
          attendeeEmail: guest[0],
          attendeeEmails: cleanEmails(eventInfo?.attendeeEmails).length > 0 ? cleanEmails(eventInfo?.attendeeEmails) : guest,
        }
      : undefined,
  )
  return { memberId: member.id, token: member.token, alreadyMember: createdCount === 0, emailed: true }
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

/** Remove guests from an event by email: revoke their share membership and (if event
 *  timing is provided) email them a cancellation so it leaves their calendar. */
async function removeAttendees(userId: string, body: Record<string, unknown>) {
  const supabase = getSupabaseAdmin()
  const { eventId, emails, event, seriesId } = body
  if (!eventId || !Array.isArray(emails) || emails.length === 0) {
    throw new Error('Missing required fields: eventId, emails')
  }
  await assertOwnsScope(userId, 'event', String(eventId))
  const lowered = cleanEmails(emails)
  consumeEmailQuota(userId, lowered.length)

  const { data: shares } = await supabase
    .from('calendar_shares')
    .select('id')
    .eq('owner_id', userId)
    .eq('scope', 'event')
    .eq('event_id', String(eventId))

  const shareIds = (shares ?? []).map((s: { id: string }) => s.id)
  if (shareIds.length > 0) {
    await supabase.from('share_members').delete().in('share_id', shareIds).in('email', lowered)
  }

  const evt = event as { title?: string; start?: string; end?: string } | undefined
  if (evt?.start && evt?.end) {
    const senderName = await getUserName(userId)
    await Promise.allSettled(lowered.map((email) =>
      sendCancelEmail(email, senderName, {
        uid: icsUid(seriesId, eventId),
        title: evt.title || 'Event',
        start: evt.start as string,
        end: evt.end as string,
        organizerName: senderName,
        attendeeEmail: email,
      })
    ))
  }

  return { success: true, removed: lowered.length }
}

/** Cancel an invited event for everyone: send METHOD:CANCEL .ics to all (or the given)
 *  attendees, then revoke the share (members cascade-delete, invite links stop working).
 *  Params: eventId (required), event {title,start,end}, emails? (default: all share
 *  members + events.attendees), seriesId? (UID of a recurring invite), senderName?. */
async function cancelShare(userId: string, body: Record<string, unknown>) {
  const supabase = getSupabaseAdmin()
  const { eventId, event, emails, seriesId, senderName: senderNameFromClient } = body
  if (!eventId) throw new Error('Missing required field: eventId')
  await assertOwnsScope(userId, 'event', String(eventId))

  const { data: shares } = await supabase.from('calendar_shares').select('id')
    .eq('owner_id', userId).eq('scope', 'event').eq('event_id', String(eventId))
  const shareIds = (shares ?? []).map((x: { id: string }) => x.id)

  // Recipients: only people who were actually invited to this event.
  const invited = new Set<string>()
  if (shareIds.length > 0) {
    const { data: ms } = await supabase.from('share_members').select('email').in('share_id', shareIds)
    for (const m of ms ?? []) invited.add(String(m.email).toLowerCase())
  }
  const { data: ev } = await supabase.from('events').select('attendees').eq('id', String(eventId)).maybeSingle()
  for (const a of Array.isArray(ev?.attendees) ? ev!.attendees : []) {
    if (a && typeof a.email === 'string' && !a.self) invited.add(a.email.toLowerCase())
  }
  const requested = Array.isArray(emails) ? cleanEmails(emails) : [...invited]
  const recipients = requested.filter((e) => invited.has(e))
  consumeEmailQuota(userId, recipients.length)

  const evt = event as { title?: string; start?: string; end?: string } | undefined
  let cancelled = 0
  if (evt?.start && evt?.end && recipients.length > 0) {
    const clientName = typeof senderNameFromClient === 'string' ? oneLine(senderNameFromClient) : ''
    const senderName = clientName || await getUserName(userId)
    const results = await Promise.allSettled(recipients.map((email) =>
      sendCancelEmail(email, senderName, {
        uid: icsUid(seriesId, eventId),
        title: evt.title || 'Event',
        start: evt.start as string,
        end: evt.end as string,
        organizerName: senderName,
        attendeeEmail: email,
        attendeeEmails: recipients,
      }, 'cancelled')
    ))
    cancelled = results.filter((r) => r.status === 'fulfilled').length
  }

  // Revoke: only drop the whole share when cancelling everyone; otherwise drop the members.
  if (shareIds.length > 0) {
    if (!Array.isArray(emails)) {
      await supabase.from('calendar_shares').delete().in('id', shareIds).eq('owner_id', userId)
    } else {
      await supabase.from('share_members').delete().in('share_id', shareIds).in('email', recipients)
    }
  }
  return { success: true, cancelled, revokedShares: Array.isArray(emails) ? 0 : shareIds.length }
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
      case 'remove_attendees':
        result = await removeAttendees(userId, body)
        break
      case 'resend_invite':
        result = await resendInvite(userId, body)
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
      case 'cancel_share':
        result = await cancelShare(userId, body)
        break
      case 'send_test_invite': {
        const { email: testEmail, senderName: testSender, shareName: testShare } = body
        const to = cleanEmails([testEmail])
        if (to.length !== 1) throw new Error('Invalid email')
        consumeEmailQuota(userId, 1)
        const testToken = generateToken()
        await sendInviteEmail(to[0], (testSender as string) ?? 'Test User', (testShare as string) ?? 'Test Calendar', testToken)
        result = { success: true, email: to[0] }
        break
      }
      case 'notify_booking':
        consumeEmailQuota(userId, 2)
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
