import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { CheckCircleIcon } from '@heroicons/react/24/solid';
import { getBookingLink, createBooking, type PublicBookingLink } from '../services/booking';

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

/** Confirmed booking summary shown on the success screen. */
interface ConfirmedSummary {
  bookerEmail: string;
  date: string;
  startTime: string;
  endTime: string;
  notes?: string;
}

export function BookingPage({ slug }: BookingPageProps) {
  const [link, setLink] = useState<PublicBookingLink | null>(null);
  const [bookedSlots, setBookedSlots] = useState<Array<{ date: string; startTime: string }>>([]);
  const [step, setStep] = useState<Step>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<{ start: number; end: number } | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [confirmedBooking, setConfirmedBooking] = useState<ConfirmedSummary | null>(null);

  // Load scheduling link from the server (get_booking_link edge action).
  const loadLink = useCallback(async () => {
    try {
      const result = await getBookingLink(slug);
      if ('error' in result) {
        setErrorMsg(
          result.error === 'expired'
            ? 'This scheduling link has expired.'
            : 'This scheduling link is not available or has been deactivated.'
        );
        setStep('error');
        return;
      }
      setLink(result);
      setBookedSlots(result.bookedSlots ?? []);
      setStep('date');
    } catch {
      setErrorMsg('Failed to load scheduling information. Please try again.');
      setStep('error');
    }
  }, [slug]);

  useEffect(() => {
    void loadLink();
  }, [loadLink]);

  // Refresh only the booked slots (used after a slot_taken conflict).
  const refreshAvailability = useCallback(async () => {
    try {
      const result = await getBookingLink(slug);
      if (!('error' in result)) setBookedSlots(result.bookedSlots ?? []);
    } catch {
      // Non-fatal: keep existing availability.
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
          const isBooked = bookedSlots.some(
            (b) => b.date === dateStr && parseTime(b.startTime) === chunk.start
          );
          if (!isBooked) {
            available.add(dateStr);
            break;
          }
        }
      }
    }
    return available;
  }, [link, next14Days, bookedSlots]);

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
        const isBooked = bookedSlots.some(
          (b) => b.date === selectedDate && parseTime(b.startTime) === chunk.start
        );
        if (!isBooked) {
          allChunks.push(chunk);
        }
      }
    }
    return allChunks.sort((a, b) => a.start - b.start);
  }, [link, selectedDate, bookedSlots]);

  const handleBook = async () => {
    if (!link || !selectedDate || !selectedSlot || !name.trim() || !email.trim()) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const startTime = fmtTime(selectedSlot.start);
      const endTime = fmtTime(selectedSlot.end);
      const result = await createBooking({
        slug,
        date: selectedDate,
        startTime,
        endTime,
        bookerName: name.trim(),
        bookerEmail: email.trim(),
        notes: notes.trim() || undefined,
      });

      if ('error' in result) {
        if (result.error === 'slot_taken') {
          // Someone booked this slot first — refresh availability and bounce back.
          await refreshAvailability();
          setSelectedSlot(null);
          setSubmitError('That time was just booked — pick another.');
          setStep('time');
        } else {
          setSubmitError('Failed to create booking. Please try again.');
        }
        return;
      }

      setConfirmedBooking({
        bookerEmail: email.trim(),
        date: selectedDate,
        startTime,
        endTime,
        notes: notes.trim() || undefined,
      });
      // Reflect the new booking locally so availability stays accurate.
      setBookedSlots((prev) => [...prev, { date: selectedDate, startTime }]);
      setStep('confirmed');
    } catch {
      setSubmitError('Failed to create booking. Please try again.');
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

          {(step === 'date' || step === 'time') && (
            <div>
              {submitError && (
                <div style={{ fontSize: 13, color: '#FF3B30', marginBottom: 12, textAlign: 'center' }}>
                  {submitError}
                </div>
              )}
              <div style={{ fontSize: 13, fontWeight: 600, color: '#3A3A3C', marginBottom: 4 }}>
                Select a day
              </div>
              {link && (
                <div style={{ fontSize: 11, color: '#AEAEB2', marginBottom: 12 }}>
                  Times shown in {link.timezone}
                </div>
              )}
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
                        if (step === 'date') setStep('time');
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

              {/* Time slots appear below date picker */}
              {selectedDate && timeSlots.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#3A3A3C', marginBottom: 4 }}>
                    {fmtDate(selectedDate)}
                  </div>
                  <div style={{ fontSize: 12, color: '#8E8E93', marginBottom: 12 }}>
                    Select a time
                  </div>
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
                </div>
              )}
              {selectedDate && timeSlots.length === 0 && (
                <div style={{ textAlign: 'center', padding: '24px 0', color: '#AEAEB2', fontSize: 13 }}>
                  No available slots for this date.
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
                &larr; Back to date &amp; time
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
                {submitError && (
                  <div style={{ fontSize: 12, color: '#FF3B30', marginTop: 2 }}>
                    {submitError}
                  </div>
                )}
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
