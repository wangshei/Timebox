# Timeboxing Club — Project Standards

Code style, testing, commits, and definition of done so the project runs smoothly without excessive manual checking. Every engineer should follow these.

---

## 1. Code and structure

- **TypeScript:** Strict mode on. Prefer types/interfaces in `src/types.ts` for shared shapes; avoid `any` unless justified in a comment.
- **Components:** Functional components + hooks. One primary component per file; small presentational pieces can live in the same file if they’re not reused.
- **Naming:** 
  - Components: PascalCase (`TimeBlockCard.tsx`).
  - Files (non-component): camelCase or kebab-case (`taskHelpers.ts`, `dataResolver.ts`).
  - Store actions: camelCase, verb-first (`addTask`, `createPlannedBlocksFromTask`).
  - Selectors: `get*` or `select*` (`getUnscheduledTasks`, `selectPlanVsActual`).
- **Imports:** Prefer absolute or `@/` alias for `src/`. Group: React → external → internal → types. No circular dependencies.
- **State:** UI-only state (e.g. modal open, dropdown open) can stay in component state. Domain data (tasks, blocks, calendars, categories, tags) lives in the **store**. Don’t duplicate domain data in component state.

---

## 2. Testing

- **Unit (Vitest):** For pure logic: task progress, backlog filters, end-day sweep, analytics aggregation. Mock store or adapter when testing components that depend on them.
- **E2E (Playwright):** For critical paths: create task → schedule block → switch to Recording → mark done as planned → End day → verify backlog and summary. Run before merging to main when E2E is in place.
- **Coverage:** Aim for meaningful coverage on store actions and selectors; no hard percentage gate without team agreement.
- **When to add tests:** New store action or selector → unit test. New user flow that affects backlog/analytics/recording → E2E if it’s a critical path.

---

## 3. Commits and branches

- **Commits:** Small and logical. One commit = one coherent change (e.g. “Add getUnscheduledTasks selector” or “Wire End Day button to store”). Message: imperative, short summary, optional body.
- **Branching:** `main` = deployable. Feature branches: `feature/cp1-store`, `feature/recording-actions`, etc. Optionally prefix with checkpoint (e.g. `cp2-backlog-sections`).
- **Commit at reasonable intervals:** After completing a task in TASK_LIST, or after a working slice (e.g. “store + selectors for backlog” before “wire UI to selectors”). Don’t wait until a full checkpoint to commit.

---

## 4. Pull request (PR) checklist

Before requesting review (or before merging to main if solo):

- [ ] Code follows PROJECT_STANDARDS (naming, structure, no domain data duplicated in UI state).
- [ ] New/updated logic has unit tests where applicable (store, selectors, helpers).
- [ ] Critical path change has E2E coverage or a ticket to add it.
- [ ] TASK_LIST.md updated (task checked off).
- [ ] ENGINEERING_LEAD.md updated if a checkpoint is completed (mark Done).
- [ ] No secrets in code (use `.env` and `VITE_*` for client-safe vars only).
- [ ] Docs updated if you added a new integration or user-facing behavior (SYSTEM_INTEGRATION, UIUX_STANDARDS, or ONBOARDING).

---

## 5. Definition of done (for a task or checkpoint)

A task is **done** when:

- Implementation matches the spec (or documented exception in TASK_LIST/ENGINEERING_LEAD).
- Existing tests pass; new tests added as per PROJECT_STANDARDS.
- TASK_LIST item checked off; checkpoint in ENGINEERING_LEAD updated if applicable.
- Code is committed (and PR merged if applicable).

A **checkpoint** is done when all its tasks in TASK_LIST are done and the checkpoint is marked Done in ENGINEERING_LEAD.

---

## 6. Environment and secrets

- **Client:** Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the frontend. No service role or secret key in client code.
- **`.env`:** Local overrides; must be in `.gitignore`. Use `.env.example` with placeholder keys (no real values) so new devs know what to set.
- **Supabase:** RLS and auth handle security; anon key is publishable but must not be abused (rate limits, RLS policies).

---

## 7. What to update when you change things

| You changed | Update |
|-------------|--------|
| Store shape or actions | ENGINEERING_LEAD (function inventory), SYSTEM_INTEGRATION |
| Selectors or analytics | ENGINEERING_LEAD, SYSTEM_INTEGRATION |
| Persistence or API | SYSTEM_INTEGRATION, .env.example if new vars |
| UI layout or interaction | UIUX_STANDARDS if it’s a new pattern |
| Repo layout or run steps | ONBOARDING.md |
| New doc or checklist | ONBOARDING.md (read order / links), ENGINEERING_LEAD (reference links) |

---

*Keep this file the single source for “how we work”; avoid scattering standards across multiple places.*
