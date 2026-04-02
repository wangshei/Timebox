import { ResolvedEvent } from './dataResolver';
import { convertEventTimezone } from './dateTime';

export interface EventSegment {
  event: ResolvedEvent;
  /** Display start time for this segment (may differ from event.start on continuation days) */
  displayStart: string;
  /** Display end time for this segment (may differ from event.end on start day) */
  displayEnd: string;
  /** The date this segment appears on */
  date: string;
  /** True if this segment contains the event's actual start */
  isStartSegment: boolean;
  /** True if this segment contains the event's actual end */
  isEndSegment: boolean;
}

/**
 * Given a list of resolved events, return segments visible on a specific target date.
 * - Single-day events (no endDate or endDate === date) return as-is.
 * - Cross-date events are split: start day ends at 23:59, end day starts at 00:00,
 *   middle days span 00:00-23:59.
 */
export function getEventSegmentsForDate(
  events: ResolvedEvent[],
  targetDate: string,
  viewTimezone?: string,
): EventSegment[] {
  const segments: EventSegment[] = [];

  for (const rawEvent of events) {
    // Apply timezone conversion: if the event has a timezone and it differs from the user's,
    // adjust start/end/date/endDate for display. Floating events (no timezone) are unchanged.
    let event = rawEvent;
    if (rawEvent.timezone) {
      const converted = convertEventTimezone(
        rawEvent.date,
        rawEvent.endDate,
        rawEvent.start,
        rawEvent.end,
        rawEvent.timezone,
        viewTimezone,
      );
      event = {
        ...rawEvent,
        start: converted.start,
        end: converted.end,
        date: converted.date,
        endDate: converted.endDate ?? converted.date,
      };
    }

    const startDate = event.date;
    const endDate = event.endDate ?? event.date;

    // Skip if target date is outside the event's range
    if (targetDate < startDate || targetDate > endDate) continue;

    const isSingleDay = startDate === endDate;

    if (isSingleDay) {
      segments.push({
        event,
        displayStart: event.start,
        displayEnd: event.end,
        date: targetDate,
        isStartSegment: true,
        isEndSegment: true,
      });
    } else if (targetDate === startDate) {
      // Start day: event.start -> 23:59
      segments.push({
        event,
        displayStart: event.start,
        displayEnd: '23:59',
        date: targetDate,
        isStartSegment: true,
        isEndSegment: false,
      });
    } else if (targetDate === endDate) {
      // End day: 00:00 -> event.end
      segments.push({
        event,
        displayStart: '00:00',
        displayEnd: event.end,
        date: targetDate,
        isStartSegment: false,
        isEndSegment: true,
      });
    } else {
      // Middle day: 00:00 -> 23:59
      segments.push({
        event,
        displayStart: '00:00',
        displayEnd: '23:59',
        date: targetDate,
        isStartSegment: false,
        isEndSegment: false,
      });
    }
  }

  return segments;
}
