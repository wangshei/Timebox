import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const waitlistEmailHtml = (email: string) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>You're on the list!</title>
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
              <p style="margin:0 0 8px;font-size:18px;font-weight:600;color:#1C1C1E;">You're on the list!</p>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#636366;">
                Thanks for your interest in The Timeboxing Club. We've added <strong>${email}</strong> to our waitlist.
              </p>
              <p style="margin:0 0 0;font-size:15px;line-height:1.6;color:#636366;">
                We'll send you an invite code when a spot opens up. Stay tuned!
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

    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const fromEmail = Deno.env.get('FROM_EMAIL') || 'The Timeboxing Club <onboarding@resend.dev>'

    if (!resendApiKey) {
      return new Response(
        JSON.stringify({ error: 'RESEND_API_KEY not configured' }),
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
        subject: "You're on the list!",
        html: waitlistEmailHtml(email),
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      return new Response(
        JSON.stringify({ error: `Resend error: ${body}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
