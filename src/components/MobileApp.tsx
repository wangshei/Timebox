import { MissedOverlay, MISSED_STAMP } from './MissedOverlay';
import { Sheet } from './ds/Sheet';
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { MiniMonth } from './MiniMonth';
import { useStore } from '../store/useStore';
import { useHistoryStore } from '../store/useHistoryStore';
import { useStickerSet } from '../utils/stickerSet';
import { getLocalDateString, padTime, minutesToHHMM, getStartOfWeek } from '../utils/dateTime';
import { activeDrag, registerDropZone, unregisterDropZone, initPointerDrag, type PointerDragOptions } from '../utils/dragState';
import { parseTimeToMinutes, findNextAvailableSlot } from '../utils/taskHelpers';
import { computeOverlapLayout } from '../utils/overlapLayout';
import { THEME } from '../constants/colors';
import { COLOR } from '../styles/tokens';
import { formatTime12, formatDateHeader } from '../utils/formatters';
import { parseQuickAdd, describeQuickParse } from '../utils/quickParse';
import { hexToRgba } from '../utils/color';
import type { TimeBlock, Task, Event } from '../types';
import { dismissGcalEventId } from '../services/googleCalendar';
import { toast } from 'sonner';
import { InlineCreate } from './InlineCreate';
import { SegmentedControl } from './ds/SegmentedControl';
import { useCreateMode, getCreateMode, type CreateMode } from '../utils/createMode';
import { CheckIcon, XMarkIcon, ClockIcon, CalendarIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline';
import { StarIcon } from '@heroicons/react/24/solid';
import { TodoToggle } from './TodoToggle';

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

const CARD_STYLE: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  borderRadius: 12,
  padding: '12px 14px',
  marginBottom: 10,
  boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.03)',
};

// ─── Types ─────────────────────────────────────────────────

type MobileTab = 'schedule' | 'todo';
type ScheduleMode = 'list' | 'plan';
/** Selected date shared between the Schedule list and Plan modes. */
const SharedDateContext = React.createContext<[string, (d: string) => void] | null>(null);

const ScheduleModeContext = React.createContext<[ScheduleMode, (m: ScheduleMode) => void]>(['list', () => {}]);

/** Shared date header for Schedule List and Plan: prev / title (opens mini month) / next / undo / mode toggle. */
function ScheduleHeader({ selectedDate, today, onNavigate, onToday, miniOpen, onToggleMini }: {
  selectedDate: string; today: string; onNavigate: (dir: -1 | 1) => void; onToday: () => void; miniOpen: boolean; onToggleMini: () => void;
}) {
  const [mode, setMode] = React.useContext(ScheduleModeContext);
  const undoDepth = useHistoryStore((st) => st.past.length);
  const iconBtn: React.CSSProperties = { width: 44, height: 44, borderRadius: 8, border: 'none', backgroundColor: 'transparent', color: THEME.textSecondary, flexShrink: 0, padding: 0 };
  const seg = (active: boolean): React.CSSProperties => ({ width: 30, height: 28, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: active ? COLOR.surface : 'transparent', color: active ? THEME.textPrimary : COLOR.muted, boxShadow: active ? '0 1px 2px rgba(0,0,0,0.12)' : 'none' });
  return (
    <div className="flex-shrink-0" style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
      <div className="flex items-center" style={{ padding: '4px 8px', gap: 0 }}>
        <button type="button" aria-label="Previous day" onClick={() => onNavigate(-1)} className="touch-manipulation flex items-center justify-center" style={iconBtn}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <div style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
          <button type="button" data-testid="schedule-title" onClick={onToggleMini} className="touch-manipulation"
            style={{ fontSize: 16, fontWeight: 600, color: THEME.textPrimary, margin: 0, border: 'none', background: 'transparent', minHeight: 44, padding: '0 4px', whiteSpace: 'nowrap' }}>
            {formatDateHeader(selectedDate)} <span style={{ fontSize: 10, color: COLOR.muted }}>{miniOpen ? '▴' : '▾'}</span>
          </button>
        </div>
        <button type="button" aria-label="Next day" onClick={() => onNavigate(1)} className="touch-manipulation flex items-center justify-center" style={iconBtn}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
        </button>
        {selectedDate !== today && (
          <button type="button" onClick={onToday} className="touch-manipulation"
            style={{ height: 28, padding: '0 8px', margin: '0 2px', borderRadius: 14, border: `1px solid ${THEME.primary}30`, backgroundColor: `${THEME.primary}08`, color: THEME.primary, fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
            Today
          </button>
        )}
        <button type="button" data-testid="schedule-undo" aria-label="Undo last change" title="Undo" disabled={undoDepth === 0}
          onClick={() => useHistoryStore.getState().undo()} className="touch-manipulation flex items-center justify-center"
          style={{ ...iconBtn, opacity: undoDepth === 0 ? 0.3 : 1 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 14 4 9 9 4" /><path d="M20 20v-7a4 4 0 0 0-4-4H4" /></svg>
        </button>
        <button type="button" data-testid="schedule-mode" aria-label={mode === 'list' ? 'Switch to Plan' : 'Switch to List'} title={mode === 'list' ? 'Switch to Plan' : 'Switch to List'}
          onClick={() => setMode(mode === 'list' ? 'plan' : 'list')} className="touch-manipulation flex items-center justify-center"
          style={{ minWidth: 44, height: 44, border: 'none', background: 'transparent', padding: '0 2px 0 4px', flexShrink: 0 }}>
          <span style={{ display: 'flex', padding: 2, borderRadius: 9, backgroundColor: 'rgba(0,0,0,0.06)' }}>
            <span style={seg(mode === 'list')}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><circle cx="3.5" cy="6" r="1" fill="currentColor" /><circle cx="3.5" cy="12" r="1" fill="currentColor" /><circle cx="3.5" cy="18" r="1" fill="currentColor" /></svg></span>
            <span style={seg(mode === 'plan')}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="2" /><line x1="4" y1="9" x2="20" y2="9" /><line x1="4" y1="15" x2="20" y2="15" /></svg></span>
          </span>
        </button>
      </div>
    </div>
  );
}

interface AgendaItem {
  type: 'block' | 'event';
  id: string;
  title: string;
  start: string;
  end: string;
  color: string;
  confirmationStatus?: TimeBlock['confirmationStatus'];
  taskId?: string | null;
  isNote?: boolean;
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

function PlanIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <line x1="12" y1="4" x2="12" y2="20" strokeWidth={active ? 2.4 : 1.8} />
      <line x1="5" y1="9" x2="9" y2="9" strokeWidth="1.5" />
      <line x1="5" y1="12" x2="9" y2="12" strokeWidth="1.5" />
      <line x1="5" y1="15" x2="9" y2="15" strokeWidth="1.5" />
      <rect x="14" y="8" width="5" height="3" rx="1" fill={active ? 'currentColor' : 'none'} strokeWidth="1.5" />
      <rect x="14" y="13" width="5" height="3" rx="1" fill={active ? 'currentColor' : 'none'} strokeWidth="1.5" />
    </svg>
  );
}

// ─── Main Component ────────────────────────────────────────

/** Toast with a visible Undo (uses the shared history store; callers saveSnapshot() before mutating). */
function undoToast(message: string) {
  toast(message, { action: { label: 'Undo', onClick: () => useHistoryStore.getState().undo() }, duration: 6000 });
}

/** Actions the desktop shell owns so mobile behaves identically (scope prompts, guest notices, undo toasts). */
export interface MobileActions {
  /** Delete an event: asks This/Following/All for repeating events and whether to notify guests. */
  deleteEvent?: (eventId: string) => void;
  /** Delete a calendar block: scheduled todos ask "Remove from calendar" vs "Delete todo". */
  deleteBlock?: (blockId: string) => void;
  /** Delete a todo/note (repeating ones ask for a scope). */
  deleteTask?: (taskId: string) => void;
  /** Toggle a todo done (also confirms/unconfirms its blocks). */
  markTaskDone?: (taskId: string) => void;
  /** Move an event (asks This/Following/All for repeating events, then notifies guests). */
  moveEvent?: (eventId: string, params: { date: string; startTime: string; endTime: string }) => void;
  /** Move a calendar block (same guards as desktop drag). */
  moveBlock?: (blockId: string, params: { date: string; startTime: string; endTime: string }) => void;
  /** An event was edited on mobile; lets the shell notify its guests. */
  eventEdited?: (eventId: string, updates: Record<string, unknown>) => void;
}
const MobileActionsContext = React.createContext<MobileActions>({});

export function MobileApp(actions: MobileActions) {
  const [activeTab, setActiveTab] = useState<MobileTab>('schedule');
  const [schedMode, setSchedMode] = useState<ScheduleMode>('list');
  const sharedDate = useState(getLocalDateString());
  const [showAddPopup, setShowAddPopup] = useState(false);
  const [addSheetMode, setAddSheetMode] = useState<'task' | 'event'>('task');
  const [showAddSheet, setShowAddSheet] = useState(false);

  // Refs to trigger add flows in child tabs
  const todoAddTriggerRef = useRef<(() => void) | null>(null);
  const scheduleAddEventTriggerRef = useRef<(() => void) | null>(null);

  // Prevent iOS rubber-band / pull-to-refresh on the document level
  useEffect(() => {
    const handler = (e: TouchEvent) => {
      // Allow scrolling inside scrollable containers
      let el = e.target as HTMLElement | null;
      while (el) {
        const { overflowY } = window.getComputedStyle(el);
        if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
          return; // allow native scroll
        }
        el = el.parentElement;
      }
      // No scrollable ancestor — prevent bounce (but not during block drags, those handle their own prevention)
      if (e.touches.length === 1 && !e.defaultPrevented) e.preventDefault();
    };
    document.addEventListener('touchmove', handler, { passive: false });
    return () => document.removeEventListener('touchmove', handler);
  }, []);

  const handleNewTask = useCallback(() => {
    setShowAddPopup(false);
    setAddSheetMode('task');
    setShowAddSheet(true);
  }, []);

  const handleNewEvent = useCallback(() => {
    setShowAddPopup(false);
    setAddSheetMode('event');
    setShowAddSheet(true);
  }, []);

  return (
    <MobileActionsContext.Provider value={actions}>
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', backgroundColor: COLOR.surface2, maxWidth: '100vw', overscrollBehavior: 'none' }}>
      {/* Lift toasts above the bottom nav so "Undo" stays tappable on mobile */}
      <style>{`[data-sonner-toaster][data-y-position="bottom"]{--offset:calc(env(safe-area-inset-bottom, 0px) + 76px) !important;bottom:calc(env(safe-area-inset-bottom, 0px) + 76px) !important}`}</style>
      {/* Top safe area spacer — background color only, no interactive content */}
      <div style={{ flexShrink: 0, height: 'env(safe-area-inset-top, 0px)', backgroundColor: COLOR.surface2 }} />
      {/* Content — fills remaining height */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <SharedDateContext.Provider value={sharedDate}>
          <ScheduleModeContext.Provider value={[schedMode, setSchedMode]}>
          {activeTab === 'schedule' && (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                {schedMode === 'plan' ? <PlanTab /> : <ScheduleTab addEventTriggerRef={scheduleAddEventTriggerRef} />}
              </div>
            </div>
          )}
          </ScheduleModeContext.Provider>
        </SharedDateContext.Provider>
        {activeTab === 'todo' && <TodoTab addTriggerRef={todoAddTriggerRef} />}
      </div>

      {/* Single floating add button, bottom-right above the nav */}
      <button
        type="button"
        data-testid="fab-add"
        aria-label="Create new"
        onClick={() => setShowAddPopup(true)}
        className="touch-manipulation"
        style={{
          position: 'absolute', right: 16, bottom: 'calc(env(safe-area-inset-bottom, 0px) + 72px)',
          width: 52, height: 52, borderRadius: 26, border: 'none', backgroundColor: THEME.primary, color: '#FFFFFF',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 3px 12px rgba(0,0,0,0.18)', zIndex: 'var(--tb-z-sticky)' as unknown as number, WebkitTapHighlightColor: 'transparent',
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
      </button>

      {/* Bottom navigation bar */}
      <nav
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-around',
          width: '100%',
          padding: '6px 0',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 6px)',
          backgroundColor: COLOR.surface2,
          borderTop: '1px solid rgba(0,0,0,0.08)',
          zIndex: 'var(--tb-z-sticky)',
        }}
      >
        {/* Schedule tab */}
        <button
          type="button"
          onClick={() => setActiveTab('schedule')}
          className="touch-manipulation"
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
            padding: '6px 4px 2px',
            minHeight: 44,
            border: 'none',
            backgroundColor: 'transparent',
            color: activeTab === 'schedule' ? THEME.primary : COLOR.muted,
            WebkitTapHighlightColor: 'transparent',
            transition: 'color 0.15s ease',
          }}
        >
          <ScheduleIcon active={activeTab === 'schedule'} />
          <span style={{ fontSize: 11, fontWeight: activeTab === 'schedule' ? 600 : 400 }}>Schedule</span>
        </button>

        {/* To-Do tab */}
        <button
          type="button"
          onClick={() => setActiveTab('todo')}
          className="touch-manipulation"
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
            padding: '6px 4px 2px',
            minHeight: 44,
            border: 'none',
            backgroundColor: 'transparent',
            color: activeTab === 'todo' ? THEME.primary : COLOR.muted,
            WebkitTapHighlightColor: 'transparent',
            transition: 'color 0.15s ease',
          }}
        >
          <TasksIcon active={activeTab === 'todo'} />
          <span style={{ fontSize: 11, fontWeight: activeTab === 'todo' ? 600 : 400 }}>To-Do</span>
        </button>
      </nav>

      {/* Add popup / bottom sheet — picker */}
      {showAddPopup && (
        <>
          <Sheet onBackdropClick={() => setShowAddPopup(false)}>
            <div style={{ padding: '8px 20px 16px' }}>
              <p style={{ fontSize: 15, fontWeight: 600, color: THEME.textPrimary, margin: '0 0 12px' }}>Create new...</p>
              <button type="button" onClick={handleNewTask} className="touch-manipulation"
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 8px', border: 'none', backgroundColor: 'transparent', width: '100%', textAlign: 'left', borderRadius: 10, fontSize: 15, fontWeight: 500, color: THEME.textPrimary }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: `${THEME.primary}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={THEME.primary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                </div>
                New Note or To-do
              </button>
              <button type="button" onClick={handleNewEvent} className="touch-manipulation"
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 8px', border: 'none', backgroundColor: 'transparent', width: '100%', textAlign: 'left', borderRadius: 10, fontSize: 15, fontWeight: 500, color: THEME.textPrimary }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: `${THEME.primary}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={THEME.primary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                </div>
                New Event
              </button>
            </div>
          </Sheet>
        </>
      )}

      {/* Full-detail add sheet */}
      {showAddSheet && (
        <AddSheet mode={addSheetMode} onClose={() => setShowAddSheet(false)} />
      )}
    </div>
    </MobileActionsContext.Provider>
  );
}

// ─── Shared Section Label ──────────────────────────────────

