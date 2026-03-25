import { useEffect, useState, useRef } from 'react';

/**
 * Checks for app updates on launch (desktop only).
 * Uses Tauri's updater plugin — no-ops gracefully in the browser.
 */
export default function UpdateChecker() {
  const [status, setStatus] = useState<'idle' | 'available' | 'downloading' | 'done' | 'error'>('idle');
  const [version, setVersion] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [dismissed, setDismissed] = useState(false);
  const updateRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;

    async function checkForUpdate() {
      try {
        const { check } = await import('@tauri-apps/plugin-updater');
        const update = await check();
        if (cancelled || !update) return;

        setVersion(update.version);
        setStatus('available');
        updateRef.current = update;
      } catch {
        // Not in Tauri or no update — silently ignore
      }
    }

    checkForUpdate();
    return () => { cancelled = true; };
  }, []);

  async function handleInstall() {
    const update = updateRef.current;
    if (!update) return;

    setStatus('downloading');
    setErrorMsg('');

    try {
      await update.downloadAndInstall();
    } catch (e: any) {
      const msg = e?.message || String(e) || 'Download failed';
      console.error('[UpdateChecker] downloadAndInstall failed:', e);
      setErrorMsg(msg);
      setStatus('error');
      return;
    }

    setStatus('done');

    try {
      // Tell Rust to allow the close event through (bypasses the hide-on-close handler)
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('set_relaunching').catch(() => {}); // best-effort
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch (e: any) {
      // relaunch failed — update is installed but the app didn't restart
      const msg = e?.message || String(e) || 'Relaunch failed';
      console.error('[UpdateChecker] relaunch failed:', e);
      setErrorMsg(`Update installed, but restart failed: ${msg}. Please quit and reopen the app.`);
      setStatus('error');
    }
  }

  if (status === 'idle' || dismissed) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        zIndex: 9999,
        background: '#1C1C1E',
        color: '#fff',
        borderRadius: 10,
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        fontSize: 13,
        fontWeight: 500,
        boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
        maxWidth: 400,
      }}
    >
      {status === 'done' ? (
        <span>Restarting...</span>
      ) : status === 'downloading' ? (
        <span>Downloading update...</span>
      ) : status === 'error' ? (
        <>
          <span style={{ flex: 1, color: '#FF6B6B', fontSize: 12, lineHeight: '1.4' }}>
            {errorMsg}
          </span>
          <button
            onClick={handleInstall}
            style={{
              background: '#8DA286',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '6px 14px',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            Retry
          </button>
          <button
            onClick={() => setDismissed(true)}
            style={{
              background: 'transparent',
              color: '#8E8E93',
              border: 'none',
              cursor: 'pointer',
              fontSize: 16,
              padding: '0 4px',
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </>
      ) : (
        <>
          <span style={{ flex: 1 }}>
            v{version} is available
          </span>
          <button
            onClick={handleInstall}
            style={{
              background: '#8DA286',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '6px 14px',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            Update
          </button>
          <button
            onClick={() => setDismissed(true)}
            style={{
              background: 'transparent',
              color: '#8E8E93',
              border: 'none',
              cursor: 'pointer',
              fontSize: 16,
              padding: '0 4px',
            }}
          >
            ×
          </button>
        </>
      )}
    </div>
  );
}
