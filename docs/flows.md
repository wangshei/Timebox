# Timebox user-flow tree and suspected-bug audit

Scope: desktop `src/App.tsx` plus mobile `src/components/MobileApp.tsx`, store, services, edge functions.
Excluded (being parked): compare mode, activity panel, booking links, auto-schedule.
Method: static code reading only. Nothing here was executed, so every "SUSPECTED BUG" is a hypothesis
with reasoning, not a reproduced failure. Areas read less deeply are marked "light audit".

Conventions
- Paths are relative to `src/` unless prefixed `supabase/`. Line numbers are as of commit bef846b.
- "Store" = Zustand `store/useStore.ts`. "Persist" = debounced flush in `supabasePersistence.ts`
  (tables `events`, `tasks`, `time_blocks`, `calendar_containers`, `categories`, `tags`, `user_settings`).
  Sharing tables: `calendar_shares`, `share_members`.
- Architecture facts that drive many bugs (from memory notes, re-verified in code):
  1. Recurring events are MATERIALIZED rows sharing `recurrenceSeriesId`; default 52 rows
     (`utils/recurrenceExpander.ts:10`). No exclusion/tombstone model.
  2. Two completion models: legacy `mode:'recorded'` vs `confirmationStatus:'confirmed'`.
  3. Google events are ephemeral (`gcal-evt-` ids), never persisted; dismissals only in localStorage.
  4. Event-scoped invites are one-shot: UID = event row id, no RRULE.

## STATUS UPDATE 2026-10-11 (fix pass)

Fixed in code this pass (tagged `[FIXED 2026-10-11]` below): B-01, B-02b, B-03, B-07, B-09, B-15, B-16, B-17, B-20, B-26,
B-28, B-30, B-31, B-34, B-35, B-36, B-39, B-44, B-46, B-49, B-52, B-54, B-61. Fixed server side earlier: B-05, B-24,
B-32, B-33, B-45, B-53, B-56. Partial: B-02, B-37, B-43. Still open: B-04, B-06, B-08, B-10, B-11, B-12, B-13, B-14, B-18, B-19,
B-21, B-22, B-23, B-25, B-27, B-29, B-38, B-40, B-41, B-42, B-47, B-48 (deferred), B-50, B-51, B-55, B-57, B-58, B-59, B-60.
Where the original text below says "App.tsx:NNNN" it describes the pre-fix code.

Known limits of the series-invite design (server has no EXDATE/RECURRENCE-ID): deleting or editing only "this" occurrence of a
shared repeating event cannot be expressed in the guests' recurring invite, so guests get a text note instead of a calendar update.

----------------------------------------------------------------------------------------------------

## 1. EVENTS (desktop)

Entry points to create: drag on grid -> `handleCreateBlock` (App.tsx:2168) opens AddModal in event mode;
"+" button -> `handleOpenAddModal` (App.tsx:1504). Submit = `AddModal.handleSubmit` (components/AddModal.tsx:468)
-> `handleAddEvent` (App.tsx:1336). Note: `isDraftTimeBlock` is always set false by `handleCreateBlock`, so the
"draft time block" branches (App.tsx:1371-1402, 4247-4279) are effectively legacy/dead.

### 1.1 Create single event (same day)
Entry: AddModal submit -> `handleAddEvent` App.tsx:1336.
1. Validate title, calendar, category (AddModal.tsx:469-483). Remember `lastCategoryId`.
2. Build `eventPayload` (App.tsx:1362). `source:'unplanned'` if end is already past (App.tsx:1359).
3. `addEvent` (useStore.ts:786) assigns id, `startEpoch/endEpoch`, `editedAt`.
4. Form reset, modal closes.
Expected: one card at the slot. Data: store.events; Persist -> `events` row (incl. `timezone`, `attendees` jsonb).
Flags: B-14 (tags dropped), B-15 (past-event check ignores endDate).

### 1.2 Create all-day event
Entry: none. There is no all-day control in AddModal (no `isAllDay` anywhere in AddModal.tsx).
All-day exists only for Google imports (`services/googleCalendar.ts:~612` sets `isAllDay`, 00:00-23:59).
Workaround today: set 00:00-23:59 manually. Flag: B-22 (feature gap; imported all-day renders as timed 00:00-23:59 blocks).

### 1.3 Create cross-midnight event
Entry: set end time earlier than start. AddModal effect auto-advances `endDate` (AddModal.tsx:455-466).
1. `handleAddEvent` stores `endDate` (App.tsx:1371) and `endEpoch` from `endDate` (useStore.ts:798).
2. Views split the card across days via `eventRangeOnDate` (App.tsx:2357).
Expected: card spans two day columns. Data: events row with `end_date`.
Flags: B-15; B-08 (shared recipients lose `endDate`); B-12 (invite ICS fine, but InvitePage Google link ignores endDate).

### 1.4 Create repeating event
Entry: AddModal repeat picker -> `handleAddEvent` isRecurring branch (App.tsx:1403-1421).
Patterns: none, daily, every_other_day, weekly, monthly, custom weekdays (`generateRecurrenceDates`).
1. New `seriesId = crypto.randomUUID()`.
2. Dates generated, capped at 52 occurrences (recurrenceExpander.ts:10).
3. `addEvents` inserts N rows (headroom-capped at 2000 total, useStore.ts:858). Cross-date span replicated per row.
4. `addFailed` toast if truncated (App.tsx:1432).
Expected: N cards. Data: N rows in `events` sharing `recurrence_series_id`.
Sub-flows:
- 1.4a daily: 52 consecutive days (~7.5 weeks only). Flag B-17.
- 1.4b weekly: same weekday every week for 52 weeks; `recurrenceDays` ignored.
- 1.4c custom weekdays: 52 occurrences total, not 52 weeks. Flag B-17.
- 1.4d monthly: skips months lacking the day (Jan 31 -> Mar 31) (recurrenceExpander.ts:48-52). Flag B-18.
- 1.4e "until date" at CREATE: not available. "Repeat until" exists only when editing scope all/all_after
  (AddModal.tsx:1179-1192, handled App.tsx:4234-4252). Flag B-17.
