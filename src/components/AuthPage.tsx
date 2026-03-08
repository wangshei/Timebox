import React, { useState, useEffect } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

type AuthMode = 'signup' | 'login' | 'forgot' | 'reset' | 'waitlist';

interface AuthPageProps {
  supabase: SupabaseClient | null;
  mode?: 'signup' | 'login' | 'waitlist';
  onVisitMode: () => void;
  isPasswordRecovery?: boolean;
  onPasswordResetComplete?: () => void;
}

export function AuthPage({ supabase, mode: initialMode = 'signup', onVisitMode, isPasswordRecovery, onPasswordResetComplete }: AuthPageProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [showWaitlistPrompt, setShowWaitlistPrompt] = useState(false);
  const [waitlistJoined, setWaitlistJoined] = useState(false);
  const [referralSource, setReferralSource] = useState('');
  const [waitlistOpen, setWaitlistOpen] = useState(true); // default: no invite code required

  // Check if waitlist gate is active (invite code required)
  useEffect(() => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
    if (!supabaseUrl || !supabaseAnonKey) return;
    fetch(`${supabaseUrl}/functions/v1/admin-api`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnonKey}` },
      body: JSON.stringify({ action: 'get-config', key: 'waitlist_open' }),
    })
      .then(r => r.json())
      .then(data => { setWaitlistOpen(data.value !== 'false'); })
      .catch(() => {}); // non-critical — stays open by default
  }, []);

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
    setShowWaitlistPrompt(false);
    setWaitlistJoined(false);
  };

  const switchMode = (next: AuthMode) => {
    setMode(next);
    resetForm();
  };

  const validateInviteCode = async (code: string): Promise<boolean> => {
    if (!supabase || !code.trim()) return false;
    const { data, error } = await supabase
      .from('invite_codes')
      .select('id, used_by, expires_at')
      .eq('code', code.trim().toUpperCase())
      .maybeSingle();
    if (error || !data) return false;
    if (data.used_by) return false;
    if (data.expires_at && new Date(data.expires_at) < new Date()) return false;
    return true;
  };

  const markInviteCodeUsed = async (code: string, userId: string) => {
    if (!supabase) return;
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
    try {
      await fetch(`${supabaseUrl}/functions/v1/validate-and-use-invite-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({ code: code.trim().toUpperCase(), userId }),
      });
    } catch {
      // Non-critical — code validation already passed
    }
  };

  const joinWaitlist = async () => {
    if (!supabase || !email.trim()) return;
    setLoading(true);
    setMessage(null);
    try {
      const { error } = await supabase
        .from('waitlist')
        .insert({ email: email.trim().toLowerCase(), referral_source: referralSource || null });

      if (error) {
        if (error.code === '23505' || error.message?.includes('duplicate')) {
          setWaitlistJoined(true);
          setShowWaitlistPrompt(false);
          setMessage({ text: "You're already on the waitlist! We'll send you an invite code when a spot opens up.", isError: false });
        } else {
          setMessage({ text: 'Something went wrong. Please try again.', isError: true });
        }
        return;
      }

      // Send waitlist confirmation email via Edge Function
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
      try {
        await fetch(`${supabaseUrl}/functions/v1/send-waitlist-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseAnonKey}`,
          },
          body: JSON.stringify({ email: email.trim().toLowerCase() }),
        });
      } catch {
        // Non-critical — waitlist entry was saved
      }

      setWaitlistJoined(true);
      setShowWaitlistPrompt(false);
      setMessage(null);
    } catch {
      setMessage({ text: 'Something went wrong. Please try again.', isError: true });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;

    setLoading(true);
    setMessage(null);
    setShowWaitlistPrompt(false);

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

        // Validate invite code (skip when waitlist is open — anyone can sign up)
        if (!waitlistOpen) {
          const codeValid = await validateInviteCode(inviteCode);
          if (!codeValid) {
            setMessage({ text: inviteCode.trim() ? 'Invalid or expired invite code.' : 'An invite code is required to sign up.', isError: true });
            setShowWaitlistPrompt(true);
            setLoading(false);
            return;
          }
        }

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
          // Account created with immediate session — mark invite code as used
          if (data.user && inviteCode.trim()) {
            await markInviteCodeUsed(inviteCode, data.user.id);
          }
          setMessage({ text: 'Account created! Setting up your workspace…', isError: false });
        } else {
          // Email confirmation required — mark code as used with the user ID
          if (data.user && inviteCode.trim()) {
            await markInviteCodeUsed(inviteCode, data.user.id);
          }
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
    if (mode === 'waitlist') return 'Join the waitlist to get early access.';
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
            The Timeboxing Club
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

          {/* Waitlist joined confirmation */}
          {waitlistJoined ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '16px 0', textAlign: 'center' }}>
              <div style={{ fontSize: 36 }}>🎉</div>
              <p style={{ fontSize: 16, fontWeight: 600, color: '#1C1C1E', margin: 0 }}>
                You're on the list!
              </p>
              <p style={{ fontSize: 14, lineHeight: 1.6, color: '#636366', margin: 0 }}>
                Thanks for your interest in The Timeboxing Club. We'll send you an invite code when a spot opens up.
              </p>
              <button
                onClick={onVisitMode}
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
                Try it out →
              </button>
            </div>
          ) : awaitingConfirmation ? (
            /* Confirmation screen (signup email sent OR forgot password email sent) */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '16px 0', textAlign: 'center' }}>
              <div style={{ fontSize: 36 }}>{mode === 'forgot' ? '📧' : '📬'}</div>
              <p style={{ fontSize: 16, fontWeight: 600, color: '#1C1C1E', margin: 0 }}>
                {mode === 'forgot' ? 'Check your email' : 'Confirm your email'}
              </p>
              <p style={{ fontSize: 14, lineHeight: 1.6, color: '#636366', margin: 0 }}>
                {message?.text}
              </p>
              <p style={{ fontSize: 13, lineHeight: 1.5, color: '#AEAEB2', margin: '8px 0 0' }}>
                Don't see it? Check your spam or junk folder.
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
          ) : mode === 'waitlist' ? (
              <form onSubmit={(e) => { e.preventDefault(); joinWaitlist(); }} style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
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

                <div style={{ marginBottom: 24 }}>
                  <label htmlFor="auth-referral" style={labelStyle}>How did you hear about us?</label>
                  <select
                    id="auth-referral"
                    value={referralSource}
                    onChange={(e) => setReferralSource(e.target.value)}
                    disabled={noBackend || loading}
                    style={{
                      ...inputStyle,
                      appearance: 'none',
                      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%238E8E93' d='M2.5 4.5L6 8l3.5-3.5'/%3E%3C/svg%3E")`,
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'right 14px center',
                      paddingRight: 36,
                      cursor: 'pointer',
                      color: referralSource ? '#1C1C1E' : '#AEAEB2',
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.border = '1.5px solid rgba(141,162,134,0.65)';
                      e.currentTarget.style.backgroundColor = '#FFFFFF';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.border = '1.5px solid transparent';
                      e.currentTarget.style.backgroundColor = '#F5F4F0';
                    }}
                  >
                    <option value="" disabled>Select one</option>
                    <option value="twitter">Twitter / X</option>
                    <option value="reddit">Reddit</option>
                    <option value="producthunt">Product Hunt</option>
                    <option value="friend">Friend or colleague</option>
                    <option value="search">Google / search</option>
                    <option value="youtube">LinkedIn</option>
                    <option value="youtube">Substack</option>
                    <option value="tiktok">TikTok</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                {/* Error/success message */}
                {message && (
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
                  </div>
                )}

                <button
                  type="submit"
                  disabled={noBackend || loading || !email.trim()}
                  style={{
                    width: '100%',
                    height: 48,
                    borderRadius: 10,
                    fontSize: 15,
                    fontWeight: 600,
                    border: 'none',
                    cursor: (noBackend || loading || !email.trim()) ? 'default' : 'pointer',
                    transition: 'all 200ms',
                    backgroundColor: '#8DA387',
                    color: '#FFFFFF',
                    opacity: (noBackend || loading || !email.trim()) ? 0.4 : 1,
                    fontFamily: 'inherit',
                  }}
                  onMouseEnter={(e) => {
                    if (!loading && !noBackend && email.trim()) e.currentTarget.style.backgroundColor = '#7A9076';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#8DA387';
                  }}
                >
                  {loading ? '...' : 'Join Waitlist'}
                </button>

                <div style={{ textAlign: 'center', marginTop: 14 }}>
                  <button
                    type="button"
                    onClick={() => switchMode('signup')}
                    style={{
                      fontSize: 13,
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
                    Have an invite code? Sign up
                  </button>
                </div>
              </form>
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

              {/* Invite code field — signup only, hidden when waitlist is open */}
              {mode === 'signup' && !waitlistOpen && (
                <div style={{ marginBottom: 24 }}>
                  <label htmlFor="auth-invite-code" style={labelStyle}>Invite code</label>
                  <input
                    id="auth-invite-code"
                    type="text"
                    value={inviteCode}
                    onChange={(e) => {
                      setInviteCode(e.target.value.toUpperCase());
                      if (showWaitlistPrompt) setShowWaitlistPrompt(false);
                      if (message?.isError) setMessage(null);
                    }}
                    placeholder="e.g. TIMEBOX01"
                    disabled={noBackend || loading}
                    style={{
                      ...inputStyle,
                      letterSpacing: '0.05em',
                      fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
                    }}
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

              {/* Waitlist prompt — shown inline after invalid/missing invite code */}
              {showWaitlistPrompt && mode === 'signup' && email.trim() && (
                <div
                  style={{
                    fontSize: 13,
                    padding: '14px',
                    borderRadius: 10,
                    lineHeight: 1.6,
                    marginBottom: 16,
                    backgroundColor: 'rgba(141,162,134,0.08)',
                    border: '1px solid rgba(141,162,134,0.18)',
                  }}
                >
                  <p style={{ margin: '0 0 10px', color: '#3A3A3C' }}>
                    Would you like to join the waitlist with <strong>{email.trim()}</strong>?
                  </p>
                  <button
                    type="button"
                    onClick={joinWaitlist}
                    disabled={loading}
                    style={{
                      padding: '8px 18px',
                      fontSize: 13,
                      fontWeight: 600,
                      borderRadius: 8,
                      border: 'none',
                      backgroundColor: '#8DA387',
                      color: '#FFFFFF',
                      cursor: loading ? 'default' : 'pointer',
                      opacity: loading ? 0.5 : 1,
                      transition: 'all 200ms',
                      fontFamily: 'inherit',
                    }}
                    onMouseEnter={(e) => { if (!loading) e.currentTarget.style.backgroundColor = '#7A9076'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#8DA387'; }}
                  >
                    {loading ? '...' : 'Join Waitlist'}
                  </button>
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

              {mode === 'signup' && !waitlistOpen && (
                <>
                  {/* "Don't have a code?" secondary link */}
                  {!showWaitlistPrompt && (
                    <p style={{ fontSize: 12, color: '#8E8E93', textAlign: 'center', marginTop: 10, marginBottom: 0 }}>
                      Don't have a code?{' '}
                      <button
                        type="button"
                        onClick={() => switchMode('waitlist')}
                        style={{
                          fontSize: 12,
                          color: '#8DA286',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          textDecoration: 'underline',
                          fontFamily: 'inherit',
                          padding: 0,
                        }}
                      >
                        Join the waitlist
                      </button>
                    </p>
                  )}
                  <p style={{ fontSize: 11, color: '#AEAEB2', textAlign: 'center', marginTop: 10, lineHeight: 1.6 }}>
                    By signing up, you agree to our{' '}
                    <a href="https://github.com/wangshei/Timebox/blob/main/docs/TERMS_OF_SERVICE.md" target="_blank" rel="noopener noreferrer" style={{ color: '#8DA286', textDecoration: 'underline' }}>Terms of Service</a>
                    {' '}and{' '}
                    <a href="https://github.com/wangshei/Timebox/blob/main/docs/PRIVACY_POLICY.md" target="_blank" rel="noopener noreferrer" style={{ color: '#8DA286', textDecoration: 'underline' }}>Privacy Policy</a>.
                  </p>
                </>
              )}
            </form>
          )}

          {/* Or divider + secondary action — hide in forgot/reset/waitlist modes */}
          {!isForgotOrReset && mode !== 'waitlist' && !awaitingConfirmation && !waitlistJoined && (
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
        {mode !== 'reset' && !waitlistJoined && (
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
        {/* Desktop app promo */}
        {mode !== 'reset' && !waitlistJoined && (
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <a
              href="https://timeboxing.club/desktop"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 12,
                color: '#8E8E93',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                transition: 'color 200ms',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#636366')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#8E8E93')}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <rect x="1" y="1.5" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                <path d="M4.5 12.5h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                <path d="M7 10.5v2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
              Also available as a desktop app
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