function SectionLabel({ children, count, as = 'div', mb = 10, style }: { children: React.ReactNode; count?: number; as?: 'div' | 'label'; mb?: number; style?: React.CSSProperties }) {
  const Wrapper = as;
  return (
    <Wrapper className="flex items-center gap-2" style={{ margin: `0 0 ${mb}px`, ...style }}>
      <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: COLOR.muted }}>
        {children}
      </span>
      {count != null && count > 0 && (
        <span style={{
          fontSize: 11,
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
    </Wrapper>
  );
}

function CheckBadge({ color }: { color: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

// ─── Block/Event Detail Sheet (mobile) ──────────────────────

interface DetailSheetProps {
  item: AgendaItem;
  onClose: () => void;
  onConfirm?: (id: string) => void;
  onSkip?: (id: string) => void;
}

function DetailSheet({ item, onClose, onConfirm, onSkip }: DetailSheetProps) {
  const userStickerSet = useStickerSet();
  const categories = useStore((s) => s.categories);
  const timeBlocks = useStore((s) => s.timeBlocks);
  const events = useStore((s) => s.events);
  const tasks = useStore((s) => s.tasks);
  const deleteTimeBlock = useStore((s) => s.deleteTimeBlock);
  const deleteEvent = useStore((s) => s.deleteEvent);
  const updateTask = useStore((s) => s.updateTask);
  const updateTimeBlock = useStore((s) => s.updateTimeBlock);
  const updateEvent = useStore((s) => s.updateEvent);
  const stickers = useStore((s) => s.stickers);
  const addSticker = useStore((s) => s.addSticker);
  const deleteSticker = useStore((s) => s.deleteSticker);
  const { saveSnapshot } = useHistoryStore();
  const actions = React.useContext(MobileActionsContext);

  const today = getLocalDateString();
  const nowMins = (() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); })();

  // Find full block/event data
  const fullBlock = item.type === 'block' ? timeBlocks.find((b) => b.id === item.id) : null;
  const fullEvent = item.type === 'event' ? events.find((e) => e.id === item.id) : null;
  const linkedTask = fullBlock?.taskId ? tasks.find((t) => t.id === fullBlock.taskId) : null;
  const cat = categories.find((c) => c.id === (fullBlock?.categoryId ?? fullEvent?.categoryId));

  const startM = parseTimeToMinutes(item.start);
  const endM = parseTimeToMinutes(item.end);
  // Cross-midnight events end the next day: never show a negative duration (N-06).
  const durationMins = endM > startM ? endM - startM : endM - startM + 24 * 60;
  const itemEndDate = fullEvent?.endDate ?? fullEvent?.date ?? fullBlock?.date ?? '';
  const isPast = itemEndDate < today || (itemEndDate === today && endM <= nowMins);
  const isConfirmed = item.confirmationStatus === 'confirmed';
  const isSkipped = item.confirmationStatus === 'skipped';
  const isBlock = item.type === 'block';

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(item.title);
  const [editDate, setEditDate] = useState(fullBlock?.date ?? fullEvent?.date ?? today);
  const [editStart, setEditStart] = useState(item.start);
  const [editEnd, setEditEnd] = useState(item.end);
  const [editCategoryId, setEditCategoryId] = useState(fullBlock?.categoryId ?? fullEvent?.categoryId ?? '');

  const itemNoun = isBlock ? (linkedTask ? (linkedTask.isTodo === false ? 'note' : 'todo') : 'block') : 'event';
  const isSeriesEvent = !!fullEvent?.recurrenceSeriesId;
  // Same delete path as desktop: the shell asks Remove from calendar vs Delete todo, the
  // This / Following / All scope for repeating items, and whether to notify guests.
  const handleDelete = () => {
    if (isBlock && actions.deleteBlock) actions.deleteBlock(item.id);
    else if (!isBlock && actions.deleteEvent) actions.deleteEvent(item.id);
    else {
      saveSnapshot();
      if (isBlock) deleteTimeBlock(item.id);
      else {
        if (fullEvent?.googleEventId) dismissGcalEventId(item.id);
        deleteEvent(item.id);
      }
    }
    onClose();
  };

  // Nudge: shift the item by 15m / 1h / to tomorrow. Events go through the shell's move path
  // (This/Following/All prompt for repeating events, guest-notify for shared ones).
  const canNudge = !(fullEvent?.readOnly || fullEvent?.sharedFromShareId) && (!!fullBlock || !!fullEvent);
  const handleNudge = (kind: '15m' | '1h' | 'tomorrow') => {
    const curDate = fullBlock?.date ?? fullEvent?.date ?? today;
    let date = curDate;
    let sm = startM;
    if (kind === 'tomorrow') {
      date = addDaysStr(curDate, 1);
    } else {
      const abs = sm + (kind === '15m' ? 15 : 60);
      if (abs >= 24 * 60) {
        if (isBlock) { toast.error('Cannot move a block past midnight.'); return; }
        date = addDaysStr(curDate, Math.floor(abs / (24 * 60)));
      }
      sm = abs % (24 * 60);
    }
    const em = (sm + durationMins) % (24 * 60);
    if (isBlock && sm + durationMins >= 24 * 60) { toast.error('Cannot move a block past midnight.'); return; }
    const params = { date, startTime: minutesToHHMM(sm), endTime: minutesToHHMM(em) };
    if (isBlock) {
      if (actions.moveBlock) actions.moveBlock(item.id, params);
      else { saveSnapshot(); updateTimeBlock(item.id, { date, start: params.startTime, end: params.endTime }); undoToast('Moved'); }
    } else if (actions.moveEvent) {
      actions.moveEvent(item.id, params);
    } else {
      saveSnapshot();
      const endDate = em < sm ? addDaysStr(date, 1) : undefined;
      updateEvent(item.id, { date, start: params.startTime, end: params.endTime, endDate });
      undoToast('Moved');
    }
    onClose();
  };

  const missedSticker = stickers.find((st) => st.emoji === MISSED_STAMP && (isBlock ? st.blockId === item.id : st.eventId === item.id));
  const handleToggleMissed = () => {
    saveSnapshot();
    if (missedSticker) { deleteSticker(missedSticker.id); return; }
    addSticker({
      emoji: MISSED_STAMP,
      date: fullBlock?.date ?? fullEvent?.date ?? today,
      ...(isBlock ? { blockId: item.id } : { eventId: item.id }),
      offsetXPercent: 50,
      offsetYPercent: 50,
    });
  };

  const handleToggleTaskDone = () => {
    if (!linkedTask) return;
    // Desktop semantics (B-39): completing the task also confirms its blocks, un-completing undoes it.
    const was = linkedTask.status === 'done';
    if (actions.markTaskDone) { actions.markTaskDone(linkedTask.id); undoToast(was ? 'Marked not done' : 'Marked done'); return; }
    saveSnapshot();
    updateTask(linkedTask.id, { status: was ? 'inbox' : 'done' });
    undoToast(was ? 'Marked not done' : 'Marked done');
  };

  const [editError, setEditError] = useState<string | null>(null);
  const handleSaveEdit = () => {
    const normalizeTime = (t: string) => padTime(t);
    const normStart = normalizeTime(editStart);
    const normEnd = normalizeTime(editEnd);
    // B-36: end must be after start. Events may cross midnight (ends next day); blocks may not.
    const crossesMidnight = !isBlock && parseTimeToMinutes(normEnd) < parseTimeToMinutes(normStart);
    if (parseTimeToMinutes(normEnd) <= parseTimeToMinutes(normStart) && !crossesMidnight) {
      setEditError('End time must be after the start time.');
      return;
    }
    setEditError(null);
    saveSnapshot();
    undoToast('Changes saved');

    if (isBlock && fullBlock) {
      updateTimeBlock(item.id, {
        title: editTitle,
        date: editDate,
        start: normStart,
        end: normEnd,
        categoryId: editCategoryId,
        editedAt: Date.now(),
      });
      // Also update linked task title if changed
      if (linkedTask && editTitle !== linkedTask.title) {
        updateTask(linkedTask.id, { title: editTitle, categoryId: editCategoryId });
      }
    } else if (fullEvent) {
      const next = {
        title: editTitle,
        date: editDate,
        start: normStart,
        end: normEnd,
        endDate: crossesMidnight ? addDaysStr(editDate, 1) : undefined,
        categoryId: editCategoryId,
      };
      actions.eventEdited?.(item.id, next);
      updateEvent(item.id, next);
    }
    setIsEditing(false);
    onClose();
  };

  const addDaysStr = (d: string, n: number) => {
    const dt = new Date(d + 'T12:00:00');
    dt.setDate(dt.getDate() + n);
    return getLocalDateString(dt);
  };

  // Format time for HTML input (needs HH:MM with leading zeros)
  const toInputTime = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  return (
    <>
      {/* Backdrop */}
      <Sheet onBackdropClick={onClose} maxHeight="80dvh">

        <div style={{ padding: '4px 20px 16px' }}>
          {isEditing ? (
            /* ─── Edit Mode ─── */
            <>
              {/* Title input */}
              <div style={{ marginBottom: 12 }}>
                <SectionLabel as="label" mb={4}>Title</SectionLabel>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: 10,
                    border: '1px solid rgba(0,0,0,0.12)', fontSize: 15,
                    color: THEME.textPrimary, backgroundColor: 'rgba(0,0,0,0.02)',
                    outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Date input */}
              <div style={{ marginBottom: 12 }}>
                <SectionLabel as="label" mb={4}>Date</SectionLabel>
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: 10,
                    border: '1px solid rgba(0,0,0,0.12)', fontSize: 14,
                    color: THEME.textPrimary, backgroundColor: 'rgba(0,0,0,0.02)',
                    outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Time inputs */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                <div style={{ flex: 1 }}>
                  <SectionLabel as="label" mb={4}>Start</SectionLabel>
                  <input
                    type="time"
                    value={toInputTime(editStart)}
                    onChange={(e) => setEditStart(e.target.value)}
                    style={{
                      width: '100%', padding: '10px 12px', borderRadius: 10,
                      border: '1px solid rgba(0,0,0,0.12)', fontSize: 14,
                      color: THEME.textPrimary, backgroundColor: 'rgba(0,0,0,0.02)',
                      outline: 'none', boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <SectionLabel as="label" mb={4}>End</SectionLabel>
                  <input
                    type="time"
                    value={toInputTime(editEnd)}
                    onChange={(e) => setEditEnd(e.target.value)}
                    style={{
                      width: '100%', padding: '10px 12px', borderRadius: 10,
                      border: '1px solid rgba(0,0,0,0.12)', fontSize: 14,
                      color: THEME.textPrimary, backgroundColor: 'rgba(0,0,0,0.02)',
                      outline: 'none', boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              {editError && (
                <p role="alert" style={{ fontSize: 12, color: COLOR.danger, margin: '0 0 10px' }}>{editError}</p>
              )}
              {isSeriesEvent && (
                <p style={{ fontSize: 12, color: COLOR.muted, margin: '0 0 10px' }}>
                  This event repeats. Changes here apply to this occurrence only; use the desktop app to edit the whole series.
                </p>
              )}

              {/* Category picker */}
              <div style={{ marginBottom: 16 }}>
                <SectionLabel as="label" mb={6}>Category</SectionLabel>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {categories.map((c) => {
                    const isSel = editCategoryId === c.id;
                    return (
                      <button key={c.id} type="button" onClick={() => setEditCategoryId(c.id)} className="touch-manipulation"
                        style={{
                          display: 'flex', alignItems: 'center', gap: 5,
                          padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                          border: isSel ? 'none' : '1px solid rgba(0,0,0,0.10)',
                          backgroundColor: isSel ? `${c.color}20` : 'transparent',
                          color: isSel ? c.color : COLOR.text2,
                        }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: c.color }} />
                        {c.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Save / Cancel buttons */}
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="touch-manipulation"
                  style={{
                    flex: 1, padding: '10px', borderRadius: 10, fontSize: 14, fontWeight: 500,
                    border: '1px solid rgba(0,0,0,0.10)', backgroundColor: 'transparent', color: COLOR.text2,
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={!editTitle.trim()}
                  className="touch-manipulation"
                  style={{
                    flex: 2, padding: '10px', borderRadius: 10, fontSize: 14, fontWeight: 600,
                    border: 'none',
                    backgroundColor: editTitle.trim() ? THEME.primary : 'rgba(0,0,0,0.06)',
                    color: editTitle.trim() ? '#FFFFFF' : COLOR.muted,
                  }}
                >
                  Save
                </button>
              </div>
            </>
          ) : (
            /* ─── View Mode ─── */
            <>
          {/* Category + color accent */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: item.color, flexShrink: 0 }} />
            {cat && <span style={{ fontSize: 12, fontWeight: 500, color: item.color }}>{cat.name}</span>}
            <span style={{ fontSize: 11, color: COLOR.muted, marginLeft: 'auto' }}>
              {itemNoun === 'event' ? 'Event' : itemNoun === 'block' ? 'Block' : itemNoun === 'note' ? 'Note' : 'To-do'}
            </span>
          </div>

          {/* Title */}
          <h3 style={{
            fontSize: 17, fontWeight: 600, color: THEME.textPrimary,
            margin: '0 0 8px', lineHeight: 1.3, wordBreak: 'break-word',
            textDecoration: (isConfirmed || isSkipped) ? 'line-through' : 'none',
          }}>
            {item.title}
          </h3>

          {/* Time + duration */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: THEME.textSecondary }}>
              <ClockIcon style={{ width: 14, height: 14 }} />
              {formatTime12(item.start)} – {formatTime12(item.end)}
            </span>
            <span style={{ fontSize: 12, color: COLOR.muted, fontWeight: 500 }}>
              {durationMins >= 60
                ? `${Math.floor(durationMins / 60)}h${durationMins % 60 > 0 ? ` ${durationMins % 60}m` : ''}`
                : `${durationMins}m`
              }
            </span>
          </div>

          {/* Priority stars */}
          {linkedTask && linkedTask.priority != null && linkedTask.priority > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginBottom: 8 }}>
              {Array.from({ length: Math.min(linkedTask.priority, 5) }, (_, i) => (
                <StarIcon key={i} style={{ width: 12, height: 12, color: '#F5A623' }} />
              ))}
            </div>
          )}

          {/* Description */}
          {linkedTask?.description && (
            <p style={{ fontSize: 13, color: COLOR.text2, margin: '0 0 8px', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
              {linkedTask.description}
            </p>
          )}

          {/* Notes */}
          {linkedTask?.notes && (
            <p style={{ fontSize: 13, fontStyle: 'italic', color: COLOR.text2, margin: '0 0 8px', lineHeight: 1.5, whiteSpace: 'pre-wrap', paddingTop: 6, borderTop: '1px solid rgba(0,0,0,0.05)' }}>
              {linkedTask.notes}
            </p>
          )}

          {/* Tags */}
          {linkedTask?.tags && linkedTask.tags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {linkedTask.tags.map(tag => (
                <span key={tag.id} style={{
                  fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 99,
                  backgroundColor: hexToRgba(item.color, 0.08), color: item.color,
                  border: `1px solid ${hexToRgba(item.color, 0.18)}`,
                }}>{tag.name}</span>
              ))}
            </div>
          )}

          {/* Due date */}
          {linkedTask?.dueDate && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 10, fontSize: 12 }}>
              <CalendarIcon style={{ width: 13, height: 13, color: COLOR.muted }} />
              <span style={{ color: THEME.textSecondary }}>Due {formatDateHeader(linkedTask.dueDate)}</span>
            </div>
          )}

          {/* Status indicator */}
          {(isConfirmed || isSkipped) && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px',
              borderRadius: 8, marginBottom: 12, fontSize: 12, fontWeight: 500,
              backgroundColor: isConfirmed ? hexToRgba(item.color, 0.08) : 'rgba(0,0,0,0.04)',
              color: isConfirmed ? item.color : COLOR.muted,
            }}>
              {isConfirmed ? <CheckIcon style={{ width: 13, height: 13 }} /> : <XMarkIcon style={{ width: 13, height: 13 }} />}
              {isConfirmed ? 'Confirmed' : 'Skipped'}
            </div>
          )}

          {/* Actions */}
          <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: 12, marginTop: 4 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {/* Nudge: shift without opening the editor */}
              {canNudge && (
                <div data-testid="nudge-row" style={{ display: 'flex', gap: 8, padding: '4px 0 8px' }}>
                  {([['15m', '+15m'], ['1h', '+1h'], ['tomorrow', 'Tomorrow']] as const).map(([k, label]) => (
                    <button
                      key={k}
                      type="button"
                      data-testid={`nudge-${k}`}
                      onClick={() => handleNudge(k)}
                      className="touch-manipulation"
                      style={{ flex: 1, minHeight: 44, borderRadius: 10, border: `1px solid ${COLOR.border}`, backgroundColor: 'transparent', fontSize: 13, fontWeight: 600, color: THEME.textPrimary }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}

              {/* Edit button */}
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="touch-manipulation"
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '12px 4px',
                  border: 'none', backgroundColor: 'transparent',
                  fontSize: 14, fontWeight: 500, color: THEME.primary,
                  borderRadius: 8, width: '100%', textAlign: 'left',
                }}
              >
                <PencilIcon style={{ width: 18, height: 18 }} />
                Edit
              </button>

              {/* Confirm / Skip for past unconfirmed events */}
              {isBlock && isPast && !isConfirmed && !isSkipped && onConfirm && (
                <button
                  type="button"
                  onClick={() => { onConfirm(item.id); onClose(); }}
                  className="touch-manipulation"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '12px 4px',
                    border: 'none', backgroundColor: 'transparent',
                    fontSize: 14, fontWeight: 500, color: item.color,
                    borderRadius: 8, width: '100%', textAlign: 'left',
                  }}
                >
                  <CheckIcon style={{ width: 18, height: 18 }} />
                  Mark as done
                </button>
              )}
              {isBlock && isPast && !isConfirmed && !isSkipped && onSkip && (
                <button
                  type="button"
                  onClick={() => { onSkip(item.id); onClose(); }}
                  className="touch-manipulation"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '12px 4px',
                    border: 'none', backgroundColor: 'transparent',
                    fontSize: 14, fontWeight: 500, color: COLOR.muted,
                    borderRadius: 8, width: '100%', textAlign: 'left',
                  }}
                >
                  <XMarkIcon style={{ width: 18, height: 18 }} />
                  Skip
                </button>
              )}

              {/* Mark linked task done/undone */}
              {linkedTask && linkedTask.isTodo !== false && (
                <button
                  type="button"
                  onClick={() => { handleToggleTaskDone(); onClose(); }}
                  className="touch-manipulation"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '12px 4px',
                    border: 'none', backgroundColor: 'transparent',
                    fontSize: 14, fontWeight: 500, color: linkedTask.status === 'done' ? COLOR.muted : '#6A8C5A',
                    borderRadius: 8, width: '100%', textAlign: 'left',
                  }}
                >
                  <CheckIcon style={{ width: 18, height: 18 }} />
                  {linkedTask.status === 'done' ? 'Mark task not done' : 'Mark task done'}
                </button>
              )}

              {/* Quick reflection: "How did it go?" note + sticker reactions (past or in-progress items) */}
              {(isPast || (itemEndDate === today && startM <= nowMins)) && (
                <div data-testid="how-did-it-go" style={{ padding: '8px 4px 12px', borderBottom: '1px solid rgba(0,0,0,0.05)', marginBottom: 4 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: COLOR.muted, margin: '0 0 8px' }}>How did it go?</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                    {userStickerSet.map((em) => {
                      const existing = stickers.find((st) => st.emoji === em && (isBlock ? st.blockId === item.id : st.eventId === item.id));
                      return (
                        <button key={em} type="button" className="touch-manipulation" aria-pressed={!!existing}
                          onClick={() => {
                            saveSnapshot();
                            if (existing) { deleteSticker(existing.id); return; }
                            addSticker({ emoji: em, date: fullBlock?.date ?? fullEvent?.date ?? today, ...(isBlock ? { blockId: item.id } : { eventId: item.id }), offsetXPercent: 80, offsetYPercent: 30 });
                          }}
                          style={{ width: 44, height: 44, borderRadius: 12, fontSize: 22, border: `1px solid ${existing ? THEME.primary : COLOR.border}`, backgroundColor: existing ? `${THEME.primary}14` : 'transparent' }}>
                          {em}
                        </button>
                      );
                    })}
                  </div>
                  <textarea
                    defaultValue={(fullBlock?.notes ?? fullEvent?.notes ?? '') || ''}
                    placeholder="Add a quick note..."
                    rows={2}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v === ((fullBlock?.notes ?? fullEvent?.notes ?? '') || '')) return;
                      saveSnapshot();
                      if (isBlock) updateTimeBlock(item.id, { notes: v || null });
                      else updateEvent(item.id, { notes: v || null });
                    }}
                    style={{ width: '100%', boxSizing: 'border-box', fontSize: 16, padding: '8px 10px', borderRadius: 10, border: `1px solid ${COLOR.border}`, resize: 'none', fontFamily: 'inherit', color: THEME.textPrimary, background: 'transparent' }}
                  />
                </div>
              )}

              {/* Didn't happen — red cross on the card */}
              <button
                type="button"
                onClick={() => { handleToggleMissed(); onClose(); }}
                className="touch-manipulation"
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '12px 4px',
                  border: 'none', backgroundColor: 'transparent',
                  fontSize: 14, fontWeight: 500, color: missedSticker ? COLOR.muted : COLOR.danger,
                  borderRadius: 8, width: '100%', textAlign: 'left',
                }}
              >
                <XMarkIcon style={{ width: 18, height: 18 }} />
                {missedSticker ? "Undo didn't happen" : "Didn't happen"}
              </button>

              {/* Delete */}
              <button
                type="button"
                onClick={handleDelete}
                className="touch-manipulation"
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '12px 4px',
                  border: 'none', backgroundColor: 'transparent',
                  fontSize: 14, fontWeight: 500, color: '#C87868',
                  borderRadius: 8, width: '100%', textAlign: 'left',
                }}
              >
                <TrashIcon style={{ width: 18, height: 18 }} />
                {isBlock && linkedTask ? `Delete ${itemNoun}...` : isSeriesEvent ? 'Delete event...' : `Delete ${itemNoun}`}
              </button>
            </div>
          </div>
            </>
          )}
        </div>
      </Sheet>
    </>
  );
}

