/**
 * Natural-language quick-add parser (pure, no deps).
 *   "lunch 12-1 tomorrow"      -> { title: 'lunch', date: <tomorrow>, start: '12:00', end: '13:00' }
 *   "gym 7am fri 1h"           -> { title: 'gym', date: <next fri>, start: '07:00', end: '08:00' }
 *   "call mom at 3pm"          -> { title: 'call mom', start: '15:00' }
 *   "dentist oct 20 2:30-3:30" -> { title: 'dentist', date: <oct 20>, start: '14:30', end: '15:30' }
 * Anything not recognised stays in the title. A bare "read chapter 3" is never read as a time.
 */

export interface QuickParse {
  title: string;
  /** YYYY-MM-DD when a date phrase was found */
  date?: string;
  /** HH:MM (24h) when a time was found */
  start?: string;
  /** HH:MM (24h) from an explicit range or start + duration */
  end?: string;
  /** Explicit duration ("1h", "30min") */
  durationMins?: number;
  hasDate: boolean;
  hasTime: boolean;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const pad = (n: number) => String(n).padStart(2, '0');
export const toDateStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hhmm = (mins: number) => `${pad(Math.floor(mins / 60) % 24)}:${pad(mins % 60)}`;

/** Hour with no am/pm: 7-11 read as morning, 12 and 1-6 as afternoon (calendar convention). */
function guessHour(h: number): number {
  if (h === 0 || h >= 13) return h;
  if (h === 12) return 12;
  return h <= 6 ? h + 12 : h;
}

function withMeridiem(h: number, mer: string | undefined): number {
  if (!mer) return guessHour(h);
  const pm = mer.toLowerCase().startsWith('p');
  if (h === 12) return pm ? 12 : 0;
  return pm ? h + 12 : h;
}

export function parseQuickAdd(input: string, now: Date = new Date()): QuickParse {
  let s = ` ${input} `;
  const take = (re: RegExp): RegExpMatchArray | null => {
    const m = s.match(re);
    if (!m) return null;
    s = s.slice(0, m.index!) + ' ' + s.slice(m.index! + m[0].length);
    return m;
  };

  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let date: Date | undefined;

  // ── Date ──
  let m: RegExpMatchArray | null;
  if ((m = take(/\s(?:on\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?![\d:])(?=\s|,|$)/i))) {
    const mon = MONTHS.indexOf(m[1].toLowerCase().slice(0, 3));
    let d = new Date(base.getFullYear(), mon, parseInt(m[2], 10));
    if (d < base) d = new Date(base.getFullYear() + 1, mon, parseInt(m[2], 10));
    date = d;
  } else if ((m = take(/\s(?:on\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?(?=\s|,|$)/i))) {
    const mon = MONTHS.indexOf(m[2].toLowerCase().slice(0, 3));
    let d = new Date(base.getFullYear(), mon, parseInt(m[1], 10));
    if (d < base) d = new Date(base.getFullYear() + 1, mon, parseInt(m[1], 10));
    date = d;
  } else if ((m = take(/\s(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?=\s|,|$)/))) {
    const mon = parseInt(m[1], 10) - 1, day = parseInt(m[2], 10);
    if (mon >= 0 && mon < 12 && day >= 1 && day <= 31) {
      let d = new Date(m[3] ? (m[3].length === 2 ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10)) : base.getFullYear(), mon, day);
      if (!m[3] && d < base) d = new Date(base.getFullYear() + 1, mon, day);
      date = d;
    } else {
      s = s.replace(' ', ' ' + m[0].trim() + ' ');
    }
  } else if (take(/\s(?:today|tonight)(?=\s|,|$)/i)) {
    date = base;
  } else if (take(/\s(?:tomorrow|tmrw|tmr)(?=\s|,|$)/i)) {
    date = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1);
  } else if ((m = take(/\s(?:(next|this)\s+)?(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)[a-z]*(?=\s|,|$)/i))) {
    const target = DAYS.indexOf(m[2].toLowerCase().slice(0, 3));
    let diff = (target - base.getDay() + 7) % 7;
    if (diff === 0) diff = 7;
    if (m[1]?.toLowerCase() === 'next' && target > base.getDay()) diff += 7;
    date = new Date(base.getFullYear(), base.getMonth(), base.getDate() + diff);
  }

