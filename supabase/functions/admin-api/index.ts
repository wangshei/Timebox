import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  for (const byte of bytes) {
    code += chars[byte % chars.length]
  }
  return code
}

const inviteEmailHtml = (code: string, appUrl: string) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>You're in! Here's your invite code</title>
</head>
<body style="margin:0;padding:0;background-color:#F8F7F4;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F8F7F4;">
    <tr>
      <td align="center" style="padding:48px 24px;">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;">
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <span style="font-size:24px;font-weight:700;color:#1C1C1E;letter-spacing:-0.02em;">The Timeboxing Club</span>
            </td>
          </tr>
          <tr>
            <td style="background-color:#FFFFFF;border-radius:16px;border:1px solid rgba(0,0,0,0.08);box-shadow:0 1px 4px rgba(0,0,0,0.04);padding:40px 32px;">
              <p style="margin:0 0 8px;font-size:18px;font-weight:600;color:#1C1C1E;">You're in!</p>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#636366;">
                A spot just opened up for you at The Timeboxing Club. Use the invite code below to create your account.
              </p>
              <div style="text-align:center;margin:0 0 24px;">
                <span style="display:inline-block;padding:14px 28px;background-color:#F5F4F0;border-radius:10px;font-size:22px;font-weight:700;letter-spacing:0.12em;color:#1C1C1E;font-family:ui-monospace,SFMono-Regular,'SF Mono',Menlo,monospace;">
                  ${code}
                </span>
              </div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${appUrl}" target="_blank"
                       style="display:inline-block;padding:14px 32px;background-color:#8DA387;color:#FFFFFF;font-size:15px;font-weight:600;text-decoration:none;border-radius:10px;line-height:1;">
                      Create Your Account
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#AEAEB2;">
                This code is unique to you and can only be used once.
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-top:24px;">
              <p style="margin:0;font-size:12px;color:#C7C7CC;">The Timeboxing Club — plan your day, own your time.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { action, adminSecret } = body

    // ── Public endpoint: get-config (no admin secret required) ───────────
    if (action === 'get-config') {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      )
      const key = body.key
      if (!key) return json({ error: 'Missing key' }, 400)
      const { data, error } = await supabase
        .from('app_config')
        .select('value')
        .eq('key', key)
        .maybeSingle()
      if (error) return json({ error: error.message }, 500)
      return json({ value: data?.value ?? null })
    }

    // Verify admin secret for all other actions
    const expectedSecret = Deno.env.get('ADMIN_SECRET')
    if (!expectedSecret || adminSecret !== expectedSecret) {
      return json({ error: 'Unauthorized' }, 401)
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // ── get-dashboard-data ─────────────────────────────────────────────────
    if (action === 'get-dashboard-data') {
      const [waitlistRes, codesRes, usersRes, configRes, bugReportsRes, broadcastRes, adminTodoRes, eventsRes, tasksRes, settingsRes] = await Promise.all([
        supabaseAdmin.from('waitlist').select('*').order('created_at', { ascending: false }),
        supabaseAdmin.from('invite_codes').select('*').order('created_at', { ascending: false }),
        supabaseAdmin.auth.admin.listUsers({ perPage: 1000 }),
        supabaseAdmin.from('app_config').select('value').eq('key', 'waitlist_open').maybeSingle(),
        supabaseAdmin.from('bug_reports').select('*').order('created_at', { ascending: false }).limit(50),
        supabaseAdmin.from('app_config').select('value').eq('key', 'broadcast_message').maybeSingle(),
        supabaseAdmin.from('app_config').select('value').eq('key', 'admin_todo').maybeSingle(),
        supabaseAdmin.from('events').select('user_id, recurring, recurrence_series_id').limit(10000),
        supabaseAdmin.from('tasks').select('user_id, status').limit(10000),
        supabaseAdmin.from('user_settings').select('user_id, session_count, session_dates'),
      ])

      if (waitlistRes.error) return json({ error: waitlistRes.error.message }, 500)
      if (codesRes.error) return json({ error: codesRes.error.message }, 500)
      if (usersRes.error) return json({ error: usersRes.error.message }, 500)

      // Default: waitlist closed (invite code required)
      const waitlistOpen = configRes.data?.value === 'true'

      // Log stats query errors for debugging
      const statsErrors: string[] = []
      if (eventsRes.error) statsErrors.push(`events: ${eventsRes.error.message}`)
      if (tasksRes.error) statsErrors.push(`tasks: ${tasksRes.error.message}`)
      if (settingsRes.error) statsErrors.push(`user_settings: ${settingsRes.error.message}`)

      // Build per-user stats
      const userStats: Record<string, { activeDates: number; sessions: number; events: number; tasks: number }> = {}
      const ensure = (uid: string) => {
        if (!userStats[uid]) userStats[uid] = { activeDates: 0, sessions: 0, events: 0, tasks: 0 }
      }

      // Session counts + active dates from user_settings.session_dates
      for (const s of settingsRes.data ?? []) {
        ensure(s.user_id)
        userStats[s.user_id].sessions = s.session_count ?? 0
        const dates: string[] = s.session_dates ?? []
        userStats[s.user_id].activeDates = dates.length
      }

      // Events: dedupe recurring by recurrence_series_id (1 series = 1 event)
      for (const e of eventsRes.data ?? []) {
        ensure(e.user_id)
        if (e.recurring && e.recurrence_series_id) {
          // Track seen series per user to avoid double-counting
          if (!userStats[e.user_id]._seenSeries) (userStats[e.user_id] as any)._seenSeries = new Set()
          if (!(userStats[e.user_id] as any)._seenSeries.has(e.recurrence_series_id)) {
            (userStats[e.user_id] as any)._seenSeries.add(e.recurrence_series_id)
            userStats[e.user_id].events++
          }
        } else {
          userStats[e.user_id].events++
        }
      }

      for (const t of tasksRes.data ?? []) {
        ensure(t.user_id)
        userStats[t.user_id].tasks++
      }

      // Clean up internal tracking and build JSON response
      const userStatsJson: Record<string, { activeDates: number; sessions: number; events: number; tasks: number }> = {}
      for (const [uid, s] of Object.entries(userStats)) {
        userStatsJson[uid] = { activeDates: s.activeDates, sessions: s.sessions, events: s.events, tasks: s.tasks }
      }

      return json({
        waitlist: waitlistRes.data,
        inviteCodes: codesRes.data,
        users: usersRes.data.users,
        waitlistOpen,
        bugReports: bugReportsRes.data ?? [],
        broadcastMessage: broadcastRes.data?.value ?? null,
        adminTodo: adminTodoRes.data?.value ?? '',
        userStats: userStatsJson,
        ...(statsErrors.length ? { statsErrors } : {}),
        statsDebug: {
          eventsCount: (eventsRes.data ?? []).length,
          tasksCount: (tasksRes.data ?? []).length,
          settingsCount: (settingsRes.data ?? []).length,
        },
      })
    }

    // ── create-invite-codes ────────────────────────────────────────────────
    if (action === 'create-invite-codes') {
      const count = body.count || 10
      const codes: string[] = []

      for (let i = 0; i < count; i++) {
        codes.push(generateInviteCode())
      }

      const { error } = await supabaseAdmin
        .from('invite_codes')
        .insert(codes.map(code => ({ code, created_by: 'admin' })))

      if (error) return json({ error: error.message }, 500)
      return json({ success: true, codes })
    }

    // ── send-invites ───────────────────────────────────────────────────────
    if (action === 'send-invites') {
      const { emails } = body
      if (!emails || !Array.isArray(emails) || emails.length === 0) {
        return json({ error: 'Missing emails array' }, 400)
      }

      const resendApiKey = Deno.env.get('RESEND_API_KEY')
      const fromEmail = Deno.env.get('FROM_EMAIL') || 'The Timeboxing Club <onboarding@resend.dev>'
      const appUrl = Deno.env.get('APP_URL') || 'https://app.timeboxing.club'

      if (!resendApiKey) {
        return json({ error: 'RESEND_API_KEY not configured' }, 500)
      }

      const results: { email: string; code: string; success: boolean; error?: string }[] = []

      for (const email of emails) {
        const code = generateInviteCode()
        const normalizedEmail = email.toLowerCase()

        // Insert invite code
        const { error: codeError } = await supabaseAdmin
          .from('invite_codes')
          .insert({ code, email: normalizedEmail, created_by: 'admin' })

        if (codeError) {
          results.push({ email, code, success: false, error: codeError.message })
          continue
        }

        // Update waitlist status
        await supabaseAdmin
          .from('waitlist')
          .update({ status: 'approved', approved_at: new Date().toISOString() })
          .eq('email', normalizedEmail)

        // Send email via Resend
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${resendApiKey}`,
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [normalizedEmail],
            subject: "You're in! Here's your invite code",
            html: inviteEmailHtml(code, appUrl),
          }),
        })

        if (!res.ok) {
          const errBody = await res.text()
          results.push({ email, code, success: false, error: errBody })
        } else {
          results.push({ email, code, success: true })
        }
      }

      return json({ success: true, results })
    }

    // ── set-config ───────────────────────────────────────────────────────
    if (action === 'set-config') {
      const { key, value } = body
      if (!key) return json({ error: 'Missing key' }, 400)

      const { error } = await supabaseAdmin
        .from('app_config')
        .upsert({ key, value: String(value), updated_at: new Date().toISOString() }, { onConflict: 'key' })

      if (error) return json({ error: error.message }, 500)
      return json({ success: true })
    }

    // ── get-admin-todo ────────────────────────────────────────────────────
    if (action === 'get-admin-todo') {
      const { data, error } = await supabaseAdmin
        .from('app_config')
        .select('value')
        .eq('key', 'admin_todo')
        .maybeSingle()
      if (error) return json({ error: error.message }, 500)
      return json({ todo: data?.value ?? '' })
    }

    // ── save-admin-todo ─────────────────────────────────────────────────
    if (action === 'save-admin-todo') {
      const { todo } = body
      if (typeof todo !== 'string') return json({ error: 'Missing todo string' }, 400)
      const { error } = await supabaseAdmin
        .from('app_config')
        .upsert({ key: 'admin_todo', value: todo, updated_at: new Date().toISOString() }, { onConflict: 'key' })
      if (error) return json({ error: error.message }, 500)
      return json({ success: true })
    }

    // ── get-bug-reports ──────────────────────────────────────────────────
    if (action === 'get-bug-reports') {
      const { data, error } = await supabaseAdmin
        .from('bug_reports')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)

      if (error) return json({ error: error.message }, 500)
      return json({ bugReports: data })
    }

    // ── get-user-stats ──────────────────────────────────────────────────
    if (action === 'get-user-stats') {
      const [eventsRes2, tasksRes2, settingsRes2] = await Promise.all([
        supabaseAdmin.from('events').select('user_id, recurring, recurrence_series_id').limit(10000),
        supabaseAdmin.from('tasks').select('user_id, status').limit(10000),
        supabaseAdmin.from('user_settings').select('user_id, session_count, session_dates'),
      ])

      const stats: Record<string, { activeDates: number; sessions: number; events: number; tasks: number }> = {}
      const ensure2 = (uid: string) => {
        if (!stats[uid]) stats[uid] = { activeDates: 0, sessions: 0, events: 0, tasks: 0 }
      }

      for (const s of settingsRes2.data ?? []) {
        ensure2(s.user_id)
        stats[s.user_id].sessions = s.session_count ?? 0
        stats[s.user_id].activeDates = (s.session_dates ?? []).length
      }
      for (const e of eventsRes2.data ?? []) {
        ensure2(e.user_id)
        if (e.recurring && e.recurrence_series_id) {
          if (!(stats[e.user_id] as any)._ss) (stats[e.user_id] as any)._ss = new Set()
          if (!(stats[e.user_id] as any)._ss.has(e.recurrence_series_id)) {
            (stats[e.user_id] as any)._ss.add(e.recurrence_series_id)
            stats[e.user_id].events++
          }
        } else {
          stats[e.user_id].events++
        }
      }
      for (const t of tasksRes2.data ?? []) {
        ensure2(t.user_id)
        stats[t.user_id].tasks++
      }

      const result: Record<string, { activeDates: number; sessions: number; events: number; tasks: number }> = {}
      for (const [uid, s] of Object.entries(stats)) {
        result[uid] = { activeDates: s.activeDates, sessions: s.sessions, events: s.events, tasks: s.tasks }
      }

      return json({ userStats: result })
    }

    // ── send-broadcast ──────────────────────────────────────────────────
    if (action === 'send-broadcast') {
      const { message } = body
      if (!message || !message.trim()) return json({ error: 'Missing message' }, 400)

      const payload = JSON.stringify({ text: message.trim(), sentAt: new Date().toISOString() })
      const { error } = await supabaseAdmin
        .from('app_config')
        .upsert({ key: 'broadcast_message', value: payload, updated_at: new Date().toISOString() }, { onConflict: 'key' })

      if (error) return json({ error: error.message }, 500)
      return json({ success: true })
    }

    // ── clear-broadcast ─────────────────────────────────────────────────
    if (action === 'clear-broadcast') {
      const { error } = await supabaseAdmin
        .from('app_config')
        .delete()
        .eq('key', 'broadcast_message')

      if (error) return json({ error: error.message }, 500)
      return json({ success: true })
    }

    // ── resend-confirmation ─────────────────────────────────────────────
    if (action === 'resend-confirmation') {
      const { emails } = body
      if (!emails || !Array.isArray(emails) || emails.length === 0) {
        return json({ error: 'Missing emails array' }, 400)
      }

      const resendApiKey = Deno.env.get('RESEND_API_KEY')
      const fromEmail = Deno.env.get('FROM_EMAIL') || 'The Timeboxing Club <onboarding@resend.dev>'
      const appUrl = Deno.env.get('APP_URL') || 'https://app.timeboxing.club'

      if (!resendApiKey) {
        return json({ error: 'RESEND_API_KEY not configured' }, 500)
      }

      const results: { email: string; success: boolean; error?: string }[] = []

      for (const email of emails) {
        try {
          // Generate a new magic link for email confirmation
          const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
            type: 'magiclink',
            email,
            options: { redirectTo: appUrl },
          })

          if (linkError || !linkData) {
            results.push({ email, success: false, error: linkError?.message || 'Failed to generate link' })
            continue
          }

          const confirmUrl = linkData.properties?.action_link || appUrl

          // Send reminder email via Resend
          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${resendApiKey}`,
            },
            body: JSON.stringify({
              from: fromEmail,
              to: [email],
              subject: 'Confirm your email — The Timeboxing Club',
              html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;background-color:#F8F7F4;font-family:system-ui,-apple-system,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F8F7F4;">
    <tr><td align="center" style="padding:48px 24px;">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;">
        <tr><td align="center" style="padding-bottom:32px;">
          <span style="font-size:24px;font-weight:700;color:#1C1C1E;letter-spacing:-0.02em;">The Timeboxing Club</span>
        </td></tr>
        <tr><td style="background-color:#FFFFFF;border-radius:16px;border:1px solid rgba(0,0,0,0.08);box-shadow:0 1px 4px rgba(0,0,0,0.04);padding:40px 32px;">
          <p style="margin:0 0 8px;font-size:18px;font-weight:600;color:#1C1C1E;">Still need to confirm?</p>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#636366;">
            We noticed you haven't confirmed your email yet. Click below to verify your account and start timeboxing.
          </p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center">
              <a href="${confirmUrl}" target="_blank"
                 style="display:inline-block;padding:14px 32px;background-color:#8DA387;color:#FFFFFF;font-size:15px;font-weight:600;text-decoration:none;border-radius:10px;line-height:1;">
                Confirm My Email
              </a>
            </td></tr>
          </table>
          <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#AEAEB2;">
            If you didn't sign up, you can safely ignore this email. Check your spam folder if you don't see our emails.
          </p>
        </td></tr>
        <tr><td align="center" style="padding-top:24px;">
          <p style="margin:0;font-size:12px;color:#C7C7CC;">The Timeboxing Club — plan your day, own your time.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`,
            }),
          })

          if (!res.ok) {
            const errBody = await res.text()
            results.push({ email, success: false, error: errBody })
          } else {
            results.push({ email, success: true })
          }
        } catch (err) {
          results.push({ email, success: false, error: (err as Error).message })
        }
      }

      return json({ success: true, results })
    }

    // ── send-email-all ──────────────────────────────────────────────────
    if (action === 'send-email-all') {
      const { subject, html } = body
      if (!subject || !html) return json({ error: 'Missing subject or html' }, 400)

      const resendApiKey = Deno.env.get('RESEND_API_KEY')
      const fromEmail = Deno.env.get('FROM_EMAIL') || 'The Timeboxing Club <onboarding@resend.dev>'

      if (!resendApiKey) {
        return json({ error: 'RESEND_API_KEY not configured' }, 500)
      }

      // Get all confirmed users
      const { data: usersData, error: usersError } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })
      if (usersError) return json({ error: usersError.message }, 500)

      const confirmedEmails = usersData.users
        .filter(u => u.email_confirmed_at && u.email)
        .map(u => u.email!)

      if (confirmedEmails.length === 0) {
        return json({ error: 'No confirmed users to email' }, 400)
      }

      const results: { email: string; success: boolean; error?: string }[] = []

      for (const email of confirmedEmails) {
        try {
          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${resendApiKey}`,
            },
            body: JSON.stringify({
              from: fromEmail,
              to: [email],
              subject,
              html,
            }),
          })

          if (!res.ok) {
            const errBody = await res.text()
            results.push({ email, success: false, error: errBody })
          } else {
            results.push({ email, success: true })
          }
        } catch (err) {
          results.push({ email, success: false, error: (err as Error).message })
        }
      }

      const succeeded = results.filter(r => r.success).length
      const failed = results.filter(r => !r.success).length
      return json({ success: true, sent: succeeded, failed, total: confirmedEmails.length, results })
    }

    return json({ error: `Unknown action: ${action}` }, 400)
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})
