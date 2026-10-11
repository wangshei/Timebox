# Timebox UI audit

Read-only audit. Counts come from grep over `src/**/*.tsx` (inline `style` objects). Line numbers are as of commit bef846b.

## 0. Findings at a glance

- **Icons**: Heroicons (`@heroicons/react/24/solid`, 23 import sites; `/outline` only 2) are used in app code. `lucide-react` is only imported by the unused `src/components/ui/*` shadcn files. Hand-written `<svg>` is mixed in, in sizes 8/10/12/13/14/16/18. Icon size classes in use: `h-3.5 w-3.5` (43), `h-3 w-3` (40), `h-4 w-4` (27), plus inline `width/height` 14 (20), 12 (15), 10 (10), 11, 13, 18.
- **Fonts**: `src/styles/globals.css:171` sets `Inter, system-ui...`. `src/index.css:95` sets `--font-sans`. Inline `fontFamily` is `'inherit'` (37) but there are 3 competing system stacks (`system-ui, -apple-system...` x6, `-apple-system, BlinkMacSystemFont...`, `system-ui, ... Roboto`) and 2 mono stacks. Pick one sans (Inter first) and one mono, then delete the inline stacks.
- **Font sizes in px** (count): 10 (172), 12 (149), 11 (104), 13 (99), 14 (68), 9 (35), 15 (29), 16 (21), 20 (10), 28 (8). There are also Tailwind `text-xs`/`text-sm`/`text-[16px]` classes.
- **Weights**: 600 (171), 500 (138), 700 (26), 400 (15).
- **Radii**: 8 (62), 10 (52), 12 (30), 6 (23), 5 (16), 16 (15), 99 (12), 4, 20, 2.
- **Gaps**: 8 (34), 6 (26), 10 (22), 12 (14), 5, 4, 2, 16, 3, 14.
- **Shadows**: at least 10 distinct values. Most common is `0 1px 3px rgba(0,0,0,.10)` (13).
- **z-index**: ad-hoc 1, 10, 20, 30, 40, 50, 60, 70, 90, 91, 101, 200, 300, 400, 401, 500, 599, 600, 9990, 9999.
- **Colors** (hex count): `#8E8E93` 210, `#FFFFFF` 164, `#8DA286` 146, `#1C1C1E` 121, `#AEAEB2` 114, `#636366` 110, `#3A3A3C` 36, `#FF3B30` 33, `#8DA387` 21 (a near-duplicate of primary), `#4285F4` 21 (Google), `#FCFBF7` 17, `#C7C7CC` 17, `#B85050` 17, `#FDFDFB` 15, `#F5F4F0` 15, `#7A9278` 13, `#34C759` 12, `#F8F7F4` 11. Meanwhile `THEME.textPrimary` is `#5F615F`, so most text hardcodes `#1C1C1E` or `#8E8E93` instead of the theme value. Several files redefine `PRIMARY`, `BG`, `BORDER`, `TEXT_*` locally (e.g. `CalendarView.tsx:15-20`, `SettingsPanel`).
- **Unused shadcn**: `src/components/ui/*` (button, dialog, input, select, popover, etc.) has zero importers except `SegmentedControl`, which is hand-written and used.
- **Two sidebar backgrounds**: `#FCFBF7` (sidebar, nav) and `#FDFDFB` (BG in CalendarView, MobileApp root) differ for no reason.

---

## A) Proposed token set

Rule: snap to the most common existing values so migration is a search-and-replace, not a redesign. Put these in one `:root` block in `src/styles/globals.css` and mirror them in a `tokens.ts` (extend `src/constants/colors.ts` `THEME`). Do not add a new file for CSS if you prefer. Dropping `index.css` duplicate vars is a separate cleanup.

### Spacing (4px base)

`--sp-1:4  --sp-2:8  --sp-3:12  --sp-4:16  --sp-5:20  --sp-6:24  --sp-8:32`
Allowed half-step: `--sp-0.5:2`. Remap 5->4 or 6, 10->8 or 12, 14->12 or 16. 10px is the biggest offender (`gap:10` x22, `padding:'10px 12px'` x24). Map 10px to 8 for gaps and to 12 for padding.

