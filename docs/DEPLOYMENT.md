# Deployment (Vercel)

**Do this early** so every commit gives you a working link. No in-app account creation (Supabase auth) is required for Vercel — the live URL works with mock/seed data until auth is added later (CP8).

---

## Order: Vercel before in-app auth

| Step | What | When |
|------|------|------|
| 1 | **Vercel** — Connect repo, get live URL | Now (early) |
| 2 | **In-app accounts** — Supabase auth (CP8) | Later |

- **Vercel first** → Push to main (or your branch) → Vercel deploys → You see the app at a stable URL (e.g. `timebox-xxx.vercel.app`). You can share it and test each checkpoint live.
- **Account creation** (Supabase auth) comes in CP8. Until then, the Vercel link shows the app with seed/mock data; after auth, the same URL will show login and per-user data.

---

## 1. Vercel account

- Sign up at [vercel.com](https://vercel.com) (GitHub/GitLab/Bitbucket or email).
- No payment needed for hobby use.

---

## 2. Connect the repo

1. In Vercel: **Add New Project** → **Import Git Repository**.
2. If the repo isn’t on GitHub/GitLab/Bitbucket yet, push the Timebox app to a new repo first, then import that repo.
3. Vercel will detect **Vite** and set:
   - **Build Command:** `npm run build` (or `vite build`)
   - **Output Directory:** `dist` (Vite’s default)
   - **Install Command:** `npm install`
4. Click **Deploy**. The first deployment will create a URL like `your-project.vercel.app`.

---

## 3. Auto-deploy on each commit

- **Production:** Pushes to `main` (or your default branch) trigger a production deploy. The production URL updates with every such commit.
- **Preview:** Other branches get a unique preview URL per deployment, so you can test before merging.

So: **commit → push → Vercel builds and deploys → open the link** to see that step of progress live.

---

## 4. Environment variables (when you add Supabase)

When you add Supabase (CP8/CP9), add these in Vercel:

- **Project → Settings → Environment Variables**
- Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (same values as in local `.env`).
- Use **Production** (and optionally Preview) so the live app can talk to Supabase. Redeploy after adding vars.

---

## 5. Build and output (reference)

- **Local build:** `npm run build` → output in `dist/` (see `vite.config.ts`).
- Vercel runs the same command; no extra config needed for a standard Vite + React app.

---

*Summary: Integrate Vercel early so every commit gives a working link. Add in-app account creation (Supabase auth) later in CP8; the same Vercel URL will then serve the app with login.*
