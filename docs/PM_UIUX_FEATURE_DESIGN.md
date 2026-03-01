# The Timeboxing Club — PM / UIUX Feature Design Overview

Product-level overview of all UI/UX feature designs in The Timeboxing Club, organized by **feature umbrellas** and **variations**. Use this for product planning, design handoff, and feature inventory.

---

## 1. Layout & Shell

### 1.1 Three-panel layout (desktop)

| Variation | Description |
|-----------|-------------|
| **Left panel** | Organization sidebar (260px). Calendars, categories, tags tree; visibility toggles; Plan vs Actual (Compare mode); End Day; keyboard shortcuts trigger. |
| **Center** | Calendar area. Header (nav, date, view switcher, Today, Compare) + Day/Week/Month content. Primary focus. |
| **Right panel** | Tasks sidebar (320px). Backlog sections (Unscheduled, In Progress, Missed, Done, Events); Add task entry. |

### 1.2 Resizable panels

| Variation | Description |
|-----------|-------------|
| **Left bar** | 8px vertical bar. Click toggles left panel; drag left closes, drag right opens (80px threshold). |
| **Right bar** | 8px vertical bar. Click toggles right panel; drag right closes, drag left opens. |

### 1.3 Mobile / small screen

| Variation | Description |
|-----------|-------------|
| **Mobile layout** | Left/right panels hidden. Center = full-width CalendarView. Tasks = DraggableBottomSheet from bottom. |
| **Draggable bottom sheet** | Touch/mouse drag to resize (min 80px, half, ~85% max). Snap positions. Contains full RightSidebar content. |

### 1.4 Global chrome

| Variation | Description |
|-----------|-------------|
| **Visit-mode banner** | When signed out + "Try without signing in": amber bar with "Visit Mode — nothing will be saved," UI Sandbox, Sign in. |
| **Auth bar** | When signed in: "Signed in as {email} · changes sync to Supabase," Sign out, UI Sandbox link. |
| **Loading gate** | "Loading your data..." full-screen when session exists and data not yet ready. |

---

## 2. Authentication & Onboarding

### 2.1 Sign-in

| Variation | Description |
|-----------|-------------|
| **Magic link (OTP)** | Email input → "Send magic link." Success: "Check your email for a magic link." |
| **Error from URL** | Expired link: "That sign-in link has expired. Request a new one below." Generic: `error_description` from hash. |
| **Try without signing in** | Button to enter visit mode (no persistence). |

### 2.2 Design sandbox

| Variation | Description |
|-----------|-------------|
| **/design route** | Renders Sandbox (design-system preview) instead of main app. Linked from auth bar and visit-mode banner. |

---

## 3. Organization (Left Sidebar)

### 3.1 Organization header

| Variation | Description |
|-----------|-------------|
| **Heading** | "Organization" (overline style). |
| **Settings** | Cog icon → opens SettingsPanel (Calendars / Categories / Tags). |
| **Edit mode** | Pencil/Check toggle. When on: inline add/edit/delete for calendars, categories, tags in tree. |

### 3.2 Calendar / Category / Tag tree

| Variation | Description |
|-----------|-------------|
| **Tree structure** | Calendars (containers) → Categories (under each calendar from blocks + explicit `calendarContainerId`) → Tags (under categories). |
| **Visibility toggles** | Eye / EyeSlash per calendar. Hidden calendars hide their blocks/events in center and in Plan vs Actual. |
| **Focus** | Click calendar or category: `focusedCalendarId` / `focusedCategoryId` — calendar blocks get muted (opacity) except the focused one. |
| **Expand/collapse** | Chevron per calendar/category row to expand or collapse children. |

### 3.3 Inline editing (when Edit mode on)

| Variation | Description |
|-----------|-------------|
| **Edit** | Pencil on row → inline name + ColorPicker; Save/Cancel. |
| **Add** | "Add calendar" / "Add category" / "Add tag" (context: under calendar or category). New name + color (calendar/category); for category, option to attach existing category to calendar. |
| **Delete** | Trash with confirm (or direct delete). |
| **Color** | ColorPicker with preset palette; optional hex. Used for calendar (left border on blocks) and category (block fill). |

### 3.4 Plan vs Actual 

| Variation | Description |
|-----------|-------------|
| **Visibility** | Only when app mode is **Compare**. It's a toggle on top of page and it opens up TWO calendars side by side |
| **Context label** | "Week of {date}" / "{Month YYYY}" / "{date}" depending on calendar view. |
| **Segment toggle** | Category | Calendar | Tag — switches aggregation for the list. |
| **List** | Rows: color dot, name, Planned bar + hours, Recorded bar + hours. |
| **Totals** | "Xh planned · Yh completed" at bottom. |
| **Empty state** | "No time planned or recorded for this day." |

