import React from 'react';
import { CalendarIcon } from '@heroicons/react/24/solid';
import {
  ClockIcon,
  InboxArrowDownIcon,
  ChartBarSquareIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';

interface LandingPageProps {
  onGetStarted: () => void;
  onLogIn: () => void;
  onTryItOut: () => void;
}

// ── Feature definitions ────────────────────────────────────────────────────

const features = [
  {
    Icon: ClockIcon,
    title: 'Time blocking',
    body: 'Drag tasks from your backlog directly onto the calendar to commit to a time — no more vague to-do lists.',
  },
  {
    Icon: InboxArrowDownIcon,
    title: 'Backlog first',
    body: "Capture everything you need to do without locking in a time. Schedule only when you're ready.",
  },
  {
    Icon: ChartBarSquareIcon,
    title: 'Plan vs. actual',
    body: 'See how your intentions stacked up against what really happened. Honest data makes you a better planner.',
  },
  {
    Icon: ArrowPathIcon,
    title: 'Recurring events',
    body: 'Lock in your routines — gym, classes, deep work — and let Timeboxing keep them on the calendar automatically.',
  },
];

// ── App preview mockup ──────────────────────────────────────────────────────

const CALENDAR_COLORS = ['#5B718C', '#8DA387', '#B3B46D', '#DE8D91'];

type PreviewBlock = {
  col: number;
  row: number;
  span: number;
  color: string;
  label: string;
};

const BLOCKS: PreviewBlock[] = [
  { col: 0, row: 0, span: 1, color: '#D6E6FB', label: 'Morning run' },
  { col: 0, row: 1, span: 2, color: '#8DA387', label: 'Deep work' },
  { col: 0, row: 4, span: 1, color: '#B3B46D', label: 'Lecture' },
  { col: 1, row: 1, span: 2, color: '#8DA387', label: 'Reading' },
  { col: 1, row: 4, span: 1, color: '#DE8D91', label: 'Family call' },
  { col: 2, row: 0, span: 1, color: '#AFB7E7', label: 'Gym' },
  { col: 2, row: 2, span: 2, color: '#F4B6B6', label: 'Study group' },
  { col: 2, row: 5, span: 1, color: '#DAD15F', label: 'Assignment' },
];

const COL_DAYS = ['Mon', 'Tue', 'Wed'];
const COL_DATES = ['12', '13', '14'];
const PREVIEW_HOURS = [9, 10, 11, 12, 13, 14, 15];
const ROW_H = 30;

function AppPreview() {
  return (
    <div
      className="rounded-2xl overflow-hidden w-full"
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid rgba(0,0,0,0.07)',
        boxShadow: '0 8px 40px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)',
        maxWidth: 420,
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* App bar */}
      <div
        className="flex items-center justify-between px-4 py-2.5"
        style={{ backgroundColor: '#FCFBF7', borderBottom: '1px solid rgba(0,0,0,0.06)' }}
      >
        <div className="flex items-center gap-1.5">
          <CalendarIcon className="w-3.5 h-3.5" style={{ color: '#8DA286' }} />
          <span className="text-xs font-semibold" style={{ color: '#1C1C1E' }}>The Timeboxing Club</span>
        </div>
        <div className="flex items-center gap-1.5">
          {CALENDAR_COLORS.map((c) => (
            <div key={c} className="w-2 h-2 rounded-full" style={{ backgroundColor: c }} />
          ))}
        </div>
      </div>

      {/* Day headers */}
      <div
        className="grid"
        style={{
          gridTemplateColumns: '34px repeat(3, 1fr)',
          borderBottom: '1px solid rgba(0,0,0,0.06)',
          backgroundColor: '#FCFBF7',
        }}
      >
        <div />
        {COL_DAYS.map((d, i) => (
          <div
            key={d}
            className="py-2 text-center"
            style={{ borderLeft: '1px solid rgba(0,0,0,0.05)' }}
          >
            <div
              className="text-[8px] font-semibold uppercase tracking-widest"
              style={{ color: '#C7C7CC' }}
            >
              {d}
            </div>
            <div
              className="mx-auto mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
              style={{
                backgroundColor: i === 1 ? '#8DA286' : 'transparent',
                color: i === 1 ? '#FFFFFF' : '#636366',
              }}
            >
              {COL_DATES[i]}
            </div>
          </div>
        ))}
      </div>

      {/* Time grid */}
      <div className="grid" style={{ gridTemplateColumns: '34px repeat(3, 1fr)' }}>
        {/* Hour labels */}
        <div>
          {PREVIEW_HOURS.map((h) => (
            <div
              key={h}
              className="flex items-start justify-end pr-1.5"
              style={{ height: ROW_H, borderBottom: '1px solid rgba(0,0,0,0.04)' }}
            >
              <span className="text-[8px] mt-0.5" style={{ color: '#C7C7CC' }}>
                {h > 12 ? h - 12 : h}{h >= 12 ? 'p' : 'a'}
              </span>
            </div>
          ))}
        </div>

        {/* Day columns with blocks */}
        {COL_DAYS.map((d, ci) => (
          <div key={d} className="relative" style={{ borderLeft: '1px solid rgba(0,0,0,0.05)' }}>
            {PREVIEW_HOURS.map((h) => (
              <div
                key={h}
                style={{ height: ROW_H, borderBottom: '1px solid rgba(0,0,0,0.04)' }}
              />
            ))}
            {BLOCKS.filter((b) => b.col === ci).map((b) => (
              <div
                key={b.label}
                className="absolute left-0.5 right-0.5 rounded flex items-center px-1.5 overflow-hidden"
                style={{
                  top: b.row * ROW_H + 1,
                  height: b.span * ROW_H - 3,
                  backgroundColor: b.color,
                  zIndex: 1,
                }}
              >
                <span
                  className="text-[8px] font-semibold truncate"
                  style={{ color: '#1C1C1E' }}
                >
                  {b.label}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Landing Page ────────────────────────────────────────────────────────────

export function LandingPage({ onGetStarted, onLogIn, onTryItOut }: LandingPageProps) {
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: '#FDFDFB', fontFamily: 'system-ui, -apple-system, sans-serif' }}
    >
      {/* ── Nav ── */}
      <nav
        className="sticky top-0 z-40 flex items-center justify-between px-6 py-3.5"
        style={{
          borderBottom: '1px solid rgba(0,0,0,0.06)',
          backgroundColor: 'rgba(253,253,251,0.88)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      >
        <div className="flex items-center gap-2">
          <CalendarIcon className="w-4 h-4" style={{ color: '#8DA286' }} />
          <span className="text-sm font-semibold tracking-tight" style={{ color: '#1C1C1E' }}>
            The Timeboxing Club
          </span>
        </div>
        <button
          onClick={onLogIn}
          className="text-sm font-medium px-4 py-1.5 rounded-lg transition-all"
          style={{ color: '#636366', border: '1px solid rgba(0,0,0,0.10)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.04)';
            e.currentTarget.style.color = '#1C1C1E';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = '#636366';
          }}
        >
          Log in
        </button>
      </nav>

      {/* ── Hero ── */}
      <section className="flex flex-col lg:flex-row items-center gap-12 lg:gap-20 max-w-6xl mx-auto w-full px-6 py-16 lg:py-24">
        {/* Left: text */}
        <div className="flex flex-col gap-6 flex-1 max-w-xl text-center lg:text-left">
          <div className="flex justify-center lg:justify-start">
            <div
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium"
              style={{
                backgroundColor: 'rgba(141,162,134,0.10)',
                border: '1px solid rgba(141,162,134,0.25)',
                color: '#5A7454',
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#8DA286' }} />
              Intentional scheduling for real life
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <h1
              className="text-4xl sm:text-5xl font-bold tracking-tight"
              style={{ color: '#1C1C1E', lineHeight: 1.08 }}
            >
              Your calendar,{' '}
              <span style={{ color: '#8DA286' }}>finally intentional.</span>
            </h1>
            <p
              className="text-base sm:text-lg leading-relaxed"
              style={{ color: '#636366' }}
            >
              Capture what you need to do, block time for it on your calendar, and see
              whether your week matched your intentions — all in one calm, structured space.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3">
            <button
              onClick={onGetStarted}
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl text-sm font-semibold transition-all"
              style={{
                backgroundColor: '#8DA286',
                color: '#1C1C1E',
                boxShadow: '0 1px 3px rgba(0,0,0,0.10), 0 4px 16px rgba(141,162,134,0.28)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#7A9278';
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.12), 0 8px 24px rgba(141,162,134,0.32)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#8DA286';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.10), 0 4px 16px rgba(141,162,134,0.28)';
              }}
            >
              Get started — it's free
            </button>
            <button
              onClick={onTryItOut}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-sm font-medium transition-all"
              style={{ color: '#636366', border: '1px solid rgba(0,0,0,0.10)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.04)';
                e.currentTarget.style.color = '#1C1C1E';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = '#636366';
              }}
            >
              Try without an account →
            </button>
          </div>

          <p className="text-xs text-center lg:text-left" style={{ color: '#C7C7CC' }}>
            Used by students, makers, and professionals
          </p>
        </div>

        {/* Right: App preview */}
        <div className="flex-1 w-full flex justify-center lg:justify-end max-w-md lg:max-w-none">
          <AppPreview />
        </div>
      </section>

      {/* ── Palette strip ── */}
      <div
        className="flex justify-center gap-2 py-5"
        style={{ borderTop: '1px solid rgba(0,0,0,0.05)' }}
      >
        {[
          '#D6E6FB', '#B8CAF2', '#AFB7E7', '#8E9DCA',
          '#8DA387', '#6593A6', '#DAD15F', '#B3B46D',
          '#DE8D91', '#F4B6B6', '#F4CCAC', '#F3DDC7',
        ].map((c) => (
          <div
            key={c}
            className="w-3.5 h-3.5 rounded-full"
            style={{ backgroundColor: c, opacity: 0.75 }}
          />
        ))}
      </div>

      {/* ── Features ── */}
      <section className="max-w-4xl mx-auto w-full px-6 py-16">
        <div className="text-center mb-10 flex flex-col gap-2">
          <h2 className="text-2xl font-bold tracking-tight" style={{ color: '#1C1C1E' }}>
            Everything you need, nothing you don't
          </h2>
          <p className="text-sm" style={{ color: '#8E8E93' }}>
            Built around one idea: time is your most limited resource.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {features.map(({ Icon, title, body }) => (
            <div
              key={title}
              className="rounded-2xl p-5 flex flex-col gap-3"
              style={{
                backgroundColor: '#FFFFFF',
                border: '1px solid rgba(0,0,0,0.07)',
                boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
              }}
            >
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: 'rgba(141,162,134,0.12)' }}
              >
                <Icon className="w-4 h-4" style={{ color: '#8DA286' }} />
              </div>
              <div className="flex flex-col gap-1">
                <h3 className="text-sm font-semibold" style={{ color: '#1C1C1E' }}>{title}</h3>
                <p className="text-xs leading-relaxed" style={{ color: '#636366' }}>{body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Bottom CTA ── */}
      <section
        className="flex flex-col items-center gap-5 py-16 px-6"
        style={{ backgroundColor: '#F7F6F2', borderTop: '1px solid rgba(0,0,0,0.06)' }}
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <h2 className="text-2xl font-bold tracking-tight" style={{ color: '#1C1C1E' }}>
            Ready to plan with intention?
          </h2>
          <p className="text-sm" style={{ color: '#8E8E93' }}>Free to use. No credit card required.</p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <button
            onClick={onGetStarted}
            className="px-8 py-3 rounded-xl text-sm font-semibold transition-all"
            style={{
              backgroundColor: '#8DA286',
              color: '#1C1C1E',
              boxShadow: '0 1px 3px rgba(0,0,0,0.10), 0 4px 16px rgba(141,162,134,0.28)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#7A9278';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#8DA286';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            Create your free account
          </button>
          <button
            onClick={onTryItOut}
            className="text-sm font-medium transition-colors"
            style={{ color: '#8E8E93' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#1C1C1E')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#8E8E93')}
          >
            Or explore without an account
          </button>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="py-5 px-6 text-center">
        <p className="text-xs" style={{ color: '#C7C7CC' }}>
          © {new Date().getFullYear()} The Timeboxing Club · Your data stays yours.
        </p>
      </footer>
    </div>
  );
}
