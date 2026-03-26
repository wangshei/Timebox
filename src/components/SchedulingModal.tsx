import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { XMarkIcon, ClipboardDocumentIcon, CheckIcon } from '@heroicons/react/24/solid';
import type { AvailableSlot, CalendarContainer, SchedulingLink } from '../types';
import { useStore } from '../store/useStore';
import { THEME } from '../constants/colors';
import { getLocalTimeZone } from '../utils/dateTime';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const DURATION_OPTIONS = [15, 30, 45, 60];

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
  /** Called when user clicks "Select times on calendar" — enters selection mode */
  onEnterSelectionMode?: () => void;
  /** Whether the calendar is currently in selection mode */
  selectionModeActive?: boolean;
}

export function SchedulingModal({ isOpen, onClose, selectedSlots, onRemoveSlot, editingLinkId, onEnterSelectionMode, selectionModeActive }: SchedulingModalProps) {
  const calendarContainers = useStore((s) => s.calendarContainers);
  const categories = useStore((s) => s.categories);
  const addSchedulingLink = useStore((s) => s.addSchedulingLink);
  const updateSchedulingLink = useStore((s) => s.updateSchedulingLink);
  const schedulingLinks = useStore((s) => s.schedulingLinks);

  const editingLink = editingLinkId ? schedulingLinks.find((l) => l.id === editingLinkId) : null;

  const [name, setName] = useState('');
  const [calendarId, setCalendarId] = useState('');
  const [slotDuration, setSlotDuration] = useState(30);
  const [gap, setGap] = useState(0);
  const [minAdvance, setMinAdvance] = useState(2);
  const [validUntil, setValidUntil] = useState('');
  const [noExpiry, setNoExpiry] = useState(true);
  const [smartAdapt, setSmartAdapt] = useState(true);
  const [saved, setSaved] = useState(false);
  const [savedSlug, setSavedSlug] = useState('');

  const panelRef = useRef<HTMLDivElement>(null);

  // Initialize from editing link or defaults
  useEffect(() => {
    if (editingLink) {
      setName(editingLink.name);
      setCalendarId(editingLink.calendarContainerId);
      setSlotDuration(editingLink.slotDuration);
      setGap(editingLink.gapBetween);
      setMinAdvance(editingLink.minAdvanceHours);
      setValidUntil(editingLink.validUntil);
      setNoExpiry(!editingLink.validUntil);
      setSmartAdapt(editingLink.smartAdapt);
    } else {
      setCalendarId(calendarContainers[0]?.id ?? '');
    }
  }, [editingLink, calendarContainers]);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setSaved(false);
      setSavedSlug('');
      if (!editingLink) {
        setName('');
        setSlotDuration(30);
        setGap(0);
        setMinAdvance(2);
        setValidUntil('');
        setNoExpiry(true);
        setSmartAdapt(true);
        setCalendarId(calendarContainers[0]?.id ?? '');
      }
    }
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

  const handleSave = () => {
    const slug = editingLink?.slug ?? generateSlug(name);

    const linkData = {
      name: name.trim() || 'Untitled Meeting',
      slug,
      calendarContainerId: calendarId,
      slotDuration,
      gapBetween: gap,
      minAdvanceHours: minAdvance,
      validUntil: noExpiry ? '' : validUntil,
      availableSlots: selectedSlots,
      smartAdapt,
      active: true,
      timezone: getLocalTimeZone(),
    };

    if (editingLink) {
      updateSchedulingLink(editingLink.id, linkData);
    } else {
      addSchedulingLink(linkData);
    }

    setSavedSlug(slug);
    setSaved(true);
  };

  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    const url = `${window.location.origin}/book/${savedSlug}`;
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

  // Sort each day's slots by start time
  for (const day of Object.keys(slotsByDay)) {
    slotsByDay[Number(day)].sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  if (!isOpen) return null;

  const linkUrl = `${window.location.origin}/book/${savedSlug}`;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex justify-end"
      style={{ pointerEvents: selectionModeActive ? 'none' : 'auto' }}
      onClick={(e) => { if (e.target === e.currentTarget && !selectionModeActive) onClose(); }}
    >
      {/* Backdrop — hidden during selection mode so calendar is interactive */}
      {!selectionModeActive && (
        <div className="absolute inset-0" style={{ backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' }} onClick={onClose} />
      )}

      {/* Panel — narrower during selection mode */}
      <div
        ref={panelRef}
        className="relative h-full overflow-y-auto"
        style={{
          width: selectionModeActive ? 320 : 'min(420px, 90vw)',
          maxWidth: '100vw',
          boxSizing: 'border-box',
          backgroundColor: '#FCFBF7',
          borderLeft: '1px solid rgba(0,0,0,0.08)',
          boxShadow: '-4px 0 24px rgba(0,0,0,0.08)',
          pointerEvents: 'auto',
          transition: 'width 0.2s ease',
        }}
      >
        {/* Header */}
        <div
          className="sticky top-0 z-10 flex items-center justify-between px-6 py-4"
          style={{ backgroundColor: '#FCFBF7', borderBottom: '1px solid rgba(0,0,0,0.08)' }}
        >
          <h2 translate="no" style={{ fontSize: 15, fontWeight: 600, color: '#1C1C1E', margin: 0 }}>
            {saved ? 'Link Created' : editingLink ? 'Edit Scheduling Link' : 'New Scheduling Link'}
          </h2>
          <button
            onClick={onClose}
            className="flex items-center justify-center rounded-full hover:bg-black/5 transition-colors"
            style={{ width: 28, height: 28 }}
          >
            <XMarkIcon className="w-4 h-4" style={{ color: '#8E8E93' }} />
          </button>
        </div>

        {saved ? (
          /* ─── Success state ─── */
          <div className="px-6 py-8 flex flex-col items-center gap-5">
            <div
              className="flex items-center justify-center rounded-full"
              style={{ width: 56, height: 56, backgroundColor: 'rgba(141,162,134,0.15)' }}
            >
              <CheckIcon className="w-7 h-7" style={{ color: THEME.primary }} />
            </div>
            <div className="text-center">
              <p style={{ fontSize: 15, fontWeight: 600, color: '#1C1C1E', margin: 0 }}>
                {editingLink ? 'Link updated!' : 'Your scheduling link is ready!'}
              </p>
              <p style={{ fontSize: 12, color: '#8E8E93', margin: '6px 0 0' }}>
                Share this link so others can book time with you.
              </p>
            </div>
            <div
              className="w-full flex items-center gap-2 rounded-lg px-3 py-2.5"
              style={{ backgroundColor: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.08)' }}
            >
              <span
                className="flex-1 truncate"
                style={{ fontSize: 12, fontWeight: 500, color: '#1C1C1E', fontFamily: 'monospace' }}
              >
                {linkUrl}
              </span>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 px-3 py-1.5 rounded-md transition-colors"
                style={{
                  backgroundColor: copied ? 'rgba(141,162,134,0.15)' : THEME.primary,
                  color: copied ? THEME.primary : '#FFFFFF',
                  fontSize: 11,
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                {copied ? (
                  <>
                    <CheckIcon className="w-3.5 h-3.5" />
                    Copied
                  </>
                ) : (
                  <>
                    <ClipboardDocumentIcon className="w-3.5 h-3.5" />
                    Copy link
                  </>
                )}
              </button>
            </div>
            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-lg transition-colors"
              style={{
                backgroundColor: 'rgba(0,0,0,0.05)',
                color: '#1C1C1E',
                fontSize: 13,
                fontWeight: 500,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Done
            </button>
          </div>
        ) : (
          /* ─── Form ─── */
          <div className="px-6 py-5 flex flex-col gap-4">
            {/* Link name */}
            <div>
              <label style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.09em', textTransform: 'uppercase', color: '#8E8E93', display: 'block', marginBottom: 6 }}>
                Link name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., 30-min meeting"
                className="w-full rounded-lg px-3 py-2 outline-none transition-colors"
                style={{
                  fontSize: 13,
                  color: '#1C1C1E',
                  backgroundColor: 'rgba(0,0,0,0.03)',
                  border: '1px solid rgba(0,0,0,0.08)',
                  fontFamily: 'inherit',
                }}
              />
            </div>

            {/* Calendar */}
            <div>
              <label style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.09em', textTransform: 'uppercase', color: '#8E8E93', display: 'block', marginBottom: 6 }}>
                Calendar
              </label>
              <select
                value={calendarId}
                onChange={(e) => setCalendarId(e.target.value)}
                className="w-full rounded-lg px-3 py-2 outline-none"
                style={{
                  fontSize: 13,
                  color: '#1C1C1E',
                  backgroundColor: 'rgba(0,0,0,0.03)',
                  border: '1px solid rgba(0,0,0,0.08)',
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                }}
              >
                {calendarContainers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Slot duration */}
            <div>
              <label style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.09em', textTransform: 'uppercase', color: '#8E8E93', display: 'block', marginBottom: 6 }}>
                Slot duration (min)
              </label>
              <div className="flex flex-wrap gap-1.5">
                {DURATION_OPTIONS.map((d) => (
                  <button
                    key={d}
                    onClick={() => setSlotDuration(d)}
                    className="flex-1 py-2 rounded-lg transition-colors"
                    style={{
                      fontSize: 13,
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
              </div>
            </div>

            {/* Gap between bookings */}
            <div>
              <label style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.09em', textTransform: 'uppercase', color: '#8E8E93', display: 'block', marginBottom: 6 }}>
                Gap between bookings (min)
              </label>
              <input
                type="number"
                value={gap}
                onChange={(e) => setGap(Math.max(0, parseInt(e.target.value) || 0))}
                min={0}
                step={5}
                className="w-full rounded-lg px-3 py-2 outline-none"
                style={{
                  fontSize: 13,
                  color: '#1C1C1E',
                  backgroundColor: 'rgba(0,0,0,0.03)',
                  border: '1px solid rgba(0,0,0,0.08)',
                  fontFamily: 'inherit',
                }}
              />
            </div>

            {/* Minimum advance */}
            <div>
              <label style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.09em', textTransform: 'uppercase', color: '#8E8E93', display: 'block', marginBottom: 6 }}>
                Minimum advance
              </label>
              <select
                value={minAdvance}
                onChange={(e) => setMinAdvance(Number(e.target.value))}
                className="w-full rounded-lg px-3 py-2 outline-none"
                style={{
                  fontSize: 13,
                  color: '#1C1C1E',
                  backgroundColor: 'rgba(0,0,0,0.03)',
                  border: '1px solid rgba(0,0,0,0.08)',
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                }}
              >
                {ADVANCE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Valid until */}
            <div>
              <label style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.09em', textTransform: 'uppercase', color: '#8E8E93', display: 'block', marginBottom: 6 }}>
                Valid until
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="date"
                  value={validUntil}
                  onChange={(e) => { setValidUntil(e.target.value); setNoExpiry(false); }}
                  disabled={noExpiry}
                  className="flex-1 rounded-lg px-3 py-2 outline-none"
                  style={{
                    fontSize: 13,
                    color: noExpiry ? '#AEAEB2' : '#1C1C1E',
                    backgroundColor: 'rgba(0,0,0,0.03)',
                    border: '1px solid rgba(0,0,0,0.08)',
                    fontFamily: 'inherit',
                    opacity: noExpiry ? 0.5 : 1,
                  }}
                />
                <label className="flex items-center gap-1.5 cursor-pointer select-none" style={{ fontSize: 12, color: '#3A3A3C', whiteSpace: 'nowrap' }}>
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
              className="flex items-center justify-between rounded-lg px-3 py-3"
              style={{ backgroundColor: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.08)' }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: '#1C1C1E' }}>Smart adapt</div>
                <div style={{ fontSize: 10, color: '#8E8E93', marginTop: 2 }}>
                  Auto-adjust when your calendar changes
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={smartAdapt}
                onClick={() => setSmartAdapt(!smartAdapt)}
                className="relative inline-flex shrink-0 cursor-pointer rounded-full border-0 transition-colors"
                style={{
                  width: 44,
                  height: 24,
                  minWidth: 44,
                  backgroundColor: smartAdapt ? THEME.primary : 'rgba(0,0,0,0.2)',
                }}
              >
                <span
                  className="pointer-events-none inline-block rounded-full bg-white shadow transition-transform"
                  style={{
                    width: 20,
                    height: 20,
                    marginLeft: 2,
                    marginTop: 2,
                    transform: smartAdapt ? 'translateX(20px)' : 'translateX(0)',
                  }}
                />
              </button>
            </div>

            {/* Select times on calendar button */}
            {onEnterSelectionMode && (
              <div>
                <button
                  onClick={onEnterSelectionMode}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-lg transition-colors"
                  style={{
                    backgroundColor: selectionModeActive ? 'rgba(141,162,134,0.15)' : THEME.primary,
                    color: selectionModeActive ? THEME.primary : '#FFFFFF',
                    fontSize: 13,
                    fontWeight: 600,
                    border: selectionModeActive ? `1.5px solid ${THEME.primary}` : 'none',
                    cursor: 'pointer',
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  {selectionModeActive ? 'Selecting on calendar...' : 'Select times on calendar'}
                </button>
                {selectionModeActive && (
                  <p style={{ fontSize: 11, color: THEME.primary, marginTop: 6, textAlign: 'center' }}>
                    Drag on the calendar to paint available time slots, then return here to save.
                  </p>
                )}
              </div>
            )}

            {/* Selected slots summary */}
            <div>
              <label style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.09em', textTransform: 'uppercase', color: '#8E8E93', display: 'block', marginBottom: 6 }}>
                Available times ({selectedSlots.length} slot{selectedSlots.length !== 1 ? 's' : ''})
              </label>
              {selectedSlots.length === 0 ? (
                <div
                  className="rounded-lg px-3 py-4 text-center"
                  style={{ backgroundColor: 'rgba(0,0,0,0.02)', border: '1px dashed rgba(0,0,0,0.1)', fontSize: 12, color: '#AEAEB2' }}
                >
                  Click &quot;Select times on calendar&quot; to add available slots
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {[0, 1, 2, 3, 4, 5, 6].filter((d) => slotsByDay[d]?.length).map((dayNum) => (
                    <div key={dayNum}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#3A3A3C', marginBottom: 3 }}>
                        {DAY_NAMES[dayNum]}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {slotsByDay[dayNum].map((slot, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-1 px-2 py-1 rounded-md group"
                            style={{
                              backgroundColor: 'rgba(141,162,134,0.12)',
                              border: '1px solid rgba(141,162,134,0.25)',
                              fontSize: 11,
                              color: '#1C1C1E',
                            }}
                          >
                            <span>{formatTime(slot.startTime)} - {formatTime(slot.endTime)}</span>
                            <button
                              onClick={() => onRemoveSlot(slot)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity ml-0.5"
                              style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}
                            >
                              <XMarkIcon className="w-3 h-3" style={{ color: '#8E8E93' }} />
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
            <div className="flex gap-3 pt-2 pb-4">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-lg transition-colors"
                style={{
                  backgroundColor: 'rgba(0,0,0,0.05)',
                  color: '#1C1C1E',
                  fontSize: 13,
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
                className="flex-1 py-2.5 rounded-lg transition-colors"
                style={{
                  backgroundColor: selectedSlots.length > 0 ? THEME.primary : 'rgba(0,0,0,0.06)',
                  color: selectedSlots.length > 0 ? '#FFFFFF' : '#AEAEB2',
                  fontSize: 13,
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
