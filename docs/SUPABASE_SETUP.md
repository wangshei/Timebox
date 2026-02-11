# Supabase setup

Project URL and keys are stored in **`.env`** (gitignored). Do not commit real keys.

- **`.env.example`** — lists variable names; copy to `.env` and fill in from [Supabase Dashboard](https://supabase.com/dashboard/project/_/settings/api).
- **Frontend** uses only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- **`SUPABASE_SERVICE_ROLE_KEY`** — use only server-side (e.g. Edge Functions, backend); never in client code.

---

## 1. Expected schema (Phase 2)

Timebox expects the following tables in Supabase. Use `uuid` primary keys and a `user_id` column on every table so RLS can scope rows per user.

```sql
-- All tables share this pattern:
--   id      uuid primary key default gen_random_uuid()
--   user_id uuid not null references auth.users(id) on delete cascade

create table if not exists calendar_containers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  color text not null
);

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  color text not null,
  calendar_container_id uuid references calendar_containers (id) on delete cascade
);

create table if not exists tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  type text,
  category_id uuid references categories (id) on delete set null
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  estimated_minutes integer not null,
  calendar_container_id uuid not null references calendar_containers (id) on delete cascade,
  category_id uuid not null references categories (id) on delete cascade,
  tag_ids uuid[] not null default '{}',
  flexible boolean not null default true,
  status text
);

create table if not exists time_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  task_id uuid references tasks (id) on delete set null,
  title text,
  calendar_container_id uuid not null references calendar_containers (id) on delete cascade,
  category_id uuid not null references categories (id) on delete cascade,
  tag_ids uuid[] not null default '{}',
  start text not null,
  "end" text not null,
  date text not null,
  mode text not null,   -- 'planned' | 'recorded'
  source text not null  -- 'manual' | 'autoAssumed'
);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  calendar_container_id uuid not null references calendar_containers (id) on delete cascade,
  category_id uuid not null references categories (id) on delete cascade,
  start text not null,
  "end" text not null,
  date text not null,
  recurring boolean not null default false,
  recurrence_pattern text
);
```

> **Note:** The app generates IDs with `crypto.randomUUID()`, which is compatible with `uuid` columns.

---

## 2. Row Level Security (RLS)

Enable RLS on each table, then add policies so each user can only see and modify their own rows:

```sql
alter table calendar_containers enable row level security;
alter table categories enable row level security;
alter table tags enable row level security;
alter table tasks enable row level security;
alter table time_blocks enable row level security;
alter table events enable row level security;

create policy "Users can read own calendar_containers"
  on calendar_containers for select
  using (auth.uid() = user_id);

create policy "Users can write own calendar_containers"
  on calendar_containers for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Repeat for each table, replacing the table name:
create policy "Users can read own categories"
  on categories for select
  using (auth.uid() = user_id);

create policy "Users can write own categories"
  on categories for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ...same pattern for tags, tasks, time_blocks, events.
```

This matches the queries in `src/supabasePersistence.ts`, which always filter by `user_id`.

---

## 3. How the app talks to Supabase (Phase 2)

- `src/supabaseClient.ts` creates a single client using `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- `App.tsx`:
  - Shows a top auth bar that uses `supabase.auth.signInWithOtp({ email })`.
  - Tracks the current `Session` via `getSession` and `onAuthStateChange`.
  - On sign-in, calls `loadSupabaseState()` then starts `startSupabasePersistence()` so edits are saved.
- `src/supabasePersistence.ts`:
  - `loadSupabaseState()` reads all tables for the current `user_id` and hydrates the Zustand store.
  - `startSupabasePersistence()` subscribes to store changes and mirrors the current state into Supabase for that user.

When you **edit the calendar or tasks in the UI while signed in**, the store updates, and Supabase is kept in sync automatically.
