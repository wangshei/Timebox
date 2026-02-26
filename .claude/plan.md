# UI Unification & Design System Overhaul Plan

## Problem Summary
1. **Too gray/brown** — warm-amber tones (#FAF8F4, #F5F1EB, #A08C78) read as muddy gray
2. **Toggle padding too tight** — all segmented controls use px-2/py-1, need px-3/py-1.5+
3. **Left panel background mismatch** — sidebar `#F5F1EB` (tan) vs canvas `#FAF8F4` (amber)
4. **No shared components** — buttons, toggles, section headings, modals all custom in every file
5. **Corner radius inconsistency** — rounded-md, rounded-lg, rounded-xl, rounded-2xl mixed randomly
6. **Weak typography hierarchy** — section labels at 10px barely distinguishable from body 12px

---

## 1. New Color System — "Cream White + Cheerful Blue"

### Rationale
Move from warm-brown impressionist palette to a cleaner, more modern feel:
- **Backgrounds**: barely-warm near-white (not cold, not brown)
- **Blue**: a clear, direct cornflower blue — readable, cheerful, not teal-gray

### Token Values
```
Canvas bg:        #F8F8F6     (barely-warm white, no amber tint)
Panel/sidebar bg: #F0F0EE     (subtle distinction from canvas)
Card/popover bg:  #FFFFFF     (pure white for elevated surfaces)
Hover bg:         #EDF2FC     (very light blue tint for hover)
Active bg:        #E0EBFA     (more visible for active/selected)

Primary blue:     #4A90E2     (clear cornflower / sky blue)
Primary hover:    #3B7FD0     (darker on hover)
Primary light:    rgba(74,144,226,0.10)  (for pills/badges)
Primary pale:     rgba(74,144,226,0.05)  (subtle hover BG)

Text primary:     #18181B     (near-black, clean)
Text secondary:   #52525B     (zinc-600 feel)
Text muted:       #A1A1AA     (zinc-400 feel)
Text label:       #71717A     (zinc-500)

Border light:     rgba(0,0,0,0.06)
Border default:   rgba(0,0,0,0.10)
Border strong:    rgba(0,0,0,0.16)

Destructive:      #E5534B     (clean red)
Success:          #3DBF88     (fresh green)
Warning:          #F59E0B     (amber)
```

### Category/Calendar Colors (Update to brighter versions)
Same hue families but +15% saturation, +5% lightness for all 11 colors.

---

## 2. New Reusable Components

### A. `src/design/tokens.ts`
Single JS object with all design tokens (for inline-style usage).

### B. `src/components/ui/SegmentedControl.tsx`
Replaces the 4 hand-rolled segmented toggles:
- Day / Week / Month (CalendarView)
- Today / Week / Month (RightSidebar)
- Category / Container / Tag (App.tsx plan vs actual)
- Overview / Plan toggle (RightSidebar — different shape: use a chip-toggle instead)

Props: `options: {label, value}[]`, `value`, `onChange`, `size?: 'sm'|'md'`
- Container: pill shape, `p-1` inner padding, `rounded-xl`
- Item: `px-3 py-1.5` (sm) or `px-4 py-2` (md), `rounded-lg`
- Active item: `bg-white shadow-sm text-[primary]`
- Inactive: `text-muted` hover→`text-secondary`

### C. `src/components/ui/SectionLabel.tsx`
Replaces all the `text-[10px] font-semibold uppercase tracking-widest` headings.
- 11px, 500 weight, 0.08em tracking, uppercase
- Color: `text-label` (#71717A)

### D. `src/components/ui/AppModal.tsx`
Unified modal overlay + card wrapper:
- Overlay: `bg-black/25 backdrop-blur-[2px]`
- Card: `bg-white rounded-2xl shadow-2xl border border-black/[0.08]`
- Max widths: `sm=384px`, `md=480px`, `lg=600px`
- Header slot, body slot, footer slot pattern

### E. `src/components/ui/FormField.tsx`
Label + input wrapper with consistent sizing:
- Label: `text-xs font-medium text-label mb-1.5`
- Input: `rounded-lg bg-[#F0F0EE] border border-[rgba(0,0,0,0.10)] text-[#18181B] px-3 py-2 text-sm focus:ring-2 focus:ring-[#4A90E2]/30 focus:border-[#4A90E2]`

### F. Update `src/components/ui/button.tsx`
Update CSS variable bindings to reflect new --primary color.

---

## 3. Radius System (standardized)
- `4px`  — tiny: tag dots, color swatches
- `8px`  — sm: buttons, inputs, small chips  ← `rounded-lg` remapped
- `12px` — md: cards, popovers, segmented controls  ← `rounded-xl`
- `16px` — lg: modal containers, bottom sheets  ← `rounded-2xl`
- `9999px` — pill: full-pill tags/chips

---

## 4. Typography Hierarchy

| Role | Size | Weight | Tracking | Color |
|---|---|---|---|---|
| Page header | 16px | 600 | -0.2px | text-primary |
| Section label | 11px | 500 | 0.08em | text-label (uppercase) |
| Card title | 13px | 600 | -0.1px | text-primary |
| Body | 13px | 400 | — | text-secondary |
| Caption/meta | 11px | 400 | — | text-muted |
| Micro | 10px | 500 | 0.02em | text-muted |

---

## 5. Specific Component Fixes

### CalendarView.tsx
- `#FAF8F4` → `#F8F8F6`
- Day/Week/Month → `<SegmentedControl>`
- Today button → proper `AppButton variant="secondary"`
- Compare toggle → `AppButton variant="ghost" active`
- Plus button → `#4A90E2`

### RightSidebar.tsx
- `#F5F1EB` → `#F0F0EE`
- Today/Week/Month → `<SegmentedControl>`
- Section headings → `<SectionLabel>`
- Overview/Plan toggle → chip button with more padding `px-3 py-1.5`
- Add task button → dashed border stays but with new blue on hover
- Border: new token

### App.tsx
- Left panel bg: `#F0F0EE`
- Right panel bg: `#F0F0EE`
- Canvas bg: `#F8F8F6`
- Category/Container/Tag toggle → `<SegmentedControl>`
- Auth screen → AppModal styling, primary button → new blue

### DayView.tsx / WeekView.tsx
- Grid lines: `rgba(0,0,0,0.06)` (hour) / `rgba(0,0,0,0.03)` (half-hour) — cleaner
- Time labels: `#A1A1AA`
- Current time: `#4A90E2`
- Drag/create preview: `rgba(74,144,226,0.12)` / `rgba(74,144,226,0.5)` border

### TimeBlockCard.tsx / EventCard.tsx
- Popover bg: `#FFFFFF` (pure white, not warm)
- Popover border: `rgba(0,0,0,0.10)`
- Popover shadow: `0 8px 24px rgba(0,0,0,0.12)`
- Popover radius: `12px`
- Text colors: new token values

### All Modals (Add, Schedule, EditTag, AddCalendar)
- Use `<AppModal>` for overlay+card
- Use `<FormField>` for inputs
- Primary action button: `bg-[#4A90E2] hover:bg-[#3B7FD0] text-white`
- Cancel button: `bg-transparent hover:bg-[rgba(0,0,0,0.06)] text-secondary`

### LeftSidebar.tsx
- Background: inherited from panel `#F0F0EE`
- CalendarContainerList / CategoryFocusList: new text colors

### globals.css
- Update all CSS variables to new token values
- Update --primary, --background, --sidebar, --card, --border etc.

---

## 6. Execution Order

1. `src/design/tokens.ts` — new token constants
2. `src/styles/globals.css` — update CSS variables
3. `src/constants/colors.ts` — brighter palette
4. `src/components/ui/SegmentedControl.tsx` — new component
5. `src/components/ui/SectionLabel.tsx` — new component
6. `src/components/ui/AppModal.tsx` — new component
7. `src/components/ui/FormField.tsx` — new component
8. `src/components/ui/button.tsx` — update variants
9. `src/components/CalendarView.tsx`
10. `src/components/RightSidebar.tsx`
11. `src/App.tsx`
12. `src/components/AddModal.tsx`
13. `src/components/ScheduleTaskModal.tsx`
14. `src/components/EditTagModal.tsx`
15. `src/components/AddCalendarPopover.tsx`
16. `src/components/DayView.tsx`
17. `src/components/WeekView.tsx`
18. `src/components/TimeBlockCard.tsx`
19. `src/components/EventCard.tsx`
20. `src/components/LeftSidebar.tsx`
21. `src/components/CalendarContainerList.tsx`
22. `src/components/CategoryFocusList.tsx`
23. Commit
