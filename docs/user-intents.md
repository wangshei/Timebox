# Timebox user intents and acceptance checklist

Purpose: a product-spec style list of everything a user can reasonably WANT to do with each kept feature, the
behavior they should expect, and whether the code does it today. Written from the user's point of view; each row
was checked against the code (static read, nothing executed).

Scope: events, notes/todos (note = Task with `isTodo === false`, todo = Task with a checkbox), repeating events and
todos, keyboard shortcuts, drag todos/notes into the calendar, stickers incl. the red cross "didn't happen", Google
Calendar sync, sharing events/calendars + guests + RSVP, onboarding, settings, calendar/category/tag tree, bug report,
undo/redo, day / 3-day / week / month views, mobile app (`src/components/MobileApp.tsx`).
Parked and ignored: compare mode, activity panel, booking links, auto-schedule.

Companion doc: `docs/flows.md` (code flows + bugs B-01..B-61). This file does not repeat those bugs; it cross-references
them (B-xx). Problems found here that are NOT in flows.md get ids N-01..N-26 and are collected in the prioritized list
at the end.


## STATUS UPDATE 2026-10-11 (fix pass)

Rows flipped to fixed in the tables below: E-06/07/09/10/12/22/23/24/25/29/31-34/36, T-03/04/05/06/09/12-15/19, S-01/02/08/11,
K-03/05, U-01/02/04/06/07, G-01/03/05-08/15, Z-02/03/05. Still open (unchanged): E-05, E-08, E-14, E-19, E-20, E-27/28 (the cross is
the only "didn't happen" for now, by decision), E-37/38, KB-06 partly (now `[`/`]`/`.` = prev/next/today; arrow keys not bound), KB-07, S-12, G-09/10/12/14,
GC-03/05/07, Z-06, O-02/03, C-01..C-12 mobile gaps, MG-07/09/10/11. Rows E-09, T-09, K-05, Z-03 need the SQL in
`supabase/migrations/20261013_recurring_tasks_stickers_timezone.sql` to be applied to persist across devices.

### N-xx list status
FIXED: N-01 (needs migration), N-02, N-03, N-04, N-05, N-06, N-07, N-08, N-10 (floating no longer shifts; zone persists with migration;
epoch-in-event-zone arithmetic still device-zone), N-14 (Esc, `[`/`]`/`.`, Ctrl+Y; card focusability still open), N-15, N-16 (events; notes unchanged),
N-17, N-18 (alerts -> toasts, drop feedback), N-19, N-20 (undo for tree deletes), N-21 (labels), N-22 (guests told when a series end date shortens it),
N-26 partial (todo repeat end date, series delete for todos).
PARTIAL: N-13 (Plan tab with long-press drag, Undo toast; Settings/sign-out/Google/share on mobile still absent), N-09 (cross sticker is now
persisted + undoable; attendance model left separate by decision), N-25 (title/labels fixed; notes/guests/repeat info in sheet still missing).
OPEN: N-11, N-12, N-23, N-24.

## How to read this file

- Status: ✅ works as a user would expect. ⚠️ works but is illogical, inconsistent, or lossy (reason given).
  ❌ missing or broken (file:line, B-xx if already tracked, N-xx if new).
- "D" = desktop web app, "M" = mobile app (`MobileApp.tsx`, shown when the viewport is not desktop). `—` = not
  applicable. Where D and M differ the table gives both.
- Line numbers are from the working tree on 2026-10-11. `src/` is being edited by other agents while this audit ran
  (MobileApp.tsx drifted by about 35 lines mid-audit), so treat numbers as plus/minus 40 and search by symbol name.
- Terms: event = `Event` row (fixed time, can have guests). Todo/note = `Task`. Block = `TimeBlock` (a todo scheduled
  on the grid). Series = rows sharing `recurrenceSeriesId` (events are materialized, max 52 rows; todos are lazily
  materialized per visible week).

Server-side items in flows.md that look already addressed in the (uncommitted) working tree, not re-audited here:
B-24 (`esc()` in `supabase/functions/share-invite/index.ts:86`), B-32 (per-user rate limit, index.ts:100-116),
B-33 (`rsvp-inbound` refuses when secret unset, rsvp-inbound/index.ts:173), B-05 (migration
`20261012_calendar_shares_unique.sql`), B-53 (`addMember` now emails), B-55 (role selector offers viewer only),
B-45 (single-key shortcuts now ignore modifier combos, App.tsx:2708). Flow 3.10 (mobile drag todo into calendar) in
flows.md is stale: `PlanTab` is dead code (see N-13).

---------------------------------------------------------------------------------------------------------------

## 1. Events

### 1.1 Create

| # | Intent | Expected behavior | D | M | Code / notes |
|---|--------|-------------------|---|---|--------------|
| E-01 | Create by dragging a time range on the grid | Press-drag in Day/3-day/Week, snaps 15 min, minimum 15 min; on release the Add panel opens beside the slot in Event mode with date/start/end filled; Enter saves | ✅ | — | `DayView.tsx:222-303`, `App.tsx:2176 handleCreateBlock`. Mouse only: no touch, no keyboard way to create at a slot |
| E-02 | Create from a button or key (`e`, "+") | Panel opens for the date I am looking at | ⚠️ | ⚠️ | `handleOpenAddModal` (App.tsx:1510) passes no date, `AddModal.tsx:419` falls back to today at 09:00-10:00. Viewing next Tuesday and pressing `e` creates for today. N-16. Mobile `AddSheet` also defaults to today (`eventDate` state) while the Schedule-tab quick form uses the viewed day |
| E-03 | Create a plain same-day event | Title, calendar, category (required), optional tags/notes/link; appears immediately; remembers last category | ✅ | ✅ | `handleAddEvent` App.tsx:1344. Tags are dropped for events (B-14). With zero calendars the panel offers "Add a calendar first" (AddModal.tsx ~985) |
| E-04 | Create an event in the past ("I was in a meeting 9-10") | Saved as an unplanned/actual event | ✅ | ✅ | `isPastEvent` App.tsx:1370 (ignores `endDate`, B-15) |
| E-05 | Create an all-day event | A banner at the top of the day, not a 00:00-23:59 block | ❌ | ❌ | No control anywhere; imported all-day events render as 00:00-23:59 blocks (B-22) |
| E-06 | Create an event that crosses midnight (22:00 to 02:00) | End earlier than start auto-advances the end date; card splits across both day columns | ✅ | ✅ | D: `AddModal.tsx:462-472`, `crossDateEvents.ts`. M: no end date, end<start accepted, negative duration (B-36). Display problems in N-06 |
| E-07 | Prevent an impossible range | End must be after start (or an end date later) | ✅ | ✅ | D: end == start on the same day is accepted (zero-length card; `AddModal.tsx:464` only handles end < start). M: any range accepted (B-36). N-19 |
| E-08 | Add a location | A location field, shown on the card/popover | ❌ | ❌ | `Event.location` exists in `types.ts` but no form field sets it; only Google imports. Link/meeting URL works (Join pill) |
| E-09 | Create a repeating event | Pick none/daily/every other day/weekly/monthly/custom weekdays and an end ("until" or count) | ✅ | ❌ | D: no end choice at creation; fixed 52 occurrences (daily = ~7 weeks) B-17; monthly skips short months B-18. M: cannot create repeats (B-37) |
| E-10 | Create a custom-weekday series starting on a day that is not selected | Either include the chosen date or tell me why not | ✅ | — | `generateRecurrenceDates` custom branch only emits selected weekdays, so clicking Tue with Mon/Wed/Fri selected silently starts Wed and nothing is created on Tue. N-17 |
| E-11 | Create with guests | Invite chips, confirm popup, emails sent | ✅/⚠️ | ❌ | See section 7 (B-01, B-03, B-04). M has no guest UI |
| E-12 | Create a repeating event with guests | Guests get the whole series | ✅ | ❌ | B-01 (first occurrence only) |
| E-13 | Choose time zone for the event | Floating or a named zone; shown in the summary | ✅ | ❌ | Toggle + picker, `AddModal.tsx:836-905`. Semantics problems: N-10 |

