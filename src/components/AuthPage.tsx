import React, { useState, useEffect } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

type AuthMode = 'signup' | 'login' | 'forgot' | 'reset';

interface AuthPageProps {
  supabase: SupabaseClient | null;
  mode?: 'signup' | 'login';
  onVisitMode: () => void;
  isPasswordRecovery?: boolean;
  onPasswordResetComplete?: () => void;
}

export function AuthPage({ supabase, mode: initialMode = 'signup', onVisitMode, isPasswordRecovery, onPasswordResetComplete }: AuthPageProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  // If parent signals password recovery, switch to reset mode
  useEffect(() => {
    if (isPasswordRecovery) {
      setMode('reset');
      setMessage(null);
    }
  }, [isPasswordRecovery]);

  const resetForm = () => {
    setMessage(null);
    setPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setAwaitingConfirmation(false);
  };

  const switchMode = (next: AuthMode) => {
    setMode(next);
    resetForm();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;

    setLoading(true);
    setMessage(null);

    try {
      if (mode === 'forgot') {
        if (!email.trim()) return;
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: window.location.origin,
        });
        if (error) {
          setMessage({ text: error.message, isError: true });
        } else {
          setAwaitingConfirmation(true);
          setMessage({
            text: 'If an account exists for that email, we sent a password reset link. Check your inbox.',
            isError: false,
          });
        }
      } else if (mode === 'reset') {
        if (!newPassword || !confirmPassword) return;
        if (newPassword !== confirmPassword) {
          setMessage({ text: 'Passwords do not match.', isError: true });
          setLoading(false);
          return;
        }
        if (newPassword.length < 6) {
          setMessage({ text: 'Password must be at least 6 characters.', isError: true });
          setLoading(false);
          return;
        }
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) {
          setMessage({ text: error.message, isError: true });
        } else {
          setMessage({ text: 'Password updated! Signing you in…', isError: false });
          onPasswordResetComplete?.();
        }
      } else if (mode === 'signup') {
        if (!email.trim() || !password) return;
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) {
          if (
            error.message.toLowerCase().includes('already registered') ||
            error.message.toLowerCase().includes('already exists') ||
            error.message.toLowerCase().includes('user already')
          ) {
            setMessage({ text: 'If this email isn\'t already registered, we\'ll send a confirmation link. Otherwise, try logging in.', isError: true });
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
        // login
        if (!email.trim() || !password) return;
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

  const inputStyle: React.CSSProperties = {
    width: '100%',
    height: 48,
    padding: '0 14px',
    fontSize: 15,
    borderRadius: 10,
    outline: 'none',
    backgroundColor: '#F5F4F0',
    color: '#1C1C1E',
    border: '1.5px solid transparent',
    transition: 'all 200ms',
    fontFamily: 'inherit',
    boxSizing: 'border-box' as const,
    opacity: (noBackend || loading) ? 0.5 : 1,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 14,
    fontWeight: 500,
    color: '#636366',
    display: 'block',
    marginBottom: 8,
  };

  const handleInputFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.border = '1.5px solid rgba(141,162,134,0.65)';
    e.currentTarget.style.backgroundColor = '#FFFFFF';
  };

  const handleInputBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.border = '1.5px solid transparent';
    e.currentTarget.style.backgroundColor = '#F5F4F0';
  };

  const subtitle = (() => {
    if (mode === 'forgot') return 'Enter your email to receive a reset link.';
    if (mode === 'reset') return 'Choose a new password.';
    if (mode === 'signup') return 'Create an account to save your calendar.';
    return 'Welcome back.';
  })();

  const isForgotOrReset = mode === 'forgot' || mode === 'reset';

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
        {/* Title — outside card */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: '#1C1C1E', margin: '0 0 8px' }}>
            Timeboxing Club
          </h1>
          <p style={{ fontSize: 15, color: '#8E8E93', margin: 0 }}>
            {subtitle}
          </p>
        </div>

        {/* Auth card */}
        <div
          style={{
            width: '100%',
            borderRadius: 16,
            backgroundColor: '#FFFFFF',
            border: '1px solid rgba(0,0,0,0.08)',
            boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
            padding: 32,
          }}
        >
          {noBackend && (
            <div
              style={{
                fontSize: 13,
                padding: '10px 14px',
                borderRadius: 10,
                backgroundColor: 'rgba(255,59,48,0.06)',
                color: '#B85050',
                border: '1px solid rgba(255,59,48,0.12)',
                marginBottom: 24,
                lineHeight: 1.5,
              }}
            >
              Backend not configured — set <code>VITE_SUPABASE_URL</code> and{' '}
              <code>VITE_SUPABASE_ANON_KEY</code>.
            </div>
          )}

          {/* Confirmation screen (signup email sent OR forgot password email sent) */}
          {awaitingConfirmation ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '16px 0', textAlign: 'center' }}>
              <div style={{ fontSize: 36 }}>{mode === 'forgot' ? '📧' : '📬'}</div>
              <p style={{ fontSize: 16, fontWeight: 600, color: '#1C1C1E', margin: 0 }}>
                {mode === 'forgot' ? 'Check your email' : 'Confirm your email'}
              </p>
              <p style={{ fontSize: 14, lineHeight: 1.6, color: '#636366', margin: 0 }}>
                {message?.text}
              </p>
              <button
                onClick={() => switchMode('login')}
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#8DA286',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  marginTop: 8,
                  transition: 'color 200ms',
                  fontFamily: 'inherit',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#7A9278')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#8DA286')}
              >
                Back to log in →
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {/* Name field — signup only */}
              {mode === 'signup' && (
                <div style={{ marginBottom: 24 }}>
                  <label htmlFor="auth-name" style={labelStyle}>Name</label>
                  <input
                    id="auth-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    disabled={noBackend || loading}
                    style={inputStyle}
                    onFocus={handleInputFocus}
                    onBlur={handleInputBlur}
                  />
                </div>
              )}

              {/* Email field — signup, login, forgot (not reset) */}
              {mode !== 'reset' && (
                <div style={{ marginBottom: 24 }}>
                  <label htmlFor="auth-email" style={labelStyle}>Email address</label>
                  <input
                    id="auth-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    disabled={noBackend || loading}
                    required
                    style={inputStyle}
                    onFocus={handleInputFocus}
                    onBlur={handleInputBlur}
                    autoFocus
                  />
                </div>
              )}

              {/* Password field — signup and login only */}
              {(mode === 'signup' || mode === 'login') && (
                <div style={{ marginBottom: mode === 'login' ? 8 : 24 }}>
                  <label htmlFor="auth-password" style={labelStyle}>
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
                    style={inputStyle}
                    onFocus={handleInputFocus}
                    onBlur={handleInputBlur}
                  />
                </div>
              )}

              {/* Forgot password link — login only */}
              {mode === 'login' && (
                <div style={{ marginBottom: 16, textAlign: 'right' }}>
                  <button
                    type="button"
                    onClick={() => switchMode('forgot')}
                    style={{
                      fontSize: 13,
                      color: '#8DA286',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      padding: 0,
                      transition: 'color 200ms',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#7A9076')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = '#8DA286')}
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              {/* New password fields — reset mode */}
              {mode === 'reset' && (
                <>
                  <div style={{ marginBottom: 24 }}>
                    <label htmlFor="auth-new-password" style={labelStyle}>New password (min 6 characters)</label>
                    <input
                      id="auth-new-password"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••"
                      disabled={noBackend || loading}
                      required
                      minLength={6}
                      style={inputStyle}
                      onFocus={handleInputFocus}
                      onBlur={handleInputBlur}
                      autoFocus
                    />
                  </div>
                  <div style={{ marginBottom: 24 }}>
                    <label htmlFor="auth-confirm-password" style={labelStyle}>Confirm password</label>
                    <input
                      id="auth-confirm-password"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      disabled={noBackend || loading}
                      required
                      minLength={6}
                      style={inputStyle}
                      onFocus={handleInputFocus}
                      onBlur={handleInputBlur}
                    />
                  </div>
                </>
              )}

              {/* Error/success message */}
              {message && !awaitingConfirmation && (
                <div
                  style={{
                    fontSize: 13,
                    padding: '10px 14px',
                    borderRadius: 10,
                    lineHeight: 1.6,
                    marginBottom: 16,
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
                      style={{
                        marginLeft: 4,
                        textDecoration: 'underline',
                        fontWeight: 600,
                        background: 'none',
                        border: 'none',
                        color: 'inherit',
                        cursor: 'pointer',
                        fontSize: 'inherit',
                        fontFamily: 'inherit',
                      }}
                    >
                      Log in
                    </button>
                  )}
                </div>
              )}

              {/* Primary action button */}
              <button
                type="submit"
                disabled={noBackend || loading}
                style={{
                  width: '100%',
                  height: 48,
                  borderRadius: 10,
                  fontSize: 15,
                  fontWeight: 600,
                  border: 'none',
                  cursor: (noBackend || loading) ? 'default' : 'pointer',
                  transition: 'all 200ms',
                  backgroundColor: '#8DA387',
                  color: '#FFFFFF',
                  opacity: (noBackend || loading) ? 0.4 : 1,
                  fontFamily: 'inherit',
                }}
                onMouseEnter={(e) => {
                  if (!loading && !noBackend) e.currentTarget.style.backgroundColor = '#7A9076';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#8DA387';
                }}
              >
                {loading
                  ? '...'
                  : mode === 'signup'
                    ? 'Sign up'
                    : mode === 'login'
                      ? 'Log in'
                      : mode === 'forgot'
                        ? 'Send reset link'
                        : 'Update password'}
              </button>
            </form>
          )}

          {/* Or divider + secondary action — hide in forgot/reset modes */}
          {!isForgotOrReset && !awaitingConfirmation && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '16px 0' }}>
                <div style={{ flex: 1, height: 1, backgroundColor: 'rgba(0,0,0,0.08)' }} />
                <span style={{ fontSize: 14, color: '#C7C7CC' }}>or</span>
                <div style={{ flex: 1, height: 1, backgroundColor: 'rgba(0,0,0,0.08)' }} />
              </div>

              <button
                type="button"
                onClick={() => switchMode(mode === 'signup' ? 'login' : 'signup')}
                style={{
                  width: '100%',
                  height: 48,
                  borderRadius: 10,
                  fontSize: 15,
                  fontWeight: 600,
                  border: '1px solid rgba(0,0,0,0.12)',
                  backgroundColor: 'transparent',
                  color: '#1C1C1E',
                  cursor: 'pointer',
                  transition: 'all 200ms',
                  fontFamily: 'inherit',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.02)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                {mode === 'signup' ? 'Log in' : 'Sign up'}
              </button>
            </>
          )}

          {/* Back to log in — forgot/reset modes only */}
          {isForgotOrReset && !awaitingConfirmation && (
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <button
                type="button"
                onClick={() => switchMode('login')}
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#8DA286',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'color 200ms',
                  fontFamily: 'inherit',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#7A9278')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#8DA286')}
              >
                ← Back to log in
              </button>
            </div>
          )}
        </div>

        {/* Try without signing in — outside card, hide in reset mode */}
        {mode !== 'reset' && (
          <div style={{ textAlign: 'center', marginTop: 24 }}>
            <button
              onClick={onVisitMode}
              style={{
                fontSize: 14,
                color: '#8E8E93',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                textDecoration: 'underline',
                transition: 'color 200ms',
                fontFamily: 'inherit',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#636366')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#8E8E93')}
            >
              Try Without Signing In
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
