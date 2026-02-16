# Supabase setup

Project URL and keys are stored in **`.env`** (gitignored). Do not commit real keys.

---

## New project checklist

**1. New Supabase accounts don’t include our tables.**  
Create the tables by running the SQL in **§1 Expected schema** and **§2 RLS** below in the Supabase Dashboard → **SQL Editor**.

**2. Yes, enable Row Level Security (RLS).**  
RLS is what makes each user see only their own data. The message “anonymous users will not be able to read/write” refers to unauthenticated requests. In this app, users **sign in with a magic link**; after sign-in, requests use their JWT, so RLS allows read/write for their `user_id`. Enable RLS and add the policies in §2.

**3. Keys — what to use and what not to share.**

- **Use in the app (in `.env`):** `VITE_SUPABASE_URL` and **`VITE_SUPABASE_ANON_KEY`** (the “anon” / public key from Dashboard → Settings → API). The app only needs these two; they are safe in the frontend.
- **Do not put in the app and do not share with anyone:** the **service_role** (secret) key. It bypasses RLS and must only be used in a secure server environment. You do **not** need to give a secret key to anyone for this app to work.

- **`.env.example`** — lists variable names; copy to `.env` and fill in from [Supabase Dashboard](https://supabase.com/dashboard/project/_/settings/api) (Project URL + anon public key).
- **Frontend** uses only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- **`SUPABASE_SERVICE_ROLE_KEY`** — use only server-side (e.g. Edge Functions, backend); never in client code or in this Timebox frontend.

**Magic link (email sign-in):**

- The app sends `emailRedirectTo: window.location.origin + pathname` so the link returns to the same URL you’re on (e.g. `http://localhost:3001/`).
- In [Supabase Dashboard](https://supabase.com/dashboard) → **Authentication** → **URL Configuration**, add your app URL(s) under **Redirect URLs** (e.g. `http://localhost:3000`, `http://localhost:3001`). If the redirect URL isn’t listed, the magic link will fail.
- Magic links expire (default 1 hour). If you see “Email link is invalid or has expired”, request a new link from the app; the UI will show a short message and let you try again.

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
-- Enable RLS on every table
alter table calendar_containers enable row level security;
alter table categories enable row level security;
alter table tags enable row level security;
alter table tasks enable row level security;
alter table time_blocks enable row level security;
alter table events enable row level security;

-- IMPORTANT: You must create policies for EVERY table below.
-- If RLS is enabled but no policies exist, ALL operations are denied by default.

-- calendar_containers
create policy "Users can read own calendar_containers"
  on calendar_containers for select
  using (auth.uid() = user_id);

create policy "Users can write own calendar_containers"
  on calendar_containers for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- categories
create policy "Users can read own categories"
  on categories for select
  using (auth.uid() = user_id);

create policy "Users can write own categories"
  on categories for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- tags
create policy "Users can read own tags"
  on tags for select
  using (auth.uid() = user_id);

create policy "Users can write own tags"
  on tags for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- tasks
create policy "Users can read own tasks"
  on tasks for select
  using (auth.uid() = user_id);

create policy "Users can write own tasks"
  on tasks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- time_blocks
create policy "Users can read own time_blocks"
  on time_blocks for select
  using (auth.uid() = user_id);

create policy "Users can write own time_blocks"
  on time_blocks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- events
create policy "Users can read own events"
  on events for select
  using (auth.uid() = user_id);

create policy "Users can write own events"
  on events for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
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

When you **edit the calendar or tasks in the UI while signed in**, the store updates, and Supabase is kept in sync automatically. The store uses Zustand’s `subscribeWithSelector` middleware so the persistence subscription runs only when the persisted slice changes. When **not signed in**, changes are stored in the browser (localStorage) only and do not sync to Supabase until you sign in.