### Radii

`--r-sm:6` (chips, small buttons), `--r-md:8` (inputs, buttons, cards, control), `--r-lg:12` (cards, popovers), `--r-xl:16` (modals, sheets), `--r-pill:999`. Merge 4/5->6, 10->8 (or 12 for cards), 14/20->16.

### Typography

| token | size | usage | maps from |
|---|---|---|---|
| `--fs-2xs` | 10 | uppercase labels, badges, tab-bar labels (desktop only) | 9, 10 |
| `--fs-xs` | 11 | captions, meta | 11 |
| `--fs-sm` | 12 | secondary text, buttons-sm, chips | 12 |
| `--fs-base` | 13 | body, inputs, buttons | 13, 14 |
| `--fs-md` | 15 | titles, mobile body | 15, 16 |
| `--fs-lg` | 18 | section/modal headings | 17-20 |
| `--fs-xl` | 28 | big numerics | 28 |

Mobile minimum text is 11 (never 9). Mobile inputs must be 16 to stop iOS focus zoom (see D).
Weights: `--fw-regular:400  --fw-medium:500  --fw-semibold:600`. Retire 700 (26 uses) into 600.
Line-heights: `--lh-tight:1.2` (labels, replaces `lineHeight:1`), `--lh-base:1.5` (replaces 1.4/1.5/1.6), `--lh-loose:1.6` for paragraphs. Letter-spacing: `0.04em` uppercase labels only; remove the scattered `-0.01em`.
Families: `--font-sans: Inter, system-ui, -apple-system, "Segoe UI", sans-serif;` `--font-mono: ui-monospace, SFMono-Regular, Menlo, monospace;`. Buttons/inputs get `font-family: inherit` globally in CSS, so the 37 inline `fontFamily:'inherit'` can be deleted.

### Icons

`--icon-xs:12` (inline with 11-12px text, chevrons in dense lists), `--icon-sm:14` (default for toolbar/row buttons, replaces `h-3.5`), `--icon-md:16` (default for main toolbar, nav, modal close; replaces `h-4`), `--icon-lg:20` (empty states, mobile tab bar uses 22/24). Retire 8/10/11/13/18. Library: standardize on Heroicons 24 `outline` for all chrome (`solid` only for active state), stroke 1.5 (2 for tiny). Remove `lucide-react` once `components/ui` is deleted or left unreferenced.

### Colors

Keep existing semantics, replace raw hex with these (values are the dominant existing ones):

| token | value | replaces |
|---|---|---|
| `--text` | `#1C1C1E` | `#1C1C1E` (121), `#3A3A3C` (36), `THEME.textPrimary #5F615F` (decide: the doc says "dark gray"; mixing both is the main inconsistency) |
| `--text-2` | `#636366` | `#636366` (110), `THEME.textSecondary` |
| `--muted` | `#8E8E93` | `#8E8E93` (210), `#6B7280` |
| `--faint` | `#AEAEB2` | `#AEAEB2` (114), `#C7C7CC` placeholders |
| `--border` | `rgba(0,0,0,.08)` | 0.06/0.07/0.08/0.09/0.10/0.12 variants |
| `--border-strong` | `rgba(0,0,0,.14)` | inputs |
| `--surface` | `#FFFFFF` | cards, modals, inputs |
| `--surface-2` | `#FCFBF7` | sidebars, nav, calendar header (also kills `#FDFDFB`, `#F8F7F4`, `#F5F4F0`) |
| `--hover` | `rgba(0,0,0,.05)` | the 0.04/0.05/0.06/0.08 hover fills |
| `--accent` | `#8DA286` | `#8DA286` (146) and `#8DA387` (21) |
| `--accent-hover` | `#7A9278` | `#7A9076` too |
| `--accent-soft` | `rgba(141,162,134,.12)` | 0.08/0.10/0.12/0.14/0.16 tints |
| `--accent-ring` | `rgba(141,162,134,.30)` | 0.20-0.40 borders |
| `--danger` | `#FF3B30` | `#FF3B30` (33), `#FF453A`, `#B85050` (17) |
| `--success` | `#34C759` | same |
| `--warning` | `#FF9500` | same |