- 1.4f entity cap: if events.length near 2000 the series is silently truncated, warning toast only.

### 1.5 Create event with guests (shared, non-repeating)
Entry: AddModal "Invite" section -> `inviteEmails` -> `handleAddEvent` -> `sendNewInvites` (App.tsx:1526).
1. Event created with `attendees:[{email,responseStatus:'needsAction'}]` immediately (App.tsx:1378) BEFORE invites are confirmed.
2. `sendNewInvites` opens `inviteConfirm` modal. On confirm: wait 2s then `createShare` (sharing.ts:18) with up to 3 attempts (App.tsx:1561-1580).
3. Edge `create_share` (share-invite/index.ts:604): INSERT `calendar_shares` (scope 'event', `event_id`), INSERT `share_members` (one token each),
   link existing users via `listUsers()`, email each guest with .ics (METHOD:REQUEST, UID `<eventId>@timeboxing.club`) + "Add to Google Calendar" link.
4. Optionally push to Google if write scope (never true; scope is readonly, googleCalendar.ts:13).
Expected: guests get email; organizer sees "Invited" chips. Data: events.attendees, calendar_shares, share_members.
Flags: B-03 (Skip leaves phantom attendees), B-04 (race with persistence), B-05 (every call creates a new share), B-06 (timezone), B-24 (HTML injection), B-25 (typed email limits).

### 1.6 Create shared + repeating event
Entry: same as 1.5 with repeat.
1. 52 rows each carrying the same `attendees` array (payload spread, App.tsx:1380-1385).
2. `newEventId = ids[0]` (App.tsx:1420): invite/share created for the FIRST occurrence only.
3. .ics has no RRULE; guest's calendar receives one single event.
Expected (what users likely assume): guests invited to the series. Actual: first occurrence only.
Flags: B-01 (critical).

### 1.7 Edit event: this occurrence only (scope 'this')
Entry: click card -> `handleEditEvent` (App.tsx:1679) -> AddModal -> `onUpdateEvent` (App.tsx:4170).
1. Guest diff: compute new/removed attendees (App.tsx:4189-4222). `updateEvent(id,{attendees})`, `sendNewInvites` for new, `removeAttendees` for removed.
2. `notifyAttendeesIfNeeded(event, eventUpdates)` (App.tsx:4228) builds a change summary and, after confirmation, `notifyEventUpdate` -> edge `notify_event_update` (revised .ics, higher SEQUENCE).
3. else branch -> `updateEvent(id, eventUpdates)` (App.tsx:4300).
Data: events row; edge sends emails. No `saveSnapshot` (not undoable).
Flags: B-02, B-07, B-09, B-10, B-11, B-13, B-16, B-19, B-23.

### 1.8 Edit event: following (scope 'all_after') / all (scope 'all')
Entry: `handleEditEventWithScope` (App.tsx:1689) sets scope; submit -> `onUpdateEvent` App.tsx:4231.
1. Strip `date/endDate/recurring/recurrencePattern/recurrenceDays` from the shared update.
2. `updateEvents` over series rows filtered by `recurrenceSeriesId` and (for all_after) `e.date >= event.date`; `endDate` recomputed per row as a span.
3. If `repeatUntil`: trim rows after it (`deleteEvents`) or extend with `generateRecurrenceDatesAfter` (App.tsx:4240-4252).
Data: N event rows updated; extension rows inserted (they copy `attendees` but no share exists).
Flags: B-02, B-09, B-20 (cannot change pattern or stop repeating), B-21 (all_after + repeatUntil extends from series end, not from edit point), B-16.

### 1.9 Edit non-repeating event into a repeating one
Entry: set repeat while editing a single event -> App.tsx:4281-4297.
1. New seriesId; origin re-anchored to first pattern day (`originDate`, App.tsx:4287) which may silently MOVE the edited event.
2. N-1 new rows via `addEvents`, copying `attendees`.
Flags: B-26 (silent date shift), B-01 (attendees duplicated, no shares for new rows).

### 1.10 Move via drag (desktop)
Entry: pointer drag in Day/ThreeDay/Week view -> `handleMoveEvent` (App.tsx:2289).
1. If recurring (`recurrenceSeriesId` or `recurringGoogleEventId`): `pendingEventMove` prompt (App.tsx:2301, UI ~4030-4080). Dismiss => 'this'.
2. `applyEventMove` (App.tsx:2310): preserve duration, wrap across midnight via `absMinsToEndParts`; sets `originalStart/End` once.
3. Scope all/all_after applies new time-of-day to scoped rows, new date only to the dragged row.
4. `notifyAttendeesIfNeeded` for the dragged event only.
Data: events rows (+ stickers date sync for the dragged event only, useStore.ts:827).
Flags: B-02, B-27 (stickers of other moved rows not date-synced; fine since date unchanged), B-28 (gcal/readOnly guard).
Move onto past slot: no unplanned conversion for events (unlike blocks).

### 1.11 Resize via drag
Entry: bottom handle -> `handleResizeEvent` (App.tsx:2339). Always affects ONE row, no recurrence prompt (B-29).
Rejects empty ranges. Sets `originalEnd`, `notifyAttendeesIfNeeded`. Cross-date via `endDate`.
Gotcha reminder: handle must use `onPointerDown` + `data-no-drag`.

### 1.12 Delete event
Entry: card menu -> `handleDeleteEvent` (App.tsx:2446) / `handleDeleteEventSeries` (App.tsx:2454).
- 1.12a single/this: `deleteEvent` (useStore.ts:836) removes event + its stickers. gcal ids are dismissed.
- 1.12b all: `deleteEvents` for every row with the series key. gcal series dismissed with cutoff ''.
- 1.12c all_after: rows with `date >= event.date`, gcal cutoff date.
Data: delete from `events` (needs the `del_ev` RLS policy or the DELETE silently no-ops, see memory).
Flags: B-02b (no cancellation/revoke for guests), B-30 (series delete leaves stickers), B-31 (undo).

