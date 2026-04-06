import React, { useEffect, useState } from 'react';
import {
  exchangeGoogleCode,
  fetchGoogleCalendars,
  importGoogleCalendarEvents,
  setGcalSelectedCalendarIds,
} from '../services/googleCalendar';

interface GcalCalendarOption {
  id: string;
  summary: string;
  backgroundColor: string;
  primary: boolean;
}

type SyncMode = 'migrate_listen' | 'listen_with_history' | 'listen_fresh';

const SYNC_MODE_OPTIONS: Array<{ mode: SyncMode; title: string; desc: string }> = [
  {
    mode: 'migrate_listen',
    title: 'Import all events',
    desc: 'Import all existing events from the selected calendars. Best if you\'re switching to Timebox.',
  },
  {
    mode: 'listen_with_history',
    title: 'Import only new events (invites)',
    desc: 'Only import events others invited you to (past and future). Your own events stay in Google.',
  },
  {
    mode: 'listen_fresh',
    title: 'Fresh start (future invites only)',
    desc: 'No past import. Only new invites from others will show up going forward.',
  },
];

export function GcalCallbackPage({ code }: { code: string }) {
  const [status, setStatus] = useState<'exchanging' | 'pick_calendars' | 'importing' | 'success' | 'error'>('exchanging');
  const [errorMsg, setErrorMsg] = useState('');
  const [importCount, setImportCount] = useState(0);
  const [calendars, setCalendars] = useState<GcalCalendarOption[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Detect reconnect (scope upgrade) — if gcal_reconnect flag is set, skip setup
  const isReconnect = localStorage.getItem('gcal_reconnect') === 'true';
  // Default to the sync mode stored before OAuth redirect, or 'migrate_listen' for new connections
  const [syncMode, setSyncMode] = useState<SyncMode>(
    () => (localStorage.getItem('gcal_pending_sync_mode') as SyncMode) || 'migrate_listen'
  );

  // Step 1: Exchange code for tokens, then fetch calendar list
  useEffect(() => {
    (async () => {
      try {
        await exchangeGoogleCode(code);
        // If this is a reconnect (scope upgrade), skip the setup flow
        if (isReconnect) {
          localStorage.removeItem('gcal_reconnect');
          const result = await importGoogleCalendarEvents();
          setImportCount(result.events.length);
          setStatus('success');
          setTimeout(() => { window.location.href = '/'; }, 1500);
          return;
        }
        const cals = await fetchGoogleCalendars();
        setCalendars(cals);
        // Default: select all calendars
        setSelected(new Set(cals.map(c => c.id)));
        setStatus('pick_calendars');
      } catch (err) {
        setStatus('error');
        setErrorMsg(err instanceof Error ? err.message : 'Unknown error');
      }
    })();
  }, [code]);

  const toggleCalendar = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleImport = async () => {
    try {
      // Save selection and sync mode so import respects them
      setGcalSelectedCalendarIds([...selected]);
      localStorage.setItem('gcal_pending_sync_mode', syncMode);
      setStatus('importing');

      const result = await importGoogleCalendarEvents();
      setImportCount(result.events.length);
      setStatus('success');

      setTimeout(() => { window.location.href = '/'; }, 2000);
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const containerStyle: React.CSSProperties = {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FDFDFB',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  };

  const cardStyle: React.CSSProperties = {
    textAlign: 'center',
    padding: 40,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    border: '1px solid rgba(0,0,0,0.08)',
    maxWidth: 440,
    width: '100%',
  };

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        {status === 'exchanging' && (
          <>
            <div style={{ fontSize: 32, marginBottom: 12 }}>&#9881;</div>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: '#1C1C1E', margin: '0 0 8px' }}>
              Connecting Google Calendar...
            </h2>
            <p style={{ fontSize: 13, color: '#8E8E93' }}>Authorizing with Google.</p>
          </>
        )}

        {status === 'pick_calendars' && (
          <>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: '#1C1C1E', margin: '0 0 4px' }}>
              Choose calendars to import
            </h2>
            <p style={{ fontSize: 12, color: '#8E8E93', marginBottom: 16 }}>
              You can change this later in Settings.
            </p>

            <div style={{ textAlign: 'left', marginBottom: 16, maxHeight: 280, overflowY: 'auto' }}>
              {calendars.map(cal => {
                const checked = selected.has(cal.id);
                return (
                  <button
                    key={cal.id}
                    type="button"
                    onClick={() => toggleCalendar(cal.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: checked ? `1.5px solid ${cal.backgroundColor}60` : '1px solid rgba(0,0,0,0.06)',
                      backgroundColor: checked ? `${cal.backgroundColor}0A` : '#FAFAFA',
                      cursor: 'pointer',
                      marginBottom: 6,
                      transition: 'all 0.15s',
                      textAlign: 'left',
                    }}
                  >
                    {/* Checkbox */}
                    <div style={{
                      width: 18,
                      height: 18,
                      borderRadius: 5,
                      border: checked ? `2px solid ${cal.backgroundColor}` : '2px solid rgba(0,0,0,0.2)',
                      backgroundColor: checked ? cal.backgroundColor : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      transition: 'all 0.15s',
                    }}>
                      {checked && (
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                          <path d="M1 4L3.5 6.5L9 1" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>

                    {/* Color dot + name */}
                    <div style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      backgroundColor: cal.backgroundColor,
                      flexShrink: 0,
                    }} />
                    <span style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: checked ? '#1C1C1E' : '#8E8E93',
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {cal.summary}{cal.primary ? ' (Primary)' : ''}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Select all / none */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 20 }}>
              <button
                type="button"
                onClick={() => setSelected(new Set(calendars.map(c => c.id)))}
                style={{ fontSize: 11, fontWeight: 500, color: '#4285F4', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Select all
              </button>
              <span style={{ color: 'rgba(0,0,0,0.15)' }}>|</span>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                style={{ fontSize: 11, fontWeight: 500, color: '#8E8E93', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Select none
              </button>
            </div>

            {/* Sync mode selection */}
            <div style={{ marginBottom: 20 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#1C1C1E', marginBottom: 10, textAlign: 'left' }}>
                What would you like to import?
              </p>
              {SYNC_MODE_OPTIONS.map(({ mode, title, desc }) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setSyncMode(mode)}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: syncMode === mode ? '1.5px solid #4285F4' : '1px solid rgba(0,0,0,0.08)',
                    backgroundColor: syncMode === mode ? 'rgba(66,133,244,0.04)' : '#FFFFFF',
                    cursor: 'pointer',
                    marginBottom: 6,
                    transition: 'all 0.15s',
                    textAlign: 'left',
                  }}
                >
                  {/* Radio */}
                  <div style={{
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    border: syncMode === mode ? '2px solid #4285F4' : '2px solid rgba(0,0,0,0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    marginTop: 1,
                    transition: 'all 0.15s',
                  }}>
                    {syncMode === mode && (
                      <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#4285F4' }} />
                    )}
                  </div>
                  <div>
                    <span style={{ fontSize: 12, fontWeight: 500, color: syncMode === mode ? '#1C1C1E' : '#3A3A3C' }}>
                      {title}
                    </span>
                    <p style={{ fontSize: 10, color: '#8E8E93', lineHeight: 1.4, marginTop: 2 }}>{desc}</p>
                  </div>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleImport}
              disabled={selected.size === 0}
              style={{
                width: '100%',
                padding: '10px 0',
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 600,
                color: '#FFFFFF',
                backgroundColor: selected.size === 0 ? '#C7C7CC' : '#4285F4',
                border: 'none',
                cursor: selected.size === 0 ? 'default' : 'pointer',
                transition: 'background-color 0.15s',
              }}
            >
              Import {selected.size} calendar{selected.size !== 1 ? 's' : ''}
            </button>
          </>
        )}

        {status === 'importing' && (
          <>
            <div style={{ fontSize: 32, marginBottom: 12 }}>&#128197;</div>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: '#4285F4', margin: '0 0 8px' }}>
              Importing events...
            </h2>
            <p style={{ fontSize: 13, color: '#8E8E93' }}>Fetching your Google Calendar events.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div style={{ fontSize: 32, marginBottom: 12 }}>&#10003;</div>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: '#34C759', margin: '0 0 8px' }}>
              Imported {importCount} events!
            </h2>
            <p style={{ fontSize: 13, color: '#8E8E93' }}>Redirecting back to Timebox...</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div style={{ fontSize: 32, marginBottom: 12 }}>&#10007;</div>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: '#FF3B30', margin: '0 0 8px' }}>
              Connection failed
            </h2>
            <p style={{ fontSize: 13, color: '#8E8E93', marginBottom: 16 }}>{errorMsg}</p>
            <button
              onClick={() => { window.location.href = '/'; }}
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: '#4285F4',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Back to Timebox
            </button>
          </>
        )}
      </div>
    </div>
  );
}