Primary fill uses dark text (`--text` on `--accent`), as already noted in `colors.ts`.

### Shadows

`--sh-1: 0 1px 3px rgba(0,0,0,.10)` (segmented active, chips, inputs), `--sh-2: 0 4px 16px rgba(0,0,0,.12)` (popovers/dropdowns; merge `0 4px 12px .1`, `0 6px 24px`), `--sh-3: 0 8px 32px rgba(0,0,0,.14)` (modals; merge `0 12px 40px`, `0 16px 48px`, `0 24px 64px`, `0 8px 40px`), `--sh-sheet: 0 -4px 24px rgba(0,0,0,.12)` (mobile bottom sheets).

### Z-index

`--z-grid:1-4` (calendar internals; today z-10/20/30/40 inside Day/Week/3Day views, keep local), `--z-fab:30`, `--z-sticky:40`, `--z-dropdown:100`, `--z-popover:200`, `--z-modal-backdrop:300`, `--z-modal:310`, `--z-toast:400`, `--z-top:500` (walkthrough, update checker). Replace 50/60/70/90/91/101/200/300/400/401/500/599/600/9990/9999.

---

## B) Proposed shared components

Place them in `src/components/ui/` (replace the unused shadcn files rather than adding a parallel set). All read tokens from section A and set `font-family: inherit`.

### Button
`<Button variant="primary|secondary|ghost|danger|link" size="sm|md|lg" icon? iconPosition? loading? fullWidth? />`
Sizes: sm 28px height, 12px text, radius 6; md 32px, 13px, radius 8; lg 44px (mobile), 15px, radius 12. Mobile auto-promotes to lg via `touch` prop or `coarse` media query.
Replaces: Compare / Show Difference / Today buttons `CalendarView.tsx:~545-606`; Auto Schedule `RightSidebar.tsx:~395-407`; ShareModal action buttons `ShareModal.tsx:363,378`; AddModal footer buttons; SettingsPanel buttons `SettingsPanel.tsx:434,614`; AuthPage and BookingPage submit buttons; MobileApp CTA buttons (`MobileApp.tsx` ~1930-1960, 2198).

### IconButton
`<IconButton icon aria-label size="sm(24)|md(28)|lg(36)|touch(44)" variant="ghost|outline|active" active? />`
Always requires `aria-label`. Replaces: nav chevrons `CalendarView.tsx:~518-528` (`p-1.5` + 16px icon = 28px), reveal-past toggle `:~567`, RightSidebar plan/add buttons `RightSidebar.tsx:~318-345` (26x26), App.tsx header buttons `~2950-3000, 3860`, MobileApp 28/32/36px boxes (`MobileApp.tsx:1304,1311,1316,1940,1948,1981,1996`), tasks button `CalendarView.tsx:~492`.

### Input / Textarea
`<Input size="sm|md" invalid? leadingIcon? />` Height 32 (md), 28 (sm), 44 on mobile with 16px text. Border `--border-strong`, radius 8, focus ring `--accent-ring`. Replaces: AddModal fields (30px-high ad-hoc, `AddModal.tsx:750-843`), SettingsPanel `:843,859`, LeftSidebar inline edit inputs `LeftSidebar.tsx:957` and `~106,874`, MobileApp `inputStyle` `MobileApp.tsx:939` and `:531,547`, ShareModal `:303`, AuthPage.

### Select
`<Select options value onChange size />` (native `<select>` styled, or Popover list). Replaces custom dropdowns in `SettingsPanel.tsx:~898,1004` (identical copies), `AddModal.tsx:~879`, `LeftSidebar.tsx:~1188`.