### 1.13 Resend invitation
Entry: AddModal "Resend invitation" (bulk) and per-chip paper-plane -> App.tsx:4064-4100 -> `resendInvite` (sharing.ts:114) -> edge `resend_invite` (index.ts:719).
1. Find first `calendar_shares` row for (owner, 'event', eventId) else INSERT one.
2. Per email: find/insert `share_members`, `sendInviteEmail` with .ics and same token.
Flags: B-05 (picks first share; members may exist in a sibling share, causing duplicates), B-01, B-24, B-32 (no ownership check).

### 1.14 RSVP reply (email)
Entry: guest accepts in Gmail/Outlook -> METHOD:REPLY mail -> Resend inbound webhook -> `supabase/functions/rsvp-inbound/index.ts:160`.
1. Parse UID -> eventId, ATTENDEE PARTSTAT.
2. UPDATE `events.attendees[].responseStatus`; UPDATE `share_members.status` (first share only).
3. Organizer sees chip status after next reload/poll.
Flags: B-33 (open when secret unset; forged replies for any event), B-34 (InvitePage accept never updates events.attendees), B-05.

### 1.15 RSVP via invite page
See 6.3.

----------------------------------------------------------------------------------------------------

## 2. EVENTS (mobile) - `components/MobileApp.tsx`

Mobile is a separate, much smaller implementation. It does NOT use AddModal, `handleAddEvent`, invites, recurrence or scopes.

### 2.1 Create event
Entry: AddSheet (MobileApp.tsx:834, submit :900) and ScheduleTab `handleCreateEvent` (:1698).
Steps: pick title, calendar, category, date, start, end -> `addEvent({recurring:false,...})`.
Data: events row. No repeat, no guests, no end date, no cross-midnight, no end>start validation.
Flags: B-35 (unpadded hour string "9:00"), B-36 (end<start accepted).

### 2.2 Edit / delete event
Entry: DetailSheet (:399). Edit -> `updateEvent` (:477). Delete -> `deleteEvent` (:442, :1791); gcal events are dismissed.
No recurrence scope, no attendee notifications, no stickers cleanup beyond `deleteEvent`.
Flags: B-37 (editing/deleting one occurrence of a series with no prompt; no guest notify/cancel).

### 2.3 Move/resize events
No drag move for events on mobile (only tab navigation). Plan tab supports dragging tasks onto the grid (PlanTab, :1122-1290).

----------------------------------------------------------------------------------------------------

## 3. NOTES, TO-DOS, TASKS

Terminology: there is no separate "note" entity. A note is the `notes` text field on tasks/events/blocks
(Quick Notes in AddModal). To-dos are `Task` rows.

### 3.1 Create note (text on item)
Entry: AddModal Notes field. Data: `notes` on task/event; included in .ics description (App.tsx:1544).

### 3.2 Create to-do (desktop)
Entry: "+" -> AddModal task mode -> `handleAddTask` (App.tsx:1268).
1. `addTask` (useStore.ts:288). If `scheduleAt` (created from a calendar drag), also `addTimeBlock` (mode 'recorded' when slot is past).
Data: tasks row (+ time_blocks row when scheduled).
Flags: B-38 (legacy `mode:'recorded'` still written).

### 3.3 Create to-do (mobile)
Entry: AddSheet task mode / TodoTab quick add (`parseTaskInput`, MobileApp.tsx:60). No repeat option (B-39).

### 3.4 Toggle done
- Desktop: `handleMarkTaskDone` (App.tsx:1191): sets status 'done' AND confirms all blocks atomically; undo path clears.
- Block checkmark: `handleConfirmBlock` (App.tsx:1233) marks the task done only when all siblings are confirmed (skipped siblings prevent it, B-40).
- Mobile: `updateTask(status)` only (MobileApp.tsx:450, 2903), blocks left unconfirmed so the calendar still shows them as "missing" (B-39).

### 3.5 Create repeating to-do
Entry: AddModal task mode repeat -> `handleAddTask` (App.tsx:1280-1320).
Model: lazy materialization. Head task `recurring:true` + `recurrenceSeriesId`, anchored on dueDate or today.
`expandRecurringTasks(analyticsDateRange)` (useStore.ts:320) creates plain instances for visible dates, dedup by (seriesId, dueDate),
exceptions list on the head.
Data: tasks rows. Recurrence fields are NOT yet in the cloud schema per memory => reload from Supabase may drop `recurring*` fields (verify).
Flags: B-41, B-42, B-43.

### 3.6 Complete a repeating instance
Same as 3.4 on the instance row. Instances are not re-created because dedup keys on dueDate.
Flag: B-42 (if instance `dueDate` is edited, the original date is regenerated).

### 3.7 Delete repeating instance / head
- Instance: `deleteTask` records the exception on the head (useStore.ts:304-316).
- Head: just deleted; remaining instances orphaned and no more are generated (B-41). No "delete series" action.

### 3.8 Edit to-do (title, due, recurrence)
Entry: `onUpdateTask` App.tsx:4150. Makes instance into a second head if recurrence is switched on (B-43); changing head pattern/due does not regenerate existing instances (B-43). Title/category propagate to blocks. Not undoable (no snapshot).

### 3.9 Drag to-do into calendar - desktop
Entry: pointer drag from RightSidebar/TaskCard -> `onDropTask` (DayView.tsx:198, ThreeDayView.tsx:527, WeekView.tsx:591) -> `handleDropTask` (App.tsx:2007).
1. Budget remaining = estimate - planned(today+future or confirmed) - recorded; blocks drop when 0.
2. Duration snapped to 15 min, min 15. Past slot => mode 'recorded', source 'unplanned', overlap popup (App.tsx:2064).
Data: time_blocks row. Task `dueDate` untouched.

### 3.10 Drag to-do into calendar - mobile
Entry: PlanTab pointer drag (MobileApp.tsx:1122-1290) or "schedule today/later" buttons (:2930, :2953). Sets task status 'planned'. No budget check against estimate (light audit).

