import React, { useEffect, useState } from 'react';
import { exchangeGoogleCode } from '../services/googleCalendar';

export function GcalCallbackPage({ code }: { code: string }) {
  const [status, setStatus] = useState<'exchanging' | 'success' | 'error'>('exchanging');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    (async () => {
      try {
        await exchangeGoogleCode(code);
        setStatus('success');
        // Redirect back to app after short delay
        setTimeout(() => {
          window.location.href = '/';
        }, 1500);
      } catch (err) {
        setStatus('error');
        setErrorMsg(err instanceof Error ? err.message : 'Unknown error');
      }
    })();
  }, [code]);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#FDFDFB',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      <div style={{
        textAlign: 'center',
        padding: 40,
        borderRadius: 16,
        backgroundColor: '#FFFFFF',
        border: '1px solid rgba(0,0,0,0.08)',
        maxWidth: 360,
      }}>
        {status === 'exchanging' && (
          <>
            <div style={{ fontSize: 32, marginBottom: 12 }}>&#9881;</div>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: '#1C1C1E', margin: '0 0 8px' }}>
              Connecting Google Calendar...
            </h2>
            <p style={{ fontSize: 13, color: '#8E8E93' }}>Please wait while we finish setup.</p>
          </>
        )}
        {status === 'success' && (
          <>
            <div style={{ fontSize: 32, marginBottom: 12 }}>&#10003;</div>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: '#34C759', margin: '0 0 8px' }}>
              Connected!
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
