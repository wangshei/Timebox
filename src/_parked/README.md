# Parked features

These features are hidden behind flags in `src/config/features.ts`. Code is kept in place;
flip the flag to `true` to bring the UI back.

| Flag | Feature | Files | Re-enable |
|------|---------|-------|-----------|
| `compareMode` | Plan vs actual compare view (`c` key, Compare toggle, analytics sidebar) | `src/components/CalendarView.tsx` (compare layouts), `CategoryFocusList.tsx`, `TagFocusList.tsx`, `LeftSidebar.tsx`, `src/store/selectors.ts` (`selectPlanVsActual*`), `src/utils/overlapTruncation.ts`, walkthrough steps in `WalkthroughOverlay.tsx` | Set `compareMode: true` |
| `activityPanel` | Desktop (Tauri) screen-activity panel and calendar overlay | `src/components/ActivityPanel.tsx`, `src/services/desktopActivity.ts`, activity effects in `App.tsx` | Set `activityPanel: true` |
| `bookingLinks` | Scheduling links, `/book/:slug` public page | `src/components/SchedulingModal.tsx`, `BookingPage.tsx`, `src/services/booking.ts`, `/book` route in `src/main.tsx`, sidebar section in `LeftSidebar.tsx` | Set `bookingLinks: true` |
| `autoSchedule` | "Auto Schedule" button for unscheduled to-dos | `handleAutoSchedule` in `App.tsx`, button in `RightSidebar.tsx` | Set `autoSchedule: true` |
