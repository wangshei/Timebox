/**
 * Booking service.
 *
 * Two responsibilities:
 *   1. Public (anon) calls to the share-invite edge function — used by the
 *      public BookingPage. These use a raw fetch (no auth) because the booker
 *      is typically not signed in, mirroring respondToInvite in sharing.ts.
 *   2. Owner-side persistence of scheduling_links + bookings via the authed
 *      supabase client. scheduling_links is owner-writable (RLS owner-only);
 *      bookings are read-only for the owner (bookers write via the edge fn).
 */

import { supabase } from '../supabaseClient';
import type { SchedulingLink, Booking, AvailableSlot } from '../types';

// ─── Public (anon) edge-function calls ──────────────────────────

/** Link details returned by the public get_booking_link action. */
export interface PublicBookingLink {
  name: string;
  slotDuration: number;
  gapBetween: number;
  minAdvanceHours: number;
  validUntil: string;
  availableSlots: AvailableSlot[];
  timezone: string;
  calendarContainerId: string;
  ownerName: string;
  /** Confirmed bookings, minimal shape for availability. */
  bookedSlots: Array<{ date: string; startTime: string }>;
}

function edgeUrl(): string {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!supabaseUrl) throw new Error('Supabase not configured');
  return `${supabaseUrl}/functions/v1/share-invite`;
}

async function callPublicEdge<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch(edgeUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (await res.json()) as T;
}

/** Fetch a public booking link by slug. Returns `{ error }` for not_found/expired. */
export async function getBookingLink(
  slug: string,
): Promise<PublicBookingLink | { error: string }> {
  return callPublicEdge<PublicBookingLink | { error: string }>({
    action: 'get_booking_link',
    slug,
  });
}

/** Create a booking against a public link. Returns `{ ok, bookingId }` or `{ error }`. */
export async function createBooking(payload: {
  slug: string;
  date: string;
  startTime: string;
  endTime: string;
  bookerName: string;
  bookerEmail: string;
  notes?: string;
}): Promise<{ ok: true; bookingId: string } | { error: string }> {
  return callPublicEdge<{ ok: true; bookingId: string } | { error: string }>({
    action: 'create_booking',
    ...payload,
  });
}

// ─── Owner-side DB persistence (authed supabase client) ─────────

/** Map a SchedulingLink (camelCase) to a scheduling_links row (snake_case). */
function linkToRow(link: SchedulingLink, ownerId: string): Record<string, unknown> {
  return {
    id: link.id,
    owner_id: ownerId,
    name: link.name,
    slug: link.slug,
    calendar_container_id: link.calendarContainerId,
    category_id: link.categoryId ?? null,
    slot_duration: link.slotDuration,
    gap_between: link.gapBetween,
    min_advance_hours: link.minAdvanceHours,
    valid_until: link.validUntil ?? '',
    available_slots: link.availableSlots,
    smart_adapt: link.smartAdapt,
    active: link.active,
    timezone: link.timezone,
    creator_email: link.creatorEmail ?? null,
    created_at: link.createdAt,
  };
}

/** Map a scheduling_links row to a SchedulingLink. */
function linkFromRow(row: Record<string, unknown>): SchedulingLink {
  return {
    id: row.id as string,
    name: row.name as string,
    slug: row.slug as string,
    calendarContainerId: row.calendar_container_id as string,
    categoryId: (row.category_id as string) ?? undefined,
    slotDuration: row.slot_duration as number,
    gapBetween: row.gap_between as number,
    minAdvanceHours: row.min_advance_hours as number,
    validUntil: (row.valid_until as string) ?? '',
    availableSlots: (row.available_slots as AvailableSlot[]) ?? [],
    smartAdapt: (row.smart_adapt as boolean) ?? false,
    active: (row.active as boolean) ?? true,
    timezone: row.timezone as string,
    creatorEmail: (row.creator_email as string) ?? undefined,
    createdAt: row.created_at as string,
  };
}

/** Map a bookings row to a Booking. */
function bookingFromRow(row: Record<string, unknown>): Booking {
  return {
    id: row.id as string,
    schedulingLinkId: row.scheduling_link_id as string,
    bookerName: row.booker_name as string,
    bookerEmail: row.booker_email as string,
    date: row.date as string,
    startTime: row.start_time as string,
    endTime: row.end_time as string,
    status: (row.status as 'confirmed' | 'cancelled') ?? 'confirmed',
    notes: (row.notes as string) ?? undefined,
    createdAt: row.created_at as string,
  };
}

async function currentUserId(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data?.user?.id ?? null;
}

/** Upsert a scheduling link to the DB (owner-authed). Best-effort — logs on error. */
export async function saveSchedulingLinkToDb(link: SchedulingLink): Promise<void> {
  if (!supabase) return;
  const userId = await currentUserId();
  if (!userId) return;
  const { error } = await supabase
    .from('scheduling_links')
    .upsert(linkToRow(link, userId), { onConflict: 'id' });
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[booking] saveSchedulingLinkToDb failed:', error.message);
  }
}

/** Delete a scheduling link from the DB (owner-authed). Best-effort. */
export async function deleteSchedulingLinkFromDb(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('scheduling_links').delete().eq('id', id);
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[booking] deleteSchedulingLinkFromDb failed:', error.message);
  }
}

/**
 * Load the owner's scheduling links and their bookings from the DB.
 * Returns null on error / no auth so callers can leave existing state intact.
 */
export async function loadSchedulingLinksAndBookings(): Promise<
  { schedulingLinks: SchedulingLink[]; bookings: Booking[] } | null
> {
  if (!supabase) return null;
  const userId = await currentUserId();
  if (!userId) return null;

  const { data: linkRows, error: linkErr } = await supabase
    .from('scheduling_links')
    .select('*')
    .eq('owner_id', userId);
  if (linkErr) {
    // eslint-disable-next-line no-console
    console.error('[booking] load scheduling_links failed:', linkErr.message);
    return null;
  }

  const schedulingLinks = (linkRows ?? []).map(linkFromRow);
  const linkIds = schedulingLinks.map((l) => l.id);

  let bookings: Booking[] = [];
  if (linkIds.length > 0) {
    const { data: bookingRows, error: bookErr } = await supabase
      .from('bookings')
      .select('*')
      .in('scheduling_link_id', linkIds);
    if (bookErr) {
      // eslint-disable-next-line no-console
      console.error('[booking] load bookings failed:', bookErr.message);
    } else {
      bookings = (bookingRows ?? []).map(bookingFromRow);
    }
  }

  return { schedulingLinks, bookings };
}
