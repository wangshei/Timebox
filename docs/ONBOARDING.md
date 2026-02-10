# Timebox — Onboarding for Engineers

**Start here.** This doc tells you what to read, how to run the app, and where everything lives so you can work without constant manual check-ins.

---

## 1. Read order (first day)

1. **This file (ONBOARDING.md)** — You are here.
2. **[ENGINEERING_LEAD.md](./ENGINEERING_LEAD.md)** — Checkpoints, flowcharts, function inventory. Use it to see “what’s done” and “what’s next.”
3. **[TASK_LIST.md](./TASK_LIST.md)** — Actionable checklist. Pick tasks from here; check them off when done.
4. **[SYSTEM_INTEGRATION.md](./SYSTEM_INTEGRATION.md)** — How the app fits together (state, persistence, API). Read before touching store or Supabase.
5. **[UIUX_STANDARDS.md](./UIUX_STANDARDS.md)** — Calendar interaction and UI/UX principles. Read before changing layout or interaction patterns.
6. **[PROJECT_STANDARDS.md](./PROJECT_STANDARDS.md)** — Code style, testing, commits, PR checklist. Follow for every change.
7. **[DEPLOYMENT.md](./DEPLOYMENT.md)** — Vercel setup so each commit gets a working link (optional; do before in-app auth).

---

## 2. Repo layout

```
Timebox/
├── docs/                    # All project docs (you are in docs/)
│   ├── ONBOARDING.md        # This file
│   ├── ENGINEERING_LEAD.md  # Checkpoints, flowcharts, function inventory
│   ├── TASK_LIST.md         # Unfinished work checklist
│   ├── SYSTEM_INTEGRATION.md
│   ├── UIUX_STANDARDS.md
│   ├── PROJECT_STANDARDS.md
│   └── DEPLOYMENT.md        # Vercel setup for live link per commit
├── src/
│   ├── App.tsx              # Root layout, mode toggle, left rail, calendar, right sidebar
│   ├── main.tsx
│   ├── types.ts             # Shared types (Task, TimeBlock, Category, etc.)
│   ├── data/
│   │   └── seed.ts          # Single source of seed data (dev)
│   ├── utils/
│   │   ├── taskHelpers.ts   # Task progress, backlog filters
│   │   ├── dataResolver.ts  # Resolve IDs → full objects for UI
│   │   └── migrateData.ts   # Old format → new format
│   ├── components/          # UI components
│   │   ├── CalendarView.tsx # Header + Day/Week/Month views
│   │   ├── DayView.tsx
│   │   ├── WeekView.tsx
│   │   ├── MonthView.tsx
│   │   ├── TimeBlockCard.tsx
│   │   ├── RightSidebar.tsx # Backlog
│   │   ├── TaskCard.tsx
│   │   ├── CalendarContainerList.tsx
│   │   ├── AddModal.tsx
│   │   └── ui/              # Shared UI primitives (shadcn-style)
│   └── guidelines/
│       └── Guidelines.md    # Optional design-system notes
├── index.html
├── package.json
└── vite.config.ts
```

---

## 3. Run the app

- **Install:** `npm install`
- **Dev:** `npm run dev` (Vite, usually http://localhost:3000)
- **Build:** `npm run build` (output in `dist/` per Vite default)

No backend required for current local-only flow. When Supabase is wired, you’ll need a `.env` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (see PROJECT_STANDARDS or README).

**Live link:** To see each commit on a working URL, connect the repo to Vercel early — see [DEPLOYMENT.md](./DEPLOYMENT.md). Do this before in-app account creation (Supabase auth).

---

## 4. Key concepts (mental model)

- **Task** — Unit of work with estimated duration. Lives in backlog until scheduled/recorded.
- **TimeBlock** — A slice of time on the calendar. Has `mode: 'planned' | 'recorded'`. Only **recorded** blocks drive task progress and analytics.
- **Planning mode** — User arranges **planned** blocks (intention).
- **Recording mode** — User marks what actually happened (**recorded** blocks). Planned blocks appear faded.
- **Category** — *Type of thing to do per day* (e.g. Deep Work, Meetings, Exercise). Has a **color** that is the **block fill** on the calendar. Every task/block has one category.
- **Calendar** — *Function or bucket* (e.g. Work, School, Personal). Has a color shown as the **left border** on blocks. One calendar has many categories. Every task/block has one calendar.
- **Tag** — *Optional* label for things done often under a bucket (e.g. “dance” under Hobby). Not everything needs a tag.

Details: [ENGINEERING_LEAD.md](./ENGINEERING_LEAD.md) (flowcharts + function inventory).

---

## 5. How to pick and do work

1. Open **[TASK_LIST.md](./TASK_LIST.md)** and choose a task (or follow checkpoint order CP1 → CP2 → …).
2. Check **[ENGINEERING_LEAD.md](./ENGINEERING_LEAD.md)** for the checkpoint and which part of the system is involved (UI vs store vs persistence).
3. Read **[SYSTEM_INTEGRATION.md](./SYSTEM_INTEGRATION.md)** if you’re touching state, API, or Supabase.
4. Read **[UIUX_STANDARDS.md](./UIUX_STANDARDS.md)** if you’re changing layout or interaction.
5. Follow **[PROJECT_STANDARDS.md](./PROJECT_STANDARDS.md)** for code, tests, and commits.
6. When done, check off the task in TASK_LIST and, if it completes a checkpoint, mark the checkpoint in ENGINEERING_LEAD.

---

## 6. Who to ask / where to look

- **“What’s the product spec?”** — See ENGINEERING_LEAD (Section 3 function inventory + product notes) and any product spec in project root or docs.
- **“How does state and persistence work?”** — SYSTEM_INTEGRATION.md.
- **“Is this the right way to design this screen?”** — UIUX_STANDARDS.md.
- **“What’s the standard for tests/commits?”** — PROJECT_STANDARDS.md.
- **“What’s left to build?”** — TASK_LIST.md and ENGINEERING_LEAD checkpoints.

---

*Keep this file updated when you add new docs or change the repo layout.*
