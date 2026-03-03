# Deployment Workflow

How to fix bugs, test changes, and push them live.

---

## Branches

| Branch | Purpose | Deploys to |
|--------|---------|------------|
| `main` | Production — what users see | `app.timeboxing.club` (Vercel) |
| `develop` | Staging — test before going live | Preview URL (Vercel) |
| `feature/xyz` | Individual features/fixes | Throwaway preview URL per PR |

---

## Quick fix (small, confident change)

For typos, one-line fixes, or changes you're sure about:

```bash
# 1. Make sure you're on main and up to date
git checkout main
git pull origin main

# 2. Make your fix
# ... edit files ...

# 3. Commit and push
git add src/components/SomeFile.tsx
git commit -m "fix: describe what you fixed"
git push origin main
```

Vercel auto-deploys `main` to production. Check the Vercel dashboard or wait ~60s, then hard-refresh the app (`Cmd+Shift+R`).

---

## Standard workflow (features, bigger fixes)

### 1. Create a feature branch

```bash
git checkout main
git pull origin main
git checkout -b feature/my-change
```

### 2. Make changes and commit

```bash
# ... edit files ...
git add src/components/AuthPage.tsx src/components/NewFile.tsx
git commit -m "feat: add invite code validation"
```

### 3. Push and get a preview URL

```bash
git push -u origin feature/my-change
```

Vercel automatically creates a **preview deployment** for every branch push. Find the URL in:
- GitHub PR (if you open one)
- Vercel dashboard → Deployments

### 4. Test on the preview URL

- Open the preview URL in a browser (or incognito)
- Test the change end-to-end
- Preview deployments use the **Preview** environment variables in Vercel (can point to staging Supabase if configured)

### 5. Merge to main

**Option A — Direct merge** (if you tested and it's ready):

```bash
git checkout main
git pull origin main
git merge feature/my-change
git push origin main
```

**Option B — Pull Request** (recommended for larger changes):

```bash
# Push is already done, just open a PR on GitHub
gh pr create --title "Add invite code validation" --body "Description of changes"
```

Review the PR, then merge via GitHub. Vercel auto-deploys.

### 6. Clean up

```bash
git branch -d feature/my-change
git push origin --delete feature/my-change
```

---

## Using a staging branch (optional, for higher confidence)

If you want an extra layer before production:

```bash
# Merge feature into develop first
git checkout develop
git pull origin develop
git merge feature/my-change
git push origin develop
```

Vercel deploys `develop` to a stable preview URL. Test there. When ready:

```bash
git checkout main
git pull origin main
git merge develop
git push origin main
```

---

## After pushing — verify the deploy

1. **Vercel dashboard**: Check that the deployment succeeded (green checkmark)
2. **Hard refresh**: `Cmd+Shift+R` on the live site (browsers cache aggressively)
3. **Incognito window**: Open `app.timeboxing.club` in incognito to bypass all caches
4. **Check the deployment log**: If something looks wrong, Vercel → Deployments → click the latest → view build logs

---

## Deploying Supabase Edge Functions

Edge functions are NOT deployed via git push. Deploy them manually:

```bash
cd /path/to/Timebox

# Deploy a specific function
supabase functions deploy validate-and-use-invite-code --no-verify-jwt
supabase functions deploy send-waitlist-email --no-verify-jwt
supabase functions deploy approve-waitlist-user --no-verify-jwt

# Set secrets (only needed once, or when keys change)
supabase secrets set RESEND_API_KEY=re_xxxxx
supabase secrets set FROM_EMAIL="The Timeboxing Club <noreply@yourdomain.com>"
supabase secrets set APP_URL=https://app.timeboxing.club
```

View deployed functions: https://supabase.com/dashboard/project/ncytumkcrqudybidndmy/functions

---

## Rolling back

If a deploy breaks something:

**Option A — Revert the commit:**

```bash
git revert HEAD
git push origin main
```

This creates a new commit that undoes the last change. Safe and traceable.

**Option B — Redeploy a previous commit via Vercel:**

Go to Vercel → Deployments → find the last working deployment → click "..." → "Promote to Production". Instant rollback, no git changes needed.

---

## Common gotchas

| Problem | Fix |
|---------|-----|
| Changes don't show on the live site | Hard refresh (`Cmd+Shift+R`) or open incognito |
| Vercel build fails | Check build logs in Vercel dashboard; usually a TypeScript error |
| Edge function not working | Check function logs: Supabase dashboard → Functions → select function → Logs |
| "Permission denied" or RLS errors | Run the SQL from `docs/SUPABASE_SETUP.md` in the Supabase SQL editor |
| Merge conflicts | Resolve in your editor, `git add` the fixed files, then `git commit` |

---

## Environment variables

### Vercel (frontend)

Set in Vercel → Project → Settings → Environment Variables:

| Variable | Where | Value |
|----------|-------|-------|
| `VITE_SUPABASE_URL` | Production + Preview | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Production + Preview | Your Supabase anon (public) key |
| `VITE_SITE_URL` | Production | `https://app.timeboxing.club` |

### Supabase (edge functions)

Set via `supabase secrets set`:

| Secret | Purpose |
|--------|---------|
| `RESEND_API_KEY` | Sending emails via Resend |
| `FROM_EMAIL` | Sender address for emails |
| `APP_URL` | Link in invite/waitlist emails |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto-provided; used by edge functions to bypass RLS |
