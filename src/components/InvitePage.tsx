import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

interface InviteData {
  shareName: string;
  senderName: string;
  scope: string;
  eventCount: number;
  events: Array<{
    title: string;
    date: string;
    start: string;
    end: string;
  }>;
  status: 'pending' | 'accepted' | 'declined';
}

const PRIMARY = '#8DA286';
const BG = '#F8F7F4';

export function InvitePage({ token }: { token: string }) {
  const [invite, setInvite] = useState<InviteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [responding, setResponding] = useState(false);
  const [responseStatus, setResponseStatus] = useState<'accepted' | 'declined' | null>(null);

  // Check URL params for quick decline
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('action') === 'decline') {
      handleRespond('declined');
    }
  }, []);

  useEffect(() => {
    loadInvite();
  }, [token]);

  async function loadInvite() {
    setLoading(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
      if (!supabaseUrl || !supabaseAnonKey) throw new Error('App not configured');

      // Fetch member info by token
      const res = await fetch(`${supabaseUrl}/functions/v1/share-invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({ action: 'get_invite_details', token }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setInvite(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load invite');
    } finally {
      setLoading(false);
    }
  }

  async function handleRespond(status: 'accepted' | 'declined') {
    setResponding(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
      const res = await fetch(`${supabaseUrl}/functions/v1/share-invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({ action: 'respond', token, status }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResponseStatus(status);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to respond');
    } finally {
      setResponding(false);
    }
  }

  // Scope label
  const scopeLabel = (scope: string) => {
    switch (scope) {
      case 'calendar': return 'calendar';
      case 'category': return 'category';
      case 'tag': return 'project';
      case 'event': return 'event';
      default: return 'calendar';
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: BG, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 32, height: 32, border: `3px solid ${PRIMARY}30`, borderTopColor: PRIMARY, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ color: '#8E8E93', fontSize: 14 }}>Loading invite...</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: BG, fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '48px 24px' }}>

        {/* Brand header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ display: 'inline-block', backgroundColor: PRIMARY, color: '#FFFFFF', fontSize: 13, fontWeight: 700, padding: '7px 18px', borderRadius: 20, letterSpacing: '0.5px' }}>
            The Timeboxing Club
          </div>
        </div>

        {/* Main card */}
        <div style={{
          backgroundColor: '#FFFFFF',
          borderRadius: 20,
          overflow: 'hidden',
          boxShadow: '0 4px 24px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.03)',
          border: '1px solid rgba(0,0,0,0.06)',
        }}>

          {/* Error state */}
          {error && !invite && (
            <div style={{ padding: '48px 32px', textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>?</div>
              <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1C1C1E', margin: '0 0 8px' }}>
                Invite not found
              </h1>
              <p style={{ fontSize: 14, color: '#8E8E93', lineHeight: 1.5, margin: '0 0 24px' }}>
                This invite link may have expired or been revoked.
              </p>
              <a
                href="/"
                style={{ display: 'inline-block', backgroundColor: PRIMARY, color: '#FFFFFF', fontSize: 14, fontWeight: 600, padding: '10px 24px', borderRadius: 10, textDecoration: 'none' }}
              >
                Go to Timeboxing Club
              </a>
            </div>
          )}

          {/* Responded state */}
          {responseStatus && (
            <div style={{ padding: '48px 32px', textAlign: 'center' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', backgroundColor: responseStatus === 'accepted' ? `${PRIMARY}15` : 'rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                <span style={{ fontSize: 28 }}>{responseStatus === 'accepted' ? '\u2713' : '\u2715'}</span>
              </div>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1C1C1E', margin: '0 0 8px' }}>
                {responseStatus === 'accepted' ? 'Invite accepted!' : 'Invite declined'}
              </h1>
              {responseStatus === 'accepted' && (
                <p style={{ fontSize: 14, color: '#636366', lineHeight: 1.6, margin: '0 0 28px' }}>
                  You'll receive individual Google Calendar invites for each event.
                  <br />Or join Timeboxing Club to see them all in one place.
                </p>
              )}
              {responseStatus === 'declined' && (
                <p style={{ fontSize: 14, color: '#8E8E93', lineHeight: 1.5, margin: '0 0 28px' }}>
                  You won't receive events from this share.
                </p>
              )}

              {/* Join CTA — always show, more prominent on accept */}
              <div style={{
                backgroundColor: `${PRIMARY}08`,
                border: `2px solid ${PRIMARY}30`,
                borderRadius: 16,
                padding: '24px 24px 20px',
                marginTop: 8,
              }}>
                <h2 style={{ fontSize: 17, fontWeight: 700, color: '#1C1C1E', margin: '0 0 8px' }}>
                  Join The Timeboxing Club
                </h2>
                <p style={{ fontSize: 13, color: '#636366', lineHeight: 1.5, margin: '0 0 16px' }}>
                  See <strong>all your shared calendars in one view</strong> instead of getting separate Google Calendar invites for every event. Plus, plan your day with time-blocking.
                </p>
                <a
                  href="/"
                  style={{
                    display: 'block',
                    backgroundColor: PRIMARY,
                    color: '#FFFFFF',
                    fontSize: 15,
                    fontWeight: 700,
                    padding: '12px 24px',
                    borderRadius: 12,
                    textDecoration: 'none',
                    textAlign: 'center',
                  }}
                >
                  Sign up free
                </a>
              </div>
            </div>
          )}

          {/* Invite details */}
          {invite && !responseStatus && (
            <>
              {/* Header section */}
              <div style={{ padding: '32px 32px 20px', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                <p style={{ fontSize: 13, color: '#8E8E93', margin: '0 0 6px' }}>
                  {invite.senderName} invited you to a shared {scopeLabel(invite.scope)}
                </p>
                <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1C1C1E', margin: '0 0 4px' }}>
                  {invite.shareName}
                </h1>
                <p style={{ fontSize: 14, color: '#636366', margin: 0 }}>
                  {invite.eventCount} event{invite.eventCount !== 1 ? 's' : ''} shared with you
                </p>
              </div>

              {/* Event preview list */}
              {invite.events && invite.events.length > 0 && (
                <div style={{ padding: '16px 32px', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                  <p style={{ fontSize: 11, fontWeight: 600, color: '#8E8E93', letterSpacing: '0.05em', textTransform: 'uppercase', margin: '0 0 10px' }}>
                    Upcoming events
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {invite.events.slice(0, 5).map((evt, i) => (
                      <div
                        key={i}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: '10px 12px',
                          backgroundColor: 'rgba(0,0,0,0.02)',
                          borderRadius: 10,
                          borderLeft: `3px solid ${PRIMARY}`,
                        }}
                      >
                        <div style={{ flex: '0 0 auto', textAlign: 'center', minWidth: 44 }}>
                          <div style={{ fontSize: 10, fontWeight: 600, color: '#8E8E93', textTransform: 'uppercase' }}>
                            {new Date(evt.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' })}
                          </div>
                          <div style={{ fontSize: 20, fontWeight: 700, color: '#1C1C1E', lineHeight: 1.1 }}>
                            {new Date(evt.date + 'T00:00:00').getDate()}
                          </div>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#1C1C1E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {evt.title}
                          </div>
                          <div style={{ fontSize: 11, color: '#8E8E93', marginTop: 1 }}>
                            {evt.start} - {evt.end}
                          </div>
                        </div>
                      </div>
                    ))}
                    {invite.eventCount > 5 && (
                      <p style={{ fontSize: 12, color: '#8E8E93', margin: '4px 0 0', textAlign: 'center' }}>
                        + {invite.eventCount - 5} more event{invite.eventCount - 5 !== 1 ? 's' : ''}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Accept / Decline buttons */}
              <div style={{ padding: '20px 32px' }}>
                {invite.status === 'pending' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <button
                      onClick={() => handleRespond('accepted')}
                      disabled={responding}
                      style={{
                        width: '100%',
                        padding: '12px 24px',
                        fontSize: 15,
                        fontWeight: 600,
                        color: '#FFFFFF',
                        backgroundColor: PRIMARY,
                        border: 'none',
                        borderRadius: 12,
                        cursor: responding ? 'wait' : 'pointer',
                        opacity: responding ? 0.6 : 1,
                      }}
                    >
                      {responding ? 'Accepting...' : 'Accept invite'}
                    </button>
                    <button
                      onClick={() => handleRespond('declined')}
                      disabled={responding}
                      style={{
                        width: '100%',
                        padding: '10px 24px',
                        fontSize: 13,
                        fontWeight: 500,
                        color: '#8E8E93',
                        backgroundColor: 'transparent',
                        border: '1px solid rgba(0,0,0,0.08)',
                        borderRadius: 10,
                        cursor: responding ? 'wait' : 'pointer',
                      }}
                    >
                      Decline
                    </button>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: 8 }}>
                    <span style={{ fontSize: 14, color: invite.status === 'accepted' ? PRIMARY : '#8E8E93', fontWeight: 600 }}>
                      {invite.status === 'accepted' ? 'Accepted' : 'Declined'}
                    </span>
                  </div>
                )}
              </div>

              {/* Join CTA — the growth hook */}
              <div style={{
                margin: '0 20px 20px',
                padding: '24px',
                backgroundColor: `${PRIMARY}0A`,
                border: `2px solid ${PRIMARY}25`,
                borderRadius: 16,
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <div style={{
                    flex: '0 0 auto',
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    backgroundColor: PRIMARY,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                  </div>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1C1C1E', margin: '0 0 6px' }}>
                      Join The Timeboxing Club
                    </h3>
                    <p style={{ fontSize: 13, color: '#636366', lineHeight: 1.5, margin: '0 0 4px' }}>
                      <strong>Accept all invites in one place</strong> instead of getting a separate Google Calendar invite for every single event.
                    </p>
                    <ul style={{ margin: '8px 0 0', padding: '0 0 0 16px', fontSize: 12, color: '#636366', lineHeight: 1.8 }}>
                      <li>See all shared calendars in one beautiful view</li>
                      <li>New events appear automatically — no more invite spam</li>
                      <li>Plan your day with time-blocking</li>
                    </ul>
                  </div>
                </div>
                <a
                  href="/"
                  style={{
                    display: 'block',
                    marginTop: 16,
                    padding: '12px 24px',
                    backgroundColor: PRIMARY,
                    color: '#FFFFFF',
                    fontSize: 15,
                    fontWeight: 700,
                    borderRadius: 12,
                    textDecoration: 'none',
                    textAlign: 'center',
                    boxShadow: `0 2px 8px ${PRIMARY}40`,
                  }}
                >
                  Sign up free
                </a>
                <p style={{ fontSize: 11, color: '#AEAEB2', textAlign: 'center', margin: '10px 0 0' }}>
                  Free forever. No credit card required.
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <p style={{ textAlign: 'center', fontSize: 11, color: '#C7C7CC', marginTop: 32 }}>
          The Timeboxing Club
        </p>
      </div>
    </div>
  );
}
