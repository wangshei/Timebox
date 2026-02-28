import React, { useState } from 'react';
import { CalendarIcon } from '@heroicons/react/24/solid';

interface OnboardingWizardProps {
  onComplete: (opts: { name: string; choice: 'template' | 'blank'; showTour: boolean }) => void;
  initialName?: string;
}

type SetupChoice = 'template' | 'blank' | null;

// ── Checkmark icon ─────────────────────────────────────────────────────────

function CheckCircle() {
  return (
    <div
      className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
      style={{ backgroundColor: '#8DA286' }}
    >
      <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
        <path
          d="M1 4l2.5 2.5L9 1"
          stroke="#1C1C1E"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

// ── Wizard ─────────────────────────────────────────────────────────────────

export function OnboardingWizard({ onComplete, initialName = '' }: OnboardingWizardProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState(initialName);
  const [choice, setChoice] = useState<SetupChoice>(null);
  const [nameError, setNameError] = useState(false);

  const handleNameContinue = () => {
    if (!name.trim()) {
      setNameError(true);
      return;
    }
    setNameError(false);
    setStep(2);
  };

  const handleSetupContinue = () => {
    if (!choice) return;
    onComplete({ name: name.trim(), choice, showTour: true });
  };

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center px-4 py-12"
      style={{ backgroundColor: '#FDFDFB', fontFamily: 'system-ui, -apple-system, sans-serif' }}
    >
      <div className="w-full max-w-lg flex flex-col gap-8">

        {/* ── Brand mark ── */}
        <div className="flex flex-col items-center gap-2">
          <div
            className="w-10 h-10 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: 'rgba(141,162,134,0.12)', border: '1px solid rgba(141,162,134,0.22)' }}
          >
            <CalendarIcon className="w-5 h-5" style={{ color: '#8DA286' }} />
          </div>
          <span className="text-sm font-semibold tracking-tight" style={{ color: '#1C1C1E' }}>Timebox</span>
        </div>

        {/* ── Progress dots ── */}
        <div className="flex items-center justify-center gap-2">
          {[1, 2].map((s) => (
            <div
              key={s}
              className="rounded-full transition-all duration-300"
              style={{
                width: s === step ? 20 : 6,
                height: 6,
                backgroundColor: s <= step ? '#8DA286' : '#DBE4D7',
              }}
            />
          ))}
        </div>

        {/* ── Step 1: Name ── */}
        {step === 1 && (
          <div
            className="flex flex-col items-center gap-8 rounded-2xl px-8 py-10"
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid rgba(0,0,0,0.07)',
              boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
            }}
          >
            <div className="flex flex-col items-center gap-2 text-center">
              <h1 className="text-2xl font-bold tracking-tight" style={{ color: '#1C1C1E' }}>
                What should we call you?
              </h1>
              <p className="text-sm" style={{ color: '#8E8E93' }}>
                Just your first name is fine.
              </p>
            </div>

            <div className="w-full max-w-xs flex flex-col gap-2">
              <input
                type="text"
                value={name}
                onChange={(e) => { setName(e.target.value); setNameError(false); }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleNameContinue(); }}
                placeholder="Sheila"
                autoFocus
                className="w-full px-4 py-3 rounded-xl text-base text-center outline-none transition-all"
                style={{
                  backgroundColor: '#F5F4F0',
                  color: '#1C1C1E',
                  border: nameError
                    ? '1.5px solid rgba(255,59,48,0.5)'
                    : '1.5px solid transparent',
                  fontSize: 16,
                }}
                onFocus={(e) => {
                  if (!nameError) e.currentTarget.style.border = '1.5px solid rgba(141,162,134,0.7)';
                  e.currentTarget.style.backgroundColor = '#FFFFFF';
                }}
                onBlur={(e) => {
                  if (!nameError) e.currentTarget.style.border = '1.5px solid transparent';
                  e.currentTarget.style.backgroundColor = '#F5F4F0';
                }}
              />
              {nameError && (
                <p className="text-xs text-center" style={{ color: '#FF3B30' }}>
                  Please enter your name to continue.
                </p>
              )}
            </div>

            <button
              onClick={handleNameContinue}
              className="px-8 py-2.5 rounded-xl text-sm font-semibold transition-all"
              style={{
                backgroundColor: '#8DA286',
                color: '#1C1C1E',
                boxShadow: '0 1px 3px rgba(0,0,0,0.10), 0 4px 12px rgba(141,162,134,0.25)',
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
              Continue →
            </button>
          </div>
        )}

        {/* ── Step 2: Setup choice ── */}
        {step === 2 && (
          <div
            className="flex flex-col gap-6 rounded-2xl px-8 py-8"
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid rgba(0,0,0,0.07)',
              boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
            }}
          >
            <div className="flex flex-col gap-1.5 text-center">
              <h1 className="text-2xl font-bold tracking-tight" style={{ color: '#1C1C1E' }}>
                {name ? `Hey ${name}! How would you like to start?` : 'How would you like to start?'}
              </h1>
              <p className="text-sm" style={{ color: '#8E8E93' }}>
                You can always change everything later.
              </p>
            </div>

            {/* Option cards */}
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Template */}
              <button
                type="button"
                onClick={() => setChoice('template')}
                className="flex-1 flex flex-col gap-3 p-5 rounded-2xl text-left transition-all"
                style={{
                  border: choice === 'template'
                    ? '2px solid #8DA286'
                    : '2px solid rgba(0,0,0,0.08)',
                  backgroundColor: choice === 'template' ? 'rgba(141,162,134,0.05)' : '#FDFDFB',
                  boxShadow: choice === 'template'
                    ? '0 0 0 3px rgba(141,162,134,0.14)'
                    : 'none',
                  cursor: 'pointer',
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-semibold" style={{ color: '#1C1C1E' }}>
                      Start with template
                    </span>
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-full font-bold w-fit uppercase tracking-wide"
                      style={{ backgroundColor: '#8DA286', color: '#1C1C1E', letterSpacing: '0.06em' }}
                    >
                      Recommended
                    </span>
                  </div>
                  {choice === 'template' && <CheckCircle />}
                </div>
                <p className="text-xs leading-relaxed" style={{ color: '#636366' }}>
                  4 calendars and 12 categories pre-built across life, growth, school, and relationships.
                </p>
                {/* Color swatches */}
                <div className="flex gap-1.5 mt-auto pt-1">
                  {['#5B718C', '#8DA387', '#B3B46D', '#DE8D91'].map((c) => (
                    <div key={c} className="w-4 h-4 rounded-full" style={{ backgroundColor: c }} />
                  ))}
                </div>
              </button>

              {/* Blank */}
              <button
                type="button"
                onClick={() => setChoice('blank')}
                className="flex-1 flex flex-col gap-3 p-5 rounded-2xl text-left transition-all"
                style={{
                  border: choice === 'blank'
                    ? '2px solid #8DA286'
                    : '2px solid rgba(0,0,0,0.08)',
                  backgroundColor: choice === 'blank' ? 'rgba(141,162,134,0.05)' : '#FDFDFB',
                  boxShadow: choice === 'blank'
                    ? '0 0 0 3px rgba(141,162,134,0.14)'
                    : 'none',
                  cursor: 'pointer',
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-semibold" style={{ color: '#1C1C1E' }}>
                    Start blank
                  </span>
                  {choice === 'blank' && <CheckCircle />}
                </div>
                <p className="text-xs leading-relaxed" style={{ color: '#636366' }}>
                  Just a Personal calendar. Build your own structure exactly how you want it.
                </p>
                <div className="flex gap-1.5 mt-auto pt-1">
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: '#A4C7A6' }} />
                </div>
              </button>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-1">
              <button
                onClick={() => setStep(1)}
                className="text-xs font-medium transition-colors"
                style={{ color: '#8E8E93' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#1C1C1E')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#8E8E93')}
              >
                ← Back
              </button>
              <button
                onClick={handleSetupContinue}
                disabled={!choice}
                className="px-8 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none"
                style={{
                  backgroundColor: '#8DA286',
                  color: '#1C1C1E',
                  boxShadow: choice ? '0 1px 3px rgba(0,0,0,0.10), 0 4px 12px rgba(141,162,134,0.25)' : 'none',
                }}
                onMouseEnter={(e) => {
                  if (choice) {
                    e.currentTarget.style.backgroundColor = '#7A9278';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#8DA286';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                Let's go →
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
