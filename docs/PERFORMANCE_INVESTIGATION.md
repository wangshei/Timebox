# Calendar Performance Regression — Investigation Report

**Status:** Root causes identified; no logic changed.  
**Scope:** The Timeboxing Club calendar load and render performance.

---

## Executive summary

The calendar feels slow mainly because **every block recalculates “now” and time/contrast state on every render**, and **any parent re-render (e.g. after store update) causes the whole block list to re-render** with no memoization. Backend fetch is not in a loop; grid generation is cheap but not memoized.

---

## 1. Unnecessary re-renders

### 1.1 Blocks re-render on every state change

- **TimeBlockCard** is not wrapped in `React.memo`. Whenever **DayView** (or **WeekView**) re-renders, every **TimeBlockCard** re-renders.
- **DayView** re-renders when: `mode`, `timeBlocks`, `events`, `selectedDate`, `selectedBlock`, or any callback prop reference changes.
- **App** re-renders when Zustand state changes (e.g. `timeBlocks`, `tasks`, `view`, `selectedDate`). So after initial load or any store update, the chain is: **App → CalendarView → DayView → every TimeBlockCard**.

**Conclusion:** Yes — blocks (and grid cells via the hour rows) re-render on every relevant state change.

### 1.2 `now` recalculating every render (confirmed)

**Location:** `src/components/TimeBlockCard.tsx` lines 117–119:

```ts
const now = new Date();
const todayStr = getLocalDateString(now);
const nowMins = now.getHours() * 60 + now.getMinutes();
```

- This runs **inside the component body**, so **every TimeBlockCard render** creates a new `Date`, recomputes `todayStr` and `nowMins`, then derives `isPast` and `timeState` (lines 124–130).
- `timeState` drives `blockVisualState`, which drives `getBaseOpacity()`, `getOpacity()`, and `getEventStyles()` / `getTaskStyles()`.
- So every block re-render recalculates time-based state and all time-derived styling.

**DayView** and **WeekView** do it correctly: they keep `now` in state and update it on an interval (e.g. every 60s). **TimeBlockCard** does not.

**Conclusion:** Yes — `now` is effectively recomputed on every render for every block, and that drives a large amount of derived state and style work.

### 1.3 Unstable object/array and callback props

**In DayView** when rendering each **TimeBlockCard** (lines 349–371):

- `style={{ top: ..., height: ..., width: ..., left: ... }}` — **new object every render** for every block.
- `onSelect={() => onSelectBlock(block.id)}` — **new function every render** for every block.
- `onDeselect={() => onSelectBlock(null)}` — **new function every render** for every block.
- `onResizeStart={onResizeBlock ? (e) => handleResizeStart(block, e) : undefined}` — **new function every render** for every block.

So even if **TimeBlockCard** were wrapped in `React.memo`, these props would change every time DayView re-renders, so memo would not prevent re-renders. **CalendarView** correctly passes `onSelectBlock={setSelectedBlock}` (stable); the instability is introduced in DayView when mapping over blocks.

**Conclusion:** Yes — unstable `style` and callback props per block; they would defeat memoization and contribute to unnecessary re-renders once we add it.

---

## 2. Effects: no infinite or repeated data fetches

### 2.1 Main data / auth effect (App.tsx)

- **Location:** `App.tsx` ~lines 540–581.
- **Dependencies:** `[]` (empty). Effect runs once on mount.
- **Behavior:** Gets session, optionally calls `loadSupabaseState()`, then `setDataReady(true)`. No dependency on `blocks` or other frequently changing state.
- **Conclusion:** No fetch loop; single load on mount. Blocking “Loading your data...” is by design until `dataReady` is true.

### 2.2 Other effects checked

- **DayView / WeekView:** Interval to update `now` (e.g. every 60s) with `[]` deps — correct.
- **DayView:** `creatingBlock`, `resizingBlock`, `dragPreview` ref sync and mouse listeners — deps are appropriate; no loop.
- **WeekView:** Same pattern for `creatingBlock` and `onCreateBlock` — no loop.