### 1.2 View, edit, move, resize, duplicate

| # | Intent | Expected behavior | D | M | Code / notes |
|---|--------|-------------------|---|---|--------------|
| E-14 | See details of an event | Click/tap shows title, time, date, category, calendar, repeat, guests with RSVP state, notes/link | ⚠️ | ⚠️ | D popover (`EventCard.tsx:498-955`) shows only the start date and no end date or time zone for cross-midnight/zoned events; RSVP marks show accepted/declined/tentative only after reload (B-34). M `DetailSheet` shows no event notes, guests, or repeat info (it reads only the linked task's fields) and the header always says "Event" even for task blocks. N-25 |
| E-15 | Edit one event | Open editor, change anything, Save | ✅ | ✅ | D: Edit button -> AddModal (`onUpdateEvent` App.tsx:4177). M: title/date/start/end/category only. Not undoable on D (B-31). M writes unpadded times (B-35) |
| E-16 | Move to another time/day by dragging | Duration preserved, wraps across midnight, ghost preview, guests prompted | ✅ | ❌ | D: `handleMoveEvent` App.tsx:2297. M: no drag; edit the time in the sheet (flows 2.3) |
| E-17 | Move one occurrence of a series | Prompt This / This and following / All | ✅ | ❌ | `pendingEventMove` prompt App.tsx ~4020. Dismissing the prompt silently picks "this" |
| E-18 | Resize by dragging the bottom edge | End time changes, up to 24 h, may cross midnight | ✅ | ❌ | `DayView.tsx:326-348`. Only the dragged row changes even in a series, no scope prompt (B-29) |
| E-19 | Duplicate an event (copy to another time) | "Duplicate" menu item or modifier-drag copy | ❌ | ❌ | No such action exists. N-26 |
| E-20 | Overlapping events | Side by side; I can still reach each one | ⚠️ | ✅ | Past overlapping items are truncated and the older one is ghosted to 15% opacity (`DayView.tsx:417-440, 780`), effectively hiding it. "Split around overlaps" exists. N-24 |
| E-21 | Join a meeting from the card | One-click Join for Meet/Zoom/Teams links | ✅ | ❌ | `EventCard.tsx:405` |

### 1.3 Delete, skip, "didn't happen"

| # | Intent | Expected behavior | D | M | Code / notes |
|---|--------|-------------------|---|---|--------------|
| E-22 | Delete a single event | Click -> Delete; gone; Undo restores | ✅ | ✅ | D: no confirm, snapshot saved, Cmd+Z restores (stickers do not come back, B-31). M: sheet "Delete event" and swipe-left Delete, no confirm and no undo UI (N-13) |
| E-23 | Delete a recurring event | Prompt: This event / This and following / All events | ✅ | ✅ | D: `EventCard.tsx:865-891`, `handleDeleteEventSeries` App.tsx:2462. M deletes the one row with no prompt (B-37). Series delete leaves stickers (B-30) |
| E-24 | Delete with the Delete/Backspace key | Same as the button, including the series prompt | ✅ | — | `CalendarView.tsx:186-203`: key on a selected event removes only that occurrence immediately, no prompt, no guest cancel. N-14 |
| E-25 | Delete an event that has guests | Warn that guests will be cancelled; send cancel; revoke share | ✅ | ✅ | B-02b |
| E-26 | Skip one occurrence only | Delete "This event" and the rest stay | ✅ | ❌ | Rows are independent. A later "repeat until" extend never refills deleted gaps (App.tsx ~4247 comment) |
| E-27 | Mark a past event as "didn't happen" | Red cross on the card, excluded from stats, reversible | ⚠️ | ⚠️ | Two unconnected mechanisms: (a) popover "Mark as not attended" sets `attendanceStatus` (past events only, `EventCard.tsx:662`, persisted, drives stats and diff view); (b) the red cross stamp from the sticker tray (`EventCard.tsx:123-131`) or mobile "Didn't happen" (`MobileApp.tsx ~418`), which is a sticker: not persisted to the cloud (B-44), not in undo, no effect on stats, allowed on future events. Mobile never shows attendance. N-09 |
| E-28 | Mark an event as attended | Explicit "attended" state | ❌ | ❌ | `'attended'` exists in the type but no UI sets it; past events count as attended by default (`selectors.ts:232`) |

### 1.4 Repeating events: edit, change pattern, end date

| # | Intent | Expected behavior | D | M | Code / notes |
|---|--------|-------------------|---|---|--------------|
| E-29 | Edit one occurrence only | Choose "This event", change, others untouched | ✅ | ✅ | D ✅. M edits the row with no scope and no indication it belongs to a series |
| E-30 | Edit this and following | Changes apply from here on | ⚠️ | ❌ | D works; "repeat until" with this scope extends from the series end not the edit point (B-21) |
| E-31 | Edit all events | Every occurrence updated | ✅ | ❌ | D: the modal sends every field, so "All" also overwrites per-occurrence customizations: an occurrence you moved to a different time snaps back, per-occurrence notes/links are replaced (`App.tsx:4231 sharedUpdates`). No warning, no marker for "modified" occurrences. N-08 |
| E-32 | Edit one occurrence, then later edit the series | The customized occurrence keeps its customization or I am asked | ✅ | — | Same root cause as E-31. N-08 |
| E-33 | Change the pattern (weekly -> daily) | Series regenerated | ✅ | ❌ | B-20 |
| E-34 | Stop repeating (make it a single event) | Remaining rows removed, or this row detached | ✅ | ❌ | B-20. With scope "this" + repeat none only that row gets `recurring:false`, it keeps its `recurrenceSeriesId`, so the move prompt still treats it as a series member while Edit/Delete skip the scope picker (`EventCard.tsx:914,936` need `recurring`, `App.tsx:2302` needs only the series id). N-15 |
| E-35 | Change the end date of the series | Later date extends, earlier date trims | ⚠️ | ❌ | D works only when editing with scope all / this-and-following (`AddModal.tsx:536`, App.tsx ~4247). Trimming deletes occurrences with no confirmation, no guest cancel, orphans stickers. N-22. Not available at creation (B-17) |
| E-36 | Turn a single event into a repeating one | Pick a pattern in the editor | ✅ | ❌ | Works, but may silently re-anchor the date (B-26) and copies attendees without shares (B-01) |

### 1.5 Conversions

| # | Intent | Expected | D | M | Notes |
|---|--------|----------|---|---|-------|
| E-37 | Event -> todo/note, todo/note -> event | Convert in place keeping title/category | ❌ | ❌ | No path. The Add panel's Event/Note switch exists for new items only (`AddModal.tsx:683`), disabled when editing. N-26 |
| E-38 | Block -> event | Turn a scheduled todo block into a plain event | ❌ | ❌ | `convertTimeBlockToEvent` is only used by the legacy draft flow |

---------------------------------------------------------------------------------------------------------------

## 2. Notes and todos

Model reminder: Add panel title says "New Note"; the "Todo" checkbox is unchecked by default (note = sticky note, no
checkbox). Right-sidebar "+" (tooltip "Add to-do") and key `t` open this same panel.

| # | Intent | Expected behavior | D | M | Code / notes |
|---|--------|-------------------|---|---|--------------|
| T-01 | Jot a note | Type a title, Enter; yellow sticky card, no checkbox, sits in Unscheduled | ✅ | ⚠️ | D ✅. Terminology is inconsistent: the sidebar button says "Add to-do" but creates a note (`RightSidebar.tsx:341` vs `AddModal.tsx:192,416`); mobile FAB says "New Task" and the sheet says "New Note" (`MobileApp.tsx ~301, 1002`). N-21 |
| T-02 | Create a todo | Tick "Todo"; estimate (15 min - 8 h), due date, priority, link | ✅ | ⚠️ | D ✅ (`AddModal.tsx:736-800`). M: `AddSheet` ✅ (estimate 5-240 min, due, tags, Todo checkbox); the To-Do tab quick-capture bar ("Read book 30min") creates `isTodo` undefined = todo, while the sheet defaults to note. N-04 |
| T-03 | See my todos | Sidebar lists scheduled todos by day (this week) or by due date; Plan toggle sizes cards by duration; Unscheduled section; Done folds | ✅ | ✅ | D `RightSidebar.tsx:201-232`. A todo that is done and has no block is shown nowhere (line 211). N-02. M: To-Do tab All/Today/Done filters with counts. "Today" means "has a block today", not "due today" |
| T-04 | Edit title/estimate/due/priority/category/notes | Edit details, Save | ✅ | ✅ | D: `onUpdateTask` App.tsx:4150, not undoable (B-31); priority cannot be cleared inside the editor (card star cycles back to none). M: only the duration slider in the expanded row; no title/due/priority/notes edit. N-04 |
| T-05 | Complete a todo | One click on the circle/checkbox; its blocks turn done | ✅ | ✅ | D `handleMarkTaskDone` App.tsx:1197 marks task and all blocks atomically. M sets status only, block stays "missed" (B-39) |
| T-06 | Un-complete a todo | Click again; returns to its list | ✅ | ✅ | D works but if it has no block it is invisible after completion so you cannot click it again (N-02; only Cmd+Z). M: Done filter + tap checkbox ✅ |
| T-07 | Complete a note | Notes have no checkbox by design; delete when finished | ✅ | ✅ | `TaskCard.tsx:371,482` hide the done controls for notes. But a note that has been scheduled shows a done circle on its calendar block (`TimeBlockCard` has no `isTodo` handling) and "Mark as done" in its block popover. N-21 |
| T-08 | Turn a note into a todo, or back | Toggle the Todo checkbox in the editor, id and blocks kept | ✅ | ❌ | D `AddModal.tsx:333,517`. Persistence needs migration `20261011_task_is_todo.sql`; if the column is missing the retry strips `is_todo` (`supabasePersistence.ts:401-410`) and every note reloads as a todo. M has no edit |
| T-09 | Create a repeating todo | Same repeat picker as events; next copy appears when that week comes | ✅ | ❌ | D lazy materialization works in-memory (`expandRecurringTasks` useStore.ts:321). The recurrence fields are NOT in the cloud schema (`supabasePersistence.ts:221-237 load`, `:385-402 save`): after any cloud reload the head becomes a plain todo and generation stops. N-01 (confirms B-43). No end date/"until" for todos. M cannot create repeats (B-39) |
| T-10 | Complete one instance of a repeating todo | Only that day's copy done; the series continues | ✅ | ✅ | Dedup by (seriesId, dueDate) |
| T-11 | Skip one instance | Delete that day's copy; never comes back | ✅ | ❌ | `deleteTask` records an exception (useStore.ts:305-319). But moving an instance's due date regenerates the old date (B-42) |
| T-12 | Stop a repeating todo / delete the series | "Delete series" or "Stop repeating" | ✅ | ❌ | No series delete (B-41). Turning repeat off on the head only clears the pattern (App.tsx:4152); already-materialized instances stay as ordinary todos |
| T-13 | Change the pattern of a repeating todo | Future copies follow the new pattern | ✅ | ❌ | B-43 |
| T-14 | Convert single todo <-> repeating | Pick/clear a repeat in the editor | ✅ | ❌ | Single->repeating works (head created, instances expand). Repeating->single leaves the other instances. B-43 |
| T-15 | Delete a todo or note | Delete, its blocks go too, Undo restores | ✅ | ✅ | D: "Delete todo" (label also shown on notes, `TaskCard.tsx:400`), no confirm, snapshot saved. M has no delete for todos at all. N-04 |
| T-16 | Set priority | Click stars to cycle 1-5 then none | ✅ | ❌ | `onTogglePin` App.tsx:3911. M shows stars read-only |
| T-17 | See what is overdue/due soon | Red styling, "Overdue"/"Due Mar 3", sorted by urgency; Day view shows what is due that day | ✅ | ⚠️ | D ✅ (`RightSidebar.tsx:116-142`, `DayView.tsx:121`). M: Schedule tab lists tasks due on the viewed day only; overdue tasks from earlier days are visible only in the To-Do tab |
| T-18 | Change the estimate | Drag the card bottom (Plan view) or edit | ✅ | ⚠️ | D `onResizeTask`. M slider only in the expanded row. Resizing a block on the grid does not change the estimate |
| T-19 | Break a todo into smaller pieces / split off a block | Same todo metadata preserved on each piece | ✅ | — | `handleBreakIntoChunks` (App.tsx:1471) deletes the original and creates N new tasks copying only title/estimate/calendar/category/tags/due: priority, notes, link, description, and the note-vs-todo flag are lost (a note becomes a todo), recurrence lost. `handleSplitTask` same. N-05 |

---------------------------------------------------------------------------------------------------------------

## 3. Scheduling todos/notes into the calendar and back

| # | Intent | Expected behavior | D | M | Code / notes |
|---|--------|-------------------|---|---|--------------|
| S-01 | Drag a todo/note onto the day grid | Ghost follows cursor, drop creates a block at the slot with duration snapped to 15 min | ✅ | ✅ | D `handleDropTask` App.tsx:2015. M: `PlanTab` (the only drag UI, `MobileApp.tsx ~1131`) is not reachable: `MobileTab` is `'schedule' | 'todo'` (line 88). N-13 |
| S-02 | Drop when the estimate is already fully scheduled | Tell me or allow extra time | ✅ | — | Silent `return` (App.tsx:2041-2043); the drag just snaps back. N-18 |
| S-03 | Drop into the past ("I did this at 3pm") | Becomes an actual (recorded) block; overlap picker if clashing | ✅ | — | Uses legacy `mode:'recorded'` (B-38) |
| S-04 | Schedule via a dialog | "Schedule todo": pick date/time/length | ✅ | ✅ | D `ScheduleTaskModal`; M: To-Do tab "Schedule today" / "Reschedule" picker. Writes unpadded "9:00" times on D via `createPlannedBlocksFromTask` (`useStore.ts:428,458,484`) and on M (B-35). N-07 |
| S-05 | One-tap "put it in the next free slot" | Finds the next gap today/this week | ✅ | ✅ | D "Reschedule later" (`handleRescheduleLater` App.tsx:1801): does nothing when the todo is already fully planned (returns inside the store with no feedback). M: tap an Unscheduled card in the Schedule tab or "Schedule today". Both use blocking `alert()` for results. N-18 |
| S-06 | Move a block | Drag within/between days; past planned blocks are frozen, moving one into the future unfreezes it | ✅ | ❌ | `handleMoveBlock` App.tsx:2213 |
| S-07 | Resize a block | Drag bottom edge | ✅ | ❌ | `handleResizeBlock` |
| S-08 | Unschedule a block (todo returns to Unscheduled) | An explicit "Unschedule" action; the todo itself is kept | ✅ | ✅ | D: possible only by dragging the block onto the right sidebar (`onDropBlock`, App.tsx:3906, undiscoverable) or the Delete key (`CalendarView.tsx:196`). The block popover's "Delete" calls `onDeleteTask` and deletes the whole todo with all its blocks (`TimeBlockCard.tsx:819-825`). Same word, opposite results. M: "Delete event"/swipe Delete removes only the block (labelled "event"). N-03 |
| S-09 | Mark a block done / not done | Circle in the corner or popover; task becomes done when all blocks are done | ✅ | ⚠️ | D `handleConfirmBlock` App.tsx:1239 (a skipped sibling blocks completion, B-40). M: quick check/X only on past pending blocks; a confirmed block cannot be un-confirmed from the sheet (it only offers "Mark task not done", which leaves the block confirmed). N-04 |
| S-10 | Skip a missed block | X marks it skipped, task returns to Unscheduled | ✅ | ✅ | `skipBlock`; M X button on past pending blocks |
| S-11 | Need more time | "Add time to complete" creates a continuation todo and books it in the next gap | ✅ | — | `handleAddTimeToComplete` App.tsx:1937: copies notes/priority/link but not the note-vs-todo flag or recurrence; uses `alert()`. N-05 |
| S-12 | Todo -> event or block -> event | Convert | ❌ | ❌ | See E-37/E-38 |
| S-13 | Edit a past planned block | Edit is blocked ("the plan is history"); only done/skip/reschedule | ✅ | ⚠️ | D hides Edit/Delete (`TimeBlockCard.tsx:797`). M's detail sheet still lets you edit and delete past blocks |

---------------------------------------------------------------------------------------------------------------

## 4. Stickers and the red cross

| # | Intent | Expected behavior | D | M | Code / notes |
|---|--------|-------------------|---|---|--------------|
| K-01 | Enter stamp mode, pick an emoji, click to place | Tray offers 4 emoji + red cross + "+" for any emoji; Esc leaves, arrows cycle | ✅ | ❌ | `CalendarView.tsx:26, 163-183, 700-760`. No stickers on M except the cross |
| K-02 | Put a sticker on a card or a free time slot | Card stickers follow the card; slot stickers stay on the date | ✅ | ❌ | Stickers follow date changes on move (useStore.ts:377-385, 827-834) |
| K-03 | Remove a sticker | Click it | ✅ | ❌ | Deletes immediately with no undo (stickers are not in the history snapshot, `useHistoryStore.ts:8-15`) |
| K-04 | Mark something "didn't happen" with the red cross | Cross over the whole card; click the center badge to remove | ⚠️ | ⚠️ | Visual only, see E-27 / N-09. Works on events and blocks on D, in the mobile detail sheet and mobile list |
| K-05 | Stickers survive reload/other device | Persist | ✅ | ✅ | B-44 (local only) |
| K-06 | Stickers go with their card when it is deleted | Removed | ✅ | ✅ | Single delete only; series delete leaves them (B-30) |

---------------------------------------------------------------------------------------------------------------

## 5. Views, navigation, empty states

| # | Intent | Expected behavior | D | M | Code / notes |
|---|--------|-------------------|---|---|--------------|
| V-01 | Switch Day / 3-day / Week / Month | Buttons and keys `d 3 w m` | ✅ | ❌ | M has a single day list only (flows 7.7) |
| V-02 | Go to previous/next period and Today | Chevrons and a Today button | ✅ | ✅ | `CalendarView.tsx:327-336`; M chevrons + Today chip. No keyboard/swipe-to-change-day on either |
| V-03 | Month overview | See what is on each day, click an item to inspect, click a day to open it | ⚠️ | — | `MonthView.tsx`: events are not clickable (only stop propagation), always indigo regardless of category, cross-midnight events appear on the start day only (`e.date === dateStr`, line 98), "+N more" is plain text, block click only sets selection (no popover), no done/missed state, day click jumps to 3-day (`CalendarView.tsx:664`) not Day, no create. N-12 |
| V-04 | Create or drag in 3-day/Week across columns | Same as Day | ✅ | — | Shared drag system |
| V-05 | Week starts on Monday or Sunday | Setting | ✅ | — | `SettingsPanel.tsx:792` |
| V-06 | See "now" | Current-time line, auto-scroll near 7 am | ✅ | ✅ | M has a "Now / Up next / Free until" card |
| V-07 | Show past items at full strength | Eye toggle | ✅ | — | `revealPast` |
| V-08 | Focus one calendar/category | Dims everything else; `a` shows all | ✅ | — | Events dim via `focusMuted` |
| V-09 | View the calendar in another time zone / secondary columns | Day view columns and a view-timezone | ✅ | — | `DayView.tsx:369`, Settings secondary time zones |
| V-10 | Empty states | New user and empty day tell me what to do | ⚠️ | ✅ | D: sidebar has empty copy ("Nothing scheduled this week", "Nothing unscheduled"); an empty day grid has no hint. M: "Nothing scheduled. Tap + to add.", "No plans for the morning" |
| V-11 | Hide/show a whole calendar | Eye toggle in the left sidebar | ✅ | ❌ | `containerVisibility`; M has no filters |

---------------------------------------------------------------------------------------------------------------

## 6. Keyboard-only use (desktop)

| # | Intent | Expected | Status | Code / notes |
|---|--------|----------|--------|--------------|
| KB-01 | Switch views | `d 3 w m` | ✅ | App.tsx:2710-2713; ignored while typing and with Cmd/Ctrl/Alt held |
| KB-02 | New note / new event | `t` / `e` | ✅ | App.tsx:2716; skipped while any modal is open. Opens for today (E-02) |
| KB-03 | Show all calendars | `a` | ✅ | |
| KB-04 | Undo / redo | Cmd/Ctrl+Z, +Shift redo | ⚠️ | App.tsx:2695. No Ctrl+Y; no on-screen undo/redo button or "Undo" toast after deleting, so users must know the shortcut (N-14) |
| KB-05 | Close the Add panel / popovers with Esc | Esc | ❌ | `AddModal` only closes by backdrop click or X; Event/Block/Todo popovers have no Esc handler. Esc works in stamp mode, ShareModal, ds `Modal`, onboarding tour. N-14 |
| KB-06 | Move between days / jump to today | `[`/`]` or arrow keys, `.` or `t` | ❌ | No key bindings (`t` is taken by "new note"). N-14 |
| KB-07 | Reach and open a calendar item without a mouse | Tab to a card, Enter opens, Delete deletes | ❌ | Cards are plain `div`s without tabindex/role; selection requires a click. N-14 |
| KB-08 | Delete the selected item | Delete/Backspace | ⚠️ | Different results by type: event = that occurrence, block = unschedule, nothing for todos (E-24, S-08) |
| KB-09 | Submit forms | Enter submits Add panel, mobile sheets | ✅ | form `onSubmit` |
| KB-10 | Create at a time slot from keyboard | | ❌ | Grid creation is mouse-only (E-01) |

---------------------------------------------------------------------------------------------------------------

## 7. Undo and redo

| # | Intent | Expected | D | M | Code / notes |
|---|--------|----------|---|---|--------------|
| U-01 | Undo my last delete/move/resize/complete | Cmd+Z restores | ✅ | ✅ | `saveSnapshot` before most direct actions. M saves snapshots but nothing ever calls `undo` and there is no button/shake gesture (`MobileApp.tsx` has no `.undo(`). N-13 |
| U-02 | Undo an edit made in the editor | Cmd+Z reverts it | ✅ | ❌ | `onUpdateEvent`/`onUpdateTask` take no snapshot (App.tsx:4150,4177; B-31). Cmd+Z then undoes an earlier, unrelated action |
| U-03 | Undo deleting a calendar/category/tag | Restores items it cascaded | ❌ | — | `deleteCategory`/`deleteTag` are wired straight to the store (App.tsx ~2997) with no snapshot; cascade is B-60. N-20 |
| U-04 | Undo restores stickers | | ❌ | — | Snapshot has no stickers |
| U-05 | Redo | Cmd+Shift+Z | ✅ | — | |
| U-06 | History is per user | New sign-in starts clean | ✅ | — | B-46 |
| U-07 | See what will be undone | A toast/label | ✅ | ✅ | Only console logs |

---------------------------------------------------------------------------------------------------------------

## 8. Sharing: guests, RSVP, shared calendars

### 8.1 Events with guests (organizer)

| # | Intent | Expected | D | M | Code / notes |
|---|--------|----------|---|---|--------------|
| G-01 | Invite someone when creating an event | Add email chips; confirm popup "Send invitations"; they get an email with an .ics and an "Add to Google Calendar" button | ✅ | ❌ | `sendNewInvites` App.tsx:1534. "Skip" still leaves "Invited" chips (B-03); 2 s race (B-04). Requires edge deploy |
| G-02 | Add a guest to an existing event | Edit -> add email -> save | ✅ | ❌ | App.tsx:4177-4230 |
| G-03 | Remove a guest | Toggle chip off -> save; they get a cancellation | ✅ | ❌ | `removeAttendees`; but the removed guest may also get an update mail (B-09) |
| G-04 | Resend an invitation | Per-chip or bulk "Resend invitation" | ✅ | ❌ | `resendInvite` |
| G-05 | See who accepted | Chips/popover show accepted/declined/tentative | ✅ | ❌ | Only email-reply RSVPs update `events.attendees`; invite-page responses do not show (B-34); needs reload/refresh |
| G-06 | Changing time/title tells guests | Popup "Send update" with change summary; revised .ics | ✅ | ❌ | B-02 (one row only for series), B-07 (spurious "Description updated"), B-09, B-11 |
| G-07 | Cancel a shared event | Delete asks "Notify N guests?" and sends cancel | ✅ | ❌ | B-02b |
| G-08 | Invite to a repeating event | Whole series | ✅ | ❌ | B-01 |
| G-09 | Stop sharing an event | One "Stop sharing" action | ⚠️ | ❌ | Only by removing each guest chip; no single action. Same limit for owner after Skip (B-03) |
| G-10 | Event times right for guests in other zones | Uses the event's zone | ❌ | ❌ | B-06 |

### 8.2 Guest side

| # | Intent | Expected | D | M | Code / notes |
|---|--------|----------|---|---|--------------|
| G-11 | Accept/decline from the email | Calendar client RSVP or link | ✅ | — | `InvitePage` + `rsvp-inbound`; auto-decline on load (B-58); web accept does not reach the organizer's chips (B-34) |
| G-12 | Accept/decline from inside the app | Buttons on the shared event | ❌ | ❌ | `EventCard` shows no RSVP controls; shared events are read-only copies. N-11 |
| G-13 | See shared events in my calendar | Read-only, mapped to one of my calendars/categories | ✅ | ⚠️ | Loaded once per session; manual refresh button (`handleRefresh` App.tsx ~448); degraded fields (B-08). M injects them into the same store so they appear in the list but cannot be told apart from my own |
| G-14 | Remove a shared event I do not want | Gone for good | ⚠️ | ⚠️ | Event-level "Remove from Timebox" only deletes the local copy (`handleDeleteEvent` App.tsx:2454); the next server load re-injects it. Only whole-share removal is remembered (`timebox_dismissed_shares`). N-11 |
| G-15 | Move/resize a shared (read-only) event | Not allowed | ✅ | — | UI hides Edit but drag is not blocked (B-28) |

### 8.3 Sharing calendars / categories

| # | Intent | Expected | D | M | Code / notes |
|---|--------|----------|---|---|--------------|
| G-16 | Share a calendar or category with someone | Share icon -> invite email -> they accept | ✅ | ❌ | `handleShareInvite` App.tsx:525; one share per item, later invites add members and email them. Failure shows a success toast (B-54) |
| G-17 | See who has access and revoke | List with status pending/accepted/declined; remove | ✅ | ❌ | `loadCollaborators` / `handleShareRemove` |
| G-18 | Give edit rights | Editor/admin roles | ❌ | ❌ | Roles are viewer-only by DB constraint; the UI now offers only viewer (`ShareModal.tsx:125`). Product gap, not a bug |
| G-19 | Share with a link | Copy link works | ❌ | ❌ | B-52 (route does not exist) |
| G-20 | Share a tag/project | Recipients see its items | ❌ | ❌ | Tag shares return no events by design (B-55) |
| G-21 | Rename or recolor a shared calendar I received | Map to my calendar/category | ✅ | ❌ | `handleSetSharedMapping`, stored in localStorage only |

---------------------------------------------------------------------------------------------------------------

## 9. Google Calendar sync

| # | Intent | Expected | D | M | Code / notes |
|---|--------|----------|---|---|--------------|
| GC-01 | Connect Google | OAuth, pick calendars, events appear | ✅ | ❌ | Read-only scope. M has no Settings so cannot connect (events do show if connected on desktop with the same browser storage; tokens are in localStorage, B-48) |
| GC-02 | Keep in sync | New Google events show up within minutes | ✅ | ✅ | Cache then 5 min poll, `doGcalSync` App.tsx:731 |
| GC-03 | Edit/move a Google event in Timebox | Change is pushed to Google | ❌ | ❌ | No write scope. Events you organize are editable (`readOnly: !organizer`, googleCalendar.ts:623) but the change is silently overwritten by the next import for future events (App.tsx:661-670). B-50, B-28. There is no "local only" warning |
| GC-04 | Conflict: same event changed in Google | Google wins | ✅ | ✅ | Past events keep stored times, future events take the fresh copy; local twins deduped by `googleEventId` (App.tsx:625-636) |
| GC-05 | Delete a Google event from Timebox | Disappears and stays gone | ⚠️ | ⚠️ | Dismissals are localStorage-only: reappears on another device (B-51). Recurring: scope picker offers "This event only" / "This and all following", no "all" |
| GC-06 | Disconnect | Imported events vanish | ✅ | — | B-49 (any 400/403 disconnects) |
| GC-07 | All-day events | Banner | ❌ | ❌ | B-22 |
| GC-08 | Create in Timebox and get it in Google | Event appears in my Google calendar and guests' | ❌ | ❌ | By design: invitations go as .ics email; the write path is inert (memory note: `hasGcalWriteAccess()` always false) |
| GC-09 | Be told about new invitations | Toast on poll | ✅ | ✅ | App.tsx:681-705 |

---------------------------------------------------------------------------------------------------------------

## 10. Time zones, cross-midnight, DST

| # | Intent | Expected | D | M | Code / notes |
|---|--------|----------|---|---|--------------|
| Z-01 | Event with a zone shows at the right local time when I view in another zone | Converted on display | ✅ | ⚠️ | `crossDateEvents.ts:31-48`; M ignores zone entirely |
| Z-02 | Floating event ("None") stays at the same wall-clock after I travel | No shift | ✅ | ⚠️ | The timezone-change effect (App.tsx:784-845) re-derives every future event with a `startEpoch`, without checking `evt.timezone`, so floating events shift. And epochs are computed with the device zone, not the event's zone (`useStore.ts:798-803`). N-10 |
| Z-03 | Zone is remembered on another device | Same zone | ✅ | ✅ | `timezone`, `startEpoch` are not columns; loaded rows get `timezone: existing?.timezone ?? null` (`supabasePersistence.ts ~284`). N-10 |
| Z-04 | Repeats survive DST | Same wall-clock time | ✅ | — | `generateRecurrenceDates` builds dates at local noon |
| Z-05 | See a cross-midnight event on both days | Month, Week, Day, mobile | ✅ | ✅ | Day/3-day/Week split correctly. Month and mobile list show the start day only. And `EventCard.isPast` (EventCard.tsx:155-159) compares the END clock time with now on the START date, so a 22:00-02:00 event is dimmed as "past" and offers "Mark as not attended" all day before it starts. N-06 |
| Z-06 | Invites use the event zone | | ❌ | ❌ | B-06 |
| Z-07 | Weekday/week boundaries in my zone | | ✅ | ✅ | local date strings |

---------------------------------------------------------------------------------------------------------------

## 11. Offline and multi-device

| # | Intent | Expected | D | M | Code / notes |
|---|--------|----------|---|---|--------------|
| O-01 | Keep working offline | App opens from cached session and local state; edits queue | ✅ | ✅ | Zustand localStorage + `handleOnline` flush (`supabasePersistence.ts:788-808`); App.tsx:2584 |
| O-02 | Know I am offline / changes pending | Offline indicator, pending count | ⚠️ | ❌ | Only a "couldn't be saved - will retry" banner after a failed save (App.tsx ~2879); no explicit offline state. M has no banner at all. N-23 |
| O-03 | Edit on two devices | Both edits kept or conflict explained | ⚠️ | ⚠️ | Whole-state upserts + realtime reload, last writer wins, 5 s self-write guard. Not verified by test. N-23 |
| O-04 | Session expires | Banner + sign in again, changes kept | ✅ | ✅ | `sessionExpired` banner |
| O-05 | Deletes persist | Gone after reload | ⚠️ | ⚠️ | Needs the `del_*` RLS policies in production (see memory `pending-backend-decisions`) |

---------------------------------------------------------------------------------------------------------------

## 12. Calendars, categories, tags (organization tree), settings, onboarding, bug report

| # | Intent | Expected | D | M | Code / notes |
|---|--------|----------|---|---|--------------|
| C-01 | Add / rename / recolor a calendar, category, tag | Inline in sidebar edit mode or Settings | ✅ | ❌ | `LeftSidebar.tsx`, `SettingsPanel.tsx`. M cannot manage the tree; the add sheets only choose from existing items |
| C-02 | Reorder calendars/categories/tags | Drag in edit mode | ✅ | ❌ | `reorder*` store actions |
| C-03 | Delete a calendar | Typed confirmation; everything in it goes | ✅ | ❌ | `SettingsPanel.tsx:1753+`. Cascade ignores multi-calendar categories (B-60); not undoable (N-20) |
| C-04 | Delete a category or tag | Clear warning of what is removed | ⚠️ | ❌ | Simple confirm only; deleting a category silently deletes all its events/tasks/blocks (`useStore.ts:760-766`); tag delete leaves dangling ids (B-61). N-20 |
| C-05 | Hide/show and focus | Eye toggle / click to focus | ✅ | ❌ | |
| C-06 | Default category follows last use | | ✅ | ❌ | `lastCategoryId` |
| C-07 | Settings: week start, wake/sleep, time zone, notifications, Google | | ✅ | ❌ | `SettingsPanel`. Mobile has no entry to Settings, sign-out, or account. N-13 |
| C-08 | Notification preferences | Reminders before events; email toggle | ⚠️ | ❌ | The email toggle also stops outgoing guest-update emails (B-11) |
| C-09 | First-run onboarding | Name -> template/blank/Google -> optional tour; tour skippable | ✅ | ✅ | `OnboardingWizard`, `WalkthroughOverlay` (Esc ends the tour); Google choice races persistence (B-47). Existing users with data skip it |
| C-10 | Sign in / sign up / reset | | ✅ | ✅ | `AuthPage`; M uses the same gate |
| C-11 | Sign out, switch user | | ✅ | ❌ | M has no sign-out control. History not cleared (B-46) |
| C-12 | Report a bug | Modal -> sent to the team, confirmation | ✅ | ❌ | `BugReportModal` inserts to `bug_reports`; not available on M |

---------------------------------------------------------------------------------------------------------------

## 13. Mobile gestures

| # | Gesture / intent | Expected | Status | Code / notes |
|---|------------------|----------|--------|--------------|
| MG-01 | Tap a schedule card | Opens a bottom sheet with details/actions | ✅ | `ScheduleTab` card onClick -> `DetailSheet` (gaps in N-25) |
| MG-02 | Tap the center "+" | Choose New Task/New Event, full sheet; a second FAB (bottom-right) opens a quick event form | ⚠️ | Two overlapping add entry points with different forms/defaults (`MobileApp.tsx ~220-300, 2270`) |
| MG-03 | Tap a todo row | Expands schedule actions (duration slider, Schedule today, Reschedule) | ⚠️ | No way to open it for editing/deleting. N-04 |
| MG-04 | Tap check circle on a todo | Toggles done | ✅ | Status only (B-39) |
| MG-05 | Tap quick check/X on a past pending block | Confirm / skip | ✅ | |
| MG-06 | Swipe a card left | Reveals Delete | ⚠️ | `handleCardTouchStart/Move/End` (~1768). Disabled for past items; deletes with no confirm/undo; for a task block it only removes the block; no swipe-right action (done/reschedule per the redesign brief is not built); revealed state closes only by tapping the card |
| MG-07 | Long-press a card | Quick menu / start drag | ❌ | No long-press handlers anywhere. N-13 |
| MG-08 | Drag a block or event to reschedule | Pointer drag | ❌ | `PlanTab` pointer drag exists but is unreachable (N-13) |
| MG-09 | Swipe a sheet down to dismiss | Handle bar drags, sheet follows | ❌ | The handle bars are decorative; sheets close only via backdrop tap or buttons |
| MG-10 | Swipe left/right to change day | | ❌ | Chevron buttons only |
| MG-11 | Pull to refresh / sync now | | ❌ | Rubber-banding is blocked (`MobileApp.tsx ~150`) and there is no refresh control; data updates by realtime/poll only |
| MG-12 | Speak a todo | Mic button, transcript fills the field | ✅ | `TodoTab` (tap to start, tap anywhere to stop; comments say hold-to-record) |
| MG-13 | Pinch/zoom the schedule | | — | Not applicable (list, not grid) |

### Desktop vs mobile parity summary

| Capability | D | M |
|------------|---|---|
| Create event (single) | ✅ | ✅ (no repeat, no guests, no zone, no cross-midnight, no validation) |
| Create/edit/delete repeating events with scope | ✅ | ❌ |
| Guests, RSVP, resend, cancel | ✅/⚠️ | ❌ |
| Create note/todo | ✅ | ✅ |
| Edit/delete/repeat/priority/due for todos | ✅ | ❌ |
| Drag todo into calendar, move/resize | ✅ | ❌ |
| Complete todo and blocks consistently | ✅ | ⚠️ (B-39) |
| Stickers / didn't-happen cross | ✅ | cross only |
| Undo | ✅ (Cmd+Z) | ❌ |
| Views (day/3-day/week/month) | ✅ | day list |
| Sharing calendars, Google connect, settings, tree, bug report, sign-out | ✅ | ❌ |

---------------------------------------------------------------------------------------------------------------

## 14. Prioritized list of NEW problems (not already in flows.md)

Ids match the references used above. Severity is by user impact. "Upgrade" means flows.md listed it as a hypothesis
and this audit confirmed it in code.

### P0 / high (data loss or a core feature silently failing)

- N-01 Recurring-todo fields are not saved to the cloud (upgrade of B-43). `tasks` rows have no recurring /
  recurrencePattern / recurrenceDays / recurrenceSeriesId / recurrenceExceptions columns in either direction
  (`supabasePersistence.ts:221-237` load, `:385-402` save). After the first cloud reload, realtime reload or new
  device, the series head is an ordinary todo and no further copies appear; exceptions are lost so deleted days can
  return. Needs migration + mapping.
- N-02 A done todo that has no block disappears from every list (`RightSidebar.tsx:211` drops done+unscheduled;
  `getUnscheduledTasks` excludes done; Done fold only shows done tasks with a block in the viewed week, line 212). The
  user cannot find or un-complete it; also hides done todos scheduled in other weeks until you navigate there.
- N-03 "Delete" has three meanings for a scheduled todo: block popover Delete deletes the todo and every block
  (`TimeBlockCard.tsx:819-825`); Delete key and drag-to-sidebar only unschedule (`CalendarView.tsx:196`,
  `App.tsx:3906`); mobile sheet/swipe unschedules but is labelled "Delete event". There is no visible "Unschedule"
  command, and the destructive one has no confirmation.
- N-04 Mobile todo/note management is missing: no edit (title, due, priority, notes), no delete, no repeat, cannot
  un-confirm a confirmed block (`MobileApp.tsx` TodoTab ~2731-3290, DetailSheet ~366-830). Also quick-capture creates a
  todo (`handleCapture` ~2856, `isTodo` undefined) while the Add sheet defaults to a note (`isTodo` false, ~853).
- N-05 "Break into blocks" and "Split off" lose data: new tasks copy only title/estimate/calendar/category/tags/due
  (`App.tsx:1471-1510`), so notes, priority, link, description, recurrence, and the note flag (a note becomes a todo)
  are dropped, and the original is deleted. "Add time to complete" (App.tsx:1937) drops the note flag and recurrence.

### P1 (visible wrongness or inconsistency users will hit often)

- N-06 Cross-midnight events: `EventCard.tsx:155-159` treats the event as past once the end clock time (02:00) has
  passed on the start date, so it is faded and offers "Mark as not attended" before it begins. Month view
  (`MonthView.tsx:98`) and the mobile list (`e.date === selectedDate`) show only the start day; mobile shows a negative
  duration. Popover shows no end date. Extends B-15/B-36.
- N-07 Desktop also writes unpadded times ("9:00"): `createPlannedBlocksFromTask` (`useStore.ts:428-429, 458-459,
  484-485`) is used by "Schedule todo", Reschedule later and Add time. B-35 only mentions mobile. Anything that
  sorts or compares start times as strings (`localeCompare` on `start`, e.g. the next-block lookup in
  `selectors.ts` and the mobile To-Do row) misorders "9:00" vs "10:00", and `<input type="time">` shows blank when
  the block/event is later edited in the Add panel.
- N-08 Editing "All events"/"This and following" overwrites per-occurrence customizations (moved time, per-occurrence
  notes/link/category) because the editor sends every field (`App.tsx:4231 sharedUpdates`). No warning and no marker
  for modified occurrences.
- N-09 Two disconnected "didn't happen" models: sticker cross (not persisted, not in undo, no stats effect, usable on
  future items, the only one on mobile) vs `attendanceStatus` (popover, past events only, persisted, drives stats and
  diff view, invisible on mobile). Blocks use `confirmationStatus: 'skipped'` as a third. Users get different results
  depending on how they mark it. `'attended'` is never settable (E-28).
- N-10 Time-zone semantics: floating events still shift when the user's zone changes (App.tsx:784-845 ignores
  `evt.timezone === null`); epochs are computed in the device zone, ignoring the event's chosen zone
  (`useStore.ts:798-803`); `timezone` and `startEpoch/endEpoch` are not persisted so another device loses them.
