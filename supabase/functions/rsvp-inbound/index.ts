/**
 * RSVP Inbound Webhook
 *
 * Receives the METHOD:REPLY calendar emails that Gmail/Outlook/Apple send back to the
 * organizer address when a guest accepts/declines an invite, parses the .ics reply, and
 * records each guest's response on the event so every participant sees it (in-app on
 * reload). This is the inbound half of email RSVP sync.
 *
 * Setup (done once by the operator — see docs/RSVP_INBOUND_SETUP.md):
 *   1. Configure an inbound address on your Resend domain (MX records) e.g. rsvp@yourdomain.
 *   2. Set env RSVP_INBOUND_EMAIL to that address (share-invite uses it as the .ics ORGANIZER
 *      so replies route here) and RSVP_WEBHOOK_SECRET to a random string.
 *   3. Point Resend's inbound webhook at:
 *        https://<project>.functions.supabase.co/rsvp-inbound?secret=<RSVP_WEBHOOK_SECRET>
 *
 * Env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RSVP_WEBHOOK_SECRET
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}

/** Undo RFC 5545 line folding: a line beginning with a space/tab continues the previous. */
function unfoldIcs(raw: string): string[] {
  const rawLines = raw.replace(/\r\n/g, '\n').split('\n')
  const lines: string[] = []
  for (const line of rawLines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1)
    } else {
      lines.push(line)
    }
  }
  return lines
}

interface ParsedReply {
  eventId: string
  email: string
  partstat: string   // ACCEPTED | DECLINED | TENTATIVE
}

/** Parse a METHOD:REPLY VCALENDAR: pull the event UID and the responder's PARTSTAT+email. */
function parseIcsReply(ics: string): ParsedReply | null {
  const lines = unfoldIcs(ics)
  const isReply = lines.some((l) => /^METHOD:REPLY/i.test(l))
  if (!isReply) return null

  let uid = ''
  let email = ''
  let partstat = ''
  for (const line of lines) {
    if (/^UID:/i.test(line)) {
      uid = line.slice(line.indexOf(':') + 1).trim()
    } else if (/^ATTENDEE/i.test(line)) {
      // ATTENDEE;...;PARTSTAT=ACCEPTED;...:mailto:someone@example.com
      const mailtoMatch = line.match(/mailto:([^;>\s]+)\s*$/i)
      const partstatMatch = line.match(/PARTSTAT=([A-Z-]+)/i)
      if (mailtoMatch) email = mailtoMatch[1].trim()
      if (partstatMatch) partstat = partstatMatch[1].toUpperCase()
    }
  }

  if (!uid || !email || !partstat) return null
  // Our UIDs are `${eventId}@timeboxing.club`; the eventId is the part before '@'.
  const eventId = uid.split('@')[0]
  if (!eventId) return null
  return { eventId, email: email.toLowerCase(), partstat }
}

/** Map an iCalendar PARTSTAT to our stored responseStatus + share_members.status. */
function mapStatus(partstat: string): { responseStatus: string; memberStatus: string | null } {
  switch (partstat) {
    case 'ACCEPTED': return { responseStatus: 'accepted', memberStatus: 'accepted' }
    case 'DECLINED': return { responseStatus: 'declined', memberStatus: 'declined' }
    case 'TENTATIVE': return { responseStatus: 'tentative', memberStatus: null }
    default: return { responseStatus: 'needsAction', memberStatus: null }
  }
}

/** Collect candidate strings from a Resend inbound payload that might contain the .ics. */
function collectCalendarCandidates(body: any): string[] {
  const out: string[] = []
  const data = body?.data ?? body
  const push = (v: unknown) => { if (typeof v === 'string' && v.includes('BEGIN:VCALENDAR')) out.push(v) }

  // Plain text / html bodies sometimes carry the calendar part inline.
  push(data?.text)
  push(data?.html)
  push(data?.raw)
  push(body?.text)
  push(body?.html)

  // Attachments: base64 or utf-8 .ics files.
  const attachments = data?.attachments ?? body?.attachments ?? []
  if (Array.isArray(attachments)) {
    for (const att of attachments) {
      const ct = (att?.content_type ?? att?.contentType ?? '').toString().toLowerCase()
      const name = (att?.filename ?? att?.name ?? '').toString().toLowerCase()
      const isCal = ct.includes('text/calendar') || name.endsWith('.ics')
      const content = att?.content ?? att?.data
      if (typeof content !== 'string') continue
      // Try raw first, then base64-decode.
      if (content.includes('BEGIN:VCALENDAR')) { out.push(content); continue }
      try {
        const decoded = decodeURIComponent(escape(atob(content)))
        if (decoded.includes('BEGIN:VCALENDAR')) out.push(decoded)
        else if (isCal) out.push(decoded)
      } catch { /* not base64 */ }
    }
  }
  return out
}

async function recordRsvp(reply: ParsedReply): Promise<boolean> {
  const supabase = getSupabaseAdmin()
  const { responseStatus, memberStatus } = mapStatus(reply.partstat)

  // 1. Update the event's attendee list (events.attendees jsonb) so the organizer and any
  //    Timebox participants see the response on reload.
  const { data: ev } = await supabase
    .from('events')
    .select('id, attendees')
    .eq('id', reply.eventId)
    .maybeSingle()

  let matched = false
  if (ev) {
    const attendees: Array<Record<string, unknown>> = Array.isArray(ev.attendees) ? ev.attendees : []
    const updated = attendees.map((a) => {
      if (typeof a.email === 'string' && a.email.toLowerCase() === reply.email) {
        matched = true
        return { ...a, responseStatus }
      }
      return a
    })
    // If the responder wasn't already listed, add them (defensive).
    if (!matched) updated.push({ email: reply.email, responseStatus })
    await supabase.from('events').update({ attendees: updated }).eq('id', reply.eventId)
  }

  // 2. Update the share membership status (accepted/declined) if a share exists.
  if (memberStatus) {
    const { data: share } = await supabase
      .from('calendar_shares')
      .select('id')
      .eq('scope', 'event')
      .eq('event_id', reply.eventId)
      .limit(1)
      .maybeSingle()
    if (share) {
      await supabase
        .from('share_members')
        .update({ status: memberStatus })
        .eq('share_id', share.id)
        .eq('email', reply.email)
    }
  }

  return !!ev
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  // Simple shared-secret auth: the webhook URL carries ?secret=... matching the env.
  const expected = Deno.env.get('RSVP_WEBHOOK_SECRET')
  const provided = new URL(req.url).searchParams.get('secret')
  if (expected && provided !== expected) {
    return new Response('Unauthorized', { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    // Some providers post the raw MIME as text/plain.
    const text = await req.text().catch(() => '')
    body = { raw: text }
  }

  try {
    const candidates = collectCalendarCandidates(body)
    let handled = 0
    for (const ics of candidates) {
      const reply = parseIcsReply(ics)
      if (!reply) continue
      const ok = await recordRsvp(reply)
      if (ok) handled++
      // A reply email carries a single VCALENDAR; stop after the first successful parse.
      break
    }
    return new Response(JSON.stringify({ ok: true, handled }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[rsvp-inbound] Failed:', err)
    // Return 200 so the provider doesn't infinitely retry on a bad payload.
    return new Response(JSON.stringify({ ok: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
