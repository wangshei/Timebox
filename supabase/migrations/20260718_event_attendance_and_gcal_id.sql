-- Adds two optional columns on `events`:
--   attendance_status — persists past-event review (attended / not_attended) so it
--                       survives reload (previously in-memory only → silent data loss).
--   google_event_id   — stores the Google Calendar id stamped on a Timebox event that
--                       was written back to Google, so its imported twin can be deduped
--                       across a full reload (previously in-session only → duplicate rows).
--
-- Both are nullable and backward-compatible. The client (supabasePersistence.ts) writes
-- them opportunistically and retries without them if this migration hasn't run, so it is
-- safe to deploy the app before or after applying this file.
--
-- No RLS changes are required — the existing "Users can write own events" policy
-- (events FOR ALL USING auth.uid() = user_id) already covers these columns.

alter table events add column if not exists attendance_status text;
alter table events add column if not exists google_event_id text;

-- Speeds up the write-back dedupe lookup (match imported event's Google id to a local one).
create index if not exists events_google_event_id_idx on events (user_id, google_event_id);