- N-11 Guests cannot RSVP inside the app (no controls on a shared event), and removing one shared event is not
  remembered (re-injected on next load, `loadSharedCalendars` App.tsx:360+ only honors whole-share dismissals).
- N-12 Month view is read-only and thin: events not clickable, not category-colored, no popover for blocks, "+N more"
  inert, day click opens 3-day not Day, no create, no cross-midnight spans, no done/missed state.
- N-13 Mobile parity and dead code: no undo UI although every action saves a snapshot, no Settings / sign-out /
  Google connect / share / bug report / org tree; `PlanTab` (~1131-1540) is unreachable (`MobileTab` has only
  `schedule` and `todo`), so there is no drag, long-press, swipe-right, or swipe-down-to-dismiss on mobile
  (flows 3.10 is out of date). Two add buttons with different defaults.
- N-14 Keyboard/accessibility: AddModal and popovers do not close on Esc, cards are not focusable, no key for
  prev/next day or today, no Ctrl+Y, no visible undo control; Delete key removes a recurring or shared event with
  no scope prompt and no guest notice (`CalendarView.tsx:186-203`).
- N-15 Series scope prompts disagree: after a "this + no repeat" edit the row keeps `recurrenceSeriesId` but
  `recurring:false`, so drag-move asks for scope (`App.tsx:2302` tests the series id) while Edit/Delete skip it
  (`EventCard.tsx:914,936` test `recurring && recurrenceSeriesId`). Dismissing the move prompt silently chooses "this".

