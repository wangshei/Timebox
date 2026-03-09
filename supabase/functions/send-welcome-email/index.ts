import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const welcomeEmailHtml = (name: string, appUrl: string) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Welcome to The Timeboxing Club</title>
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
              <p style="margin:0 0 8px;font-size:20px;font-weight:600;color:#1C1C1E;">Welcome${name ? `, ${name}` : ''}!</p>
              <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#636366;">
                You've officially joined The Timeboxing Club. We're excited to have you here.
              </p>

              <div style="background-color:#F5F4F0;border-radius:12px;padding:20px 24px;margin:0 0 24px;">
                <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#1C1C1E;">Here's how to get started:</p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding:6px 0;font-size:14px;line-height:1.5;color:#3A3A3C;">
                      <span style="color:#8DA387;font-weight:700;margin-right:8px;">1.</span>
                      Create your first calendar and add categories
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;font-size:14px;line-height:1.5;color:#3A3A3C;">
                      <span style="color:#8DA387;font-weight:700;margin-right:8px;">2.</span>
                      Add tasks or events to plan your day
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;font-size:14px;line-height:1.5;color:#3A3A3C;">
                      <span style="color:#8DA387;font-weight:700;margin-right:8px;">3.</span>
                      Drag and drop to timebox your schedule
                    </td>
                  </tr>
                </table>
              </div>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${appUrl}" target="_blank"
                       style="display:inline-block;padding:14px 32px;background-color:#8DA387;color:#FFFFFF;font-size:15px;font-weight:600;text-decoration:none;border-radius:10px;line-height:1;">
                      Open The Timeboxing Club
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#AEAEB2;">
                Have questions or feedback? Just reply to this email — we'd love to hear from you.
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
    const { email, name } = await req.json()

    if (!email) {
      return new Response(
        JSON.stringify({ error: 'Missing email' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const fromEmail = Deno.env.get('FROM_EMAIL') || 'The Timeboxing Club <onboarding@resend.dev>'
    const appUrl = Deno.env.get('APP_URL') || 'https://app.timeboxing.club'

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
        subject: 'Welcome to The Timeboxing Club!',
        html: welcomeEmailHtml(name || '', appUrl),
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
