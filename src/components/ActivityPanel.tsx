import React, { useState, useEffect, useCallback } from 'react';
import {
  isTauri,
  startTracking,
  stopTracking,
  isTracking as checkIsTracking,
  getActivitySummary,
  getActivityLog,
  getSwitchCount,
  checkAccessibility,
  CategorySummary,
  ActivityEntry,
} from '../services/desktopActivity';

const LS_SHOW_ACTIVITY = 'timebox_show_activity_blocks';
const LS_EXCLUDED_APPS = 'timebox_excluded_apps';

function getExcludedApps(): string[] {
  try {
    const raw = localStorage.getItem(LS_EXCLUDED_APPS) || '';
    return raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  } catch { return []; }
}

function filterExcludedFromSummary(summary: CategorySummary[], excluded: string[]): CategorySummary[] {
  if (excluded.length === 0) return summary;
  return summary.map(cat => ({
    ...cat,
    app_details: cat.app_details.filter(a => !excluded.includes(a.app_name.toLowerCase())),
    total_minutes: cat.app_details
      .filter(a => !excluded.includes(a.app_name.toLowerCase()))
      .reduce((s, a) => s + a.minutes, 0),
  })).filter(cat => cat.app_details.length > 0);
}

function filterExcludedFromEntries(entries: ActivityEntry[], excluded: string[]): ActivityEntry[] {
  if (excluded.length === 0) return entries;
  return entries.filter(e => !excluded.includes(e.app_name.toLowerCase()));
}

const CATEGORY_COLORS: Record<string, string> = {
  Coding: '#8DA286',
  'AI Agent': '#B07CD8',
  'AI Agent (working)': '#9B59B6',
  'AI Agent (you)': '#C39BD3',
  Communication: '#6B9BD2',
  Browsing: '#D4A574',
  Design: '#C27BA0',
  Writing: '#9B8EC0',
  Productivity: '#F5A623',
  Entertainment: '#E8806A',
  Music: '#5BBFBF',
  System: '#A0A0A0',
  Other: '#C0C0C0',
};

