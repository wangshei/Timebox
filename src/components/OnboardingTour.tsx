import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';

export interface TourStep {
  target: string;
  title: string;
  body: string;
  placement: 'right' | 'left' | 'bottom' | 'top';
}

const STEPS: TourStep[] = [
  {
    target: 'left-sidebar',
    title: 'Your calendars',
    body: 'Your calendars and categories live here. Click + next to any calendar to add a category, or + at the top to create a new one.',
    placement: 'right',
  },
  {
    target: 'calendar-list',
    title: 'Manage & organise',
    body: 'Toggle calendars on/off with the eye icon. Use the pencil to rename, recolour, or delete. Categories nest inside each calendar.',
    placement: 'right',
  },
  {
    target: 'right-sidebar',
    title: 'Your task backlog',
    body: 'Add tasks here first — give them an estimate, a calendar, and a category. Once in your backlog, drag them onto the calendar to schedule.',
    placement: 'left',
  },
  {
    target: 'add-task-btn',
    title: 'Drag to schedule',
    body: 'Drag any task card from this panel and drop it onto a time slot in the calendar. Timeboxing creates a time block automatically.',
    placement: 'left',
  },
];

const GAP = 16;

interface Rect { top: number; left: number; width: number; height: number; }

function getTargetRect(target: string): Rect | null {
  const el = document.querySelector(`[data-tour="${target}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

interface TooltipPos { top: number; left: number; maxWidth: number; }

function computeTooltipPos(rect: Rect, placement: TourStep['placement'], tH: number, tW: number): TooltipPos {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const safeW = Math.min(tW, vw - 32);
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

interface OnboardingTourProps {
  onComplete: () => void;
}

export function OnboardingTour({ onComplete }: OnboardingTourProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [tooltipPos, setTooltipPos] = useState<TooltipPos>({ top: 0, left: 0, maxWidth: 280 });
  const tooltipRef = useRef<HTMLDivElement>(null);
  const step = STEPS[stepIndex]!;

  useLayoutEffect(() => {
    const measure = () => {
      const rect = getTargetRect(step.target);
      setTargetRect(rect);
      if (rect && tooltipRef.current) {
        const tH = tooltipRef.current.offsetHeight || 160;
        const tW = tooltipRef.current.offsetWidth || 288;
        setTooltipPos(computeTooltipPos(rect, step.placement, tH, tW));
      }
    };
    measure();
    const raf = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(raf);
  }, [stepIndex, step.target, step.placement]);

  useEffect(() => {
    const onResize = () => {
      const rect = getTargetRect(step.target);
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

  const handleNext = () => {
    if (stepIndex < STEPS.length - 1) setStepIndex((i) => i + 1);
    else onComplete();
  };

  // Keyboard navigation: Escape = skip, Enter/→ = next
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onComplete(); }
      else if (e.key === 'Enter' || e.key === 'ArrowRight') { handleNext(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex]);

  const isLast = stepIndex === STEPS.length - 1;

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
        pointerEvents: 'none',
        zIndex: 9998,
        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
      }
    : null;

  return (
    <>
      {/* Backdrop to prevent interaction with underlying UI */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9997,
          background: 'transparent',
        }}
      />
      {highlightStyle && <div style={highlightStyle} />}

      <div
        ref={tooltipRef}
        className="fixed flex flex-col gap-3"
        style={{
          top: tooltipPos.top,
          left: tooltipPos.left,
          width: 288,
          maxWidth: tooltipPos.maxWidth,
          zIndex: 9999,
          backgroundColor: '#FFFFFF',
          borderRadius: 16,
          padding: '18px',
          boxShadow: '0 12px 40px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08)',
          border: '1px solid rgba(0,0,0,0.07)',
          transition: 'top 0.28s cubic-bezier(0.4,0,0.2,1), left 0.28s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        {/* Step counter + dots */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className="rounded-full transition-all duration-300"
                style={{
                  width: i === stepIndex ? 16 : 5,
                  height: 5,
                  backgroundColor: i <= stepIndex ? '#8DA286' : '#DBE4D7',
                }}
              />
            ))}
          </div>
          <span className="text-[10px] font-medium" style={{ color: '#C7C7CC' }}>
            {stepIndex + 1} / {STEPS.length}
          </span>
        </div>

        {/* Content */}
        <div className="flex flex-col gap-1.5">
          <h3 className="text-sm font-semibold" style={{ color: '#1C1C1E' }}>
            {step.title}
          </h3>
          <p className="text-xs leading-relaxed" style={{ color: '#636366' }}>
            {step.body}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-0.5">
          <button
            onClick={onComplete}
            className="text-xs font-medium transition-colors"
            style={{ color: '#8E8E93' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#1C1C1E')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#8E8E93')}
          >
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            <span className="text-[9px]" style={{ color: '#C7C7CC' }}>↵ or →</span>
            <button
              onClick={handleNext}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{
                backgroundColor: '#4A6741',
                color: '#FFFFFF',
                boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
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
    </>
  );
}
