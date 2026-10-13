/**
 * Event actions shared by the desktop app and the mobile app, so both behave identically:
 * deleting an event (or part of a repeating series) and telling invited guests.
 */
import { toast } from 'sonner';
import { useStore } from '../store/useStore';
import { useHistoryStore } from '../store/useHistoryStore';
import { dismissGcalEventId, dismissGcalEventIds, dismissGcalRecurring } from './googleCalendar';
import { cancelShare, notifyEventUpdate } from './sharing';
import { toIsoInstant } from '../utils/dateTime';
import { getGuestEmails, getInviteTiming, hasInvitedGuests } from '../utils/inviteSeries';
import type { Event } from '../types';

export type DeleteScope = 'this' | 'all' | 'all_after';

/** True when `event` is one occurrence of a repeating series with more than one row (needs a scope prompt). */
export function isRepeatingSeriesRow(event: Event): boolean {
  if (!event.recurrenceSeriesId) return false;
  return useStore.getState().events.filter((e) => e.recurrenceSeriesId === event.recurrenceSeriesId).length > 1;
}

/** Events the app owns and may have invited people to (not Google/shared mirrors). */
export function isOwnedEvent(event: Event): boolean {
  return !event.readOnly && !event.sharedFromShareId && !event.id.startsWith('gcal-evt-');
}

/**
 * Delete an event (or part of its series) and, when `notifyGuests`, tell invited guests:
 * whole event / whole series -> METHOD:CANCEL via cancel_share; a partial series delete ->
 * text note (+ shortened RRULE for "this and following").
 */
export function deleteEventScoped(id: string, scope: DeleteScope, notifyGuests: boolean, senderName?: string, snapshot = true): void {
  const st = useStore.getState();
  const allBefore = st.events;
  const event = allBefore.find((e) => e.id === id);
  if (!event) return;
  if (snapshot) useHistoryStore.getState().saveSnapshot();

  // Determine series grouping key: native recurrence or Google recurring event
  const seriesKey = event.recurrenceSeriesId
    ? { field: 'recurrenceSeriesId' as const, value: event.recurrenceSeriesId }
    : event.recurringGoogleEventId
      ? { field: 'recurringGoogleEventId' as const, value: event.recurringGoogleEventId }
      : null;

  let deletedIds: string[] = [id];
  if (scope === 'this' || !seriesKey) {
    if (event.googleEventId) dismissGcalEventId(id);
    st.deleteEvent(id);
  } else if (scope === 'all') {
    const toDelete = allBefore.filter((e) => (e as unknown as Record<string, unknown>)[seriesKey.field] === seriesKey.value);
    deletedIds = toDelete.map((e) => e.id);
    const gcalIds = toDelete.filter((e) => e.googleEventId).map((e) => e.id);
    if (gcalIds.length) dismissGcalEventIds(gcalIds);
    // Google series: dismiss the whole series so future occurrences (outside the
    // +-90-day window) never re-import. Per-instance dismissal above is kept too.
    if (event.recurringGoogleEventId) dismissGcalRecurring(event.recurringGoogleEventId, '');
    st.deleteEvents(deletedIds);
  } else {
    const toDelete = allBefore.filter((e) => (e as unknown as Record<string, unknown>)[seriesKey.field] === seriesKey.value && e.date >= event.date);
    deletedIds = toDelete.map((e) => e.id);
    const gcalIds = toDelete.filter((e) => e.googleEventId).map((e) => e.id);
    if (gcalIds.length) dismissGcalEventIds(gcalIds);
    // Google series: dismiss occurrences from this date forward so future ones
    // outside the loaded window never re-import.
    if (event.recurringGoogleEventId) dismissGcalRecurring(event.recurringGoogleEventId, event.date);
    st.deleteEvents(deletedIds);
  }

  if (!notifyGuests || !hasInvitedGuests(event)) return;
  const timing = getInviteTiming(event, allBefore);
  const guests = getGuestEmails(event);
  const gone = new Set(deletedIds);
  const remaining = timing.rows.filter((r) => !gone.has(r.id));
  const a = timing.anchor;
  const evInfo = { title: event.title, start: toIsoInstant(a.date, a.start), end: toIsoInstant(a.endDate ?? a.date, a.end) };
  if (!timing.seriesId || remaining.length === 0) {
    // Whole event or whole series is gone: cancel for everyone and revoke the share.
    cancelShare({ eventId: a.id, seriesId: timing.seriesId, event: evInfo, senderName })
      .then(() => toast.success('Guests notified of the cancellation'))
      .catch((err) => { console.warn('[cancel] failed:', err); toast.error(`Couldn't notify guests: ${err?.message || err}`); });
    return;
  }
  // Part of a series: the guests' recurring invite can only be shortened or annotated.
  const last = [...remaining].sort((x, y) => y.date.localeCompare(x.date))[0];
  notifyEventUpdate({
    eventTitle: event.title,
    attendeeEmails: guests,
    changes: scope === 'this' ? `Cancelled: ${event.date}` : `Cancelled from ${event.date} onwards`,
    senderName,
    eventId: a.id,
    seriesId: timing.seriesId,
    event: scope === 'all_after' && timing.rrule
      ? { start: evInfo.start, end: evInfo.end, rrule: timing.rrule, until: toIsoInstant(last.endDate ?? last.date, last.end) }
      : undefined,
  }).catch((err) => { console.warn('[cancel] notify failed:', err); toast.error(`Couldn't notify guests: ${err?.message || err}`); });
}