### Modal / Sheet
`<Modal size="sm(400)|md(440)|lg(560)" title onClose footer />`; `<Sheet side="bottom" detents />` for mobile. Header 48px, padding `--sp-5`, radius `--r-xl`, `--sh-3`, backdrop `rgba(0,0,0,.35)`, focus trap and Esc. Replaces: ShareModal `:224-228` (400, r14), SettingsPanel `:724-736` (440, r14, different shadow), AddModal `:646-651` (r?, shadow `0 8px 32px`), BugReportModal, EditColorModal `:52`, EditTagModal, ScheduleTaskModal `:57`, SchedulingModal; mobile `DetailSheet` `MobileApp.tsx:399`, `AddSheet :834`, sheets at `:513, 954, 2297, 2594` (each re-implements the 36x4 grab handle) and `DraggableBottomSheet.tsx`.

### Popover
`<Popover anchor placement offset>` using one portal root, `--z-popover`, `--sh-2`, radius 12, padding 8. Replaces: event/overlap popups `App.tsx:3399-3652, 4345`, TaskCard menus `TaskCard.tsx:413,553,576,696`, TimeBlockCard `:976,1210`, AddCalendarPopover, ColorPicker, ShareModal dropdown `ShareModal.tsx:~99-117`, FAB menu `CalendarView.tsx:742-833`.

### Chip
`<Chip color? selected? onRemove? size="sm|md">` height 22/26, radius pill, 11/12px text. Replaces: `components/ui/chip.tsx` (exists but unused), tag pills in TaskCard/EventCard/AddModal, DueBadge, MobileApp pill `:2484`, category chips in LeftSidebar.

### SegmentedControl (exists)
Fix and keep `src/components/ui/SegmentedControl.tsx:31-60`. Add `size`, `fullWidth`, `aria-pressed`/role=tablist, token colors, and a `touch` size (44px). Currently the container is hardcoded `rgba(0,0,0,.06)`, radius 8, buttons 12px text; weights 500/400. Reuse for: view toggle `CalendarView.tsx:609`, RightSidebar `:315`, App.tsx plan-vs-actual `:3082`, WalkthroughOverlay, plus the hand-rolled toggle groups in MobileApp (`:3034` region) and SettingsPanel.

### Toggle (switch)
`<Toggle checked onChange size="sm|md" label>`; 36x20 track, 16 thumb. Replaces custom switches in SettingsPanel (grep `role="switch"`/rounded-full spans) and the ad-hoc pressed buttons `CalendarView.tsx:~567` (reveal past) and RightSidebar plan toggle `:~318`, which should be a `Toggle` or an `IconButton active`.

---

## C) Numbered fix list by surface

### Top toolbar (CalendarView desktop header) `src/components/CalendarView.tsx:504-616`
1. **Missing right margin (known)**: the header uses `px-5` (`:504`) but the right-panel collapsed handle in `App.tsx:3834-3846` is an absolutely-positioned 18px-wide tab (`z-10`) at the container edge, so when the to-do panel is closed it sits on top of the right end of the toolbar and the Day/Week/Month toggle looks glued to the edge. Also the `SegmentedControl` right edge has no outer margin when the header `justify-between` wraps. Fix: give the header `padding-right: var(--sp-5)` plus `+18px` when the handle is shown (or move the handle below the header), and set `gap: var(--sp-2)`.
2. Header uses local `BG '#FDFDFB'` (`:16`) while sidebars use `#FCFBF7` -> use `--surface-2` for both.
3. Header height is content-driven (`py-2` with 28px buttons and 28px segmented control) so left panel header (`App.tsx:2947`, `px-3 py-2`), calendar header (`px-5 py-2`) and right panel header (`App.tsx:3849`, `px-4 py-2.5`) do not align on the bottom border. Fix: all three get `height: 48px; padding-inline: var(--sp-4)` and one `--border`.
4. Button heights differ: nav chevrons `p-1.5`+16px icon = 28px; Today `px-3 py-1.5 text-xs`+14px icon = ~30px; Compare `py-1.5 px-3` ~30px; reveal toggle `p-1.5` ~30px with border; segmented 28px. Fix: every control `Button/IconButton size=md` (32px) and `SegmentedControl size=md` (32px).
5. Icon sizes mixed in one row: chevrons `h-4 w-4` (`:520,529`), Today icon `h-3.5` (`:~602`), eye icons `h-4` (`:~575`). Fix: all `--icon-md` 16 except inside sm buttons.
6. Mixed styles for toggles: Compare and reveal-past use accent-soft + 1px accent ring when on, but Show Difference uses raw `#FF3B30` text/border (`:~585`). Fix: `Button variant="danger" outlined`, uses `--danger`.
7. Title: `text-sm font-semibold` (14px) plus a 13px span (`:536`), weights 600/400. Fix: `--fs-md` 15/600 for title and `--fs-base` 13/400 for the date part; drop the inline `fontSize:'13px'`.
8. Hover is done in JS via `onMouseEnter/Leave` with three different rgba values (0.06, 0.08, 0.05). Fix: single CSS `:hover { background: var(--hover) }` class; deletes ~60 handler pairs app-wide.
9. Colors defined locally (`:15-20`): `TEXT_PRIMARY '#5F615F'`, `TEXT_MUTED '#8E8E93'`, `BORDER`. Move to tokens.