### 3.11 Move / resize / split blocks
`handleMoveBlock` (App.tsx:2205), `handleResizeBlock` (:2247), `handleSplitBlock` (:2366). Past planned blocks are frozen; moving into the past converts to 'recorded'. If a block has no title and no task, it opens AddModal (App.tsx:2229).

### 3.12 Unschedule
Entry: block menu "Remove from calendar" -> `handleDeleteBlock` (App.tsx:2282) -> `deleteTimeBlock` (useStore.ts:387, also deletes its stickers). Task returns to unscheduled list. Reschedule-later: `handleRescheduleLater` (:1793), `handleRescheduleBlockLater` (:1867), `handleAddTimeToComplete` (:1929).

### 3.13 Delete to-do
`handleDeleteTask` (App.tsx:2441) -> `deleteTask` removes task and all its blocks (+ exception bookkeeping). Requires `del_tasks` RLS policy (memory).

----------------------------------------------------------------------------------------------------

## 4. STICKERS, SHORTCUTS, UNDO/REDO

### 4.1 Stickers
- Stamp mode: choose emoji -> click grid -> `addSticker` (DayView.tsx:224-243); time-anchored (`timeMinutes`). Block/event-anchored stickers in TimeBlockCard/EventCard.
- Missed marker: block `confirmationStatus:'skipped'` or past+unconfirmed planned block shows 'skipped'/'missing' diff status (TimeBlockCard.tsx:322-328). Skip via `skipBlock` (useStore.ts:524).
- Sticker date sync on move (useStore.ts:377, 827). Delete with parent in `deleteTimeBlock`/`deleteEvent`.
Flags: B-44 (stickers never persisted to Supabase; not in snapshots), B-30.

### 4.2 Keyboard shortcuts (App.tsx:2684-2720)
d day, 3 three-day, w week, m month, a all calendars, Cmd/Ctrl+Z undo, +Shift redo. `c` compare is gated by FEATURES.compareMode. Skipped when focus is in input/textarea/select/contentEditable.
Flag: B-45 (no modifier guard).

### 4.3 Undo / redo
`useHistoryStore` (store/useHistoryStore.ts): snapshots tasks, timeBlocks, events, calendarContainers, categories, tags; max 50.
28 `saveSnapshot()` call sites in App.tsx. Not covered: stickers, edit popup saves (`onUpdateEvent`, `onUpdateTask`, `onUpdateTimeBlock`), settings.
Flags: B-31, B-46 (history not cleared on sign-out / user switch).

----------------------------------------------------------------------------------------------------

## 5. GOOGLE CALENDAR AND ICS

### 5.1 Connect
Entry: Settings -> `getGoogleAuthUrl` (googleCalendar.ts:237) (scope calendar.readonly, offline, consent) -> Google -> `/gcal-callback` (`GcalCallbackPage.tsx`, routed in main.tsx:31) -> sync-mode and calendar selection -> `exchangeGoogleCode` (googleCalendar.ts:250) -> edge `gcal-auth` exchange_code.
Data: localStorage `gcal_tokens` (including refresh_token), `gcal_pending_sync_mode`, `gcal_connected_at`. Nothing in Supabase tables except whatever gcal-auth stores.
Also reachable from onboarding choice 'google' (App.tsx:2755) which redirects 300 ms after setup (B-47).
Flags: B-48 (tokens in localStorage), B-49 (any 400/403 refresh response disconnects).

### 5.2 Sync
`doGcalSync` (App.tsx:681) -> `importGoogleCalendarEvents` (googleCalendar.ts:537) -> `injectGcalData` (App.tsx:~611). Initial from cache, then 5 min poll. Modes: listen_with_history, listen_fresh, migrate_listen. Past events keep stored times; future events re-converted; recurring Google groups become `gcal-series-*` with detected pattern.
Edits to gcal events are local and overwritten on the next import (no write scope) - B-50.
Flags: B-22, B-50, B-51 (localStorage-only dismissals).

### 5.3 Disconnect
Settings -> `disconnectGoogle` (googleCalendar.ts:68, SettingsPanel.tsx:1210). Clears tokens/cache, KEEPS dismissals. Sign-out path (App.tsx:172) clears dismissals too. Imported events vanish on next inject.

### 5.4 ICS invites (outbound)
`buildInviteIcs` (share-invite/index.ts:204): METHOD:REQUEST, ORGANIZER = service address, ATTENDEE list (full guest list), UTC DTSTART/DTEND, SEQUENCE, no RRULE, no VTIMEZONE, no all-day support.
Update: `notify_event_update` (index.ts:564); cancel: `remove_attendees` (index.ts:854, METHOD:CANCEL). Reply: rsvp-inbound.
Flags: B-01, B-06, B-12, B-24.

----------------------------------------------------------------------------------------------------

## 6. SHARING

### 6.1 Share a calendar / category / tag (ShareModal)
Entry: sidebar share -> `handleOpenShare` (App.tsx:503) -> ShareModal. `loadCollaborators` (App.tsx:468) via `my_shares`.
Invite: `handleShareInvite` (App.tsx:519): first invite `createShare`, later `addShareMember` (index.ts:803, NOTE: sends NO email, only returns a token).
Remove: `handleShareRemove` (:566) -> `remove_member`. Role change is local only (:591).
Copy link: `handleShareCopyLink` (:508) builds `/share/cal_xxxxxxxx`, no such route exists (main.tsx handles only /invite, /book, /gcal-callback, /desktop).
Flags: B-52, B-53, B-54, B-55.

### 6.2 Recipient: shared-with-me
`loadSharedCalendars` (App.tsx:358) once per session -> edge `shared_with_me_events` (index.ts:1073) -> injected into store.events as `shared-<shareId>-<eventId>`, `readOnly`, never persisted (supabasePersistence.ts:444).
Flags: B-08, B-56, B-57.

