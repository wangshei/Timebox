# Timebox — UI/UX Standards

Principles for calendar interaction and UI so the app stays intuitive and consistent. Use this before changing layout or interaction patterns; ask "is this the most intuitive way to interact with a calendar?" and align with these standards.

---

## 1. Product intent (why these standards)

- **Task-first, not date-first.** Users think in "what I need to do" and "how long it takes," then place it on the calendar. The calendar is the **place** for time, not the only way to create work.
- **Planning vs reality.** We show both. Planning = intention; Recording = what actually happened. The UI must make the difference obvious (e.g. faded planned vs solid recorded) and support comparing them (Plan vs Actual).
- **Forgiving and honest.** Defaults assume "done as planned" where the user didn't record; but the user can always correct. No guilt; clarity over perfection.

---

## 2. Calendar interaction principles

- **Drag time, don't type dates first.** Placing a task on the calendar should be drag-from-backlog (or split then drag). Typing start/end time is secondary (e.g. in a modal for precision).
- **Same interaction in Day, Week, Month.** Where a block is clickable (Day/Week/Month), the same actions apply: in Recording mode, click → "Done as planned" / "Done differently" / "Did something else." Don't make Week/Month "view only" if Day is interactive.
- **30-minute grid.** All blocks snap to 30-minute boundaries unless we explicitly add a "15-min" or "hour" option. Display and resize use the same grid.
- **Visible feedback.** On drag: ghost or outline. On drop: block appears immediately. On "Done as planned": recorded block appears, planned block fades or is replaced. No silent state changes.
- **Selected date drives context.** "Today" summary, backlog "for this day," and End Day action are for the **selected date** (or "today" if that's the selected date). Make the selected date obvious in the header.

---

## 3. Layout and hierarchy (Notion / GCal inspired)

- **Left:** Mode (Planning / Recording), calendar visibility toggles (Personal, Work, School), Today/summary (planned + recorded, Plan vs Actual). Optional: tabs for Calendar / Category / Tag management (Notion-style side panel).
- **Center:** Calendar (Day / Week / Month). Primary focus. Header: nav (prev/next/today), selected date, view switcher.
- **Right:** Backlog. Sections: Unscheduled (flexible), Partially completed, Fixed/Missed, Events. Add Task/Event entry point.
- **Modals:** Add Task, Add Event, Edit block (if needed). Keep primary flows on the main canvas; modals for structured forms.

Side panel for **Calendars / Categories / Tags** should be **editable** (add, rename, delete, color, optional parent group for categories). One place to manage these; no hidden settings.

---

## 4. Consistency and clarity

- **Naming in UI:** Use the same terms as the code and docs: "Planning" / "Recording," "Planned" / "Recorded," "Calendar" (function/bucket), "Category" (type of activity), "Tag" (optional), "Task," "Time block," "End day."
- **Category vs Calendar vs Tag:**
  - **Category** = type of thing to do per day (e.g. Deep Work, Exercise). Category has a **color** → that color is the **block fill** on the calendar. Required for every task/block.
  - **Calendar** = function or bucket (e.g. Work, School). Calendar has a **color** → that color is the **left border** on blocks to differentiate buckets. Required for every task/block. One calendar contains many categories.
  - **Tag** = optional label for recurring/specific things (e.g. "dance" under Hobby). Not everything needs a tag.
- **Colors:** Don't swap meanings: block fill = category; left border = calendar.
- **Empty states:** "No time recorded yet," "No upcoming events," "No unscheduled tasks." Short, actionable. Avoid blank panels with no message.
- **Loading and errors:** Spinner or skeleton for async; toast or inline message for errors. Don't leave the user guessing.
- **Rounded corners:** All popups, modals, and dialogs must have rounded corners (`rounded-xl` or `rounded-2xl`). This includes SettingsPanel, AddModal, ScheduleTaskModal, EditColorModal, EditTagModal, and any other overlay dialogs. Buttons and form inputs should also use rounded corners (`rounded-lg` or `rounded-md`).

---

## 5. Accessibility and responsiveness

- **Keyboard:** Tab through focusable elements; Enter/Space activate buttons. Calendar blocks and task cards should be focusable and activatable from keyboard.
- **Screen readers:** Labels on controls; live region for "block added" / "task created" where it helps. Headings for main regions (e.g. "Calendar," "Backlog").
- **Touch:** Tap targets at least 44px where possible. Drag on mobile can be "tap to open, then choose time" if native drag is poor.
- **Responsive:** Desktop first. Left rail can collapse to a drawer or bottom sheet on small screens; calendar and backlog remain usable.

---

## 6. "Is this the most intuitive way?" checklist

Before shipping a UI change, ask:

- [ ] Can the user **see** the difference between planned and recorded (and, where applicable, Plan vs Actual)?
- [ ] Can they **place** time by dragging (or one-tap flow) instead of only typing?
- [ ] Is the **selected date** obvious, and do summary/backlog/End Day respect it?
- [ ] Are **actions on a block** the same in Day, Week, and Month where the block is clickable?
- [ ] Is **editing calendars/categories/tags** possible from one clear place (side panel / settings)?
- [ ] Are **empty states and errors** clear and actionable?

If any answer is no, adjust the design or document the exception (e.g. "Month view is read-only for v0") in TASK_LIST and ENGINEERING_LEAD.

---

## 7. References

- **Notion:** Sidebar grouping, database views, simple property editing. Use as reference for side panel (Calendars / Categories / Tags) and grouping (e.g. categories under "Personal care").
- **Google Calendar:** Day/Week/Month grid, event creation from slot click, calendar visibility toggles. Use for grid behavior and visibility, not for task-first or Planning vs Recording (we add those).

---

*Update this doc when we adopt new patterns (e.g. recurring blocks, conflicts, or mobile-specific flows).*