**Conclusion:** No infinite or repeated data fetches; no state-update loops in the effects that were reviewed.

---

## 3. Expensive computations (every render, per block)

### 3.1 Time state and contrast/visual state (TimeBlockCard)

- **timeState** (and thus **blockVisualState**) is derived from `now`, `todayStr`, `nowMins`, `block.end`, `block.date` on every render (lines 117–137).
- **getBaseOpacity()**, **getOpacity()** (with focus and compare logic), **getBlockColor()**, **getEventStyles()**, **getTaskStyles()**, **getBlockStyles()** are plain functions called during render. They use:
  - **hexToRgb** / **hexToRgba** / **desaturate** / **lighten** (local helpers in TimeBlockCard) — no memoization.
  - **getLuminance** and **getTextClassForBackground** are imported from `utils/color` but not used in the render path in this component; the heavy work is the local color helpers and the style branches.
- So **every block**, on **every render**, recomputes:
  - time state (now, todayStr, nowMins, isPast, timeState, blockVisualState),
  - opacity (base + focus/compare),
  - full event/task styles (hexToRgba, desaturate, lighten, etc.).

**Conclusion:** Yes — timeState and contrast/visual logic are recalculated on every render for every block; no memoization by block or by color.

### 3.2 Luminance

- **getLuminance** / **getTextClassForBackground** are imported in **TimeBlockCard** but not called in the snippets that were reviewed. The expensive part here is the repeated **hexToRgb** / **hexToRgba** / **desaturate** / **lighten** work in the style getters, not luminance itself. If luminance is used elsewhere in the file, it would still be “per render, per block” unless memoized.

### 3.3 Calendar grid regeneration (DayView / WeekView)

- **DayView** (line 236): `const hours = Array.from({ length: 24 }, (_, i) => i);` — recreated every render; not wrapped in `useMemo`. Cost is low (24 integers), but the 24 hour-row elements and their contents (including `nowMins` per row, line 304) are re-evaluated every time.
- **DayView** (lines 253–259): `currentTimeMinutes`, `currentTimeTopRaw`, `currentTimeTop` — recomputed every render; they depend on `now` (in state), so correct, but could be memoized if desired.
- **DayView** (lines 243–250): **getBlockStyle(block)** — called inside `timeBlocks.map` (line 344); small computation per block, but not memoized at the list level.
- **overlapMap** (lines 275–281): correctly wrapped in **useMemo** `[timeBlocks, events]`.
- **WeekView** (lines 35, 38–46): `hours` and `weekDays` are recreated every render (no useMemo). Again, cheap arrays but full grid re-evaluation.

**Conclusion:** Grid is not “regenerated” in the sense of a heavy function, but the structures (`hours`, `weekDays`) and per-row/per-block work are recomputed every render; only **overlapMap** is memoized.

---

## 4. Backend / fetch behavior

- Single initial load in the auth effect; dependency array `[]`.
- No effect that refetches when `blocks` or similar state changes.
- No evidence of repeated or blocking fetch calls causing the slowdown.

**Conclusion:** Fetch is not running more than once due to effect deps; we are not refetching after every state change; the only “blocking” is the intended “Loading your data...” until `dataReady`.

---

## 5. React DevTools Profiler — what to check

Suggested checks (no code changes, observation only):

1. **Which component renders the most**
   - Expect: **TimeBlockCard** (or the component that wraps the list of blocks) to show high render count when the calendar first loads or when store data updates.

2. **Which component renders repeatedly**
   - After a single user action (e.g. changing date or opening/closing a panel), see if **DayView** and then every **TimeBlockCard** re-render. If so, that matches the “no memo + unstable props” picture.

3. **What triggers the re-render cascade**
   - Trigger: store update (e.g. after load, or after adding/editing a block) → **App** re-renders → **CalendarView** → **DayView** → all blocks.  
   - Also: any parent state that changes callback or object prop identity (e.g. inline handlers from App) will cause the same cascade.

---

## 6. Root cause summary (by your categories)

