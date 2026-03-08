import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { useHistoryStore } from '../store/useHistoryStore';
import { getLocalDateString } from '../utils/dateTime';
import { parseTimeToMinutes, findNextAvailableSlot } from '../utils/taskHelpers';
import { computeOverlapLayout } from '../utils/overlapLayout';
import { THEME } from '../constants/colors';
import { hexToRgba } from '../utils/color';
import type { TimeBlock, Task, Event } from '../types';

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

/** Parse natural language time from task input.
 *  E.g. "Read book 30min" → { title: "Read book", minutes: 30 }
 */
function parseTaskInput(input: string): { title: string; minutes: number } {
  const trimmed = input.trim();
  const timeRegex = /\s+(\d+(?:\.\d+)?)\s*(?:h(?:(?:ou)?rs?)?|m(?:in(?:ute)?s?)?)\s*$/i;
  const match = trimmed.match(timeRegex);
  if (match) {
    const title = trimmed.slice(0, match.index!).trim();
    const val = parseFloat(match[1]);
    const unit = match[0].toLowerCase();
    const isHours = /h/.test(unit);
    const minutes = isHours ? Math.round(val * 60) : Math.round(val);
    if (title && minutes > 0 && minutes <= 480) {
      return { title, minutes };
    }
  }
  return { title: trimmed, minutes: 30 };
}

const CARD_STYLE: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  borderRadius: 12,
  padding: '12px 14px',
  marginBottom: 10,
  boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.03)',
};

// ─── Types ─────────────────────────────────────────────────

type MobileTab = 'schedule' | 'todo';

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
  const [activeTab, setActiveTab] = useState<MobileTab>('schedule');

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', backgroundColor: '#FDFDFB', maxWidth: '100vw' }}>
      {/* Top tab bar — fixed at top */}
      <nav
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          width: '100%',
          padding: '8px 16px',
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)',
          backgroundColor: '#FCFBF7',
          borderBottom: '1px solid rgba(0,0,0,0.06)',
          gap: 8,
          zIndex: 50,
        }}
      >
        {([
          { id: 'schedule' as const, label: 'Schedule', icon: ScheduleIcon },
          { id: 'todo' as const, label: 'To-Do', icon: TasksIcon },
        ]).map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className="touch-manipulation"
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '10px 4px',
                borderRadius: 12,
                color: isActive ? THEME.primary : '#AEAEB2',
                backgroundColor: isActive ? `${THEME.primary}10` : 'transparent',
                border: 'none',
                WebkitTapHighlightColor: 'transparent',
                transition: 'all 0.15s ease',
              }}
            >
              <Icon active={isActive} />
              <span style={{ fontSize: 14, fontWeight: isActive ? 600 : 500 }}>{label}</span>
            </button>
          );
        })}
      </nav>

      {/* Content — fills remaining height */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {activeTab === 'schedule' && <ScheduleTab />}
        {activeTab === 'todo' && <TodoTab />}
      </div>
    </div>
  );
}

// ─── Tab Icons ─────────────────────────────────────────────

function ScheduleIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={active ? 0 : 1.8} strokeLinecap="round" strokeLinejoin="round">
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

function TasksIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
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

