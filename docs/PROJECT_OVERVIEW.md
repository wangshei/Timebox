# The Timeboxing Club — Project Overview

A short description of what The Timeboxing Club is and the main ideas that drive it. Use this for onboarding, product context, or explaining the app to stakeholders.

---

## What The Timeboxing Club Is

**The Timeboxing Club** is a calendar and task app that helps you **plan** your time (what you intend to do) and **record** what actually happened. You manage **tasks** (with estimates), **time blocks** (scheduled slices of time), and **events** (fixed appointments) on a shared calendar. The app supports comparing planned vs recorded time and keeps a task backlog (Unscheduled, In Progress, Missed, Done) so you can see what’s left to do.

---

## Key Ideas

### 1. Plan vs Record

- **Planned** = “I intend to do this at this time.” You create planned blocks by dragging tasks onto the calendar or by creating events.
- **Recorded** = “I actually did this (or something else).” You record by confirming a past planned block (“Done as planned”) or by editing/creating a block after the fact.
- The app keeps both: planned blocks stay for comparison; recorded blocks represent reality. In the main calendar view, **recorded replaces planned** when they overlap (same slot), so you see one timeline.

### 2. Task Dragging

- **Tasks** live in the right sidebar (backlog). Each task has a title, estimated time, category, and optional due date.
- You **drag a task** from the sidebar onto the Day or Week grid. Dropping it creates a **time block** at that date and time. The block is linked to the task (`taskId`) and inherits category/calendar.
- If you drop in the **past**, the new block is created as **recorded** (you’re logging what you did). If you drop in the **future**, it’s **planned**.
- Duration comes from the drag (e.g. task’s remaining estimate or a default). The grid snaps to 15‑minute steps.

### 3. Block Moving and Resizing

- You can **drag a time block** on the calendar to a new time or day. In the main calendar view, this updates the block’s start/end/date.
- You can **resize** a block by dragging its bottom edge (Day/Week view). Only the end time changes; snapping is 15 minutes.
- When you move or resize a block, its **mode is recomputed** from the new end time: if the block now ends entirely in the **past**, it becomes **recorded**; otherwise it’s **planned**.
- For **recorded** blocks, the app checks for **overlapping** recorded time and blocks changes that would create a conflict.

### 4. Creating Blocks Without a Task

- **Drag on empty grid**: Click and drag on an empty slot (Day/Week). That creates a **draft** time block and opens the Add Modal in event mode. You give it a title, time, category, etc. Submitting turns it into an event (or a standalone block). Cancelling deletes the draft.
- **Floating “Add” button**: Opens the Add Modal to create an event (or task) without a pre-placed block.

### 5. “Done as Planned” and Unconfirm

- For a **past planned** block, you can click the **completion circle** to “mark done as planned.” That creates a **new recorded** block (same details); the original planned block stays (and in main view is hidden by the recorded one).
- **Unconfirm** means “undo that recording”: the recorded block is **deleted**, so the planned block shows again. No duplicate planned blocks.

### 6. End Day

- **End Day** (e.g. in the left sidebar) runs a sweep for the selected date: for every **planned** block that has **no** matching recorded block, the app creates a **recorded** block with `source: 'autoAssumed'` (i.e. “assume it was done as planned”). So “closing the day” fills in what you didn’t manually confirm.

### 7. Compare Mode

- In **Compare** mode (Day view), the calendar splits into two columns: **Plan** (only planned blocks) and **Recorded** (only recorded blocks). Planned blocks are shown with reduced opacity (“ghost”) so you can compare intention vs reality.
- The left sidebar can show **Plan vs Actual** by category/calendar/tag: planned hours vs recorded hours for the selected period.

### 8. Task Backlog Sections

- **Unscheduled**: Tasks with no time blocks. You schedule them by dragging onto the calendar or via “Schedule task.”
- **In Progress**: Tasks that have some blocks but aren’t fully done (planned + recorded &lt; estimated).
- **Missed**: Fixed (date-bound) tasks that are overdue or not completed as planned.
- **Done**: Tasks with no remaining work; section is collapsible, sorted by last recorded date.
- **Events**: Upcoming events list; separate from tasks.

### 9. Drop Block on Sidebar = Unschedule

- In the main calendar view, if you **drag a time block** from the calendar and **drop it on the right sidebar** (task area), that block is **deleted** (“unscheduled”). So the sidebar is a drop target for “remove this from the calendar.”

### 10. Organization (Calendars, Categories, Tags)

- **Calendars** (containers): e.g. Personal, Work. Each has a name and color (e.g. left border on blocks).
- **Categories**: e.g. Meetings, Deep Work. Belong to one or more calendars; their color is the block fill.
- **Tags**: Optional labels under categories (e.g. project names). Used for filtering and Plan vs Actual by tag.
- You can show/hide calendars (visibility toggles). You can **focus** a calendar or category so only those blocks are emphasized; others are muted.

### 11. Views & Modes (Overall vs Compare)

- **Overall**: Default calendar view (Day / Week / Month). You can create and edit blocks, drag tasks onto the grid, move/resize blocks and events, confirm past blocks (“done as planned / differently / something else”), and drop blocks on the sidebar to unschedule.
- **Compare**: Analysis view. Day view shows **side‑by‑side Plan | Recorded** columns; the left sidebar shows **Plan vs Actual** by category/calendar/tag. Compare focuses on visualization; the underlying data and block state rules (planned vs recorded, overlap checks, End Day, etc.) stay the same.

### 12. Persistence and Visit Mode

- When **signed in** (e.g. Supabase magic link), all data (tasks, blocks, events, calendars, categories, tags) syncs to the backend.
- **Visit mode** (“Try without signing in”): You use the app with no account; data is kept in the browser only and is lost on refresh. Useful for trying the app without signing up.

---

## Summary Table

| Idea              | Short description                                                                                                                                                                      |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plan vs Record    | Planned = intention; Recorded = what happened. Recorded replaces planned in the same slot in the main view.                                                                            |
| Task dragging     | Drag task from sidebar onto calendar → creates a time block (planned or recorded based on drop time).                                                                                  |
| Block drag/resize | Move block to new time/date; resize end time via bottom edge; 15‑min snap; moving/resizing can flip planned ↔ recorded based on new end time, with overlap checks for recorded blocks. |
| Create on grid    | Drag on empty slot → draft block → Add Modal → event or standalone block.                                                                                                              |
| Done as planned   | Click circle on past planned block → create recorded copy; unconfirm = delete recorded copy.                                                                                           |
| End Day           | Auto-create recorded blocks for unconfirmed planned blocks (assume done as planned).                                                                                                   |
| Compare mode      | Day: Plan \| Recorded columns; sidebar: Plan vs Actual by category/calendar/tag.                                                                                                       |
| Unschedule        | In the main calendar view, drop block on right sidebar → delete block.                                                                                                                 |
| Organization      | Calendars (containers), Categories (block color), Tags; visibility and focus.                                                                                                          |
| Visit mode        | Use without sign-in; data in browser only, lost on refresh.                                                                                                                            |

---

_For implementation details and UI variations, see [PM_UIUX_FEATURE_DESIGN.md](./PM_UIUX_FEATURE_DESIGN.md). For code standards, see [PROJECT_STANDARDS.md](./PROJECT_STANDARDS.md)._
