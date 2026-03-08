import { useEffect, useState } from 'react';

/**
 * Checks for app updates on launch (desktop only).
 * Uses Tauri's updater plugin — no-ops gracefully in the browser.
 */
export default function UpdateChecker() {
  const [status, setStatus] = useState<'idle' | 'available' | 'downloading' | 'done'>('idle');
  const [version, setVersion] = useState('');
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function checkForUpdate() {
      try {
        const { check } = await import('@tauri-apps/plugin-updater');
        const update = await check();
        if (cancelled || !update) return;

        setVersion(update.version);
        setStatus('available');

        // Store the update handle so user can trigger install
        (window as any).__tauriUpdate = update;
      } catch {
        // Not in Tauri or no update — silently ignore
      }
    }

    checkForUpdate();
    return () => { cancelled = true; };
  }, []);

  async function handleInstall() {
    const update = (window as any).__tauriUpdate;
    if (!update) return;

    setStatus('downloading');
    try {
      await update.downloadAndInstall();
      setStatus('done');
      // Tauri will prompt to relaunch automatically
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch {
      setStatus('available'); // Let user retry
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
        maxWidth: 360,
      }}
    >
      {status === 'done' ? (
        <span>Restarting...</span>
      ) : status === 'downloading' ? (
        <span>Downloading update...</span>
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
