import React, { useState } from 'react';
import { CalendarIcon } from '@heroicons/react/24/solid';
import type { SupabaseClient } from '@supabase/supabase-js';

type AuthMode = 'signup' | 'login';

interface AuthPageProps {
  supabase: SupabaseClient | null;
  mode?: AuthMode;
  onVisitMode: () => void;
  onBack: () => void;
}

export function AuthPage({ supabase, mode: initialMode = 'signup', onVisitMode, onBack }: AuthPageProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  const resetForm = () => {
    setMessage(null);
    setPassword('');
    setAwaitingConfirmation(false);
  };

  const switchMode = (next: AuthMode) => {
    setMode(next);
    resetForm();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    if (!email.trim() || !password) return;

    setLoading(true);
    setMessage(null);

    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) {
          if (
            error.message.toLowerCase().includes('already registered') ||
            error.message.toLowerCase().includes('already exists') ||
            error.message.toLowerCase().includes('user already')
          ) {
            setMessage({ text: 'An account with this email already exists. Log in instead?', isError: true });
          } else {
            setMessage({ text: error.message, isError: true });
          }
        } else if (data.session) {
          setMessage({ text: 'Account created! Setting up your workspace…', isError: false });
        } else {
          setAwaitingConfirmation(true);
          setMessage({
            text: 'Check your inbox — we sent a confirmation link. Once confirmed, come back and log in.',
            isError: false,
          });
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) {
          if (error.message.toLowerCase().includes('email not confirmed')) {
            setMessage({
              text: 'Please confirm your email first — check your inbox for the confirmation link.',
              isError: true,
            });
          } else if (
            error.message.toLowerCase().includes('invalid login') ||
            error.message.toLowerCase().includes('invalid credentials')
          ) {
            setMessage({ text: 'Incorrect email or password. Please try again.', isError: true });
          } else {
            setMessage({ text: error.message, isError: true });
          }
        }
      }
    } catch {
      setMessage({ text: 'Something went wrong. Please try again.', isError: true });
    } finally {
      setLoading(false);
    }
  };

  const noBackend = !supabase;

  return (
    <div
      className="min-h-screen w-full flex flex-col items-center justify-center px-4 py-12"
      style={{ backgroundColor: '#FDFDFB', fontFamily: 'system-ui, -apple-system, sans-serif' }}
    >
      {/* Back link */}
      <button
        onClick={onBack}
        className="absolute top-5 left-5 text-xs flex items-center gap-1.5 font-medium transition-colors"
        style={{ color: '#8E8E93' }}
        onMouseEnter={(e) => (e.currentTarget.style.color = '#1C1C1E')}
        onMouseLeave={(e) => (e.currentTarget.style.color = '#8E8E93')}
      >
        <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
          <path d="M11 5H1M1 5L5 1M1 5L5 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Back
      </button>

      <div
        className="w-full max-w-sm rounded-2xl flex flex-col overflow-hidden"
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid rgba(0,0,0,0.07)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
        }}
      >
        {/* Brand header */}
        <div
          className="px-6 pt-6 pb-5"
          style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}
        >
          <div className="flex items-center gap-2 mb-1.5">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: 'rgba(141,162,134,0.12)' }}
            >
              <CalendarIcon className="w-4 h-4" style={{ color: '#8DA286' }} />
            </div>
            <span className="text-sm font-semibold" style={{ color: '#1C1C1E' }}>Timebox</span>
          </div>
          <p className="text-xs" style={{ color: '#8E8E93' }}>
            {mode === 'signup' ? 'Create an account to save your calendar.' : 'Welcome back.'}
          </p>
        </div>

        <div className="px-6 py-5 flex flex-col gap-4">
          {/* Tab toggle */}
          <div
            className="flex rounded-xl p-0.5"
            style={{ backgroundColor: '#F0EFE9' }}
          >
            {(['signup', 'login'] as AuthMode[]).map((m) => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                className="flex-1 py-1.5 rounded-[10px] text-xs font-semibold transition-all"
                style={{
                  backgroundColor: mode === m ? '#FFFFFF' : 'transparent',
                  color: mode === m ? '#1C1C1E' : '#8E8E93',
                  boxShadow: mode === m ? '0 1px 3px rgba(0,0,0,0.09)' : 'none',
                }}
              >
                {m === 'signup' ? 'Sign up' : 'Log in'}
              </button>
            ))}
          </div>

          {noBackend && (
            <div
              className="text-xs px-3 py-2 rounded-lg"
              style={{
                backgroundColor: 'rgba(255,59,48,0.06)',
                color: '#B85050',
                border: '1px solid rgba(255,59,48,0.12)',
              }}
            >
              Backend not configured — set <code>VITE_SUPABASE_URL</code> and{' '}
              <code>VITE_SUPABASE_ANON_KEY</code>.
            </div>
          )}

          {/* Confirmation screen */}
          {awaitingConfirmation ? (
            <div className="flex flex-col gap-3 py-3 text-center">
              <div className="text-3xl">📬</div>
              <p className="text-sm font-semibold" style={{ color: '#1C1C1E' }}>
                Confirm your email
              </p>
              <p className="text-xs leading-relaxed" style={{ color: '#636366' }}>
                {message?.text}
              </p>
              <button
                onClick={() => switchMode('login')}
                className="text-xs font-semibold mt-1 transition-colors"
                style={{ color: '#8DA286' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#7A9278')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#8DA286')}
              >
                Back to log in →
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="auth-email" className="text-xs font-medium" style={{ color: '#636366' }}>
                  Email address
                </label>
                <input
                  id="auth-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  disabled={noBackend || loading}
                  required
                  className="px-3 py-2.5 text-sm rounded-xl outline-none transition-all disabled:opacity-50"
                  style={{
                    backgroundColor: '#F5F4F0',
                    color: '#1C1C1E',
                    border: '1.5px solid transparent',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.border = '1.5px solid rgba(141,162,134,0.65)';
                    e.currentTarget.style.backgroundColor = '#FFFFFF';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.border = '1.5px solid transparent';
                    e.currentTarget.style.backgroundColor = '#F5F4F0';
                  }}
                  autoFocus
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="auth-password" className="text-xs font-medium" style={{ color: '#636366' }}>
                  Password{mode === 'signup' ? ' (min 6 characters)' : ''}
                </label>
                <input
                  id="auth-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={noBackend || loading}
                  required
                  minLength={mode === 'signup' ? 6 : undefined}
                  className="px-3 py-2.5 text-sm rounded-xl outline-none transition-all disabled:opacity-50"
                  style={{
                    backgroundColor: '#F5F4F0',
                    color: '#1C1C1E',
                    border: '1.5px solid transparent',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.border = '1.5px solid rgba(141,162,134,0.65)';
                    e.currentTarget.style.backgroundColor = '#FFFFFF';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.border = '1.5px solid transparent';
                    e.currentTarget.style.backgroundColor = '#F5F4F0';
                  }}
                />
              </div>

              {message && !awaitingConfirmation && (
                <div
                  className="text-xs px-3 py-2.5 rounded-xl leading-relaxed"
                  style={{
                    backgroundColor: message.isError ? 'rgba(255,59,48,0.06)' : 'rgba(141,162,134,0.10)',
                    color: message.isError ? '#B85050' : '#4A7A44',
                    border: `1px solid ${message.isError ? 'rgba(255,59,48,0.12)' : 'rgba(141,162,134,0.22)'}`,
                  }}
                >
                  {message.text}
                  {message.isError && message.text.toLowerCase().includes('already exists') && (
                    <button
                      type="button"
                      onClick={() => switchMode('login')}
                      className="ml-1 underline font-semibold"
                    >
                      Log in
                    </button>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={noBackend || loading}
                className="py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
                style={{
                  backgroundColor: '#8DA286',
                  color: '#1C1C1E',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.10), 0 4px 12px rgba(141,162,134,0.22)',
                }}
                onMouseEnter={(e) => {
                  if (!loading && !noBackend) {
                    e.currentTarget.style.backgroundColor = '#7A9278';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#8DA286';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                {loading ? '…' : mode === 'signup' ? 'Create account' : 'Log in'}
              </button>
            </form>
          )}

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1" style={{ borderTop: '1px solid rgba(0,0,0,0.07)' }} />
            <span className="text-[10px] uppercase tracking-widest font-medium" style={{ color: '#C7C7CC' }}>or</span>
            <div className="flex-1" style={{ borderTop: '1px solid rgba(0,0,0,0.07)' }} />
          </div>

          <button
            type="button"
            onClick={onVisitMode}
            className="py-2.5 rounded-xl text-sm font-medium transition-all"
            style={{ border: '1px solid rgba(0,0,0,0.09)', color: '#636366' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.03)';
              e.currentTarget.style.color = '#1C1C1E';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = '#636366';
            }}
          >
            Try without signing in
          </button>
        </div>

        <p className="text-center text-xs pb-5 px-6" style={{ color: '#C7C7CC' }}>
          No account needed to explore. Data won't be saved in visit mode.
        </p>
      </div>
    </div>
  );
}