### 6.3 Invite page (accept / decline)
Entry: email link `/invite/<token>` (main.tsx:21) -> `InvitePage` -> `get_invite_details` (index.ts:900) -> `respond` (index.ts:988, unauthenticated, updates `share_members.status`).
`?action=decline` auto-declines on mount (InvitePage.tsx:32-37).
Flags: B-34, B-58, B-59.

----------------------------------------------------------------------------------------------------

## 7. ONBOARDING, AUTH, SETTINGS, ORG TREE, BUG REPORT, VIEWS

(light audit)

7.1 Onboarding: `OnboardingWizard` -> `handleWizardComplete` (App.tsx:2747): `applyTemplate`/`applyBlankSetup`/google; `setHasCompletedSetup`; `persistOnboardingToSupabase`; optional walkthrough tour. Existing users with data skip the wizard (App.tsx:2735).
7.2 Auth: `AuthPage` signUp (:213), signInWithPassword (:252), reset (:168), recovery handled in App (isPasswordRecovery). Visitor mode bypass `onVisitMode`; production only (`requireAuth`). Sign-out resets onboarding flags and removes `timebox-state-v2` (App.tsx:2513-2520).
7.3 Settings: `SettingsPanel` / `SettingsSidePanel` -> wake/sleep, week start, notification scope, email notifications (suppresses attendee update emails, B-11), Google sync selection, org tree edit.
7.4 Org tree (calendar -> category -> tag): LeftSidebar add/update/delete/reorder via store actions (`useStore.ts:690-784`). Deleting a calendar or category cascades to events/tasks/blocks without confirm check here (B-60). `deleteTag` leaves dangling `tagIds` (B-61). gcal calendar delete dismisses it (App.tsx:1181).
7.5 Bug report: `BugReportModal` (:39) inserts to `bug_reports`. Requires INSERT policy; error path unchecked (light audit).
7.6 Views: Day (`DayView`), 3-Day (`ThreeDayView`, key 3), Week (`WeekView`), Month (`CalendarView`). All share drag system `utils/dragState.ts` and `PX_PER_HOUR` 68. Month view cross-day rendering not audited.
7.7 Mobile tabs: Schedule, Tasks (TodoTab), Plan (PlanTab). No month/week/3-day, no settings parity, no share UI, no stickers.

----------------------------------------------------------------------------------------------------

## SUSPECTED BUGS (detail)

### Sharing an event / shared repeating events

B-01 [FIXED 2026-10-11] CRITICAL - Shared repeating event invites only the first occurrence.
 App.tsx:1420 `newEventId = ids[0]` then App.tsx:1449 `sendNewInvites({eventId:newEventId})`; ICS UID is the single row id (share-invite/index.ts:673, 761) with no RRULE.
 Every one of the 52 rows still carries the same `attendees` (App.tsx:1380) so the UI shows "Invited" on all rows. Editing/moving occurrence N later emails
 attendees an update for UID `<rowN>@...` which the guest never received, so calendar clients either create a brand-new orphan event or ignore it.
 Same for resend (App.tsx:4081), edit-time invites (App.tsx:4186, only that row gets `attendees`, others do not) and series extension (App.tsx:4250 copies `attendees`, no shares).
 Fix direction: one invite with RRULE + EXDATE/RECURRENCE-ID overrides using the series id as UID, or one invite per occurrence; and propagate attendees across the series.

B-02 [PARTIAL 2026-10-11: series edits notify once per series (ics only for scope All; This/Following send a text note)] HIGH - Series edits/moves/resizes notify per row, not per series.
 App.tsx:4228 and 2336 call `notifyAttendeesIfNeeded` once with the edited row, regardless of scope 'all'/'all_after'. Guests of other rows (if any) are never told; the one notified is told about a single date.
B-02b [FIXED 2026-10-11] HIGH - Deleting an event never cancels or revokes anything.
 `handleDeleteEvent`/`handleDeleteEventSeries` (App.tsx:2446-2491) do not call `removeAttendees`/CANCEL. The `calendar_shares`/`share_members` rows remain, guests keep the event in their calendar and the recipient's in-app copy remains until the owner row is gone (shared_with_me_events then returns zero rows). Deleting a calendar/category (useStore.ts:726, 759) cascades the same way.

B-03 [FIXED 2026-10-11] HIGH - "Skip" in the invite popup leaves phantom attendees.
 Attendees are written at creation (App.tsx:1378, edit: 4200) before the confirmation popup. `onSkip` (App.tsx:1604-ish `setInviteConfirm(null)`) sends nothing but the chips say "Invited" and later edits email people who were never invited (`notifyAttendeesIfNeeded` App.tsx:1612 uses `event.attendees`).

B-04 MEDIUM - Invite races persistence.
 `setTimeout(sendShare, 2000)` (App.tsx:1580) assumes the 500 ms debounced flush has put the event in Supabase; it is not awaited. `getInviteDetails` queries `events` for `share.event_id` (index.ts:921) and returns an empty preview if the flush is late/failed. Edit-time invites use the same pattern. Three retries on error but a successful create with a missing event is not retried.

B-05 [FIXED 2026-10-11] HIGH - Share rows are not unique per event.
 `createShare` always INSERTs a new `calendar_shares` row (index.ts:604-640). Every "add a guest" or re-invite after Skip creates another event share. `resendInvite` takes `.limit(1)` (index.ts:735) and `loadCollaborators` `.find` first match (App.tsx:472), `recordRsvp` updates only the first share (rsvp-inbound:148). Result: members split across shares, duplicate member rows/tokens on resend, RSVP status written to the wrong share, remove works only via `.in(shareIds)` so it is the one that is consistent.
 Also ShareModal `handleShareInvite` (App.tsx:535-546) double-click race: two quick invites before `shareIdByItem` is set create two shares.

B-06 MEDIUM - Wrong time in invites for events with a timezone or when organizer's browser tz differs.
 `toIso` (App.tsx:1544, 1650, 4067) uses the browser's local zone, ignoring `event.timezone` (saved at App.tsx:1369, AddModal.tsx:533). ICS is UTC-only (no TZID). The Google "template" link on InvitePage is floating local time (InvitePage.tsx:20-24).

