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
- **`SUPABASE_SERVICE_ROLE_KEY`** — use only server-side (e.g. Edge Functions, backend); never in client code or in this Timeboxing Club frontend.

**Magic link (email sign-in):**

- **Why does the link go to localhost?** Supabase uses **Site URL** (Auth → URL Configuration) as the default base for the link in the email. If Site URL is `http://localhost:5173`, the magic link will point there even when you open the app from production. Fix: set **Site URL** to your **production** URL (e.g. `https://app.timeboxing.club`).
- **Redirect URL:** The app sends `emailRedirectTo` so the link returns to your app. In production we use `VITE_SITE_URL` when set (e.g. in Vercel: `VITE_SITE_URL=https://app.timeboxing.club`). In dev we use the current origin. Set this in your deployment (Vercel → Project → Settings → Environment Variables) so magic links always point to production.
- **Required in Supabase:** [Authentication](https://supabase.com/dashboard) → **URL Configuration**:
  - **Site URL** = your **production** app URL (e.g. `https://app.timeboxing.club`). This is what Supabase uses when building the link in the email.
  - **Redirect URLs** = add both `https://app.timeboxing.club/**` and `http://localhost:5173/**` (or your dev URL) so both production and local work.
- **Email template (optional):** If the link still goes to the wrong place, in Auth → Email Templates → Magic Link, ensure the link uses `{{ .ConfirmationURL }}` (it includes the redirect). Do not use only `{{ .SiteURL }}` for the href. See [Email Templates](https://supabase.com/docs/guides/auth/auth-email-templates).
- Magic links expire (default 1 hour) and are one-time use.

---

## 1. Expected schema (Phase 2)

Timeboxing Club expects the following tables in Supabase. Use `uuid` primary keys and a `user_id` column on every table so RLS can scope rows per user.

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
  description text, -- optional notes
  notes text,       -- quick inline notes
  priority integer, -- 1–5 (higher = more important)
  pinned boolean not null default false,
  emoji text
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
  source text not null,  -- 'manual' | 'autoAssumed' | 'unplanned'
  confirmation_status text, -- 'pending' | 'confirmed' | 'skipped'
  recorded_start text,  -- actual start if different from planned (HH:mm)
  recorded_end text,    -- actual end if different from planned (HH:mm)
  link text,
  description text,
  notes text            -- quick inline notes
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
  description text,
  notes text,           -- quick inline notes
  source text           -- 'manual' | 'unplanned'
);

-- User settings (one row per user); timezone is IANA e.g. America/Los_Angeles
create table if not exists user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  timezone text not null default 'UTC',
  has_completed_setup boolean not null default false
);

comment on column user_settings.timezone is 'IANA timezone e.g. America/Los_Angeles; used for date/time display and "today" logic';
comment on column user_settings.has_completed_setup is 'Whether the user has completed onboarding (template/migration modal); prevents "new template" modal on every refresh.';

-- Bug reports (from in-app "Report a bug"); no user_id — RLS allows INSERT only so users cannot read others' reports
create table if not exists bug_reports (
  id uuid primary key default gen_random_uuid(),
  user_email text,
  description text not null,
  created_at timestamptz not null default now()
);

comment on table bug_reports is 'User-submitted bug reports; app only inserts. View in Dashboard → Table Editor.';
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

-- User settings: onboarding completed (stops "new template" modal on refresh)
alter table user_settings add column if not exists has_completed_setup boolean not null default false;

-- Tasks: notes, priority, pinned, emoji
alter table tasks add column if not exists notes text;
alter table tasks add column if not exists priority integer;
alter table tasks add column if not exists pinned boolean not null default false;
alter table tasks add column if not exists emoji text;

-- Time blocks: confirmation workflow + notes
alter table time_blocks add column if not exists confirmation_status text;
alter table time_blocks add column if not exists recorded_start text;
alter table time_blocks add column if not exists recorded_end text;
alter table time_blocks add column if not exists notes text;

-- Events: notes + source
alter table events add column if not exists notes text;
alter table events add column if not exists source text;