### Left sidebar `src/App.tsx:2942-3100`, `src/components/LeftSidebar.tsx`
10. **No top margin above auto-schedule area (known)**: the auto-schedule control is in `RightSidebar.tsx:394-407`, directly under the section divider `borderTop` at `:391` with `pt-2.5 pb-1.5` (`:393`) and the button `px-2 py-1` (about 24px high) sits flush with the list; the "Unscheduled" section also lacks space above the first card because the scroll area is `px-3 pb-3` with no `pt` (`:409`). Fix: header `padding: var(--sp-3) var(--sp-3) var(--sp-2)`, scroll area `padding-top: var(--sp-1)`, Auto Schedule as `Button variant="secondary" size="sm"`. If you meant the left calendar list: `LeftSidebar.tsx:595` uses `px-1.5 pt-1 pb-2` and `:585` uses `px-3 pt-2 pb-3` (two different gutters, 6 vs 12) -> use `padding: var(--sp-2) var(--sp-3)` on both.
11. Panel widths hardcoded 220 (`App.tsx:2944`) and 260 (`:3849`) with inline `#FCFBF7`. Define `--w-left:224`, `--w-right:264` (multiples of 8).
12. Left header title `text-[16px] font-semibold` with `letterSpacing .12em` (`:2949`) vs right header `text-base font-semibold` no tracking (`:3850`). Fix: both `--fs-md/600`, same tracking (none).
13. Sidebar header paddings: left `px-3 py-2`, right `px-4 py-2.5`. Use item 3.
14. Header icon buttons `p-1.5` (left, `:~2956`) vs `p-1` (right activity button `:~3856`) -> `IconButton size=md`.
15. Inline-edit inputs in LeftSidebar (`:106`, `:874`, `:957`) use different heights, borders (`rgba(0,0,0,.10)`) and radii -> `Input size=sm`.
16. Section sub-labels in sidebars use 10-11px `#AEAEB2` (contrast ~2.3:1 on cream, fails WCAG AA). Use `--muted` for text and keep `--faint` for placeholders/decoration only.

### Calendar views `DayView.tsx`, `WeekView.tsx`, `ThreeDayView.tsx`, `MonthView.tsx`
17. The three time-grid views duplicate the same overlay z-indexes (`z-20/30/40`: `DayView.tsx:512,732,808,817,846-892`; `WeekView.tsx:327,379,682,797-807`; `ThreeDayView.tsx:298,622,767-859`). Extract shared `<TimeGrid>` + local z scale `--z-grid-*`.
18. Grid line colors come from `THEME.gridHour/gridHalf` in some places and raw `rgba(0,0,0,.07)` in others (App.tsx plan bars use `.07` for track). Use the border tokens.
19. Hour/day label font sizes: 10/11/12 mixed across the views. Standardize to `--fs-2xs` (hour labels) and `--fs-sm` (day headers).
20. Weekend / today highlight tints differ in each view (grep `rgba(141,162,134` in each file). Use `--accent-soft` for today.

