-- Server-side persistence for the public booking flow.
--
-- Previously scheduling links + bookings lived only in the creator's browser
-- localStorage, so public /book/{slug} links failed for anyone else and two
-- people could book the same slot. These tables move both to Supabase.
--
-- Access model: external bookers are UNAUTHENTICATED. They never touch these
-- tables directly — the `share-invite` edge function (service-role key) is the
-- only public gate: it reads a link by slug and inserts a booking after
-- server-side validation. RLS below therefore grants access to the OWNER only;
-- the service role bypasses RLS for the anon booking path.

create table if not exists scheduling_links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null default '',
  slug text not null unique,
  calendar_container_id uuid,
  category_id uuid,
  slot_duration integer not null default 30,
  gap_between integer not null default 0,
  min_advance_hours integer not null default 0,
  valid_until text not null default '',      -- YYYY-MM-DD, or '' for no expiry
  available_slots jsonb not null default '[]'::jsonb,
  smart_adapt boolean not null default false,
  active boolean not null default true,
  timezone text not null default '',
  creator_email text,
  created_at timestamptz not null default now()
);
create index if not exists scheduling_links_owner_idx on scheduling_links (owner_id);
create index if not exists scheduling_links_slug_idx on scheduling_links (slug);

create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  scheduling_link_id uuid not null references scheduling_links (id) on delete cascade,
  booker_name text not null default '',
  booker_email text not null default '',
  date text not null,                        -- YYYY-MM-DD
  start_time text not null,                  -- HH:MM
  end_time text not null,                    -- HH:MM
  status text not null default 'confirmed',  -- 'confirmed' | 'cancelled'
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists bookings_link_idx on bookings (scheduling_link_id);

-- Prevent double-booking: at most one confirmed booking per (link, date, start).
-- The edge function also checks availability, but this is the hard guarantee.
create unique index if not exists bookings_no_double_book
  on bookings (scheduling_link_id, date, start_time)
  where status = 'confirmed';

-- ── RLS: owner-only. Anon booking goes through the service-role edge function. ──
alter table scheduling_links enable row level security;
alter table bookings enable row level security;

create policy "Owners manage own scheduling_links"
  on scheduling_links for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "Owners read bookings for their links"
  on bookings for select
  using (exists (
    select 1 from scheduling_links sl
    where sl.id = bookings.scheduling_link_id and sl.owner_id = auth.uid()
  ));

create policy "Owners update bookings for their links"
  on bookings for update
  using (exists (
    select 1 from scheduling_links sl
    where sl.id = bookings.scheduling_link_id and sl.owner_id = auth.uid()
  ));

-- No INSERT policy for bookings: inserts happen only via the edge function
-- (service role), which validates availability and expiry before writing.