-- Bug reports table (if not created with base schema)
create table if not exists bug_reports (
  id uuid primary key default gen_random_uuid(),
  user_email text,
  description text not null,
  created_at timestamptz not null default now()
);
alter table bug_reports enable row level security;
create policy if not exists "Authenticated can insert bug_reports"
  on bug_reports for insert to authenticated with check (true);
create policy if not exists "Anon can insert bug_reports"
  on bug_reports for insert to anon with check (true);
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
alter table bug_reports enable row level security;

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

-- bug_reports: allow INSERT only (no SELECT so users cannot read others' reports). Anon + authenticated so reports work before sign-in.
create policy "Authenticated can insert bug_reports"
  on bug_reports for insert
  to authenticated
  with check (true);

create policy "Anon can insert bug_reports"
  on bug_reports for insert
  to anon
  with check (true);
```

This matches the queries in `src/supabasePersistence.ts`, which always filter by `user_id`. The `bug_reports` table is insert-only for the app; view submissions in Supabase Dashboard → Table Editor → bug_reports.

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

## 4. Enable Realtime (for multi-window sync)

The app uses Supabase Realtime to detect changes made in other browser windows or devices and reload automatically. Run this in the Supabase **SQL Editor** to add the tables to the `supabase_realtime` publication:

```sql
-- Run in Supabase SQL Editor (Dashboard → SQL Editor)
alter publication supabase_realtime add table calendar_containers;
alter publication supabase_realtime add table categories;
alter publication supabase_realtime add table tags;
alter publication supabase_realtime add table tasks;
alter publication supabase_realtime add table time_blocks;
alter publication supabase_realtime add table events;
alter publication supabase_realtime add table user_settings;
```

> **Note:** If the publication already includes a table you'll get an "already a member" error — that's fine, skip it.
> After adding tables, the app will detect remote changes within ~1 second and reload silently.

---

## 5. Indexes (recommended for performance)

Add indexes on columns used in range queries so loading stays fast as data grows:

```sql
create index if not exists idx_time_blocks_user_date on time_blocks (user_id, date);
create index if not exists idx_events_user_date on events (user_id, date);
create index if not exists idx_tasks_user on tasks (user_id);
create index if not exists idx_categories_user on categories (user_id);
create index if not exists idx_tags_user on tags (user_id);
```

---

## 6. Account deletion (self-service)

The app allows users to delete their own account from the profile menu. This requires a database function with `security definer` so it can delete from `auth.users`. Run this in the **SQL Editor**:

```sql
create or replace function delete_own_account()
returns void
language sql
security definer
set search_path = public
as $$
  delete from auth.users where id = auth.uid();
$$;
```

All user data is cascade-deleted automatically (every table has `on delete cascade` on the `user_id` foreign key). The app calls this via `supabase.rpc('delete_own_account')` then signs out.

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

---

## 6. Custom SMTP (Resend)

Supabase’s built-in email is limited to **30 emails/hour** — fine for development but not production. Use [Resend](https://resend.com) as a custom SMTP provider to remove that limit.

### Setup steps

1. **Create a Resend account** at https://resend.com and generate an API key.
2. **(Recommended) Verify your domain** in Resend → Domains so emails come from `noreply@yourdomain.com` instead of `onboarding@resend.dev`.
3. **Configure SMTP in Supabase Dashboard** → Authentication → SMTP Settings:

| Setting | Value |
|---------|-------|
| Enable Custom SMTP | ✅ On |
| Host | `smtp.resend.com` |
| Port | `465` |
| Minimum interval | `0` seconds (Resend has its own rate limiting) |
| Username | `resend` |
| Password | Your Resend **API key** (starts with `re_`) |
| Sender name | `The Timeboxing Club` |
| Sender email | `noreply@yourdomain.com` (or `onboarding@resend.dev` before domain verification) |

4. **Save** and send a test email from Supabase to confirm delivery.

> **Note:** Resend’s free tier includes 3,000 emails/month and 100 emails/day — more than enough for most apps. Upgrade if needed.

---

## 7. Email Templates

Supabase lets you customize the HTML for transactional emails. Go to **Authentication → Email Templates** in the Supabase Dashboard and paste the templates below for each type.

All templates share the same branded shell: warm background (`#F8F7F4`), white card, sage-green CTA button (`#8DA387`), system-ui font.

### 7a. Confirm signup

**Subject:** `Confirm your Timeboxing account`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Confirm your Timeboxing account</title>
</head>
<body style="margin:0;padding:0;background-color:#F8F7F4;font-family:system-ui,-apple-system,BlinkMacSystemFont,’Segoe UI’,Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F8F7F4;">
    <tr>
      <td align="center" style="padding:48px 24px;">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;">
          <!-- Logo / App name -->
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <span style="font-size:24px;font-weight:700;color:#1C1C1E;letter-spacing:-0.02em;">The Timeboxing Club</span>
            </td>
          </tr>
          <!-- Card -->
          <tr>
            <td style="background-color:#FFFFFF;border-radius:16px;border:1px solid rgba(0,0,0,0.08);box-shadow:0 1px 4px rgba(0,0,0,0.04);padding:40px 32px;">
              <p style="margin:0 0 8px;font-size:18px;font-weight:600;color:#1C1C1E;">Welcome to The Timeboxing Club!</p>
              <p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:#636366;">
                Tap the button below to confirm your email address and activate your account.
              </p>
              <!-- CTA Button -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="{{ .ConfirmationURL }}" target="_blank"
                       style="display:inline-block;padding:14px 32px;background-color:#8DA387;color:#FFFFFF;font-size:15px;font-weight:600;text-decoration:none;border-radius:10px;line-height:1;">
                      Confirm Email
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:28px 0 0;font-size:13px;line-height:1.6;color:#AEAEB2;">
                If you didn’t create a Timeboxing account, you can safely ignore this email.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:24px;">
              <p style="margin:0;font-size:12px;color:#C7C7CC;">The Timeboxing Club — plan your day, own your time.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

### 7b. Reset password

**Subject:** `Reset your Timeboxing password`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Reset your Timeboxing password</title>
</head>
<body style="margin:0;padding:0;background-color:#F8F7F4;font-family:system-ui,-apple-system,BlinkMacSystemFont,’Segoe UI’,Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F8F7F4;">
    <tr>
      <td align="center" style="padding:48px 24px;">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;">
          <!-- Logo / App name -->
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <span style="font-size:24px;font-weight:700;color:#1C1C1E;letter-spacing:-0.02em;">The Timeboxing Club</span>
            </td>
          </tr>
          <!-- Card -->
          <tr>
            <td style="background-color:#FFFFFF;border-radius:16px;border:1px solid rgba(0,0,0,0.08);box-shadow:0 1px 4px rgba(0,0,0,0.04);padding:40px 32px;">
              <p style="margin:0 0 8px;font-size:18px;font-weight:600;color:#1C1C1E;">Reset your password</p>
              <p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:#636366;">
                We received a request to reset the password for your Timeboxing account. Tap the button below to choose a new one.
              </p>
              <!-- CTA Button -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="{{ .ConfirmationURL }}" target="_blank"
                       style="display:inline-block;padding:14px 32px;background-color:#8DA387;color:#FFFFFF;font-size:15px;font-weight:600;text-decoration:none;border-radius:10px;line-height:1;">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:28px 0 0;font-size:13px;line-height:1.6;color:#AEAEB2;">
                If you didn’t request a password reset, you can safely ignore this email. Your password will remain unchanged.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:24px;">
              <p style="margin:0;font-size:12px;color:#C7C7CC;">The Timeboxing Club — plan your day, own your time.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

### 7c. Magic link

**Subject:** `Your Timeboxing login link`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Your Timeboxing login link</title>
</head>
<body style="margin:0;padding:0;background-color:#F8F7F4;font-family:system-ui,-apple-system,BlinkMacSystemFont,’Segoe UI’,Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F8F7F4;">
    <tr>
      <td align="center" style="padding:48px 24px;">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;">
          <!-- Logo / App name -->
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <span style="font-size:24px;font-weight:700;color:#1C1C1E;letter-spacing:-0.02em;">The Timeboxing Club</span>
            </td>
          </tr>
          <!-- Card -->
          <tr>
            <td style="background-color:#FFFFFF;border-radius:16px;border:1px solid rgba(0,0,0,0.08);box-shadow:0 1px 4px rgba(0,0,0,0.04);padding:40px 32px;">
              <p style="margin:0 0 8px;font-size:18px;font-weight:600;color:#1C1C1E;">Sign in to Timeboxing</p>
              <p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:#636366;">
                Tap the button below to sign in to your Timeboxing account. This link expires in 1 hour.
              </p>
              <!-- CTA Button -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="{{ .ConfirmationURL }}" target="_blank"
                       style="display:inline-block;padding:14px 32px;background-color:#8DA387;color:#FFFFFF;font-size:15px;font-weight:600;text-decoration:none;border-radius:10px;line-height:1;">
                      Sign In
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:28px 0 0;font-size:13px;line-height:1.6;color:#AEAEB2;">
                If you didn’t request this link, you can safely ignore this email.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:24px;">
              <p style="margin:0;font-size:12px;color:#C7C7CC;">The Timeboxing Club — plan your day, own your time.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

> **How to apply:** In the Supabase Dashboard → Authentication → Email Templates, select the template type (Confirm signup, Reset password, Magic Link), replace the subject and body with the HTML above, and save.

---

## 8. Invite Code + Waitlist Tables

The app uses a gated signup system: users need an invite code to create an account, and everyone else can join a waitlist. Run this in the **SQL Editor** (both production AND staging):

```sql
-- Waitlist: people who want access
create table if not exists waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  status text not null default 'pending',  -- 'pending' | 'approved' | 'rejected'
  referral_source text,                    -- how they found the product (e.g. 'twitter', 'friend', 'search')
  created_at timestamptz not null default now(),
  approved_at timestamptz
);

-- Invite codes: required to sign up
create table if not exists invite_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  email text,                -- who this was generated for (null = generic/manual)
  created_by text not null default 'manual',  -- 'manual' | 'system'
  used_by uuid references auth.users(id),     -- user who redeemed it
  used_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz     -- null = never expires
);

-- RLS: waitlist is public-insert (anyone can join), no public reads
alter table waitlist enable row level security;
create policy "Anyone can join waitlist"
  on waitlist for insert to anon, authenticated
  with check (true);

-- RLS: invite_codes — anon can SELECT (to validate code) but not insert/update/delete
alter table invite_codes enable row level security;
create policy "Anyone can validate invite codes"
  on invite_codes for select to anon, authenticated
  using (true);
```

> **Note on RLS**: The `invite_codes` SELECT policy is safe because codes are random — you can't guess them. UPDATE on invite_codes (marking as used) is done via an Edge Function using the service role key, not from the client.

### Seeding invite codes manually

Insert codes for your first users:

```sql
insert into invite_codes (code) values
  ('TIMEBOX01'),
  ('TIMEBOX02'),
  ('TIMEBOX03');
```

Or generate codes for specific emails:

```sql
insert into invite_codes (code, email) values
  ('INVITE-ABC', 'friend@example.com');
```

---

## 9. Edge Functions (Invite Code + Waitlist)

The invite/waitlist system uses three Supabase Edge Functions. They live in `supabase/functions/` in the repo.

### Deploying

```bash
# Install Supabase CLI if not already
npm install -g supabase

# Link to your project (run once)
supabase link --project-ref YOUR_PROJECT_REF

# Set secrets
supabase secrets set RESEND_API_KEY=re_xxxxx
supabase secrets set FROM_EMAIL=noreply@yourdomain.com

# Deploy all functions
supabase functions deploy validate-and-use-invite-code
supabase functions deploy send-waitlist-email
supabase functions deploy approve-waitlist-user
```

### Functions

| Function | Purpose | Called from |
|----------|---------|------------|
| `validate-and-use-invite-code` | Marks invite code as used after signup | Frontend (AuthPage) |
| `send-waitlist-email` | Sends thank-you email via Resend | Frontend (AuthPage) |
| `approve-waitlist-user` | Generates invite code + sends email | Admin (curl/script) |

### Approving a waitlist user (admin)

```bash
curl -X POST 'https://YOUR_PROJECT.supabase.co/functions/v1/approve-waitlist-user' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"email": "user@example.com"}'
```