### Event and task cards `EventCard.tsx`, `TaskCard.tsx`, `TimeBlockCard.tsx`, `DueBadge.tsx`
21. Card radii mixed 4/5/6/8 in the same views (`BLOCK_PREVIEW` in colors.ts vs card files). Use `--r-sm` 6 for calendar blocks, `--r-md` 8 for list cards.
22. Title text 11/12/13px and weights 500/600/700 vary between `EventCard`, `TimeBlockCard` (1230 lines) and `TaskCard`. Use `--fs-sm/600` for titles, `--fs-xs/400` for meta.
23. Popover/menu z-indexes 101/200 in `TaskCard.tsx:413,553,576,696` and `TimeBlockCard.tsx:976,1210`: unify at `--z-popover`.
24. Icon sizes in cards: 8/10/11/12/13 px inline SVG next to Heroicons `h-3`. Use `--icon-xs` 12 everywhere inside cards.
25. Card text colors hardcoded `#1C1C1E` / `#8E8E93` while `THEME.textPrimary` is `#5F615F` -> pick tokens.

### AddModal `src/components/AddModal.tsx`
26. `:634` decides mobile by `window.innerWidth < 1024` once at render (not reactive); resize or rotate leaves the wrong layout. Use one shared `useBreakpoint()` hook.
27. Field controls are hardcoded 30px (`:750-843`), a size used nowhere else (buttons 26/28/32). Use `Input/Select size=md` 32 and `Button`.
28. Duplicated inline `boxShadow: '0 1px 3px rgba(0,0,0,0.10), 0 1px 2px rgba(0,0,0,0.06)'` (`:750,817,825,835,843,949`) -> `--sh-1`.
29. Dropdown at `:879` uses `zIndex:50`, width 260, border `.10`; differs from SettingsPanel dropdowns (`.border BORDER`, shadow `0 4px 12px`). One Popover.
30. Modal shadow `0 8px 32px .10` (`:651`) vs ShareModal `0 8px 40px .16` vs Settings `0 24px 64px .14` -> `--sh-3`.

### ShareModal `src/components/ShareModal.tsx`
31. Modal 400px/radius 14 (`:224-227`); header padding `16px 20px 12px` (`:240`) vs body `16px 20px` (`:293`) vs Settings header `12px 16px 12px 20px` (`SettingsPanel.tsx:736`). Use Modal header 48px with `--sp-5` gutters.
32. Close button `padding: 4` (`:277`) = ~24px target; use `IconButton size=md`.
33. Row/button paddings `7px 10px`, `7px 14px`, `10px 12px`, `6px 8px` (`:303,363,378,446`) all off-grid. Map to 8/12.
34. Dropdown `boxShadow '0 4px 16px .12'` (`:117`) is correct for `--sh-2`; keep.

### Settings `SettingsPanel.tsx` (1,844 lines) and `SettingsSidePanel.tsx`
35. Dialog 440px, radius 14, shadow `0 24px 64px` (`:724-728`) -> Modal md, radius 16, `--sh-3`.
36. Two copy-pasted dropdowns (`:898` and `:1004`), 220px max height -> `Select`.
37. Inputs fixed `width: 100` (`:843,859`) with local `BORDER`, `TEXT` constants -> `Input`.
38. Local helpers at `:434,520,614` with paddings `6px 10px`, `8px 10px 8px 12px`, `4px 10px` and `${color}10`/`${color}28` alpha-hex tinting -> `Chip`/`Button` with token tints.
39. Settings has both a modal (`SettingsPanel`) and a side panel (`SettingsSidePanel`) for overlapping content; choose one pattern.

