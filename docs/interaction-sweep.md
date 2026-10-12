# Interaction sweep (control -> result -> fixed?)

Method: browser run of visitor-mode demo data, JS click-through of every button on each surface
(watching DOM mutation + console errors), plus an automated "occlusion" probe
(`elementFromPoint` at the centre of every visible control) at desktop and 375px widths.
Share/invite network calls were stubbed; no real data touched.

| Control | Result | Fixed? |
|---|---|---|
| Stamp shelf "+" (custom sticker) | Only focused a 1px transparent input; nothing visible happened (needed the OS emoji hotkey, undiscoverable) | Yes: "+" now reveals a visible emoji input (paste/type, or Ctrl+Cmd+Space / Win+.); Esc/outside click closes |
| Stamp button, shelf emojis, stamping an event/block | Works | n/a |
| Settings panel Esc | Did nothing (own modal, no key handler) | Yes |
| Settings tabs, selects, toggles, Explore features | Work, no console errors | n/a |
| Calendar header Next / Previous / Show past | Next arrow overlapped by Event/Todo toggle when both sidebars open (narrow column) | Yes: header wraps to two rows |
| Event/Todo toggle, Today, Day/3 Day/Week/Month | Work | n/a |
| Event popover Edit, AddModal More options / Invite people / timezone | Work | n/a |
| AddModal close X | Works but has no accessible name | Not fixed (AddModal had concurrent edits; add `aria-label="Close"`) |
| Left sidebar add calendar/category, color picker | Work | n/a |
| Right sidebar By day/By due, Add note, Toggle plan view | Work | n/a |
| Mobile Visit-mode banner "Sign in" | Hidden under MobileApp's `position: fixed; inset: 0` root, so visitors could not sign in on mobile | Yes: root is `absolute` inside its container |
| Visit banner "Sign in" wrapped to two lines at 375px | Cosmetic | Yes (nowrap) |
| Mobile New Event sheet, calendar with no categories | "Create Event" permanently disabled with no explanation; switching to an empty calendar kept a stale category from another calendar | Yes: category optional when calendar has none, hint shown, stale id cleared |
| Mobile tabs (Schedule/Plan/To-Do), FAB menu, event sheet (Edit / Didn't happen / Delete) | Work | n/a |

Not covered (tooling limits: viewport emulation kept resetting): mobile Plan long-press drag, ShareModal
send flow, RSVP chips, BugReport submit, drag-resize/move on the grid, popover clamping at the
far-right/bottom edges. Re-run before release.
