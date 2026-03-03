import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // No I/O/0/1 to avoid confusion
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { email } = await req.json()

    if (!email) {
      return new Response(
        JSON.stringify({ error: 'Missing email' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Generate a unique invite code
    const code = generateInviteCode()

    // Insert into invite_codes
    const { error: codeError } = await supabaseAdmin
      .from('invite_codes')
      .insert({
        code,
        email: email.toLowerCase(),
        created_by: 'system',
      })

    if (codeError) {
      return new Response(
        JSON.stringify({ error: `Failed to create invite code: ${codeError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Update waitlist status
    await supabaseAdmin
      .from('waitlist')
      .update({ status: 'approved', approved_at: new Date().toISOString() })
      .eq('email', email.toLowerCase())

    // Send invite email via Resend
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const fromEmail = Deno.env.get('FROM_EMAIL') || 'The Timeboxing Club <onboarding@resend.dev>'
    const appUrl = Deno.env.get('APP_URL') || 'https://timebox-fawn.vercel.app'

    if (!resendApiKey) {
      return new Response(
        JSON.stringify({ error: 'RESEND_API_KEY not configured', code }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [email],
        subject: "You're in! Here's your invite code",
        html: inviteEmailHtml(code, appUrl),
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      return new Response(
        JSON.stringify({ error: `Resend error: ${body}`, code }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    return new Response(
      JSON.stringify({ success: true, code }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
