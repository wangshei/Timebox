-- B-05: one calendar_shares row per (owner, scope, target). Dedupe existing rows
-- (keep the oldest, move its siblings' members over), then add unique indexes so
-- share-invite can reuse the row instead of inserting duplicates.

DO $$
DECLARE
  col text;
  rec record;
BEGIN
  FOREACH col IN ARRAY ARRAY['event_id','calendar_container_id','category_id','tag_id'] LOOP
    FOR rec IN EXECUTE format($q$
      SELECT owner_id, %1$I AS target,
             (array_agg(id ORDER BY created_at, id))[1] AS keep_id,
             array_agg(id ORDER BY created_at, id) AS all_ids
      FROM calendar_shares
      WHERE %1$I IS NOT NULL
      GROUP BY owner_id, %1$I
      HAVING count(*) > 1
    $q$, col) LOOP
      -- Move members that don't already exist on the kept share.
      UPDATE share_members m
         SET share_id = rec.keep_id
       WHERE m.share_id = ANY (rec.all_ids)
         AND m.share_id <> rec.keep_id
         AND NOT EXISTS (
           SELECT 1 FROM share_members k
            WHERE k.share_id = rec.keep_id AND k.email = m.email
         )
         AND m.id = (
           SELECT m2.id FROM share_members m2
            WHERE m2.share_id = ANY (rec.all_ids) AND m2.email = m.email
            ORDER BY (m2.status = 'accepted') DESC, m2.invited_at LIMIT 1
         );
      -- Remaining duplicates (and their leftover members) cascade away.
      DELETE FROM calendar_shares
       WHERE id = ANY (rec.all_ids) AND id <> rec.keep_id;
    END LOOP;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS calendar_shares_owner_event_uidx
  ON calendar_shares (owner_id, event_id) WHERE scope = 'event' AND event_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS calendar_shares_owner_calendar_uidx
  ON calendar_shares (owner_id, calendar_container_id) WHERE scope = 'calendar' AND calendar_container_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS calendar_shares_owner_category_uidx
  ON calendar_shares (owner_id, category_id) WHERE scope = 'category' AND category_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS calendar_shares_owner_tag_uidx
  ON calendar_shares (owner_id, tag_id) WHERE scope = 'tag' AND tag_id IS NOT NULL;
