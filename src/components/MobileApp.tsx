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

// ─── Main Component ────────────────────────────────────────

export function MobileApp() {
  const [activeTab, setActiveTab] = useState<MobileTab>('schedule');

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

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', backgroundColor: '#FDFDFB', maxWidth: '100vw', overscrollBehavior: 'none' }}>
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
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
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
  const updateTimeBlock = useStore((s) => s.updateTimeBlock);
  const startTimer = useStore((s) => s.startTimer);
  const stopTimer = useStore((s) => s.stopTimer);
  const confirmBlock = useStore((s) => s.confirmBlock);
  const skipBlock = useStore((s) => s.skipBlock);
  const tasks = useStore((s) => s.tasks);
  const updateTask = useStore((s) => s.updateTask);
  const wakeTime = useStore((s) => s.wakeTime);
  const sleepTime = useStore((s) => s.sleepTime);
  const { saveSnapshot } = useHistoryStore();

  const weekStartsOnMonday = useStore((s) => s.weekStartsOnMonday);

  const [scheduleView, setScheduleView] = useState<'day' | 'week'>('day');
  const [selectedDate, setSelectedDate] = useState(getLocalDateString());
  const [tappedBlockId, setTappedBlockId] = useState<string | null>(null);
  const [detailItem, setDetailItem] = useState<AgendaItem | null>(null);
  const [showStartForm, setShowStartForm] = useState(false);
  const [timerTitle, setTimerTitle] = useState('');
  const [selectedCalendarId, setSelectedCalendarId] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [elapsed, setElapsed] = useState('0:00');
  const gridRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ─── Touch drag state ────────────────────────────────────
  const [draggingBlockId, setDraggingBlockId] = useState<string | null>(null);
  const [dragOffsetMins, setDragOffsetMins] = useState(0);
  const [dragCurrentTop, setDragCurrentTop] = useState(0);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartYRef = useRef(0);
  const dragBlockInfoRef = useRef<{ durationMins: number; startMins: number } | null>(null);

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

  // ─── Touch drag handlers ──────────────────────────────────
  const handleBlockTouchStart = useCallback((e: React.TouchEvent, blockId: string, startMins: number, durationMins: number) => {
    const touch = e.touches[0];
    touchStartYRef.current = touch.clientY;
    dragBlockInfoRef.current = { durationMins, startMins };

    // Long press to start drag (300ms)
    longPressTimerRef.current = setTimeout(() => {
      setDraggingBlockId(blockId);
      setDragOffsetMins(0);
      const top = ((startMins - gridStartMins) / 60) * HOUR_HEIGHT;
      setDragCurrentTop(top);
      // Haptic feedback if available
      if (navigator.vibrate) navigator.vibrate(30);
    }, 300);
  }, [gridStartMins]);

  // Store drag state in refs so the native touchmove listener can access current values
  const draggingBlockIdRef = useRef<string | null>(null);
  useEffect(() => { draggingBlockIdRef.current = draggingBlockId; }, [draggingBlockId]);

  const gridStartMinsRef = useRef(gridStartMins);
  useEffect(() => { gridStartMinsRef.current = gridStartMins; }, [gridStartMins]);

  const gridTotalMinsRef = useRef(gridTotalMins);
  useEffect(() => { gridTotalMinsRef.current = gridTotalMins; }, [gridTotalMins]);

  // Native non-passive touchmove on the grid — React's onTouchMove is passive and can't preventDefault
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    const handler = (e: TouchEvent) => {
      if (!draggingBlockIdRef.current || !gridRef.current || !dragBlockInfoRef.current) {
        // Cancel long press if finger moved before it triggered
        if (longPressTimerRef.current) {
          const touch = e.touches[0];
          const dy = Math.abs(touch.clientY - touchStartYRef.current);
          if (dy > 8) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
          }
        }
        return;
      }
      e.preventDefault(); // actually works because { passive: false }
      e.stopPropagation();

      const touch = e.touches[0];
      const gridRect = gridRef.current.getBoundingClientRect();
      const scrollTop = gridRef.current.scrollTop;
      const relativeY = touch.clientY - gridRect.top + scrollTop;

      const totalMins = (relativeY / HOUR_HEIGHT) * 60 + gridStartMinsRef.current;
      const snappedMins = Math.round(totalMins / 15) * 15;
      const clampedMins = Math.max(gridStartMinsRef.current, Math.min(snappedMins, gridStartMinsRef.current + gridTotalMinsRef.current - dragBlockInfoRef.current.durationMins));

      const newTop = ((clampedMins - gridStartMinsRef.current) / 60) * HOUR_HEIGHT;
      setDragCurrentTop(newTop);
      setDragOffsetMins(clampedMins - dragBlockInfoRef.current.startMins);
    };

    grid.addEventListener('touchmove', handler, { passive: false });
    return () => grid.removeEventListener('touchmove', handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleBlockTouchEnd = useCallback(() => {
    // Clear long press timer
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    if (draggingBlockId && dragBlockInfoRef.current && dragOffsetMins !== 0) {
      const block = timeBlocks.find((b) => b.id === draggingBlockId);
      if (block) {
        const oldStart = parseTimeToMinutes(block.start);
        const oldEnd = parseTimeToMinutes(block.end);
        const newStart = oldStart + dragOffsetMins;
        const newEnd = oldEnd + dragOffsetMins;
        const fmtTime = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
        saveSnapshot();
        updateTimeBlock(draggingBlockId, {
          start: fmtTime(newStart),
          end: fmtTime(newEnd),
          editedAt: Date.now(),
        });
      }
    }
    setDraggingBlockId(null);
    setDragOffsetMins(0);
    dragBlockInfoRef.current = null;
  }, [draggingBlockId, dragOffsetMins, timeBlocks, saveSnapshot, updateTimeBlock]);

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

  // Week dates for week view
  const weekDates = useMemo(() => {
    const d = new Date(selectedDate + 'T00:00:00');
    const dayOfWeek = d.getDay(); // 0=Sun
    const startOffset = weekStartsOnMonday
      ? (dayOfWeek === 0 ? -6 : 1 - dayOfWeek)
      : -dayOfWeek;
    const dates: string[] = [];
    for (let i = 0; i < 7; i++) {
      const dt = new Date(d);
      dt.setDate(d.getDate() + startOffset + i);
      dates.push(getLocalDateString(dt));
    }
    return dates;
  }, [selectedDate, weekStartsOnMonday]);

  // Build week agenda (all blocks + events for the week)
  const weekAgenda = useMemo(() => {
    if (scheduleView !== 'week') return new Map<string, AgendaItem[]>();
    const dateSet = new Set(weekDates);
    const byDate = new Map<string, AgendaItem[]>();
    for (const dateStr of weekDates) byDate.set(dateStr, []);

    for (const b of timeBlocks) {
      if (!dateSet.has(b.date)) continue;
      const cat = categories.find((c) => c.id === b.categoryId);
      byDate.get(b.date)!.push({
        type: 'block', id: b.id, title: b.title ?? 'Untitled',
        start: b.start, end: b.end, color: cat?.color ?? THEME.primary,
        confirmationStatus: b.confirmationStatus, taskId: b.taskId,
      });
    }
    for (const e of events) {
      if (!dateSet.has(e.date)) continue;
      const cat = categories.find((c) => c.id === e.categoryId);
      byDate.get(e.date)!.push({
        type: 'event', id: e.id, title: e.title,
        start: e.start, end: e.end, color: cat?.color ?? THEME.primary,
      });
    }
    return byDate;
  }, [scheduleView, weekDates, timeBlocks, events, categories]);

  const navigateWeek = (dir: -1 | 1) => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + dir * 7);
    setSelectedDate(getLocalDateString(d));
    setTappedBlockId(null);
  };

  const weekLabel = useMemo(() => {
    if (weekDates.length === 0) return '';
    const first = new Date(weekDates[0] + 'T00:00:00');
    const last = new Date(weekDates[6] + 'T00:00:00');
    const mo = first.toLocaleDateString('en-US', { month: 'long' });
    if (first.getMonth() === last.getMonth()) {
      return `${mo} ${first.getDate()}–${last.getDate()}`;
    }
    const mo2 = last.toLocaleDateString('en-US', { month: 'short' });
    return `${first.toLocaleDateString('en-US', { month: 'short' })} ${first.getDate()} – ${mo2} ${last.getDate()}`;
  }, [weekDates]);

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

      {/* Header: Date + Day/Week toggle on same row */}
      <div className="flex-shrink-0" style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
        <div className="flex items-center justify-between" style={{ padding: '8px 16px' }}>
          {/* Left: nav arrows + date */}
          <div className="flex items-center gap-1" style={{ flex: 1, minWidth: 0 }}>
            <button
              type="button"
              onClick={() => scheduleView === 'day' ? navigateDate(-1) : navigateWeek(-1)}
              className="touch-manipulation flex items-center justify-center"
              style={{ width: 28, height: 28, borderRadius: 7, border: 'none', backgroundColor: 'transparent', color: THEME.textSecondary, flexShrink: 0 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 15, fontWeight: 600, color: THEME.textPrimary, margin: 0, whiteSpace: 'nowrap' }}>
                {scheduleView === 'day' ? formatDateHeader(selectedDate) : weekLabel}
              </p>
              <div className="flex items-center gap-2">
                {selectedDate !== today && (
                  <button type="button" onClick={() => setSelectedDate(today)} className="touch-manipulation"
                    style={{ fontSize: 11, color: THEME.primary, border: 'none', backgroundColor: 'transparent', fontWeight: 500, padding: 0 }}>
                    Today
                  </button>
                )}
                {pendingCount > 0 && scheduleView === 'day' && (
                  <span style={{ fontSize: 10, fontWeight: 600, color: '#FF9500' }}>{pendingCount} to review</span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => scheduleView === 'day' ? navigateDate(1) : navigateWeek(1)}
              className="touch-manipulation flex items-center justify-center"
              style={{ width: 28, height: 28, borderRadius: 7, border: 'none', backgroundColor: 'transparent', color: THEME.textSecondary, flexShrink: 0 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </div>

          {/* Right: Day/Week toggle */}
          <div style={{ display: 'inline-flex', backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 8, padding: 2, flexShrink: 0 }}>
            {(['day', 'week'] as const).map((v) => {
              const active = scheduleView === v;
              return (
                <button key={v} type="button" onClick={() => setScheduleView(v)} className="touch-manipulation"
                  style={{
                    padding: '4px 14px', borderRadius: 6, fontSize: 12, fontWeight: active ? 600 : 400,
                    border: 'none', backgroundColor: active ? '#FFFFFF' : 'transparent',
                    color: active ? THEME.textPrimary : '#8E8E93',
                    boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  }}>
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              );
            })}
          </div>
        </div>
        {/* Week view day headers */}
        {scheduleView === 'week' && (
          <div className="flex" style={{ paddingLeft: TIME_COL_WIDTH, borderTop: '1px solid rgba(0,0,0,0.04)' }}>
            {weekDates.map((dateStr) => {
              const d = new Date(dateStr + 'T00:00:00');
              const isToday = dateStr === today;
              const dayName = d.toLocaleDateString('en-US', { weekday: 'narrow' });
              const dayNum = d.getDate();
              return (
                <div key={dateStr} className="flex-1 flex flex-col items-center" style={{ padding: '4px 0 6px' }}
                  onClick={() => { setSelectedDate(dateStr); setScheduleView('day'); }}>
                  <span style={{ fontSize: 10, fontWeight: 500, color: isToday ? THEME.primary : '#8E8E93' }}>{dayName}</span>
                  <span style={{
                    fontSize: 14, fontWeight: 600, lineHeight: '22px',
                    color: isToday ? '#FFFFFF' : THEME.textPrimary,
                    backgroundColor: isToday ? THEME.primary : 'transparent',
                    borderRadius: '50%', width: 24, height: 24, textAlign: 'center',
                  }}>{dayNum}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── DAY VIEW ─── */}
      {scheduleView === 'day' && (
      <div ref={gridRef} className="flex-1 overflow-y-auto" style={{ position: 'relative', overflowX: 'hidden', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
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

              const isDragging = draggingBlockId === item.id;
              const blockTop = isDragging ? dragCurrentTop : top;

              return (
                <React.Fragment key={item.id}>
                  <div
                    onClick={() => {
                      if (draggingBlockId) return;
                      // Past unconfirmed blocks: first tap shows quick Done/Skip, second tap opens detail
                      if (showActions) {
                        setDetailItem(item);
                        setTappedBlockId(null);
                      } else if (isPast && !isConfirmed && !isSkipped && item.type === 'block') {
                        setTappedBlockId(isTapped ? null : item.id);
                      } else {
                        // Events + future blocks + confirmed/skipped: open detail directly
                        setDetailItem(item);
                      }
                    }}
                    onTouchStart={!isEvent ? (e) => handleBlockTouchStart(e, item.id, startM, endM - startM) : undefined}
                    onTouchEnd={!isEvent ? handleBlockTouchEnd : undefined}
                    className="touch-manipulation"
                    style={{
                      position: 'absolute',
                      top: blockTop,
                      left: `${leftPct}%`,
                      width: `calc(${colWidthPct}% - 2px)`,
                      height,
                      padding: isCompact ? '1px 5px' : '4px 6px',
                      overflow: 'hidden',
                      cursor: 'pointer',
                      opacity: isDragging ? 0.85 : isSkipped ? 0.4 : 1,
                      zIndex: isDragging ? 50 : isTapped ? 15 : 5,
                      transition: isDragging ? 'none' : 'top 0.15s ease',
                      ...blockStyle,
                      ...(isDragging ? { boxShadow: '0 4px 16px rgba(0,0,0,0.25)', transform: 'scale(1.03)' } : {}),
                      ...(isTapped && !isDragging ? { boxShadow: '0 2px 8px rgba(0,0,0,0.15)' } : {}),
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
                  {/* Floating review buttons — quick confirm/skip for past pending blocks */}
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
      )}

      {/* ─── WEEK VIEW ─── */}
      {scheduleView === 'week' && (
      <div className="flex-1 overflow-y-auto" style={{ position: 'relative', overscrollBehavior: 'contain' } as React.CSSProperties}>
        <div style={{ display: 'flex', position: 'relative', height: hours.length * HOUR_HEIGHT, minHeight: '100%' }}>
          {/* Time labels column */}
          <div style={{ width: TIME_COL_WIDTH, flexShrink: 0, position: 'relative' }}>
            {hours.map((h) => {
              const top = (h - wakeHour) * HOUR_HEIGHT;
              return (
                <div key={h} style={{ position: 'absolute', top, width: '100%', textAlign: 'right', paddingRight: 4 }}>
                  <span style={{ fontSize: 9, color: '#C7C7CC', fontWeight: 400, lineHeight: '1' }}>
                    {h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Day columns */}
          <div style={{ display: 'flex', flex: 1, position: 'relative' }}>
            {weekDates.map((dateStr) => {
              const isToday = dateStr === today;
              const dayItems = weekAgenda.get(dateStr) ?? [];
              const overlapMap = computeOverlapLayout(dayItems.map((a) => ({ id: a.id, start: a.start, end: a.end })));

              return (
                <div key={dateStr} style={{
                  flex: 1, position: 'relative', minWidth: 0,
                  borderLeft: '1px solid rgba(0,0,0,0.04)',
                  backgroundColor: isToday ? `${THEME.primary}06` : 'transparent',
                }}>
                  {/* Hour grid lines */}
                  {hours.map((h) => (
                    <div key={h} style={{ position: 'absolute', top: (h - wakeHour) * HOUR_HEIGHT, left: 0, right: 0, height: 1, backgroundColor: 'rgba(0,0,0,0.04)' }} />
                  ))}

                  {/* Blocks & events */}
                  {dayItems.map((item) => {
                    const startM = parseTimeToMinutes(item.start);
                    const endM = parseTimeToMinutes(item.end);
                    const top = ((startM - gridStartMins) / 60) * HOUR_HEIGHT;
                    const height = Math.max(((endM - startM) / 60) * HOUR_HEIGHT, 14);
                    const isEvent = item.type === 'event';
                    const layout = overlapMap.get(item.id);
                    const colIdx = layout?.columnIndex ?? 0;
                    const totalCols = layout?.totalColumns ?? 1;
                    const colW = 100 / totalCols;
                    const leftPct = colIdx * colW;

                    return (
                      <div
                        key={item.id}
                        onClick={() => { setSelectedDate(dateStr); setScheduleView('day'); }}
                        className="touch-manipulation"
                        style={{
                          position: 'absolute',
                          top,
                          left: `${leftPct}%`,
                          width: `calc(${colW}% - 1px)`,
                          height,
                          borderRadius: isEvent ? '0 2px 2px 0' : 2,
                          padding: '1px 2px',
                          overflow: 'hidden',
                          cursor: 'pointer',
                          fontSize: 8,
                          fontWeight: 500,
                          lineHeight: 1.2,
                          color: '#FFFFFF',
                          backgroundColor: isEvent ? hexToRgba(item.color, 0.75) : item.color,
                          borderLeft: isEvent ? `2px solid ${item.color}` : 'none',
                          opacity: item.confirmationStatus === 'skipped' ? 0.35 : 1,
                        }}
                      >
                        <span style={{
                          display: '-webkit-box',
                          WebkitLineClamp: Math.max(1, Math.floor(height / 11)),
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          wordBreak: 'break-all',
                        }}>
                          {item.title}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {/* Now line across week */}
            {weekDates.includes(today) && nowMins >= gridStartMins && nowMins <= gridStartMins + gridTotalMins && (
              <div style={{
                position: 'absolute',
                top: ((nowMins - gridStartMins) / 60) * HOUR_HEIGHT,
                left: 0, right: 0, zIndex: 10, pointerEvents: 'none',
                height: 1.5, backgroundColor: '#FF3B30',
              }} />
            )}
          </div>
        </div>
      </div>
      )}

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
  const [micError, setMicError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
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
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px', overscrollBehavior: 'contain' } as React.CSSProperties}>
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