B-07 [FIXED 2026-10-11] MEDIUM - Editing an event with no description/notes always emits "Description updated"/"Notes updated".
 AddModal sends `description: description.trim() || null` (AddModal.tsx:530-531). New events store `undefined` (App.tsx:1371). `null !== undefined` is true (App.tsx:1623-1624), so every edit of such an event shows the update-confirm popup and mails guests a bogus change list.

B-08 MEDIUM - Recipients see a degraded copy of shared events.
 `eventSelect` has only id,title,date,start,end,recurring (index.ts:1105): no `end_date` (cross-midnight shows truncated), no series id (recurrence for calendar-scope shares is flat rows), no timezone/notes. Event-scope share = one occurrence (B-01). Loaded once per session (`sharedCalLoadedRef`, App.tsx:424), so owner edits do not appear until manual refresh.

B-09 [FIXED 2026-10-11] MEDIUM - Removed guests also get the update email.
 `notifyAttendeesIfNeeded(event, ...)` (App.tsx:4228) uses the pre-edit `event.attendees`, which still contains guests removed in the same save (4195-4222), so they get a cancel AND an update ("event changed") .ics, which can resurrect the event in their calendar depending on ordering.

B-10 LOW/MED - Organizer-only gating by `!a.self` (App.tsx:1613). Native events never set `self`, so if the organizer lists their own email it receives its own updates. Gcal-imported events with attendees are also "notified" via Timebox when moved (B-28).

B-11 LOW - `emailNotificationsEnabled` (a personal notification preference) also gates outgoing attendee updates (App.tsx:1607): turning off your own reminders silently stops guests being told about changes.

B-12 LOW - `gcalTemplateUrl` uses `ev.date` for both start and end (InvitePage.tsx:22); multi-day/cross-midnight events produce end < start.

B-13 LOW - Invites are not created for the mobile edit path or the legacy draft-block path: `onUpdateTimeBlock` conversion (App.tsx:4247-4279) drops guests, notes, timezone and endDate.

### Recurrence edit scopes

B-16 [FIXED 2026-10-11] HIGH - Switching an event between "this" and series scope can fork the guest list/state: `updateEvent(id,{attendees})` (App.tsx:4200) writes only the edited row while scope 'all' propagates other fields (4231), so rows diverge.

B-20 [FIXED 2026-10-11] MEDIUM - Cannot change a series' pattern or stop repeating.
 In scope all/all_after, `recurring/recurrencePattern/recurrenceDays` are destructured away (App.tsx:4232). Setting "no repeat" or changing weekly->daily has no effect on the series (only `repeatUntil` works). With scope 'this' it writes the new pattern onto just one row (App.tsx:4300), leaving inconsistent rows.

