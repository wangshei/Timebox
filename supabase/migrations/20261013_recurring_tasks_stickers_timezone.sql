-- Run in the Supabase SQL editor (idempotent). The app tolerates any of these being
-- missing (it retries without the new columns / skips the stickers table) so it is safe to
-- deploy the client before or after applying this file.

-- 1. Repeating to-dos (N-01): the series head's pattern and exceptions were never saved, so
--    after a reload / on another device a repeating todo became a plain todo.
alter table public.tasks add column if not exists recurring boolean default false;
alter table public.tasks add column if not exists recurrence_pattern text;
alter table public.tasks add column if not exists recurrence_days integer[];
alter table public.tasks add column if not exists recurrence_series_id uuid;
alter table public.tasks add column if not exists recurrence_exceptions text[];
alter table public.tasks add column if not exists recurrence_until text;   -- YYYY-MM-DD, inclusive

-- 2. Event timezone (N-10 / Z-03): previously only kept in this browser's localStorage.
alter table public.events add column if not exists timezone text;

-- 3. Stickers / stamps incl. the red cross "didn't happen" (B-44): previously local-only.
create table if not exists public.stickers (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  emoji text not null,
  date text not null,                 -- YYYY-MM-DD
  block_id uuid,                      -- anchored to a time block ...
  event_id uuid,                      -- ... or to an event ...
  offset_x_percent double precision not null default 50,
  offset_y_percent double precision not null default 50,
  time_minutes integer                -- ... or free-floating at this minute-of-day
);
create index if not exists stickers_user_idx on public.stickers (user_id);

alter table public.stickers enable row level security;

drop policy if exists "Users can read own stickers" on public.stickers;
create policy "Users can read own stickers"
  on public.stickers for select
  using (auth.uid() = user_id);

drop policy if exists "Users can write own stickers" on public.stickers;
create policy "Users can write own stickers"
  on public.stickers for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
