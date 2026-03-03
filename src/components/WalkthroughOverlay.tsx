import React, { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import { NowProvider } from '../contexts/NowContext';
import { LeftSidebar } from './LeftSidebar';
import { CalendarView } from './CalendarView';
import { RightSidebar } from './RightSidebar';
import { SettingsPanel } from './SettingsPanel';
import { SegmentedControl } from './ui/SegmentedControl';
import { THEME } from '../constants/colors';
import {
  getDemoDates, getDemoNow,
  DEMO_CALENDARS, DEMO_CATEGORIES, DEMO_TAGS, DEMO_VISIBILITY,
  getDemoTasks, getDemoTimeBlocks, getDemoEvents, getDemoPlanVsActual,
} from '../data/walkthroughDemoData';
import type { Mode, View } from '../types';
import type { SummaryRow } from '../store/selectors';

// ── No-op handler ────────────────────────────────────────────────────────────
const noop = () => {};
const noopStr = () => '';

// ── Tour steps ───────────────────────────────────────────────────────────────

interface TourStep {
  target: string;
  title: string;
  body: string;
  placement: 'right' | 'left' | 'bottom' | 'top';
  mode: Mode;
  showDifferences: boolean;
  showSettings: boolean;
}

const STEPS: TourStep[] = [
  {
    target: 'left-sidebar',
    title: 'Your Calendar, Your Way',
    body: 'Group what you do by categories and add specific tags for things you want to reserve time for (e.g. your favourite hobbies / people!)',
    placement: 'right',
    mode: 'overall',
    showDifferences: false,
    showSettings: false,
  },
  {
    target: 'right-sidebar',
    title: 'To-Dos and Scheduled Events In One',
    body: 'Drag-and-drop to set task time slots, mark items as done with one click',
    placement: 'left',
    mode: 'overall',
    showDifferences: false,
    showSettings: false,
  },
  {
    target: 'calendar-grid',
    title: 'Know How You Work',
    body: 'Check off what was done and add unexpected work. Compare it with the plan to see where time actually went',
    placement: 'right',
    mode: 'compare',
    showDifferences: true,
    showSettings: false,
  },
  {
    target: 'left-sidebar',
    title: 'Regain Control of Time',
    body: 'Get insights from different activity categories right away to know where you spend most of your time',
    placement: 'right',
    mode: 'compare',
    showDifferences: true,
    showSettings: false,
  },
  {
    target: 'settings-popup',
    title: 'Settings made easy',
    body: 'Manage calendars, categories and tags easily and customize experience in settings',
    placement: 'left',
    mode: 'overall',
    showDifferences: false,
    showSettings: true,
  },
];

// ── Spotlight helpers (reused from OnboardingTour) ───────────────────────────

interface Rect { top: number; left: number; width: number; height: number; }

function getTargetRect(container: HTMLElement, target: string): Rect | null {
  const el = container.querySelector(`[data-tour="${target}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

interface TooltipPos { top: number; left: number; maxWidth: number; }

function computeTooltipPos(rect: Rect, placement: TourStep['placement'], tH: number, tW: number): TooltipPos {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const safeW = Math.min(tW, vw - 32);
  const GAP = 16;
  let top = 0, left = 0;

  switch (placement) {
    case 'right':
      top = rect.top + rect.height / 2 - tH / 2;
      left = rect.left + rect.width + GAP;
      break;
    case 'left':
      top = rect.top + rect.height / 2 - tH / 2;
      left = rect.left - safeW - GAP;
      break;
    case 'bottom':
      top = rect.top + rect.height + GAP;
      left = rect.left + rect.width / 2 - safeW / 2;
      break;
    case 'top':
      top = rect.top - tH - GAP;
      left = rect.left + rect.width / 2 - safeW / 2;
      break;
  }

  top = Math.max(16, Math.min(top, vh - tH - 16));
  left = Math.max(16, Math.min(left, vw - safeW - 16));
  return { top, left, maxWidth: safeW };
}

// ── PlanVsActual analytics section ───────────────────────────────────────────

function DemoPlanVsActualSection({ dates }: { dates: { day1: string; day2: string; day3: string } }) {
  const [pvView, setPvView] = useState<'category' | 'container' | 'tag'>('category');
  const planVsActual = getDemoPlanVsActual();
  const totalPlanned = planVsActual.reduce((s, r) => s + r.plannedHours, 0);
  const totalRecorded = planVsActual.reduce((s, r) => s + r.recordedHours, 0);
  const totalDelta = totalRecorded - totalPlanned;
  const maxH = Math.max(totalPlanned, totalRecorded, 0.01);

  const fmtDate = (d: string) => {
    const [y, m, day] = d.split('-').map(Number);
    return new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
  const rangeLabel = `${fmtDate(dates.day1)} – ${fmtDate(dates.day3)}`;

  return (
    <div style={{ paddingTop: 2 }}>
      <p style={{ fontSize: 10, color: '#AEAEB2', fontWeight: 400, marginBottom: 8 }}>{rangeLabel}</p>
      <div style={{ marginBottom: 12 }}>
        <SegmentedControl
          options={[
            { value: 'category' as const, label: 'Category' },
            { value: 'container' as const, label: 'Calendar' },
            { value: 'tag' as const, label: 'Tag' },
          ]}
          value={pvView}
          onChange={setPvView}
          compact
          style={{ flex: 1, width: '100%' }}
        />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {planVsActual.map((row) => {
          const pctP = (row.plannedHours / maxH) * 100;
          const pctR = (row.recordedHours / maxH) * 100;
          const delta = row.deltaHours;
          const deltaColor = delta > 0.05 ? '#34C759' : delta < -0.05 ? '#FF453A' : THEME.textPrimary;
          const deltaLabel = delta > 0.05 ? `+${delta.toFixed(1)}h` : delta < -0.05 ? `${delta.toFixed(1)}h` : '–';
          return (
            <div key={row.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: row.color, flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 500, color: THEME.textPrimary, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.01em' }}>
                  {row.name}
                </span>
                <span style={{ fontSize: 10, fontWeight: 600, color: deltaColor, flexShrink: 0, letterSpacing: '-0.01em' }}>
                  {deltaLabel}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                <span style={{ fontSize: 9, width: 32, textAlign: 'right', color: '#AEAEB2', flexShrink: 0, letterSpacing: '0.02em' }}>plan</span>
                <div style={{ flex: 1, height: 3, borderRadius: 99, backgroundColor: 'rgba(0,0,0,0.07)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min(100, pctP)}%`, backgroundColor: row.color, opacity: 0.3, borderRadius: 99 }} />
                </div>
                <span style={{ fontSize: 10, width: 26, textAlign: 'right', color: '#AEAEB2', flexShrink: 0 }}>
                  {row.plannedHours.toFixed(1)}h
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 9, width: 32, textAlign: 'right', color: THEME.textPrimary, flexShrink: 0, letterSpacing: '0.02em' }}>actual</span>
                <div style={{ flex: 1, height: 3, borderRadius: 99, backgroundColor: 'rgba(0,0,0,0.07)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min(100, pctR)}%`, backgroundColor: row.color, opacity: 0.85, borderRadius: 99 }} />
                </div>
                <span style={{ fontSize: 10, width: 26, textAlign: 'right', color: THEME.textPrimary, fontWeight: 500, flexShrink: 0 }}>
                  {row.recordedHours.toFixed(1)}h
                </span>
              </div>
            </div>
          );
        })}
        <div style={{ borderTop: '1px solid rgba(0,0,0,0.07)', paddingTop: 8, marginTop: 2, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 10, color: THEME.textPrimary }}>Total recorded</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: THEME.textPrimary, letterSpacing: '-0.01em' }}>{totalRecorded.toFixed(1)}h</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 10, color: '#AEAEB2' }}>Total planned</span>
            <span style={{ fontSize: 10, color: '#AEAEB2' }}>{totalPlanned.toFixed(1)}h</span>
          </div>
          {Math.abs(totalDelta) > 0.05 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 1 }}>
              <span style={{ fontSize: 10, color: '#AEAEB2' }}>Difference</span>
              <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '-0.01em', color: totalDelta > 0 ? '#34C759' : '#FF453A' }}>
                {totalDelta > 0 ? '+' : ''}{totalDelta.toFixed(1)}h
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

