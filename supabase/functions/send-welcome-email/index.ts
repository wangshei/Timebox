import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const welcomeEmailHtml = (name: string) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body style="margin:0;padding:0;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1C1C1E;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#3A3A3C;">Hi${name ? ` ${name}` : ''},</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#3A3A3C;">I'm Sheila, the creator of The Timeboxing Club. I am so happy that you signed up and am wondering what your experience has been like?</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#3A3A3C;">Feel free to directly reply to this email with feature requests, feedback, or general thoughts on the product!</p>
    <p style="margin:0 0 4px;font-size:15px;line-height:1.7;color:#3A3A3C;">Looking forward to hearing from you,</p>
    <p style="margin:0;font-size:15px;line-height:1.7;color:#3A3A3C;">Sheila</p>
  </div>
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
    const fromEmail = Deno.env.get('FROM_EMAIL') || 'Sheila from The Timeboxing Club <onboarding@resend.dev>'

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
        reply_to: 'sheila@timeboxing.club',
        subject: 'Welcome to The Timeboxing Club!',
        html: welcomeEmailHtml(name || ''),
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
