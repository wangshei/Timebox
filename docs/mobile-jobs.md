# Mobile jobs-to-be-done (phone user of a timeboxing calendar)

Status legend: Yes = works well, Partial = exists but clunky, No = missing. Taps counted from the Schedule tab.

| Job | Status | Taps | Notes / clunkiness |
|---|---|---|---|
| Glance at now / next | Yes | 0 | "Now" card with time left and "Up next". After the last item of the day it used to say "All done"; now shows the first upcoming item (tomorrow or later). |
| See today at a glance | Yes | 0 | Morning / afternoon / evening sections on Schedule; Plan tab shows the grid. |
| Check another day | Partial -> Yes | 1 (arrows) / swipe | Arrows existed. Added horizontal swipe on the Schedule list and tap-the-date-title to open the mini month (Plan already had it). |
| Quick add event | Partial | 3-4 | FAB -> Event -> title -> time. No natural language ("lunch 12-1 tomorrow"); only `parseTaskInput` ("30min" suffix, todos). Left: NL date/time parser. |
| Quick note on how something went | No -> Yes | 2 | Event/block detail sheet now has "How did it go?" with a note field (saved to the event/block `notes` on blur) for past or in-progress items. Standalone note creation already exists via the FAB. |
| Sticker reaction | No -> Yes | 2 | Four default emojis in the same section (toggle). Previously only the red "Didn't happen" cross. |
| Quick todo capture | Yes | 2 | FAB -> Todo -> type. (Todo list visuals owned by the redesign agent.) |
| Tick off todos | Yes | 1 | Checkbox in To-Do tab. |
| Mark "didn't happen" | Yes | 3 | Tap event -> More -> Didn't happen. |
| Move / reschedule slightly | Partial | edit sheet | Edit start/end in the detail sheet; no nudge (+15m) buttons. Left. |
| Drag a todo into today | Partial | long-press | Plan tab drag exists; tap-to-select then tap slot also works. |
| Respond to invite / see guests | Partial | 2 | Guests visible in detail sheet; RSVP for received invites lives on the web invite page (backend-dependent). |
| Notifications / reminders | No | - | No local reminders on web; native push needs Capacitor plugin + backend. Left. |
| Undo a mistake | Partial | - | Snapshots exist (`useHistoryStore`) but no visible mobile undo control. Left. |
| Search | No | - | No search on mobile. Left. |
| Sign in/out, settings | Partial | 2-3 | Settings reachable from the app; sign-out is in settings. Left unchanged. |
| Offline | Partial | - | State persists in localStorage; sync is queued by the store, no offline indicator. Left. |

## Implemented in this pass
- Schedule: swipe left/right on the list changes day; the date title toggles an inline mini month.
- Schedule: Now/Next card shows the next upcoming item (after today) instead of a dead "All done".
- Detail sheet: "How did it go?" sticker reactions and quick note (stored in `notes`).

## Left / needs backend
Natural-language quick add, reminders/push, search, visible undo, nudge buttons, RSVP from within the app, offline indicator.
