# Email RSVP sync — setup

Captures the accept/decline replies that Gmail/Outlook/Apple send back when a guest
responds to an invite, and records each response on the event so it shows in the app.

## How it works

1. Every invite `.ics` we send sets `ORGANIZER` to an **inbound address** you control
   (`RSVP_INBOUND_EMAIL`). When a guest clicks Yes/No in their calendar, their client
   emails a `METHOD:REPLY` `.ics` **to that organizer address**.
2. Resend receives that email (inbound routing) and calls the **`rsvp-inbound`** edge
   function webhook.
3. `rsvp-inbound` parses the reply (event UID → event id, attendee email, `PARTSTAT`)
   and writes the status onto `events.attendees` (and `share_members.status`).
4. The app renders per-attendee status on the event's guest chips — the organizer sees
   "going / declined / maybe" instead of "pending" after a reload/refresh.

## One-time setup

### 1. Pick an inbound address on your Resend domain
e.g. `rsvp@yourdomain.com`. It must be on a domain you've verified in Resend and enabled
for **inbound** (Resend → Domains → add the MX records Resend gives you).

### 2. Set edge-function secrets
```bash
supabase secrets set RSVP_INBOUND_EMAIL="rsvp@yourdomain.com"
supabase secrets set RSVP_WEBHOOK_SECRET="$(openssl rand -hex 24)"
```
(`share-invite` reads `RSVP_INBOUND_EMAIL` to set the `.ics` ORGANIZER; `rsvp-inbound`
reads `RSVP_WEBHOOK_SECRET` to authenticate the webhook.)

### 3. Deploy both functions
```bash
supabase functions deploy share-invite
supabase functions deploy rsvp-inbound   # config.toml sets verify_jwt = false for it
```
If your CLI ignores config.toml, deploy the webhook with `--no-verify-jwt`.

### 4. Point Resend's inbound webhook at the function
In Resend's inbound settings for the address, set the webhook URL to:
```
https://<PROJECT_REF>.functions.supabase.co/rsvp-inbound?secret=<RSVP_WEBHOOK_SECRET>
```

## Test
Invite a Gmail address → accept in Gmail → open the event's guest list in Timebox and
refresh → that guest should show **going**. Check `rsvp-inbound` logs
(`supabase functions logs rsvp-inbound`) if not.

## Known limits (v1)
- **Only the organizer sees responses in-app.** Other invitees (especially non-Timebox
  guests) won't see each other's RSVP on *their* calendars — that would require
  re-broadcasting an updated `.ics` to every guest on each reply, which is noisy and is
  intentionally not done yet.
- If a guest RSVPs while the organizer has the app open, realtime reload picks it up; a
  rare save-race could momentarily overwrite it until the next refresh.
- Requires the inbound address to actually receive mail (MX + Resend inbound). Without
  `RSVP_INBOUND_EMAIL`, invites still work but no responses are captured.
