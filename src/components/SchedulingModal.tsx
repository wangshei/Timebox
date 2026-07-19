import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { XMarkIcon, ClipboardDocumentIcon, CheckIcon } from '@heroicons/react/24/solid';
import type { AvailableSlot, SchedulingLink } from '../types';
import { useStore } from '../store/useStore';
import { THEME } from '../constants/colors';
import { getLocalTimeZone, getAppOrigin } from '../utils/dateTime';
import { saveSchedulingLinkToDb } from '../services/booking';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const DURATION_PRESETS = [15, 30, 60];

const ADVANCE_OPTIONS = [
  { value: 1, label: '1 hour' },
  { value: 2, label: '2 hours' },
  { value: 4, label: '4 hours' },
  { value: 12, label: '12 hours' },
  { value: 24, label: '24 hours' },
  { value: 48, label: '48 hours' },
];

function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'meeting';
  const suffix = Math.random().toString(36).substring(2, 8);
  return `${base}-${suffix}`;
}

function formatTime(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const period = h >= 12 ? 'pm' : 'am';
  const hour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour}:${m.toString().padStart(2, '0')}${period}`;
}

interface SchedulingModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedSlots: AvailableSlot[];
  onRemoveSlot: (slot: AvailableSlot) => void;
  editingLinkId?: string | null;
  onEnterSelectionMode?: () => void;
  selectionModeActive?: boolean;
}

export function SchedulingModal({ isOpen, onClose, selectedSlots, onRemoveSlot, editingLinkId, onEnterSelectionMode, selectionModeActive }: SchedulingModalProps) {
  const calendarContainers = useStore((s) => s.calendarContainers);
  const addSchedulingLink = useStore((s) => s.addSchedulingLink);
  const updateSchedulingLink = useStore((s) => s.updateSchedulingLink);
  const schedulingLinks = useStore((s) => s.schedulingLinks);

  const editingLink = editingLinkId ? schedulingLinks.find((l) => l.id === editingLinkId) : null;

  const [name, setName] = useState('');
  const [calendarId, setCalendarId] = useState('');
  const [slotDuration, setSlotDuration] = useState(30);
  const [customDurationMode, setCustomDurationMode] = useState(false);
  const [gap, setGap] = useState(0);
  const [minAdvance, setMinAdvance] = useState(2);
  const [validUntil, setValidUntil] = useState('');
  const [noExpiry, setNoExpiry] = useState(true);
  const [smartAdapt, setSmartAdapt] = useState(true);
  const [saved, setSaved] = useState(false);
  const [savedSlug, setSavedSlug] = useState('');
  const [sameForEachWeek, setSameForEachWeek] = useState(true);

  // Dragging state
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: -1, y: -1 });
  const dragOffset = useRef({ x: 0, y: 0 });
  const isDragging = useRef(false);

  // Initialize position to top-right on open
  useEffect(() => {
    if (isOpen) {
      setPos({ x: window.innerWidth - 380 - 16, y: 60 });
    }
  }, [isOpen]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    const rect = panelRef.current?.getBoundingClientRect();
    if (rect) {
      dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }
    e.preventDefault();
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const newX = Math.max(0, Math.min(window.innerWidth - 360, e.clientX - dragOffset.current.x));
      const newY = Math.max(0, Math.min(window.innerHeight - 100, e.clientY - dragOffset.current.y));
      setPos({ x: newX, y: newY });
    };
    const handleMouseUp = () => {
      isDragging.current = false;
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isOpen]);

  // Initialize from editing link or defaults
  useEffect(() => {
    if (editingLink) {
      setName(editingLink.name);
      setCalendarId(editingLink.calendarContainerId);
      setSlotDuration(editingLink.slotDuration);
      setCustomDurationMode(!DURATION_PRESETS.includes(editingLink.slotDuration));
      setGap(editingLink.gapBetween);
      setMinAdvance(editingLink.minAdvanceHours);
      setValidUntil(editingLink.validUntil);
      setNoExpiry(!editingLink.validUntil);
      setSmartAdapt(editingLink.smartAdapt);
    } else {
      setCalendarId(calendarContainers[0]?.id ?? '');
    }
  }, [editingLink, calendarContainers]);

  // Reset on open — only when isOpen transitions to true
  const prevIsOpen = useRef(false);
  useEffect(() => {
    if (isOpen && !prevIsOpen.current) {
      setSaved(false);
      setSavedSlug('');
      if (!editingLink) {
        setName('');
        setSlotDuration(30);
        setCustomDurationMode(false);
        setGap(0);
        setMinAdvance(2);
        setValidUntil('');
        setNoExpiry(true);
        setSmartAdapt(true);
        setSameForEachWeek(true);
        setCalendarId(calendarContainers[0]?.id ?? '');
      }
    }
    prevIsOpen.current = isOpen;
  }, [isOpen, editingLink, calendarContainers]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  // Build the final slots - if "same for each week" is checked, replicate to all 7 days
  const getFinalSlots = useCallback((): AvailableSlot[] => {
    if (!sameForEachWeek) return selectedSlots;

    // Gather unique time ranges from whatever days are selected
    const timeRanges: { startTime: string; endTime: string }[] = [];
    const seen = new Set<string>();
    for (const slot of selectedSlots) {
      const key = `${slot.startTime}-${slot.endTime}`;
      if (!seen.has(key)) {
        seen.add(key);
        timeRanges.push({ startTime: slot.startTime, endTime: slot.endTime });
      }
    }

    // Expand to all 7 days
    const expanded: AvailableSlot[] = [];
    for (let day = 0; day < 7; day++) {
      for (const range of timeRanges) {
        expanded.push({ dayOfWeek: day, startTime: range.startTime, endTime: range.endTime });
      }
    }
    return expanded;
  }, [selectedSlots, sameForEachWeek]);

  const handleSave = () => {
    const slug = editingLink?.slug ?? generateSlug(name);
    const finalSlots = getFinalSlots();

    const linkData = {
      name: name.trim() || 'Untitled Meeting',
      slug,
      calendarContainerId: calendarId,
      slotDuration,
      gapBetween: gap,
      minAdvanceHours: minAdvance,
      validUntil: noExpiry ? '' : validUntil,
      availableSlots: finalSlots,
      smartAdapt,
      active: true,
      timezone: getLocalTimeZone(),
      creatorEmail: localStorage.getItem('timebox_user_email') ?? undefined,
    };

    // Update the local store immediately for responsive UI, then mirror the
    // link to the DB (source of truth) so public links work for external users.
    let persisted: SchedulingLink;
    if (editingLink) {
      updateSchedulingLink(editingLink.id, linkData);
      persisted = { ...editingLink, ...linkData };
    } else {
      const id = addSchedulingLink(linkData);
      persisted = { ...linkData, id, createdAt: new Date().toISOString() };
    }
    // Fire-and-forget DB write — failure is logged, local state stays usable.
    void saveSchedulingLinkToDb(persisted);

    setSavedSlug(slug);
    setSaved(true);
  };

  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    const url = `${getAppOrigin()}/book/${savedSlug}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Group slots by day
  const slotsByDay = selectedSlots.reduce<Record<number, AvailableSlot[]>>((acc, slot) => {
    const day = slot.dayOfWeek;
    if (!acc[day]) acc[day] = [];
    acc[day].push(slot);
    return acc;
  }, {});

  for (const day of Object.keys(slotsByDay)) {
    slotsByDay[Number(day)].sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  if (!isOpen) return null;

  const linkUrl = `${getAppOrigin()}/book/${savedSlug}`;

  const labelStyle: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.09em',
    textTransform: 'uppercase',
    color: '#8E8E93',
    display: 'block',
    marginTop: 8,
    marginBottom: 4,
  };

  const inputStyle: React.CSSProperties = {
    fontSize: 12,
    color: '#1C1C1E',
    backgroundColor: 'rgba(0,0,0,0.03)',
    border: '1px solid rgba(0,0,0,0.08)',
    fontFamily: 'inherit',
  };

  return createPortal(
    <div
      ref={panelRef}
      className="fixed z-[9999]"
      style={{
        left: pos.x,
        top: pos.y,
        width: 360,
        maxHeight: 'calc(100vh - 80px)',
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        border: '1px solid rgba(0,0,0,0.10)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Draggable header */}
      <div
        onMouseDown={handleMouseDown}
        className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{
          backgroundColor: '#FCFBF7',
          borderBottom: '1px solid rgba(0,0,0,0.08)',
          cursor: 'grab',
          userSelect: 'none',
        }}
      >
        <h2 translate="no" style={{ fontSize: 13, fontWeight: 600, color: '#1C1C1E', margin: 0 }}>
          {saved ? 'Link Created' : editingLink ? 'Edit Scheduling Link' : 'New Scheduling Link'}
        </h2>
        <button
          onClick={onClose}
          className="flex items-center justify-center rounded-full hover:bg-black/5 transition-colors"
          style={{ width: 24, height: 24 }}
        >
          <XMarkIcon className="w-3.5 h-3.5" style={{ color: '#8E8E93' }} />
        </button>
      </div>

      <div className="overflow-y-auto flex-1" style={{ scrollbarWidth: 'thin' }}>
        {saved ? (
          /* --- Success state --- */
          <div className="px-4 py-5 flex flex-col items-center gap-4">
            <div
              className="flex items-center justify-center rounded-full"
              style={{ width: 44, height: 44, backgroundColor: 'rgba(141,162,134,0.15)' }}
            >
              <CheckIcon className="w-6 h-6" style={{ color: THEME.primary }} />
            </div>
            <div className="text-center">
              <p style={{ fontSize: 13, fontWeight: 600, color: '#1C1C1E', margin: 0 }}>
                {editingLink ? 'Link updated!' : 'Your scheduling link is ready!'}
              </p>
              <p style={{ fontSize: 11, color: '#8E8E93', margin: '4px 0 0' }}>
                Share this link so others can book time with you.
              </p>
            </div>
            <div
              className="w-full flex items-center gap-2 rounded-lg px-3 py-2"
              style={{ backgroundColor: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.08)' }}
            >
              <span
                className="flex-1 truncate"
                style={{ fontSize: 11, fontWeight: 500, color: '#1C1C1E', fontFamily: 'monospace' }}
              >
                {linkUrl}
              </span>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 px-2.5 py-1 rounded-md transition-colors shrink-0"
                style={{
                  backgroundColor: copied ? 'rgba(141,162,134,0.15)' : THEME.primary,
                  color: copied ? THEME.primary : '#FFFFFF',
                  fontSize: 10,
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                {copied ? (
                  <><CheckIcon className="w-3 h-3" /> Copied</>
                ) : (
                  <><ClipboardDocumentIcon className="w-3 h-3" /> Copy link</>
                )}
              </button>
            </div>
            <button
              onClick={onClose}
              className="w-full py-2 rounded-lg transition-colors"
              style={{
                backgroundColor: 'rgba(0,0,0,0.05)',
                color: '#1C1C1E',
                fontSize: 12,
                fontWeight: 500,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Done
            </button>
          </div>
        ) : (
          /* --- Form --- */
          <div className="px-4 py-3 flex flex-col gap-3.5">
            {/* Link name */}
            <div>
              <label style={labelStyle}>Link name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., 30-min meeting"
                className="w-full rounded-lg px-2.5 py-1.5 outline-none transition-colors"
                style={inputStyle}
              />
            </div>

            {/* Calendar */}
            <div>
              <label style={labelStyle}>Calendar</label>
              <select
                value={calendarId}
                onChange={(e) => setCalendarId(e.target.value)}
                className="w-full rounded-lg px-2.5 py-1.5 outline-none"
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                {calendarContainers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Slot duration */}
            <div>
              <label style={labelStyle}>Duration (min)</label>
              {!customDurationMode ? (
                <div className="flex gap-1.5">
                  {DURATION_PRESETS.map((d) => (
                    <button
                      key={d}
                      onClick={() => { setCustomDurationMode(false); setSlotDuration(d); }}
                      className="flex-1 py-1.5 rounded-md transition-colors"
                      style={{
                        fontSize: 12,
                        fontWeight: slotDuration === d ? 600 : 400,
                        color: slotDuration === d ? '#FFFFFF' : '#3A3A3C',
                        backgroundColor: slotDuration === d ? THEME.primary : 'rgba(0,0,0,0.04)',
                        border: slotDuration === d ? 'none' : '1px solid rgba(0,0,0,0.08)',
                        cursor: 'pointer',
                      }}
                    >
                      {d}
                    </button>
                  ))}
                  <button
                    onClick={() => { setCustomDurationMode(true); setSlotDuration(45); }}
                    className="flex-1 py-1.5 rounded-md transition-colors"
                    style={{
                      fontSize: 12,
                      fontWeight: 400,
                      color: '#3A3A3C',
                      backgroundColor: 'rgba(0,0,0,0.04)',
                      border: '1px solid rgba(0,0,0,0.08)',
                      cursor: 'pointer',
                    }}
                  >
                    Custom
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={slotDuration}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9]/g, '');
                      if (raw === '') return;
                      const v = parseInt(raw, 10);
                      if (!isNaN(v) && v >= 1) setSlotDuration(v);
                    }}
                    className="outline-none rounded-md"
                    style={{
                      width: 64,
                      padding: '6px 8px',
                      fontSize: 13,
                      fontWeight: 600,
                      color: '#FFFFFF',
                      backgroundColor: THEME.primary,
                      border: 'none',
                      textAlign: 'center',
                    }}
                    autoFocus
                  />
                  <span style={{ fontSize: 12, color: THEME.textSecondary }}>
                    min{slotDuration >= 60 && ` (${Math.floor(slotDuration / 60)}h${slotDuration % 60 > 0 ? ` ${slotDuration % 60}m` : ''})`}
                  </span>
                  <button
                    onClick={() => { setCustomDurationMode(false); setSlotDuration(30); }}
                    style={{
                      fontSize: 10,
                      fontWeight: 500,
                      color: THEME.textSecondary,
                      background: 'none',
                      border: '1px solid rgba(0,0,0,0.10)',
                      borderRadius: 6,
                      padding: '3px 8px',
                      cursor: 'pointer',
                      marginLeft: 'auto',
                    }}
                  >
                    Presets
                  </button>
                </div>
              )}
            </div>

            {/* Gap + Min advance in a row */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label style={labelStyle}>Gap (min)</label>
                <input
                  type="number"
                  value={gap}
                  onChange={(e) => setGap(Math.max(0, parseInt(e.target.value) || 0))}
                  min={0}
                  step={5}
                  className="w-full rounded-lg px-2.5 py-1.5 outline-none"
                  style={inputStyle}
                />
              </div>
              <div className="flex-1">
                <label style={labelStyle}>Min advance</label>
                <select
                  value={minAdvance}
                  onChange={(e) => setMinAdvance(Number(e.target.value))}
                  className="w-full rounded-lg px-2.5 py-1.5 outline-none"
                  style={{ ...inputStyle, cursor: 'pointer' }}
                >
                  {ADVANCE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Valid until */}
            <div>
              <label style={labelStyle}>Valid until</label>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={validUntil}
                  onChange={(e) => { setValidUntil(e.target.value); setNoExpiry(false); }}
                  disabled={noExpiry}
                  className="flex-1 rounded-lg px-2.5 py-1.5 outline-none"
                  style={{
                    ...inputStyle,
                    color: noExpiry ? '#AEAEB2' : '#1C1C1E',
                    opacity: noExpiry ? 0.5 : 1,
                  }}
                />
                <label className="flex items-center gap-1 cursor-pointer select-none" style={{ fontSize: 11, color: '#3A3A3C', whiteSpace: 'nowrap' }}>
                  <input
                    type="checkbox"
                    checked={noExpiry}
                    onChange={(e) => { setNoExpiry(e.target.checked); if (e.target.checked) setValidUntil(''); }}
                    className="accent-[#8DA286]"
                  />
                  No expiry
                </label>
              </div>
            </div>

            {/* Smart adapt */}
            <div
              className="flex items-center justify-between rounded-lg px-2.5 py-2"
              style={{ backgroundColor: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.08)', marginTop: 4 }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: '#1C1C1E' }}>Smart adapt</div>
                <div style={{ fontSize: 10, color: '#8E8E93', marginTop: 1 }}>
                  Auto-adjust when calendar changes
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={smartAdapt}
                onClick={() => setSmartAdapt(!smartAdapt)}
                className="relative inline-flex shrink-0 cursor-pointer rounded-full border-0 transition-colors"
                style={{
                  width: 36,
                  height: 20,
                  minWidth: 36,
                  backgroundColor: smartAdapt ? THEME.primary : 'rgba(0,0,0,0.2)',
                }}
              >
                <span
                  className="pointer-events-none inline-block rounded-full bg-white shadow transition-transform"
                  style={{
                    width: 16,
                    height: 16,
                    marginLeft: 2,
                    marginTop: 2,
                    transform: smartAdapt ? 'translateX(16px)' : 'translateX(0)',
                  }}
                />
              </button>
            </div>

            {/* Select times on calendar button */}
            {onEnterSelectionMode && (
              <div style={{ marginTop: 4 }}>
                <button
                  onClick={onEnterSelectionMode}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg transition-colors"
                  style={{
                    backgroundColor: selectionModeActive ? 'rgba(141,162,134,0.15)' : THEME.primary,
                    color: selectionModeActive ? THEME.primary : '#FFFFFF',
                    fontSize: 12,
                    fontWeight: 600,
                    border: selectionModeActive ? `1.5px solid ${THEME.primary}` : 'none',
                    cursor: 'pointer',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  {selectionModeActive ? 'Selecting on calendar...' : 'Select times on calendar'}
                </button>
                {selectionModeActive && (
                  <p style={{ fontSize: 10, color: THEME.primary, marginTop: 4, textAlign: 'center' }}>
                    Drag on the calendar to paint available time slots.
                  </p>
                )}
              </div>
            )}

            {/* Same for each week checkbox */}
            <label
              className="flex items-center gap-2 cursor-pointer select-none rounded-lg px-2.5 py-2"
              style={{ backgroundColor: 'rgba(0,0,0,0.02)', border: '1px solid rgba(0,0,0,0.06)', marginTop: 4 }}
            >
              <input
                type="checkbox"
                checked={sameForEachWeek}
                onChange={(e) => setSameForEachWeek(e.target.checked)}
                className="accent-[#8DA286]"
              />
              <div>
                <div style={{ fontSize: 11, fontWeight: 500, color: '#1C1C1E' }}>Same for each week</div>
                <div style={{ fontSize: 10, color: '#8E8E93', marginTop: 1 }}>
                  Copy selected time slots to all days of the week
                </div>
              </div>
            </label>

            {/* Selected slots summary */}
            <div style={{ marginTop: 4 }}>
              <label style={labelStyle}>
                Available times ({selectedSlots.length} slot{selectedSlots.length !== 1 ? 's' : ''})
              </label>
              {selectedSlots.length === 0 ? (
                <div
                  className="rounded-lg px-3 py-3 text-center"
                  style={{ backgroundColor: 'rgba(0,0,0,0.02)', border: '1px dashed rgba(0,0,0,0.1)', fontSize: 11, color: '#AEAEB2' }}
                >
                  Click &quot;Select times on calendar&quot; to add slots
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {[0, 1, 2, 3, 4, 5, 6].filter((d) => slotsByDay[d]?.length).map((dayNum) => (
                    <div key={dayNum}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: '#3A3A3C', marginBottom: 2 }}>
                        {DAY_NAMES[dayNum]}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {slotsByDay[dayNum].map((slot, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-1 px-1.5 py-0.5 rounded group"
                            style={{
                              backgroundColor: 'rgba(141,162,134,0.12)',
                              border: '1px solid rgba(141,162,134,0.25)',
                              fontSize: 10,
                              color: '#1C1C1E',
                            }}
                          >
                            <span>{formatTime(slot.startTime)} - {formatTime(slot.endTime)}</span>
                            <button
                              onClick={() => onRemoveSlot(slot)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity ml-0.5"
                              style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}
                            >
                              <XMarkIcon className="w-2.5 h-2.5" style={{ color: '#8E8E93' }} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1 pb-2">
              <button
                onClick={onClose}
                className="flex-1 py-2 rounded-lg transition-colors"
                style={{
                  backgroundColor: 'rgba(0,0,0,0.05)',
                  color: '#1C1C1E',
                  fontSize: 12,
                  fontWeight: 500,
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={selectedSlots.length === 0}
                className="flex-1 py-2 rounded-lg transition-colors"
                style={{
                  backgroundColor: selectedSlots.length > 0 ? THEME.primary : 'rgba(0,0,0,0.06)',
                  color: selectedSlots.length > 0 ? '#FFFFFF' : '#AEAEB2',
                  fontSize: 12,
                  fontWeight: 600,
                  border: 'none',
                  cursor: selectedSlots.length > 0 ? 'pointer' : 'not-allowed',
                }}
              >
                {editingLink ? 'Update' : 'Save'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