B-21 [PARTIAL 2026-10-11: extension now uses the edited series' pattern/last row; still extends from last date] LOW - `repeatUntil` with all_after extends from the series' LAST date (App.tsx:4243), not relative to the edited occurrence; with 'this'-style gaps the generation can reintroduce skipped slots only after the end, fine, but pattern comes from `event.recurrencePattern` of the clicked row, which may differ (B-20).

B-17 [FIXED 2026-10-11] MEDIUM - No "until date" at creation; fixed cap of 52 occurrences, which means daily ends after ~7 weeks and custom weekdays after 52 hits. Users will see a series "run out" with no warning.

B-18 LOW - Monthly series skip months lacking the date rather than clamping (recurrenceExpander.ts:48-52); and `generateRecurrenceDatesAfter` (recurrenceExpander.ts:~108) anchors on the last occurrence, which after a skip can be a different day-of-month.

B-19 LOW - `sharedUpdates` includes `calendarContainerId/categoryId/timezone` and `attendees` is separate; `originalStart/End` (drag diff markers) are NOT updated for scoped rows in `applyEventMove`, so "Show differences" in the other rows is inconsistent (App.tsx:2326-2332).

B-26 [FIXED 2026-10-11] MEDIUM - Making a single event repeat silently moves it to the first pattern day if its own weekday is not selected (App.tsx:4287).

B-29 LOW - Resize never asks for scope; a resize on a recurring row changes only that row (App.tsx:2339), while move asks.

B-30 [FIXED 2026-10-11] MEDIUM - `deleteEvents` (useStore.ts:907) does not remove stickers (the single `deleteEvent` does at :838). Series delete leaves orphaned event-anchored stickers; they are no longer rendered but count toward the 500 sticker cap and persist locally.

### Data / persistence / undo

B-14 MEDIUM - Event tags are silently discarded: AddModal collects `tags` for events but `eventPayload` has no tag field (App.tsx:1362-1384) and the events table has no tag column.

B-15 [FIXED 2026-10-11] LOW - `isPastEvent` (App.tsx:1356-1359) compares only the start `date` and end time-of-day; a cross-midnight event starting today ending tomorrow morning can be wrongly marked 'unplanned' if the end time-of-day has passed.

B-31 [FIXED 2026-10-11] MEDIUM - Undo coverage gaps: popup saves (`onUpdateEvent`, `onUpdateTask`, `onUpdateTimeBlock`, App.tsx:4150-4280) call no `saveSnapshot`, so editing is not undoable while the very next Cmd+Z will undo an earlier unrelated action. Snapshots include gcal and shared events: undo can restore ephemeral rows that persistence filters (`gcal-evt-`, `sharedFromShareId`), and dismissed gcal events reappear until reload. Stickers are excluded, so undoing a delete loses the event's stickers.

B-46 [FIXED 2026-10-11] HIGH - History is never cleared on sign-out or user switch (no `past: []` reset besides initial state). Cmd+Z after signing into another account would write the previous user's snapshot into the store, which the persistence layer then uploads to the new account.

B-44 [FIXED 2026-10-11] MEDIUM - Stickers are not in `supabasePersistence.ts` (no table or row mapping) and absent from the beforeunload local slice (supabasePersistence.ts:760-775). They survive only through the zustand local persist in the same browser, and vanish on other devices or after cache clear.

B-45 [FIXED 2026-10-11] MEDIUM - Shortcuts have no modifier guard (App.tsx:2709-2714): Cmd/Ctrl+A, +D, +W, +M, +3 are intercepted with `preventDefault()` while not in an input (select-all, bookmark, close window/minimize in the desktop shell). Also fires while a modal is open if focus is on a button. Redo via Ctrl+Y not supported.

B-60 MEDIUM - Deleting a calendar or category hard-cascades events/tasks/blocks (useStore.ts:726-768) with `calendarContainerId === id` only, ignoring multi-calendar categories (`calendarContainerIds`) and without stickers/guest cleanup.
B-61 [FIXED 2026-10-11] LOW - `deleteTag` (useStore.ts:781) leaves `tagIds` references on tasks/blocks.

### Mobile

B-35 [FIXED 2026-10-11] HIGH - Mobile writes unpadded times: `normalizeTime` returns `${h}:${mm}` (MobileApp.tsx:456, 922), so 09:00 becomes "9:00". String comparisons (sort, `e.date >= ...`, `<` on times) misorder it, AddModal time inputs show blank, and `new Date('2026-07-01T9:00:00')` is Invalid Date. Editing such an event on desktop and adding a guest makes `toISOString()` throw a RangeError inside `sendNewInvites` (App.tsx:1544), aborting the save.
B-36 [FIXED 2026-10-11] MEDIUM - No end-after-start validation (MobileApp.tsx:900-945, 1698).
B-37 [PARTIAL 2026-10-11: mobile delete/edit now share desktop prompts; mobile edit applies to one occurrence only (noted in the sheet)] MEDIUM - Mobile edit/delete of a series row has no scope prompt and no guest notification/cancel; mobile also cannot create repeats or invites.
B-39 [FIXED 2026-10-11] MEDIUM - Mobile "done" only sets task status (MobileApp.tsx:450, 2903); desktop `handleMarkTaskDone` also confirms blocks. Result: task shows done but its block still shows as missed. Mobile never calls `expandRecurringTasks`, so repeating to-dos made on desktop do not materialize new instances if you only use mobile.

### Tasks

B-38 LOW - Past-slot creation still writes legacy `mode:'recorded'` (App.tsx:1329-1331, 2056; MobileApp none). Works only because `isBlockRecorded` unifies, and `checkRecordingOverlap` / `handleDropTask` budget math still key on `mode==='recorded'` (App.tsx:2036, 2146).
B-40 LOW - `handleConfirmBlock` marks the task done only if every sibling is 'confirmed'; a skipped sibling blocks completion (App.tsx:1240-1244).
B-41 MEDIUM - Deleting the head of a repeating to-do orphans instances and halts generation silently (useStore.ts:304). No series-level delete.
B-42 MEDIUM - Editing an instance's `dueDate` and then expanding recreates the original date (dedup is by dueDate, useStore.ts:331-335). Deleting after moving records the wrong exception date (useStore.ts:309).
B-43 [PARTIAL 2026-10-11: instance->head and pattern change handled; todo scope editing still minimal] MEDIUM - Turning recurrence on for an existing instance makes a second head in the same series (App.tsx:4156-4160); editing the head's pattern or anchor does not rebuild existing instances (no scope concept for to-dos). Recurrence fields are not yet persisted in Supabase per memory, so after reload from the cloud heads may lose pattern.

### Google / ICS

B-22 LOW/MED - No all-day creation; imported all-day events become 00:00-23:59 timed blocks (googleCalendar.ts:~612) and multi-day all-day events render as long cross-midnight cards.
B-47 LOW - Onboarding Google path navigates away 300 ms after `setHasCompletedSetup`, racing `persistOnboardingToSupabase` (App.tsx:2755-2763).
B-48 [PARTIAL 2026-10-11: deferred by decision] MEDIUM (security) - Google refresh token stored in plain localStorage (googleCalendar.ts:41-50); XSS exposure.
B-49 [FIXED 2026-10-11] MEDIUM - `refreshAccessToken` treats ANY 400/401/403 as revoked and calls `disconnectGoogle()` (googleCalendar.ts:213-221), so a transient edge-function error or rate limit disconnects the user.
B-50 [PARTIAL 2026-10-11: unchanged: edits of organizer-owned Google events are local and overwritten on import] MEDIUM - Edits/moves of Google-origin events are local only and are overwritten on next import (future events always take the fresh copy, App.tsx:~660); moves also trigger Timebox attendee emails (B-28 below).
B-28 [FIXED 2026-10-11] LOW - `handleMoveEvent`/`handleResizeEvent` have no `readOnly` guard (only UI-level hiding in EventCard.tsx:814); a readOnly shared event could be dragged locally.
B-51 LOW - Dismissed Google events/calendars/series are localStorage-only: other devices re-import them.

### Sharing (calendar/category/tag) and invite page

B-52 [FIXED 2026-10-11] HIGH - Copy-link generates `/share/cal_<8 chars>` URLs (App.tsx:508-515) that nothing routes; a recipient hits the app root.
B-53 [FIXED 2026-10-11] MEDIUM - `addShareMember` sends no email (index.ts:803-826). Second and later invites to a calendar produce a token but the guest is never told, while the UI toasts "Invite sent".
B-54 [FIXED 2026-10-11] LOW - `handleShareInvite` catch path shows a SUCCESS toast "Invite saved (email may not have sent)" (App.tsx:562) even when the server call failed; the optimistic row is only corrected by `loadCollaborators`.
B-55 LOW - Role selector is cosmetic (App.tsx:591); `includeExisting`/`pushToGoogle` flags stored but unused. Tag-scoped shares return zero events by design (index.ts:1139-1146).
B-56 [FIXED 2026-10-11] MEDIUM - Linking invitees to accounts uses `auth.admin.listUsers()` inside a per-member loop (index.ts:660-672): first page only (default 50 users) and case-sensitive compare, so users beyond page 1 never get `user_id`. `shared_with_me_events` falls back to an email match against the logged-in account's auth email, so an invitee who accepts while signed in under a different address never sees the share.
B-57 LOW - `loadSharedCalendars` returns early when `shared.length === 0` (App.tsx:365): revoked/removed shares leave stale `shared-*` events in the store until reload clears them. N+1 `getUserName` calls per share in `shared_with_me_events`.
B-58 MEDIUM - `respond` is unauthenticated and token-only, and `?action=decline` auto-fires on page load (InvitePage.tsx:32-37) with no confirmation: link-preview bots that execute JS, or a double mount, can decline for the user.
B-59 LOW - InvitePage accept does not prompt sign-in or claim the membership (`user_id` stays null), see B-56.
B-34 [FIXED 2026-10-11] MEDIUM - Accepting/declining on the invite page updates only `share_members.status`; the organizer's event "Invited" chips read `events.attendees[].responseStatus`, so web RSVPs never show on the event (only email-reply RSVPs do via rsvp-inbound).

### Security (edge functions)

B-24 [FIXED 2026-10-11] HIGH - HTML injection in emails: `inviteEmailHtml` (index.ts:79-95) and `eventUpdateEmailHtml` (index.ts:483-500) interpolate sender name, event title and the change text unescaped (no escape helper exists). Event titles are user-controlled and mailed to arbitrary addresses, so a title like `<a href=...>` becomes a phishing vector from the service domain. Escape all interpolated values.
B-32 [FIXED 2026-10-11] HIGH - No ownership/authorization checks on event actions: `create_share`, `resend_invite`, `notify_event_update`, `remove_attendees` accept any `eventId`/emails/`changes`/`event` payload from any authenticated user. They can be used as a mail relay with the service's From address, or to send forged CANCEL .ics for another user's event UID (UID is the row id, `index.ts:754, 873`). No rate limiting.
B-33 [FIXED 2026-10-11] HIGH - `rsvp-inbound` auth is `if (expected && provided !== expected)` (rsvp-inbound/index.ts:~185). If `RSVP_WEBHOOK_SECRET` is unset (and `verify_jwt=false` in config.toml) the endpoint is public. Even with the secret, the reply's UID selects any event id: a forged reply can overwrite `attendees` of any event and appends unknown emails (`recordRsvp`, `if (!matched) updated.push(...)`). Verify the sender is an existing attendee and use a signed per-event token.
B-25 LOW - `createShare` does not dedupe or validate email addresses; duplicate emails in one call will create duplicate members (or fail the batch if a unique index exists).

----------------------------------------------------------------------------------------------------

## PRIORITIZED BUG LIST

P0 (data integrity / security / the "event sharing is broken" report)
1. B-01 Shared repeating event: only the first occurrence invited, no RRULE, attendees copied onto all rows, later updates reference UIDs guests never received.
2. B-24 HTML injection in invite/update emails via event title and sender name.
3. B-32 Unauthorized relay/forgery in `create_share`, `resend_invite`, `notify_event_update`, `remove_attendees` (no ownership check, no rate limit).
4. B-33 `rsvp-inbound` open when secret unset; forged replies rewrite arbitrary events' attendees.
5. B-46 Undo history survives sign-out and can push the previous user's snapshot into the new account.
6. B-02b Delete (single/series, and calendar/category cascade) never cancels invites or revokes shares.

P1 (user-visible breakage)
7. B-05 Multiple `calendar_shares` per event, mismatched resend/RSVP/member state.
8. B-03 "Skip" leaves phantom "Invited" attendees and later emails uninvited people.
9. B-09 Removed guests also receive the update .ics.
10. B-07 Spurious "Description/Notes updated" on every edit of events without description.
11. B-35 Mobile unpadded times ("9:00") causing misordering and a thrown RangeError when later invited from desktop.
12. B-52 Copy-link produces dead URLs; B-53 later calendar invites send no email.
13. B-20 Cannot change or stop a repeating series' pattern.
14. B-17 Fixed 52-occurrence cap and no create-time "until" (daily series ends after ~7 weeks).
15. B-04 Invite sent 2 s after save without awaiting persistence; empty preview on late flush.
16. B-34 Web accept/decline not shown on organizer's event.
17. B-31 Edit popups not undoable; undo/redo interacts badly with ephemeral gcal/shared events and stickers.
18. B-56/B-59 Account linking on invites unreliable (listUsers first page, email mismatch).
19. B-49 Any 400/403 on Google token refresh disconnects the user.
20. B-45 Shortcuts hijack Cmd/Ctrl+A/D/W/M.

P2
21. B-06 Timezone ignored in invites; B-12 InvitePage Google link end date.
22. B-30 Series delete leaves stickers; B-44 stickers not cloud-persisted.
23. B-41/B-42/B-43 Repeating to-do edge cases (delete head, moved instance regenerates, second head).
24. B-39/B-36/B-37 Mobile parity gaps (done does not confirm blocks, no end>start validation, no series scope).
25. B-26 Repeat-conversion silently moves the event; B-14 tags dropped on events; B-58 auto-decline on page load.
26. B-48 Google refresh token in localStorage; B-50/B-51 Google edits overwritten and dismissals not synced.
27. B-60/B-61 Cascading deletes and dangling tag ids.

P3
28. B-08, B-10, B-11, B-13, B-15, B-18, B-19, B-21, B-22, B-25, B-28, B-29, B-38, B-40, B-47, B-54, B-55, B-57.

Verification suggestions (not performed)
- Reproduce B-01 with two accounts: create a weekly event with a guest, move the 3rd occurrence, inspect the received .ics UID.
- Check `calendar_shares` for an event after 2 separate invites (B-05).
- Send an event titled with HTML to a test inbox (B-24).
- Unset `RSVP_WEBHOOK_SECRET` locally and POST a forged REPLY (B-33).
- Sign out and in as another user, press Cmd+Z (B-46).
