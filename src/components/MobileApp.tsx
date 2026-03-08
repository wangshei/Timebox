import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { useHistoryStore } from '../store/useHistoryStore';
import { getLocalDateString } from '../utils/dateTime';
import { parseTimeToMinutes } from '../utils/taskHelpers';
import { THEME } from '../constants/colors';
import type { TimeBlock, Task } from '../types';

/** Hook that returns current time in minutes, updating every 30s. */
function useCurrentMinutes(): number {
  const [mins, setMins] = useState(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  });
  useEffect(() => {
    const id = setInterval(() => {
      const d = new Date();
      setMins(d.getHours() * 60 + d.getMinutes());
    }, 30_000);
    return () => clearInterval(id);
  }, []);
  return mins;
}

// ─── Helpers ───────────────────────────────────────────────

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function getCurrentHHMM(): string {
  const now = new Date();
  return `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function addMinutesHHMM(hhmm: string, mins: number): string {
  const total = parseTimeToMinutes(hhmm) + mins;
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function formatTime12(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const hour = h ?? 0;
  const min = m ?? 0;
  const ampm = hour >= 12 ? 'pm' : 'am';
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h12}:${String(min).padStart(2, '0')}${ampm}`;
}

function formatDateHeader(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const today = getLocalDateString();
  const tomorrow = (() => { const t = new Date(); t.setDate(t.getDate() + 1); return getLocalDateString(t); })();
  if (dateStr === today) return 'Today';
  if (dateStr === tomorrow) return 'Tomorrow';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/** Shared card style for consistency */
const CARD_STYLE: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  borderRadius: 12,
  padding: '12px 14px',
  marginBottom: 10,
  boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.03)',
};

// ─── Types ─────────────────────────────────────────────────

type MobileTab = 'now' | 'today' | 'capture' | 'tasks';

interface AgendaItem {
  type: 'block' | 'event';
  id: string;
  title: string;
  start: string;
  end: string;
  color: string;
  confirmationStatus?: TimeBlock['confirmationStatus'];
  taskId?: string | null;
}

// ─── Main Component ────────────────────────────────────────

export function MobileApp() {
  const [activeTab, setActiveTab] = useState<MobileTab>('now');

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: '#FDFDFB' }}>
      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'now' && <NowTab />}
        {activeTab === 'today' && <TodayTab />}
        {activeTab === 'capture' && <CaptureTab />}
        {activeTab === 'tasks' && <TasksTab />}
      </div>

      {/* Bottom tabs */}
      <nav
        className="flex-shrink-0 flex items-stretch"
        style={{
          borderTop: '1px solid rgba(0,0,0,0.08)',
          backgroundColor: '#FCFBF7',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {([
          { id: 'now' as const, label: 'Now', icon: NowIcon },
          { id: 'today' as const, label: 'Today', icon: TodayIcon },
          { id: 'capture' as const, label: 'Capture', icon: CaptureIcon },
          { id: 'tasks' as const, label: 'Tasks', icon: TasksIcon },
        ]).map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 touch-manipulation"
              style={{
                color: isActive ? THEME.primary : '#AEAEB2',
                backgroundColor: 'transparent',
                border: 'none',
                WebkitTapHighlightColor: 'transparent',
                position: 'relative',
              }}
            >
              <Icon active={isActive} />
              <span style={{ fontSize: 10, fontWeight: isActive ? 600 : 400 }}>{label}</span>
              {isActive && (
                <span style={{
                  position: 'absolute',
                  top: 0,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: 20,
                  height: 2,
                  borderRadius: 1,
                  backgroundColor: THEME.primary,
                }} />
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

// ─── Tab Icons ─────────────────────────────────────────────

function NowIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={active ? 0 : 1.8} strokeLinecap="round" strokeLinejoin="round" opacity={active ? 0.9 : 1}>
      {active ? (
        // Filled clock
        <>
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" stroke="#FCFBF7" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        <>
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </>
      )}
    </svg>
  );
}

function TodayIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={active ? 0 : 1.8} strokeLinecap="round" strokeLinejoin="round" opacity={active ? 0.9 : 1}>
      {active ? (
        <>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <line x1="8" y1="2" x2="8" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <line x1="3" y1="10" x2="21" y2="10" stroke="#FCFBF7" strokeWidth="1.5" />
        </>
      ) : (
        <>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </>
      )}
    </svg>
  );
}

function CaptureIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={active ? 0 : 1.8} strokeLinecap="round" strokeLinejoin="round" opacity={active ? 0.9 : 1}>
      {active ? (
        <>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="16" stroke="#FCFBF7" strokeWidth="2" strokeLinecap="round" />
          <line x1="8" y1="12" x2="16" y2="12" stroke="#FCFBF7" strokeWidth="2" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="16" />
          <line x1="8" y1="12" x2="16" y2="12" />
        </>
      )}
    </svg>
  );
}

function TasksIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      {active ? (
        <>
          <path d="M4 6h16" strokeWidth="2.4" />
          <path d="M4 12h16" strokeWidth="2.4" />
          <path d="M4 18h16" strokeWidth="2.4" />
        </>
      ) : (
        <>
          <line x1="8" y1="6" x2="21" y2="6" />
          <line x1="8" y1="12" x2="21" y2="12" />
          <line x1="8" y1="18" x2="21" y2="18" />
          <line x1="3" y1="6" x2="3.01" y2="6" />
          <line x1="3" y1="12" x2="3.01" y2="12" />
          <line x1="3" y1="18" x2="3.01" y2="18" />
        </>
      )}
    </svg>
  );
}

// ─── Shared: Check Icon ────────────────────────────────────

function CheckBadge({ color }: { color: string }) {
  return (
    <span
      className="flex items-center gap-1"
      style={{ fontSize: 11, color, fontWeight: 500 }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </span>
  );
}

// ─── NOW Tab ───────────────────────────────────────────────

function NowTab() {
  const timeBlocks = useStore((s) => s.timeBlocks);
  const events = useStore((s) => s.events);
  const categories = useStore((s) => s.categories);
  const calendarContainers = useStore((s) => s.calendarContainers);
  const activeTimer = useStore((s) => s.activeTimer);
  const addTimeBlock = useStore((s) => s.addTimeBlock);
  const startTimer = useStore((s) => s.startTimer);
  const stopTimer = useStore((s) => s.stopTimer);
  const confirmBlock = useStore((s) => s.confirmBlock);
  const skipBlock = useStore((s) => s.skipBlock);
  const tasks = useStore((s) => s.tasks);
  const updateTask = useStore((s) => s.updateTask);
  const { saveSnapshot } = useHistoryStore();

  const [elapsed, setElapsed] = useState('0:00');
  const [showStartForm, setShowStartForm] = useState(false);
  const [title, setTitle] = useState('');
  const [selectedCalendarId, setSelectedCalendarId] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const today = getLocalDateString();
  const nowMins = useCurrentMinutes();

  // Tick timer
  useEffect(() => {
    if (!activeTimer) { setElapsed('0:00'); return; }
    const tick = () => setElapsed(formatElapsed(Date.now() - activeTimer.startedAt));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [activeTimer]);

  // Build agenda for today
  const todayBlocks = useMemo(() => {
    return timeBlocks
      .filter((b) => b.date === today)
      .sort((a, b) => parseTimeToMinutes(a.start) - parseTimeToMinutes(b.start));
  }, [timeBlocks, today]);

  const todayEvents = useMemo(() => {
    return events
      .filter((e) => e.date === today)
      .sort((a, b) => parseTimeToMinutes(a.start) - parseTimeToMinutes(b.start));
  }, [events, today]);

  // Current block (timer or by time)
  const currentBlock = useMemo(() => {
    if (activeTimer) return todayBlocks.find((b) => b.id === activeTimer.blockId) ?? null;
    return todayBlocks.find((b) => {
      const s = parseTimeToMinutes(b.start);
      const e = parseTimeToMinutes(b.end);
      return nowMins >= s && nowMins < e;
    }) ?? null;
  }, [activeTimer, todayBlocks, nowMins]);

  // Next upcoming items
  const upNext = useMemo(() => {
    const items: AgendaItem[] = [];
    for (const b of todayBlocks) {
      if (parseTimeToMinutes(b.start) > nowMins && b.id !== currentBlock?.id) {
        const cat = categories.find((c) => c.id === b.categoryId);
        items.push({
          type: 'block',
          id: b.id,
          title: b.title ?? 'Untitled',
          start: b.start,
          end: b.end,
          color: cat?.color ?? THEME.primary,
          confirmationStatus: b.confirmationStatus,
          taskId: b.taskId,
        });
      }
    }
    for (const e of todayEvents) {
      if (parseTimeToMinutes(e.start) > nowMins) {
        const cat = categories.find((c) => c.id === e.categoryId);
        items.push({
          type: 'event',
          id: e.id,
          title: e.title,
          start: e.start,
          end: e.end,
          color: cat?.color ?? THEME.primary,
        });
      }
    }
    return items.sort((a, b) => parseTimeToMinutes(a.start) - parseTimeToMinutes(b.start)).slice(0, 4);
  }, [todayBlocks, todayEvents, nowMins, currentBlock, categories]);

  // Past unreviewed blocks
  const pendingReview = useMemo(() => {
    return todayBlocks.filter((b) => {
      const end = parseTimeToMinutes(b.end);
      return end <= nowMins && !b.confirmationStatus;
    });
  }, [todayBlocks, nowMins]);

  const filteredCategories = useMemo(() => {
    if (!selectedCalendarId) return categories;
    return categories.filter((c) => {
      const ids = c.calendarContainerIds;
      if (ids && ids.length > 0) return ids.includes(selectedCalendarId);
      return c.calendarContainerId === selectedCalendarId || !c.calendarContainerId;
    });
  }, [selectedCalendarId, categories]);

  // Auto-select first calendar/category
  useEffect(() => {
    if (showStartForm && calendarContainers.length > 0 && !selectedCalendarId) {
      setSelectedCalendarId(calendarContainers[0].id);
    }
  }, [showStartForm, calendarContainers, selectedCalendarId]);

  useEffect(() => {
    if (!selectedCalendarId) return;
    const first = filteredCategories[0];
    if (first) setSelectedCategoryId(first.id);
  }, [selectedCalendarId, filteredCategories]);

  useEffect(() => {
    if (showStartForm) setTimeout(() => inputRef.current?.focus(), 100);
  }, [showStartForm]);

  const handleConfirm = useCallback((blockId: string) => {
    saveSnapshot();
    confirmBlock(blockId);
    const block = timeBlocks.find((b) => b.id === blockId);
    if (!block?.taskId) return;
    const siblings = timeBlocks.filter((b) => b.taskId === block.taskId && b.id !== blockId);
    if (siblings.every((b) => b.confirmationStatus === 'confirmed')) {
      updateTask(block.taskId, { status: 'done' });
    }
  }, [saveSnapshot, confirmBlock, timeBlocks, updateTask]);

  const handleSkip = useCallback((blockId: string) => {
    saveSnapshot();
    skipBlock(blockId);
  }, [saveSnapshot, skipBlock]);

  const handleStartTimer = useCallback(() => {
    if (!title.trim()) return;
    const cat = categories.find((c) => c.id === selectedCategoryId);
    if (!cat) return;
    const now = getCurrentHHMM();
    const blockId = addTimeBlock({
      title: title.trim(),
      calendarContainerId: selectedCalendarId || (cat.calendarContainerId ?? calendarContainers[0]?.id ?? ''),
      categoryId: cat.id,
      tagIds: [],
      start: now,
      end: addMinutesHHMM(now, 30),
      date: getLocalDateString(),
      mode: 'planned',
      source: 'unplanned',
    });
    if (blockId) {
      startTimer(blockId);
      setShowStartForm(false);
      setTitle('');
    }
  }, [title, selectedCategoryId, selectedCalendarId, categories, calendarContainers, addTimeBlock, startTimer]);

  const currentColor = currentBlock
    ? (categories.find((c) => c.id === currentBlock.categoryId)?.color ?? THEME.primary)
    : THEME.primary;

  // Progress through current block (0-1)
  const blockProgress = useMemo(() => {
    if (!currentBlock) return 0;
    const s = parseTimeToMinutes(currentBlock.start);
    const e = parseTimeToMinutes(currentBlock.end);
    if (e <= s) return 0;
    return Math.min(1, Math.max(0, (nowMins - s) / (e - s)));
  }, [currentBlock, nowMins]);

  const hasAnythingToday = todayBlocks.length > 0 || todayEvents.length > 0;

  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ padding: '24px 16px' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 12, color: '#AEAEB2', fontWeight: 500, margin: 0, letterSpacing: '0.03em' }}>
          {formatDateHeader(today)}
        </p>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: THEME.textPrimary, margin: '2px 0 0' }}>
          {activeTimer ? 'Working on...' : currentBlock ? 'Right now' : 'Nothing right now'}
        </h1>
      </div>

      {/* Current block / Timer card */}
      {(currentBlock || activeTimer) && (
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 16,
            padding: '18px 16px',
            marginBottom: 20,
            borderLeft: `4px solid ${currentColor}`,
            boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
          }}
        >
          <p style={{ fontSize: 17, fontWeight: 600, color: THEME.textPrimary, margin: 0, lineHeight: 1.3 }}>
            {currentBlock?.title ?? 'Timer'}
          </p>
          {currentBlock && (
            <p style={{ fontSize: 12, color: '#AEAEB2', margin: '4px 0 0' }}>
              {formatTime12(currentBlock.start)} – {formatTime12(currentBlock.end)}
            </p>
          )}

          {/* Progress bar */}
          {currentBlock && !activeTimer && (
            <div style={{ marginTop: 12, height: 4, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.05)', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${blockProgress * 100}%`,
                borderRadius: 2,
                backgroundColor: currentColor,
                opacity: 0.6,
                transition: 'width 0.5s ease',
              }} />
            </div>
          )}

          {activeTimer && (
            <div className="flex items-center justify-between" style={{ marginTop: 14 }}>
              <span
                className="font-mono tabular-nums"
                style={{ fontSize: 28, fontWeight: 600, color: currentColor }}
              >
                {elapsed}
              </span>
              <button
                type="button"
                onClick={stopTimer}
                className="touch-manipulation flex items-center gap-1.5"
                style={{
                  padding: '8px 20px',
                  borderRadius: 20,
                  backgroundColor: 'rgba(255,59,48,0.10)',
                  color: '#FF3B30',
                  fontSize: 14,
                  fontWeight: 600,
                  border: 'none',
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2" /></svg>
                Stop
              </button>
            </div>
          )}
        </div>
      )}

      {/* Start timer CTA */}
      {!activeTimer && !showStartForm && (
        <button
          type="button"
          onClick={() => setShowStartForm(true)}
          className="touch-manipulation flex items-center justify-center gap-2"
          style={{
            width: '100%',
            padding: '14px',
            borderRadius: 14,
            backgroundColor: THEME.primary,
            color: '#FFFFFF',
            fontSize: 15,
            fontWeight: 600,
            border: 'none',
            marginBottom: 24,
            boxShadow: '0 2px 8px rgba(141,162,134,0.3)',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
          Start tracking
        </button>
      )}

      {/* Start timer form */}
      {!activeTimer && showStartForm && (
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 14,
            padding: '16px',
            marginBottom: 24,
            boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleStartTimer();
              if (e.key === 'Escape') { setShowStartForm(false); setTitle(''); }
            }}
            placeholder="What are you working on?"
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid rgba(0,0,0,0.10)',
              fontSize: 15,
              color: THEME.textPrimary,
              backgroundColor: 'rgba(0,0,0,0.02)',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />

          {/* Calendar chips */}
          {calendarContainers.length > 1 && (
            <div className="flex flex-wrap gap-2" style={{ marginTop: 12 }}>
              {calendarContainers.map((cal) => {
                const isSel = selectedCalendarId === cal.id;
                return (
                  <button
                    key={cal.id}
                    type="button"
                    onClick={() => setSelectedCalendarId(cal.id)}
                    className="touch-manipulation"
                    style={{
                      padding: '5px 12px',
                      borderRadius: 20,
                      fontSize: 12,
                      fontWeight: 500,
                      border: isSel ? 'none' : '1px solid rgba(0,0,0,0.12)',
                      backgroundColor: isSel ? `${cal.color}20` : 'transparent',
                      color: isSel ? cal.color : '#636366',
                    }}
                  >
                    {cal.name}
                  </button>
                );
              })}
            </div>
          )}

          {/* Category chips */}
          <div className="flex flex-wrap gap-2" style={{ marginTop: 10 }}>
            {filteredCategories.map((cat) => {
              const isSel = selectedCategoryId === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategoryId(cat.id)}
                  className="touch-manipulation"
                  style={{
                    padding: '5px 12px',
                    borderRadius: 20,
                    fontSize: 12,
                    fontWeight: 500,
                    border: isSel ? 'none' : '1px solid rgba(0,0,0,0.12)',
                    backgroundColor: isSel ? `${cat.color}20` : 'transparent',
                    color: isSel ? cat.color : '#636366',
                  }}
                >
                  {cat.name}
                </button>
              );
            })}
          </div>

          <div className="flex gap-2" style={{ marginTop: 14 }}>
            <button
              type="button"
              onClick={() => { setShowStartForm(false); setTitle(''); }}
              className="touch-manipulation"
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 500,
                border: '1px solid rgba(0,0,0,0.10)',
                backgroundColor: 'transparent',
                color: '#636366',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleStartTimer}
              disabled={!title.trim()}
              className="touch-manipulation"
              style={{
                flex: 2,
                padding: '10px',
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 600,
                border: 'none',
                backgroundColor: title.trim() ? THEME.primary : 'rgba(0,0,0,0.06)',
                color: title.trim() ? '#FFFFFF' : '#AEAEB2',
              }}
            >
              Start Timer
            </button>
          </div>
        </div>
      )}

      {/* Pending review */}
      {pendingReview.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <SectionLabel count={pendingReview.length}>Needs review</SectionLabel>
          {pendingReview.map((block) => {
            const cat = categories.find((c) => c.id === block.categoryId);
            const color = cat?.color ?? THEME.primary;
            return (
              <div
                key={block.id}
                className="flex items-center gap-3"
                style={{ ...CARD_STYLE, borderLeft: `3px solid ${color}40` }}
              >
                <div className="flex-1 min-w-0">
                  <p style={{ fontSize: 14, fontWeight: 500, color: THEME.textPrimary, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {block.title ?? 'Untitled'}
                  </p>
                  <p style={{ fontSize: 11, color: '#AEAEB2', margin: '2px 0 0' }}>
                    {formatTime12(block.start)} – {formatTime12(block.end)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleConfirm(block.id)}
                  className="touch-manipulation"
                  style={{
                    padding: '6px 14px',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    border: 'none',
                    backgroundColor: `${color}18`,
                    color: color,
                  }}
                >
                  Done
                </button>
                <button
                  type="button"
                  onClick={() => handleSkip(block.id)}
                  className="touch-manipulation"
                  style={{
                    padding: '6px 10px',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 500,
                    border: '1px solid rgba(0,0,0,0.08)',
                    backgroundColor: 'transparent',
                    color: '#AEAEB2',
                  }}
                >
                  Skip
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Up next */}
      {upNext.length > 0 && (
        <div>
          <SectionLabel>Up next</SectionLabel>
          {upNext.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3"
              style={{ ...CARD_STYLE, borderLeft: `3px solid ${item.color}` }}
            >
              <div className="flex-1 min-w-0">
                <p style={{ fontSize: 14, fontWeight: 500, color: THEME.textPrimary, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.title}
                </p>
                <p style={{ fontSize: 11, color: '#AEAEB2', margin: '2px 0 0' }}>
                  {formatTime12(item.start)} – {formatTime12(item.end)}
                  {item.type === 'event' && <span style={{ marginLeft: 6, fontSize: 10, fontStyle: 'italic', color: '#C7C7CC' }}>event</span>}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!activeTimer && !currentBlock && !hasAnythingToday && !showStartForm && (
        <div className="flex flex-col items-center" style={{ marginTop: 20, padding: '0 20px' }}>
          <div style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: `${THEME.primary}12`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 14,
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={THEME.primary} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity={0.6}>
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <p style={{ fontSize: 14, color: '#AEAEB2', textAlign: 'center', margin: 0, lineHeight: 1.5 }}>
            No blocks scheduled for today.<br />
            Tap above to start tracking time.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Shared Section Label ──────────────────────────────────

function SectionLabel({ children, count }: { children: React.ReactNode; count?: number }) {
  return (
    <div className="flex items-center gap-2" style={{ margin: '0 0 10px' }}>
      <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#AEAEB2' }}>
        {children}
      </span>
      {count != null && count > 0 && (
        <span style={{
          fontSize: 10,
          fontWeight: 600,
          color: THEME.primary,
          backgroundColor: `${THEME.primary}12`,
          padding: '1px 6px',
          borderRadius: 10,
          minWidth: 18,
          textAlign: 'center',
        }}>
          {count}
        </span>
      )}
    </div>
  );
}

// ─── TODAY Tab ──────────────────────────────────────────────

function TodayTab() {
  const timeBlocks = useStore((s) => s.timeBlocks);
  const events = useStore((s) => s.events);
  const categories = useStore((s) => s.categories);
  const confirmBlock = useStore((s) => s.confirmBlock);
  const skipBlock = useStore((s) => s.skipBlock);
  const tasks = useStore((s) => s.tasks);
  const updateTask = useStore((s) => s.updateTask);
  const { saveSnapshot } = useHistoryStore();

  const [selectedDate, setSelectedDate] = useState(getLocalDateString());

  const agenda = useMemo(() => {
    const items: AgendaItem[] = [];
    for (const b of timeBlocks.filter((b) => b.date === selectedDate)) {
      const cat = categories.find((c) => c.id === b.categoryId);
      items.push({
        type: 'block',
        id: b.id,
        title: b.title ?? 'Untitled',
        start: b.start,
        end: b.end,
        color: cat?.color ?? THEME.primary,
        confirmationStatus: b.confirmationStatus,
        taskId: b.taskId,
      });
    }
    for (const e of events.filter((e) => e.date === selectedDate)) {
      const cat = categories.find((c) => c.id === e.categoryId);
      items.push({
        type: 'event',
        id: e.id,
        title: e.title,
        start: e.start,
        end: e.end,
        color: cat?.color ?? THEME.primary,
      });
    }
    return items.sort((a, b) => parseTimeToMinutes(a.start) - parseTimeToMinutes(b.start));
  }, [timeBlocks, events, selectedDate, categories]);

  const handleConfirm = useCallback((blockId: string) => {
    saveSnapshot();
    confirmBlock(blockId);
    const block = timeBlocks.find((b) => b.id === blockId);
    if (!block?.taskId) return;
    const siblings = timeBlocks.filter((b) => b.taskId === block.taskId && b.id !== blockId);
    if (siblings.every((b) => b.confirmationStatus === 'confirmed')) {
      updateTask(block.taskId, { status: 'done' });
    }
  }, [saveSnapshot, confirmBlock, timeBlocks, updateTask]);

  const handleSkip = useCallback((blockId: string) => {
    saveSnapshot();
    skipBlock(blockId);
  }, [saveSnapshot, skipBlock]);

  const navigateDate = (dir: -1 | 1) => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + dir);
    setSelectedDate(getLocalDateString(d));
  };

  const today = getLocalDateString();
  const nowMins = useCurrentMinutes();

  // Count pending reviews for badge
  const pendingCount = useMemo(() => {
    if (selectedDate > today) return 0;
    return agenda.filter((i) => i.type === 'block' && !i.confirmationStatus && (selectedDate < today || parseTimeToMinutes(i.end) <= nowMins)).length;
  }, [agenda, today, selectedDate, nowMins]);

  return (
    <div className="flex flex-col h-full">
      {/* Date navigation */}
      <div
        className="flex items-center justify-between flex-shrink-0"
        style={{ padding: '12px 16px', borderBottom: '1px solid rgba(0,0,0,0.06)' }}
      >
        <button
          type="button"
          onClick={() => navigateDate(-1)}
          className="touch-manipulation flex items-center justify-center"
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            border: 'none',
            backgroundColor: 'rgba(0,0,0,0.04)',
            color: THEME.textPrimary,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div className="text-center">
          <p style={{ fontSize: 16, fontWeight: 600, color: THEME.textPrimary, margin: 0 }}>
            {formatDateHeader(selectedDate)}
          </p>
          <div className="flex items-center justify-center gap-2">
            {selectedDate !== today && (
              <button
                type="button"
                onClick={() => setSelectedDate(today)}
                className="touch-manipulation"
                style={{ fontSize: 11, color: THEME.primary, border: 'none', backgroundColor: 'transparent', fontWeight: 500, marginTop: 2 }}
              >
                Go to today
              </button>
            )}
            {pendingCount > 0 && (
              <span style={{
                fontSize: 10,
                fontWeight: 600,
                color: '#FF9500',
                marginTop: 2,
              }}>
                {pendingCount} to review
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigateDate(1)}
          className="touch-manipulation flex items-center justify-center"
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            border: 'none',
            backgroundColor: 'rgba(0,0,0,0.04)',
            color: THEME.textPrimary,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      {/* Agenda list */}
      <div className="flex-1 overflow-y-auto" style={{ padding: '12px 16px' }}>
        {agenda.length === 0 && (
          <div className="flex flex-col items-center justify-center" style={{ height: 200 }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#D1D1D6" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 10 }}>
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <p style={{ fontSize: 14, color: '#AEAEB2', margin: 0 }}>Nothing scheduled</p>
          </div>
        )}
        {agenda.map((item) => {
          const isPast = selectedDate < today || (selectedDate === today && parseTimeToMinutes(item.end) <= nowMins);
          const isConfirmed = item.confirmationStatus === 'confirmed';
          const isSkipped = item.confirmationStatus === 'skipped';
          const isEvent = item.type === 'event';
          return (
            <div
              key={item.id}
              className="flex items-center gap-3"
              style={{
                ...CARD_STYLE,
                borderLeft: `3px solid ${item.color}`,
                opacity: isSkipped ? 0.45 : 1,
              }}
            >
              <div className="flex-1 min-w-0">
                <p style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: THEME.textPrimary,
                  margin: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  textDecoration: isSkipped ? 'line-through' : 'none',
                }}>
                  {item.title}
                </p>
                <p style={{ fontSize: 11, color: '#AEAEB2', margin: '2px 0 0' }}>
                  {formatTime12(item.start)} – {formatTime12(item.end)}
                  {isEvent && <span style={{ marginLeft: 6, fontSize: 10, fontStyle: 'italic', color: '#C7C7CC' }}>event</span>}
                </p>
              </div>
              {item.type === 'block' && isPast && !isConfirmed && !isSkipped && (
                <>
                  <button
                    type="button"
                    onClick={() => handleConfirm(item.id)}
                    className="touch-manipulation"
                    style={{
                      padding: '6px 14px',
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 600,
                      border: 'none',
                      backgroundColor: `${item.color}18`,
                      color: item.color,
                    }}
                  >
                    Done
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSkip(item.id)}
                    className="touch-manipulation"
                    style={{
                      padding: '6px 10px',
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 500,
                      border: '1px solid rgba(0,0,0,0.08)',
                      backgroundColor: 'transparent',
                      color: '#AEAEB2',
                    }}
                  >
                    Skip
                  </button>
                </>
              )}
              {isConfirmed && <CheckBadge color={item.color} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── CAPTURE Tab ───────────────────────────────────────────

function CaptureTab() {
  const addTask = useStore((s) => s.addTask);
  const calendarContainers = useStore((s) => s.calendarContainers);
  const categories = useStore((s) => s.categories);
  const { saveSnapshot } = useHistoryStore();

  const [title, setTitle] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [recentCaptures, setRecentCaptures] = useState<string[]>([]);
  const [speechSupported, setSpeechSupported] = useState(false);
  const recognitionRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setSpeechSupported(!!SR);
    return () => { recognitionRef.current?.abort(); };
  }, []);

  const defaultCalendar = calendarContainers[0];
  const defaultCategory = useMemo(() => {
    if (!defaultCalendar) return categories[0];
    return categories.find((c) => {
      const ids = c.calendarContainerIds;
      if (ids && ids.length > 0) return ids.includes(defaultCalendar.id);
      return c.calendarContainerId === defaultCalendar.id || !c.calendarContainerId;
    }) ?? categories[0];
  }, [defaultCalendar, categories]);

  const handleCapture = useCallback(() => {
    if (!title.trim() || !defaultCategory || !defaultCalendar) return;
    saveSnapshot();
    addTask({
      title: title.trim(),
      estimatedMinutes: 30,
      calendarContainerId: defaultCalendar.id,
      categoryId: defaultCategory.id,
      tagIds: [],
      flexible: true,
      status: 'inbox',
    });
    setRecentCaptures((prev) => [title.trim(), ...prev.slice(0, 9)]);
    setTitle('');
    inputRef.current?.focus();
  }, [title, defaultCalendar, defaultCategory, saveSnapshot, addTask]);

  const toggleVoice = useCallback(() => {
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;

    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setTitle(transcript);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isListening]);

  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ padding: '24px 16px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: THEME.textPrimary, margin: '0 0 4px' }}>
        Quick Capture
      </h1>
      <p style={{ fontSize: 13, color: '#AEAEB2', margin: '0 0 20px' }}>
        Add tasks to your inbox. Schedule them later.
      </p>

      {/* Input area */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: 14,
          padding: '14px',
          boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
          marginBottom: 20,
        }}
      >
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCapture(); }}
            placeholder="What do you need to do?"
            style={{
              flex: 1,
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid rgba(0,0,0,0.10)',
              fontSize: 15,
              color: THEME.textPrimary,
              backgroundColor: 'rgba(0,0,0,0.02)',
              outline: 'none',
            }}
          />
          {speechSupported && (
            <button
              type="button"
              onClick={toggleVoice}
              className="touch-manipulation"
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                border: 'none',
                backgroundColor: isListening ? 'rgba(255,59,48,0.12)' : 'rgba(0,0,0,0.04)',
                color: isListening ? '#FF3B30' : '#AEAEB2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
              </svg>
            </button>
          )}
        </div>

        {isListening && (
          <div className="flex items-center gap-2" style={{ marginTop: 10 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: '#FF3B30',
                animation: 'pulse 1.5s infinite',
              }}
            />
            <span style={{ fontSize: 12, color: '#FF3B30', fontWeight: 500 }}>Listening...</span>
          </div>
        )}

        <button
          type="button"
          onClick={handleCapture}
          disabled={!title.trim()}
          className="touch-manipulation"
          style={{
            width: '100%',
            marginTop: 12,
            padding: '12px',
            borderRadius: 10,
            fontSize: 15,
            fontWeight: 600,
            border: 'none',
            backgroundColor: title.trim() ? THEME.primary : 'rgba(0,0,0,0.06)',
            color: title.trim() ? '#FFFFFF' : '#AEAEB2',
          }}
        >
          Add to Inbox
        </button>
      </div>

      {/* Recent captures */}
      {recentCaptures.length > 0 && (
        <div>
          <SectionLabel count={recentCaptures.length}>Just captured</SectionLabel>
          {recentCaptures.map((item, i) => (
            <div
              key={`${item}-${i}`}
              className="flex items-center gap-2"
              style={CARD_STYLE}
            >
              <CheckBadge color={THEME.primary} />
              <p style={{ fontSize: 13, color: THEME.textPrimary, margin: 0 }}>{item}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── TASKS Tab ─────────────────────────────────────────────

function TasksTab() {
  const tasks = useStore((s) => s.tasks);
  const categories = useStore((s) => s.categories);
  const updateTask = useStore((s) => s.updateTask);
  const { saveSnapshot } = useHistoryStore();

  const [filter, setFilter] = useState<'all' | 'inbox' | 'done'>('all');

  const activeTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (filter === 'done') return t.status === 'done';
      if (filter === 'inbox') return t.status === 'inbox' || !t.status;
      return t.status !== 'done' && t.status !== 'archived';
    });
  }, [tasks, filter]);

  // Counts for each filter
  const counts = useMemo(() => ({
    all: tasks.filter((t) => t.status !== 'done' && t.status !== 'archived').length,
    inbox: tasks.filter((t) => t.status === 'inbox' || !t.status).length,
    done: tasks.filter((t) => t.status === 'done').length,
  }), [tasks]);

  const handleToggleDone = useCallback((task: Task) => {
    saveSnapshot();
    updateTask(task.id, { status: task.status === 'done' ? 'inbox' : 'done' });
  }, [saveSnapshot, updateTask]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div style={{ padding: '24px 16px 0' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: THEME.textPrimary, margin: '0 0 14px' }}>
          Tasks
        </h1>

        {/* Filter tabs */}
        <div className="flex gap-2" style={{ marginBottom: 14 }}>
          {(['all', 'inbox', 'done'] as const).map((f) => {
            const isActive = filter === f;
            const count = counts[f];
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className="touch-manipulation flex items-center gap-1.5"
                style={{
                  padding: '6px 14px',
                  borderRadius: 20,
                  fontSize: 12,
                  fontWeight: isActive ? 600 : 400,
                  border: isActive ? 'none' : '1px solid rgba(0,0,0,0.10)',
                  backgroundColor: isActive ? `${THEME.primary}15` : 'transparent',
                  color: isActive ? THEME.primary : '#AEAEB2',
                }}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
                <span style={{
                  fontSize: 10,
                  fontWeight: 600,
                  opacity: isActive ? 0.7 : 0.5,
                }}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto" style={{ padding: '0 16px 16px' }}>
        {activeTasks.length === 0 && (
          <div className="flex flex-col items-center justify-center" style={{ height: 200 }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#D1D1D6" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 10 }}>
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <p style={{ fontSize: 14, color: '#AEAEB2', margin: 0 }}>
              {filter === 'done' ? 'No completed tasks' : 'No tasks yet'}
            </p>
          </div>
        )}
        {activeTasks.map((task) => {
          const cat = categories.find((c) => c.id === task.categoryId);
          const color = cat?.color ?? THEME.primary;
          const isDone = task.status === 'done';
          return (
            <div
              key={task.id}
              className="flex items-center gap-3"
              style={{
                ...CARD_STYLE,
                opacity: isDone ? 0.55 : 1,
              }}
            >
              {/* Checkbox */}
              <button
                type="button"
                onClick={() => handleToggleDone(task)}
                className="touch-manipulation flex-shrink-0"
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 7,
                  border: isDone ? 'none' : `1.5px solid ${color}60`,
                  backgroundColor: isDone ? color : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {isDone && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>

              <div className="flex-1 min-w-0">
                <p style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: THEME.textPrimary,
                  margin: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  textDecoration: isDone ? 'line-through' : 'none',
                }}>
                  {task.title}
                </p>
                <div className="flex items-center gap-2" style={{ marginTop: 3 }}>
                  {cat && (
                    <span className="flex items-center gap-1" style={{ fontSize: 11, color: color }}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
                      {cat.name}
                    </span>
                  )}
                  {task.estimatedMinutes > 0 && (
                    <span style={{ fontSize: 10, color: '#C7C7CC' }}>
                      {task.estimatedMinutes >= 60
                        ? `${Math.floor(task.estimatedMinutes / 60)}h${task.estimatedMinutes % 60 > 0 ? ` ${task.estimatedMinutes % 60}m` : ''}`
                        : `${task.estimatedMinutes}m`
                      }
                    </span>
                  )}
                  {task.dueDate && (
                    <span style={{ fontSize: 10, color: '#FF9500' }}>
                      Due {formatDateHeader(task.dueDate)}
                    </span>
                  )}
                </div>
              </div>

              {task.priority != null && task.priority > 0 && (
                <span style={{ fontSize: 10, color: '#FF9500', fontWeight: 600 }}>
                  {'!'.repeat(Math.min(task.priority, 3))}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
