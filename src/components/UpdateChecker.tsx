import { useEffect, useState, useRef } from 'react';

const CURRENT_VERSION_KEY = 'timebox_app_version';
const WHATS_NEW_DISMISSED_KEY = 'timebox_whats_new_dismissed';

/**
 * Checks for app updates on launch (desktop only).
 * Also shows "What's new" after a successful update.
 */
export default function UpdateChecker() {
  const [status, setStatus] = useState<'idle' | 'available' | 'downloading' | 'done' | 'error'>('idle');
  const [version, setVersion] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [dismissed, setDismissed] = useState(false);
  const [whatsNew, setWhatsNew] = useState<{ version: string; notes: string } | null>(null);
  const updateRef = useRef<any>(null);

  // Detect if the app just updated — show "what's new"
  useEffect(() => {
    async function detectVersionChange() {
      try {
        const { getVersion } = await import('@tauri-apps/api/app');
        const currentVersion = await getVersion();
        const previousVersion = localStorage.getItem(CURRENT_VERSION_KEY);
        const whatsNewDismissed = localStorage.getItem(WHATS_NEW_DISMISSED_KEY);

        // Always store current version
        localStorage.setItem(CURRENT_VERSION_KEY, currentVersion);

        // Show "what's new" if version changed and not already dismissed
        if (previousVersion && previousVersion !== currentVersion && whatsNewDismissed !== currentVersion) {
          // Fetch release notes from GitHub
          try {
            const res = await fetch(`https://api.github.com/repos/wangshei/Timebox/releases/tags/v${currentVersion}`);
            if (res.ok) {
              const data = await res.json();
              const notes = data.body || `Updated to v${currentVersion}`;
              setWhatsNew({ version: currentVersion, notes });
            } else {
              setWhatsNew({ version: currentVersion, notes: `Successfully updated to v${currentVersion}.` });
            }
          } catch {
            setWhatsNew({ version: currentVersion, notes: `Successfully updated to v${currentVersion}.` });
          }
        }
      } catch {
        // Not in Tauri — ignore
      }
    }
    detectVersionChange();
  }, []);

  // Check for new updates
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
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('set_relaunching').catch(() => {});
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch (e: any) {
      const msg = e?.message || String(e) || 'Relaunch failed';
      console.error('[UpdateChecker] relaunch failed:', e);
      setErrorMsg(`Update installed, but restart failed: ${msg}. Please quit and reopen the app.`);
      setStatus('error');
    }
  }

  function dismissWhatsNew() {
    if (whatsNew) {
      localStorage.setItem(WHATS_NEW_DISMISSED_KEY, whatsNew.version);
    }
    setWhatsNew(null);
  }

  // "What's new" toast after update
  if (whatsNew && status === 'idle') {
    // Clean up markdown: strip headers/bold for a compact display
    const cleanNotes = whatsNew.notes
      .replace(/^#+\s*/gm, '')
      .replace(/\*\*/g, '')
      .split('\n')
      .filter(l => l.trim())
      .slice(0, 6) // max 6 lines
      .join('\n');

    return (
      <div
        style={{
          position: 'fixed',
          bottom: 16,
          right: 16,
          zIndex: 9999,
          background: '#FFFFFF',
          color: '#1C1C1E',
          borderRadius: 12,
          padding: '16px 20px',
          boxShadow: '0 4px 24px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.06)',
          maxWidth: 360,
          minWidth: 280,
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#8DA286' }} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>Updated to v{whatsNew.version}</span>
          </div>
          <button
            onClick={dismissWhatsNew}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: '#8E8E93',
              fontSize: 16,
              padding: '0 2px',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
        <div
          style={{
            fontSize: 12,
            lineHeight: '1.5',
            color: '#636366',
            whiteSpace: 'pre-line',
            maxHeight: 120,
            overflowY: 'auto',
          }}
        >
          {cleanNotes}
        </div>
        <button
          onClick={dismissWhatsNew}
          style={{
            marginTop: 12,
            width: '100%',
            padding: '8px 0',
            borderRadius: 8,
            border: 'none',
            backgroundColor: '#8DA286',
            color: '#FFFFFF',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Got it
        </button>
      </div>
    );
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
        <span>Downloading v{version}...</span>
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
