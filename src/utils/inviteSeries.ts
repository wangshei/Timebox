/**
 * Helpers for sending event invites / updates / cancellations.
 *
 * A repeating event is stored as materialized rows sharing `recurrenceSeriesId`, but guests
 * must receive ONE recurring invite (UID = series id, RRULE) - not one per row. The share
 * row lives on the series' first ("anchor") row.
 */
import type { Event, RecurrencePattern } from '../types';
import { toIsoInstant } from './dateTime';

const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

/** RecurrencePattern -> iCal RRULE body (no "RRULE:" prefix), or undefined for non-repeating. */
export function patternToRrule(pattern?: RecurrencePattern, days?: number[]): string | undefined {
  switch (pattern) {
    case 'daily': return 'FREQ=DAILY';
    case 'every_other_day': return 'FREQ=DAILY;INTERVAL=2';
    case 'weekly': return 'FREQ=WEEKLY';
    case 'monthly': return 'FREQ=MONTHLY';
    case 'custom': {
      const byday = (days ?? []).filter((d) => d >= 0 && d <= 6).map((d) => BYDAY[d]);
      return byday.length ? `FREQ=WEEKLY;BYDAY=${byday.join(',')}` : undefined;
    }
    default: return undefined;
  }
}

/** Rows of the series `event` belongs to (just [event] when it is not part of one). */
export function getSeriesRows(event: Event, allEvents: Event[]): Event[] {
  if (!event.recurrenceSeriesId) return [event];
  const rows = allEvents.filter(
    (e) => e.recurrenceSeriesId === event.recurrenceSeriesId && !e.sharedFromShareId && !e.id.startsWith('gcal-evt-'),
  );
  return rows.length ? rows : [event];
}

export interface InviteTiming {
  /** Row the share is attached to (earliest of the series, or the event itself). */
  anchor: Event;
  /** Set for repeating events: UID shared by every occurrence. */
  seriesId?: string;
  rrule?: string;
  /** ISO instant of the last occurrence's end. */
  until?: string;
  rows: Event[];
}

/** Everything the edge function needs to describe `event` (or its series) in an .ics. */
export function getInviteTiming(event: Event, allEvents: Event[]): InviteTiming {
  const rows = getSeriesRows(event, allEvents);
  const sorted = [...rows].sort((a, b) => (a.date === b.date ? a.start.localeCompare(b.start) : a.date.localeCompare(b.date)));
  const anchor = sorted[0] ?? event;
  if (!event.recurrenceSeriesId) return { anchor: event, rows };
  const last = sorted[sorted.length - 1] ?? anchor;
  const rrule = patternToRrule(anchor.recurrencePattern ?? event.recurrencePattern, anchor.recurrenceDays ?? event.recurrenceDays);
  return {
    anchor,
    seriesId: event.recurrenceSeriesId,
    rrule,
    until: rrule ? toIsoInstant(last.endDate ?? last.date, last.end) : undefined,
    rows,
  };
}

/** Non-organizer guests (emails) currently on the event. */
export function getGuestEmails(event: Pick<Event, 'attendees'>): string[] {
  return (event.attendees ?? []).filter((a) => !a.self && a.email).map((a) => a.email);
}

/** True when the event is one we own and may have invited people to. */
export function hasInvitedGuests(event: Event): boolean {
  if (event.readOnly || event.sharedFromShareId || event.id.startsWith('gcal-evt-')) return false;
  return getGuestEmails(event).length > 0;
}