### Popovers / floating UI `App.tsx:3399-3652, 4345`, `AddCalendarPopover.tsx`, `ColorPicker.tsx`
40. z-index 400/401/500/599/600/9990/9999 sprinkled in `App.tsx` and `UpdateChecker.tsx:131,203`; scrims at 400 and content at 401 to stay above. Use the scale in section A.
41. Popup positioning hardcodes `window.innerWidth - 250` (`App.tsx:4337`) rather than measuring the element, so it can clip. Use a Popover that clamps to viewport.
42. FAB menu in `CalendarView.tsx:708-833`: button 38 desktop / 36 mobile (`:725`), offsets 44/46 (`:746,833`), z-30/40/50 chain. Standardize FAB at 44 mobile and 40 desktop.
43. Color-pickers: `ColorPicker.tsx`, `EditColorModal.tsx` (z-60/70), `EditTagModal.tsx` each style swatches differently (size, ring). One `ColorSwatch` primitive.

### MobileApp (`src/components/MobileApp.tsx`, 3,272 lines)
44. Tab bar `:214-300`: bg `#FCFBF7`, labels 10px, icons 22px custom SVGs (`:102-150`), tap area `6px 4px 2px` -> about 44px tall total but the individual button hit area is less than 44 wide-by-tall in practice because of `padding: 6px 4px 2px`. Make each tab `min-height:44px` with label 11px, icon 24px, active uses `--accent` fill.
45. Local `THEME` usage mixed with raw `#8E8E93`/`#AEAEB2`/`#FF9500` (e.g. `:243,293,1023,2175`) -> tokens.
46. Four bottom sheets (`:325, 521, 960, 2302, 2602`) each rebuild the 36x4 grab handle, `maxHeight` (`80vh`, `90vh`, `75vh`) and safe-area padding (`+16px`). One `Sheet` component; use `dvh` not `vh`.
47. `inputStyle` (`:939`) padding `10px 12px`, font 15; date/time inputs override to 14 (`:993,999`) -> iOS zooms below 16px (viewport has `user-scalable=no` so zoom is blocked but the field stays tiny). Use 16.
48. Section labels 10px uppercase `#8E8E93` repeated 25+ times (`:530-594, 2031-2074, 2325, 2612`) -> `<SectionLabel>` (exists at `:358`; reuse it in sheets).
49. 9px text (`:1023,1361,1386,1415,1486,1924,1961`) below legibility floor -> 11px min.
50. Check/skip icon buttons 32x32 and 28x28 (`:1304-1316, 1940-1948, 1981-1996`) -> 44px hit area (padding or `::after`).
51. Calendar tasks FAB/Tasks button 36x36 (`CalendarView.tsx:496`) -> 44.

---

## D) Mobile issues