| Item | Finding |
|------|--------|
| **A. `now` recalculating every render** | **CONFIRMED** in **TimeBlockCard**: `const now = new Date()` in component body (line 117). Drives timeState and all time-based styling for every block on every render. |
| **B. Calendar grid regenerating every render** | **PARTIAL**: `hours` (DayView) and `hours`/`weekDays` (WeekView) recreated every render; not heavy, but not memoized. **overlapMap** is memoized. |
| **C. Backend fetch loop** | **NOT PRESENT**: Single load in effect with `[]` deps; no refetch on `blocks` or similar. |
| **D. Contrast / luminance per render** | **CONFIRMED** for style logic: **TimeBlockCard** recalculates getBlockColor, getOpacity, getEventStyles/getTaskStyles (hexToRgba, desaturate, lighten) every render per block. getLuminance/getTextClassForBackground imported but not used in the hot path in the reviewed code. |
| **E. Drag state causing full re-render** | **CONTRIBUTES**: Drag/creating/resizing update state in the same tree; combined with no **React.memo** on blocks and unstable callback/style props, any state change causes full calendar (and all blocks) to re-render. |
| **F. Strict Mode double render** | **NOT APPLICABLE**: No `StrictMode` found in the repo. |

---

## 7. Most likely primary causes (in order)

1. **TimeBlockCard: `now = new Date()` and derived state on every render**  
   Every block recalculates time and time-based visuals on every parent re-render. Fix: use a single `now` from props or context (or state at view level, as DayView/WeekView already do) and/or memoize time-derived state per block.

2. **No memoization of block list children**  
   Any App/CalendarView/DayView re-render re-renders every **TimeBlockCard** with heavy per-render work. Fix: **React.memo(TimeBlockCard)** plus stable props (see below).

3. **Unstable props from DayView to each TimeBlockCard**  
   New `style` object and new `onSelect` / `onDeselect` / `onResizeStart` functions every render. Fix: stable callbacks (e.g. `useCallback` or pass `onSelectBlock` + `block.id` and let the card call `onSelectBlock(block.id)`), and stable or memoized `style` per block so that **React.memo** can actually skip re-renders.

4. **Per-block style and opacity recomputation**  
   getBlockStyles(), getOpacity(), getBlockColor(), and color helpers run every render for every block. Fix: memoize by `block.id` + `blockVisualState` + focus ids (and any other inputs), or memoize contrast/opacity per color/state so we don’t recompute the same result repeatedly.

5. **Minor: grid arrays and per-row work**  
   `hours` / `weekDays` and per-hour `nowMins` in DayView/WeekView recreated every render. Fix: wrap in `useMemo` if we want to avoid even small redundant work.

---

## 8. Recommended next steps (after you decide to change logic)

1. **TimeBlockCard**
   - Remove local `const now = new Date()`.
   - Accept `now` (or `todayStr` + `nowMins`) as a prop from DayView/WeekView (they already have it in state), or from a small context that updates on the same interval.
   - Optionally memoize derived time/visual state and styles (e.g. by block id + time state + focus).

2. **DayView (and WeekView where similar)**
   - Use stable callbacks for **TimeBlockCard**: e.g. pass `onSelectBlock` and `block.id` so the card can call `onSelectBlock(block.id)` instead of `onSelect={() => onSelectBlock(block.id)}`; same idea for onDeselect and onResizeStart (e.g. `handleResizeStart` already exists; ensure it’s stable and pass block from map only where needed).
   - Memoize or stabilize `style` per block (e.g. `useMemo` per block in the map, or a single memoized function that returns style by block id).

3. **TimeBlockCard**
   - Wrap in **React.memo** so it only re-renders when its props actually change (after the above stabilizations).

4. **Optional**
   - Memoize **hours** / **weekDays** in DayView and WeekView.
   - Memoize contrast/opacity or full style result in TimeBlockCard by inputs (block id, time state, color, focus ids).

No logic has been changed in this investigation; the above are recommendations for when you implement fixes.