interface WalkthroughOverlayProps {
  onComplete: () => void;
}

export function WalkthroughOverlay({ onComplete }: WalkthroughOverlayProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [tooltipPos, setTooltipPos] = useState<TooltipPos>({ top: 0, left: 0, maxWidth: 288 });
  const overlayRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const step = STEPS[stepIndex]!;

  // ── Memoised demo data (computed once) ──
  const dates = useMemo(() => getDemoDates(), []);
  const demoNow = useMemo(() => getDemoNow(), []);
  const demoTasks = useMemo(() => getDemoTasks(dates), [dates]);
  const demoTimeBlocks = useMemo(() => getDemoTimeBlocks(dates), [dates]);
  const demoEvents = useMemo(() => getDemoEvents(dates), [dates]);
  const unscheduledTasks = useMemo(
    () => demoTasks.filter((t) => t.status !== 'done'),
    [demoTasks],
  );

  // ── Spotlight positioning ──
  useLayoutEffect(() => {
    const measure = () => {
      if (!overlayRef.current) return;
      const rect = getTargetRect(overlayRef.current, step.target);
      setTargetRect(rect);
      if (rect && tooltipRef.current) {
        const tH = tooltipRef.current.offsetHeight || 160;
        const tW = tooltipRef.current.offsetWidth || 288;
        setTooltipPos(computeTooltipPos(rect, step.placement, tH, tW));
      }
    };
    // Wait for layout to settle (components inside overlay need a frame)
    const t = setTimeout(measure, 80);
    const raf = requestAnimationFrame(() => requestAnimationFrame(measure));
    return () => { clearTimeout(t); cancelAnimationFrame(raf); };
  }, [stepIndex, step.target, step.placement]);

  // Re-measure on resize
  useEffect(() => {
    const onResize = () => {
      if (!overlayRef.current) return;
      const rect = getTargetRect(overlayRef.current, step.target);
      setTargetRect(rect);
      if (rect && tooltipRef.current) {
        const tH = tooltipRef.current.offsetHeight || 160;
        const tW = tooltipRef.current.offsetWidth || 288;
        setTooltipPos(computeTooltipPos(rect, step.placement, tH, tW));
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [step.target, step.placement]);

  // ── Scroll calendar to ~7 AM so demo content is visible ──
  useEffect(() => {
    const PX_PER_HOUR = 64;
    const t = setTimeout(() => {
      if (!overlayRef.current) return;
      // Find all scrollable calendar containers (overflow-auto divs inside the grid area)
      const scrollables = overlayRef.current.querySelectorAll('[data-tour="calendar-grid"] .overflow-auto, [data-tour="calendar-grid"] .overflow-y-auto');
      scrollables.forEach((el) => {
        el.scrollTop = 7 * PX_PER_HOUR;
      });
    }, 120);
    return () => clearTimeout(t);
  }, [stepIndex]);

  // ── Keyboard nav ──
  const handleNext = () => {
    if (stepIndex < STEPS.length - 1) setStepIndex((i) => i + 1);
    else onComplete();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onComplete();
      else if (e.key === 'Enter' || e.key === 'ArrowRight') handleNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex]);

  const isLast = stepIndex === STEPS.length - 1;

  // ── Highlight style (spotlight cutout) ──
  const highlightStyle: React.CSSProperties | null = targetRect
    ? {
        position: 'fixed',
        top: targetRect.top - 5,
        left: targetRect.left - 5,
        width: targetRect.width + 10,
        height: targetRect.height + 10,
        borderRadius: 14,
        border: '2px solid rgba(141,162,134,0.8)',
        boxShadow: '0 0 0 4000px rgba(0,0,0,0.28), 0 0 0 6px rgba(141,162,134,0.18)',
        pointerEvents: 'none' as const,
        zIndex: 10002,
        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
      }
    : null;

  // ── PlanVsActual analytics section for compare mode ──
  const planVsActualSection = useMemo(
    () => <DemoPlanVsActualSection dates={dates} />,
    [dates],
  );

  return (
    <NowProvider value={demoNow}>
      {/* Full-screen overlay container */}
      <div
        ref={overlayRef}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9995,
          backgroundColor: '#FDFDFB',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* ── App layout (mirrors real app) ── */}
        <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {/* Left panel */}
          <div style={{ width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column', backgroundColor: '#FCFBF7' }}>
            {/* Header — mirror real app */}
            {step.mode !== 'compare' && (
              <div className="flex items-center justify-between gap-1.5 px-3 py-2 flex-shrink-0" style={{ borderBottom: '1px solid rgba(0,0,0,0.09)' }}>
                <span className="text-[16px] font-semibold" style={{ color: THEME.textPrimary, letterSpacing: '0.12em' }}>
                  My Calendars
                </span>
              </div>
            )}
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <LeftSidebar
                calendarContainers={DEMO_CALENDARS}
                categories={DEMO_CATEGORIES}
                tags={DEMO_TAGS}
                timeBlocks={demoTimeBlocks}
                visibility={DEMO_VISIBILITY}
                onToggleVisibility={noop}
                onUpdateCalendar={noop}
                onAddCalendar={noopStr as any}
                onDeleteCalendar={noop}
                onUpdateCategory={noop}
                onAddCategory={noop}
                onDeleteCategory={noop}
                onUpdateTag={noop}
                onAddTag={noop}
                onDeleteTag={noop}
                isCompareMode={step.mode === 'compare'}
                onExitCompare={noop}
                planVsActualSection={step.mode === 'compare' ? planVsActualSection : undefined}
                canEditOrganization={false}
              />
            </div>
          </div>

          {/* Calendar grid area */}
          <div data-tour="calendar-grid" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <CalendarView
              mode={step.mode}
              view="3day"
              onViewChange={noop}
              selectedDate={dates.day1}
              timeBlocks={demoTimeBlocks}
              tasks={demoTasks}
              categories={DEMO_CATEGORIES}
              tags={DEMO_TAGS}
              containers={DEMO_CALENDARS}
              containerVisibility={DEMO_VISIBILITY}
              events={demoEvents}
              defaultShowDifferences={step.showDifferences}
            />
          </div>

          {/* Right panel */}
          <div style={{ width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column', backgroundColor: '#FCFBF7' }}>
            <div className="flex items-center px-4 py-2.5 flex-shrink-0" style={{ borderBottom: '1px solid rgba(0,0,0,0.09)' }}>
              <span className="text-base font-semibold" style={{ color: THEME.textPrimary }}>Tasks</span>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <RightSidebar
                tasks={demoTasks}
                unscheduledTasks={unscheduledTasks}
                partiallyCompletedTasks={[]}
                selectedDate={dates.day2}
                timeBlocks={demoTimeBlocks}
                categories={DEMO_CATEGORIES}
                tags={DEMO_TAGS}
                onAddTask={noop as any}
                events={demoEvents}
              />
            </div>
          </div>
        </div>

        {/* ── Settings panel (step 5) ── */}
        {step.showSettings && (
          <SettingsPanel
            isOpen={true}
            onClose={noop}
            calendarContainers={DEMO_CALENDARS}
            categories={DEMO_CATEGORIES}
            tags={DEMO_TAGS}
            onAddCalendar={noopStr as any}
            onUpdateCalendar={noop}
            onDeleteCalendar={noop}
            onAddCategory={noop}
            onUpdateCategory={noop}
            onDeleteCategory={noop}
            onAddTag={noop}
            onUpdateTag={noop}
            onDeleteTag={noop}
          />
        )}
      </div>

      {/* ── Spotlight highlight ── */}
      {highlightStyle && <div style={highlightStyle} />}

      {/* ── Interaction blocker (above overlay, below tooltip) ── */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 10001, background: 'transparent' }} />

      {/* ── Tour tooltip ── */}
      <div
        ref={tooltipRef}
        style={{
          position: 'fixed',
          top: tooltipPos.top,
          left: tooltipPos.left,
          width: 288,
          maxWidth: tooltipPos.maxWidth,
          zIndex: 10003,
          backgroundColor: '#FFFFFF',
          borderRadius: 16,
          padding: 18,
          boxShadow: '0 12px 40px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08)',
          border: '1px solid rgba(0,0,0,0.07)',
          transition: 'top 0.28s cubic-bezier(0.4,0,0.2,1), left 0.28s cubic-bezier(0.4,0,0.2,1)',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {/* Step dots */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {STEPS.map((_, i) => (
              <div
                key={i}
                style={{
                  width: i === stepIndex ? 16 : 5,
                  height: 5,
                  borderRadius: 99,
                  backgroundColor: i <= stepIndex ? '#8DA286' : '#DBE4D7',
                  transition: 'all 0.3s',
                }}
              />
            ))}
          </div>
          <span style={{ fontSize: 10, fontWeight: 500, color: '#C7C7CC' }}>
            {stepIndex + 1} / {STEPS.length}
          </span>
        </div>

        {/* Content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: '#1C1C1E', margin: 0 }}>
            {step.title}
          </h3>
          <p style={{ fontSize: 12, lineHeight: 1.6, color: '#636366', margin: 0 }}>
            {step.body}
          </p>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 2 }}>
          <button
            onClick={onComplete}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 500, color: '#8E8E93',
              padding: 0, transition: 'color 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#1C1C1E')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#8E8E93')}
          >
            Skip tour
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 9, color: '#C7C7CC' }}>↵ or →</span>
            <button
              onClick={handleNext}
              style={{
                padding: '6px 16px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                backgroundColor: '#4A6741',
                color: '#FFFFFF',
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#3D5736';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#4A6741';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              {isLast ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </NowProvider>
  );
}
