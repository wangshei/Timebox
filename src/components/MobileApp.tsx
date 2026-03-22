import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { useHistoryStore } from '../store/useHistoryStore';
import { getLocalDateString } from '../utils/dateTime';
import { parseTimeToMinutes, findNextAvailableSlot } from '../utils/taskHelpers';
import { computeOverlapLayout } from '../utils/overlapLayout';
import { THEME } from '../constants/colors';
import { hexToRgba } from '../utils/color';
import type { TimeBlock, Task, Event } from '../types';
import {
  CheckIcon,
  XMarkIcon,
  ClockIcon,
  CalendarIcon,
  StarIcon,
  PencilIcon,
  TrashIcon,
} from '@heroicons/react/24/solid';

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

export function MobileApp() {
  const [activeTab, setActiveTab] = useState<MobileTab>('schedule');
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
    <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', backgroundColor: '#FDFDFB', maxWidth: '100vw', overscrollBehavior: 'none' }}>
      {/* Top safe area spacer — background color only, no interactive content */}
      <div style={{ flexShrink: 0, height: 'env(safe-area-inset-top, 0px)', backgroundColor: '#FDFDFB' }} />
      {/* Content — fills remaining height */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {activeTab === 'schedule' && <ScheduleTab addEventTriggerRef={scheduleAddEventTriggerRef} />}
        {activeTab === 'todo' && <TodoTab addTriggerRef={todoAddTriggerRef} />}
      </div>

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
          backgroundColor: '#FCFBF7',
          borderTop: '1px solid rgba(0,0,0,0.08)',
          zIndex: 50,
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
            border: 'none',
            backgroundColor: 'transparent',
            color: activeTab === 'schedule' ? THEME.primary : '#8E8E93',
            WebkitTapHighlightColor: 'transparent',
            transition: 'color 0.15s ease',
          }}
        >
          <ScheduleIcon active={activeTab === 'schedule'} />
          <span style={{ fontSize: 10, fontWeight: activeTab === 'schedule' ? 600 : 400 }}>Schedule</span>
        </button>

        {/* Center FAB for quick add */}
        <button
          type="button"
          onClick={() => setShowAddPopup(true)}
          className="touch-manipulation"
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            border: 'none',
            backgroundColor: THEME.primary,
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 10px rgba(141,162,134,0.35)',
            marginTop: -12,
            flexShrink: 0,
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
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
            border: 'none',
            backgroundColor: 'transparent',
            color: activeTab === 'todo' ? THEME.primary : '#8E8E93',
            WebkitTapHighlightColor: 'transparent',
            transition: 'color 0.15s ease',
          }}
        >
          <TasksIcon active={activeTab === 'todo'} />
          <span style={{ fontSize: 10, fontWeight: activeTab === 'todo' ? 600 : 400 }}>To-Do</span>
        </button>
      </nav>

      {/* Add popup / bottom sheet — picker */}
      {showAddPopup && (
        <>
          <div
            onClick={() => setShowAddPopup(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 90,
              backgroundColor: 'rgba(0,0,0,0.3)',
              WebkitTapHighlightColor: 'transparent',
            }}
          />
          <div
            style={{
              position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 91,
              backgroundColor: '#FFFFFF',
              borderRadius: '16px 16px 0 0',
              boxShadow: '0 -4px 24px rgba(0,0,0,0.12)',
              paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
              animation: 'slideUp 0.2s ease-out',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.12)' }} />
            </div>
            <div style={{ padding: '8px 20px 16px' }}>
              <p style={{ fontSize: 15, fontWeight: 600, color: THEME.textPrimary, margin: '0 0 12px' }}>Create new...</p>
              <button type="button" onClick={handleNewTask} className="touch-manipulation"
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 8px', border: 'none', backgroundColor: 'transparent', width: '100%', textAlign: 'left', borderRadius: 10, fontSize: 15, fontWeight: 500, color: THEME.textPrimary }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: `${THEME.primary}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={THEME.primary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                </div>
                New Task
              </button>
              <button type="button" onClick={handleNewEvent} className="touch-manipulation"
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 8px', border: 'none', backgroundColor: 'transparent', width: '100%', textAlign: 'left', borderRadius: 10, fontSize: 15, fontWeight: 500, color: THEME.textPrimary }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: `${THEME.primary}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={THEME.primary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                </div>
                New Event
              </button>
            </div>
          </div>
        </>
      )}

      {/* Full-detail add sheet */}
      {showAddSheet && (
        <AddSheet mode={addSheetMode} onClose={() => setShowAddSheet(false)} />
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
  const categories = useStore((s) => s.categories);
  const timeBlocks = useStore((s) => s.timeBlocks);
  const events = useStore((s) => s.events);
  const tasks = useStore((s) => s.tasks);
  const deleteTimeBlock = useStore((s) => s.deleteTimeBlock);
  const deleteEvent = useStore((s) => s.deleteEvent);
  const updateTask = useStore((s) => s.updateTask);
  const updateTimeBlock = useStore((s) => s.updateTimeBlock);
  const updateEvent = useStore((s) => s.updateEvent);
  const { saveSnapshot } = useHistoryStore();

  const today = getLocalDateString();
  const nowMins = (() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); })();

  // Find full block/event data
  const fullBlock = item.type === 'block' ? timeBlocks.find((b) => b.id === item.id) : null;
  const fullEvent = item.type === 'event' ? events.find((e) => e.id === item.id) : null;
  const linkedTask = fullBlock?.taskId ? tasks.find((t) => t.id === fullBlock.taskId) : null;
  const cat = categories.find((c) => c.id === (fullBlock?.categoryId ?? fullEvent?.categoryId));

  const startM = parseTimeToMinutes(item.start);
  const endM = parseTimeToMinutes(item.end);
  const durationMins = endM - startM;
  const isPast = (fullBlock?.date ?? fullEvent?.date ?? '') < today ||
    ((fullBlock?.date ?? fullEvent?.date ?? '') === today && endM <= nowMins);
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

  const handleDelete = () => {
    saveSnapshot();
    if (isBlock) deleteTimeBlock(item.id);
    else deleteEvent(item.id);
    onClose();
  };

  const handleToggleTaskDone = () => {
    if (!linkedTask) return;
    saveSnapshot();
    updateTask(linkedTask.id, { status: linkedTask.status === 'done' ? 'inbox' : 'done' });
  };

  const handleSaveEdit = () => {
    saveSnapshot();
    // Normalize time format (HTML time inputs give HH:MM, we need H:MM)
    const normalizeTime = (t: string) => {
      const [h, m] = t.split(':').map(Number);
      return `${h}:${String(m).padStart(2, '0')}`;
    };
    const normStart = normalizeTime(editStart);
    const normEnd = normalizeTime(editEnd);

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
      updateEvent(item.id, {
        title: editTitle,
        date: editDate,
        start: normStart,
        end: normEnd,
        categoryId: editCategoryId,
      });
    }
    setIsEditing(false);
    onClose();
  };

  // Format time for HTML input (needs HH:MM with leading zeros)
  const toInputTime = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 90,
          backgroundColor: 'rgba(0,0,0,0.3)',
          WebkitTapHighlightColor: 'transparent',
        }}
      />
      {/* Sheet */}
      <div
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 91,
          backgroundColor: '#FFFFFF',
          borderRadius: '16px 16px 0 0',
          boxShadow: '0 -4px 24px rgba(0,0,0,0.12)',
          maxHeight: '80vh',
          overflowY: 'auto',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
          animation: 'slideUp 0.2s ease-out',
        }}
      >
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.12)' }} />
        </div>

        <div style={{ padding: '4px 20px 16px' }}>
          {isEditing ? (
            /* ─── Edit Mode ─── */
            <>
              {/* Title input */}
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 10, fontWeight: 600, color: '#8E8E93', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Title</label>
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
                <label style={{ fontSize: 10, fontWeight: 600, color: '#8E8E93', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Date</label>
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
                  <label style={{ fontSize: 10, fontWeight: 600, color: '#8E8E93', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Start</label>
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
                  <label style={{ fontSize: 10, fontWeight: 600, color: '#8E8E93', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>End</label>
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

              {/* Category picker */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 10, fontWeight: 600, color: '#8E8E93', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Category</label>
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
                          color: isSel ? c.color : '#636366',
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
                    border: '1px solid rgba(0,0,0,0.10)', backgroundColor: 'transparent', color: '#636366',
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
                    color: editTitle.trim() ? '#FFFFFF' : '#AEAEB2',
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
            <span style={{ fontSize: 11, color: '#8E8E93', marginLeft: 'auto' }}>
              Event
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
            <span style={{ fontSize: 12, color: '#8E8E93', fontWeight: 500 }}>
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
            <p style={{ fontSize: 13, color: '#636366', margin: '0 0 8px', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
              {linkedTask.description}
            </p>
          )}

          {/* Notes */}
          {linkedTask?.notes && (
            <p style={{ fontSize: 13, fontStyle: 'italic', color: '#636366', margin: '0 0 8px', lineHeight: 1.5, whiteSpace: 'pre-wrap', paddingTop: 6, borderTop: '1px solid rgba(0,0,0,0.05)' }}>
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
              <CalendarIcon style={{ width: 13, height: 13, color: '#8E8E93' }} />
              <span style={{ color: THEME.textSecondary }}>Due {formatDateHeader(linkedTask.dueDate)}</span>
            </div>
          )}

          {/* Status indicator */}
          {(isConfirmed || isSkipped) && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px',
              borderRadius: 8, marginBottom: 12, fontSize: 12, fontWeight: 500,
              backgroundColor: isConfirmed ? hexToRgba(item.color, 0.08) : 'rgba(0,0,0,0.04)',
              color: isConfirmed ? item.color : '#8E8E93',
            }}>
              {isConfirmed ? <CheckIcon style={{ width: 13, height: 13 }} /> : <XMarkIcon style={{ width: 13, height: 13 }} />}
              {isConfirmed ? 'Confirmed' : 'Skipped'}
            </div>
          )}

          {/* Actions */}
          <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: 12, marginTop: 4 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
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
                    fontSize: 14, fontWeight: 500, color: '#8E8E93',
                    borderRadius: 8, width: '100%', textAlign: 'left',
                  }}
                >
                  <XMarkIcon style={{ width: 18, height: 18 }} />
                  Skip
                </button>
              )}

              {/* Mark linked task done/undone */}
              {linkedTask && (
                <button
                  type="button"
                  onClick={() => { handleToggleTaskDone(); onClose(); }}
                  className="touch-manipulation"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '12px 4px',
                    border: 'none', backgroundColor: 'transparent',
                    fontSize: 14, fontWeight: 500, color: linkedTask.status === 'done' ? '#8E8E93' : '#6A8C5A',
                    borderRadius: 8, width: '100%', textAlign: 'left',
                  }}
                >
                  <CheckIcon style={{ width: 18, height: 18 }} />
                  {linkedTask.status === 'done' ? 'Mark task not done' : 'Mark task done'}
                </button>
              )}

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
                Delete event
              </button>
            </div>
          </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Full-Detail Add Sheet ─────────────────────────────────

