import React, { useState, useEffect, useMemo } from 'react';
import { CheckCircleIcon } from '@heroicons/react/24/solid';
import type { SchedulingLink, Booking } from '../types';

const LS_LINKS_KEY = 'timebox_scheduling_links_public';
const LS_BOOKINGS_KEY = 'timebox_bookings_public';

function generateId(): string {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

/** Parse "HH:MM" to minutes from midnight. */
function parseTime(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

/** Format minutes to "HH:MM". */
function fmtTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

/** Format minutes to a readable time like "9:00 AM". */
function fmtTimeReadable(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

/** Get the day of week (0 = Sun, 6 = Sat) from a date string. */
function getDayOfWeek(dateStr: string): number {
  const [y, mo, d] = dateStr.split('-').map(Number);
  return new Date(y, mo - 1, d).getDay();
}

/** Format a date string to readable form. */
function fmtDate(dateStr: string): string {
  const [y, mo, d] = dateStr.split('-').map(Number);
  return new Date(y, mo - 1, d).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function fmtDateShort(dateStr: string): { weekday: string; day: number; month: string } {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, mo - 1, d);
  return {
    weekday: dt.toLocaleDateString('en-US', { weekday: 'short' }),
    day: d,
    month: dt.toLocaleDateString('en-US', { month: 'short' }),
  };
}

interface BookingPageProps {
  slug: string;
}

type Step = 'loading' | 'date' | 'time' | 'form' | 'confirmed' | 'error';

export function BookingPage({ slug }: BookingPageProps) {
  const [link, setLink] = useState<SchedulingLink | null>(null);
  const [existingBookings, setExistingBookings] = useState<Booking[]>([]);
  const [step, setStep] = useState<Step>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<{ start: number; end: number } | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmedBooking, setConfirmedBooking] = useState<Booking | null>(null);

  // Load scheduling link from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_LINKS_KEY);
      const links: SchedulingLink[] = raw ? JSON.parse(raw) : [];
      const found = links.find((l) => l.slug === slug && l.active);
      if (!found) {
        // Also try main store localStorage
        const storeRaw = localStorage.getItem('timebox_state');
        if (storeRaw) {
          const storeState = JSON.parse(storeRaw);
          const storeLink = (storeState.schedulingLinks || []).find(
            (l: SchedulingLink) => l.slug === slug && l.active
          );
          if (storeLink) {
            setLink(storeLink);
            // Load bookings from main store too
            setExistingBookings((storeState.bookings || []).filter(
              (b: Booking) => b.schedulingLinkId === storeLink.id && b.status === 'confirmed'
            ));
            setStep('date');
            return;
          }
        }
        setErrorMsg('This scheduling link is not available or has been deactivated.');
        setStep('error');
        return;
      }
      setLink(found);

      // Load existing bookings
      const bookingsRaw = localStorage.getItem(LS_BOOKINGS_KEY);
      const allBookings: Booking[] = bookingsRaw ? JSON.parse(bookingsRaw) : [];
      setExistingBookings(allBookings.filter((b) => b.schedulingLinkId === found.id && b.status === 'confirmed'));
      setStep('date');
    } catch {
      setErrorMsg('Failed to load scheduling information.');
      setStep('error');
    }
  }, [slug]);

  // Generate next 14 days
  const next14Days = useMemo(() => {
    const days: string[] = [];
    const now = new Date();
    for (let i = 0; i < 14; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() + i);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      days.push(`${yyyy}-${mm}-${dd}`);
    }
    return days;
  }, []);

  // Determine which dates have available slots
  const availableDates = useMemo(() => {
    if (!link) return new Set<string>();
    const now = new Date();
    const minAdvanceMs = link.minAdvanceHours * 60 * 60 * 1000;
    const earliestTime = new Date(now.getTime() + minAdvanceMs);

    const available = new Set<string>();
    for (const dateStr of next14Days) {
      // Check validUntil
      if (link.validUntil && dateStr > link.validUntil) continue;

      const dow = getDayOfWeek(dateStr);
      const slotsForDay = link.availableSlots.filter(
        (s) => s.dayOfWeek === dow || (s.dayOfWeek === -1 && s.date === dateStr)
      );
      if (slotsForDay.length === 0) continue;

      // Check if at least one time chunk is available (after minAdvanceHours)
      for (const slot of slotsForDay) {
        const startMins = parseTime(slot.startTime);
        const endMins = parseTime(slot.endTime);
        const chunks = getTimeChunks(startMins, endMins, link.slotDuration, link.gapBetween);
        for (const chunk of chunks) {
          // Check if past minAdvanceHours
          const [y, mo, d] = dateStr.split('-').map(Number);
          const chunkDate = new Date(y, mo - 1, d, Math.floor(chunk.start / 60), chunk.start % 60);
          if (chunkDate <= earliestTime) continue;
          // Check not already booked
          const isBooked = existingBookings.some(
            (b) => b.date === dateStr && parseTime(b.startTime) === chunk.start && parseTime(b.endTime) === chunk.end
          );
          if (!isBooked) {
            available.add(dateStr);
            break;
          }
        }
      }
    }
    return available;
  }, [link, next14Days, existingBookings]);

  // Get time slots for selected date
  const timeSlots = useMemo(() => {
    if (!link || !selectedDate) return [];
    const now = new Date();
    const minAdvanceMs = link.minAdvanceHours * 60 * 60 * 1000;
    const earliestTime = new Date(now.getTime() + minAdvanceMs);
    const dow = getDayOfWeek(selectedDate);

    const slotsForDay = link.availableSlots.filter(
      (s) => s.dayOfWeek === dow || (s.dayOfWeek === -1 && s.date === selectedDate)
    );

    const allChunks: { start: number; end: number }[] = [];
    for (const slot of slotsForDay) {
      const startMins = parseTime(slot.startTime);
      const endMins = parseTime(slot.endTime);
      const chunks = getTimeChunks(startMins, endMins, link.slotDuration, link.gapBetween);
      for (const chunk of chunks) {
        const [y, mo, d] = selectedDate.split('-').map(Number);
        const chunkDate = new Date(y, mo - 1, d, Math.floor(chunk.start / 60), chunk.start % 60);
        if (chunkDate <= earliestTime) continue;
        const isBooked = existingBookings.some(
          (b) => b.date === selectedDate && parseTime(b.startTime) === chunk.start && parseTime(b.endTime) === chunk.end
        );
        if (!isBooked) {
          allChunks.push(chunk);
        }
      }
    }
    return allChunks.sort((a, b) => a.start - b.start);
  }, [link, selectedDate, existingBookings]);

  const handleBook = async () => {
    if (!link || !selectedDate || !selectedSlot || !name.trim() || !email.trim()) return;
    setSubmitting(true);
    try {
      const booking: Booking = {
        id: generateId(),
        schedulingLinkId: link.id,
        bookerName: name.trim(),
        bookerEmail: email.trim(),
        date: selectedDate,
        startTime: fmtTime(selectedSlot.start),
        endTime: fmtTime(selectedSlot.end),
        status: 'confirmed',
        notes: notes.trim() || undefined,
        createdAt: new Date().toISOString(),
      };

      // Save to public localStorage
      const raw = localStorage.getItem(LS_BOOKINGS_KEY);
      const existing: Booking[] = raw ? JSON.parse(raw) : [];
      existing.push(booking);
      localStorage.setItem(LS_BOOKINGS_KEY, JSON.stringify(existing));

      // Also try saving to main store localStorage
      try {
        const storeRaw = localStorage.getItem('timebox_state');
        if (storeRaw) {
          const storeState = JSON.parse(storeRaw);
          storeState.bookings = [...(storeState.bookings || []), booking];
          localStorage.setItem('timebox_state', JSON.stringify(storeState));
        }
      } catch {
        // ignore
      }

      setConfirmedBooking(booking);
      setStep('confirmed');
    } catch {
      setErrorMsg('Failed to create booking. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#F8F7F4',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 480,
          backgroundColor: '#FFFFFF',
          borderRadius: 16,
          border: '1px solid rgba(0,0,0,0.08)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '24px 28px 16px',
            borderBottom: '1px solid rgba(0,0,0,0.06)',
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.09em', textTransform: 'uppercase', color: '#8E8E93', marginBottom: 4 }}>
            Book a time
          </div>
          {link && (
            <div style={{ fontSize: 18, fontWeight: 600, color: '#1C1C1E' }}>
              {link.name}
            </div>
          )}
          {link && (
            <div style={{ fontSize: 13, color: '#8E8E93', marginTop: 4 }}>
              {link.slotDuration} min &middot; {link.timezone}
            </div>
          )}
        </div>

        {/* Body */}
        <div style={{ padding: '20px 28px 28px' }}>
          {step === 'loading' && (
            <div style={{ textAlign: 'center', padding: '32px 0', color: '#8E8E93', fontSize: 14 }}>
              Loading...
            </div>
          )}

          {step === 'error' && (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div style={{ fontSize: 14, color: '#FF3B30', marginBottom: 8 }}>{errorMsg}</div>
              <button
                type="button"
                onClick={() => window.history.back()}
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: '#8DA286',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Go back
              </button>
            </div>
          )}

          {step === 'date' && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#3A3A3C', marginBottom: 12 }}>
                Select a date
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  overflowX: 'auto',
                  paddingBottom: 8,
                  scrollbarWidth: 'thin',
                }}
              >
                {next14Days.map((dateStr) => {
                  const info = fmtDateShort(dateStr);
                  const isAvailable = availableDates.has(dateStr);
                  const isSelected = selectedDate === dateStr;
                  return (
                    <button
                      key={dateStr}
                      type="button"
                      disabled={!isAvailable}
                      onClick={() => {
                        setSelectedDate(dateStr);
                        setSelectedSlot(null);
                        setStep('time');
                      }}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        padding: '10px 12px',
                        borderRadius: 10,
                        border: isSelected ? '2px solid #8DA286' : '1px solid rgba(0,0,0,0.08)',
                        backgroundColor: isSelected ? 'rgba(141,162,134,0.08)' : isAvailable ? '#FFFFFF' : '#F5F5F5',
                        cursor: isAvailable ? 'pointer' : 'default',
                        opacity: isAvailable ? 1 : 0.4,
                        minWidth: 58,
                        flexShrink: 0,
                      }}
                    >
                      <span style={{ fontSize: 10, fontWeight: 500, color: '#8E8E93', textTransform: 'uppercase' }}>
                        {info.weekday}
                      </span>
                      <span style={{ fontSize: 18, fontWeight: 600, color: isAvailable ? '#1C1C1E' : '#AEAEB2', marginTop: 2 }}>
                        {info.day}
                      </span>
                      <span style={{ fontSize: 10, color: '#8E8E93' }}>
                        {info.month}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 'time' && selectedDate && (
            <div>
              <button
                type="button"
                onClick={() => { setSelectedDate(null); setSelectedSlot(null); setStep('date'); }}
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: '#8DA286',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  marginBottom: 12,
                  padding: 0,
                }}
              >
                &larr; Back to dates
              </button>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#3A3A3C', marginBottom: 4 }}>
                {fmtDate(selectedDate)}
              </div>
              <div style={{ fontSize: 12, color: '#8E8E93', marginBottom: 16 }}>
                Select a time
              </div>
              {timeSlots.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 0', color: '#AEAEB2', fontSize: 13 }}>
                  No available slots for this date.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                  {timeSlots.map((slot) => {
                    const isSelected = selectedSlot?.start === slot.start && selectedSlot?.end === slot.end;
                    return (
                      <button
                        key={`${slot.start}-${slot.end}`}
                        type="button"
                        onClick={() => {
                          setSelectedSlot(slot);
                          setStep('form');
                        }}
                        style={{
                          padding: '10px 12px',
                          borderRadius: 8,
                          border: isSelected ? '2px solid #8DA286' : '1px solid rgba(0,0,0,0.08)',
                          backgroundColor: isSelected ? 'rgba(141,162,134,0.08)' : '#FFFFFF',
                          cursor: 'pointer',
                          fontSize: 13,
                          fontWeight: 500,
                          color: '#1C1C1E',
                          textAlign: 'center',
                        }}
                      >
                        {fmtTimeReadable(slot.start)} &ndash; {fmtTimeReadable(slot.end)}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {step === 'form' && selectedDate && selectedSlot && (
            <div>
              <button
                type="button"
                onClick={() => { setSelectedSlot(null); setStep('time'); }}
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: '#8DA286',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  marginBottom: 12,
                  padding: 0,
                }}
              >
                &larr; Back to times
              </button>

              {/* Selected slot summary */}
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: 10,
                  backgroundColor: 'rgba(141,162,134,0.06)',
                  border: '1px solid rgba(141,162,134,0.15)',
                  marginBottom: 20,
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1C1C1E' }}>
                  {fmtDate(selectedDate)}
                </div>
                <div style={{ fontSize: 12, color: '#8E8E93', marginTop: 2 }}>
                  {fmtTimeReadable(selectedSlot.start)} &ndash; {fmtTimeReadable(selectedSlot.end)}
                </div>
              </div>

              {/* Form */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#3A3A3C', marginBottom: 4 }}>
                    Name *
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      fontSize: 13,
                      borderRadius: 8,
                      border: '1px solid rgba(0,0,0,0.12)',
                      outline: 'none',
                      color: '#1C1C1E',
                      backgroundColor: '#FFFFFF',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#3A3A3C', marginBottom: 4 }}>
                    Email *
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      fontSize: 13,
                      borderRadius: 8,
                      border: '1px solid rgba(0,0,0,0.12)',
                      outline: 'none',
                      color: '#1C1C1E',
                      backgroundColor: '#FFFFFF',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#3A3A3C', marginBottom: 4 }}>
                    Notes
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Anything you'd like to share (optional)"
                    rows={3}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      fontSize: 13,
                      borderRadius: 8,
                      border: '1px solid rgba(0,0,0,0.12)',
                      outline: 'none',
                      color: '#1C1C1E',
                      backgroundColor: '#FFFFFF',
                      resize: 'vertical',
                      boxSizing: 'border-box',
                      fontFamily: 'inherit',
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleBook}
                  disabled={!name.trim() || !email.trim() || submitting}
                  style={{
                    width: '100%',
                    padding: '10px 16px',
                    fontSize: 14,
                    fontWeight: 600,
                    borderRadius: 10,
                    border: 'none',
                    backgroundColor: (name.trim() && email.trim() && !submitting) ? '#8DA286' : 'rgba(0,0,0,0.08)',
                    color: (name.trim() && email.trim() && !submitting) ? '#FFFFFF' : '#AEAEB2',
                    cursor: (name.trim() && email.trim() && !submitting) ? 'pointer' : 'default',
                    marginTop: 4,
                  }}
                >
                  {submitting ? 'Booking...' : 'Book'}
                </button>
              </div>
            </div>
          )}

          {step === 'confirmed' && confirmedBooking && (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <CheckCircleIcon style={{ width: 48, height: 48, color: '#8DA286', margin: '0 auto 16px' }} />
              <div style={{ fontSize: 18, fontWeight: 600, color: '#1C1C1E', marginBottom: 4 }}>
                Booking confirmed
              </div>
              <div style={{ fontSize: 13, color: '#8E8E93', marginBottom: 20 }}>
                You're all set. A confirmation will be sent to {confirmedBooking.bookerEmail}.
              </div>
              <div
                style={{
                  padding: '14px 16px',
                  borderRadius: 10,
                  backgroundColor: 'rgba(141,162,134,0.06)',
                  border: '1px solid rgba(141,162,134,0.15)',
                  textAlign: 'left',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1C1C1E' }}>
                  {link?.name}
                </div>
                <div style={{ fontSize: 12, color: '#3A3A3C', marginTop: 4 }}>
                  {fmtDate(confirmedBooking.date)}
                </div>
                <div style={{ fontSize: 12, color: '#8E8E93', marginTop: 2 }}>
                  {fmtTimeReadable(parseTime(confirmedBooking.startTime))} &ndash; {fmtTimeReadable(parseTime(confirmedBooking.endTime))}
                </div>
                {confirmedBooking.notes && (
                  <div style={{ fontSize: 12, color: '#8E8E93', marginTop: 6, fontStyle: 'italic' }}>
                    "{confirmedBooking.notes}"
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Split a time window into slot-duration chunks with gaps between them. */
function getTimeChunks(
  startMins: number,
  endMins: number,
  slotDuration: number,
  gapBetween: number,
): { start: number; end: number }[] {
  const chunks: { start: number; end: number }[] = [];
  let cursor = startMins;
  while (cursor + slotDuration <= endMins) {
    chunks.push({ start: cursor, end: cursor + slotDuration });
    cursor += slotDuration + gapBetween;
  }
  return chunks;
}
