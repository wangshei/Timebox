-- Adds an optional `attendees` column on `events`:
--   attendees — persists the invited guest list (email / name / self / responseStatus)
--               so it survives reload. Previously in-memory only: after a refresh the
--               attendee list on an event was lost (kept only via the in-session store),
--               which also meant edit-time "notify attendees" had nothing to work with.
--
-- Nullable jsonb, backward-compatible. The client (supabasePersistence.ts) writes it
-- opportunistically and retries without it if this migration hasn't run, so it is safe
-- to deploy the app before or after applying this file.
--
-- No RLS changes are required — the existing "Users can write own events" policy
-- (events FOR ALL USING auth.uid() = user_id) already covers this column.

alter table events add column if not exists attendees jsonb;
