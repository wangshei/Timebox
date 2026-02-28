import React, { useState } from 'react';

interface OnboardingWizardProps {
  onComplete: (opts: { name: string; choice: 'template' | 'blank'; showTour: boolean }) => void;
  initialName?: string;
}

type SetupChoice = 'template' | 'blank' | null;

// ── Inline SVG icons (no external deps) ────────────────────────────────────

function FileTextIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6593A6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function SparklesIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="4" x2="12" y2="20" />
      <line x1="4" y1="12" x2="20" y2="12" />
    </svg>
  );
}

function CheckCircle({ color }: { color: string }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 16,
        left: 16,
        width: 24,
        height: 24,
        borderRadius: '50%',
        backgroundColor: color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 13l4 4L19 7" />
      </svg>
    </div>
  );
}

function BackArrow() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M5 12l7-7M5 12l7 7" />
    </svg>
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

  // ── Shared styles ──────────────────────────────────────────────────────

  const backBtnStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 14,
    fontWeight: 500,
    color: '#636366',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    marginBottom: 32,
    transition: 'color 200ms',
    fontFamily: 'inherit',
  };

  const primaryBtnBase: React.CSSProperties = {
    padding: '0 32px',
    height: 48,
    borderRadius: 12,
    fontSize: 15,
    fontWeight: 600,
    border: 'none',
    cursor: 'pointer',
    transition: 'all 200ms',
    backgroundColor: '#8DA387',
    color: '#FFFFFF',
    fontFamily: 'inherit',
  };

  // ── Step 1: Name ────────────────────────────────────────────────────────

  if (step === 1) {
    return (
      <div
        style={{
          minHeight: '100vh',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '48px 24px',
          backgroundColor: '#F8F7F4',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <div style={{ width: 576, maxWidth: '100%' }}>
          {/* Title */}
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: '#1C1C1E', margin: '0 0 8px' }}>
              Timebox
            </h1>
            <p style={{ fontSize: 15, color: '#8E8E93', margin: 0 }}>
              What should we call you?
            </p>
          </div>

          {/* Card */}
          <div
            style={{
              width: '100%',
              borderRadius: 16,
              backgroundColor: '#FFFFFF',
              border: '1px solid rgba(0,0,0,0.08)',
              boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
              padding: 32,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 24,
            }}
          >
            <div style={{ width: '100%', maxWidth: 320 }}>
              <label
                htmlFor="wizard-name"
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: '#636366',
                  display: 'block',
                  marginBottom: 8,
                }}
              >
                Your name
              </label>
              <input
                id="wizard-name"
                type="text"
                value={name}
                onChange={(e) => { setName(e.target.value); setNameError(false); }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleNameContinue(); }}
                placeholder="e.g. Sheila"
                autoFocus
                style={{
                  width: '100%',
                  height: 48,
                  padding: '0 14px',
                  fontSize: 15,
                  borderRadius: 10,
                  outline: 'none',
                  backgroundColor: '#F5F4F0',
                  color: '#1C1C1E',
                  border: nameError
                    ? '1.5px solid rgba(255,59,48,0.5)'
                    : '1.5px solid transparent',
                  transition: 'all 200ms',
                  fontFamily: 'inherit',
                  boxSizing: 'border-box' as const,
                }}
                onFocus={(e) => {
                  if (!nameError) e.currentTarget.style.border = '1.5px solid rgba(141,162,134,0.65)';
                  e.currentTarget.style.backgroundColor = '#FFFFFF';
                }}
                onBlur={(e) => {
                  if (!nameError) e.currentTarget.style.border = '1.5px solid transparent';
                  e.currentTarget.style.backgroundColor = '#F5F4F0';
                }}
              />
              {nameError && (
                <p style={{ fontSize: 13, color: '#FF3B30', margin: '8px 0 0', textAlign: 'center' }}>
                  Please enter your name to continue.
                </p>
              )}
            </div>

            <button
              onClick={handleNameContinue}
              style={primaryBtnBase}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#7A9076';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#8DA387';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 2: Setup choice ──────────────────────────────────────────────

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px',
        backgroundColor: '#F8F7F4',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <div style={{ width: 768, maxWidth: '100%' }}>
        {/* Back button */}
        <button
          onClick={() => setStep(1)}
          style={backBtnStyle}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#1C1C1E')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#636366')}
        >
          <BackArrow />
          <span>Back</span>
        </button>

        {/* Title */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <h1 style={{ fontSize: 32, fontWeight: 700, color: '#1C1C1E', margin: '0 0 12px' }}>
            {name ? `Hey ${name}, how would you like to start?` : 'How would you like to start?'}
          </h1>
          <p style={{ fontSize: 16, color: '#8E8E93', margin: 0 }}>
            You can always change everything later.
          </p>
        </div>

        {/* Option cards — side by side */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 16,
            marginBottom: 32,
          }}
        >
          {/* ── Template card ── */}
          <button
            type="button"
            onClick={() => setChoice('template')}
            style={{
              position: 'relative',
              padding: 32,
              borderRadius: 16,
              border: choice === 'template'
                ? '2px solid #8DA387'
                : '2px solid rgba(0,0,0,0.08)',
              backgroundColor: choice === 'template'
                ? 'rgba(141,163,135,0.05)'
                : '#FFFFFF',
              textAlign: 'left',
              cursor: 'pointer',
              transition: 'all 200ms',
              fontFamily: 'inherit',
              outline: 'none',
            }}
            onMouseEnter={(e) => {
              if (choice !== 'template') {
                e.currentTarget.style.borderColor = 'rgba(0,0,0,0.16)';
                e.currentTarget.style.transform = 'scale(1.02)';
              }
            }}
            onMouseLeave={(e) => {
              if (choice !== 'template') {
                e.currentTarget.style.borderColor = 'rgba(0,0,0,0.08)';
              }
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            {/* Selected indicator */}
            {choice === 'template' && <CheckCircle color="#8DA387" />}

            {/* Recommended badge */}
            <div style={{ position: 'absolute', top: 16, right: 16 }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '4px 12px',
                  backgroundColor: '#F9E9B8',
                  color: '#5C5120',
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 500,
                }}
              >
                <SparklesIcon />
                Recommended
              </span>
            </div>

            {/* FileText icon */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 48,
                height: 48,
                backgroundColor: '#D6E6FB',
                borderRadius: 12,
                marginBottom: 16,
              }}
            >
              <FileTextIcon />
            </div>

            {/* Content */}
            <h3 style={{ fontSize: 20, fontWeight: 600, color: '#1C1C1E', margin: '0 0 8px' }}>
              Start with template
            </h3>
            <p style={{ fontSize: 14, color: '#8E8E93', margin: 0, lineHeight: 1.6 }}>
              Get started quickly with a pre-built structure designed for productivity.
            </p>
          </button>

          {/* ── Blank card ── */}
          <button
            type="button"
            onClick={() => setChoice('blank')}
            style={{
              position: 'relative',
              padding: 32,
              borderRadius: 16,
              border: choice === 'blank'
                ? '2px solid #6593A6'
                : '2px solid rgba(0,0,0,0.08)',
              backgroundColor: choice === 'blank'
                ? 'rgba(214,230,251,0.30)'
                : '#FFFFFF',
              textAlign: 'left',
              cursor: 'pointer',
              transition: 'all 200ms',
              fontFamily: 'inherit',
              outline: 'none',
            }}
            onMouseEnter={(e) => {
              if (choice !== 'blank') {
                e.currentTarget.style.borderColor = 'rgba(0,0,0,0.16)';
                e.currentTarget.style.transform = 'scale(1.02)';
              }
            }}
            onMouseLeave={(e) => {
              if (choice !== 'blank') {
                e.currentTarget.style.borderColor = 'rgba(0,0,0,0.08)';
              }
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            {/* Selected indicator */}
            {choice === 'blank' && <CheckCircle color="#6593A6" />}

            {/* Dashed plus icon */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 48,
                height: 48,
                backgroundColor: '#F8F7F4',
                border: '2px dashed #D1D5DB',
                borderRadius: 12,
                marginBottom: 16,
              }}
            >
              <PlusIcon />
            </div>

            {/* Content */}
            <h3 style={{ fontSize: 20, fontWeight: 600, color: '#1C1C1E', margin: '0 0 8px' }}>
              Start blank
            </h3>
            <p style={{ fontSize: 14, color: '#8E8E93', margin: 0, lineHeight: 1.6 }}>
              Build your own structure exactly how you want it.
            </p>
          </button>
        </div>

        {/* Continue button — right-aligned */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={handleSetupContinue}
            disabled={!choice}
            style={{
              ...primaryBtnBase,
              opacity: choice ? 1 : 0.4,
              cursor: choice ? 'pointer' : 'default',
            }}
            onMouseEnter={(e) => {
              if (choice) {
                e.currentTarget.style.backgroundColor = '#7A9076';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#8DA387';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            Let's go
          </button>
        </div>
      </div>
    </div>
  );
}
