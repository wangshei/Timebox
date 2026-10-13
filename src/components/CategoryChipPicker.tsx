import React from 'react';
import { COLOR, RADIUS, FONT_SIZE } from '../styles/tokens';
import { Popover } from './ds/Popover';
import { useStore } from '../store/useStore';

interface CategoryChipPickerProps {
  /** Currently chosen category id (undefined = nothing / mixed). */
  value?: string;
  onChange: (categoryId: string) => void;
  /** Chip text when no category is chosen. */
  placeholder?: string;
  /** Open the list above the chip (for bars near the bottom of the screen). */
  placement?: 'down' | 'up';
}

/** Compact "calendar · category" chip that opens a calendars → categories list (color dots). */
export function CategoryChipPicker({ value, onChange, placeholder = 'Category', placement = 'down' }: CategoryChipPickerProps) {
  const calendars = useStore((st) => st.calendarContainers).filter((c) => !c.id.startsWith('gcal-'));
  const categories = useStore((st) => st.categories);
  const selectable = categories.filter((c) => c.calendarContainerId && calendars.some((k) => k.id === c.calendarContainerId));
  const [open, setOpen] = React.useState(false);
  const curCat = selectable.find((c) => c.id === value);
  const curCal = calendars.find((k) => k.id === curCat?.calendarContainerId);
  if (!selectable.length) return null;

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        data-cal-chip
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5, maxWidth: '100%', border: `1px solid ${COLOR.border}`, borderRadius: 999,
          background: 'transparent', padding: '1px 8px 1px 6px', cursor: 'pointer', fontSize: FONT_SIZE['2xs'], color: COLOR.text,
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: curCal?.color ?? COLOR.muted, flexShrink: 0 }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{curCat && curCal ? `${curCal.name} · ${curCat.name}` : placeholder}</span>
      </button>
      {open && (
        <Popover
          data-cal-popover
          style={{
            position: 'absolute', left: 0, ...(placement === 'up' ? { bottom: '100%', marginBottom: 4 } : { top: '100%', marginTop: 4 }),
            width: 200, maxHeight: 240, overflowY: 'auto', padding: 4,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {calendars.map((cal) => {
            const cats = selectable.filter((c) => c.calendarContainerId === cal.id);
            if (!cats.length) return null;
            return (
              <div key={cal.id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 6px', fontSize: FONT_SIZE['2xs'], color: COLOR.muted, fontWeight: 600 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: cal.color }} />{cal.name}
                </div>
                {cats.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onChange(c.id); setOpen(false); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer', borderRadius: RADIUS.sm,
                      padding: '4px 6px 4px 14px', fontSize: FONT_SIZE.sm, color: COLOR.text,
                      background: c.id === value ? COLOR.accentSoft : 'transparent',
                    }}
                  ><span style={{ width: 8, height: 8, borderRadius: '50%', background: c.color, flexShrink: 0 }} />{c.name}</button>
                ))}
              </div>
            );
          })}
        </Popover>
      )}
    </div>
  );
}