function CheckBadge({ color }: { color: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

// ─── SCHEDULE Tab (Timeline + Timer + Review) ──────────────

const HOUR_HEIGHT = 56;
const TIME_COL_WIDTH = 42;

function ScheduleTab() {
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
  const wakeTime = useStore((s) => s.wakeTime);
  const sleepTime = useStore((s) => s.sleepTime);
  const { saveSnapshot } = useHistoryStore();

  const [selectedDate, setSelectedDate] = useState(getLocalDateString());
  const [tappedBlockId, setTappedBlockId] = useState<string | null>(null);
  const [showStartForm, setShowStartForm] = useState(false);
  const [timerTitle, setTimerTitle] = useState('');
  const [selectedCalendarId, setSelectedCalendarId] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [elapsed, setElapsed] = useState('0:00');
  const gridRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const today = getLocalDateString();
  const nowMins = useCurrentMinutes();

  // Timer tick
  useEffect(() => {
    if (!activeTimer) { setElapsed('0:00'); return; }
    const tick = () => setElapsed(formatElapsed(Date.now() - activeTimer.startedAt));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [activeTimer]);

  // Time range
  const wakeHour = Math.floor(parseTimeToMinutes(wakeTime || '8:00') / 60);
  const sleepHour = Math.ceil(parseTimeToMinutes(sleepTime || '23:00') / 60);
  const hours = useMemo(() => {
    const h: number[] = [];
    for (let i = wakeHour; i <= sleepHour; i++) h.push(i);
    return h;
  }, [wakeHour, sleepHour]);
  const gridStartMins = wakeHour * 60;
  const gridTotalMins = (sleepHour - wakeHour) * 60;

  // Build agenda
  const agenda = useMemo(() => {
    const items: AgendaItem[] = [];
    for (const b of timeBlocks.filter((b) => b.date === selectedDate)) {
      const cat = categories.find((c) => c.id === b.categoryId);
      items.push({
        type: 'block', id: b.id, title: b.title ?? 'Untitled',
        start: b.start, end: b.end, color: cat?.color ?? THEME.primary,
        confirmationStatus: b.confirmationStatus, taskId: b.taskId,
      });
    }
    for (const e of events.filter((e) => e.date === selectedDate)) {
      const cat = categories.find((c) => c.id === e.categoryId);
      items.push({
        type: 'event', id: e.id, title: e.title,
        start: e.start, end: e.end, color: cat?.color ?? THEME.primary,
      });
    }
    return items;
  }, [timeBlocks, events, selectedDate, categories]);

  // Current block
  const currentBlock = useMemo(() => {
    if (selectedDate !== today) return null;
    const todayBlocks = timeBlocks.filter((b) => b.date === today);
    if (activeTimer) return todayBlocks.find((b) => b.id === activeTimer.blockId) ?? null;
    return todayBlocks.find((b) => {
      const s = parseTimeToMinutes(b.start);
      const e = parseTimeToMinutes(b.end);
      return nowMins >= s && nowMins < e;
    }) ?? null;
  }, [activeTimer, timeBlocks, today, nowMins, selectedDate]);

  const currentColor = currentBlock
    ? (categories.find((c) => c.id === currentBlock.categoryId)?.color ?? THEME.primary)
    : THEME.primary;

  // Filtered categories for timer form
  const filteredCategories = useMemo(() => {
    if (!selectedCalendarId) return categories;
    return categories.filter((c) => {
      const ids = c.calendarContainerIds;
      if (ids && ids.length > 0) return ids.includes(selectedCalendarId);
      return c.calendarContainerId === selectedCalendarId || !c.calendarContainerId;
    });
  }, [selectedCalendarId, categories]);

  // Auto-select calendar/category for timer form
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
    setTappedBlockId(null);
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
    setTappedBlockId(null);
  }, [saveSnapshot, skipBlock]);

  const handleStartTimer = useCallback(() => {
    if (!timerTitle.trim()) return;
    const cat = categories.find((c) => c.id === selectedCategoryId);
    if (!cat) return;
    const now = getCurrentHHMM();
    const blockId = addTimeBlock({
      title: timerTitle.trim(),
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
      setTimerTitle('');
    }
  }, [timerTitle, selectedCategoryId, selectedCalendarId, categories, calendarContainers, addTimeBlock, startTimer]);

  const navigateDate = (dir: -1 | 1) => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + dir);
    setSelectedDate(getLocalDateString(d));
    setTappedBlockId(null);
  };

  // Scroll to now on mount
  useEffect(() => {
    if (selectedDate === today && gridRef.current) {
      const scrollTo = ((nowMins - gridStartMins) / 60) * HOUR_HEIGHT - 100;
      gridRef.current.scrollTop = Math.max(0, scrollTo);
    }
  }, [selectedDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const nowLineTop = ((nowMins - gridStartMins) / 60) * HOUR_HEIGHT;
  const showNowLine = selectedDate === today && nowMins >= gridStartMins && nowMins <= gridStartMins + gridTotalMins;

  const pendingCount = useMemo(() => {
    if (selectedDate > today) return 0;
    return agenda.filter((i) => i.type === 'block' && !i.confirmationStatus && (selectedDate < today || parseTimeToMinutes(i.end) <= nowMins)).length;
  }, [agenda, today, selectedDate, nowMins]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      {/* Active timer banner — persistent when running */}
      {activeTimer && currentBlock && (
        <div
          className="flex-shrink-0"
          style={{
            padding: '10px 16px',
            backgroundColor: `${currentColor}10`,
            borderBottom: `2px solid ${currentColor}40`,
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <p style={{ fontSize: 14, fontWeight: 600, color: THEME.textPrimary, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {currentBlock.title ?? 'Timer'}
              </p>
              <span className="font-mono tabular-nums" style={{ fontSize: 20, fontWeight: 600, color: currentColor }}>
                {elapsed}
              </span>
            </div>
            <button
              type="button"
              onClick={stopTimer}
              className="touch-manipulation flex items-center gap-1.5"
              style={{
                padding: '6px 16px',
                borderRadius: 20,
                backgroundColor: 'rgba(255,59,48,0.10)',
                color: '#FF3B30',
                fontSize: 13,
                fontWeight: 600,
                border: 'none',
                flexShrink: 0,
              }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2" /></svg>
              Stop
            </button>
          </div>
        </div>
      )}

      {/* Date navigation */}
      <div
        className="flex items-center justify-between flex-shrink-0"
        style={{ padding: '10px 16px', borderBottom: '1px solid rgba(0,0,0,0.06)' }}
      >
        <button
          type="button"
          onClick={() => navigateDate(-1)}
          className="touch-manipulation flex items-center justify-center"
          style={{ width: 36, height: 36, borderRadius: 10, border: 'none', backgroundColor: 'rgba(0,0,0,0.04)', color: THEME.textPrimary }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <div className="text-center">
          <p style={{ fontSize: 16, fontWeight: 600, color: THEME.textPrimary, margin: 0 }}>{formatDateHeader(selectedDate)}</p>
          <div className="flex items-center justify-center gap-2">
            {selectedDate !== today && (
              <button type="button" onClick={() => setSelectedDate(today)} className="touch-manipulation"
                style={{ fontSize: 11, color: THEME.primary, border: 'none', backgroundColor: 'transparent', fontWeight: 500, marginTop: 2 }}>
                Go to today
              </button>
            )}
            {pendingCount > 0 && (
              <span style={{ fontSize: 10, fontWeight: 600, color: '#FF9500', marginTop: 2 }}>{pendingCount} to review</span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigateDate(1)}
          className="touch-manipulation flex items-center justify-center"
          style={{ width: 36, height: 36, borderRadius: 10, border: 'none', backgroundColor: 'rgba(0,0,0,0.04)', color: THEME.textPrimary }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
        </button>
      </div>

      {/* Timeline grid */}
      <div ref={gridRef} className="flex-1 overflow-y-auto" style={{ position: 'relative', overflowX: 'hidden' }}>
        <div style={{ position: 'relative', height: hours.length * HOUR_HEIGHT, minHeight: '100%' }}>
          {/* Hour lines */}
          {hours.map((h) => {
            const top = (h - wakeHour) * HOUR_HEIGHT;
            return (
              <div key={h} style={{ position: 'absolute', top, left: 0, right: 0, height: HOUR_HEIGHT }}>
                <div style={{ position: 'absolute', top: 0, left: 0, width: TIME_COL_WIDTH, textAlign: 'right', paddingRight: 8 }}>
                  <span style={{ fontSize: 10, color: '#C7C7CC', fontWeight: 400, lineHeight: '1' }}>
                    {h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`}
                  </span>
                </div>
                <div style={{ position: 'absolute', top: 0, left: TIME_COL_WIDTH, right: 16, height: 1, backgroundColor: 'rgba(0,0,0,0.05)' }} />
              </div>
            );
          })}

          {/* Content area for blocks — positioned to the right of time labels */}
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: TIME_COL_WIDTH + 4, right: 16 }}>
          {(() => {
            const overlapMap = computeOverlapLayout(agenda.map((a) => ({ id: a.id, start: a.start, end: a.end })));

            return agenda.map((item) => {
              const startM = parseTimeToMinutes(item.start);
              const endM = parseTimeToMinutes(item.end);
              const top = ((startM - gridStartMins) / 60) * HOUR_HEIGHT;
              const height = Math.max(((endM - startM) / 60) * HOUR_HEIGHT, 22);
              const isEvent = item.type === 'event';
              const isPast = selectedDate < today || (selectedDate === today && endM <= nowMins);
              const isConfirmed = item.confirmationStatus === 'confirmed';
              const isSkipped = item.confirmationStatus === 'skipped';
              const isTapped = tappedBlockId === item.id;
              const showActions = isTapped && item.type === 'block' && isPast && !isConfirmed && !isSkipped;
              const isCompact = height < 38;

              const layout = overlapMap.get(item.id);
              const colIdx = layout?.columnIndex ?? 0;
              const totalCols = layout?.totalColumns ?? 1;
              const colWidthPct = 100 / totalCols;
              const leftPct = colIdx * colWidthPct;

              // Desktop-matching styles
              const blockStyle: React.CSSProperties = isEvent
                ? {
                    // Event: left stripe + light fill (matches EventCard)
                    borderLeft: `3px solid ${isPast ? hexToRgba(item.color, 0.4) : item.color}`,
                    backgroundColor: isPast ? hexToRgba(item.color, 0.08) : hexToRgba(item.color, 0.10),
                    borderRadius: '0 5px 5px 0',
                  }
                : isPast && isConfirmed
                ? {
                    // Past confirmed task (matches TimeBlockCard confirmed)
                    borderTop: `3px solid ${hexToRgba(item.color, 0.35)}`,
                    borderLeft: `1px solid ${hexToRgba(item.color, 0.18)}`,
                    borderRight: `1px solid ${hexToRgba(item.color, 0.18)}`,
                    borderBottom: `1px solid ${hexToRgba(item.color, 0.18)}`,
                    backgroundColor: hexToRgba(item.color, 0.12),
                    borderRadius: 5,
                  }
                : isPast
                ? {
                    // Past unconfirmed task (matches TimeBlockCard past)
                    borderTop: `3px solid ${hexToRgba(item.color, 0.30)}`,
                    borderLeft: `1px dashed ${hexToRgba(item.color, 0.15)}`,
                    borderRight: `1px dashed ${hexToRgba(item.color, 0.15)}`,
                    borderBottom: `1px dashed ${hexToRgba(item.color, 0.15)}`,
                    backgroundColor: 'rgba(0,0,0,0.03)',
                    borderRadius: 5,
                  }
                : {
                    // Future task (matches TimeBlockCard future — sticky note)
                    borderTop: `3px solid ${item.color}`,
                    borderLeft: `1px solid ${hexToRgba(item.color, 0.22)}`,
                    borderRight: `1px solid ${hexToRgba(item.color, 0.22)}`,
                    borderBottom: `1px solid ${hexToRgba(item.color, 0.22)}`,
                    backgroundColor: '#FFF9EC',
                    borderRadius: 5,
                    boxShadow: '0 2px 6px rgba(0,0,0,0.10)',
                  };

              return (
                <React.Fragment key={item.id}>
                  <div
                    onClick={() => setTappedBlockId(isTapped ? null : item.id)}
                    className="touch-manipulation"
                    style={{
                      position: 'absolute',
                      top,
                      left: `${leftPct}%`,
                      width: `calc(${colWidthPct}% - 2px)`,
                      height,
                      padding: isCompact ? '1px 5px' : '4px 6px',
                      overflow: 'hidden',
                      cursor: 'pointer',
                      opacity: isSkipped ? 0.4 : 1,
                      zIndex: isTapped ? 15 : 5,
                      ...blockStyle,
                      ...(isTapped ? { boxShadow: '0 2px 8px rgba(0,0,0,0.15)' } : {}),
                    }}
                  >
                    <div style={{ height: '100%', overflow: 'hidden' }}>
                      <p style={{
                        fontSize: isCompact ? 10 : 11,
                        fontWeight: 500,
                        color: THEME.textPrimary,
                        margin: 0,
                        overflow: 'hidden',
                        wordBreak: 'break-word',
                        lineHeight: 1.3,
                        textDecoration: isSkipped ? 'line-through' : 'none',
                        display: '-webkit-box',
                        WebkitLineClamp: isCompact ? 1 : 2,
                        WebkitBoxOrient: 'vertical',
                      }}>
                        {item.title}
                      </p>
                      {!isCompact && height >= 44 && (
                        <p style={{ fontSize: 9, color: THEME.textSecondary, margin: '1px 0 0', whiteSpace: 'nowrap' }}>
                          {formatTime12(item.start)} – {formatTime12(item.end)}
                        </p>
                      )}
                      {isConfirmed && (
                        <div style={{ position: 'absolute', top: 2, right: 4 }}>
                          <CheckBadge color={item.color} />
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Floating review buttons */}
                  {showActions && (
                    <div
                      className="flex gap-2"
                      style={{ position: 'absolute', top: top + height + 4, right: 0, zIndex: 20 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button type="button" onClick={() => handleConfirm(item.id)} className="touch-manipulation"
                        style={{ padding: '4px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600, border: 'none', backgroundColor: '#FFFFFF', color: item.color, boxShadow: '0 1px 4px rgba(0,0,0,0.15)' }}>
                        Done
                      </button>
                      <button type="button" onClick={() => handleSkip(item.id)} className="touch-manipulation"
                        style={{ padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 500, border: 'none', backgroundColor: '#FFFFFF', color: '#AEAEB2', boxShadow: '0 1px 4px rgba(0,0,0,0.15)' }}>
                        Skip
                      </button>
                    </div>
                  )}
                </React.Fragment>
              );
            });
          })()}
          </div>

          {/* Now line */}
          {showNowLine && (
            <div style={{ position: 'absolute', top: nowLineTop, left: 0, right: 16, zIndex: 10, pointerEvents: 'none' }}>
              <div className="flex items-center">
                <span style={{ fontSize: 9, fontWeight: 600, color: '#FF3B30', width: TIME_COL_WIDTH, textAlign: 'right', paddingRight: 6, flexShrink: 0 }}>
                  {(() => { const h = Math.floor(nowMins / 60); const m = nowMins % 60; const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h; return `${h12}:${String(m).padStart(2, '0')}`; })()}
                </span>
                <div style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#FF3B30', flexShrink: 0, marginLeft: -3 }} />
                <div style={{ flex: 1, height: 1.5, backgroundColor: '#FF3B30' }} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Start timer FAB — bottom right */}
      {!activeTimer && !showStartForm && selectedDate === today && (
        <button
          type="button"
          onClick={() => setShowStartForm(true)}
          className="touch-manipulation"
          style={{
            position: 'absolute',
            bottom: 20,
            right: 20,
            width: 52,
            height: 52,
            borderRadius: 26,
            border: 'none',
            backgroundColor: THEME.primary,
            color: '#FFFFFF',
            boxShadow: '0 4px 12px rgba(141,162,134,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 30,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
        </button>
      )}

      {/* Start timer sheet */}
      {showStartForm && (
        <div className="flex-shrink-0" style={{
          padding: '16px',
          backgroundColor: '#FFFFFF',
          borderTop: '1px solid rgba(0,0,0,0.08)',
          boxShadow: '0 -4px 12px rgba(0,0,0,0.06)',
        }}>
          <input
            ref={inputRef}
            type="text"
            value={timerTitle}
            onChange={(e) => setTimerTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleStartTimer();
              if (e.key === 'Escape') { setShowStartForm(false); setTimerTitle(''); }
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

          {/* Category chips */}
          {calendarContainers.length > 1 && (
            <div className="flex flex-wrap gap-2" style={{ marginTop: 10 }}>
              {calendarContainers.map((cal) => {
                const isSel = selectedCalendarId === cal.id;
                return (
                  <button key={cal.id} type="button" onClick={() => setSelectedCalendarId(cal.id)} className="touch-manipulation"
                    style={{ padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500, border: isSel ? 'none' : '1px solid rgba(0,0,0,0.12)', backgroundColor: isSel ? `${cal.color}20` : 'transparent', color: isSel ? cal.color : '#636366' }}>
                    {cal.name}
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex flex-wrap gap-2" style={{ marginTop: 8 }}>
            {filteredCategories.map((cat) => {
              const isSel = selectedCategoryId === cat.id;
              return (
                <button key={cat.id} type="button" onClick={() => setSelectedCategoryId(cat.id)} className="touch-manipulation"
                  style={{ padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500, border: isSel ? 'none' : '1px solid rgba(0,0,0,0.12)', backgroundColor: isSel ? `${cat.color}20` : 'transparent', color: isSel ? cat.color : '#636366' }}>
                  {cat.name}
                </button>
              );
            })}
          </div>

          <div className="flex gap-2" style={{ marginTop: 12 }}>
            <button type="button" onClick={() => { setShowStartForm(false); setTimerTitle(''); }} className="touch-manipulation"
              style={{ flex: 1, padding: '10px', borderRadius: 10, fontSize: 14, fontWeight: 500, border: '1px solid rgba(0,0,0,0.10)', backgroundColor: 'transparent', color: '#636366' }}>
              Cancel
            </button>
            <button type="button" onClick={handleStartTimer} disabled={!timerTitle.trim()} className="touch-manipulation"
              style={{ flex: 2, padding: '10px', borderRadius: 10, fontSize: 14, fontWeight: 600, border: 'none', backgroundColor: timerTitle.trim() ? THEME.primary : 'rgba(0,0,0,0.06)', color: timerTitle.trim() ? '#FFFFFF' : '#AEAEB2' }}>
              Start Timer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── TO-DO Tab (Quick capture + task list with scheduling) ──

function TodoTab() {
  const tasks = useStore((s) => s.tasks);
  const timeBlocks = useStore((s) => s.timeBlocks);
  const categories = useStore((s) => s.categories);
  const calendarContainers = useStore((s) => s.calendarContainers);
  const events = useStore((s) => s.events);
  const addTask = useStore((s) => s.addTask);
  const updateTask = useStore((s) => s.updateTask);
  const addTimeBlock = useStore((s) => s.addTimeBlock);
  const { saveSnapshot } = useHistoryStore();

  const [title, setTitle] = useState('');
  const [filter, setFilter] = useState<'all' | 'today' | 'done'>('all');
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const [speechSupported, setSpeechSupported] = useState(false);

  const todayStr = getLocalDateString();

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setSpeechSupported(!!SR);
    return () => { recognitionRef.current?.abort(); };
  }, []);

  // Hold-to-record: start on pointerdown, stop on pointerup/pointerleave
  const startListening = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    recognitionRef.current?.abort();
    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.onresult = (event: any) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setTitle(transcript);
    };
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
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

  const parsed = useMemo(() => parseTaskInput(title), [title]);

  const handleCapture = useCallback(() => {
    if (!parsed.title || !defaultCategory || !defaultCalendar) return;
    saveSnapshot();
    addTask({
      title: parsed.title,
      estimatedMinutes: parsed.minutes,
      calendarContainerId: defaultCalendar.id,
      categoryId: defaultCategory.id,
      tagIds: [],
      flexible: true,
      status: 'inbox',
    });
    setTitle('');
    inputRef.current?.focus();
  }, [parsed, defaultCalendar, defaultCategory, saveSnapshot, addTask]);

  // Tasks with blocks scheduled for today
  const todayTaskIds = useMemo(() => {
    const ids = new Set<string>();
    for (const b of timeBlocks) {
      if (b.date === todayStr && b.taskId) ids.add(b.taskId);
    }
    return ids;
  }, [timeBlocks, todayStr]);

  const activeTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (filter === 'done') return t.status === 'done';
      if (filter === 'today') return t.status !== 'done' && t.status !== 'archived' && todayTaskIds.has(t.id);
      return t.status !== 'done' && t.status !== 'archived';
    });
  }, [tasks, filter, todayTaskIds]);

  const counts = useMemo(() => ({
    all: tasks.filter((t) => t.status !== 'done' && t.status !== 'archived').length,
    today: tasks.filter((t) => t.status !== 'done' && t.status !== 'archived' && todayTaskIds.has(t.id)).length,
    done: tasks.filter((t) => t.status === 'done').length,
  }), [tasks, todayTaskIds]);

  const handleToggleDone = useCallback((task: Task) => {
    saveSnapshot();
    updateTask(task.id, { status: task.status === 'done' ? 'inbox' : 'done' });
  }, [saveSnapshot, updateTask]);

  const handleScheduleToday = useCallback((task: Task) => {
    const now = new Date();
    const currentTime = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
    const duration = task.estimatedMinutes || 30;
    const slot = findNextAvailableSlot(timeBlocks, events, todayStr, duration, currentTime, '23:00');
    if (!slot) {
      alert('No available time slot today. Try scheduling later.');
      return;
    }
    saveSnapshot();
    addTimeBlock({
      taskId: task.id,
      title: task.title,
      date: todayStr,
      start: slot.start,
      end: slot.end,
      mode: 'planned',
      source: 'manual',
      categoryId: task.categoryId,
      calendarContainerId: task.calendarContainerId,
      tagIds: task.tagIds ?? [],
    });
    setExpandedTaskId(null);
    if (task.status === 'inbox' || !task.status) {
      updateTask(task.id, { status: 'planned' });
    }
  }, [timeBlocks, events, todayStr, saveSnapshot, addTimeBlock, updateTask]);

  const handleScheduleLater = useCallback((task: Task) => {
    // Find next available slot across the next 7 days (skip today)
    const duration = task.estimatedMinutes || 30;
    for (let i = 1; i <= 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const slot = findNextAvailableSlot(timeBlocks, events, dateStr, duration, '9:00', '18:00');
      if (slot) {
        saveSnapshot();
        addTimeBlock({
          taskId: task.id,
          title: task.title,
          date: dateStr,
          start: slot.start,
          end: slot.end,
          mode: 'planned',
          source: 'manual',
          categoryId: task.categoryId,
          calendarContainerId: task.calendarContainerId,
          tagIds: task.tagIds ?? [],
        });
        setExpandedTaskId(null);
        if (task.status === 'inbox' || !task.status) {
          updateTask(task.id, { status: 'planned' });
        }
        const dayLabel = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
        setTimeout(() => alert(`Scheduled for ${dayLabel} at ${formatTime12(slot.start)}`), 50);
        return;
      }
    }
    alert('No available slots found this week.');
  }, [timeBlocks, events, saveSnapshot, addTimeBlock, updateTask]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Quick capture input — always visible at top */}
      <div style={{ flexShrink: 0, padding: '14px 16px 0' }}>
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCapture(); }}
            placeholder={isListening ? 'Listening...' : 'Add task... (e.g. "Read book 30min")'}
            style={{
              flex: 1,
              padding: '10px 12px',
              borderRadius: 10,
              border: isListening ? `1.5px solid #FF3B30` : '1px solid rgba(0,0,0,0.10)',
              fontSize: 14,
              color: THEME.textPrimary,
              backgroundColor: isListening ? 'rgba(255,59,48,0.03)' : '#FFFFFF',
              outline: 'none',
            }}
          />
          {speechSupported && (
            <button
              type="button"
              onPointerDown={(e) => { e.preventDefault(); startListening(); }}
              onPointerUp={stopListening}
              onPointerLeave={stopListening}
              onContextMenu={(e) => e.preventDefault()}
              className="touch-manipulation flex-shrink-0"
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                border: 'none',
                backgroundColor: isListening ? 'rgba(255,59,48,0.12)' : 'rgba(0,0,0,0.04)',
                color: isListening ? '#FF3B30' : '#AEAEB2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                userSelect: 'none',
                WebkitUserSelect: 'none',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
              </svg>
            </button>
          )}
          <button
            type="button"
            onClick={handleCapture}
            disabled={!parsed.title}
            className="touch-manipulation flex-shrink-0"
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              border: 'none',
              backgroundColor: parsed.title ? THEME.primary : 'rgba(0,0,0,0.06)',
              color: parsed.title ? '#FFFFFF' : '#AEAEB2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>
        {title.trim() && parsed.minutes !== 30 && (
          <p style={{ fontSize: 11, color: THEME.primary, margin: '4px 0 0 2px', fontWeight: 500 }}>
            {parsed.minutes}min estimated
          </p>
        )}

        {/* Filter chips */}
        <div className="flex gap-2" style={{ marginTop: 12, marginBottom: 10 }}>
          {(['all', 'today', 'done'] as const).map((f) => {
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
                <span style={{ fontSize: 10, fontWeight: 600, opacity: isActive ? 0.7 : 0.5 }}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Task list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px' }}>
        {activeTasks.length === 0 && (
          <div className="flex flex-col items-center" style={{ paddingTop: 48 }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#D1D1D6" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 12 }}>
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <p style={{ fontSize: 14, color: '#AEAEB2', margin: 0 }}>
              {filter === 'done' ? 'No completed tasks' : filter === 'today' ? 'Nothing scheduled today' : 'No tasks yet'}
            </p>
          </div>
        )}
        {activeTasks.map((task) => {
          const cat = categories.find((c) => c.id === task.categoryId);
          const color = cat?.color ?? THEME.primary;
          const isDone = task.status === 'done';
          const isExpanded = expandedTaskId === task.id;
          // Find if this task has blocks scheduled
          const taskBlocks = timeBlocks.filter((b) => b.taskId === task.id && b.mode === 'planned');
          const nextBlock = taskBlocks.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start))[0];
          return (
            <div key={task.id} style={{ marginBottom: 8 }}>
              <div
                onClick={() => !isDone && setExpandedTaskId(isExpanded ? null : task.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  borderRadius: isExpanded ? '5px 5px 0 0' : 5,
                  padding: '10px 12px',
                  borderTop: `3px solid ${isDone ? hexToRgba(color, 0.35) : color}`,
                  borderLeft: `1px solid ${hexToRgba(color, 0.22)}`,
                  borderRight: `1px solid ${hexToRgba(color, 0.22)}`,
                  borderBottom: isExpanded ? 'none' : `1px solid ${hexToRgba(color, 0.22)}`,
                  backgroundColor: isDone ? hexToRgba(color, 0.12) : '#FFF9EC',
                  boxShadow: isDone ? 'none' : isExpanded ? 'none' : '0 2px 6px rgba(0,0,0,0.10), 0 1px 2px rgba(0,0,0,0.06)',
                  opacity: isDone ? 0.6 : 1,
                  cursor: isDone ? 'default' : 'pointer',
                }}
              >
                {/* Checkbox */}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleToggleDone(task); }}
                  className="touch-manipulation"
                  style={{
                    flexShrink: 0,
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    border: isDone ? 'none' : `1.5px solid ${hexToRgba(color, 0.5)}`,
                    backgroundColor: isDone ? color : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {isDone && (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    fontSize: 13, fontWeight: 500, color: THEME.textPrimary, margin: 0,
                    wordBreak: 'break-word', lineHeight: 1.35,
                    textDecoration: isDone ? 'line-through' : 'none',
                  }}>
                    {task.title}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
                    {task.estimatedMinutes > 0 && (
                      <span style={{ fontSize: 10, color: '#8E8E93' }}>
                        {task.estimatedMinutes >= 60
                          ? `${Math.floor(task.estimatedMinutes / 60)}h${task.estimatedMinutes % 60 > 0 ? ` ${task.estimatedMinutes % 60}m` : ''}`
                          : `${task.estimatedMinutes}m`
                        }
                      </span>
                    )}
                    {nextBlock && (
                      <span style={{ fontSize: 10, color: THEME.primary }}>
                        {nextBlock.date === todayStr ? formatTime12(nextBlock.start) : formatDateHeader(nextBlock.date)}
                      </span>
                    )}
                    {task.dueDate && (
                      <span style={{ fontSize: 10, color: THEME.warningOrange }}>
                        Due {formatDateHeader(task.dueDate)}
                      </span>
                    )}
                    {task.priority != null && task.priority > 0 && (
                      <span style={{ fontSize: 10, color: THEME.warningOrange, fontWeight: 600 }}>
                        {'!'.repeat(Math.min(task.priority, 3))}
                      </span>
                    )}
                  </div>
                </div>

                {/* Chevron */}
                {!isDone && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#AEAEB2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    style={{ flexShrink: 0, transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }}>
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                )}
              </div>

              {/* Expanded schedule actions */}
              {isExpanded && !isDone && (
                <div style={{
                  display: 'flex',
                  gap: 8,
                  padding: '10px 12px',
                  borderRadius: '0 0 5px 5px',
                  borderLeft: `1px solid ${hexToRgba(color, 0.22)}`,
                  borderRight: `1px solid ${hexToRgba(color, 0.22)}`,
                  borderBottom: `1px solid ${hexToRgba(color, 0.22)}`,
                  backgroundColor: '#FFF9EC',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.10), 0 1px 2px rgba(0,0,0,0.06)',
                }}>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleScheduleToday(task); }}
                    className="touch-manipulation"
                    style={{
                      flex: 1,
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: 'none',
                      backgroundColor: THEME.primary,
                      color: '#FFFFFF',
                      fontSize: 12,
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 5,
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                    </svg>
                    Schedule today
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleScheduleLater(task); }}
                    className="touch-manipulation"
                    style={{
                      flex: 1,
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: `1px solid rgba(0,0,0,0.10)`,
                      backgroundColor: 'transparent',
                      color: THEME.textPrimary,
                      fontSize: 12,
                      fontWeight: 500,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 5,
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                    Later this week
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
