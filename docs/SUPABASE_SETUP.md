# Supabase setup

Project URL and keys are stored in **`.env`** (gitignored). Do not commit real keys.

- **`.env.example`** — lists variable names; copy to `.env` and fill in from [Supabase Dashboard](https://supabase.com/dashboard/project/_/settings/api).
- **Frontend** uses only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- **`SUPABASE_SERVICE_ROLE_KEY`** — use only server-side (e.g. Edge Functions, backend); never in client code.