### 3.5 End Day

| Variation | Description |
|-----------|-------------|
| **Button** | "End day ({selectedDate})" at bottom of left sidebar. Runs end-day sweep (e.g. assume unrecorded planned → recorded as planned) for selected date. |

### 3.6 Keyboard shortcuts

| Variation | Description |
|-----------|-------------|
| **Trigger** | "Keyboard shortcuts" + ? at bottom of left sidebar; opens popover. |
| **Shortcuts** | d = Day, w = Week, m = Month, c = Compare, a = Show all calendars. |

---

## 4. Calendar (Center)

### 4.1 Calendar header

| Variation | Description |
|-----------|-------------|
| **Nav** | Prev / Next (day/week/month step). |
| **Title** | Day: "Weekday, Mon DD" / Week: "Mon DD – Mon DD, YYYY" / Month: "Month YYYY". |
| **Today** | Button; sets selected date to today. Highlighted when current view date is today. |
| **Compare** | Toggle Overall vs Compare. Compare: side-by-side Plan \| Recorded (Day only) plus Plan vs Actual aggregation in sidebar. |
| **View switcher** | Day | Week | Month (segmented control). |

### 4.2 Day view

| Variation | Description |
|-----------|-------------|
| **Grid** | 24h vertical grid (e.g. 64px/hour). Time labels; today: current-time line. |
| **Blocks** | Resolved time blocks (task + category/calendar colors). Task blocks: left-aligned, ~72% width. Events: overlap layout, full width. |
| **Block states** | Past confirmed, past unconfirmed, future. A block’s **mode** (planned vs recorded) is recomputed from its end time vs “now” whenever you move/resize it and planned vs recorded mode toggles after you manually click on the block to confirm (only past vs present state change with time); in Compare mode: ghost (planned) vs solid (recorded). Category/calendar focus muting. |
| **Drag task onto grid** | From backlog: drop creates planned/recorded block (time-based). Preview while dragging. |
| **Drag block** | Move block to new time/date; overlap checks run for recorded blocks (changes that would overlap existing recorded time are blocked). |
| **Resize block** | Bottom-edge drag; end time only; 15‑min snap; same overlap checks for recorded blocks. |
| **Create block on grid** | Mouse down + drag on empty grid → new draft block → opens Add Modal (event mode) to fill details. |
| **Click block** | Select; popover: Done as planned / Done differently (edit) / Did something else (delete) for past unconfirmed; Edit/Delete for others. |

### 4.3 Week view

| Variation | Description |
|-----------|-------------|
| **Grid** | 7 columns (Sun–Sat), same hour scale. Blocks positioned by day + time. |
| **Create block** | Drag on empty slot → draft block → Add Modal. |
| **Drag task/block** | Drop task or move block; same rules as Day (date + time). |
| **Block interactions** | Same as Day (confirm, edit, delete, resize where applicable). |

### 4.4 Month view

| Variation | Description |
|-----------|-------------|
| **Grid** | 7×6 calendar cells; week-day headers; previous/current/next month days (current month emphasized). |
| **Per day** | Up to 1–2 blocks + events; "today" styling (e.g. blue bg, red accent). |
| **Click day** | Sets selected date and switches to Day view. |
| **Block display** | Compact; click block for actions (same as Day where supported). |

### 4.5 Compare mode (Day only)

| Variation | Description |
|-----------|-------------|
| **Split** | Two columns: "Plan" (planned blocks) | "Recorded" (recorded blocks). Same Day grid in each. |
| **Matched tasks** | Tasks that have both planned and recorded on that day; visual emphasis (e.g. opacity) to compare. |

### 4.6 Floating action

| Variation | Description |
|-----------|-------------|
| **Add button** | Bottom-right floating "+ Add". Opens Add Modal in event mode. |

---

## 5. Tasks & Backlog (Right Sidebar)

### 5.1 Tasks header

| Variation | Description |
|-----------|-------------|
| **Title** | "Tasks". |
| **View toggle** | "List" (overview) vs "Blocks" (plan). |
| **Range** | Today | Week | Month — filters which tasks/blocks are in scope for In Progress / Missed. |

### 5.2 Backlog sections

