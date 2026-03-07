-- Google Calendar Integration & Sharing Tables
-- Run this migration to set up the required tables.

-- ─── Google OAuth Tokens ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS google_tokens (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  scope TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE google_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own tokens" ON google_tokens
  FOR ALL USING (auth.uid() = user_id);

-- ─── Google Calendar Links ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS google_calendar_links (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  calendar_container_id TEXT NOT NULL,
  google_calendar_id TEXT NOT NULL,
  google_calendar_name TEXT DEFAULT '',
  sync_mode TEXT NOT NULL CHECK (sync_mode IN ('migrate_listen', 'listen_with_history', 'listen_fresh')),
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sync_token TEXT,
  initial_import_done BOOLEAN DEFAULT FALSE,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, google_calendar_id)
);

ALTER TABLE google_calendar_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own calendar links" ON google_calendar_links
  FOR ALL USING (auth.uid() = user_id);

-- ─── Add google_event_id to events table ──────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'google_event_id') THEN
    ALTER TABLE events ADD COLUMN google_event_id TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'shared_from_share_id') THEN
    ALTER TABLE events ADD COLUMN shared_from_share_id TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'read_only') THEN
    ALTER TABLE events ADD COLUMN read_only BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- Unique constraint for deduplication of Google events per user
CREATE UNIQUE INDEX IF NOT EXISTS events_user_google_event_id_idx
  ON events (user_id, google_event_id) WHERE google_event_id IS NOT NULL;

-- ─── Calendar Shares ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS calendar_shares (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN ('calendar', 'category', 'tag', 'event')),
  calendar_container_id TEXT,
  category_id TEXT,
  tag_id TEXT,
  event_id TEXT,
  display_name TEXT,
  include_existing BOOLEAN DEFAULT TRUE,
  push_to_google BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE calendar_shares ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners can manage shares" ON calendar_shares
  FOR ALL USING (auth.uid() = owner_id);

-- ─── Share Members ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS share_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  share_id UUID NOT NULL REFERENCES calendar_shares(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  role TEXT DEFAULT 'viewer' CHECK (role IN ('viewer')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  push_to_google BOOLEAN DEFAULT TRUE,
  token TEXT NOT NULL,
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  UNIQUE(share_id, email)
);

ALTER TABLE share_members ENABLE ROW LEVEL SECURITY;
-- Share owners can manage members
CREATE POLICY "Share owners can manage members" ON share_members
  FOR ALL USING (
    EXISTS (SELECT 1 FROM calendar_shares WHERE id = share_members.share_id AND owner_id = auth.uid())
  );
-- Members can read their own memberships
CREATE POLICY "Members can view own memberships" ON share_members
  FOR SELECT USING (
    user_id = auth.uid() OR email IN (SELECT email FROM auth.users WHERE id = auth.uid())
  );
