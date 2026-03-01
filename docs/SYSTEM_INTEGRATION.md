# Timeboxing Club — System Integration

How the app fits together: state, UI, persistence, and (when added) Supabase. Use this so changes in one layer don’t break another without you knowing.

---

## 1. High-level integration

- **UI** (React components) reads from **state** and calls **actions** (e.g. add task, create block, toggle mode).
- **State** holds tasks, timeBlocks, calendarContainers, categories, tags, events, viewMode, selectedDate, containerVisibility. **Selectors** derive backlog sections and analytics from state.
- **Persistence** (v0: none or localStorage; v1: Supabase) is called by state layer — UI never talks to Supabase directly.
- **Auth** (v1: Supabase Auth) gates access to persistence; session is managed in one place and passed into the data layer.

So: **UI → State (actions + selectors) → Persistence**. No UI → DB or UI → API bypassing state.

---

## 2. Data flow (summary)

- **User creates a task** → UI calls `addTask(...)` → state adds task → (v1) persistence saves.
- **User schedules a block** → UI calls `createPlannedBlocksFromTask(...)` → state adds timeBlocks with `mode: 'planned'` → (v1) persistence saves.
- **User records “done as planned”** → UI calls `markDoneAsPlanned(blockId)` → state adds a timeBlock with `mode: 'recorded'` and links to task → task progress recomputed via selectors → (v1) persistence saves.
- **User runs “End day”** → UI calls `endDay(date)` → state creates `recorded` blocks with `source: 'autoAssumed'` for unrecorded planned blocks → (v1) persistence saves.

Analytics (planned vs recorded, by container/category/tag) are **read-only derived data** from state (selectors). No separate analytics DB in v0/v1.

---

## 3. State layer (current and target)

- **Current:** App state lives in `App.tsx` (useState for tasks, timeBlocks, mode, etc.). Some derived values in useMemo. No formal store yet.
- **Target (CP1):** Single store (e.g. Zustand) with:
  - **State:** tasks, timeBlocks, calendarContainers, categories, tags, events, viewMode, selectedDate, containerVisibility.
  - **Actions:** addTask, updateTask, deleteTask; createTimeBlock, updateTimeBlock, deleteTimeBlock; markDoneAsPlanned; endDay; setViewMode; setSelectedDate; toggleContainerVisibility; CRUD for calendars/categories/tags.
  - **Selectors:** getUnscheduledTasks, getPartiallyCompletedTasks, getTimeBlocksForDate, getPlannedSummary(date), getRecordedSummary(date), getPlanVsActual(date).

When you add or change an action, document it here and in ENGINEERING_LEAD (function inventory). When you add a selector, same.

---

## 4. Persistence layer (v0 → v1)

- **v0:** In-memory only, or one-way save to localStorage (store → localStorage on change; load from localStorage on init). No auth.
- **v1 (Supabase):**
  - **Tables:** users (or auth.users + profile), calendar_containers, categories, tags, tasks, time_blocks, events. RLS so each user sees only their rows.
  - **Client:** Use `@supabase/supabase-js` with **anon key** only in the frontend. Never put service role or secret in the client.
  - **Flow:** Store actions call a **persistence adapter** (e.g. `supabaseAdapter.saveTimeBlock(block)`). Adapter talks to Supabase; store updates local state from adapter result or from Supabase realtime if desired.
  - **Auth:** Supabase Auth (e.g. Email OTP). Session in auth state; adapter sends session in requests. No custom auth in the app.

Integration rule: **store is the single source of truth**. Persistence is a side effect of store actions. If Supabase is down, the app can still update local state and queue or retry later (v1.1).

---

## 5. API / Supabase touchpoints

When Supabase is in use:

- **Auth:** `supabase.auth.signInWithOtp({ email })`, `supabase.auth.getSession()`, `supabase.auth.onAuthStateChange()`.
- **Data:** `supabase.from('tasks').select()`, `.insert()`, `.update()`, `.delete()`; same for `time_blocks`, `calendar_containers`, `categories`, `tags`, `events`. Use RLS policies so `auth.uid()` scopes all queries.
- **Realtime (optional):** `supabase.channel().on('postgres_changes', ...)` to sync other tabs or devices.

All of this lives behind the **persistence adapter**. UI and store do not import Supabase directly; they call adapter methods.

---

## 6. Integration checklist (before you ship a feature)

- [ ] New state? Add to store and (if persisted) to adapter + Supabase schema/RLS.
- [ ] New action? Implement in store; if it changes data, call adapter; document in ENGINEERING_LEAD.
- [ ] New selector? Pure function from state; used by UI for backlog or analytics; document in ENGINEERING_LEAD.
- [ ] UI reads from selector, not raw state (where a selector exists).
- [ ] No UI → Supabase or UI → localStorage directly; all through store + adapter.

---

## 7. Where things live (quick ref)

| Concern | Location |
|--------|----------|
| Types | `src/types.ts` |
| Store (target) | `src/store/` (to add) |
| Persistence adapter (target) | `src/data/` or `src/adapter/` |
| Resolving IDs → full objects for UI | `src/utils/dataResolver.ts` |
| Task/block helpers (progress, filters) | `src/utils/taskHelpers.ts` |
| Seed data | `src/data/seed.ts` |

---

*Update this doc when you add a new integration (e.g. realtime, queue, or a second backend).*