  // ── Time ──
  let start: number | undefined;
  let end: number | undefined;

  const rangeRe = /\s(?:(?:at|from)\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?\s*(?:-|–|—|to|until)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?(?=\s|,|$)/i;
  const rm = s.match(rangeRe);
  if (rm) {
    const [, h1s, m1s, mer1, h2s, m2s, mer2] = rm;
    const explicit = !!(m1s || m2s || mer1 || mer2);
    const h1 = parseInt(h1s, 10), h2 = parseInt(h2s, 10);
    // Bare "12-1" only counts as a time range when a date word is also present (avoids "chapters 1-2").
    if (h1 <= 24 && h2 <= 24 && (explicit || date) && (!m1s || parseInt(m1s, 10) < 60) && (!m2s || parseInt(m2s, 10) < 60)) {
      take(rangeRe);
      let sh = withMeridiem(h1, mer1 ?? mer2 ?? undefined);
      // "11-1pm": the unmarked start inherits pm, then falls back to am if it would pass the end.
      let eh = withMeridiem(h2, mer2 ?? undefined);
      if (!mer1 && mer2 && sh > eh) sh -= 12;
      start = sh * 60 + parseInt(m1s ?? '0', 10);
      end = eh * 60 + parseInt(m2s ?? '0', 10);
      if (end <= start) end += 12 * 60;
      if (end <= start) end = undefined;
    }
  }
  if (start === undefined) {
    if ((m = take(/\s(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)(?=\s|,|$)/i))) {
      start = withMeridiem(parseInt(m[1], 10), m[3]) * 60 + parseInt(m[2] ?? '0', 10);
    } else if ((m = take(/\s(?:at\s+)?(\d{1,2}):(\d{2})(?=\s|,|$)/i))) {
      start = guessHour(parseInt(m[1], 10)) * 60 + parseInt(m[2], 10);
    } else if ((m = take(/\sat\s+(\d{1,2})(?=\s|,|$)/i))) {
      start = guessHour(parseInt(m[1], 10)) * 60;
    } else if (take(/\s(?:at\s+)?noon(?=\s|,|$)/i)) {
      start = 12 * 60;
    }
  }
  if (start !== undefined && (start < 0 || start >= 24 * 60)) start = undefined;

  // ── Duration ──
  let durationMins: number | undefined;
  if ((m = take(/\s(?:for\s+)?(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes)(?=\s|,|$)/i))) {
    const v = parseFloat(m[1]);
    const mins = /^h/i.test(m[2]) ? Math.round(v * 60) : Math.round(v);
    if (mins > 0 && mins <= 24 * 60) durationMins = mins;
  }
  if (start !== undefined && end === undefined && durationMins) end = start + durationMins;
  if (end !== undefined && start !== undefined) durationMins = end - start;
  if (end !== undefined && end >= 24 * 60) end = 24 * 60 - 1;

  const title = s
    .replace(/\s+/g, ' ')
    .replace(/(^|\s)(?:at|on|from|for|by)\s*$/i, '')
    .replace(/^\s*(?:at|on)\s+/i, '')
    .replace(/[,\s]+$/g, '')
    .trim();

  return {
    title,
    date: date ? toDateStr(date) : undefined,
    start: start !== undefined ? hhmm(start) : undefined,
    end: end !== undefined ? hhmm(end) : undefined,
    durationMins,
    hasDate: !!date,
    hasTime: start !== undefined,
  };
}

const fmt12 = (t: string) => {
  const [h, mm] = t.split(':').map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${mm ? `:${pad(mm)}` : ''} ${h < 12 ? 'AM' : 'PM'}`;
};

/** Short label for the live preview chip, e.g. "Tomorrow · 12 PM – 1 PM". */
export function describeQuickParse(p: QuickParse, now: Date = new Date()): string {
  const parts: string[] = [];
  if (p.date) {
    const today = toDateStr(now);
    const tmr = toDateStr(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
    if (p.date === today) parts.push('Today');
    else if (p.date === tmr) parts.push('Tomorrow');
    else parts.push(new Date(p.date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }));
  }
  if (p.start) parts.push(p.end ? `${fmt12(p.start)} – ${fmt12(p.end)}` : fmt12(p.start));
  return parts.join(' · ');
}