| Variation | Description |
|-----------|-------------|
| **Unscheduled** | Tasks with no time blocks. "Add task" button; list of TaskCards. |
| **In Progress** | Partially completed (some blocks, not done). In overview, filtered by range (today/week/month). |
| **Missed** | Fixed (date-bound) tasks, often overdue or not completed. |
| **Done** | Collapsible section (collapsed by default). Sorted by last recorded date. Read-only list with title + recorded hours. |
| **Events** | Upcoming events list (title, time, date); delete per event. |

### 5.3 Task card (TaskCard)

| Variation | Description |
|-----------|-------------|
| **Display** | Title, estimated hours, category color, optional due date; progress bar if recorded > 0. |
| **Drag** | Draggable to Day/Week grid; sets task id + duration. |
| **Click** | Opens popover: title, est., due date, progress, actions. |
| **Actions (popover)** | Schedule task, Edit task, Mark done, Break into chunks, Split task, Delete. |
| **Break into chunks** | Sub-modal: chunk size (e.g. 30/60/90/120 min); creates N tasks, deletes original. |
| **Split task** | Same chunk options; one chunk split off, original reduced. |

### 5.4 Drop target (right sidebar)

| Variation | Description |
|-----------|-------------|
| **Drag block from calendar** | In the Overall view, dropping a block on the right sidebar deletes the block (e.g. "unschedule"). Visual: ring + bg when dragging over. |

---

## 6. Add / Edit Modals & Forms

### 6.1 Add Modal (task or event)

| Variation | Description |
|-----------|-------------|
| **Mode** | Task | Event (tabs or toggle). |
| **Position** | Draggable panel (e.g. bottom-right); max 85vh. |
| **Task form** | Title, estimated hours, category, tags, calendar, due date, link, description; "More" for link/description. |
| **Event form** | Title, date, start time, end time, category, tags, calendar, recurring (pattern + days), link, description. |
| **Recurrence** | Pattern: none, daily, weekly, etc.; custom = day-of-week checkboxes. Edit scope (this / all / all after) for existing recurring events. |
| **Edit mode** | Pre-filled when editing task, time block, or event. Update vs Add. |
| **Draft block** | When user creates block from grid and submits via this modal, draft time block is converted to event (or updated). Cancel = delete draft block. |

### 6.2 Schedule Task Modal

| Variation | Description |
|-----------|-------------|
| **Trigger** | "Schedule" from TaskCard popover. |
| **Fields** | Date, start time, block length (minutes, 15–240, step 15). |
| **Submit** | Creates one planned block from task at given date/time/length. |

### 6.3 Settings panel

| Variation | Description |
|-----------|-------------|
| **Trigger** | Cog in left sidebar header. |
| **Tabs** | Calendars | Categories | Tags. |
| **Per tab** | List of items; Add new; Edit (name, color; categories: which calendars); Delete. |
| **Categories** | Optional multi-calendar assignment (`calendarContainerIds`). |

### 6.4 Edit Color Modal

| Variation | Description |
|-----------|-------------|
| **Usage** | Inline edit color in LeftSidebar or Settings; palette + custom hex. |

### 6.5 Recording overlap warning

| Variation | Description |
|-----------|-------------|
| **Trigger** | When user would create or move a recorded block overlapping another recorded block. |
| **Dialog** | "Overlapping Recording" + message; "Got it" dismiss. |

---

## 7. Block & Event Cards (on calendar)

### 7.1 Time block card (TimeBlockCard)

| Variation | Description |
|-----------|-------------|
| **Visual** | Category color (fill), calendar color (left border). Opacity by state (past/future, confirmed/unconfirmed, compare, focus). |
| **Content** | Title, time range; optional tags/chips. |
| **Past unconfirmed** | Check circle to "Done as planned"; or popover: Done differently (edit), Did something else (delete). |
| **Resize handle** | Bottom edge in Day/Week when in the Overall view. |
| **Popover** | Edit, Delete block, Delete task (if linked). |

### 7.2 Event card (EventCard)

| Variation | Description |
|-----------|-------------|
| **Visual** | Same color system (category + calendar). Overlap layout in Day/Week; fills its time slot (height by duration, width from overlap column). |
| **Content** | Title, duration, time range; optionally description (when tall enough) and category chip/tag. |
| **Drag/resize** | Draggable within Day/Week; bottom-edge resize for end time only; uses same snapping as blocks. |
| **Click** | Popover: Edit, Delete. |

---

## 8. Modes & State

### 8.1 App modes