// ─── Full-Detail Add Sheet ─────────────────────────────────

interface AddSheetPrefill { title: string; date: string; startTime: string; endTime: string; isTodo: boolean; asTask?: boolean }

function AddSheet({ mode, onClose, prefill }: { mode: 'task' | 'event'; onClose: () => void; prefill?: AddSheetPrefill }) {
  const calendarContainers = useStore((s) => s.calendarContainers);
  const categories = useStore((s) => s.categories);
  const tags = useStore((s) => s.tags);
  const addTask = useStore((s) => s.addTask);
  const addEvent = useStore((s) => s.addEvent);
  const addTimeBlock = useStore((s) => s.addTimeBlock);
  const { saveSnapshot } = useHistoryStore();

  const today = getLocalDateString();

  // Shared
  const [title, setTitle] = useState(prefill?.title ?? '');
  const [calendarId, setCalendarId] = useState(calendarContainers[0]?.id ?? '');
  const [categoryId, setCategoryId] = useState('');
  const [notes, setNotes] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Task-specific
  const [estimatedMins, setEstimatedMins] = useState(30);
  const [dueDate, setDueDate] = useState('');
  const [isTodo, setIsTodo] = useState(prefill?.isTodo ?? false);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  // Event-specific
  const [eventDate, setEventDate] = useState(prefill?.date ?? today);
  const [eventStart, setEventStart] = useState(() => {
    if (prefill) return prefill.startTime;
    const now = new Date();
    const h = now.getHours();
    const m = Math.ceil(now.getMinutes() / 15) * 15;
    const sh = m >= 60 ? h + 1 : h;
    const sm = m >= 60 ? 0 : m;
    return `${String(sh).padStart(2, '0')}:${String(sm).padStart(2, '0')}`;
  });
  const [eventEnd, setEventEnd] = useState(() => {
    if (prefill) return prefill.endTime;
    const now = new Date();
    const h = now.getHours();
    const m = Math.ceil(now.getMinutes() / 15) * 15;
    const sh = m >= 60 ? h + 1 : h;
    const sm = m >= 60 ? 0 : m;
    return `${String(sh + 1).padStart(2, '0')}:${String(sm).padStart(2, '0')}`;
  });

  const filteredCategories = calendarId
    ? categories.filter((c) => {
        const ids = c.calendarContainerIds;
        if (ids && ids.length > 0) return ids.includes(calendarId);
        return c.calendarContainerId === calendarId || !c.calendarContainerId;
      })
    : categories;

  useEffect(() => {
    if (!categoryId && filteredCategories.length > 0) setCategoryId(filteredCategories[0].id);
  }, [calendarId]);

  useEffect(() => {
    const first = filteredCategories[0];
    setCategoryId(first ? first.id : '');
    setSelectedTagIds([]);
  }, [calendarId]);

  const selectedCategory = categories.find((c) => c.id === categoryId);
  const categoryTags = tags.filter((t) => t.categoryId === categoryId);

  const toggleTag = (id: string) => setSelectedTagIds((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 100); }, []);

  const parsed = useMemo(() => parseQuickAdd(title), [title]);
  const hasParse = !!title.trim() && (parsed.hasDate || parsed.hasTime || !!parsed.durationMins);
  const finalTitle = hasParse && parsed.title ? parsed.title : title.trim();
  const canSubmit = title.trim() && (categoryId || filteredCategories.length === 0) && (mode === 'task' || (eventStart && eventEnd));

  const handleSubmit = () => {
    if (!canSubmit) return;
    const effStart = hasParse && parsed.hasTime && parsed.start ? parsed.start : eventStart;
    const effEnd = hasParse && parsed.hasTime && parsed.start ? (parsed.end ?? minutesToHHMM(Math.min(parseTimeToMinutes(parsed.start) + (parsed.durationMins ?? 60), 1439))) : eventEnd;
    const crossesMidnight = mode === 'event' && parseTimeToMinutes(effEnd) < parseTimeToMinutes(effStart);
    if (mode === 'event' && parseTimeToMinutes(effEnd) === parseTimeToMinutes(effStart)) {
      toast.error('End time must be after the start time.');
      return;
    }
    // Quick-parse overrides: "standup 10-11 tomorrow" fills date/time without touching the pickers.
    const pDate = hasParse && parsed.date ? parsed.date : undefined;
    const pStart = hasParse && parsed.hasTime ? parsed.start : undefined;
    const pEnd = pStart ? (mode === 'task' && !isTodo ? minutesToHHMM(Math.min(parseTimeToMinutes(pStart) + 60, 1439)) : (parsed.end ?? minutesToHHMM(Math.min(parseTimeToMinutes(pStart) + (parsed.durationMins ?? 60), 1439)))) : undefined;
    saveSnapshot();
    undoToast(mode === 'task' ? (isTodo ? 'To-do added' : 'Note added') : 'Event added');
    const cat = categories.find((c) => c.id === categoryId);
    const calId = calendarId || (cat?.calendarContainerId ?? calendarContainers[0]?.id ?? '');
    if (mode === 'task') {
      const newTaskId = addTask({
        title: finalTitle,
        estimatedMinutes: !isTodo ? 60 : prefill ? Math.max(15, parseTimeToMinutes(prefill.endTime) - parseTimeToMinutes(prefill.startTime)) : estimatedMins,
        calendarContainerId: calId,
        categoryId,
        tagIds: selectedTagIds,
        flexible: true,
        status: 'inbox',
        notes: notes.trim() || undefined,
        dueDate: dueDate || (!pStart ? pDate : undefined) || undefined,
        isTodo,
      });
      if (!prefill && newTaskId && pStart && pEnd) {
        addTimeBlock({
          taskId: newTaskId, title: finalTitle, calendarContainerId: calId, categoryId, tagIds: selectedTagIds,
          start: pStart, end: pEnd, date: pDate ?? today, mode: 'planned', source: 'manual',
        } as any);
      }
      if (prefill && newTaskId) {
        addTimeBlock({
          taskId: newTaskId, title: finalTitle, calendarContainerId: calId, categoryId, tagIds: selectedTagIds,
          start: prefill.startTime, end: !isTodo ? minutesToHHMM(Math.min(parseTimeToMinutes(prefill.startTime) + 60, 1439)) : prefill.endTime, date: prefill.date, mode: 'planned', source: 'manual',
        } as any);
      }
    } else {
      const normalizeTime = (t: string) => padTime(t);
      addEvent({
        title: finalTitle,
        calendarContainerId: calId,
        categoryId,
        date: pDate ?? eventDate,
        start: normalizeTime(pStart ?? eventStart),
        end: normalizeTime(pEnd ?? eventEnd),
        ...(crossesMidnight ? { endDate: (() => { const d = new Date((pDate ?? eventDate) + 'T12:00:00'); d.setDate(d.getDate() + 1); return getLocalDateString(d); })() } : {}),
        recurring: false,
        source: 'manual',
        notes: notes.trim() || undefined,
      } as any);
    }
    onClose();
  };

  const fmtDuration = (m: number) => m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 > 0 ? ` ${m % 60}m` : ''}`;

  const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(0,0,0,0.10)', fontSize: 16, color: THEME.textPrimary, backgroundColor: 'rgba(0,0,0,0.02)', outline: 'none', boxSizing: 'border-box', minHeight: 44 };
  const chipStyle = (sel: boolean, color?: string): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500,
    border: sel ? 'none' : '1px solid rgba(0,0,0,0.10)',
    backgroundColor: sel && color ? `${color}20` : sel ? `${THEME.primary}15` : 'transparent',
    color: sel && color ? color : sel ? THEME.primary : COLOR.text2,
  });

  return (
    <>
      <Sheet onBackdropClick={onClose} maxHeight="90dvh">

        <div style={{ padding: '4px 20px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <p style={{ fontSize: 17, fontWeight: 600, color: THEME.textPrimary, margin: 0 }}>
              {mode === 'task' ? (isTodo ? 'New To-do' : 'New Note') : 'New Event'}
            </p>
            <button type="button" onClick={onClose} className="touch-manipulation" style={{ border: 'none', background: 'transparent', color: COLOR.muted, padding: 4 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>

          {/* Title */}
          <div>
            <SectionLabel as="label" mb={5}>Title</SectionLabel>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {mode === 'task' && <TodoToggle checked={isTodo} onChange={setIsTodo} size={20} />}
              <input
                ref={inputRef}
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
                placeholder={mode === 'task' ? (isTodo ? 'To-do...' : 'Note...') : 'Event title...'}
                style={{ ...inputStyle, flex: 1, minWidth: 0 }}
              />
            </div>
            {hasParse && (
              <div data-testid="addsheet-parse-chip" style={{ marginTop: 6, fontSize: 12, color: COLOR.text2 }}>
                {describeQuickParse(parsed) || (parsed.durationMins ? `${parsed.durationMins} min` : '')}
              </div>
            )}
          </div>

          {/* Event-only: date + time */}
          {mode === 'event' && (
            <>
              <div>
                <SectionLabel as="label" mb={5}>Date</SectionLabel>
                <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} style={{ ...inputStyle, fontSize: 16 }} />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <SectionLabel as="label" mb={5}>Start</SectionLabel>
                  <input type="time" value={eventStart} onChange={(e) => setEventStart(e.target.value)}
                    style={{ ...inputStyle, fontSize: 14, padding: '10px 10px' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <SectionLabel as="label" mb={5}>End</SectionLabel>
                  <input type="time" value={eventEnd} onChange={(e) => setEventEnd(e.target.value)}
                    style={{ ...inputStyle, fontSize: 14, padding: '10px 10px' }} />
                </div>
              </div>
            </>
          )}

          {/* Task-only: estimated time */}
          {mode === 'task' && isTodo && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                <SectionLabel as="label" mb={0}>Estimated Time</SectionLabel>
                <span style={{ fontSize: 12, fontWeight: 600, color: THEME.textPrimary }}>{fmtDuration(estimatedMins)}</span>
              </div>
              <input
                type="range" min={5} max={240} step={5} value={estimatedMins}
                onChange={(e) => setEstimatedMins(Number(e.target.value))}
                style={{ width: '100%', height: 4, appearance: 'none', WebkitAppearance: 'none', background: `linear-gradient(to right, ${THEME.primary} 0%, ${THEME.primary} ${((estimatedMins - 5) / 235) * 100}%, rgba(0,0,0,0.08) ${((estimatedMins - 5) / 235) * 100}%, rgba(0,0,0,0.08) 100%)`, borderRadius: 2, outline: 'none', cursor: 'pointer', accentColor: THEME.primary }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                <span style={{ fontSize: 11, color: COLOR.muted }}>5m</span>
                <span style={{ fontSize: 11, color: COLOR.muted }}>4h</span>
              </div>
            </div>
          )}

          {/* Calendar (if multiple) */}
          {calendarContainers.length > 1 && (
            <div>
              <SectionLabel as="label" mb={5}>Calendar</SectionLabel>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {calendarContainers.map((cal) => (
                  <button key={cal.id} type="button" onClick={() => setCalendarId(cal.id)} className="touch-manipulation"
                    style={chipStyle(calendarId === cal.id, cal.color)}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: cal.color }} />
                    {cal.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Category */}
          <div>
            <SectionLabel as="label" mb={5}>Category</SectionLabel>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {filteredCategories.length === 0 && (
                <span style={{ fontSize: 12, color: COLOR.muted }}>No categories in this calendar yet. You can add one later.</span>
              )}
              {filteredCategories.map((c) => (
                <button key={c.id} type="button" onClick={() => setCategoryId(c.id)} className="touch-manipulation"
                  style={chipStyle(categoryId === c.id, c.color)}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: c.color }} />
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          {/* Tags (task only, if category has tags) */}
          {mode === 'task' && selectedCategory && categoryTags.length > 0 && (
            <div>
              <SectionLabel as="label" mb={5}>Tags <span style={{ fontWeight: 400, color: COLOR.muted }}>(optional)</span></SectionLabel>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {categoryTags.map((tag) => (
                  <button key={tag.id} type="button" onClick={() => toggleTag(tag.id)} className="touch-manipulation"
                    style={chipStyle(selectedTagIds.includes(tag.id), selectedCategory.color)}>
                    {tag.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Task-only: due date */}
          {mode === 'task' && (
            <div>
              <SectionLabel as="label" mb={5}>Due Date <span style={{ fontWeight: 400, color: COLOR.muted }}>(optional)</span></SectionLabel>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
                style={{ ...inputStyle, fontSize: 16 }} />
            </div>
          )}

          {/* Notes */}
          <div>
            <SectionLabel as="label" mb={5}>Notes <span style={{ fontWeight: 400, color: COLOR.muted }}>(optional)</span></SectionLabel>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add context, links, or reminders..."
              rows={3}
              style={{ ...inputStyle, fontSize: 13, lineHeight: 1.5, resize: 'none', fontFamily: 'inherit' }}
            />
          </div>

          {/* Submit */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="touch-manipulation"
            style={{
              width: '100%', padding: '13px', borderRadius: 12, fontSize: 15, fontWeight: 600,
              border: 'none',
              backgroundColor: canSubmit ? THEME.primary : 'rgba(0,0,0,0.06)',
              color: canSubmit ? '#FFFFFF' : COLOR.muted,
              cursor: canSubmit ? 'pointer' : 'default',
            }}
          >
            {mode === 'task' ? 'Add Note' : 'Create Event'}
          </button>
        </div>
      </Sheet>
    </>
  );
}

/**
 * Pointer-drag start for touch + mouse on top of utils/dragState. Mouse drags start after a few px
 * like on desktop; touch needs a ~300ms press-and-hold (so vertical swipes still scroll the list),
 * after which the page is locked from scrolling until the finger lifts.
 */
function startLongPressDrag(e: React.PointerEvent, opts: PointerDragOptions) {
  if (e.pointerType !== 'touch') {
    initPointerDrag(e.nativeEvent, opts);
    return;
  }
  let lastX = e.clientX;
  let lastY = e.clientY;
  const startX = e.clientX;
  const startY = e.clientY;
  let armed = false;
  const lock = (ev: TouchEvent) => { if (ev.cancelable) ev.preventDefault(); };
  const cleanup = () => {
    clearTimeout(timer);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', cleanup);
    window.removeEventListener('pointercancel', cleanup);
    document.removeEventListener('touchmove', lock);
  };
  const onMove = (ev: PointerEvent) => {
    lastX = ev.clientX; lastY = ev.clientY;
    if (!armed && Math.hypot(lastX - startX, lastY - startY) > 8) cleanup(); // it's a scroll, not a drag
  };
  const timer = setTimeout(() => {
    armed = true;
    window.removeEventListener('pointermove', onMove);
    document.addEventListener('touchmove', lock, { passive: false });
    try { navigator.vibrate?.(8); } catch { /* not supported */ }
    initPointerDrag({ button: 0, clientX: lastX, clientY: lastY }, { ...opts, onDragEnd: () => { opts.onDragEnd?.(); } });
    // initPointerDrag only listens for pointermove after the drag threshold; nudge it with the next events.
  }, 300);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', cleanup);
  window.addEventListener('pointercancel', cleanup);
}

// ─── PLAN Tab (Split: day view left + task blocks right) ────

const PLAN_HOUR_HEIGHT = 56;
const PLAN_TIME_COL = 32;

function PlanTab() {
  const timeBlocks = useStore((s) => s.timeBlocks);
  const events = useStore((s) => s.events);
  const tasks = useStore((s) => s.tasks);
  const categories = useStore((s) => s.categories);
  const calendarContainers = useStore((s) => s.calendarContainers);
  const addTimeBlock = useStore((s) => s.addTimeBlock);
  const updateTask = useStore((s) => s.updateTask);
  const wakeTime = useStore((s) => s.wakeTime);
  const sleepTime = useStore((s) => s.sleepTime);
  const { saveSnapshot } = useHistoryStore();

  const today = getLocalDateString();
  const nowMins = useCurrentMinutes();
  const [selectedDate, setSelectedDate] = React.useContext(SharedDateContext)!;
  const [miniOpen, setMiniOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [dropPreviewMins, setDropPreviewMins] = useState<number | null>(null);
  const [confirmedMsg, setConfirmedMsg] = useState<string | null>(null);

  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const leftPanelRef = useRef<HTMLDivElement>(null);

  // Create mode (Event | Todo): long-press then drag on the empty timeline to create.
  const [createMode, setCreateModeValue] = useCreateMode();
  const addEventAction = useStore((s) => s.addEvent);
  const addTaskAction = useStore((s) => s.addTask);
  const [mobCreate, setMobCreate] = useState<{ anchorMins: number; startMins: number; endMins: number } | null>(null);
  const [mobSheet, setMobSheet] = useState<AddSheetPrefill | null>(null);
  const [mobInline, setMobInline] = useState<{ startTime: string; endTime: string; anchor: { x: number; y: number }; mode: CreateMode } | null>(null);
  const startTimelineCreate = (e: React.PointerEvent<HTMLDivElement>) => {
    if (selectedTaskId || e.button !== 0) return;
    const host = e.currentTarget;
    const startX = e.clientX, startY = e.clientY;
    let lastY = startY;
    let armed = false;
    const toMins = (y: number) => {
      const r = host.getBoundingClientRect();
      const m = Math.round((((y - r.top) / PLAN_HOUR_HEIGHT) * 60) / 15) * 15 + gridStartMins;
      return Math.max(gridStartMins, Math.min(m, 1440));
    };
    const lock = (ev: TouchEvent) => { if (ev.cancelable) ev.preventDefault(); };
    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', cancel);
      document.removeEventListener('touchmove', lock);
    };
    let anchor = 0;
    const apply = (y: number) => {
      const cur = toMins(y);
      const a = Math.min(anchor, cur);
      const b = Math.max(Math.max(anchor, cur), a + 15);
      setMobCreate({ anchorMins: anchor, startMins: a, endMins: Math.min(b, 1440) });
    };
    const onMove = (ev: PointerEvent) => {
      lastY = ev.clientY;
      if (!armed) { if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > 8) cleanup(); return; }
      apply(ev.clientY);
    };
    const cancel = () => { cleanup(); setMobCreate(null); };
    const onUp = (ev: PointerEvent) => {
      const wasArmed = armed;
      cleanup();
      if (!wasArmed) return;
      const cur = toMins(ev.clientY);
      const a = Math.min(anchor, cur);
      const b = Math.min(Math.max(Math.max(anchor, cur), a + 15), 1440);
      setMobCreate(null);
      const toStr = (m: number) => (m >= 1440 ? '23:59' : minutesToHHMM(m));
      setMobInline({ startTime: toStr(Math.min(a, 1425)), endTime: toStr(b), anchor: { x: ev.clientX, y: ev.clientY }, mode: getCreateMode() });
    };
    const timer = setTimeout(() => {
      armed = true;
      anchor = toMins(lastY);
      document.addEventListener('touchmove', lock, { passive: false });
      try { navigator.vibrate?.(8); } catch { /* not supported */ }
      apply(lastY);
    }, 450);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', cancel);
  };
  const finishTimelineCreate = (title: string | null, todoOn = true) => {
    const ic = mobInline;
    setMobInline(null);
    if (!ic || !title) return;
    const cals = calendarContainers.filter((c) => !c.id.startsWith('gcal-'));
    const cat = categories.find((c) => c.calendarContainerId && cals.some((k) => k.id === c.calendarContainerId)) ?? categories[0];
    const cal = (cat?.calendarContainerId && cals.find((c) => c.id === cat.calendarContainerId)) || cals[0];
    if (!cal || !cat) { toast.error('Create a calendar and category first.'); return; }
    saveSnapshot();
    undoToast(ic.mode === 'event' ? 'Event added' : todoOn ? 'To-do added' : 'Note added');
    if (ic.mode === 'event') {
      addEventAction({ title, calendarContainerId: cal.id, categoryId: cat.id, date: selectedDate, start: ic.startTime, end: ic.endTime, recurring: false } as any);
    } else {
      // A note has no time: fixed 1h block from the drag start.
      const mins = todoOn ? Math.max(15, parseTimeToMinutes(ic.endTime) - parseTimeToMinutes(ic.startTime)) : 60;
      const endT = todoOn ? ic.endTime : minutesToHHMM(Math.min(parseTimeToMinutes(ic.startTime) + 60, 1439));
      const taskId = addTaskAction({
        title, estimatedMinutes: mins, calendarContainerId: cal.id, categoryId: cat.id, tagIds: [], flexible: true, isTodo: todoOn,
      } as any);
      if (taskId) {
        addTimeBlock({
          taskId, title, calendarContainerId: cal.id, categoryId: cat.id, tagIds: [],
          start: ic.startTime, end: endT, date: selectedDate, mode: 'planned', source: 'manual',
        } as any);
      }
    }
  };

  const wakeHour = Math.floor(parseTimeToMinutes(wakeTime || '8:00') / 60);
  const sleepHour = Math.ceil(parseTimeToMinutes(sleepTime || '23:00') / 60);
  const hours = useMemo(() => {
    const h: number[] = [];
    for (let i = wakeHour; i <= sleepHour; i++) h.push(i);
    return h;
  }, [wakeHour, sleepHour]);
  const gridStartMins = wakeHour * 60;

  // Tasks not yet fully scheduled for the selected date
  const scheduledTaskIds = useMemo(() => {
    const ids = new Set<string>();
    for (const b of timeBlocks) { if (b.date === selectedDate && b.taskId) ids.add(b.taskId); }
    return ids;
  }, [timeBlocks, selectedDate]);

  const pendingTasks = useMemo(() => {
    // Notes only show here while they have no block anywhere ("Unplaced notes"), so they can be dragged onto the day.
    const placedAnywhere = new Set<string>();
    for (const b of timeBlocks) if (b.taskId) placedAnywhere.add(b.taskId);
    return tasks.filter((t) => t.status !== 'done' && t.status !== 'archived' && !scheduledTaskIds.has(t.id) && (t.isTodo !== false || !placedAnywhere.has(t.id)));
  }, [tasks, scheduledTaskIds, timeBlocks]);

  const agenda = useMemo(() => {
    const items: AgendaItem[] = [];
    for (const b of timeBlocks.filter((b) => b.date === selectedDate)) {
      const cat = categories.find((c) => c.id === b.categoryId);
      items.push({ type: 'block', id: b.id, title: b.title ?? 'Untitled', start: b.start, end: b.end, color: cat?.color ?? THEME.primary, confirmationStatus: b.confirmationStatus, taskId: b.taskId, isNote: !!b.taskId && tasks.find((t) => t.id === b.taskId)?.isTodo === false });
    }
    for (const e of events.filter((e) => e.date === selectedDate)) {
      const cat = categories.find((c) => c.id === e.categoryId);
      items.push({ type: 'event', id: e.id, title: e.title, start: e.start, end: e.end, color: cat?.color ?? THEME.primary });
    }
    return items;
  }, [timeBlocks, events, selectedDate, categories, tasks]);

  const selectedTask = tasks.find((t) => t.id === selectedTaskId);
  const dragTask = dragTaskId ? tasks.find((t) => t.id === dragTaskId) : undefined;

  const navigateDate = (dir: -1 | 1) => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + dir);
    setSelectedDate(getLocalDateString(d));
    setSelectedTaskId(null);
    setDropPreviewMins(null);
  };

  // ── Touch drag from right panel to left panel ──
  const getMinsFromClientY = useCallback((clientY: number): number => {
    const panel = leftPanelRef.current;
    if (!panel) return gridStartMins;
    const rect = panel.getBoundingClientRect();
    const relY = clientY - rect.top + panel.scrollTop;
    const raw = (relY / PLAN_HOUR_HEIGHT) * 60 + gridStartMins;
    return Math.round(raw / 15) * 15;
  }, [gridStartMins]);

  // Drop zone for the shared pointer-drag system (utils/dragState): dragging a todo/note card
  // from the right column onto the timeline creates a block at the snapped time.
  const placeTaskAt = useCallback((taskId: string, startMins: number) => {
    const t = useStore.getState().tasks.find((x) => x.id === taskId);
    if (!t) return;
    const isNoteT = t.isTodo === false;
    const durationMins = isNoteT ? 60 : t.estimatedMinutes || 30;
    saveSnapshot();
    undoToast(isNoteT ? `Placed note "${t.title}"` : `Scheduled "${t.title}"`);
    addTimeBlock({
      taskId: t.id, title: t.title, date: selectedDate,
      start: minutesToHHMM(startMins), end: minutesToHHMM(startMins + durationMins),
      mode: 'planned', source: 'manual',
      categoryId: t.categoryId,
      calendarContainerId: t.calendarContainerId ?? calendarContainers[0]?.id ?? '',
      tagIds: t.tagIds ?? [],
    });
    setConfirmedMsg(`Scheduled at ${formatTime12(minutesToHHMM(startMins))} for ${durationMins}m`);
    setTimeout(() => setConfirmedMsg(null), 2000);
  }, [saveSnapshot, addTimeBlock, selectedDate, calendarContainers]);

  useEffect(() => {
    const el = leftPanelRef.current;
    if (!el) return;
    registerDropZone(el, {
      onOver: (_x, y) => {
        if (activeDrag.type !== 'task') return;
        setDropPreviewMins(Math.max(gridStartMins, getMinsFromClientY(y)));
        setDragTaskId(activeDrag.id);
      },
      onLeave: () => setDropPreviewMins(null),
      onDrop: (_x, y) => {
        if (activeDrag.type !== 'task' || !activeDrag.id) return;
        placeTaskAt(activeDrag.id, Math.max(gridStartMins, getMinsFromClientY(y)));
        setDropPreviewMins(null);
      },
    });
    return () => unregisterDropZone(el);
  }, [gridStartMins, getMinsFromClientY, placeTaskAt]);

  const startCardDrag = useCallback((e: React.PointerEvent, task: Task) => {
    const color = categories.find((c) => c.id === task.categoryId)?.color ?? THEME.primary;
    startLongPressDrag(e, {
      type: 'task', id: task.id, duration: task.estimatedMinutes || 30, color, title: task.title,
      createGhost: () => {
        const ghost = document.createElement('div');
        ghost.style.cssText = `padding:6px 10px;border-radius:8px;font-size:12px;font-weight:600;color:#fff;background:${color};box-shadow:0 4px 16px rgba(0,0,0,0.25);white-space:nowrap;max-width:60vw;overflow:hidden;text-overflow:ellipsis;`;
        ghost.textContent = task.title;
        return ghost;
      },
      onDragStart: () => setDragTaskId(task.id),
      onDragEnd: () => { setDropPreviewMins(null); setDragTaskId(null); },
    });
  }, [categories]);

  // Tap-to-schedule (alternative to drag for precision)
  const handleLeftPanelTap = (clientY: number) => {
    if (!selectedTask) return;
    const snapped = Math.max(gridStartMins, getMinsFromClientY(clientY));
    const isNoteT = selectedTask.isTodo === false;
    const durationMins = isNoteT ? 60 : selectedTask.estimatedMinutes || 30;
    const endMins = snapped + durationMins;
    const fmtTime = minutesToHHMM;
    saveSnapshot();
    undoToast(isNoteT ? `Placed note "${selectedTask.title}"` : `Scheduled "${selectedTask.title}"`);
    addTimeBlock({
      taskId: selectedTask.id, title: selectedTask.title, date: selectedDate,
      start: fmtTime(snapped), end: fmtTime(endMins),
      mode: 'planned', source: 'manual',
      categoryId: selectedTask.categoryId,
      calendarContainerId: selectedTask.calendarContainerId ?? calendarContainers[0]?.id ?? '',
      tagIds: selectedTask.tagIds ?? [],
    });
    setSelectedTaskId(null);
    setConfirmedMsg(`Scheduled at ${fmtTime(snapped)}`);
    setTimeout(() => setConfirmedMsg(null), 2000);
  };

  const nowLineTop = ((nowMins - gridStartMins) / 60) * PLAN_HOUR_HEIGHT;
  const showNowLine = selectedDate === today && nowMins >= gridStartMins;

  // Block height proportional to duration (like desktop)
  const taskBlockHeight = (task: Task) => Math.max(40, ((task.estimatedMinutes || 30) / 60) * PLAN_HOUR_HEIGHT);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box' }}>
      {mobInline && (
        <InlineCreate mode={mobInline.mode} anchor={mobInline.anchor} label={`${mobInline.startTime}–${mobInline.endTime}`}
          onSave={(t, todoOn) => finishTimelineCreate(t, todoOn)} onCancel={() => finishTimelineCreate(null)}
          onExpand={(t, _pos, todoOn) => { const ic = mobInline; setMobInline(null); if (ic) setMobSheet({ title: t, date: selectedDate, startTime: ic.startTime, endTime: ic.endTime, isTodo: ic.mode === 'todo' && todoOn, asTask: ic.mode === 'todo' }); }} />
      )}
      {mobSheet && <AddSheet mode={mobSheet.asTask ?? mobSheet.isTodo ? 'task' : 'event'} prefill={mobSheet} onClose={() => setMobSheet(null)} />}
      <ScheduleHeader selectedDate={selectedDate} today={today} onNavigate={navigateDate} onToday={() => setSelectedDate(today)} miniOpen={miniOpen} onToggleMini={() => setMiniOpen((o) => !o)} />
      {miniOpen && (
        <div style={{ flexShrink: 0, borderBottom: `1px solid ${COLOR.border}` }}>
          <MiniMonth touch view="day" selectedDate={selectedDate} onSelect={(d) => { setSelectedDate(d); setMiniOpen(false); }} onTitleClick={() => setMiniOpen(false)} />
        </div>
      )}

      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
        <SegmentedControl options={[{ value: 'event' as CreateMode, label: 'Event' }, { value: 'todo' as CreateMode, label: 'Todo' }]} value={createMode} onChange={setCreateModeValue} size="md" style={{ width: 132, flexShrink: 0 }} />
        {selectedTask ? (
          <>
            <p style={{ flex: 1, minWidth: 0, fontSize: 11, color: THEME.primary, margin: 0, fontWeight: 500, lineHeight: 1.3 }}>Tap a time slot to place "{selectedTask.title}"</p>
            <button type="button" aria-label="Clear selection" onClick={() => setSelectedTaskId(null)} className="touch-manipulation" style={{ width: 44, height: 44, margin: '-8px -12px -8px 0', border: 'none', background: 'transparent', color: COLOR.muted, fontSize: 14 }}>✕</button>
          </>
        ) : (
          <p style={{ flex: 1, minWidth: 0, fontSize: 11, color: COLOR.muted, margin: 0, lineHeight: 1.3 }}>Hold and drag to create or place</p>
        )}
      </div>

      {/* Split view */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>

        {/* LEFT: Day timeline (55%) */}
        <div
          ref={leftPanelRef}
          onClick={(e) => { if (selectedTask) handleLeftPanelTap(e.clientY); }}
          style={{
            width: '54%', overflowY: 'auto', position: 'relative', flexShrink: 0,
            cursor: selectedTask ? 'crosshair' : 'default',
            overscrollBehavior: 'contain',
          } as React.CSSProperties}
        >
          <div onPointerDown={startTimelineCreate} style={{ position: 'relative', height: hours.length * PLAN_HOUR_HEIGHT + 40, touchAction: 'pan-y' }}>
            {/* Hour lines */}
            {hours.map((h) => {
              const top = (h - wakeHour) * PLAN_HOUR_HEIGHT;
              return (
                <div key={h} style={{ position: 'absolute', top, left: 0, right: 0 }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, width: PLAN_TIME_COL, textAlign: 'right', paddingRight: 6 }}>
                    <span style={{ fontSize: 11, color: '#C7C7CC', fontWeight: 400 }}>
                      {h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`}
                    </span>
                  </div>
                  <div style={{ position: 'absolute', top: 0, left: PLAN_TIME_COL, right: 4, height: 1, backgroundColor: 'rgba(0,0,0,0.05)' }} />
                </div>
              );
            })}

            {/* Scheduled blocks */}
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: PLAN_TIME_COL + 2, right: 4 }}>
              {mobCreate && (
                <div style={{
                  position: 'absolute', left: 0, right: 0, zIndex: 5, pointerEvents: 'none', borderRadius: 4,
                  top: ((mobCreate.startMins - gridStartMins) / 60) * PLAN_HOUR_HEIGHT,
                  height: ((mobCreate.endMins - mobCreate.startMins) / 60) * PLAN_HOUR_HEIGHT,
                  backgroundColor: COLOR.accentSoft, borderLeft: `3px solid ${COLOR.accent}`, border: `1px dashed ${COLOR.accentRing}`,
                }} />
              )}
              {(() => {
                const ovl = computeOverlapLayout(agenda.map((i) => ({ id: i.id, start: i.start, end: i.end })));
                return agenda.map((item) => {
                const lay = ovl.get(item.id) ?? { columnIndex: 0, totalColumns: 1 };
                const startM = parseTimeToMinutes(item.start);
                const endM = parseTimeToMinutes(item.end);
                const top = ((startM - gridStartMins) / 60) * PLAN_HOUR_HEIGHT;
                const height = Math.max(14, ((endM - startM) / 60) * PLAN_HOUR_HEIGHT);
                const isEvent = item.type === 'event';
                const cat = categories.find((c) => c.id === (timeBlocks.find(b => b.id === item.id)?.categoryId ?? events.find(e => e.id === item.id)?.categoryId));
                return (
                  <div key={item.id} style={{
                    position: 'absolute', top, height,
                    left: `${(lay.columnIndex / lay.totalColumns) * 100}%`, width: `calc(${100 / lay.totalColumns}% - ${lay.totalColumns > 1 ? 2 : 0}px)`,
                    padding: '2px 4px', overflow: 'hidden', borderRadius: 4, boxSizing: 'border-box',
                    borderLeft: `3px solid ${item.color}`,
                    backgroundColor: item.isNote ? 'var(--tb-note-bg)' : hexToRgba(item.color, isEvent ? 0.10 : 0.14),
                    ...(item.isNote ? { border: '1px solid var(--tb-note-border)', borderLeft: `3px solid ${item.color}` } : {}),
                  }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: THEME.textPrimary, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {item.title}
                    </span>
                  </div>
                );
              });
              })()}

              {/* Drop preview */}
              {dropPreviewMins !== null && dragTask && (
                <div data-testid="plan-drop-preview" style={{
                  position: 'absolute',
                  top: ((dropPreviewMins - gridStartMins) / 60) * PLAN_HOUR_HEIGHT,
                  left: 0, right: 0,
                  height: Math.max(14, ((dragTask.estimatedMinutes || 30) / 60) * PLAN_HOUR_HEIGHT),
                  borderRadius: 4,
                  border: `2px dashed ${categories.find(c => c.id === dragTask.categoryId)?.color ?? THEME.primary}`,
                  backgroundColor: hexToRgba(categories.find(c => c.id === dragTask.categoryId)?.color ?? THEME.primary, 0.12),
                  pointerEvents: 'none',
                }} />
              )}

              {/* Selected task tap preview */}
              {selectedTask && dropPreviewMins === null && (
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                  backgroundColor: `${categories.find(c => c.id === selectedTask.categoryId)?.color ?? THEME.primary}06`,
                  pointerEvents: 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{ fontSize: 11, color: COLOR.muted, fontWeight: 500 }}>tap to place</span>
                </div>
              )}
            </div>

            {/* Now line */}
            {showNowLine && (
              <div style={{ position: 'absolute', top: nowLineTop, left: 0, right: 4, zIndex: 10, pointerEvents: 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span style={{ fontSize: 8, fontWeight: 600, color: COLOR.danger, width: PLAN_TIME_COL, textAlign: 'right', paddingRight: 4 }}>
                    {(() => { const h = Math.floor(nowMins / 60); const m = nowMins % 60; const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h; return `${h12}:${String(m).padStart(2, '0')}`; })()}
                  </span>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: COLOR.danger, flexShrink: 0, marginLeft: -2.5 }} />
                  <div style={{ flex: 1, height: 1.5, backgroundColor: COLOR.danger }} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Divider */}
        <div style={{ width: 1, backgroundColor: 'rgba(0,0,0,0.08)', flexShrink: 0 }} />

        {/* RIGHT: Task blocks (46%) */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px 40px', overscrollBehavior: 'contain', backgroundColor: COLOR.surface2 } as React.CSSProperties}>
          {pendingTasks.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 40 }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#D1D1D6" strokeWidth="1.2" strokeLinecap="round" style={{ marginBottom: 8 }}>
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <p style={{ fontSize: 12, color: COLOR.muted, margin: 0, textAlign: 'center' }}>All tasks scheduled for this day</p>
            </div>
          ) : (
            pendingTasks.map((task) => {
              const cat = categories.find((c) => c.id === task.categoryId);
              const color = cat?.color ?? THEME.primary;
              const blockH = taskBlockHeight(task);
              const isSelected = selectedTaskId === task.id;
              const durationMins = task.estimatedMinutes || 30;

              return (
                <div
                  key={task.id}
                  data-testid="plan-task-card"
                  onPointerDown={(e) => startCardDrag(e, task)}
                  onClick={() => setSelectedTaskId(isSelected ? null : task.id)}
                  className="touch-manipulation"
                  style={{
                    height: blockH,
                    marginBottom: 6,
                    borderRadius: 8,
                    padding: '6px 10px',
                    borderLeft: `3px solid ${color}`,
                    backgroundColor: isSelected ? hexToRgba(color, 0.18) : 'var(--tb-note-bg-soft)',
                    boxShadow: isSelected ? `0 0 0 2px ${color}` : 'none',
                    cursor: 'grab',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    // Vertical pan still scrolls the list; a long-press arms the drag (startLongPressDrag).
                    touchAction: 'pan-y',
                  }}
                >
                  <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--tb-note-text)', margin: 0, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: Math.max(1, Math.floor((blockH - 24) / 14)), WebkitBoxOrient: 'vertical', lineHeight: 1.3 }}>
                    {task.title}
                  </p>
                  {blockH >= 50 && (
                    <span style={{ fontSize: 11, color: COLOR.muted, alignSelf: 'flex-end' }}>
                      {durationMins >= 60 ? `${Math.floor(durationMins / 60)}h${durationMins % 60 > 0 ? ` ${durationMins % 60}m` : ''}` : `${durationMins}m`}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Confirmation toast */}
      {confirmedMsg && (
        <div style={{
          position: 'absolute', bottom: 16, left: 16, right: 16, zIndex: 'var(--tb-z-sticky)',
          backgroundColor: THEME.primary, color: '#FFFFFF',
          fontSize: 13, fontWeight: 500, padding: '10px 16px', borderRadius: 10,
          textAlign: 'center', boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
          animation: 'fadeIn 0.2s ease-out',
        }}>
          {confirmedMsg}
        </div>
      )}
    </div>
  );
}

// ─── SCHEDULE Tab (Time-of-Day Sections) ───────────────────

type TimeOfDaySection = 'morning' | 'afternoon' | 'evening';

interface ScheduleCardItem {
  type: 'block' | 'event';
  id: string;
  title: string;
  start: string;
  end: string;
  startMins: number;
  endMins: number;
  color: string;
  confirmationStatus?: TimeBlock['confirmationStatus'];
  taskId?: string | null;
  isNote?: boolean;
  section: TimeOfDaySection;
}

function ScheduleTab({ addEventTriggerRef }: { addEventTriggerRef?: React.MutableRefObject<(() => void) | null> }) {
  const timeBlocks = useStore((s) => s.timeBlocks);
  const events = useStore((s) => s.events);
  const categories = useStore((s) => s.categories);
  const calendarContainers = useStore((s) => s.calendarContainers);
  const addTimeBlock = useStore((s) => s.addTimeBlock);
  const addEvent = useStore((s) => s.addEvent);
  const confirmBlock = useStore((s) => s.confirmBlock);
  const skipBlock = useStore((s) => s.skipBlock);
  const stickers = useStore((s) => s.stickers);
  const tasks = useStore((s) => s.tasks);
  const updateTask = useStore((s) => s.updateTask);
  const wakeTime = useStore((s) => s.wakeTime);
  const sleepTime = useStore((s) => s.sleepTime);
  const { saveSnapshot } = useHistoryStore();
  const actions = React.useContext(MobileActionsContext);

  const [selectedDate, setSelectedDate] = React.useContext(SharedDateContext)!;
  const [detailItem, setDetailItem] = useState<AgendaItem | null>(null);
  const [showEventForm, setShowEventForm] = useState(false);
  const [eventTitle, setEventTitle] = useState('');
  const [eventStart, setEventStart] = useState('');
  const [eventEnd, setEventEnd] = useState('');
  const [eventCalendarId, setEventCalendarId] = useState('');
  const [eventCategoryId, setEventCategoryId] = useState('');
  const [collapsedSections, setCollapsedSections] = useState<Record<TimeOfDaySection, boolean>>({
    morning: false, afternoon: false, evening: false,
  });
  const [swipedItemId, setSwipedItemId] = useState<string | null>(null);
  const [miniOpen, setMiniOpen] = useState(false);
  const daySwipeRef = useRef<{ x: number; y: number } | null>(null);
  const swipeStartXRef = useRef(0);
  const swipeCurrentXRef = useRef(0);
  const [swipeOffset, setSwipeOffset] = useState(0);

  const eventInputRef = useRef<HTMLInputElement>(null);

  // Wire up the addEvent trigger ref from parent
  useEffect(() => {
    if (addEventTriggerRef) {
      addEventTriggerRef.current = () => {
        const now = new Date();
        const h = now.getHours();
        const m = now.getMinutes();
        const roundedM = Math.ceil(m / 15) * 15;
        const startH = roundedM >= 60 ? h + 1 : h;
        const startMin = roundedM >= 60 ? 0 : roundedM;
        setEventStart(`${String(startH).padStart(2, '0')}:${String(startMin).padStart(2, '0')}`);
        setEventEnd(`${String(startH + 1).padStart(2, '0')}:${String(startMin).padStart(2, '0')}`);
        if (calendarContainers.length > 0 && !eventCalendarId) {
          setEventCalendarId(calendarContainers[0].id);
        }
        setShowEventForm(true);
        setTimeout(() => eventInputRef.current?.focus(), 100);
      };
    }
    return () => { if (addEventTriggerRef) addEventTriggerRef.current = null; };
  }, [addEventTriggerRef, calendarContainers, eventCalendarId]);

  const today = getLocalDateString();
  const nowMins = useCurrentMinutes();

  // Section boundaries
  const wakeMins = parseTimeToMinutes(wakeTime || '8:00');
  const sleepMins = parseTimeToMinutes(sleepTime || '23:00');
  const AFTERNOON_START = 12 * 60; // noon
  const EVENING_START = 17 * 60;   // 5pm

  const getSection = (startMins: number): TimeOfDaySection => {
    if (startMins < AFTERNOON_START) return 'morning';
    if (startMins < EVENING_START) return 'afternoon';
    return 'evening';
  };

  // Build schedule items for selected date
  const scheduleItems = useMemo(() => {
    const items: ScheduleCardItem[] = [];
    for (const b of timeBlocks.filter((b) => b.date === selectedDate)) {
      const cat = categories.find((c) => c.id === b.categoryId);
      const startM = parseTimeToMinutes(b.start);
      const endM = parseTimeToMinutes(b.end);
      items.push({
        type: 'block', id: b.id, title: b.title ?? 'Untitled',
        start: b.start, end: b.end, startMins: startM, endMins: endM,
        color: cat?.color ?? THEME.primary,
        confirmationStatus: b.confirmationStatus, taskId: b.taskId,
        isNote: !!b.taskId && tasks.find((t) => t.id === b.taskId)?.isTodo === false,
        section: getSection(startM),
      });
    }
    // Cross-midnight events show on both days: from their start to 23:59, then from 00:00 to their end.
    for (const e of events.filter((e) => e.date <= selectedDate && selectedDate <= (e.endDate ?? e.date))) {
      const cat = categories.find((c) => c.id === e.categoryId);
      const last = e.endDate ?? e.date;
      const start = selectedDate === e.date ? e.start : '00:00';
      const end = selectedDate === last ? e.end : '23:59';
      const startM = parseTimeToMinutes(start);
      const endM = parseTimeToMinutes(end);
      items.push({
        type: 'event', id: e.id, title: e.title,
        start, end, startMins: startM, endMins: endM,
        color: cat?.color ?? THEME.primary,
        section: getSection(startM),
      });
    }
    items.sort((a, b) => a.startMins - b.startMins);
    return items;
  }, [timeBlocks, events, selectedDate, categories, tasks]);

  // Group by section
  const sectionItems = useMemo(() => {
    const map: Record<TimeOfDaySection, ScheduleCardItem[]> = {
      morning: [], afternoon: [], evening: [],
    };
    for (const item of scheduleItems) {
      map[item.section].push(item);
    }
    return map;
  }, [scheduleItems]);

  // Current block (the one happening right now)
  const currentItem = useMemo(() => {
    if (selectedDate !== today) return null;
    // Find the item that spans "now"
    return scheduleItems.find((item) => item.startMins <= nowMins && item.endMins > nowMins) ?? null;
  }, [scheduleItems, today, nowMins, selectedDate]);

  // Next item after current time
  const nextItem = useMemo(() => {
    if (selectedDate !== today) return null;
    return scheduleItems.find((item) => item.startMins > nowMins) ?? null;
  }, [scheduleItems, today, nowMins, selectedDate]);

  // Unscheduled tasks: tasks that are due today (or have no due date) and not yet scheduled
  const unscheduledTasks = useMemo(() => {
    const scheduledTaskIds = new Set(
      timeBlocks.filter((b) => b.date === selectedDate && b.taskId).map((b) => b.taskId!)
    );
    return tasks.filter((t) => {
      if (t.status === 'done' || t.status === 'archived') return false;
      if (scheduledTaskIds.has(t.id)) return false;
      // Show tasks due today, or inbox tasks with no due date (on today only)
      if (t.dueDate === selectedDate) return true;
      if (selectedDate === today && !t.dueDate && (t.status === 'inbox' || !t.status)) return true;
      return false;
    });
  }, [tasks, timeBlocks, selectedDate, today]);

  // Filtered categories for event form
  const eventFilteredCategories = useMemo(() => {
    if (!eventCalendarId) return categories;
    return categories.filter((c) => {
      const ids = c.calendarContainerIds;
      if (ids && ids.length > 0) return ids.includes(eventCalendarId);
      return c.calendarContainerId === eventCalendarId || !c.calendarContainerId;
    });
  }, [eventCalendarId, categories]);

  // Auto-select calendar/category for event form
  useEffect(() => {
    if (!eventCalendarId) return;
    const first = eventFilteredCategories[0];
    if (first) setEventCategoryId(first.id);
  }, [eventCalendarId, eventFilteredCategories]);

  const handleConfirm = useCallback((blockId: string) => {
    saveSnapshot();
    undoToast('Marked done');
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
    undoToast('Skipped');
    skipBlock(blockId);
  }, [saveSnapshot, skipBlock]);

  const handleCreateEvent = useCallback(() => {
    if (!eventTitle.trim() || !eventStart || !eventEnd || !eventCategoryId) return;
    const cat = categories.find((c) => c.id === eventCategoryId);
    if (!cat) return;
    if (parseTimeToMinutes(eventEnd) <= parseTimeToMinutes(eventStart)) {
      toast.error('End time must be after the start time.');
      return;
    }
    saveSnapshot();
    undoToast('Event added');
    addEvent({
      title: eventTitle.trim(),
      calendarContainerId: eventCalendarId || (cat.calendarContainerId ?? calendarContainers[0]?.id ?? ''),
      categoryId: cat.id,
      start: padTime(eventStart),
      end: padTime(eventEnd),
      date: selectedDate,
      recurring: false,
      source: 'manual',
    });
    setShowEventForm(false);
    setEventTitle('');
    setEventStart('');
    setEventEnd('');
  }, [eventTitle, eventStart, eventEnd, eventCategoryId, eventCalendarId, categories, calendarContainers, selectedDate, saveSnapshot, addEvent]);

  const handleQuickSchedule = useCallback((task: Task) => {
    const afterTime = selectedDate === today
      ? `${Math.floor(nowMins / 60)}:${String(nowMins % 60).padStart(2, '0')}`
      : (wakeTime || '8:00');
    const slot = findNextAvailableSlot(timeBlocks, events, selectedDate, task.estimatedMinutes || 30, afterTime, sleepTime || '23:00');
    if (!slot) return;
    const cat = categories.find((c) => c.id === task.categoryId);
    saveSnapshot();
    undoToast(`Scheduled "${task.title}"`);
    addTimeBlock({
      taskId: task.id,
      title: task.title,
      calendarContainerId: task.calendarContainerId,
      categoryId: task.categoryId,
      tagIds: task.tagIds ?? [],
      start: slot.start,
      end: slot.end,
      date: selectedDate,
      mode: 'planned',
      source: 'manual',
    });
  }, [selectedDate, today, nowMins, wakeTime, sleepTime, timeBlocks, events, categories, saveSnapshot, addTimeBlock]);

  const navigateDate = (dir: -1 | 1) => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + dir);
    setSelectedDate(getLocalDateString(d));
    setSwipedItemId(null);
  };

  const tomorrowStr = (() => { const d = new Date(today + 'T00:00:00'); d.setDate(d.getDate() + 1); return getLocalDateString(d); })();
  const tomorrowFirst = useMemo(() => {
    const c = [...events.map((e) => ({ title: e.title, date: e.date, start: e.start })), ...timeBlocks.map((b) => ({ title: b.title, date: b.date, start: b.start }))]
      .filter((x) => x.date >= tomorrowStr && x.start);
    c.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
    return c[0] ?? null;
  }, [events, timeBlocks, tomorrowStr]);

  const toggleSection = (section: TimeOfDaySection) => {
    setCollapsedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  // Swipe handlers for cards
  const handleCardTouchStart = useCallback((e: React.TouchEvent, itemId: string) => {
    swipeStartXRef.current = e.touches[0].clientX;
    swipeCurrentXRef.current = e.touches[0].clientX;
    setSwipedItemId(itemId);
    setSwipeOffset(0);
  }, []);

  const handleCardTouchMove = useCallback((e: React.TouchEvent) => {
    if (!swipedItemId) return;
    const dx = e.touches[0].clientX - swipeStartXRef.current;
    // Only allow swipe left
    if (dx < 0) {
      setSwipeOffset(Math.max(dx, -100));
    }
  }, [swipedItemId]);

  const handleCardTouchEnd = useCallback(() => {
    if (swipeOffset < -50) {
      // Keep swiped to reveal actions
      setSwipeOffset(-100);
    } else {
      setSwipeOffset(0);
      setSwipedItemId(null);
    }
  }, [swipeOffset]);

  const handleDeleteItem = useCallback((item: ScheduleCardItem) => {
    // Same path as the detail sheet and desktop (scope / notify / remove-vs-delete prompts).
    if (item.type === 'block' && actions.deleteBlock) actions.deleteBlock(item.id);
    else if (item.type === 'event' && actions.deleteEvent) actions.deleteEvent(item.id);
    else {
      saveSnapshot();
      if (item.type === 'block') {
        useStore.getState().deleteTimeBlock(item.id);
      } else {
        const evt = useStore.getState().events.find((e) => e.id === item.id);
        if (evt?.googleEventId) dismissGcalEventId(item.id);
        useStore.getState().deleteEvent(item.id);
      }
    }
    setSwipedItemId(null);
    setSwipeOffset(0);
  }, [saveSnapshot, actions]);

  // Section label with icon
  const sectionConfig: Record<TimeOfDaySection, { label: string; icon: string; startMins: number; endMins: number }> = {
    morning: { label: 'Morning', icon: '\u2600\ufe0f', startMins: wakeMins, endMins: AFTERNOON_START },
    afternoon: { label: 'Afternoon', icon: '\u26c5', startMins: AFTERNOON_START, endMins: EVENING_START },
    evening: { label: 'Evening', icon: '\ud83c\udf19', startMins: EVENING_START, endMins: sleepMins },
  };

  // Format duration
  const fmtDuration = (mins: number) => {
    if (mins >= 60) {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return m > 0 ? `${h}h ${m}m` : `${h}h`;
    }
    return `${mins}m`;
  };

  // Render a schedule card
  const renderCard = (item: ScheduleCardItem) => {
    const isPast = selectedDate < today || (selectedDate === today && item.endMins <= nowMins);
    const isCurrent = currentItem?.id === item.id;
    const isConfirmed = item.confirmationStatus === 'confirmed';
    const isSkipped = item.confirmationStatus === 'skipped';
    const durationMins = item.endMins - item.startMins;
    const isEvent = item.type === 'event';
    const isSwiped = swipedItemId === item.id && swipeOffset < -10;

    return (
      <div key={item.id} style={{ position: 'relative', overflow: 'hidden', borderRadius: 12, marginBottom: 8 }}>
        {/* Swipe-to-reveal actions */}
        {isSwiped && (
          <div style={{
            position: 'absolute', right: 0, top: 0, bottom: 0,
            display: 'flex', alignItems: 'stretch', zIndex: 1,
          }}>
            <button
              type="button"
              onClick={() => handleDeleteItem(item)}
              className="touch-manipulation"
              style={{
                width: 80, border: 'none', backgroundColor: COLOR.danger,
                color: '#FFFFFF', fontSize: 12, fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: 4, borderRadius: '0 12px 12px 0',
              }}
            >
              <TrashIcon style={{ width: 14, height: 14 }} />
              Delete
            </button>
          </div>
        )}

        {/* Card body */}
        <div
          onClick={() => {
            if (Math.abs(swipeOffset) > 10) {
              setSwipeOffset(0);
              setSwipedItemId(null);
              return;
            }
            setDetailItem({
              type: item.type, id: item.id, title: item.title,
              start: item.start, end: item.end, color: item.color,
              confirmationStatus: item.confirmationStatus, taskId: item.taskId,
            });
          }}
          onTouchStart={(e) => !isPast ? handleCardTouchStart(e, item.id) : undefined}
          onTouchMove={!isPast ? handleCardTouchMove : undefined}
          onTouchEnd={!isPast ? handleCardTouchEnd : undefined}
          className="touch-manipulation"
          style={{
            position: 'relative',
            transform: isSwiped ? `translateX(${swipeOffset}px)` : 'translateX(0)',
            transition: swipedItemId === item.id ? 'none' : 'transform 0.2s ease',
            backgroundColor: item.isNote ? 'var(--tb-note-bg)' : '#FFFFFF',
            border: item.isNote ? '1px solid var(--tb-note-border)' : 'none',
            boxSizing: 'border-box',
            borderRadius: 12,
            padding: '12px 14px',
            minHeight: 44,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            boxShadow: isCurrent
              ? `0 0 0 2px ${item.color}40, 0 2px 8px rgba(0,0,0,0.06)`
              : '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.03)',
            opacity: isSkipped ? 0.4 : isPast && !isConfirmed ? 0.55 : isPast && isConfirmed ? 0.7 : 1,
            zIndex: 2,
          }}
        >
          {stickers.some((st) => st.emoji === MISSED_STAMP && (item.type === 'block' ? st.blockId === item.id : st.eventId === item.id)) && <MissedOverlay />}

          {/* Color indicator (notes are sticky cards, no bar) */}
          {!item.isNote && <div style={{
            width: 4,
            alignSelf: 'stretch',
            borderRadius: 2,
            backgroundColor: item.color,
            flexShrink: 0,
            opacity: isPast ? 0.5 : 1,
          }} />}

          {/* Content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <span style={{
                fontSize: 14,
                fontWeight: 500,
                color: item.isNote ? 'var(--tb-note-text)' : THEME.textPrimary,
                textDecoration: isSkipped ? 'line-through' : 'none',
                overflow: 'hidden',
                flex: 1,
                ...(item.isNote ? { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, wordBreak: 'break-word' as const } : { textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }),
              }}>
                {item.isNote && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6, verticalAlign: '-2px', opacity: 0.6 }}><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8l6-6V5a2 2 0 0 0-2-2z" /><polyline points="14 21 14 15 20 15" /></svg>}
                {item.title}
              </span>
              {isConfirmed && <CheckBadge color={item.color} />}
              {isSkipped && (
                <span style={{ fontSize: 11, fontWeight: 500, color: COLOR.muted }}>skipped</span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: COLOR.muted }}>
                {formatTime12(item.start)} – {formatTime12(item.end)}
              </span>
              <span style={{ fontSize: 11, color: COLOR.muted, fontWeight: 500 }}>
                {fmtDuration(durationMins)}
              </span>
              {isEvent && (
                <span style={{
                  fontSize: 11, fontWeight: 600, letterSpacing: '0.04em',
                  textTransform: 'uppercase', color: item.color,
                  backgroundColor: `${item.color}12`, padding: '1px 6px',
                  borderRadius: 4,
                }}>
                  Event
                </span>
              )}
            </div>
          </div>

          {/* Quick confirm/skip for past pending blocks */}
          {item.type === 'block' && !item.isNote && isPast && !isConfirmed && !isSkipped && (
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
              <button type="button" onClick={() => handleConfirm(item.id)} className="touch-manipulation"
                style={{
                  width: 44, height: 44, borderRadius: 22, border: '6px solid transparent', backgroundClip: 'padding-box', boxSizing: 'border-box',
                  backgroundColor: `${item.color}15`, color: item.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                <CheckIcon style={{ width: 14, height: 14 }} />
              </button>
              <button type="button" onClick={() => handleSkip(item.id)} className="touch-manipulation"
                style={{
                  width: 44, height: 44, borderRadius: 22, border: '6px solid transparent', backgroundClip: 'padding-box', boxSizing: 'border-box',
                  backgroundColor: 'rgba(0,0,0,0.04)', color: COLOR.muted,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                <XMarkIcon style={{ width: 14, height: 14 }} />
              </button>
            </div>
          )}

          {/* "Now" indicator for current item */}
          {isCurrent && (
            <div style={{
              position: 'absolute', top: 6, right: 10,
              fontSize: 11, fontWeight: 600, letterSpacing: '0.05em',
              textTransform: 'uppercase', color: item.color,
            }}>
              NOW
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      <ScheduleHeader selectedDate={selectedDate} today={today} onNavigate={navigateDate} onToday={() => setSelectedDate(today)} miniOpen={miniOpen} onToggleMini={() => setMiniOpen((o) => !o)} />

      {miniOpen && (
        <div style={{ flexShrink: 0, borderBottom: `1px solid ${COLOR.border}` }}>
          <MiniMonth touch view="day" selectedDate={selectedDate} onSelect={(d) => { setSelectedDate(d); setMiniOpen(false); }} onTitleClick={() => setMiniOpen(false)} />
        </div>
      )}

      {/* Scrollable content */}
      <div
        onTouchStart={(e) => { daySwipeRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
        onTouchEnd={(e) => {
          const st = daySwipeRef.current; daySwipeRef.current = null;
          if (!st || swipedItemId) return;
          const dx = e.changedTouches[0].clientX - st.x, dy = e.changedTouches[0].clientY - st.y;
          if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 2) navigateDate(dx < 0 ? 1 : -1);
        }}
        style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', padding: '12px 16px 100px' } as React.CSSProperties}>

        {/* "Now" card — shows what's happening right now */}
        {selectedDate === today && (
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 14,
            padding: '14px 16px',
            marginBottom: 16,
            boxShadow: '0 1px 4px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
            border: currentItem ? `1px solid ${currentItem.color}25` : '1px solid rgba(0,0,0,0.06)',
          }}>
            {currentItem ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: currentItem.color }} />
                  <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: currentItem.color }}>
                    Now
                  </span>
                </div>
                <p style={{ fontSize: 17, fontWeight: 600, color: THEME.textPrimary, margin: '0 0 4px' }}>
                  {currentItem.title}
                </p>
                <p style={{ fontSize: 13, color: COLOR.muted, margin: 0 }}>
                  {(() => {
                    const remaining = currentItem.endMins - nowMins;
                    if (remaining <= 0) return 'Ending now';
                    return `${fmtDuration(remaining)} left`;
                  })()}
                </p>
                {nextItem && (
                  <p style={{ fontSize: 12, color: COLOR.muted, margin: '6px 0 0', borderTop: '1px solid rgba(0,0,0,0.04)', paddingTop: 6 }}>
                    Up next: {nextItem.title} at {formatTime12(nextItem.start)}
                  </p>
                )}
              </>
            ) : nextItem ? (
              <>
                <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: COLOR.muted }}>
                  Free time
                </span>
                <p style={{ fontSize: 15, fontWeight: 500, color: THEME.textPrimary, margin: '4px 0 0' }}>
                  Free until {formatTime12(nextItem.start)}
                </p>
                <p style={{ fontSize: 12, color: COLOR.muted, margin: '2px 0 0' }}>
                  Next: {nextItem.title}
                </p>
              </>
            ) : scheduleItems.length === 0 ? (
              <>
                <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: COLOR.muted }}>
                  Today
                </span>
                <p style={{ fontSize: 15, fontWeight: 500, color: THEME.textSecondary, margin: '4px 0 0' }}>
                  Nothing scheduled. Tap + to add.
                </p>
              </>
            ) : (
              <>
                <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: COLOR.muted }}>
                  {tomorrowFirst ? 'Up next' : 'All done'}
                </span>
                <p style={{ fontSize: 15, fontWeight: 500, color: THEME.textSecondary, margin: '4px 0 0' }}>
                  {tomorrowFirst ? `${tomorrowFirst.title}, ${tomorrowFirst.date === tomorrowStr ? 'tomorrow' : formatDateHeader(tomorrowFirst.date)} ${formatTime12(tomorrowFirst.start)}` : 'No more items for today'}
                </p>
              </>
            )}
          </div>
        )}

        {/* Time-of-day sections */}
        {(['morning', 'afternoon', 'evening'] as TimeOfDaySection[]).map((section) => {
          const items = sectionItems[section];
          const config = sectionConfig[section];
          const isCollapsed = collapsedSections[section];
          const count = items.length;

          // Determine if current section is "active" (current time falls in it)
          const isActiveSection = selectedDate === today && nowMins >= config.startMins && nowMins < config.endMins;

          return (
            <div key={section} style={{ marginBottom: 16 }}>
              {/* Section header */}
              <button
                type="button"
                onClick={() => toggleSection(section)}
                className="touch-manipulation"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '8px 0',
                  border: 'none',
                  backgroundColor: 'transparent',
                  cursor: 'pointer',
                  position: 'sticky',
                  top: 0,
                  zIndex: 5,
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                } as React.CSSProperties}
              >
                <span style={{ fontSize: 13, fontWeight: 600, color: isActiveSection ? THEME.textPrimary : COLOR.muted }}>
                  {config.label}
                </span>
                {count > 0 && (
                  <span style={{
                    fontSize: 11, fontWeight: 600, color: THEME.primary,
                    backgroundColor: `${THEME.primary}12`, padding: '1px 7px',
                    borderRadius: 10, minWidth: 18, textAlign: 'center',
                  }}>
                    {count}
                  </span>
                )}
                <div style={{ flex: 1 }} />
                <svg
                  width="12" height="12" viewBox="0 0 24 24" fill="none"
                  stroke="#AEAEB2" strokeWidth="2.5" strokeLinecap="round"
                  style={{
                    transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0)',
                    transition: 'transform 0.2s ease',
                  }}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {/* Section content */}
              {!isCollapsed && (
                <div>
                  {count === 0 ? (
                    <div style={{
                      padding: '16px 14px',
                      borderRadius: 12,
                      backgroundColor: 'rgba(0,0,0,0.015)',
                      border: '1px dashed rgba(0,0,0,0.08)',
                      textAlign: 'center',
                    }}>
                      <p style={{ fontSize: 13, color: COLOR.muted, margin: 0 }}>
                        No plans for the {section}
                      </p>
                    </div>
                  ) : (
                    items.map(renderCard)
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Unscheduled tasks section */}
        {unscheduledTasks.length > 0 && (
          <div style={{ marginTop: 8, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: COLOR.muted }}>
                Unscheduled
              </span>
              <span style={{
                fontSize: 11, fontWeight: 600, color: COLOR.warning,
                backgroundColor: '#FF950012', padding: '1px 7px',
                borderRadius: 10,
              }}>
                {unscheduledTasks.length}
              </span>
            </div>
            {unscheduledTasks.map((task) => {
              const cat = categories.find((c) => c.id === task.categoryId);
              const color = cat?.color ?? THEME.primary;
              return (
                <div
                  key={task.id}
                  onClick={() => handleQuickSchedule(task)}
                  className="touch-manipulation"
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: 12,
                    padding: '12px 14px',
                    marginBottom: 8,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    minHeight: 44,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.03)',
                    border: '1px dashed rgba(0,0,0,0.08)',
                  }}
                >
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%',
                    backgroundColor: color, flexShrink: 0,
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{
                      fontSize: 14, fontWeight: 500, color: THEME.textPrimary,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      display: 'block',
                    }}>
                      {task.title}
                    </span>
                    <span style={{ fontSize: 11, color: COLOR.muted }}>
                      {fmtDuration(task.estimatedMinutes || 30)}
                      {task.dueDate === selectedDate && ' \u00b7 Due today'}
                    </span>
                  </div>
                  <div style={{
                    fontSize: 11, fontWeight: 600, color: THEME.primary,
                    backgroundColor: `${THEME.primary}12`, padding: '4px 10px',
                    borderRadius: 12, flexShrink: 0,
                  }}>
                    Schedule
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Detail sheet for tapped block/event */}
      {detailItem && (
        <DetailSheet
          item={detailItem}
          onClose={() => setDetailItem(null)}
          onConfirm={(id) => { handleConfirm(id); setDetailItem(null); }}
          onSkip={(id) => { handleSkip(id); setDetailItem(null); }}
        />
      )}

      {/* Event creation sheet */}
      {showEventForm && (
        <>
          <Sheet onBackdropClick={() => { setShowEventForm(false); setEventTitle(''); }}>
            <div style={{ padding: '8px 20px 16px' }}>
              <p style={{ fontSize: 15, fontWeight: 600, color: THEME.textPrimary, margin: '0 0 12px' }}>New Event</p>
              <input
                ref={eventInputRef}
                type="text"
                value={eventTitle}
                onChange={(e) => setEventTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateEvent();
                  if (e.key === 'Escape') { setShowEventForm(false); setEventTitle(''); }
                }}
                placeholder="Event title"
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 10,
                  border: '1px solid rgba(0,0,0,0.10)', fontSize: 15,
                  color: THEME.textPrimary, backgroundColor: 'rgba(0,0,0,0.02)',
                  outline: 'none', boxSizing: 'border-box', marginBottom: 10,
                }}
              />
              <div className="flex gap-2" style={{ marginBottom: 10 }}>
                <div style={{ flex: 1 }}>
                  <SectionLabel as="label" mb={4}>Start</SectionLabel>
                  <input type="time" value={eventStart} onChange={(e) => setEventStart(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.10)', fontSize: 14, color: THEME.textPrimary, backgroundColor: '#FFFFFF', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <SectionLabel as="label" mb={4}>End</SectionLabel>
                  <input type="time" value={eventEnd} onChange={(e) => setEventEnd(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.10)', fontSize: 14, color: THEME.textPrimary, backgroundColor: '#FFFFFF', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </div>
              {calendarContainers.length > 1 && (
                <div className="flex flex-wrap gap-2" style={{ marginBottom: 8 }}>
                  {calendarContainers.map((cal) => {
                    const isSel = eventCalendarId === cal.id;
                    return (
                      <button key={cal.id} type="button" onClick={() => setEventCalendarId(cal.id)} className="touch-manipulation"
                        style={{ padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500, border: isSel ? 'none' : '1px solid rgba(0,0,0,0.12)', backgroundColor: isSel ? `${cal.color}20` : 'transparent', color: isSel ? cal.color : COLOR.text2 }}>
                        {cal.name}
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="flex flex-wrap gap-2" style={{ marginBottom: 10 }}>
                {eventFilteredCategories.map((cat) => {
                  const isSel = eventCategoryId === cat.id;
                  return (
                    <button key={cat.id} type="button" onClick={() => setEventCategoryId(cat.id)} className="touch-manipulation"
                      style={{ padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500, border: isSel ? 'none' : '1px solid rgba(0,0,0,0.12)', backgroundColor: isSel ? `${cat.color}20` : 'transparent', color: isSel ? cat.color : COLOR.text2 }}>
                      {cat.name}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => { setShowEventForm(false); setEventTitle(''); }} className="touch-manipulation"
                  style={{ flex: 1, padding: '10px', borderRadius: 10, fontSize: 14, fontWeight: 500, border: '1px solid rgba(0,0,0,0.10)', backgroundColor: 'transparent', color: COLOR.text2 }}>
                  Cancel
                </button>
                <button type="button" onClick={handleCreateEvent} disabled={!eventTitle.trim() || !eventStart || !eventEnd} className="touch-manipulation"
                  style={{ flex: 2, padding: '10px', borderRadius: 10, fontSize: 14, fontWeight: 600, border: 'none', backgroundColor: eventTitle.trim() && eventStart && eventEnd ? THEME.primary : 'rgba(0,0,0,0.06)', color: eventTitle.trim() && eventStart && eventEnd ? '#FFFFFF' : COLOR.muted }}>
                  Create Event
                </button>
              </div>
            </div>
          </Sheet>
        </>
      )}
    </div>
  );
}

// ─── Duration slider + schedule actions panel ──────────────

function TodoExpandedPanel({ task, color, onScheduleToday, onScheduleLater }: {
  task: Task; color: string;
  onScheduleToday: (task: Task) => void;
  onScheduleLater: (task: Task, date: string, time: string) => void;
}) {
  const updateTask = useStore((s) => s.updateTask);
  const categories = useStore((s) => s.categories);
  const { saveSnapshot } = useHistoryStore();
  const actions = React.useContext(MobileActionsContext);
  const [mins, setMins] = useState(task.estimatedMinutes || 30);
  const [showReschedulePicker, setShowReschedulePicker] = useState(false);
  // Inline edit (N-04): title, due date, priority, notes, note <-> to-do.
  const [editing, setEditing] = useState(false);
  const [eTitle, setETitle] = useState(task.title);
  const [eDue, setEDue] = useState(task.dueDate ?? '');
  const [ePriority, setEPriority] = useState<number>(task.priority ?? 0);
  const [eNotes, setENotes] = useState(task.notes ?? '');
  const [eIsTodo, setEIsTodo] = useState(task.isTodo !== false);
  const saveEdit = () => {
    if (!eTitle.trim()) return;
    saveSnapshot();
    updateTask(task.id, {
      title: eTitle.trim(),
      dueDate: eDue || null,
      priority: ePriority > 0 ? ePriority : undefined,
      notes: eNotes.trim() || null,
      isTodo: eIsTodo,
    });
    // Keep the calendar blocks' titles in sync, as on desktop.
    useStore.getState().timeBlocks.filter((b) => b.taskId === task.id).forEach((b) => useStore.getState().updateTimeBlock(b.id, { title: eTitle.trim() }));
    setEditing(false);
  };
  const inputBase: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(0,0,0,0.12)', fontSize: 16, color: THEME.textPrimary, backgroundColor: '#FFFFFF', outline: 'none', boxSizing: 'border-box', minHeight: 44 };

  // Reschedule picker state
  const todayStr = getLocalDateString();
  const [pickerDate, setPickerDate] = useState('');
  const [pickerTime, setPickerTime] = useState('09:00');

  // Generate day buttons: next 14 days
  const dayOptions = useMemo(() => {
    const days: { date: string; label: string; sublabel: string }[] = [];
    for (let i = 0; i <= 13; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-US', { weekday: 'short' });
      const sublabel = i <= 1 ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
      days.push({ date: dateStr, label, sublabel });
    }
    return days;
  }, []);

  // Time slot presets
  const timeSlots = useMemo(() => [
    { label: '9:00am', value: '09:00' },
    { label: '10:00am', value: '10:00' },
    { label: '11:00am', value: '11:00' },
    { label: '12:00pm', value: '12:00' },
    { label: '1:00pm', value: '13:00' },
    { label: '2:00pm', value: '14:00' },
    { label: '3:00pm', value: '15:00' },
    { label: '4:00pm', value: '16:00' },
    { label: '5:00pm', value: '17:00' },
    { label: '6:00pm', value: '18:00' },
  ], []);

  // Snap to preset stops for a nice feel
  const presets = [15, 30, 45, 60, 90, 120, 180, 240];
  const snap = (v: number) => {
    for (const p of presets) { if (Math.abs(v - p) <= 7) return p; }
    return Math.round(v / 5) * 5;
  };

  const fmtDuration = (m: number) => {
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    const r = m % 60;
    return r > 0 ? `${h}h ${r}m` : `${h}h`;
  };

  const commitDuration = (val: number) => {
    const snapped = snap(val);
    setMins(snapped);
    if (snapped !== task.estimatedMinutes) {
      saveSnapshot();
      updateTask(task.id, { estimatedMinutes: snapped });
    }
  };

  // Update task with adjusted duration before scheduling
  const scheduleToday = () => {
    if (mins !== task.estimatedMinutes) {
      updateTask(task.id, { estimatedMinutes: mins });
    }
    onScheduleToday({ ...task, estimatedMinutes: mins });
  };

  const handleRescheduleConfirm = () => {
    if (!pickerDate) return;
    if (mins !== task.estimatedMinutes) {
      updateTask(task.id, { estimatedMinutes: mins });
    }
    // Normalize time: pickerTime is HH:MM, convert to H:MM
    const normTime = padTime(pickerTime);
    onScheduleLater({ ...task, estimatedMinutes: mins }, pickerDate, normTime);
    setShowReschedulePicker(false);
  };

  const cat = categories.find((c) => c.id === task.categoryId);
  const catColor = cat?.color ?? color;

  return (
    <div style={{
      padding: '10px 12px',
      borderRadius: '0 0 5px 5px',
      borderLeft: `1px solid ${hexToRgba(color, 0.22)}`,
      borderRight: `1px solid ${hexToRgba(color, 0.22)}`,
      borderBottom: `1px solid ${hexToRgba(color, 0.22)}`,
      backgroundColor: '#FFF9EC',
      boxShadow: '0 2px 6px rgba(0,0,0,0.10), 0 1px 2px rgba(0,0,0,0.06)',
    }}>
      {/* Task details */}
      {task.tags && task.tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
          {task.tags.map(tag => (
            <span key={tag.id} style={{
              fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 99,
              backgroundColor: hexToRgba(catColor, 0.08), color: catColor,
              border: `1px solid ${hexToRgba(catColor, 0.18)}`,
            }}>{tag.name}</span>
          ))}
        </div>
      )}
      {task.description && (
        <p style={{ fontSize: 12, color: COLOR.text2, margin: '0 0 8px', lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>{task.description}</p>
      )}
      {task.notes && (
        <p style={{ fontSize: 12, fontStyle: 'italic', color: COLOR.text2, margin: '0 0 8px', lineHeight: 1.4, paddingTop: 4, borderTop: '1px solid rgba(0,0,0,0.05)', whiteSpace: 'pre-wrap' }}>{task.notes}</p>
      )}
      {'link' in task && (task as any).link && (
        <a href={(task as any).link} target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 11, color: COLOR.accent, display: 'block', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {(task as any).link}
        </a>
      )}
      {/* Edit / Delete */}
      {editing ? (
        <div data-testid="todo-edit-form" style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 10 }} onClick={(e) => e.stopPropagation()}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <TodoToggle checked={eIsTodo} onChange={setEIsTodo} size={20} />
            <input type="text" value={eTitle} onChange={(e) => setETitle(e.target.value)} placeholder="Title" style={{ ...inputBase, flex: 1, minWidth: 0 }} />
          </div>
          <div>
            <SectionLabel as="label" mb={4}>Due date</SectionLabel>
            <input type="date" value={eDue} onChange={(e) => setEDue(e.target.value)} style={inputBase} />
          </div>
          <div>
            <SectionLabel as="label" mb={4}>Priority</SectionLabel>
            <div style={{ display: 'flex', gap: 6 }}>
              {[0, 1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" onClick={() => setEPriority(n)} className="touch-manipulation"
                  style={{ flex: 1, minHeight: 36, borderRadius: 8, fontSize: 12, fontWeight: 600, border: ePriority === n ? 'none' : '1px solid rgba(0,0,0,0.10)', backgroundColor: ePriority === n ? `${THEME.primary}20` : 'transparent', color: ePriority === n ? THEME.primary : COLOR.text2 }}>
                  {n === 0 ? 'None' : n}
                </button>
              ))}
            </div>
          </div>
          <textarea value={eNotes} onChange={(e) => setENotes(e.target.value)} rows={3} placeholder="Notes" style={{ ...inputBase, fontSize: 14, resize: 'none', fontFamily: 'inherit' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => setEditing(false)} className="touch-manipulation" style={{ flex: 1, padding: 10, borderRadius: 10, fontSize: 13, border: '1px solid rgba(0,0,0,0.10)', background: 'transparent', color: COLOR.text2 }}>Cancel</button>
            <button type="button" data-testid="todo-edit-save" onClick={saveEdit} disabled={!eTitle.trim()} className="touch-manipulation" style={{ flex: 2, padding: 10, borderRadius: 10, fontSize: 13, fontWeight: 600, border: 'none', backgroundColor: THEME.primary, color: '#FFFFFF' }}>Save</button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2" style={{ marginBottom: 10 }}>
          <button type="button" data-testid="todo-edit" onClick={(e) => { e.stopPropagation(); setEditing(true); }} className="touch-manipulation"
            style={{ flex: 1, minHeight: 36, borderRadius: 8, border: '1px solid rgba(0,0,0,0.10)', background: 'transparent', color: THEME.textPrimary, fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
            <PencilIcon style={{ width: 13, height: 13 }} /> Edit
          </button>
          <button type="button" data-testid="todo-delete" onClick={(e) => { e.stopPropagation(); if (actions.deleteTask) actions.deleteTask(task.id); else { saveSnapshot(); useStore.getState().deleteTask(task.id); } }} className="touch-manipulation"
            style={{ flex: 1, minHeight: 36, borderRadius: 8, border: '1px solid rgba(200,120,104,0.35)', background: 'transparent', color: '#C87868', fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
            <TrashIcon style={{ width: 13, height: 13 }} /> Delete {task.isTodo === false ? 'note' : 'todo'}
          </button>
        </div>
      )}
      {/* Duration slider */}
      <div style={{ marginBottom: 10 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: COLOR.muted, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Duration</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: THEME.textPrimary }}>{fmtDuration(mins)}</span>
        </div>
        <input
          type="range"
          min={5}
          max={240}
          step={5}
          value={mins}
          onChange={(e) => setMins(Number(e.target.value))}
          onPointerUp={() => commitDuration(mins)}
          onTouchEnd={() => commitDuration(mins)}
          onClick={(e) => e.stopPropagation()}
          className="touch-manipulation"
          style={{
            width: '100%',
            height: 4,
            appearance: 'none',
            WebkitAppearance: 'none',
            background: `linear-gradient(to right, ${color} 0%, ${color} ${((mins - 5) / 235) * 100}%, rgba(0,0,0,0.08) ${((mins - 5) / 235) * 100}%, rgba(0,0,0,0.08) 100%)`,
            borderRadius: 2,
            outline: 'none',
            cursor: 'pointer',
            accentColor: color,
          }}
        />
        <div className="flex justify-between" style={{ marginTop: 2 }}>
          <span style={{ fontSize: 11, color: COLOR.muted }}>5m</span>
          <span style={{ fontSize: 11, color: COLOR.muted }}>4h</span>
        </div>
      </div>

      {/* Schedule buttons */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); scheduleToday(); }}
          className="touch-manipulation"
          style={{
            flex: 1, padding: '8px 10px', borderRadius: 8, border: 'none',
            backgroundColor: THEME.primary, color: '#FFFFFF',
            fontSize: 12, fontWeight: 600,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
          </svg>
          Schedule today
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setShowReschedulePicker(true); setPickerDate(dayOptions[1]?.date ?? todayStr); }}
          className="touch-manipulation"
          style={{
            flex: 1, padding: '8px 10px', borderRadius: 8,
            border: '1px solid rgba(0,0,0,0.10)', backgroundColor: 'transparent',
            color: THEME.textPrimary, fontSize: 12, fontWeight: 500,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          Reschedule
        </button>
      </div>

      {/* Reschedule date/time picker popup */}
      {showReschedulePicker && (
        <>
          {/* Backdrop */}
          <Sheet onBackdropClick={(e) => { e.stopPropagation(); setShowReschedulePicker(false); }} maxHeight="75dvh" stopClicks>

            <div style={{ padding: '4px 20px 16px' }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: THEME.textPrimary, margin: '0 0 14px' }}>
                Reschedule "{task.title}"
              </h3>

              {/* Date picker — day buttons */}
              <div style={{ marginBottom: 14 }}>
                <SectionLabel mb={6}>Pick a day</SectionLabel>
                <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
                  {dayOptions.map((opt) => {
                    const isSel = pickerDate === opt.date;
                    return (
                      <button
                        key={opt.date}
                        type="button"
                        onClick={() => setPickerDate(opt.date)}
                        className="touch-manipulation"
                        style={{
                          flexShrink: 0,
                          display: 'flex', flexDirection: 'column', alignItems: 'center',
                          padding: '8px 10px', borderRadius: 10, minWidth: 54,
                          border: isSel ? 'none' : '1px solid rgba(0,0,0,0.10)',
                          backgroundColor: isSel ? `${THEME.primary}15` : 'transparent',
                          color: isSel ? THEME.primary : THEME.textSecondary,
                        }}
                      >
                        <span style={{ fontSize: 11, fontWeight: 600 }}>{opt.label}</span>
                        <span style={{ fontSize: 11, color: isSel ? THEME.primary : COLOR.muted, marginTop: 1 }}>{opt.sublabel}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Time slot picker */}
              <div style={{ marginBottom: 14 }}>
                <SectionLabel mb={6}>Pick a time</SectionLabel>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {timeSlots.map((slot) => {
                    const isSel = pickerTime === slot.value;
                    return (
                      <button
                        key={slot.value}
                        type="button"
                        onClick={() => setPickerTime(slot.value)}
                        className="touch-manipulation"
                        style={{
                          padding: '7px 14px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                          border: isSel ? 'none' : '1px solid rgba(0,0,0,0.10)',
                          backgroundColor: isSel ? `${THEME.primary}15` : 'transparent',
                          color: isSel ? THEME.primary : THEME.textSecondary,
                        }}
                      >
                        {slot.label}
                      </button>
                    );
                  })}
                </div>
                {/* Custom time input */}
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: COLOR.muted }}>or</span>
                  <input
                    type="time"
                    value={pickerTime}
                    onChange={(e) => setPickerTime(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      padding: '6px 10px', borderRadius: 8,
                      border: '1px solid rgba(0,0,0,0.12)', fontSize: 13,
                      color: THEME.textPrimary, backgroundColor: 'rgba(0,0,0,0.02)',
                      outline: 'none',
                    }}
                  />
                </div>
              </div>

              {/* Confirm / Cancel */}
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowReschedulePicker(false)}
                  className="touch-manipulation"
                  style={{
                    flex: 1, padding: '10px', borderRadius: 10, fontSize: 14, fontWeight: 500,
                    border: '1px solid rgba(0,0,0,0.10)', backgroundColor: 'transparent', color: COLOR.text2,
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleRescheduleConfirm}
                  disabled={!pickerDate}
                  className="touch-manipulation"
                  style={{
                    flex: 2, padding: '10px', borderRadius: 10, fontSize: 14, fontWeight: 600,
                    border: 'none',
                    backgroundColor: pickerDate ? THEME.primary : 'rgba(0,0,0,0.06)',
                    color: pickerDate ? '#FFFFFF' : COLOR.muted,
                  }}
                >
                  Schedule
                </button>
              </div>
            </div>
          </Sheet>
        </>
      )}
    </div>
  );
}

// ─── TO-DO Tab (Quick capture + task list with scheduling) ──

/** Calm to-do row (mirrors the desktop sidebar row): 44px touch height, 18px checkbox, one-line title + muted meta. */
function TodoRow({ task, color, isNote, isDone, isExpanded, todayStr, onToggle, onCheck }: {
  task: Task; color: string; isNote: boolean; isDone: boolean; isExpanded: boolean; todayStr: string;
  onToggle: () => void; onCheck: () => void;
}) {
  const isRecurring = !!(task as any).recurring || !!(task as any).seriesId || !!(task as any).recurrenceSeriesId;
  const isOverdue = !!task.dueDate && !isDone && task.dueDate < todayStr;
  const mins = task.estimatedMinutes || 0;
  const dur = mins > 0 ? (mins >= 60 ? `${Math.floor(mins / 60)}h${mins % 60 ? ` ${mins % 60}m` : ''}` : `${mins}m`) : null;
  const dueText = task.dueDate && !isDone ? (isOverdue ? 'Overdue' : `Due ${formatDateHeader(task.dueDate)}`) : null;
  const metaParts = [dueText, !isNote ? dur : null].filter(Boolean) as string[];
  const hasMeta = metaParts.length > 0 || isRecurring;
  const prio = task.priority ?? 0;
  return (
    <div
      onClick={onToggle}
      className="touch-manipulation"
      style={{
        display: 'flex', alignItems: isNote ? 'flex-start' : 'center', gap: 8, boxSizing: 'border-box',
        minHeight: 40, padding: isNote ? '8px 12px' : '2px 8px', margin: isNote ? '4px 0' : 0,
        borderRadius: 8, cursor: 'pointer',
        backgroundColor: isNote ? 'var(--tb-note-bg)' : isExpanded ? 'rgba(0,0,0,0.03)' : 'transparent',
        border: isNote ? '1px solid var(--tb-note-border)' : 'none',
      }}
    >
      {!isNote && (
        <button
          type="button"
          aria-label={isDone ? `Mark "${task.title}" not done` : `Mark "${task.title}" done`}
          onClick={(e) => { e.stopPropagation(); onCheck(); }}
          className="touch-manipulation"
          style={{ flexShrink: 0, width: 44, height: 44, margin: '-13px -13px -13px -13px', padding: 0, border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <span style={{ width: 18, height: 18, boxSizing: 'border-box', borderRadius: '50%', border: `1.5px solid ${isDone ? color : 'rgba(0,0,0,0.25)'}`, backgroundColor: isDone ? color : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {isDone && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
          </span>
        </button>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              ...(isNote ? { flex: 1 } : { flex: '0 1 auto' }), minWidth: 0, fontSize: 13, lineHeight: '20px', fontWeight: 500,
              color: isDone ? COLOR.faint : isNote ? 'var(--tb-note-text)' : COLOR.text,
              textDecoration: isDone ? 'line-through' : 'none',
              ...(isNote
                ? { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden', wordBreak: 'break-word' as const }
                : { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }),
            }}
          >
            {task.title}
          </span>
          {!isNote && hasMeta && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, maxWidth: '55%', whiteSpace: 'nowrap', fontSize: 11, lineHeight: '20px', color: isOverdue ? '#D63031' : COLOR.muted }}>
              {isRecurring && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Repeats" style={{ flexShrink: 0 }}>
                  <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
              )}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{metaParts.join(' · ')}</span>
            </span>
          )}
          {prio > 0 && !isDone && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, flexShrink: 0, color: '#F5A623' }}>
              <StarIcon style={{ width: 12, height: 12 }} />
              <span style={{ fontSize: 11, fontWeight: 500 }}>{prio}</span>
            </span>
          )}
        </div>
        {isNote && hasMeta && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, lineHeight: '16px', color: isOverdue ? '#D63031' : isNote ? 'var(--tb-note-text)' : COLOR.muted, opacity: isNote ? 0.7 : 1 }}>
            {isRecurring && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Repeats" style={{ flexShrink: 0 }}>
                <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
            )}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{metaParts.join(' · ')}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function TodoTab({ addTriggerRef }: { addTriggerRef?: React.MutableRefObject<(() => void) | null> }) {
  const tasks = useStore((s) => s.tasks);
  const timeBlocks = useStore((s) => s.timeBlocks);
  const categories = useStore((s) => s.categories);
  const calendarContainers = useStore((s) => s.calendarContainers);
  const events = useStore((s) => s.events);
  const addTask = useStore((s) => s.addTask);
  const updateTask = useStore((s) => s.updateTask);
  const addTimeBlock = useStore((s) => s.addTimeBlock);
  const addEvent = useStore((s) => s.addEvent);
  const { saveSnapshot } = useHistoryStore();

  const [title, setTitle] = useState('');
  const groupBy = 'day' as const;
  const [notesOpen, setNotesOpen] = useState(false);
  const [miniOpen, setMiniOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(getLocalDateString());
  // Quick capture creates a note by default (same as the Add sheet and desktop); tick "To-do" for a checkbox item.
  const [captureAsTodo, setCaptureAsTodo] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const actions = React.useContext(MobileActionsContext);
  const expandRecurringTasks = useStore((s) => s.expandRecurringTasks);
  const [isListening, setIsListening] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Wire up add trigger ref from parent (for bottom nav Add button)
  useEffect(() => {
    if (addTriggerRef) {
      addTriggerRef.current = () => {
        inputRef.current?.focus();
      };
    }
    return () => { if (addTriggerRef) addTriggerRef.current = null; };
  }, [addTriggerRef]);
  const recognitionRef = useRef<any>(null);
  const [speechSupported, setSpeechSupported] = useState(false);

  const todayStr = getLocalDateString();

  // Repeating todos materialize lazily; make sure the next two weeks exist even if only mobile is used (B-39).
  useEffect(() => {
    const days: string[] = [];
    for (let i = 0; i < 14; i++) { const d = new Date(); d.setDate(d.getDate() + i); days.push(getLocalDateString(d)); }
    expandRecurringTasks(days);
  }, [expandRecurringTasks, tasks.length]);

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setSpeechSupported(!!SR);
    return () => { recognitionRef.current?.abort(); };
  }, []);

  // Auto-dismiss mic error toast
  useEffect(() => {
    if (!micError) return;
    const t = setTimeout(() => setMicError(null), 3500);
    return () => clearTimeout(t);
  }, [micError]);

  // Hold-to-record: start on pointerdown, stop on pointerup/pointerleave
  const lastTranscriptRef = useRef('');

  const startListening = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    recognitionRef.current?.abort();
    lastTranscriptRef.current = '';
    setMicError(null);
    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      let interimTranscript = '';
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      const transcript = finalTranscript || interimTranscript;
      lastTranscriptRef.current = transcript;
      setTitle(transcript);
    };
    recognition.onend = () => {
      setIsListening(false);
      // Ensure final transcript is applied
      if (lastTranscriptRef.current) {
        setTitle(lastTranscriptRef.current);
      }
    };
    recognition.onerror = (e: any) => {
      setIsListening(false);
      const err = e?.error || '';
      if (err === 'not-allowed' || err === 'service-not-allowed') {
        setMicError('Microphone access denied. Check Settings → Privacy.');
      } else if (err === 'audio-capture') {
        setMicError('Mic unavailable — close FaceTime or other apps using it.');
      } else if (err === 'network') {
        setMicError('No internet connection for speech recognition.');
      } else if (err === 'no-speech') {
        // Silent timeout — not really an error, ignore
      } else if (err === 'aborted') {
        // User-initiated abort, ignore
      } else {
        setMicError('Voice input failed. Try again.');
      }
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
      setIsListening(true);
    } catch {
      setIsListening(false);
      setMicError('Mic unavailable — it may be in use by another app.');
    }
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
    // Focus input so user can review/edit the transcript before saving
    setTimeout(() => inputRef.current?.focus(), 100);
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

  const parsed = useMemo(() => parseQuickAdd(title), [title]);
  const previewText = title.trim() && (parsed.hasDate || parsed.hasTime || parsed.durationMins) ? describeQuickParse(parsed) || (parsed.durationMins ? `${parsed.durationMins} min` : '') : '';

  const handleCapture = useCallback(() => {
    if (!parsed.title) return;
    // Use defaults with fallback — don't silently fail if calendar/category not loaded yet
    const calId = defaultCalendar?.id ?? calendarContainers[0]?.id ?? '';
    const catId = defaultCategory?.id ?? categories[0]?.id ?? '';
    saveSnapshot();
    const day = parsed.date ?? getLocalDateString();
    if (parsed.hasTime && parsed.start) {
      // Circle on = to-do, off = note; either way a time puts it on the calendar (same as desktop).
      const startM = parseTimeToMinutes(parsed.start);
      const mins = !captureAsTodo ? 60 : parsed.end ? Math.max(15, parseTimeToMinutes(parsed.end) - startM) : (parsed.durationMins ?? 30);
      const endM = Math.min(startM + mins, 1439);
      const taskId = addTask({
        title: parsed.title, estimatedMinutes: mins, calendarContainerId: calId, categoryId: catId,
        tagIds: [], flexible: true, status: 'inbox', isTodo: captureAsTodo,
      });
      if (taskId) {
        addTimeBlock({
          taskId, title: parsed.title, date: day, start: parsed.start, end: minutesToHHMM(endM),
          mode: 'planned', source: 'manual', categoryId: catId, calendarContainerId: calId, tagIds: [],
        } as any);
      }
      undoToast(captureAsTodo ? `Scheduled "${parsed.title}"` : `Note added: ${describeQuickParse(parsed)}`);
    } else {
      addTask({
        title: parsed.title,
        estimatedMinutes: parsed.durationMins ?? 30,
        calendarContainerId: calId,
        categoryId: catId,
        tagIds: [],
        flexible: true,
        status: 'inbox',
        isTodo: captureAsTodo,
        ...(parsed.date ? { dueDate: parsed.date } : {}),
      });
      undoToast(captureAsTodo ? 'To-do added' : 'Note added');
    }
    setTitle('');
    inputRef.current?.focus();
  }, [parsed, defaultCalendar, defaultCategory, calendarContainers, categories, saveSnapshot, addTask, addTimeBlock, captureAsTodo]);

  const tomorrowStr = useMemo(() => { const d = new Date(); d.setDate(d.getDate() + 1); return getLocalDateString(d); }, [todayStr]);
  const weekSet = useMemo(() => {
    const st = getStartOfWeek(new Date(selectedDate + 'T12:00:00'), false);
    return new Set(Array.from({ length: 7 }, (_, i) => getLocalDateString(new Date(st.getFullYear(), st.getMonth(), st.getDate() + i))));
  }, [selectedDate]);

  const dayLabel = (key: string): string => {
    if (key === 'none') return 'No due date';
    if (key === todayStr) return 'Today';
    if (key === tomorrowStr) return 'Tomorrow';
    const label = new Date(key + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    return key < todayStr ? `${label} · overdue` : label;
  };

  // Same buckets as the desktop sidebar: scheduled (by day / by due), Unscheduled, then the Done fold.
  const { mainGroups, unscheduledList, unplacedNotes } = useMemo(() => {
    const firstBlockDate = new Map<string, string>();
    for (const b of timeBlocks) {
      if (!b.taskId) continue;
      const cur = firstBlockDate.get(b.taskId);
      if (!cur || b.date < cur) firstBlockDate.set(b.taskId, b.date);
    }
    const sortFn = (a: Task, b: Task) => {
      const da = a.dueDate ?? '', db = b.dueDate ?? '';
      if (da && !db) return -1;
      if (!da && db) return 1;
      if (da && db && da !== db) return da.localeCompare(db);
      const pa = a.priority ?? 0, pb = b.priority ?? 0;
      if (pa !== pb) return pb - pa;
      return a.title.localeCompare(b.title);
    };
    const map = new Map<string, Task[]>();
    const unscheduled: Task[] = [];
    const notes: Task[] = [];
    for (const t of tasks) {
      if (t.status === 'done' || t.status === 'archived') continue;
      const sd = firstBlockDate.get(t.id);
      // Notes live on the calendar; only unplaced ones are listed (in their own fold).
      if (t.isTodo === false) { if (!sd) notes.push(t); continue; }
      if (!sd) { unscheduled.push(t); continue; }
      const key = groupBy === 'day' ? (weekSet.has(sd) ? sd : null) : (t.dueDate || 'none');
      if (key === null) continue;
      const arr = map.get(key); if (arr) arr.push(t); else map.set(key, [t]);
    }
    return {
      mainGroups: [...map.keys()].sort().map((key) => ({ key, label: dayLabel(key), tasks: map.get(key)!.slice().sort(sortFn) })),
      unscheduledList: unscheduled.sort(sortFn),
      unplacedNotes: notes.sort(sortFn),
    };
  }, [tasks, timeBlocks, groupBy, weekSet, todayStr, tomorrowStr]); // eslint-disable-line react-hooks/exhaustive-deps

  // Completed to-dos live in a folded "Done" section at the bottom; they can be un-ticked there.
  const doneTasks = useMemo(
    () => tasks.filter((t) => t.status === 'done' && t.isTodo !== false).sort((a, b) => a.title.localeCompare(b.title)),
    [tasks],
  );

  const handleToggleDone = useCallback((task: Task) => {
    // Same as desktop: completing also confirms the todo's blocks; un-completing reverses it (B-39).
    const wasDone = task.status === 'done';
    if (actions.markTaskDone) { actions.markTaskDone(task.id); undoToast(wasDone ? 'Marked not done' : 'Marked done'); return; }
    saveSnapshot();
    updateTask(task.id, { status: wasDone ? 'inbox' : 'done' });
    undoToast(wasDone ? 'Marked not done' : 'Marked done');
  }, [saveSnapshot, updateTask, actions]);

  const handleScheduleToday = useCallback((task: Task) => {
    const now = new Date();
    const currentTime = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
    const duration = task.estimatedMinutes || 30;
    const slot = findNextAvailableSlot(timeBlocks, events, todayStr, duration, currentTime, '23:00');
    if (!slot) {
      toast.error('No available time slot today. Try scheduling later.');
      return;
    }
    saveSnapshot();
    undoToast(`Scheduled "${task.title}" today`);
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
  }, [timeBlocks, events, todayStr, saveSnapshot, addTimeBlock]);

  const handleScheduleLater = useCallback((task: Task, date: string, time: string) => {
    const duration = task.estimatedMinutes || 30;
    const endMins = parseTimeToMinutes(time) + duration;
    const endTime = minutesToHHMM(endMins);
    saveSnapshot();
    addTimeBlock({
      taskId: task.id,
      title: task.title,
      date,
      start: padTime(time),
      end: endTime,
      mode: 'planned',
      source: 'manual',
      categoryId: task.categoryId,
      calendarContainerId: task.calendarContainerId,
      tagIds: task.tagIds ?? [],
    });
    setExpandedTaskId(null);
    const d = new Date(date + 'T00:00:00');
    const dayLabel = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    undoToast(`Scheduled for ${dayLabel} at ${formatTime12(time)}`);
  }, [saveSnapshot, addTimeBlock]);

  const renderRow = (task: Task) => {
    const cat = categories.find((c) => c.id === task.categoryId);
    const color = cat?.color ?? THEME.primary;
    const isNote = task.isTodo === false;
    const isExpanded = expandedTaskId === task.id;
    return (
      <div key={task.id}>
        <TodoRow
          task={task} color={color} isNote={isNote} isDone={false} isExpanded={isExpanded} todayStr={todayStr}
          onToggle={() => setExpandedTaskId(isExpanded ? null : task.id)}
          onCheck={() => handleToggleDone(task)}
        />
        {isExpanded && <TodoExpandedPanel task={task} color={color} onScheduleToday={handleScheduleToday} onScheduleLater={handleScheduleLater} />}
      </div>
    );
  };

  const sectionLabel = (label: string, count: number) => (
    <div style={{ display: 'flex', alignItems: 'center', height: 24, padding: '0 4px', marginBottom: 4 }}>
      <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: COLOR.muted }}>
        {label}<span style={{ marginLeft: 6, fontWeight: 500, color: COLOR.faint }}>{count}</span>
      </span>
    </div>
  );

  const weekLabel = (() => {
    const dates = [...weekSet].sort();
    const f = (k: string) => new Date(k + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return `${f(dates[0])} – ${f(dates[dates.length - 1])}`;
  })();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative', boxSizing: 'border-box' }}>
      {/* 1. MiniMonth (collapsible) */}
      <div style={{ flexShrink: 0, borderBottom: miniOpen ? `1px solid ${COLOR.border}` : 'none' }}>
        {miniOpen ? (
          <MiniMonth touch view="week" selectedDate={selectedDate} onSelect={(d) => { setSelectedDate(d); setMiniOpen(false); }} onTitleClick={() => setMiniOpen(false)} />
        ) : (
          <button type="button" data-testid="mini-month-toggle" onClick={() => setMiniOpen(true)} className="touch-manipulation" style={{ width: '100%', minHeight: 44, border: 'none', background: 'transparent', fontSize: 12, color: COLOR.text2, fontWeight: 600 }}>
            {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} ▾
          </button>
        )}
      </div>

      {/* 2. Title row with By day / By due on the same row */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 16px 8px', minHeight: 44 }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: COLOR.text }}>To-Dos</span>
      </div>

      {/* Quick capture */}
      <div style={{ flexShrink: 0, padding: '0 16px 8px' }}>
        <div className="flex items-center gap-2">
          <TodoToggle checked={captureAsTodo} onChange={setCaptureAsTodo} size={20} />
          <input
            ref={inputRef}
            type="text"
            data-testid="quick-capture-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCapture(); }}
            placeholder='Add… e.g. "lunch 12-1 tomorrow"'
            style={{ flex: 1, minWidth: 0, padding: '10px 12px', borderRadius: 10, border: `1px solid ${COLOR.border}`, fontSize: 16, color: THEME.textPrimary, backgroundColor: '#FFFFFF', outline: 'none', minHeight: 44, boxSizing: 'border-box' }}
          />
          <button
            type="button"
            aria-label="Add"
            onClick={handleCapture}
            disabled={!parsed.title}
            className="touch-manipulation flex-shrink-0"
            style={{ width: 44, height: 44, borderRadius: 10, border: 'none', backgroundColor: parsed.title ? THEME.primary : 'rgba(0,0,0,0.06)', color: parsed.title ? '#FFFFFF' : COLOR.muted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
          {previewText && (
            <span data-testid="quick-parse-preview" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 500, color: THEME.primary, backgroundColor: `${THEME.primary}15`, padding: '3px 8px', borderRadius: 999 }}>
              {parsed.hasTime ? (captureAsTodo ? 'Scheduled to-do' : 'Note on calendar') : parsed.hasDate ? 'Due' : ''}{(parsed.hasTime || parsed.hasDate) ? ' · ' : ''}{previewText}
            </span>
          )}
        </div>
      </div>

      {/* One calm scroll area: sections, Unscheduled, Done fold */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 68px)', overscrollBehavior: 'contain' } as React.CSSProperties}>
        {groupBy === 'day' && <div style={{ fontSize: 11, color: COLOR.faint, padding: '0 4px' }}>Week of {weekLabel}</div>}
        {mainGroups.length === 0 ? (
          <div style={{ fontSize: 12, color: COLOR.faint, padding: '12px 4px 0' }}>{groupBy === 'day' ? 'Nothing scheduled this week' : 'No scheduled to-dos'}</div>
        ) : mainGroups.map((g) => (
          <section key={g.key} style={{ marginTop: 16 }}>
            {sectionLabel(g.label, g.tasks.length)}
            {g.tasks.map(renderRow)}
          </section>
        ))}

        <section style={{ marginTop: 16 }}>
          {sectionLabel('Unscheduled', unscheduledList.length)}
          {unscheduledList.length === 0
            ? <div style={{ fontSize: 12, color: COLOR.faint, padding: '4px' }}>Nothing unscheduled</div>
            : unscheduledList.map(renderRow)}
        </section>

        {unplacedNotes.length > 0 && (
          <section style={{ marginTop: 16 }}>
            <button type="button" data-testid="notes-section-toggle" onClick={() => setNotesOpen((v) => !v)} aria-expanded={notesOpen} className="touch-manipulation"
              style={{ display: 'flex', alignItems: 'center', gap: 4, width: '100%', padding: '0 4px', border: 'none', background: 'transparent', textAlign: 'left', minHeight: 44 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                style={{ transform: notesOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s ease', color: COLOR.muted }}><polyline points="9 18 15 12 9 6" /></svg>
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: COLOR.muted }}>
                Unplaced notes<span style={{ marginLeft: 6, fontWeight: 500, color: COLOR.faint }}>{unplacedNotes.length}</span>
              </span>
            </button>
            {notesOpen && unplacedNotes.map(renderRow)}
          </section>
        )}

        {/* Done - folded away by default; untick to bring a to-do back */}
        {doneTasks.length > 0 && (
          <section style={{ marginTop: 16 }}>
            <button
              type="button"
              data-testid="done-section-toggle"
              onClick={() => setDoneOpen((v) => !v)}
              aria-expanded={doneOpen}
              className="touch-manipulation"
              style={{ display: 'flex', alignItems: 'center', gap: 4, width: '100%', padding: '0 4px', border: 'none', background: 'transparent', textAlign: 'left', minHeight: 44 }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                style={{ transform: doneOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s ease', color: COLOR.muted }}>
                <polyline points="9 18 15 12 9 6" />
              </svg>
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: COLOR.muted }}>
                Done<span style={{ marginLeft: 6, fontWeight: 500, color: COLOR.faint }}>{doneTasks.length}</span>
              </span>
            </button>
            {doneOpen && doneTasks.map((task) => (
              <div key={task.id} data-testid="done-task-row">
                <TodoRow task={task} color={categories.find((c) => c.id === task.categoryId)?.color ?? THEME.primary} isNote={false} isDone isExpanded={false} todayStr={todayStr} onToggle={() => {}} onCheck={() => handleToggleDone(task)} />
              </div>
            ))}
          </section>
        )}
      </div>

      {/* Floating mic FAB */}
      {speechSupported && !isListening && (
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); startListening(); }}
          onContextMenu={(e) => e.preventDefault()}
          className="touch-manipulation"
          style={{
            position: 'absolute',
            bottom: 20,
            right: 20,
            width: 52,
            height: 52,
            borderRadius: '50%',
            border: 'none',
            backgroundColor: THEME.primary,
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(0,0,0,0.18), 0 2px 4px rgba(0,0,0,0.10)',
            zIndex: 30,
            userSelect: 'none',
            WebkitUserSelect: 'none',
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
          </svg>
        </button>
      )}

      {/* Full-screen listening overlay */}
      {isListening && (
        <div
          onPointerUp={stopListening}
          onClick={stopListening}
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            userSelect: 'none',
            WebkitUserSelect: 'none',
          }}
        >
          {/* Pulsing mic circle */}
          <div style={{
            width: 96,
            height: 96,
            borderRadius: '50%',
            backgroundColor: COLOR.danger,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 0 12px rgba(255,59,48,0.20), 0 0 0 24px rgba(255,59,48,0.10)',
            animation: 'pulse 1.5s ease-in-out infinite',
          }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="#FFFFFF">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
            </svg>
          </div>
          <p style={{ color: '#FFFFFF', fontSize: 18, fontWeight: 600, marginTop: 24, letterSpacing: '0.02em' }}>
            Listening...
          </p>
          {title && (
            <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, marginTop: 8, padding: '0 32px', textAlign: 'center', lineHeight: 1.4 }}>
              "{title}"
            </p>
          )}
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 16 }}>
            Tap anywhere to stop
          </p>
        </div>
      )}

      {/* Mic error toast */}
      {micError && (
        <div
          onClick={() => setMicError(null)}
          style={{
            position: 'absolute',
            bottom: 84,
            left: 16,
            right: 16,
            backgroundColor: COLOR.text,
            color: '#FFFFFF',
            fontSize: 13,
            fontWeight: 500,
            padding: '12px 16px',
            borderRadius: 12,
            zIndex: 110,
            textAlign: 'center',
            boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
            animation: 'fadeIn 0.2s ease-out',
          }}
        >
          {micError}
        </div>
      )}
    </div>
  );
}
