# The Timeboxing Club — Task List (unfinished work)

Single source of truth for what’s left to do. Link: [ENGINEERING_LEAD.md](./ENGINEERING_LEAD.md) (checkpoints, flowcharts, function inventory).

---

## How to use this list

- **Check off** when done: change `- [ ]` to `- [x]`.
- **Add** new items under the right section; if it’s a big milestone, add a checkpoint in ENGINEERING_LEAD and reference it here.
- **Prioritize** by working top-to-bottom within each section, or follow the checkpoint order (CP1 → CP2 → …).

---

## 1. Design / UI (current design gaps)

- [x] **Right sidebar:** Backlog sections — show Unscheduled (flexible), Partially Completed, Fixed/Missed, Events (per spec). *(CP2)*
- [x] **Right sidebar:** Task cards — wire “Schedule task” / “Edit” / “Delete” in TaskCard popover.
- [x] **TimeBlockCard:** Recording actions — “Done as planned” / “Done differently” / “Delete” actually create/update/delete recorded blocks. *(CP4)*
- [x] **Calendar:** Day view — filter blocks by selected date (not only today).
- [x] **Left rail:** Today summary — show both **Planned** and **Recorded** by CalendarContainer, Category, Tag; add **Plan vs Actual** comparison (e.g. side-by-side or delta). *(CP6)*
- [x] **Add Event:** Events list section in right sidebar (placeholder “No upcoming events” → real list). *(Events)*
- [x] **End Day:** Button or action to run end-of-day sweep for selected date. *(CP5)*
- [ ] **Mobile:** DraggableBottomSheet and mobile layout — ensure parity with desktop where needed.
- [x] **Calendar views:** WeekView connects to TimeBlockCard with full recording actions (confirm/skip/unconfirm). MonthView is intentionally minimal (summary only). *(CP4)*
- [x] **Side panel (Notion-style tabs):** Add a tabbed side panel for **Calendar / Tag / Category management**. Reference Notion side tab: categories (e.g. Exercise, Eating) can be **grouped under a parent** (e.g. Personal care). Panel must be **editable** — add, edit, delete calendars, categories, tags. *(CP6b)*
- [x] **Left panel hierarchy:** Calendars → Categories (under calendar) → Tags (under category). Data: `Category.calendarContainerId`, `Tag.categoryId`. Settings: category pick calendar; tag pick category. Organization tree with expand/collapse.

---

## 2. State / data (single source of truth)

- [x] **Store:** Introduce a single state store (e.g. Zustand) for tasks, timeBlocks, calendarContainers, categories, tags, events, viewMode, selectedDate, containerVisibility. *(CP1)*
- [x] **Selectors:** Backlog sections derived from store (unscheduled, partially completed, fixed/missed). *(CP1, CP2)*
- [x] **Selectors:** Analytics for **both planned and recorded** timeBlocks (by container, category, tag). *(CP6)*
- [x] **Selectors:** Plan vs Actual comparison (e.g. planned hours vs recorded hours per container/category/tag). *(CP6)*
- [x] **Store:** calendarContainers, categories, tags editable from side panel (add/edit/delete, category parent/group). *(CP6b)*
- [ ] **Remove dual format:** Migrate fully to new types (no old format in App); RightSidebar, AddModal, etc. consume store + selectors.

---

## 3. Core flows (functionality)

- [x] **Task → Planned blocks:** Create planned timeBlocks from a task (split by defaultBlockMinutes or chosen duration). *(CP3)*
- [x] **Recording — Done as planned:** Click planned block → create recorded block (same start/end). *(CP4)*
- [ ] **Recording — Done different length:** Create/adjust recorded block; optionally return remaining time to backlog. *(CP4)*
- [x] **Recording — Did something else:** Create recorded block without taskId (or different task). *(CP4)*
- [x] **End Day sweep:** For selected date, create autoAssumed recorded blocks for planned blocks with no recorded counterpart. *(CP5)*
- [ ] **Reversing assumed:** Allow user to delete or adjust an autoAssumed recorded block.

---

## 4. Drag-and-drop (Phase 3)

- [x] **Drag task to calendar:** Drop task (or task chunk) onto day grid to create planned block(s). *(CP10)*
- [ ] **Resize blocks:** Resize planned/recorded blocks on grid with 30-min snap. *(CP10)*
- [ ] **Move blocks:** Move blocks between times/days.

---

## 5. Persistence and backend (Phase 2)

**Note:** Backend is **Supabase** (auth + DB), not Vercel. Vercel can host the frontend; persistence is Supabase.

- [x] **LocalStorage (v0):** Persist store to localStorage; hydrate on load. *(optional before CP8; implemented in `main.tsx` + `useStore`.)*
- [x] **Supabase (app wiring):** Auth (Email OTP) bar in `App`, central client, load/save via `supabasePersistence.ts` for signed-in users. *(CP8 – app side)*
- [ ] **Supabase (DB hardening):** Confirm `user_id` columns, foreign keys, and RLS policies on all tables (`calendar_containers`, `categories`, `tags`, `tasks`, `time_blocks`, `events`) so each user only sees their own data. *(CP8 – DB side)*
- [ ] **Supabase:** Persistence layer — make Supabase the primary source of truth (define behavior vs localStorage, error/retry strategy). *(CP9)*

---

## 6. Tests

- [ ] **Unit (Vitest):** Helpers (e.g. task progress, parseTime), store actions, end-day sweep logic. *(CP7)*
- [ ] **E2E (Playwright):** Create task → schedule → record → end day → check backlog and analytics. *(CP7)*

---

## 7. Tech debt / cleanup

- [ ] **timeByCategory:** Use store/selectors instead of ad-hoc useMemo in App (once store exists).
- [ ] **Duplicate type exports:** Clean up App.tsx re-exports when all consumers use `src/types.ts` and store.
- [x] **Guidelines:** Populate `src/guidelines/Guidelines.md` with project-specific rules if desired.

---

## Quick reference: checkpoint → tasks

| Checkpoint | Focus | Main tasks |
|------------|--------|------------|
| CP1 | Store + selectors | Section 2 (State / data) |
| CP2 | Backlog sections | Section 1 (Right sidebar), Section 2 (Selectors) |
| CP3 | Task → planned blocks | Section 3 (Task → Planned blocks) |
| CP4 | Recording actions | Section 1 (TimeBlockCard), Section 3 (Recording) |
| CP5 | End Day | Section 1 (End Day button), Section 3 (End Day sweep) |
| CP6 | Analytics: planned + recorded, Plan vs Actual | Section 1 (Left rail), Section 2 (Selectors) |
| CP6b | Side panel: editable Calendars/Categories/Tags (tabs, Notion-style; categories groupable) | Section 1 (Side panel) |
| CP7 | Tests | Section 6 |
| CP8–CP9 | Supabase | Section 5 |
| CP10 | Drag-and-drop | Section 4 |

---

## 8. Bug fixes (Mar 6)

- [x] **Tag groups overlapping:** Increased margins/gaps for tag pills in LeftSidebar (gap-x-2.5 gap-y-3, more padding).
- [x] **Task name edits not updating on blocks:** Fixed dataResolver to prefer linked task title over stale block snapshot; propagate title in onUpdateTask.
- [x] **Bug report popover:** Show submitted text in success state; removed auto-close so user can see what was sent.
- [ ] **Drag for tasks not working on right panel:** Investigated — drag code looks correct (draggable, onDragStart, drop handlers all wired). May need live testing to reproduce.

---

*Linked from [ENGINEERING_LEAD.md](./ENGINEERING_LEAD.md). Update both when closing checkpoints or adding scope.*
