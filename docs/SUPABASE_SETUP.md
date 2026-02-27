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

- **Why does the link go to localhost?** Supabase uses **Site URL** (Auth → URL Configuration) as the default base for the link in the email. If Site URL is `http://localhost:5173`, the magic link will point there even when you open the app from production. Fix: set **Site URL** to your **production** URL (e.g. `https://timebox-fawn.vercel.app`).
- **Redirect URL:** The app sends `emailRedirectTo` so the link returns to your app. In production we use `VITE_SITE_URL` when set (e.g. in Vercel: `VITE_SITE_URL=https://timebox-fawn.vercel.app`). In dev we use the current origin. Set this in your deployment (Vercel → Project → Settings → Environment Variables) so magic links always point to production.
- **Required in Supabase:** [Authentication](https://supabase.com/dashboard) → **URL Configuration**:
  - **Site URL** = your **production** app URL (e.g. `https://timebox-fawn.vercel.app`). This is what Supabase uses when building the link in the email.
  - **Redirect URLs** = add both `https://timebox-fawn.vercel.app/**` and `http://localhost:5173/**` (or your dev URL) so both production and local work.
- **Email template (optional):** If the link still goes to the wrong place, in Auth → Email Templates → Magic Link, ensure the link uses `{{ .ConfirmationURL }}` (it includes the redirect). Do not use only `{{ .SiteURL }}` for the href. See [Email Templates](https://supabase.com/docs/guides/auth/auth-email-templates).
- Magic links expire (default 1 hour) and are one-time use.

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
  calendar_container_id uuid references calendar_containers (id) on delete cascade,
  calendar_container_ids uuid[]  -- when set, category is shared across these calendars; empty/null = all
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
  status text,
  due_date text,  -- optional YYYY-MM-DD
  link text,      -- optional URL
  description text  -- optional notes
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
  source text not null,  -- 'manual' | 'autoAssumed'
  link text,
  description text
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
  recurrence_pattern text,  -- 'none'|'daily'|'every_other_day'|'weekly'|'monthly'|'custom'
  recurrence_days integer[],  -- for custom: 0=Sun..6=Sat
  recurrence_series_id uuid,  -- for "all after" edits: id of first event in series
  link text,
  description text
);

-- User settings (one row per user); timezone is IANA e.g. America/Los_Angeles
create table if not exists user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  timezone text not null default 'UTC'
);

comment on column user_settings.timezone is 'IANA timezone e.g. America/Los_Angeles; used for date/time display and "today" logic';
```

> **Note:** The app generates IDs with `crypto.randomUUID()`, which is compatible with `uuid` columns.

---

## 1b. Migrations (if you already have the base schema)

Run these in the Supabase SQL Editor to add new columns without recreating tables:

```sql
-- Tasks: optional due date (YYYY-MM-DD)
alter table tasks add column if not exists due_date text;

-- Events: recurrence and "edit this / all / all after"
alter table events add column if not exists recurrence_pattern text;
alter table events add column if not exists recurrence_days integer[];
alter table events add column if not exists recurrence_series_id uuid;

-- Categories: shared across multiple calendars
alter table categories add column if not exists calendar_container_ids uuid[];

-- Tasks & events: optional link and description
alter table tasks add column if not exists link text;
alter table tasks add column if not exists description text;
alter table time_blocks add column if not exists link text;
alter table time_blocks add column if not exists description text;
alter table events add column if not exists link text;
alter table events add column if not exists description text;
```

**Categories on multiple calendars:** To let a category appear on more than one calendar, ensure the `categories` table has the column `calendar_container_ids`. Run this in the Supabase SQL Editor if you haven’t already:

```sql
alter table categories add column if not exists calendar_container_ids uuid[];
```

- `calendar_container_id` (singular) = primary/default calendar for the category (optional).
- `calendar_container_ids` (array) = when non-empty, the category is shown only on these calendars; when null/empty, behavior falls back to `calendar_container_id` or “all calendars” depending on the app.

No RLS or policy changes are required for this column.

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
alter table user_settings enable row level security;

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

-- user_settings
create policy "Users can read own user_settings"
  on user_settings for select
  using (auth.uid() = user_id);

create policy "Users can write own user_settings"
  on user_settings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

This matches the queries in `src/supabasePersistence.ts`, which always filter by `user_id`.

---

## 2b. If you get 403 / "violates row-level security policy" on INSERT

If the app is signed in but inserts fail with **403** and error code **42501** ("new row violates row-level security policy"), run this in the Supabase SQL Editor. It **drops all existing policies** on these tables and creates fresh ones that explicitly allow the **authenticated** role to INSERT/UPDATE/DELETE when `user_id = auth.uid()`.

(The "Personal" row is missing from the calendar table _because_ these inserts are blocked—fixing RLS will let the app create it.)

```sql
-- 1) Drop ALL existing policies on these tables (clean slate)
do $$
declare r record;
begin
  for r in (
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
    and tablename in ('calendar_containers','categories','tags','tasks','time_blocks','events')
  ) loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- 2) SELECT: allow authenticated users to read their own rows
create policy "sel_cc" on calendar_containers for select to authenticated using (auth.uid() = user_id);
create policy "sel_cat" on categories for select to authenticated using (auth.uid() = user_id);
create policy "sel_tags" on tags for select to authenticated using (auth.uid() = user_id);
create policy "sel_tasks" on tasks for select to authenticated using (auth.uid() = user_id);
create policy "sel_tb" on time_blocks for select to authenticated using (auth.uid() = user_id);
create policy "sel_ev" on events for select to authenticated using (auth.uid() = user_id);

-- 3) INSERT: allow authenticated users to insert rows with their own user_id
create policy "ins_cc" on calendar_containers for insert to authenticated with check (auth.uid() = user_id);
create policy "ins_cat" on categories for insert to authenticated with check (auth.uid() = user_id);
create policy "ins_tags" on tags for insert to authenticated with check (auth.uid() = user_id);
create policy "ins_tasks" on tasks for insert to authenticated with check (auth.uid() = user_id);
create policy "ins_tb" on time_blocks for insert to authenticated with check (auth.uid() = user_id);
create policy "ins_ev" on events for insert to authenticated with check (auth.uid() = user_id);

-- 4) UPDATE: allow authenticated users to update their own rows
create policy "upd_cc" on calendar_containers for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "upd_cat" on categories for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "upd_tags" on tags for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "upd_tasks" on tasks for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "upd_tb" on time_blocks for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "upd_ev" on events for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 5) DELETE: allow authenticated users to delete their own rows
create policy "del_cc" on calendar_containers for delete to authenticated using (auth.uid() = user_id);
create policy "del_cat" on categories for delete to authenticated using (auth.uid() = user_id);
create policy "del_tags" on tags for delete to authenticated using (auth.uid() = user_id);
create policy "del_tasks" on tasks for delete to authenticated using (auth.uid() = user_id);
create policy "del_tb" on time_blocks for delete to authenticated using (auth.uid() = user_id);
create policy "del_ev" on events for delete to authenticated using (auth.uid() = user_id);
```

After this runs successfully: **refresh the app** (or sign out and sign back in), then add an event again. The app will create the default "Personal" calendar and "General" category on first sync.

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