function formatDuration(minutes: number): string {
  if (minutes < 1) return '<1m';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

interface ActivityPanelProps {
  selectedDate: string; // YYYY-MM-DD
  onClose: () => void;
  onShowInCalendarChange?: (show: boolean) => void;
}

export default function ActivityPanel({ selectedDate, onClose, onShowInCalendarChange }: ActivityPanelProps) {
  const [tracking, setTracking] = useState(false);
  const [summary, setSummary] = useState<CategorySummary[]>([]);
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [switchCount, setSwitchCount] = useState(0);
  const [hasAccessibility, setHasAccessibility] = useState<boolean | null>(null);
  const [viewMode, setViewMode] = useState<'summary' | 'timeline'>('summary');
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<number>(Date.now());
  const [secondsAgo, setSecondsAgo] = useState(0);
  const [showInCalendar, setShowInCalendar] = useState(() => localStorage.getItem(LS_SHOW_ACTIVITY) === 'true');
  const [excludedAppsText, setExcludedAppsText] = useState(() => localStorage.getItem(LS_EXCLUDED_APPS) || '');
  const [showPrivacy, setShowPrivacy] = useState(false);
  const excludedApps = getExcludedApps();

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      // Load core data first — these must succeed
      const [summaryData, entriesData, trackingStatus] = await Promise.all([
        getActivitySummary(selectedDate),
        getActivityLog(selectedDate, selectedDate),
        checkIsTracking(),
      ]);
      setSummary(summaryData);
      setEntries(entriesData);
      setTracking(trackingStatus);
      setLastUpdated(Date.now());

      // Load optional data — don't let failures block the panel
      try { setSwitchCount(await getSwitchCount(selectedDate)); } catch { /* ignore */ }
      try { setHasAccessibility(await checkAccessibility()); } catch { /* ignore */ }
    } catch (err) {
      console.error('[activity] Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Poll when tracking is active — first refresh at 10s, then every 10s
  useEffect(() => {
    if (!tracking) return;
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, [tracking, loadData]);

  // Update "X seconds ago" ticker every 5s while tracking
  useEffect(() => {
    if (!tracking) { setSecondsAgo(0); return; }
    const tick = () => setSecondsAgo(Math.floor((Date.now() - lastUpdated) / 1000));
    tick();
    const interval = setInterval(tick, 5000);
    return () => clearInterval(interval);
  }, [tracking, lastUpdated]);

  const handleToggleTracking = async () => {
    try {
      if (tracking) {
        await stopTracking();
        setTracking(false);
        setTimeout(loadData, 500);
      } else {
        await startTracking();
        setTracking(true);
        // Reload after first flush so data appears quickly
        setTimeout(loadData, 35000);
      }
    } catch (err) {
      console.error('[activity] Tracking toggle failed:', err);
      // Re-sync state with backend
      try {
        const actual = await checkIsTracking();
        setTracking(actual);
      } catch { /* ignore */ }
    }
  };

  const handleToggleShowInCalendar = () => {
    const next = !showInCalendar;
    setShowInCalendar(next);
    localStorage.setItem(LS_SHOW_ACTIVITY, String(next));
    onShowInCalendarChange?.(next);
  };

  const handleExcludedAppsChange = (text: string) => {
    setExcludedAppsText(text);
    localStorage.setItem(LS_EXCLUDED_APPS, text);
  };

  const handleExportCSV = () => {
    const rows = [['App', 'Category', 'Start', 'End', 'Duration (min)']];
    for (const e of filteredEntries) {
      rows.push([
        e.app_name,
        e.category,
        new Date(e.start_time).toLocaleString(),
        new Date(e.end_time).toLocaleString(),
        (e.duration_secs / 60).toFixed(1),
      ]);
    }
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `activity-${selectedDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Apply privacy filters
  const filteredSummary = filterExcludedFromSummary(summary, excludedApps);
  const filteredEntries = filterExcludedFromEntries(entries, excludedApps);
  const totalMinutes = filteredSummary.reduce((sum, s) => sum + s.total_minutes, 0);

  // Idle detection: check if latest entry is >5min old while tracking
  const idleMinutes = (() => {
    if (!tracking || filteredEntries.length === 0) return 0;
    const latest = new Date(filteredEntries[0]?.end_time).getTime();
    const gap = (Date.now() - latest) / 60000;
    return gap > 5 ? Math.floor(gap) : 0;
  })();

  if (!isTauri()) {
    return (
      <div className="flex flex-col h-full" style={{ backgroundColor: '#FCFBF7' }}>
        <div className="flex items-center justify-between px-4 py-2.5 flex-shrink-0" style={{ borderBottom: '1px solid rgba(0,0,0,0.09)' }}>
          <span className="text-base font-semibold" style={{ color: '#1C1C1E' }}>Activity</span>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-black/5">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1l12 12M13 1L1 13" stroke="#8E8E93" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center px-6 text-center">
          <p style={{ color: '#8E8E93', fontSize: 13 }}>
            Screen activity tracking is only available in the desktop app.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: '#FCFBF7' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 flex-shrink-0" style={{ borderBottom: '1px solid rgba(0,0,0,0.09)' }}>
        <span className="text-base font-semibold" style={{ color: '#1C1C1E' }}>Activity</span>
        <div className="flex items-center gap-1">
          {filteredEntries.length > 0 && (
            <button
              type="button"
              onClick={handleExportCSV}
              className="p-1 rounded hover:bg-black/5"
              title="Export as CSV"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 1v8M7 9L4 6M7 9l3-3" stroke="#8E8E93" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M2 10v2h10v-2" stroke="#8E8E93" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-black/5">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1l12 12M13 1L1 13" stroke="#8E8E93" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3" style={{ scrollbarWidth: 'thin' }}>
        {/* Tracking toggle */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: tracking ? '#34C759' : '#C7C7CC' }}
            />
            <span style={{ fontSize: 12, color: '#3A3A3C', fontWeight: 500 }}>
              {tracking ? 'Tracking active' : 'Tracking paused'}
            </span>
          </div>
          <button
            type="button"
            onClick={handleToggleTracking}
            className="px-3 py-1 rounded-full text-white transition-colors"
            style={{
              fontSize: 11,
              fontWeight: 600,
              backgroundColor: tracking ? '#FF3B30' : '#8DA286',
            }}
          >
            {tracking ? 'Stop' : 'Start'}
          </button>
        </div>

        {/* Last updated indicator */}
        {tracking && secondsAgo > 0 && (
          <div style={{ fontSize: 10, color: '#AEAEB2', marginTop: -8, marginBottom: 8 }}>
            Last updated {secondsAgo}s ago
          </div>
        )}

        {/* Idle warning */}
        {idleMinutes > 0 && (
          <div className="mb-3 px-3 py-2 rounded-lg" style={{ backgroundColor: 'rgba(255,204,0,0.1)', border: '1px solid rgba(255,204,0,0.25)' }}>
            <p style={{ fontSize: 11, fontWeight: 500, color: '#8B7400', margin: 0 }}>
              No activity detected for {idleMinutes} minute{idleMinutes !== 1 ? 's' : ''}
            </p>
          </div>
        )}

        {/* Show in calendar toggle */}
        <div className="flex items-center justify-between mb-3">
          <label style={{ fontSize: 11, color: '#3A3A3C', cursor: 'pointer' }} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={showInCalendar}
              onChange={handleToggleShowInCalendar}
              style={{ accentColor: '#8DA286', width: 13, height: 13 }}
            />
            Show activity in calendar
          </label>
        </div>

        {/* Privacy controls */}
        <div className="mb-3">
          <button
            type="button"
            onClick={() => setShowPrivacy(!showPrivacy)}
            className="flex items-center gap-1"
            style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.09em', textTransform: 'uppercase' as const, color: '#8E8E93', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none" style={{ transform: showPrivacy ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>
              <path d="M2 1l4 3-4 3" stroke="#8E8E93" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Privacy
            {excludedApps.length > 0 && (
              <span style={{ fontSize: 10, fontWeight: 400, color: '#AEAEB2', textTransform: 'none', letterSpacing: 'normal' }}>
                — {excludedApps.length} app{excludedApps.length !== 1 ? 's' : ''} hidden
              </span>
            )}
          </button>
          {showPrivacy && (
            <div className="mt-2">
              <label style={{ fontSize: 11, color: '#8E8E93', display: 'block', marginBottom: 4 }}>
                Exclude apps (comma-separated)
              </label>
              <input
                type="text"
                value={excludedAppsText}
                onChange={(e) => handleExcludedAppsChange(e.target.value)}
                placeholder="e.g. Messages, Slack"
                style={{
                  width: '100%',
                  fontSize: 11,
                  padding: '5px 8px',
                  borderRadius: 6,
                  border: '1px solid rgba(0,0,0,0.1)',
                  backgroundColor: '#fff',
                  color: '#1C1C1E',
                  outline: 'none',
                }}
              />
            </div>
          )}
        </div>

        {/* Accessibility permission warning */}
        {tracking && hasAccessibility === false && (
          <div className="mb-3 px-3 py-2.5 rounded-lg" style={{ backgroundColor: 'rgba(255,149,0,0.1)', border: '1px solid rgba(255,149,0,0.2)' }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#E65100', margin: '0 0 4px' }}>Accessibility permission required</p>
            <p style={{ fontSize: 11, color: '#8E8E93', margin: '0 0 6px', lineHeight: 1.5 }}>
              The app needs permission to see which window is active. Go to:
            </p>
            <p style={{ fontSize: 11, color: '#3A3A3C', margin: 0, fontWeight: 500, lineHeight: 1.5 }}>
              System Settings → Privacy & Security → Accessibility → enable The Timeboxing Club
            </p>
          </div>
        )}

        {/* Total time + switch count */}
        {totalMinutes > 0 && (
          <div className="mb-4 flex items-end gap-6">
            <div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#1C1C1E', lineHeight: 1 }}>
                {formatDuration(totalMinutes)}
              </div>
              <div style={{ fontSize: 11, color: '#8E8E93', marginTop: 2 }}>total screen time</div>
            </div>
            {switchCount > 0 && (
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#1C1C1E', lineHeight: 1 }}>
                  {switchCount}
                </div>
                <div style={{ fontSize: 11, color: '#8E8E93', marginTop: 2 }}>switches</div>
              </div>
            )}
          </div>
        )}

        {/* Recording since / last recorded */}
        {entries.length > 0 && (
          <div style={{ fontSize: 10, color: '#AEAEB2', marginBottom: 10, marginTop: -8 }}>
            {tracking
              ? `Recording since ${new Date(entries[entries.length - 1]?.start_time || entries[0]?.start_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
              : `Last recorded ${new Date(entries[0]?.end_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
            }
          </div>
        )}

        {/* View toggle */}
        <div className="flex gap-1 mb-3 p-0.5 rounded-lg" style={{ backgroundColor: 'rgba(0,0,0,0.05)' }}>
          {(['summary', 'timeline'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className="flex-1 py-1 rounded-md transition-all"
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: viewMode === mode ? '#1C1C1E' : '#8E8E93',
                backgroundColor: viewMode === mode ? '#fff' : 'transparent',
                boxShadow: viewMode === mode ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              {mode === 'summary' ? 'Summary' : 'Timeline'}
            </button>
          ))}
        </div>

        {loading && summary.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <div className="flex gap-1.5">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: '50%',
                    backgroundColor: '#8DA286',
                    animation: 'activityDotPulse 1.2s ease-in-out infinite',
                    animationDelay: `${i * 0.2}s`,
                  }}
                />
              ))}
            </div>
            <style>{`
              @keyframes activityDotPulse {
                0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
                40% { opacity: 1; transform: scale(1); }
              }
            `}</style>
          </div>
        ) : viewMode === 'summary' ? (
          <SummaryView summary={filteredSummary} totalMinutes={totalMinutes} />
        ) : (
          <TimelineView entries={filteredEntries} />
        )}
      </div>
    </div>
  );
}

function SummaryView({ summary, totalMinutes }: { summary: CategorySummary[]; totalMinutes: number }) {
  if (summary.length === 0) {
    return (
      <div className="text-center py-8">
        <p style={{ fontSize: 12, color: '#8E8E93' }}>No activity recorded on this date.</p>
        <p style={{ fontSize: 11, color: '#AEAEB2', marginTop: 4 }}>Start tracking to see your screen time breakdown.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Category bar chart */}
      <div className="flex rounded-lg overflow-hidden h-3">
        {summary.map((cat) => (
          <div
            key={cat.category}
            style={{
              width: `${(cat.total_minutes / totalMinutes) * 100}%`,
              backgroundColor: CATEGORY_COLORS[cat.category] || '#C0C0C0',
              minWidth: 4,
            }}
          />
        ))}
      </div>

      {/* Category list */}
      {summary.map((cat) => (
        <div key={cat.category}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <div
                className="w-2.5 h-2.5 rounded-sm"
                style={{ backgroundColor: CATEGORY_COLORS[cat.category] || '#C0C0C0' }}
              />
              <span style={{ fontSize: 12, fontWeight: 500, color: '#1C1C1E' }}>{cat.category}</span>
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#3A3A3C' }}>
              {formatDuration(cat.total_minutes)}
            </span>
          </div>
          {/* App details */}
          <div className="pl-5 space-y-0.5">
            {cat.app_details.map((app) => (
              <div key={app.app_name} className="flex items-center justify-between">
                <span style={{ fontSize: 11, color: '#8E8E93' }}>{app.app_name}</span>
                <span style={{ fontSize: 11, color: '#AEAEB2' }}>{formatDuration(app.minutes)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Merge consecutive entries of the same app (within 60s gap) into single rows. */
function mergeConsecutiveEntries(entries: ActivityEntry[]): ActivityEntry[] {
  if (entries.length === 0) return [];
  const merged: ActivityEntry[] = [{ ...entries[0] }];
  for (let i = 1; i < entries.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = entries[i];
    const gap = (new Date(curr.start_time).getTime() - new Date(prev.end_time).getTime()) / 1000;
    if (curr.app_name === prev.app_name && curr.category === prev.category && gap <= 60) {
      // Extend previous entry
      prev.end_time = curr.end_time;
      prev.duration_secs += curr.duration_secs;
    } else {
      merged.push({ ...curr });
    }
  }
  return merged;
}

function TimelineView({ entries }: { entries: ActivityEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="text-center py-8">
        <p style={{ fontSize: 12, color: '#8E8E93' }}>No activity recorded on this date.</p>
      </div>
    );
  }

  const merged = mergeConsecutiveEntries(entries);

  // Group entries by hour for time markers
  const hourGroups: { hour: string; entries: typeof merged }[] = [];
  let currentHourLabel = '';
  for (const entry of merged) {
    const d = new Date(entry.start_time);
    const hourLabel = d.toLocaleTimeString([], { hour: 'numeric', hour12: true }); // e.g. "1 PM"
    if (hourLabel !== currentHourLabel) {
      hourGroups.push({ hour: hourLabel, entries: [entry] });
      currentHourLabel = hourLabel;
    } else {
      hourGroups[hourGroups.length - 1].entries.push(entry);
    }
  }

  return (
    <div>
      {hourGroups.map((group, gi) => (
        <div key={gi}>
          {/* Hour marker */}
          <div className="flex items-center gap-2" style={{ marginTop: gi === 0 ? 0 : 12, marginBottom: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: '#8E8E93', minWidth: 42, textAlign: 'right' }}>
              {group.hour}
            </span>
            <div style={{ flex: 1, height: 1, backgroundColor: 'rgba(0,0,0,0.06)' }} />
          </div>

          {/* Entries in this hour */}
          <div style={{ marginLeft: 50 }} className="space-y-1">
            {group.entries.map((entry) => {
              const startMin = new Date(entry.start_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
              const endMin = new Date(entry.end_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
              const color = CATEGORY_COLORS[entry.category] || '#C0C0C0';
              const durationMin = entry.duration_secs / 60;

              return (
                <div
                  key={`${entry.id}-${entry.end_time}`}
                  className="flex items-center gap-2 py-1 px-2 rounded-md"
                  style={{ backgroundColor: 'rgba(0,0,0,0.02)' }}
                >
                  <div
                    className="rounded-full flex-shrink-0"
                    style={{ width: 3, backgroundColor: color, alignSelf: 'stretch', minHeight: 24 }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span
                        className="truncate"
                        style={{ fontSize: 12, fontWeight: 500, color: '#1C1C1E', maxWidth: '60%' }}
                      >
                        {entry.app_name}
                      </span>
                      <span style={{ fontSize: 10, color: '#AEAEB2', flexShrink: 0 }}>
                        {formatDuration(durationMin)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span style={{ fontSize: 10, color: '#8E8E93' }}>{startMin} – {endMin}</span>
                      <span
                        className="px-1.5 rounded-full"
                        style={{ fontSize: 9, color, backgroundColor: `${color}18`, fontWeight: 500, lineHeight: '16px' }}
                      >
                        {entry.category}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