| Variation | Description |
|-----------|-------------|
| **Overall** | Default. Combined calendar where planned and recorded blocks share one timeline. Create/edit/move/resize blocks and events; drag tasks onto calendar; drop block on sidebar = delete/unschedule; confirm/unconfirm past blocks in place. |
| **Compare** | Day view: split Plan \| Recorded columns. Left sidebar: Plan vs Actual by category/calendar/tag. Uses the same underlying block state rules (planned vs recorded, overlap checks, End Day) as Overall; only the visualization changes. |

### 8.2 Selected date

| Variation | Description |
|-----------|-------------|
| **Scope** | Backlog "for this day," End Day, Plan vs Actual, and calendar nav all use selected date. |
| **Nav** | Prev/Next/Today in calendar header. Month cell click sets date and switches to Day. |

---

## 9. Design System & Consistency

### 9.1 Typography (from UIUX_STANDARDS)

| Level | Use | Example |
|-------|-----|--------|
| Page/section title | Modal title, panel heading | `text-base font-semibold` |
| Section heading | "Calendars," "Unscheduled" | `text-sm font-medium text-neutral-500/700` |
| Body / list | Cards, form value | `text-sm text-neutral-700/800` |
| Label | Form labels | `text-sm font-medium text-neutral-700` |
| Caption | Hints, "Overview" | `text-xs text-neutral-500/600` |
| Overline | "ORGANIZATION" | `text-[10px] font-medium uppercase tracking-wide` |

### 9.2 Colors

| Role | Meaning |
|------|--------|
| Category color | Block **fill** on calendar. |
| Calendar color | Block **left border** on calendar. |
| Focus | Non-focused blocks muted (e.g. 0.35 opacity) when a category/calendar is focused in left sidebar. |

### 9.3 Icons

| Rule | Detail |
|------|--------|
| Library | @heroicons/react; /24/solid for primary, /24/outline for secondary. |
| Sizes | 16px (inline), 20px (buttons/nav), 24px (emphasis), 32/40px (empty states). |

### 9.4 Roundness & components

| Element | Standard |
|--------|----------|
| Modals, dialogs, popovers | `rounded-xl` or `rounded-2xl`. |
| Buttons, inputs | `rounded-lg` or `rounded-md`. |

### 9.5 Empty & error states

| Context | Example |
|--------|--------|
| No unscheduled tasks | "No unscheduled tasks" |
| No upcoming events | "No upcoming events" |
| No plan/actual data | "No time planned or recorded for this day" |
| Errors | Toast or inline message; recording overlap = dedicated dialog. |

---

## 10. Accessibility & Responsiveness

### 10.1 Keyboard

| Area | Behavior |
|------|----------|
| Shortcuts | d, w, m, c, a (when not in input). |
| Focus | Tab through focusable elements; blocks/cards focusable and activatable. |

### 10.2 Touch

| Area | Behavior |
|------|----------|
| Targets | At least 44px where possible. |
| Mobile | Bottom sheet for tasks; tap to open actions if drag is poor. |

### 10.3 Screen readers

| Area | Behavior |
|------|----------|
| Regions | Headings for main areas (e.g. Calendar, Backlog). |
| Labels | Controls labeled; live region for "block added" / "task created" where helpful. |

---

## Summary: Feature Umbrellas

| # | Umbrella | Main variations |
|---|----------|-----------------|
| 1 | **Layout & Shell** | Three-panel desktop, resizable bars, mobile + bottom sheet, auth/visit banners |
| 2 | **Authentication** | Magic link, errors, visit mode, /design sandbox |
| 3 | **Organization** | Tree (calendars/categories/tags), visibility, focus, inline edit, Plan vs Actual, End Day, shortcuts |
| 4 | **Calendar** | Header (nav, Today, Compare, Day/Week/Month), Day/Week/Month views, compare split, drag/resize/create, floating Add |
| 5 | **Tasks & Backlog** | List vs Blocks, Today/Week/Month range, Unscheduled/In Progress/Missed/Done/Events, TaskCard + popover, drop target |
| 6 | **Modals & Forms** | Add Modal (task/event), Schedule Task, Settings, Edit Color, overlap warning |
| 7 | **Block & Event Cards** | TimeBlockCard (states, confirm, resize, popover), EventCard (edit, delete) |
| 8 | **Modes & State** | Overall / Compare, selected date |
| 9 | **Design System** | Typography, color roles, icons, roundness, empty/error states |
| 10 | **A11y & Responsiveness** | Keyboard shortcuts, focus, touch, screen readers |

---

*Source: The Timeboxing Club codebase and [UIUX_STANDARDS.md](./UIUX_STANDARDS.md). Update this doc when adding or changing UI/UX features.*
