import React, { useState, useEffect } from 'react';

type Platform = 'mac' | 'windows' | 'linux' | 'unknown';

function detectPlatform(): Platform {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('mac')) return 'mac';
  if (ua.includes('win')) return 'windows';
  if (ua.includes('linux')) return 'linux';
  return 'unknown';
}

const REPO = 'wangshei/Timebox';

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

interface ReleaseInfo {
  tag_name: string;
  assets: ReleaseAsset[];
}

function formatSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(0)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
}

function getDownloads(assets: ReleaseAsset[]) {
  const find = (pattern: string) => assets.find(a => a.name.includes(pattern) && !a.name.endsWith('.sig'));
  return {
    macDmg: find('aarch64.dmg'),
    windowsExe: find('x64-setup.exe'),
    windowsMsi: find('x64_en-US.msi'),
    linuxAppImage: find('AppImage'),
    linuxDeb: find('amd64.deb'),
    linuxRpm: find('x86_64.rpm'),
  };
}

export function DesktopPage() {
  const [platform] = useState<Platform>(detectPlatform);
  const [release, setRelease] = useState<ReleaseInfo | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    fetch(`https://api.github.com/repos/${REPO}/releases/latest`)
      .then(r => r.json())
      .then(data => {
        if (data.tag_name && data.assets) setRelease(data);
      })
      .catch(() => {});
  }, []);

  const downloads = release ? getDownloads(release.assets) : null;
  const version = release?.tag_name?.replace('v', '') || '';

  const primaryDownload = downloads
    ? platform === 'windows'
      ? downloads.windowsExe
      : platform === 'linux'
        ? downloads.linuxAppImage
        : downloads.macDmg
    : null;

  const primaryLabel = platform === 'windows'
    ? 'Download for Windows'
    : platform === 'linux'
      ? 'Download for Linux'
      : 'Download for macOS';

  const primarySublabel = primaryDownload
    ? `${primaryDownload.name} · ${formatSize(primaryDownload.size)}`
    : '';

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
      <div style={{ width: 520, maxWidth: '100%' }}>
        {/* Title */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: '#1C1C1E', margin: '0 0 8px' }}>
            The Timeboxing Club
          </h1>
          <p style={{ fontSize: 15, color: '#8E8E93', margin: 0 }}>
            Download the desktop app for a native experience.
          </p>
        </div>

        {/* Card */}
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
          {/* Primary download button */}
          {primaryDownload ? (
            <a
              href={primaryDownload.browser_download_url}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                width: '100%',
                height: 52,
                borderRadius: 12,
                fontSize: 16,
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                backgroundColor: '#8DA387',
                color: '#FFFFFF',
                textDecoration: 'none',
                transition: 'background-color 200ms',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#7A9076')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#8DA387')}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M9 3v9m0 0l-3.5-3.5M9 12l3.5-3.5M4 15h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {primaryLabel}
            </a>
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                height: 52,
                borderRadius: 12,
                fontSize: 15,
                fontWeight: 500,
                backgroundColor: '#F5F4F0',
                color: '#8E8E93',
              }}
            >
              Loading...
            </div>
          )}

          {/* Version + file info */}
          {version && (
            <p style={{ fontSize: 12, color: '#AEAEB2', margin: '10px 0 0', textAlign: 'center', lineHeight: 1.4 }}>
              v{version} · {primarySublabel}
            </p>
          )}

          {/* Other platforms toggle */}
          <div style={{ textAlign: 'center', marginTop: 20 }}>
            <button
              onClick={() => setShowAll(!showAll)}
              style={{
                fontSize: 13,
                color: '#8DA286',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'color 200ms',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#7A9278')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#8DA286')}
            >
              {showAll ? 'Hide other platforms' : 'Other platforms'}
            </button>
          </div>

          {/* All platforms */}
          {showAll && downloads && (
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <PlatformSection title="macOS" assets={[
                downloads.macDmg && { label: 'Apple Silicon (.dmg)', asset: downloads.macDmg },
              ].filter(Boolean) as AssetLink[]} />
              <PlatformSection title="Windows" assets={[
                downloads.windowsExe && { label: 'Installer (.exe)', asset: downloads.windowsExe },
                downloads.windowsMsi && { label: 'MSI (.msi)', asset: downloads.windowsMsi },
              ].filter(Boolean) as AssetLink[]} />
              <PlatformSection title="Linux" assets={[
                downloads.linuxAppImage && { label: 'AppImage', asset: downloads.linuxAppImage },
                downloads.linuxDeb && { label: 'Debian (.deb)', asset: downloads.linuxDeb },
                downloads.linuxRpm && { label: 'RPM (.rpm)', asset: downloads.linuxRpm },
              ].filter(Boolean) as AssetLink[]} />
            </div>
          )}

          {/* macOS note */}
          <div style={{
            marginTop: 24,
            padding: '12px 14px',
            borderRadius: 10,
            backgroundColor: 'rgba(141,162,134,0.08)',
            border: '1px solid rgba(141,162,134,0.15)',
          }}>
            <p style={{ fontSize: 12, color: '#636366', margin: 0, lineHeight: 1.6 }}>
              <strong style={{ color: '#3A3A3C' }}>macOS note:</strong> If you see "Apple cannot check it for malicious software", right-click the app and select <strong>Open</strong>, then click <strong>Open</strong> again to bypass Gatekeeper.
            </p>
          </div>

          {/* Back to web */}
          <div style={{ textAlign: 'center', marginTop: 20 }}>
            <a
              href="/"
              style={{
                fontSize: 13,
                color: '#8DA286',
                textDecoration: 'none',
                transition: 'color 200ms',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#7A9278')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#8DA286')}
            >
              ← Back to web app
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

interface AssetLink {
  label: string;
  asset: ReleaseAsset;
}

function PlatformSection({ title, assets }: { title: string; assets: AssetLink[] }) {
  if (assets.length === 0) return null;
  return (
    <div style={{
      padding: '12px 14px',
      borderRadius: 10,
      backgroundColor: '#F5F4F0',
      border: '1px solid rgba(0,0,0,0.05)',
    }}>
      <p style={{ fontSize: 12, fontWeight: 600, color: '#3A3A3C', margin: '0 0 6px' }}>{title}</p>
      {assets.map(({ label, asset }) => (
        <a
          key={asset.name}
          href={asset.browser_download_url}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 0',
            fontSize: 13,
            color: '#1C1C1E',
            textDecoration: 'none',
            transition: 'color 200ms',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#8DA286')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#1C1C1E')}
        >
          <span>{label}</span>
          <span style={{ fontSize: 11, color: '#AEAEB2' }}>{formatSize(asset.size)}</span>
        </a>
      ))}
    </div>
  );
}
