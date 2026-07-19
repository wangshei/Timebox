# Timebox Mobile — Design Brief

*A goal-first spec for redesigning the mobile experience. Written to be handed to a design tool or a designer. It defines what the mobile app is **for**, the jobs it must nail, and the constraints it must respect — not a pixel spec.*

---

## 1. The one-sentence goal

**On the phone, a user should be able to capture, schedule, edit, and check off their day in seconds — one thumb, standing in line — and trust it stays in sync with the desktop calendar.**

Mobile is not a shrunken desktop. Desktop is where you *plan the week*; mobile is where you *run the day and capture on the go*. Every screen should be designed for that split.

---

## 2. Who / where / why

- **User:** someone who timeboxes — they plan tasks into calendar blocks and review plan-vs-actual. Already invested in the system on desktop.
- **Context:** in motion. Walking, in a meeting, between things. Poor attention, one hand, small target area, sometimes offline.
- **Emotional goal:** the app should feel *light and fast*, never like paperwork. Today it feels heavy — editing takes too many taps and the flows are unpleasant. That is the core problem to solve.

---

## 3. Core mobile jobs (in priority order)

Design the whole app around these five jobs. If a screen doesn't serve one, question it.

1. **Glance at "now / next."** Open the app → immediately see what I'm supposed to be doing now and what's next. Zero taps.
2. **Quick-capture a task or event.** A thought hits → get it into the system in <5 seconds, schedule-later is fine. One tap from anywhere.
3. **Check off / confirm.** Mark a task done or confirm a block happened (plan-vs-actual) with a single tap — ideally swipe.
4. **Reschedule fast.** "This isn't happening now" → move a block to later/tomorrow without opening a full editor.
5. **Edit inline.** Change a title, time, or category in one or two taps — not a 6-field modal.

---

## 4. What's wrong today (the pain to fix)

- **Editing takes too many taps.** Opening an item drops you into a full modal with every field (title, calendar, category, tags, date, start, end, recurrence, timezone, invites, link, description, notes). On mobile that's overwhelming and slow.
- **Modals are heavy.** Full-screen forms for tiny changes. No fast path for the 90% case (rename, retime, done).
- **Targets are small / desktop-density.** Rows and controls are sized for a mouse.
- **No true quick-capture.** Adding something on the go requires committing to a full form up front.
- **The timer/"start a task now" feature is being retired** — don't design around it.

---

## 5. Design principles for the redesign

1. **Progressive disclosure.** Show the 2–3 fields that matter (title, time, category); tuck the rest behind "More." Creating a task should be *type a title → done*; everything else is optional and defaulted.
2. **Bottom-sheet over full-screen modal.** Edits happen in a thumb-reachable sheet that slides up over context, not a page that replaces it. The user never loses their place.
3. **Swipe is a first-class verb.** Swipe a row right = done/confirm; swipe left = reschedule/snooze. Match the mental model of mail/task apps.
4. **One primary action per screen.** A single, obvious, thumb-zone button (＋ capture). Don't scatter actions across the top bar.
5. **Defaults do the work.** New task defaults: today, next open block or "unscheduled," last-used calendar/category. The user changes only what's wrong.
6. **Big touch targets.** Minimum 44×44pt. Generous spacing over information density.
7. **Optimistic + offline-tolerant.** Actions apply instantly and sync in the background; never block the UI on the network. (The app already persists locally + to Supabase — honor that.)

---

## 6. Screens & flows to design

### A. Today (home)
- Opens here. Top: **"Now"** card (current block/event, big, with a done/confirm action) and **"Up next."**
- Below: a scrollable day timeline OR an agenda list of today's blocks — tappable, swipeable.
- A date strip (‹ Mon Tue **Wed** Thu ›) to move days without leaving the screen.
- Persistent **＋ capture** button in the thumb zone.

### B. Quick-capture (the ＋ flow)
- One tap → bottom sheet with a single focused text field + keyboard up.
- Type a title, hit done → task is created (unscheduled or today, per default).
- Optional chips *below* the field for one-tap set: **When** (Today / Tomorrow / Pick), **Category**, **Task vs Event**. All optional.
- Never force a time picker to save.

### C. Fast edit (tap an item)
- Tap → bottom sheet showing title (editable inline), a time row, a category chip, and Done/Reschedule/Delete actions.
- Time editing is a compact inline stepper or wheel, not a nested modal.
- "More…" expands to the full field set only if needed (recurrence, invites, notes, timezone, link, description).

### D. Reschedule (swipe or from edit)
- Swipe-left on a row → quick options: **Later today · Tomorrow · This weekend · Pick a time.**
- Applies immediately, toast confirms, calendar updates.

### E. Task list (mobile view of the new Todo table)
- The desktop redesign is a Notion-style table; on mobile it collapses to a **grouped agenda**: sections for *Unscheduled*, *Today*, *Tomorrow*, *Later*.
- Each row: checkbox, title, category dot, scheduled time (or "Unscheduled"), due badge.
- Swipe to done/reschedule. Tap to fast-edit. "Unscheduled" tasks get a one-tap **Schedule** action (since drag-drop is awkward on a phone — replace drag with a tap-to-schedule sheet).

### F. Plan-vs-actual review (mobile)
- End-of-day: a lightweight "How did today go?" pass. For each past block: one tap **Did it → confirm** / **Didn't → skip**, optionally adjust actual time. Keep it a fast card-stack, not a form per item.

---

## 7. Hard constraints (must map to the existing data model)

Whatever the design, it has to write to these real entities — don't invent fields the backend can't store:

- **Task**: title, estimatedMinutes, calendarContainerId, categoryId, tagIds[], priority (1–5), dueDate, status (`inbox` / `partially_planned` / `fully_planned` / `partially_done` / `done` / `archived`), link, description, notes.
- **Event**: title, calendar, category, start/end/date (+ optional endDate for cross-midnight), recurrence (none/daily/every-other-day/weekly/monthly/custom-weekdays), timezone, attendees, notes.
- **TimeBlock** (how a task gets "scheduled"): links to a task via `taskId`, has date + start/end, a `confirmationStatus` (pending/confirmed/skipped) for plan-vs-actual. Scheduling a task = creating a TimeBlock; "done for today" often = confirming its block.
- **Calendars → Categories → Tags** are a 3-level hierarchy, each color-coded. Category color is the primary visual coding on cards.

Keep the timebox concept intact: **tasks live in a backlog; scheduling places them as time blocks on the calendar; review compares planned vs actual.** The mobile redesign should make each of those three moments fast, not remove them.

---

## 8. What "better" looks like (success criteria)

- Create a task: **1 tap + typing + 1 tap** (down from a full modal).
- Mark done / reschedule: **1 swipe.**
- Change a time: **≤2 taps**, no full-screen form.
- Open app → know what to do now: **0 taps.**
- Nothing critical is ever more than one thumb-reach from the home screen.
- It feels calm and quick — consistent with the app's parchment/sage aesthetic (warm off-white `#FCFBF7`, sage green `#8DA286`, soft pastel category colors, muted grey-green text `#5F615F`).

---

## 9. Explicitly out of scope

- The "start a task now" live timer / focus-session (being removed).
- Desktop-only power features (bulk multi-select planning, week-grid drag authoring) — keep those on desktop.
- New backend fields. Design within the entities in §7.

---

*Use this brief as the prompt/foundation for the visual design pass. The two things to optimize above all else: **quick-capture** and **fast inline edit** — those are where the current app hurts most.*