1. **Touch targets under 44px**: MobileApp 28px (`:1304,1311,1316`), 32px (`:1940,1948,1981,1996`), 22px (`:3090`), 36px (`:331,338`); CalendarView tasks button 36 (`:496`) and FAB 36 (`:725`); RightSidebar action buttons 26px (`RightSidebar.tsx:~318,336`) when `isMobile`; nav chevrons `p-1.5` (28px) in mobile header. Only `minHeight: 44` exists at `MobileApp.tsx:1874,2198`.
2. **Tiny text**: 9px labels (7+ places in MobileApp), 10px nearly everywhere (tab labels, section labels); `#AEAEB2` on white is ~2.3:1.
3. **iOS input zoom / small fields**: inputs at 14-15px (`MobileApp.tsx:939,993,999`) must be >= 16px.
4. **Safe areas**: only 8 `env(safe-area-inset-*)` uses, all in MobileApp bottom paddings and one top spacer (`:207`). Missing: left/right insets in landscape, `DraggableBottomSheet.tsx`, the `App.tsx:3934` mobile branch (FAB offsets `bottom-5 right-4` in CalendarView `:708` ignore the inset and the tab bar height), AddModal mobile layout, ScheduleTaskModal, and Tauri/Capacitor shell. Use `viewport-fit=cover` (already set in `index.html:6`) with `padding-inline: max(var(--sp-4), env(safe-area-inset-left))`.
5. **`vh` units**: `80vh`, `90vh`, `75vh` sheet heights (`MobileApp.tsx:513,954,2594`) are wrong with iOS dynamic toolbars; use `dvh` and `max-height: calc(100dvh - env(safe-area-inset-top) - 16px)`.
6. **Breakpoint split is inconsistent**: Tailwind `lg` (1024) switches layouts in `App.tsx:2942` (`hidden lg:flex`) and `:3934` (`flex lg:hidden`), `AddModal.tsx:634` uses `innerWidth < 1024` (non-reactive), `TaskCard.tsx:155` uses `< 768`, `ui/use-mobile.ts` uses its own `MOBILE_BREAKPOINT`, and `CalendarView` takes an `isMobile` prop. Between 768 and 1023 (iPad portrait, half-width desktop windows) the app renders the phone layout stretched, while AddModal thinks it is mobile and TaskCard thinks it is desktop. Fix: one `useBreakpoint()` hook (phone <768, tablet 768-1023, desktop >=1024) in `src/utils`, used everywhere; render only one branch (`App.tsx` currently mounts both trees and hides one with CSS, so both run effects and duplicate refs/data-tour attributes).
7. **Duplicated logic and UI**: MobileApp (3,272 lines) reimplements the desktop surfaces: `AddSheet :834` vs `AddModal.tsx`; `DetailSheet :399` vs EventCard/TimeBlockCard popovers; its own `formatTime12 :39`, `formatDateHeader :48`, `parseTaskInput :60`, `useCurrentMinutes :22`, `CARD_STYLE :71`, `TodoExpandedPanel :2379`, PlanTab (1,122-1,512, includes a split day view) vs RightSidebar plan mode. Move formatting/parse helpers into `src/utils`, extract headless hooks (add-item form state, task scheduling), and share presentational pieces (Sheet, Chip, SectionLabel, TaskRow).
8. **Overflow**: root is `position: fixed; inset: 0; maxWidth: 100vw` (`MobileApp.tsx:205`) which can still scroll horizontally if children exceed width; fixed widths (`width: 260` dropdown in AddModal `:879`, Settings `width: 440` with only `maxWidth: 92vw`) need `max-width: calc(100vw - 32px)`. WeekView on mobile is force-switched in an effect (`CalendarView.tsx:155-158`, `onViewChange`), an effect-driven redirect that flashes the wrong view; derive the view instead.
9. **Missing touch affordances**: `touch-manipulation` is applied on some buttons only; add globally to buttons. No `-webkit-tap-highlight-color` reset except on tab buttons. No `active:` pressed state because hover is JS-driven (`onMouseEnter`), so on touch devices hover styles stick after tap. Move to CSS `:hover` inside `@media (hover:hover)`.
10. **Hover-only controls**: any control revealed through `onMouseEnter` is unreachable by touch; audit TaskCard/EventCard actions.
11. **Z-order on mobile**: tab bar `zIndex: 50` (`MobileApp.tsx:224`) vs sheets and `App.tsx:3962` `zIndex: 9999`; sheets should sit at `--z-modal` and the tab bar at `--z-sticky`.

---

## Suggested migration order (smallest blast radius first)

1. Add tokens (CSS vars + `tokens.ts`); no visual change. Add global `button, input, select, textarea { font-family: inherit }` and the `:hover` utility.
2. Build `Button`, `IconButton`, `SegmentedControl` (fix), `Input`; fix toolbar items 1-9 and sidebar items 10-16.
3. Build `Modal`/`Sheet`/`Popover`; migrate ShareModal, Settings, AddModal, then MobileApp sheets; adopt the z-index scale.
4. `useBreakpoint()` and mobile fixes (D.1-D.6).
5. Mechanical codemod for hex -> token (top 8 colors cover about 75% of the 1,260 uses) and `fontSize` snapping; delete unused `components/ui/*` and `lucide-react`.
