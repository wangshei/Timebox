import React, { useState, useEffect, useCallback } from 'react';

interface WaitlistEntry {
  id: string;
  email: string;
  status: string;
  referral_source: string | null;
  created_at: string;
  approved_at: string | null;
}

interface InviteCode {
  id: string;
  code: string;
  email: string | null;
  used_by: string | null;
  created_by: string;
  created_at: string;
  expires_at: string | null;
}

interface User {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
}

interface BugReport {
  id: string;
  user_email: string | null;
  description: string;
  created_at: string;
}

interface UserStats {
  activeDates: number;
  blocks: number;
  events: number;
  tasks: number;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD as string;
const ADMIN_SECRET = import.meta.env.VITE_ADMIN_SECRET as string;

async function adminFetch(action: string, extra: Record<string, unknown> = {}) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-api`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ action, adminSecret: ADMIN_SECRET, ...extra }),
  });
  return res.json();
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function formatDateTime(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

// ── Styles ──────────────────────────────────────────────────────────────────
const cardStyle: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  borderRadius: 12,
  border: '1px solid rgba(0,0,0,0.08)',
  padding: 24,
};

const btnPrimary: React.CSSProperties = {
  backgroundColor: '#8DA387',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  padding: '8px 16px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

const btnSecondary: React.CSSProperties = {
  backgroundColor: 'transparent',
  color: '#8DA387',
  border: '1px solid #8DA387',
  borderRadius: 8,
  padding: '8px 16px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.09em',
  textTransform: 'uppercase',
  color: '#8E8E93',
  padding: '8px 12px',
  borderBottom: '1px solid rgba(0,0,0,0.08)',
};

const tdStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#1C1C1E',
  padding: '10px 12px',
  borderBottom: '1px solid rgba(0,0,0,0.04)',
};

const badgeBase: React.CSSProperties = {
  display: 'inline-block',
  fontSize: 11,
  fontWeight: 500,
  padding: '2px 8px',
  borderRadius: 99,
};

const sectionLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.09em',
  textTransform: 'uppercase' as const,
  color: '#8E8E93',
};

export function AdminDashboard() {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem('admin_authed') === '1');
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [inviteCodes, setInviteCodes] = useState<InviteCode[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [bugReports, setBugReports] = useState<BugReport[]>([]);
  const [userStats, setUserStats] = useState<Record<string, UserStats>>({});
  const [broadcastMessage, setBroadcastMessage] = useState<string | null>(null);
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Waitlist gate toggle
  const [waitlistOpen, setWaitlistOpen] = useState<boolean | null>(null);
  const [togglingWaitlist, setTogglingWaitlist] = useState(false);

  // Broadcast message composer
  const [broadcastDraft, setBroadcastDraft] = useState('');

  // Admin todo / notes
  const [adminTodo, setAdminTodo] = useState('');
  const [todoSaveStatus, setTodoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const todoSaveTimer = React.useRef<ReturnType<typeof setTimeout>>();
  const [newTodoItem, setNewTodoItem] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput === ADMIN_PASSWORD) {
      sessionStorage.setItem('admin_authed', '1');
      setAuthed(true);
      setPasswordError(false);
    } else {
      setPasswordError(true);
    }
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminFetch('get-dashboard-data');
      if (data.error) throw new Error(data.error);
      setWaitlist(data.waitlist || []);
      setInviteCodes(data.inviteCodes || []);
      setUsers(data.users || []);
      setBugReports(data.bugReports || []);
      setUserStats(data.userStats || {});
      if (typeof data.waitlistOpen === 'boolean') {
        setWaitlistOpen(data.waitlistOpen);
      }
      setAdminTodo(data.adminTodo || '');
      if (data.broadcastMessage) {
        try {
          const parsed = JSON.parse(data.broadcastMessage);
          setBroadcastMessage(parsed.text || null);
        } catch {
          setBroadcastMessage(null);
        }
      } else {
        setBroadcastMessage(null);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authed) loadData();
  }, [authed, loadData]);

  const handleGenerateCodes = async () => {
    setActionLoading('generate');
    setActionMessage(null);
    try {
      const data = await adminFetch('create-invite-codes', { count: 10 });
      if (data.error) throw new Error(data.error);
      setActionMessage(`Generated ${data.codes.length} codes`);
      loadData();
    } catch (err) {
      setActionMessage(`Error: ${(err as Error).message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleSendInvites = async () => {
    if (selectedEmails.size === 0) return;
    setActionLoading('send');
    setActionMessage(null);
    try {
      const data = await adminFetch('send-invites', { emails: Array.from(selectedEmails) });
      if (data.error) throw new Error(data.error);
      const succeeded = data.results?.filter((r: { success: boolean }) => r.success).length ?? 0;
      const failed = data.results?.filter((r: { success: boolean }) => !r.success).length ?? 0;
      setActionMessage(`Sent ${succeeded} invite(s)${failed > 0 ? `, ${failed} failed` : ''}`);
      setSelectedEmails(new Set());
      loadData();
    } catch (err) {
      setActionMessage(`Error: ${(err as Error).message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleWaitlist = async () => {
    setTogglingWaitlist(true);
    try {
      const newValue = !waitlistOpen;
      const data = await adminFetch('set-config', { key: 'waitlist_open', value: newValue });
      if (data.error) throw new Error(data.error);
      setWaitlistOpen(newValue);
    } catch (err) {
      setActionMessage(`Error toggling waitlist: ${(err as Error).message}`);
    } finally {
      setTogglingWaitlist(false);
    }
  };

  const handleSendBroadcast = async () => {
    if (!broadcastDraft.trim()) return;
    setActionLoading('broadcast');
    setActionMessage(null);
    try {
      const data = await adminFetch('send-broadcast', { message: broadcastDraft.trim() });
      if (data.error) throw new Error(data.error);
      setActionMessage('Broadcast message sent to all users');
      setBroadcastMessage(broadcastDraft.trim());
      setBroadcastDraft('');
    } catch (err) {
      setActionMessage(`Error: ${(err as Error).message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleClearBroadcast = async () => {
    setActionLoading('clear-broadcast');
    try {
      const data = await adminFetch('clear-broadcast');
      if (data.error) throw new Error(data.error);
      setBroadcastMessage(null);
      setActionMessage('Broadcast message cleared');
    } catch (err) {
      setActionMessage(`Error: ${(err as Error).message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const saveTodo = useCallback(async (text: string) => {
    setTodoSaveStatus('saving');
    try {
      await adminFetch('save-admin-todo', { todo: text });
      setTodoSaveStatus('saved');
      setTimeout(() => setTodoSaveStatus('idle'), 1500);
    } catch {
      setTodoSaveStatus('idle');
    }
  }, []);

  const handleTodoChange = (text: string) => {
    setAdminTodo(text);
    // Auto-save after 800ms of inactivity
    if (todoSaveTimer.current) clearTimeout(todoSaveTimer.current);
    todoSaveTimer.current = setTimeout(() => saveTodo(text), 800);
  };

  const handleAddTodoItem = () => {
    if (!newTodoItem.trim()) return;
    const timestamp = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const newLine = `- [ ] ${newTodoItem.trim()} (${timestamp})`;
    const updated = adminTodo ? `${adminTodo}\n${newLine}` : newLine;
    setAdminTodo(updated);
    setNewTodoItem('');
    saveTodo(updated);
  };

  const handleResendConfirmation = async () => {
    const unconfirmed = users.filter(u => !u.email_confirmed_at);
    if (unconfirmed.length === 0) {
      setActionMessage('No unconfirmed users to email');
      return;
    }
    setActionLoading('resend');
    setActionMessage(null);
    try {
      const data = await adminFetch('resend-confirmation', { emails: unconfirmed.map(u => u.email) });
      if (data.error) throw new Error(data.error);
      const succeeded = data.results?.filter((r: { success: boolean }) => r.success).length ?? 0;
      const failed = data.results?.filter((r: { success: boolean }) => !r.success).length ?? 0;
      setActionMessage(`Resent confirmation to ${succeeded} user(s)${failed > 0 ? `, ${failed} failed` : ''}`);
    } catch (err) {
      setActionMessage(`Error: ${(err as Error).message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const toggleEmail = (email: string) => {
    setSelectedEmails(prev => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  };

  const selectAllPending = () => {
    const pending = waitlist.filter(w => w.status === 'pending').map(w => w.email);
    setSelectedEmails(prev => {
      const allSelected = pending.every(e => prev.has(e));
      if (allSelected) return new Set();
      return new Set(pending);
    });
  };

  // ── Password gate ──────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#F8F7F4',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}>
        <div style={{ ...cardStyle, width: 380, maxWidth: '90vw' }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1C1C1E', margin: '0 0 4px', letterSpacing: '-0.02em' }}>
            Admin Dashboard
          </h1>
          <p style={{ fontSize: 13, color: '#8E8E93', margin: '0 0 24px' }}>
            Enter the admin password to continue.
          </p>
          <form onSubmit={handleLogin}>
            <input
              type="password"
              value={passwordInput}
              onChange={e => { setPasswordInput(e.target.value); setPasswordError(false); }}
              placeholder="Password"
              autoFocus
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: 14,
                border: `1px solid ${passwordError ? '#FF3B30' : 'rgba(0,0,0,0.12)'}`,
                borderRadius: 8,
                outline: 'none',
                boxSizing: 'border-box',
                marginBottom: 16,
              }}
            />
            {passwordError && (
              <p style={{ fontSize: 12, color: '#FF3B30', margin: '-8px 0 16px' }}>
                Incorrect password.
              </p>
            )}
            <button type="submit" style={{ ...btnPrimary, width: '100%', padding: '10px 0' }}>
              Sign In
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── Computed stats ─────────────────────────────────────────────────────────
  const pendingWaitlist = waitlist.filter(w => w.status === 'pending');
  const approvedWaitlist = waitlist.filter(w => w.status === 'approved');
  const usedCodes = inviteCodes.filter(c => c.used_by);
  const totalCodes = inviteCodes.length;
  const unconfirmedUsers = users.filter(u => !u.email_confirmed_at);

  // Referral breakdown
  const referralCounts: Record<string, number> = {};
  for (const w of waitlist) {
    const source = w.referral_source || 'Unknown';
    referralCounts[source] = (referralCounts[source] || 0) + 1;
  }
  const referralEntries = Object.entries(referralCounts).sort((a, b) => b[1] - a[1]);

  // ── Dashboard ──────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#F8F7F4',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1C1C1E', margin: 0, letterSpacing: '-0.02em' }}>
              Admin Dashboard
            </h1>
            <p style={{ fontSize: 13, color: '#8E8E93', margin: '4px 0 0' }}>
              The Timeboxing Club
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={loadData}
              disabled={loading}
              style={{ ...btnSecondary, opacity: loading ? 0.6 : 1 }}
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
            <button
              onClick={() => { sessionStorage.removeItem('admin_authed'); setAuthed(false); }}
              style={{ ...btnSecondary, color: '#FF3B30', borderColor: '#FF3B30' }}
            >
              Logout
            </button>
          </div>
        </div>

        {error && (
          <div style={{ ...cardStyle, marginBottom: 20, backgroundColor: '#FFF5F5', borderColor: '#FF3B30' }}>
            <p style={{ margin: 0, fontSize: 13, color: '#FF3B30' }}>{error}</p>
          </div>
        )}

        {actionMessage && (
          <div style={{
            ...cardStyle,
            marginBottom: 20,
            backgroundColor: actionMessage.startsWith('Error') ? '#FFF5F5' : '#F0FFF4',
            borderColor: actionMessage.startsWith('Error') ? '#FF3B30' : '#8DA387',
          }}>
            <p style={{ margin: 0, fontSize: 13, color: actionMessage.startsWith('Error') ? '#FF3B30' : '#2D6A4F' }}>
              {actionMessage}
            </p>
          </div>
        )}

        {/* Stats Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
          {[
            { label: 'Total Users', value: users.length, color: '#1C1C1E' },
            { label: 'Unconfirmed', value: unconfirmedUsers.length, color: unconfirmedUsers.length > 0 ? '#FF3B30' : '#8E8E93' },
            { label: 'Waitlist Pending', value: pendingWaitlist.length, color: '#FF9500' },
            { label: 'Waitlist Approved', value: approvedWaitlist.length, color: '#8DA387' },
            { label: 'Codes Used / Total', value: `${usedCodes.length} / ${totalCodes}`, color: '#5856D6' },
            { label: 'Bug Reports', value: bugReports.length, color: bugReports.length > 0 ? '#FF9500' : '#8E8E93' },
          ].map(stat => (
            <div key={stat.label} style={cardStyle}>
              <div style={{ ...sectionLabel, marginBottom: 6 }}>
                {stat.label}
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: stat.color, letterSpacing: '-0.02em' }}>
                {stat.value}
              </div>
            </div>
          ))}
        </div>

        {/* Admin Todo / Notes */}
        <div style={{ ...cardStyle, marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={sectionLabel}>
              Todo / Bugs to Fix
            </div>
            <span style={{ fontSize: 11, color: todoSaveStatus === 'saved' ? '#34C759' : todoSaveStatus === 'saving' ? '#8E8E93' : 'transparent', transition: 'color 300ms' }}>
              {todoSaveStatus === 'saved' ? 'Saved' : todoSaveStatus === 'saving' ? 'Saving...' : '.'}
            </span>
          </div>
          {/* Quick add */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input
              type="text"
              value={newTodoItem}
              onChange={(e) => setNewTodoItem(e.target.value)}
              placeholder="Quick add a task or bug..."
              style={{
                flex: 1,
                padding: '8px 12px',
                fontSize: 13,
                border: '1px solid rgba(0,0,0,0.12)',
                borderRadius: 8,
                outline: 'none',
                fontFamily: 'inherit',
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddTodoItem(); }}
            />
            <button
              onClick={handleAddTodoItem}
              disabled={!newTodoItem.trim()}
              style={{
                ...btnPrimary,
                fontSize: 12,
                padding: '8px 14px',
                opacity: newTodoItem.trim() ? 1 : 0.4,
              }}
            >
              Add
            </button>
          </div>
          {/* Editable markdown textarea */}
          <textarea
            value={adminTodo}
            onChange={(e) => handleTodoChange(e.target.value)}
            placeholder={"- [ ] Fix calendar sync bug\n- [ ] Add dark mode\n- [x] Deploy v2.1"}
            rows={10}
            style={{
              width: '100%',
              fontSize: 13,
              fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
              lineHeight: 1.7,
              resize: 'vertical',
              borderRadius: 8,
              padding: 12,
              outline: 'none',
              backgroundColor: 'rgba(0,0,0,0.02)',
              border: '1px solid rgba(0,0,0,0.09)',
              color: '#1C1C1E',
              boxSizing: 'border-box',
            }}
          />
          <p style={{ fontSize: 11, color: '#AEAEB2', margin: '8px 0 0' }}>
            Markdown format. Use <code style={{ fontSize: 10, backgroundColor: 'rgba(0,0,0,0.05)', padding: '1px 4px', borderRadius: 3 }}>- [ ]</code> for todos, <code style={{ fontSize: 10, backgroundColor: 'rgba(0,0,0,0.05)', padding: '1px 4px', borderRadius: 3 }}>- [x]</code> for done. Auto-saves.
          </p>
        </div>

        {/* Broadcast Message + Waitlist Gate */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
          {/* Broadcast message composer */}
          <div style={cardStyle}>
            <div style={{ ...sectionLabel, marginBottom: 12 }}>
              Broadcast Message
            </div>
            {broadcastMessage && (
              <div style={{
                padding: '10px 12px',
                borderRadius: 8,
                backgroundColor: 'rgba(88,86,214,0.06)',
                border: '1px solid rgba(88,86,214,0.15)',
                marginBottom: 12,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
              }}>
                <span style={{ fontSize: 13, color: '#5856D6', flex: 1, lineHeight: 1.5 }}>
                  Active: "{broadcastMessage}"
                </span>
                <button
                  onClick={handleClearBroadcast}
                  disabled={actionLoading === 'clear-broadcast'}
                  style={{
                    ...btnSecondary,
                    fontSize: 11,
                    padding: '3px 8px',
                    color: '#FF3B30',
                    borderColor: '#FF3B30',
                    flexShrink: 0,
                  }}
                >
                  Clear
                </button>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={broadcastDraft}
                onChange={(e) => setBroadcastDraft(e.target.value)}
                placeholder="e.g. Bug fixed! Calendar sync is now working."
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  fontSize: 13,
                  border: '1px solid rgba(0,0,0,0.12)',
                  borderRadius: 8,
                  outline: 'none',
                  fontFamily: 'inherit',
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSendBroadcast(); }}
              />
              <button
                onClick={handleSendBroadcast}
                disabled={!broadcastDraft.trim() || actionLoading === 'broadcast'}
                style={{
                  ...btnPrimary,
                  fontSize: 12,
                  padding: '8px 14px',
                  opacity: (!broadcastDraft.trim() || actionLoading === 'broadcast') ? 0.5 : 1,
                }}
              >
                {actionLoading === 'broadcast' ? 'Sending...' : 'Send'}
              </button>
            </div>
            <p style={{ fontSize: 11, color: '#8E8E93', margin: '8px 0 0', lineHeight: 1.5 }}>
              This message will appear as a popup for all users next time they open the app.
            </p>
          </div>

          {/* Waitlist gate */}
          <div style={cardStyle}>
            <div style={{ ...sectionLabel, marginBottom: 12 }}>
              Waitlist Gate
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                backgroundColor: waitlistOpen === null ? '#C7C7CC' : waitlistOpen ? '#34C759' : '#FF3B30',
              }} />
              <span style={{ fontSize: 14, fontWeight: 500, color: '#1C1C1E' }}>
                {waitlistOpen === null ? 'Loading...' : waitlistOpen ? 'Open — anyone can sign up' : 'Closed — invite code required'}
              </span>
              <button
                onClick={handleToggleWaitlist}
                disabled={togglingWaitlist || waitlistOpen === null}
                style={{
                  ...btnSecondary,
                  marginLeft: 'auto',
                  fontSize: 12,
                  padding: '6px 12px',
                  opacity: togglingWaitlist ? 0.6 : 1,
                }}
              >
                {togglingWaitlist ? 'Updating...' : waitlistOpen ? 'Close Waitlist' : 'Open Waitlist'}
              </button>
            </div>
            <p style={{ fontSize: 11, color: '#8E8E93', margin: '10px 0 0', lineHeight: 1.5 }}>
              {waitlistOpen
                ? 'The invite code field is hidden. Anyone can create an account.'
                : 'Users need a valid invite code to sign up. Those without one can join the waitlist.'}
            </p>
          </div>
        </div>

        {/* Referral Breakdown + Resend Confirmation */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
          {/* Referral breakdown */}
          <div style={cardStyle}>
            <div style={{ ...sectionLabel, marginBottom: 12 }}>
              Referral Sources
            </div>
            {referralEntries.length === 0 ? (
              <p style={{ fontSize: 13, color: '#8E8E93', margin: 0 }}>No waitlist entries yet.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {referralEntries.map(([source, count]) => (
                    <tr key={source}>
                      <td style={{ fontSize: 13, color: '#3A3A3C', padding: '4px 0' }}>{source}</td>
                      <td style={{ fontSize: 13, fontWeight: 600, color: '#1C1C1E', textAlign: 'right', padding: '4px 0' }}>
                        {count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Resend confirmation */}
          <div style={cardStyle}>
            <div style={{ ...sectionLabel, marginBottom: 12 }}>
              Unconfirmed Users ({unconfirmedUsers.length})
            </div>
            {unconfirmedUsers.length === 0 ? (
              <p style={{ fontSize: 13, color: '#8E8E93', margin: 0 }}>All users have confirmed their email.</p>
            ) : (
              <>
                <div style={{ maxHeight: 120, overflowY: 'auto', marginBottom: 12 }}>
                  {unconfirmedUsers.map(u => (
                    <div key={u.id} style={{ fontSize: 12, color: '#3A3A3C', padding: '3px 0', fontFamily: 'ui-monospace, monospace' }}>
                      {u.email}
                      <span style={{ color: '#AEAEB2', marginLeft: 8 }}>signed up {formatDate(u.created_at)}</span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={handleResendConfirmation}
                  disabled={actionLoading === 'resend'}
                  style={{
                    ...btnPrimary,
                    fontSize: 12,
                    padding: '6px 14px',
                    opacity: actionLoading === 'resend' ? 0.5 : 1,
                    backgroundColor: '#FF9500',
                  }}
                >
                  {actionLoading === 'resend' ? 'Sending...' : `Resend Confirmation (${unconfirmedUsers.length})`}
                </button>
                <p style={{ fontSize: 11, color: '#8E8E93', margin: '8px 0 0', lineHeight: 1.5 }}>
                  Sends a reminder email with a new confirmation link to all unconfirmed users.
                </p>
              </>
            )}
          </div>
        </div>

        {/* Bug Reports Table */}
        <div style={{ ...cardStyle, marginBottom: 24 }}>
          <div style={{ ...sectionLabel, marginBottom: 16 }}>
            Bug Reports ({bugReports.length})
          </div>
          {bugReports.length === 0 ? (
            <p style={{ fontSize: 13, color: '#8E8E93', margin: 0 }}>No bug reports yet.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Date</th>
                    <th style={thStyle}>User</th>
                    <th style={thStyle}>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {bugReports.map(report => (
                    <tr key={report.id}>
                      <td style={{ ...tdStyle, color: '#8E8E93', fontSize: 12, whiteSpace: 'nowrap' }}>
                        {formatDateTime(report.created_at)}
                      </td>
                      <td style={{ ...tdStyle, fontFamily: 'ui-monospace, monospace', fontSize: 12, whiteSpace: 'nowrap' }}>
                        {report.user_email || 'anonymous'}
                      </td>
                      <td style={{ ...tdStyle, fontSize: 13, lineHeight: 1.5, maxWidth: 500 }}>
                        {report.description}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Waitlist Table */}
        <div style={{ ...cardStyle, marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={sectionLabel}>
              Waitlist ({waitlist.length})
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {pendingWaitlist.length > 0 && (
                <button onClick={selectAllPending} style={{ ...btnSecondary, fontSize: 12, padding: '5px 10px' }}>
                  {pendingWaitlist.every(w => selectedEmails.has(w.email)) ? 'Deselect All' : 'Select All Pending'}
                </button>
              )}
              {selectedEmails.size > 0 && (
                <button
                  onClick={handleSendInvites}
                  disabled={actionLoading === 'send'}
                  style={{ ...btnPrimary, fontSize: 12, padding: '5px 12px', opacity: actionLoading === 'send' ? 0.6 : 1 }}
                >
                  {actionLoading === 'send' ? 'Sending...' : `Send Invites (${selectedEmails.size})`}
                </button>
              )}
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, width: 36 }}></th>
                  <th style={thStyle}>Email</th>
                  <th style={thStyle}>Referral</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Date</th>
                </tr>
              </thead>
              <tbody>
                {waitlist.map(entry => (
                  <tr key={entry.id} style={{ backgroundColor: selectedEmails.has(entry.email) ? 'rgba(141,163,135,0.06)' : undefined }}>
                    <td style={tdStyle}>
                      {entry.status === 'pending' && (
                        <input
                          type="checkbox"
                          checked={selectedEmails.has(entry.email)}
                          onChange={() => toggleEmail(entry.email)}
                          style={{ accentColor: '#8DA387' }}
                        />
                      )}
                    </td>
                    <td style={{ ...tdStyle, fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>{entry.email}</td>
                    <td style={{ ...tdStyle, color: '#8E8E93', fontSize: 12 }}>{entry.referral_source || '—'}</td>
                    <td style={tdStyle}>
                      <span style={{
                        ...badgeBase,
                        backgroundColor: entry.status === 'pending' ? '#FFF3E0' : '#E8F5E9',
                        color: entry.status === 'pending' ? '#E65100' : '#2E7D32',
                      }}>
                        {entry.status}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, color: '#8E8E93', fontSize: 12 }}>{formatDate(entry.created_at)}</td>
                  </tr>
                ))}
                {waitlist.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: '#8E8E93', padding: 24 }}>
                      No waitlist entries.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Invite Codes Table */}
        <div style={{ ...cardStyle, marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={sectionLabel}>
              Invite Codes ({inviteCodes.length})
            </div>
            <button
              onClick={handleGenerateCodes}
              disabled={actionLoading === 'generate'}
              style={{ ...btnPrimary, fontSize: 12, padding: '5px 12px', opacity: actionLoading === 'generate' ? 0.6 : 1 }}
            >
              {actionLoading === 'generate' ? 'Generating...' : 'Generate 10 Codes'}
            </button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Code</th>
                  <th style={thStyle}>Assigned To</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Created</th>
                </tr>
              </thead>
              <tbody>
                {inviteCodes.map(code => (
                  <tr key={code.id}>
                    <td style={{ ...tdStyle, fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: 13, fontWeight: 600, letterSpacing: '0.05em' }}>
                      {code.code}
                    </td>
                    <td style={{ ...tdStyle, color: '#8E8E93', fontSize: 12 }}>{code.email || '—'}</td>
                    <td style={tdStyle}>
                      <span style={{
                        ...badgeBase,
                        backgroundColor: code.used_by ? '#E8F5E9' : '#F5F4F0',
                        color: code.used_by ? '#2E7D32' : '#8E8E93',
                      }}>
                        {code.used_by ? 'Used' : 'Available'}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, color: '#8E8E93', fontSize: 12 }}>{formatDate(code.created_at)}</td>
                  </tr>
                ))}
                {inviteCodes.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ ...tdStyle, textAlign: 'center', color: '#8E8E93', padding: 24 }}>
                      No invite codes.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Users Table — with per-user stats */}
        <div style={cardStyle}>
          <div style={{ ...sectionLabel, marginBottom: 16 }}>
            Users ({users.length})
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Email</th>
                  <th style={thStyle}>Signed Up</th>
                  <th style={thStyle}>Last Sign In</th>
                  <th style={thStyle}>Email Confirmed</th>
                  <th style={thStyle}>Active Days</th>
                  <th style={thStyle}>Tasks</th>
                  <th style={thStyle}>Blocks</th>
                  <th style={thStyle}>Events</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => {
                  const stats = userStats[user.id];
                  return (
                    <tr key={user.id}>
                      <td style={{ ...tdStyle, fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>{user.email}</td>
                      <td style={{ ...tdStyle, color: '#8E8E93', fontSize: 12 }}>{formatDate(user.created_at)}</td>
                      <td style={{ ...tdStyle, color: '#8E8E93', fontSize: 12 }}>{formatDateTime(user.last_sign_in_at)}</td>
                      <td style={tdStyle}>
                        <span style={{
                          ...badgeBase,
                          backgroundColor: user.email_confirmed_at ? '#E8F5E9' : '#FFF3E0',
                          color: user.email_confirmed_at ? '#2E7D32' : '#E65100',
                        }}>
                          {user.email_confirmed_at ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, fontSize: 13, fontWeight: 600, color: stats?.activeDates ? '#1C1C1E' : '#C7C7CC' }}>
                        {stats?.activeDates ?? 0}
                      </td>
                      <td style={{ ...tdStyle, fontSize: 13, color: stats?.tasks ? '#3A3A3C' : '#C7C7CC' }}>
                        {stats?.tasks ?? 0}
                      </td>
                      <td style={{ ...tdStyle, fontSize: 13, color: stats?.blocks ? '#3A3A3C' : '#C7C7CC' }}>
                        {stats?.blocks ?? 0}
                      </td>
                      <td style={{ ...tdStyle, fontSize: 13, color: stats?.events ? '#3A3A3C' : '#C7C7CC' }}>
                        {stats?.events ?? 0}
                      </td>
                    </tr>
                  );
                })}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ ...tdStyle, textAlign: 'center', color: '#8E8E93', padding: 24 }}>
                      No users.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
