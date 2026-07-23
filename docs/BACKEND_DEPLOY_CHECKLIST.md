# Backend deploy checklist (2026-07-18)

The latest commits added backend features that need **two migrations** and **one edge-function deploy** to activate. Until you run these, the app degrades gracefully (event columns no-op via retry; booking still uses the old localStorage path). Do these in order.

## 1. Run the two new migrations

Apply these against your Supabase project (SQL editor → paste & run, or `supabase db push` if you use the CLI):

1. `supabase/migrations/20260718_event_attendance_and_gcal_id.sql`
   - Adds `events.attendance_status` and `events.google_event_id` (nullable, backward-compatible).
   - Activates: event attendance surviving reload; Google write-back dedupe across reload.
2. `supabase/migrations/20260718_scheduling_links_and_bookings.sql`
   - Creates `scheduling_links` + `bookings` (owner-only RLS; partial UNIQUE index preventing double-booking).
   - Activates: the public booking flow.
3. `supabase/migrations/20260722_event_attendees.sql`
   - Adds `events.attendees` (nullable jsonb, backward-compatible).
   - Activates: the invited guest list surviving reload (previously in-memory only → lost on refresh).

*(The older `20260307_gcal_and_sharing.sql` and timezone migrations should already be applied — the sharing tables exist. If not, run those first.)*

## 2. Deploy the `share-invite` edge function

It gained the `shared_with_me_events`, `get_booking_link`, and `create_booking` actions (plus the decline-URL fix).

```bash
supabase functions deploy share-invite
```

Confirm the function has these secrets set (the new actions use the service role + email):
- `SUPABASE_SERVICE_ROLE_KEY` (required — `getSupabaseAdmin` and all booking/shared-event queries use it)
- `RESEND_API_KEY` and `APP_URL` (for invite + booking emails; already used by existing actions)

## 3. Verify the `tasks` DELETE policy (the task-delete report)

Run in the SQL editor:
```sql
select cmd, roles from pg_policies where tablename = 'tasks';
```
You should see a row with `cmd = ALL` (or a `cmd = DELETE`). If not, re-run the `tasks` policy block from `docs/SUPABASE_SETUP.md` — a missing DELETE policy silently drops deletes (200, 0 rows) and is the one way task-delete could still fail after the code fixes.

## 4. Smoke-test after deploy

- **Attendance:** mark a past event not-attended → reload → still not-attended.
- **Booking:** create a scheduling link → open `/book/{slug}` in an incognito window (no session) → book a slot → confirm it appears in your app and a second incognito booking of the same slot shows "just booked."
- **Sharing:** share a calendar/category with a second account → that account sees the events (read-only) after reload.
- **Tag-scoped shares** intentionally return nothing (events have no tag column) — expected.

## Rollback

The two migrations are additive. To roll back: `drop table bookings, scheduling_links;` and `alter table events drop column attendance_status, drop column google_event_id;`. The app tolerates their absence (retry-without-column + localStorage booking fallback).