### P2 (polish, feedback, and feature gaps)

- N-16 New-item dialogs ignore the viewed day (`e`, `t`, "+", mobile Add sheet default to today).
- N-17 Custom-weekday create skips the clicked date when its weekday is unselected (no message); events cap at 52
  rows and run out while todos repeat forever lazily, so repeat semantics differ by type (extends B-17).
- N-18 Silent no-ops and blocking dialogs: dropping a fully-planned todo (`App.tsx:2041`), "Reschedule later" on a
  fully planned todo (store returns without feedback), split with no overlap, resize to empty; results reported via
  `alert()` (App.tsx:1868, 1930, 2000; mobile `handleScheduleLater`).
- N-19 Desktop allows zero-length events (start == end, same day); mobile has no validation (B-36).
- N-20 Deleting a category/tag/calendar is not undoable (no snapshot) and category/tag delete does not list what will
  be removed (extends B-60/B-61).
- N-21 Terminology and note handling: "Add to-do" button creates a note; "New Task" vs "New Note"; popover/menu text
  says "Schedule todo"/"Delete todo" for notes; a scheduled note shows a done circle and "Mark as done".
- N-22 "Repeat until" trimming deletes future occurrences with no confirmation, no guest cancel, leaves stickers
  (extends B-30).
- N-23 Offline/multi-device: no offline indicator on desktop, none at all on mobile; conflicts are last-writer-wins
  with no UI; behavior not exercised by tests.
- N-24 Past overlapping items are truncated and the older one ghosted to 15% opacity (`DayView.tsx:417-440`), which
  can make an event look deleted.
- N-25 Mobile `DetailSheet` omits event notes/description/guests/repeat info, labels everything "Event", edits the
  category of a task block only if the title also changed (~line 455 condition), and allows editing/deleting past
  planned blocks that desktop freezes.
- N-26 Feature gaps users will ask for: duplicate event/todo, location field, convert event <-> todo, settable
  "attended", series-level "Stop repeating"/"Delete series" for todos, end date for repeating todos, single
  "Stop sharing" for an event.