function AddSheet({ mode, onClose }: { mode: 'task' | 'event'; onClose: () => void }) {
  const calendarContainers = useStore((s) => s.calendarContainers);
  const categories = useStore((s) => s.categories);
  const tags = useStore((s) => s.tags);
  const addTask = useStore((s) => s.addTask);
  const addEvent = useStore((s) => s.addEvent);
  const { saveSnapshot } = useHistoryStore();

  const today = getLocalDateString();

  // Shared
  const [title, setTitle] = useState('');
  const [calendarId, setCalendarId] = useState(calendarContainers[0]?.id ?? '');
  const [categoryId, setCategoryId] = useState('');
  const [notes, setNotes] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Task-specific
  const [estimatedMins, setEstimatedMins] = useState(30);
  const [dueDate, setDueDate] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  // Event-specific
  const [eventDate, setEventDate] = useState(today);
  const [eventStart, setEventStart] = useState(() => {
    const now = new Date();
    const h = now.getHours();
    const m = Math.ceil(now.getMinutes() / 15) * 15;
    const sh = m >= 60 ? h + 1 : h;
    const sm = m >= 60 ? 0 : m;
    return `${String(sh).padStart(2, '0')}:${String(sm).padStart(2, '0')}`;
  });
  const [eventEnd, setEventEnd] = useState(() => {
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
    if (first) setCategoryId(first.id);
    setSelectedTagIds([]);
  }, [calendarId]);

  const selectedCategory = categories.find((c) => c.id === categoryId);
  const categoryTags = tags.filter((t) => t.categoryId === categoryId);

  const toggleTag = (id: string) => setSelectedTagIds((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 100); }, []);

  const canSubmit = title.trim() && categoryId && (mode === 'task' || (eventStart && eventEnd));

  const handleSubmit = () => {
    if (!canSubmit) return;
    saveSnapshot();
    const cat = categories.find((c) => c.id === categoryId);
    const calId = calendarId || (cat?.calendarContainerId ?? calendarContainers[0]?.id ?? '');
    if (mode === 'task') {
      addTask({
        title: title.trim(),
        estimatedMinutes: estimatedMins,
        calendarContainerId: calId,
        categoryId,
        tagIds: selectedTagIds,
        flexible: true,
        status: 'inbox',
        notes: notes.trim() || undefined,
        dueDate: dueDate || undefined,
      });
    } else {
      const normalizeTime = (t: string) => { const [h, m] = t.split(':').map(Number); return `${h}:${String(m).padStart(2, '0')}`; };
      addEvent({
        title: title.trim(),
        calendarContainerId: calId,
        categoryId,
        date: eventDate,
        start: normalizeTime(eventStart),
        end: normalizeTime(eventEnd),
        recurring: false,
        source: 'manual',
        notes: notes.trim() || undefined,
      } as any);
    }
    onClose();
  };

  const fmtDuration = (m: number) => m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 > 0 ? ` ${m % 60}m` : ''}`;

  const labelStyle: React.CSSProperties = { fontSize: 10, fontWeight: 600, color: '#8E8E93', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 5 };
  const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(0,0,0,0.10)', fontSize: 15, color: THEME.textPrimary, backgroundColor: 'rgba(0,0,0,0.02)', outline: 'none', boxSizing: 'border-box' };
  const chipStyle = (sel: boolean, color?: string): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500,
    border: sel ? 'none' : '1px solid rgba(0,0,0,0.10)',
    backgroundColor: sel && color ? `${color}20` : sel ? `${THEME.primary}15` : 'transparent',
    color: sel && color ? color : sel ? THEME.primary : '#636366',
  });

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 95, backgroundColor: 'rgba(0,0,0,0.35)', WebkitTapHighlightColor: 'transparent' }} />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 96,
        backgroundColor: '#FFFFFF', borderRadius: '18px 18px 0 0',
        boxShadow: '0 -4px 24px rgba(0,0,0,0.14)',
        maxHeight: '90vh', overflowY: 'auto',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
        animation: 'slideUp 0.22s ease-out',
      }}>
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.12)' }} />
        </div>

        <div style={{ padding: '4px 20px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <p style={{ fontSize: 17, fontWeight: 700, color: THEME.textPrimary, margin: 0 }}>
              {mode === 'task' ? 'New Task' : 'New Event'}
            </p>
            <button type="button" onClick={onClose} className="touch-manipulation" style={{ border: 'none', background: 'transparent', color: '#8E8E93', padding: 4 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>

          {/* Title */}
          <div>
            <label style={labelStyle}>Title</label>
            <input
              ref={inputRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
              placeholder={mode === 'task' ? 'Task name...' : 'Event title...'}
              style={inputStyle}
            />
          </div>

          {/* Event-only: date + time */}
          {mode === 'event' && (
            <>
              <div>
                <label style={labelStyle}>Date</label>
                <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} style={{ ...inputStyle, fontSize: 14 }} />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Start</label>
                  <input type="time" value={eventStart} onChange={(e) => setEventStart(e.target.value)}
                    style={{ ...inputStyle, fontSize: 14, padding: '10px 10px' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>End</label>
                  <input type="time" value={eventEnd} onChange={(e) => setEventEnd(e.target.value)}
                    style={{ ...inputStyle, fontSize: 14, padding: '10px 10px' }} />
                </div>
              </div>
            </>
          )}

          {/* Task-only: estimated time */}
          {mode === 'task' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                <label style={{ ...labelStyle, marginBottom: 0 }}>Estimated Time</label>
                <span style={{ fontSize: 12, fontWeight: 600, color: THEME.textPrimary }}>{fmtDuration(estimatedMins)}</span>
              </div>
              <input
                type="range" min={5} max={240} step={5} value={estimatedMins}
                onChange={(e) => setEstimatedMins(Number(e.target.value))}
                style={{ width: '100%', height: 4, appearance: 'none', WebkitAppearance: 'none', background: `linear-gradient(to right, ${THEME.primary} 0%, ${THEME.primary} ${((estimatedMins - 5) / 235) * 100}%, rgba(0,0,0,0.08) ${((estimatedMins - 5) / 235) * 100}%, rgba(0,0,0,0.08) 100%)`, borderRadius: 2, outline: 'none', cursor: 'pointer', accentColor: THEME.primary }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                <span style={{ fontSize: 9, color: '#AEAEB2' }}>5m</span>
                <span style={{ fontSize: 9, color: '#AEAEB2' }}>4h</span>
              </div>
            </div>
          )}

          {/* Calendar (if multiple) */}
          {calendarContainers.length > 1 && (
            <div>
              <label style={labelStyle}>Calendar</label>
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
            <label style={labelStyle}>Category</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
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
              <label style={labelStyle}>Tags <span style={{ fontWeight: 400, color: '#AEAEB2' }}>(optional)</span></label>
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
              <label style={labelStyle}>Due Date <span style={{ fontWeight: 400, color: '#AEAEB2' }}>(optional)</span></label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
                style={{ ...inputStyle, fontSize: 14 }} />
            </div>
          )}

          {/* Notes */}
          <div>
            <label style={labelStyle}>Notes <span style={{ fontWeight: 400, color: '#AEAEB2' }}>(optional)</span></label>
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
              color: canSubmit ? '#FFFFFF' : '#AEAEB2',
              cursor: canSubmit ? 'pointer' : 'default',
            }}
          >
            {mode === 'task' ? 'Add Task' : 'Create Event'}
          </button>
        </div>
      </div>
    </>
  );
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
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [dropPreviewMins, setDropPreviewMins] = useState<number | null>(null);
  const [confirmedMsg, setConfirmedMsg] = useState<string | null>(null);

  const leftPanelRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const dragTaskRef = useRef<Task | null>(null);
  const ghostRef = useRef<HTMLDivElement | null>(null);

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
    return tasks.filter((t) => t.status !== 'done' && t.status !== 'archived' && !scheduledTaskIds.has(t.id));
  }, [tasks, scheduledTaskIds]);

  const agenda = useMemo(() => {
    const items: AgendaItem[] = [];
    for (const b of timeBlocks.filter((b) => b.date === selectedDate)) {
      const cat = categories.find((c) => c.id === b.categoryId);
      items.push({ type: 'block', id: b.id, title: b.title ?? 'Untitled', start: b.start, end: b.end, color: cat?.color ?? THEME.primary, confirmationStatus: b.confirmationStatus, taskId: b.taskId });
    }
    for (const e of events.filter((e) => e.date === selectedDate)) {
      const cat = categories.find((c) => c.id === e.categoryId);
      items.push({ type: 'event', id: e.id, title: e.title, start: e.start, end: e.end, color: cat?.color ?? THEME.primary });
    }
    return items;
  }, [timeBlocks, events, selectedDate, categories]);

  const selectedTask = tasks.find((t) => t.id === selectedTaskId);

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

  const handleTaskPointerDown = useCallback((e: React.PointerEvent, task: Task) => {
    e.preventDefault();
    dragTaskRef.current = task;
    isDraggingRef.current = false;

    // Create ghost element
    const ghost = document.createElement('div');
    ghost.style.cssText = `position:fixed;pointer-events:none;z-index:200;padding:6px 10px;border-radius:8px;font-size:12px;font-weight:600;color:#FFFFFF;background:${categories.find(c => c.id === task.categoryId)?.color ?? THEME.primary};box-shadow:0 4px 16px rgba(0,0,0,0.25);white-space:nowrap;transform:translate(-50%,-50%);opacity:0;transition:opacity 0.1s;`;
    ghost.textContent = task.title;
    document.body.appendChild(ghost);
    ghostRef.current = ghost;

    const onMove = (me: PointerEvent) => {
      if (!dragTaskRef.current) return;
      isDraggingRef.current = true;
      ghost.style.left = `${me.clientX}px`;
      ghost.style.top = `${me.clientY}px`;
      ghost.style.opacity = '1';

      // Check if over left panel
      const panel = leftPanelRef.current;
      if (panel) {
        const rect = panel.getBoundingClientRect();
        if (me.clientX >= rect.left && me.clientX <= rect.right && me.clientY >= rect.top && me.clientY <= rect.bottom) {
          const snapped = Math.max(gridStartMins, getMinsFromClientY(me.clientY));
          setDropPreviewMins(snapped);
        } else {
          setDropPreviewMins(null);
        }
      }
    };

    const onUp = (ue: PointerEvent) => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      ghost.remove();
      ghostRef.current = null;

      if (isDraggingRef.current && dropPreviewMinsRef.current !== null && dragTaskRef.current) {
        const t = dragTaskRef.current;
        const startMins = dropPreviewMinsRef.current;
        const durationMins = t.estimatedMinutes || 30;
        const endMins = startMins + durationMins;
        const fmtTime = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
        const cat = categories.find((c) => c.id === t.categoryId);
        saveSnapshot();
        addTimeBlock({
          taskId: t.id, title: t.title, date: selectedDate,
          start: fmtTime(startMins), end: fmtTime(endMins),
          mode: 'planned', source: 'manual',
          categoryId: t.categoryId,
          calendarContainerId: t.calendarContainerId ?? calendarContainers[0]?.id ?? '',
          tagIds: t.tagIds ?? [],
        });
        if (t.status === 'inbox' || !t.status) updateTask(t.id, { status: 'planned' });
        setConfirmedMsg(`Scheduled: ${fmtTime(startMins)} for ${durationMins}m`);
        setTimeout(() => setConfirmedMsg(null), 2000);
      }

      setDropPreviewMins(null);
      isDraggingRef.current = false;
      dragTaskRef.current = null;
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, [categories, getMinsFromClientY, gridStartMins, selectedDate, saveSnapshot, addTimeBlock, updateTask, calendarContainers]);

  // Keep dropPreviewMins in a ref so the pointerup closure can read current value
  const dropPreviewMinsRef = useRef<number | null>(null);
  useEffect(() => { dropPreviewMinsRef.current = dropPreviewMins; }, [dropPreviewMins]);

  // Tap-to-schedule (alternative to drag for precision)
  const handleLeftPanelTap = (clientY: number) => {
    if (!selectedTask) return;
    const snapped = Math.max(gridStartMins, getMinsFromClientY(clientY));
    const durationMins = selectedTask.estimatedMinutes || 30;
    const endMins = snapped + durationMins;
    const fmtTime = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
    saveSnapshot();
    addTimeBlock({
      taskId: selectedTask.id, title: selectedTask.title, date: selectedDate,
      start: fmtTime(snapped), end: fmtTime(endMins),
      mode: 'planned', source: 'manual',
      categoryId: selectedTask.categoryId,
      calendarContainerId: selectedTask.calendarContainerId ?? calendarContainers[0]?.id ?? '',
      tagIds: selectedTask.tagIds ?? [],
    });
    if (selectedTask.status === 'inbox' || !selectedTask.status) updateTask(selectedTask.id, { status: 'planned' });
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
      {/* Header: date nav */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid rgba(0,0,0,0.06)', gap: 6 }}>
        <button type="button" onClick={() => navigateDate(-1)} className="touch-manipulation flex items-center justify-center"
          style={{ width: 28, height: 28, borderRadius: 7, border: 'none', backgroundColor: 'transparent', color: THEME.textSecondary, flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <p style={{ flex: 1, textAlign: 'center', fontSize: 15, fontWeight: 600, color: THEME.textPrimary, margin: 0 }}>
          {formatDateHeader(selectedDate)}
        </p>
        <button type="button" onClick={() => navigateDate(1)} className="touch-manipulation flex items-center justify-center"
          style={{ width: 28, height: 28, borderRadius: 7, border: 'none', backgroundColor: 'transparent', color: THEME.textSecondary, flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
        </button>
        {selectedDate !== today && (
          <button type="button" onClick={() => setSelectedDate(today)} className="touch-manipulation"
            style={{ width: 28, height: 28, borderRadius: 7, border: 'none', backgroundColor: 'transparent', color: THEME.primary, flexShrink: 0, fontSize: 10, fontWeight: 600 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
              <circle cx="12" cy="15" r="1.5" fill="currentColor" stroke="none" />
            </svg>
          </button>
        )}
      </div>

      {/* Instruction / selected task hint */}
      <div style={{ flexShrink: 0, padding: '6px 12px', borderBottom: '1px solid rgba(0,0,0,0.04)', minHeight: 28, display: 'flex', alignItems: 'center' }}>
        {selectedTask ? (
          <p style={{ fontSize: 11, color: THEME.primary, margin: 0, fontWeight: 500 }}>
            Tap or drag "{selectedTask.title}" to a time slot →
          </p>
        ) : (
          <p style={{ fontSize: 11, color: '#AEAEB2', margin: 0 }}>
            Tap a task on the right, then tap a time to schedule
          </p>
        )}
        {selectedTask && (
          <button type="button" onClick={() => setSelectedTaskId(null)} style={{ marginLeft: 'auto', border: 'none', background: 'transparent', color: '#AEAEB2', fontSize: 12 }}>✕</button>
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
          <div style={{ position: 'relative', height: hours.length * PLAN_HOUR_HEIGHT + 40 }}>
            {/* Hour lines */}
            {hours.map((h) => {
              const top = (h - wakeHour) * PLAN_HOUR_HEIGHT;
              return (
                <div key={h} style={{ position: 'absolute', top, left: 0, right: 0 }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, width: PLAN_TIME_COL, textAlign: 'right', paddingRight: 6 }}>
                    <span style={{ fontSize: 9, color: '#C7C7CC', fontWeight: 400 }}>
                      {h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`}
                    </span>
                  </div>
                  <div style={{ position: 'absolute', top: 0, left: PLAN_TIME_COL, right: 4, height: 1, backgroundColor: 'rgba(0,0,0,0.05)' }} />
                </div>
              );
            })}

            {/* Scheduled blocks */}
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: PLAN_TIME_COL + 2, right: 4 }}>
              {agenda.map((item) => {
                const startM = parseTimeToMinutes(item.start);
                const endM = parseTimeToMinutes(item.end);
                const top = ((startM - gridStartMins) / 60) * PLAN_HOUR_HEIGHT;
                const height = Math.max(14, ((endM - startM) / 60) * PLAN_HOUR_HEIGHT);
                const isEvent = item.type === 'event';
                const cat = categories.find((c) => c.id === (timeBlocks.find(b => b.id === item.id)?.categoryId ?? events.find(e => e.id === item.id)?.categoryId));
                return (
                  <div key={item.id} style={{
                    position: 'absolute', top, left: 0, right: 0, height,
                    padding: '2px 4px', overflow: 'hidden', borderRadius: 4,
                    borderLeft: `3px solid ${item.color}`,
                    backgroundColor: hexToRgba(item.color, isEvent ? 0.10 : 0.14),
                  }}>
                    <span style={{ fontSize: 9, fontWeight: 600, color: THEME.textPrimary, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {item.title}
                    </span>
                  </div>
                );
              })}

              {/* Drop preview */}
              {dropPreviewMins !== null && dragTaskRef.current && (
                <div style={{
                  position: 'absolute',
                  top: ((dropPreviewMins - gridStartMins) / 60) * PLAN_HOUR_HEIGHT,
                  left: 0, right: 0,
                  height: Math.max(14, ((dragTaskRef.current.estimatedMinutes || 30) / 60) * PLAN_HOUR_HEIGHT),
                  borderRadius: 4,
                  border: `2px dashed ${categories.find(c => c.id === dragTaskRef.current?.categoryId)?.color ?? THEME.primary}`,
                  backgroundColor: hexToRgba(categories.find(c => c.id === dragTaskRef.current?.categoryId)?.color ?? THEME.primary, 0.12),
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
                  <span style={{ fontSize: 9, color: '#AEAEB2', fontWeight: 500 }}>tap to place</span>
                </div>
              )}
            </div>

            {/* Now line */}
            {showNowLine && (
              <div style={{ position: 'absolute', top: nowLineTop, left: 0, right: 4, zIndex: 10, pointerEvents: 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span style={{ fontSize: 8, fontWeight: 600, color: '#FF3B30', width: PLAN_TIME_COL, textAlign: 'right', paddingRight: 4 }}>
                    {(() => { const h = Math.floor(nowMins / 60); const m = nowMins % 60; const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h; return `${h12}:${String(m).padStart(2, '0')}`; })()}
                  </span>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: '#FF3B30', flexShrink: 0, marginLeft: -2.5 }} />
                  <div style={{ flex: 1, height: 1.5, backgroundColor: '#FF3B30' }} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Divider */}
        <div style={{ width: 1, backgroundColor: 'rgba(0,0,0,0.08)', flexShrink: 0 }} />

        {/* RIGHT: Task blocks (46%) */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px 40px', overscrollBehavior: 'contain', backgroundColor: '#FDFDFB' } as React.CSSProperties}>
          {pendingTasks.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 40 }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#D1D1D6" strokeWidth="1.2" strokeLinecap="round" style={{ marginBottom: 8 }}>
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <p style={{ fontSize: 12, color: '#AEAEB2', margin: 0, textAlign: 'center' }}>All tasks scheduled for this day</p>
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
                  onPointerDown={(e) => handleTaskPointerDown(e, task)}
                  onClick={() => setSelectedTaskId(isSelected ? null : task.id)}
                  className="touch-manipulation"
                  style={{
                    height: blockH,
                    marginBottom: 6,
                    borderRadius: 6,
                    padding: '6px 8px',
                    borderTop: `3px solid ${color}`,
                    borderLeft: `1px solid ${hexToRgba(color, 0.22)}`,
                    borderRight: `1px solid ${hexToRgba(color, 0.22)}`,
                    borderBottom: `1px solid ${hexToRgba(color, 0.22)}`,
                    backgroundColor: isSelected ? hexToRgba(color, 0.18) : '#FFF9EC',
                    boxShadow: isSelected ? `0 0 0 2px ${color}` : '0 1px 4px rgba(0,0,0,0.08)',
                    cursor: 'grab',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    touchAction: 'none',
                  }}
                >
                  <p style={{ fontSize: 11, fontWeight: 600, color: THEME.textPrimary, margin: 0, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: Math.max(1, Math.floor((blockH - 24) / 14)), WebkitBoxOrient: 'vertical', lineHeight: 1.3 }}>
                    {task.title}
                  </p>
                  {blockH >= 50 && (
                    <span style={{ fontSize: 9, color: '#8E8E93', alignSelf: 'flex-end' }}>
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
          position: 'absolute', bottom: 16, left: 16, right: 16, zIndex: 50,
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
  section: TimeOfDaySection;
}

function ScheduleTab({ addEventTriggerRef }: { addEventTriggerRef?: React.MutableRefObject<(() => void) | null> }) {
  const timeBlocks = useStore((s) => s.timeBlocks);
  const events = useStore((s) => s.events);
  const categories = useStore((s) => s.categories);
  const calendarContainers = useStore((s) => s.calendarContainers);
  const activeTimer = useStore((s) => s.activeTimer);
  const addTimeBlock = useStore((s) => s.addTimeBlock);
  const updateTimeBlock = useStore((s) => s.updateTimeBlock);
  const addEvent = useStore((s) => s.addEvent);
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
  const [detailItem, setDetailItem] = useState<AgendaItem | null>(null);
  const [showStartForm, setShowStartForm] = useState(false);
  const [showEventForm, setShowEventForm] = useState(false);
  const [eventTitle, setEventTitle] = useState('');
  const [eventStart, setEventStart] = useState('');
  const [eventEnd, setEventEnd] = useState('');
  const [eventCalendarId, setEventCalendarId] = useState('');
  const [eventCategoryId, setEventCategoryId] = useState('');
  const [timerTitle, setTimerTitle] = useState('');
  const [selectedCalendarId, setSelectedCalendarId] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [elapsed, setElapsed] = useState('0:00');
  const [sessionNotes, setSessionNotes] = useState('');
  const [showSessionNotes, setShowSessionNotes] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Record<TimeOfDaySection, boolean>>({
    morning: false, afternoon: false, evening: false,
  });
  const [swipedItemId, setSwipedItemId] = useState<string | null>(null);
  const swipeStartXRef = useRef(0);
  const swipeCurrentXRef = useRef(0);
  const [swipeOffset, setSwipeOffset] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
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

  // Timer tick
  useEffect(() => {
    if (!activeTimer) { setElapsed('0:00'); return; }
    setSessionNotes('');
    setShowSessionNotes(false);
    const tick = () => setElapsed(formatElapsed(Date.now() - activeTimer.startedAt));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [activeTimer?.blockId]);

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
        section: getSection(startM),
      });
    }
    for (const e of events.filter((e) => e.date === selectedDate)) {
      const cat = categories.find((c) => c.id === e.categoryId);
      const startM = parseTimeToMinutes(e.start);
      const endM = parseTimeToMinutes(e.end);
      items.push({
        type: 'event', id: e.id, title: e.title,
        start: e.start, end: e.end, startMins: startM, endMins: endM,
        color: cat?.color ?? THEME.primary,
        section: getSection(startM),
      });
    }
    items.sort((a, b) => a.startMins - b.startMins);
    return items;
  }, [timeBlocks, events, selectedDate, categories]);

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
    // Check for active timer first
    if (activeTimer) {
      const timerBlock = timeBlocks.find((b) => b.id === activeTimer.blockId);
      if (timerBlock) {
        const cat = categories.find((c) => c.id === timerBlock.categoryId);
        return {
          type: 'block' as const, id: timerBlock.id, title: timerBlock.title ?? 'Timer',
          start: timerBlock.start, end: timerBlock.end,
          startMins: parseTimeToMinutes(timerBlock.start), endMins: parseTimeToMinutes(timerBlock.end),
          color: cat?.color ?? THEME.primary,
          confirmationStatus: timerBlock.confirmationStatus, taskId: timerBlock.taskId,
          section: getSection(parseTimeToMinutes(timerBlock.start)),
        } as ScheduleCardItem;
      }
    }
    // Otherwise find the item that spans "now"
    return scheduleItems.find((item) => item.startMins <= nowMins && item.endMins > nowMins) ?? null;
  }, [activeTimer, timeBlocks, scheduleItems, today, nowMins, selectedDate, categories]);

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

  // Filtered categories for timer form
  const filteredCategories = useMemo(() => {
    if (!selectedCalendarId) return categories;
    return categories.filter((c) => {
      const ids = c.calendarContainerIds;
      if (ids && ids.length > 0) return ids.includes(selectedCalendarId);
      return c.calendarContainerId === selectedCalendarId || !c.calendarContainerId;
    });
  }, [selectedCalendarId, categories]);

  // Filtered categories for event form
  const eventFilteredCategories = useMemo(() => {
    if (!eventCalendarId) return categories;
    return categories.filter((c) => {
      const ids = c.calendarContainerIds;
      if (ids && ids.length > 0) return ids.includes(eventCalendarId);
      return c.calendarContainerId === eventCalendarId || !c.calendarContainerId;
    });
  }, [eventCalendarId, categories]);

  // Auto-select calendar/category for forms
  useEffect(() => {
    if (showStartForm && calendarContainers.length > 0 && !selectedCalendarId)
      setSelectedCalendarId(calendarContainers[0].id);
  }, [showStartForm, calendarContainers, selectedCalendarId]);

  useEffect(() => {
    if (!selectedCalendarId) return;
    const first = filteredCategories[0];
    if (first) setSelectedCategoryId(first.id);
  }, [selectedCalendarId, filteredCategories]);

  useEffect(() => {
    if (showStartForm) setTimeout(() => inputRef.current?.focus(), 100);
  }, [showStartForm]);

  useEffect(() => {
    if (!eventCalendarId) return;
    const first = eventFilteredCategories[0];
    if (first) setEventCategoryId(first.id);
  }, [eventCalendarId, eventFilteredCategories]);

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

  const handleCreateEvent = useCallback(() => {
    if (!eventTitle.trim() || !eventStart || !eventEnd || !eventCategoryId) return;
    const cat = categories.find((c) => c.id === eventCategoryId);
    if (!cat) return;
    saveSnapshot();
    addEvent({
      title: eventTitle.trim(),
      calendarContainerId: eventCalendarId || (cat.calendarContainerId ?? calendarContainers[0]?.id ?? ''),
      categoryId: cat.id,
      start: eventStart,
      end: eventEnd,
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
    saveSnapshot();
    if (item.type === 'block') {
      useStore.getState().deleteTimeBlock(item.id);
    } else {
      useStore.getState().deleteEvent(item.id);
    }
    setSwipedItemId(null);
    setSwipeOffset(0);
  }, [saveSnapshot]);

  // Current block for timer display
  const currentBlock = useMemo(() => {
    if (!activeTimer) return null;
    return timeBlocks.find((b) => b.id === activeTimer.blockId) ?? null;
  }, [activeTimer, timeBlocks]);

  const currentColor = currentBlock
    ? (categories.find((c) => c.id === currentBlock.categoryId)?.color ?? THEME.primary)
    : THEME.primary;

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
                width: 80, border: 'none', backgroundColor: '#FF3B30',
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
            backgroundColor: '#FFFFFF',
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
          {/* Color indicator */}
          <div style={{
            width: 4,
            alignSelf: 'stretch',
            borderRadius: 2,
            backgroundColor: item.color,
            flexShrink: 0,
            opacity: isPast ? 0.5 : 1,
          }} />

          {/* Content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <span style={{
                fontSize: 14,
                fontWeight: 500,
                color: THEME.textPrimary,
                textDecoration: isSkipped ? 'line-through' : 'none',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: 1,
              }}>
                {item.title}
              </span>
              {isConfirmed && <CheckBadge color={item.color} />}
              {isSkipped && (
                <span style={{ fontSize: 10, fontWeight: 500, color: '#8E8E93' }}>skipped</span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: '#8E8E93' }}>
                {formatTime12(item.start)} – {formatTime12(item.end)}
              </span>
              <span style={{ fontSize: 11, color: '#AEAEB2', fontWeight: 500 }}>
                {fmtDuration(durationMins)}
              </span>
              {isEvent && (
                <span style={{
                  fontSize: 9, fontWeight: 600, letterSpacing: '0.04em',
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
          {item.type === 'block' && isPast && !isConfirmed && !isSkipped && (
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
              <button type="button" onClick={() => handleConfirm(item.id)} className="touch-manipulation"
                style={{
                  width: 32, height: 32, borderRadius: 16, border: 'none',
                  backgroundColor: `${item.color}15`, color: item.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                <CheckIcon style={{ width: 14, height: 14 }} />
              </button>
              <button type="button" onClick={() => handleSkip(item.id)} className="touch-manipulation"
                style={{
                  width: 32, height: 32, borderRadius: 16, border: 'none',
                  backgroundColor: 'rgba(0,0,0,0.04)', color: '#8E8E93',
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
              fontSize: 9, fontWeight: 700, letterSpacing: '0.05em',
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
      {/* Active timer banner */}
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
              <div className="flex items-center gap-2">
                <span className="font-mono tabular-nums" style={{ fontSize: 20, fontWeight: 600, color: currentColor }}>
                  {elapsed}
                </span>
                <button
                  type="button"
                  onClick={() => setShowSessionNotes(v => !v)}
                  className="touch-manipulation flex items-center gap-1"
                  style={{ background: 'none', border: 'none', padding: '2px 4px', borderRadius: 6, color: showSessionNotes ? currentColor : THEME.textMuted, fontSize: 11, fontWeight: 500 }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                  </svg>
                  Notes
                  {sessionNotes.trim() && <span style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: currentColor, display: 'inline-block', marginLeft: 2 }} />}
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                if (sessionNotes.trim()) {
                  const block = currentBlock;
                  const existing = block?.notes?.trim() ?? '';
                  const combined = existing ? `${existing}\n\n${sessionNotes.trim()}` : sessionNotes.trim();
                  updateTimeBlock(activeTimer.blockId, { notes: combined });
                }
                setSessionNotes('');
                setShowSessionNotes(false);
                stopTimer();
              }}
              className="touch-manipulation flex items-center gap-1.5"
              style={{
                padding: '6px 16px', borderRadius: 20,
                backgroundColor: 'rgba(255,59,48,0.10)', color: '#FF3B30',
                fontSize: 13, fontWeight: 600, border: 'none', flexShrink: 0,
              }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2" /></svg>
              Stop
            </button>
          </div>
          {showSessionNotes && (
            <textarea
              value={sessionNotes}
              onChange={e => setSessionNotes(e.target.value)}
              placeholder="Session notes... (saved to block on stop)"
              style={{
                marginTop: 8, width: '100%', minHeight: 72, padding: '8px 10px',
                borderRadius: 8, border: `1px solid ${currentColor}40`,
                backgroundColor: 'rgba(255,255,255,0.7)', fontSize: 13,
                color: THEME.textPrimary, resize: 'none', outline: 'none',
                fontFamily: 'inherit', boxSizing: 'border-box',
              }}
            />
          )}
        </div>
      )}

      {/* Header: Date navigation */}
      <div className="flex-shrink-0" style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
        <div className="flex items-center" style={{ padding: '10px 16px', gap: 8 }}>
          <button
            type="button"
            onClick={() => navigateDate(-1)}
            className="touch-manipulation flex items-center justify-center"
            style={{ width: 32, height: 32, borderRadius: 8, border: 'none', backgroundColor: 'transparent', color: THEME.textSecondary, flexShrink: 0 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>

          <div style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
            <p style={{ fontSize: 16, fontWeight: 600, color: THEME.textPrimary, margin: 0 }}>
              {formatDateHeader(selectedDate)}
            </p>
          </div>

          <button
            type="button"
            onClick={() => navigateDate(1)}
            className="touch-manipulation flex items-center justify-center"
            style={{ width: 32, height: 32, borderRadius: 8, border: 'none', backgroundColor: 'transparent', color: THEME.textSecondary, flexShrink: 0 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
          </button>

          {selectedDate !== today && (
            <button type="button" onClick={() => setSelectedDate(today)} className="touch-manipulation"
              style={{
                padding: '4px 10px', borderRadius: 14, border: `1px solid ${THEME.primary}30`,
                backgroundColor: `${THEME.primary}08`, color: THEME.primary,
                fontSize: 11, fontWeight: 600, flexShrink: 0,
              }}>
              Today
            </button>
          )}
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', padding: '12px 16px 100px' } as React.CSSProperties}>

        {/* "Now" card — shows what's happening right now */}
        {selectedDate === today && !activeTimer && (
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
                  <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: currentItem.color }}>
                    Now
                  </span>
                </div>
                <p style={{ fontSize: 17, fontWeight: 600, color: THEME.textPrimary, margin: '0 0 4px' }}>
                  {currentItem.title}
                </p>
                <p style={{ fontSize: 13, color: '#8E8E93', margin: 0 }}>
                  {(() => {
                    const remaining = currentItem.endMins - nowMins;
                    if (remaining <= 0) return 'Ending now';
                    return `${fmtDuration(remaining)} left`;
                  })()}
                </p>
                {nextItem && (
                  <p style={{ fontSize: 12, color: '#AEAEB2', margin: '6px 0 0', borderTop: '1px solid rgba(0,0,0,0.04)', paddingTop: 6 }}>
                    Up next: {nextItem.title} at {formatTime12(nextItem.start)}
                  </p>
                )}
              </>
            ) : nextItem ? (
              <>
                <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#AEAEB2' }}>
                  Free time
                </span>
                <p style={{ fontSize: 15, fontWeight: 500, color: THEME.textPrimary, margin: '4px 0 0' }}>
                  Free until {formatTime12(nextItem.start)}
                </p>
                <p style={{ fontSize: 12, color: '#8E8E93', margin: '2px 0 0' }}>
                  Next: {nextItem.title}
                </p>
              </>
            ) : scheduleItems.length === 0 ? (
              <>
                <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#AEAEB2' }}>
                  Today
                </span>
                <p style={{ fontSize: 15, fontWeight: 500, color: THEME.textSecondary, margin: '4px 0 0' }}>
                  Nothing scheduled. Tap + to add.
                </p>
              </>
            ) : (
              <>
                <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#AEAEB2' }}>
                  All done
                </span>
                <p style={{ fontSize: 15, fontWeight: 500, color: THEME.textSecondary, margin: '4px 0 0' }}>
                  No more items for today
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
                <span style={{ fontSize: 13, fontWeight: 600, color: isActiveSection ? THEME.textPrimary : '#8E8E93' }}>
                  {config.label}
                </span>
                {count > 0 && (
                  <span style={{
                    fontSize: 10, fontWeight: 600, color: THEME.primary,
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
                      <p style={{ fontSize: 13, color: '#AEAEB2', margin: 0 }}>
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
              <span style={{ fontSize: 13, fontWeight: 600, color: '#8E8E93' }}>
                Unscheduled
              </span>
              <span style={{
                fontSize: 10, fontWeight: 600, color: '#FF9500',
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
                    <span style={{ fontSize: 11, color: '#AEAEB2' }}>
                      {fmtDuration(task.estimatedMinutes || 30)}
                      {task.dueDate === selectedDate && ' \u00b7 Due today'}
                    </span>
                  </div>
                  <div style={{
                    fontSize: 10, fontWeight: 600, color: THEME.primary,
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

      {/* FABs — bottom right */}
      {!showStartForm && (
        <div style={{ position: 'absolute', bottom: 20, right: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, zIndex: 30 }}>
          {/* Add event button */}
          <button
            type="button"
            onClick={() => {
              const now = new Date();
              const h = now.getHours();
              const m = now.getMinutes();
              const roundedM = Math.ceil(m / 15) * 15;
              const startH = roundedM >= 60 ? h + 1 : h;
              const startMin = roundedM >= 60 ? 0 : roundedM;
              setEventStart(`${String(startH).padStart(2, '0')}:${String(startMin).padStart(2, '0')}`);
              setEventEnd(`${String(startH + 1).padStart(2, '0')}:${String(startMin).padStart(2, '0')}`);
              if (calendarContainers.length > 0 && !eventCalendarId) setEventCalendarId(calendarContainers[0].id);
              setShowEventForm(true);
              setTimeout(() => eventInputRef.current?.focus(), 100);
            }}
            className="touch-manipulation"
            style={{
              width: 40, height: 40, borderRadius: 20, border: 'none',
              backgroundColor: '#FFFFFF', color: THEME.textSecondary,
              boxShadow: '0 2px 8px rgba(0,0,0,0.14)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
              <line x1="12" y1="14" x2="12" y2="18" />
              <line x1="10" y1="16" x2="14" y2="16" />
            </svg>
          </button>
          {/* Play/timer button */}
          {!activeTimer && selectedDate === today && (
            <button
              type="button"
              onClick={() => setShowStartForm(true)}
              className="touch-manipulation"
              style={{
                width: 44, height: 44, borderRadius: 22, border: 'none',
                backgroundColor: `${THEME.primary}CC`, color: '#FFFFFF',
                boxShadow: '0 3px 10px rgba(141,162,134,0.35)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
            </button>
          )}
        </div>
      )}

      {/* Detail sheet for tapped block/event */}
      {detailItem && (
        <DetailSheet
          item={detailItem}
          onClose={() => setDetailItem(null)}
          onConfirm={(id) => { handleConfirm(id); setDetailItem(null); }}
          onSkip={(id) => { handleSkip(id); setDetailItem(null); }}
        />
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
              width: '100%', padding: '10px 12px', borderRadius: 10,
              border: '1px solid rgba(0,0,0,0.10)', fontSize: 15,
              color: THEME.textPrimary, backgroundColor: 'rgba(0,0,0,0.02)',
              outline: 'none', boxSizing: 'border-box',
            }}
          />
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

      {/* Event creation sheet */}
      {showEventForm && (
        <>
          <div
            onClick={() => { setShowEventForm(false); setEventTitle(''); }}
            style={{
              position: 'fixed', inset: 0, zIndex: 90,
              backgroundColor: 'rgba(0,0,0,0.3)',
              WebkitTapHighlightColor: 'transparent',
            }}
          />
          <div
            style={{
              position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 91,
              backgroundColor: '#FFFFFF', borderRadius: '16px 16px 0 0',
              boxShadow: '0 -4px 24px rgba(0,0,0,0.12)',
              paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
              animation: 'slideUp 0.2s ease-out',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.12)' }} />
            </div>
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
                  <label style={{ fontSize: 10, fontWeight: 600, color: '#8E8E93', letterSpacing: '0.04em', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Start</label>
                  <input type="time" value={eventStart} onChange={(e) => setEventStart(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.10)', fontSize: 14, color: THEME.textPrimary, backgroundColor: '#FFFFFF', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 10, fontWeight: 600, color: '#8E8E93', letterSpacing: '0.04em', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>End</label>
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
                        style={{ padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500, border: isSel ? 'none' : '1px solid rgba(0,0,0,0.12)', backgroundColor: isSel ? `${cal.color}20` : 'transparent', color: isSel ? cal.color : '#636366' }}>
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
                      style={{ padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500, border: isSel ? 'none' : '1px solid rgba(0,0,0,0.12)', backgroundColor: isSel ? `${cat.color}20` : 'transparent', color: isSel ? cat.color : '#636366' }}>
                      {cat.name}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => { setShowEventForm(false); setEventTitle(''); }} className="touch-manipulation"
                  style={{ flex: 1, padding: '10px', borderRadius: 10, fontSize: 14, fontWeight: 500, border: '1px solid rgba(0,0,0,0.10)', backgroundColor: 'transparent', color: '#636366' }}>
                  Cancel
                </button>
                <button type="button" onClick={handleCreateEvent} disabled={!eventTitle.trim() || !eventStart || !eventEnd} className="touch-manipulation"
                  style={{ flex: 2, padding: '10px', borderRadius: 10, fontSize: 14, fontWeight: 600, border: 'none', backgroundColor: eventTitle.trim() && eventStart && eventEnd ? THEME.primary : 'rgba(0,0,0,0.06)', color: eventTitle.trim() && eventStart && eventEnd ? '#FFFFFF' : '#AEAEB2' }}>
                  Create Event
                </button>
              </div>
            </div>
          </div>
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
  const [mins, setMins] = useState(task.estimatedMinutes || 30);
  const [showReschedulePicker, setShowReschedulePicker] = useState(false);

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
    const [h, m] = pickerTime.split(':').map(Number);
    const normTime = `${h}:${String(m).padStart(2, '0')}`;
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
              fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 99,
              backgroundColor: hexToRgba(catColor, 0.08), color: catColor,
              border: `1px solid ${hexToRgba(catColor, 0.18)}`,
            }}>{tag.name}</span>
          ))}
        </div>
      )}
      {task.description && (
        <p style={{ fontSize: 12, color: '#636366', margin: '0 0 8px', lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>{task.description}</p>
      )}
      {task.notes && (
        <p style={{ fontSize: 12, fontStyle: 'italic', color: '#636366', margin: '0 0 8px', lineHeight: 1.4, paddingTop: 4, borderTop: '1px solid rgba(0,0,0,0.05)', whiteSpace: 'pre-wrap' }}>{task.notes}</p>
      )}
      {'link' in task && (task as any).link && (
        <a href={(task as any).link} target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 11, color: '#8DA286', display: 'block', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {(task as any).link}
        </a>
      )}
      {/* Duration slider */}
      <div style={{ marginBottom: 10 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: '#8E8E93', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Duration</span>
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
          <span style={{ fontSize: 9, color: '#AEAEB2' }}>5m</span>
          <span style={{ fontSize: 9, color: '#AEAEB2' }}>4h</span>
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
          <div
            onClick={(e) => { e.stopPropagation(); setShowReschedulePicker(false); }}
            style={{
              position: 'fixed', inset: 0, zIndex: 90,
              backgroundColor: 'rgba(0,0,0,0.3)',
              WebkitTapHighlightColor: 'transparent',
            }}
          />
          {/* Bottom sheet picker */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 91,
              backgroundColor: '#FFFFFF',
              borderRadius: '16px 16px 0 0',
              boxShadow: '0 -4px 24px rgba(0,0,0,0.12)',
              maxHeight: '75vh',
              overflowY: 'auto',
              paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
              animation: 'slideUp 0.2s ease-out',
            }}
          >
            {/* Drag handle */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.12)' }} />
            </div>

            <div style={{ padding: '4px 20px 16px' }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: THEME.textPrimary, margin: '0 0 14px' }}>
                Reschedule "{task.title}"
              </h3>

              {/* Date picker — day buttons */}
              <div style={{ marginBottom: 14 }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: '#8E8E93', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Pick a day</span>
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
                        <span style={{ fontSize: 9, color: isSel ? THEME.primary : '#8E8E93', marginTop: 1 }}>{opt.sublabel}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Time slot picker */}
              <div style={{ marginBottom: 14 }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: '#8E8E93', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Pick a time</span>
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
                  <span style={{ fontSize: 11, color: '#8E8E93' }}>or</span>
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
                    border: '1px solid rgba(0,0,0,0.10)', backgroundColor: 'transparent', color: '#636366',
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
                    color: pickerDate ? '#FFFFFF' : '#AEAEB2',
                  }}
                >
                  Schedule
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── TO-DO Tab (Quick capture + task list with scheduling) ──

function TodoTab({ addTriggerRef }: { addTriggerRef?: React.MutableRefObject<(() => void) | null> }) {
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

  const parsed = useMemo(() => parseTaskInput(title), [title]);

  const handleCapture = useCallback(() => {
    if (!parsed.title) return;
    // Use defaults with fallback — don't silently fail if calendar/category not loaded yet
    const calId = defaultCalendar?.id ?? calendarContainers[0]?.id ?? '';
    const catId = defaultCategory?.id ?? categories[0]?.id ?? '';
    saveSnapshot();
    addTask({
      title: parsed.title,
      estimatedMinutes: parsed.minutes,
      calendarContainerId: calId,
      categoryId: catId,
      tagIds: [],
      flexible: true,
      status: 'inbox',
    });
    setTitle('');
    inputRef.current?.focus();
  }, [parsed, defaultCalendar, defaultCategory, calendarContainers, categories, saveSnapshot, addTask]);

  // Tasks with blocks scheduled for today
  const todayTaskIds = useMemo(() => {
    const ids = new Set<string>();
    for (const b of timeBlocks) {
      if (b.date === todayStr && b.taskId) ids.add(b.taskId);
    }
    return ids;
  }, [timeBlocks, todayStr]);

  const activeTasks = useMemo(() => {
    const filtered = tasks.filter((t) => {
      if (filter === 'done') return t.status === 'done';
      if (filter === 'today') return t.status !== 'done' && t.status !== 'archived' && todayTaskIds.has(t.id);
      return t.status !== 'done' && t.status !== 'archived';
    });
    // Sort: priority desc → due date asc (soonest first) → newest first (reverse array order)
    return [...filtered].sort((a, b) => {
      // Priority: higher number = more important → show first
      const pa = a.priority ?? 0;
      const pb = b.priority ?? 0;
      if (pb !== pa) return pb - pa;
      // Due date: tasks with due dates before those without, sooner dates first
      const da = a.dueDate ?? '';
      const db = b.dueDate ?? '';
      if (da && !db) return -1;
      if (!da && db) return 1;
      if (da && db && da !== db) return da.localeCompare(db);
      // Newest first: later index in original array = newer
      return filtered.indexOf(b) - filtered.indexOf(a);
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

  const handleScheduleLater = useCallback((task: Task, date: string, time: string) => {
    const duration = task.estimatedMinutes || 30;
    const endMins = parseTimeToMinutes(time) + duration;
    const endTime = `${Math.floor(endMins / 60)}:${String(endMins % 60).padStart(2, '0')}`;
    saveSnapshot();
    addTimeBlock({
      taskId: task.id,
      title: task.title,
      date,
      start: time,
      end: endTime,
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
    const d = new Date(date + 'T00:00:00');
    const dayLabel = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    setTimeout(() => alert(`Scheduled for ${dayLabel} at ${formatTime12(time)}`), 50);
  }, [saveSnapshot, addTimeBlock, updateTask]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative', boxSizing: 'border-box' }}>
      {/* Quick capture input — always visible at top */}
      <div style={{ flexShrink: 0, padding: '14px 16px 0' }}>
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCapture(); }}
            placeholder='Add task... (e.g. "Read book 30min")'
            style={{
              flex: 1,
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid rgba(0,0,0,0.10)',
              fontSize: 14,
              color: THEME.textPrimary,
              backgroundColor: '#FFFFFF',
              outline: 'none',
            }}
          />
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
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 68px)', overscrollBehavior: 'contain' } as React.CSSProperties}>
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
                onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
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
                  cursor: 'pointer',
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
                      <span style={{ display: 'inline-flex', gap: 1 }}>
                        {Array.from({ length: Math.min(task.priority, 5) }, (_, i) => (
                          <svg key={i} width="9" height="9" viewBox="0 0 24 24" fill="#F5A623" stroke="none">
                            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                          </svg>
                        ))}
                      </span>
                    )}
                  </div>
                </div>

                {/* Chevron */}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#AEAEB2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  style={{ flexShrink: 0, transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>

              {/* Expanded schedule actions */}
              {isExpanded && !isDone && (
                <TodoExpandedPanel task={task} color={color} onScheduleToday={handleScheduleToday} onScheduleLater={handleScheduleLater} />
              )}
            </div>
          );
        })}
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
            backgroundColor: '#FF3B30',
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
            backgroundColor: '#1C1C1E',
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
