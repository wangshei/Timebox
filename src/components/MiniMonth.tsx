import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { getLocalDateString, getStartOfWeek, getViewDateRange, parseLocalDateString } from '../utils/dateTime';
import { COLOR, RADIUS } from '../styles/tokens';
import { IconButton } from './ds';

interface MiniMonthProps {
  selectedDate: string;
  view: 'day' | '3day' | 'week' | 'month';
  onSelect: (date: string) => void;
  weekStartsOnMonday?: boolean;
  /** 44px touch cells (mobile) */
  touch?: boolean;
  /** Optional: render the month title as a button (mobile collapse toggle) */
  onTitleClick?: () => void;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function MiniMonth({ selectedDate, view, onSelect, weekStartsOnMonday = true, touch, onTitleClick }: MiniMonthProps) {
  const sel = parseLocalDateString(selectedDate);
  const [page, setPage] = useState({ y: sel.getFullYear(), m: sel.getMonth() });
  // Follow the main calendar when its date changes.
  useEffect(() => { setPage({ y: sel.getFullYear(), m: sel.getMonth() }); }, [selectedDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const today = getLocalDateString();
  const range = useMemo(() => {
    if (view === 'month') return new Set([selectedDate]);
    if (view === 'week') {
      const st = getStartOfWeek(sel, weekStartsOnMonday);
      return new Set(Array.from({ length: 7 }, (_, i) => getLocalDateString(new Date(st.getFullYear(), st.getMonth(), st.getDate() + i))));
    }
    return new Set(getViewDateRange(selectedDate, view));
  }, [selectedDate, view, weekStartsOnMonday]); // eslint-disable-line react-hooks/exhaustive-deps
  const cells = useMemo(() => {
    const start = getStartOfWeek(new Date(page.y, page.m, 1), weekStartsOnMonday);
    return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }, [page, weekStartsOnMonday]);
  const labels = weekStartsOnMonday ? ['M', 'T', 'W', 'T', 'F', 'S', 'S'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const cell = touch ? 44 : 28;
  const step = (n: number) => setPage((p) => { const d = new Date(p.y, p.m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const btnSize = touch ? 'touch' : 'md';
  const title = `${MONTHS[page.m]} ${page.y}`;

  return (
    <div data-testid="mini-month" style={{ padding: touch ? '0 8px 8px' : '4px 8px 8px', userSelect: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {onTitleClick ? (
          <button type="button" onClick={onTitleClick} style={{ fontSize: 13, fontWeight: 600, color: COLOR.text, background: 'none', border: 'none', padding: '0 8px', minHeight: 44, cursor: 'pointer' }}>{title}</button>
        ) : (
          <span style={{ fontSize: 12, fontWeight: 600, color: COLOR.text, paddingLeft: 4 }}>{title}</span>
        )}
        <div style={{ display: 'flex' }}>
          <IconButton icon={ChevronLeftIcon} size={btnSize} aria-label="Previous month" onClick={() => step(-1)} />
          <IconButton icon={ChevronRightIcon} size={btnSize} aria-label="Next month" onClick={() => step(1)} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', justifyItems: 'center' }}>
        {labels.map((l, i) => (
          <div key={i} style={{ height: 20, lineHeight: '20px', fontSize: 11, color: COLOR.muted, fontWeight: 500 }}>{l}</div>
        ))}
        {cells.map((d) => {
          const ds = getLocalDateString(d);
          const inMonth = d.getMonth() === page.m;
          const isToday = ds === today;
          const inRange = range.has(ds);
          const dow = d.getDay();
          const rowStart = dow === (weekStartsOnMonday ? 1 : 0);
          const rowEnd = dow === (weekStartsOnMonday ? 0 : 6);
          return (
            <button
              key={ds}
              type="button"
              data-date={ds}
              data-in-range={inRange || undefined}
              onClick={() => onSelect(ds)}
              aria-label={ds}
              aria-current={isToday ? 'date' : undefined}
              style={{
                width: '100%', height: cell, border: 'none', padding: 0, cursor: 'pointer',
                background: inRange && !isToday ? COLOR.accentSoft : 'transparent',
                borderRadius: view === 'week' || view === '3day'
                  ? `${range.has(ds) && (rowStart || !range.has(getLocalDateString(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1)))) ? RADIUS.pill : 0}px ${range.has(ds) && (rowEnd || !range.has(getLocalDateString(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)))) ? RADIUS.pill : 0}px ${range.has(ds) && (rowEnd || !range.has(getLocalDateString(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)))) ? RADIUS.pill : 0}px ${range.has(ds) && (rowStart || !range.has(getLocalDateString(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1)))) ? RADIUS.pill : 0}px`
                  : RADIUS.pill,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit',
              }}
            >
              <span style={{
                width: 26, height: 26, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: isToday ? 600 : 400,
                background: isToday ? COLOR.accent : 'transparent',
                color: isToday ? '#fff' : inMonth ? COLOR.text : COLOR.muted,
                opacity: inMonth || isToday ? 1 : 0.6,
              }}>{d.getDate()}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
