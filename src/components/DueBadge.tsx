import React from 'react';
import type { Task } from '../types';
import { useStore } from '../store/useStore';

interface DueBadgeProps {
  tasks: Task[];
  /** Compact mode uses smaller badge (for week view) */
  compact?: boolean;
}

export const DueBadge: React.FC<DueBadgeProps> = ({ tasks, compact }) => {
  const [open, setOpen] = React.useState(false);
  const badgeRef = React.useRef<HTMLButtonElement>(null);
  const popupRef = React.useRef<HTMLDivElement>(null);
  const calendars = useStore((s) => s.calendarContainers);

  // Close on outside click
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: PointerEvent) => {
      if (
        popupRef.current && !popupRef.current.contains(e.target as Node) &&
        badgeRef.current && !badgeRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', handler, true);
    return () => document.removeEventListener('pointerdown', handler, true);
  }, [open]);

  if (tasks.length === 0) return null;

  const calMap = new Map(calendars.map((c) => [c.id, c]));

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={badgeRef}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 3,
          padding: compact ? '1px 5px' : '2px 7px',
          borderRadius: 9999,
          border: '1px solid rgba(0,0,0,0.08)',
          backgroundColor: open ? 'rgba(141,162,134,0.12)' : 'rgba(0,0,0,0.03)',
          color: '#8E8E93',
          fontSize: compact ? 8 : 10,
          fontWeight: 500,
          cursor: 'pointer',
          lineHeight: 1.3,
          whiteSpace: 'nowrap',
          transition: 'background-color 150ms',
        }}
        onMouseEnter={(e) => { if (!open) (e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.06)'); }}
        onMouseLeave={(e) => { if (!open) (e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.03)'); }}
        title={tasks.map((t) => t.title).join(', ')}
      >
        <span style={{ fontSize: compact ? 7 : 9 }}>📋</span>
        {tasks.length}
      </button>

      {open && (
        <div
          ref={popupRef}
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 4,
            zIndex: 300,
            minWidth: 180,
            maxWidth: 260,
            backgroundColor: '#fff',
            borderRadius: 8,
            border: '1px solid rgba(0,0,0,0.1)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06)',
            padding: '6px 0',
            overflow: 'hidden',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ padding: '4px 10px 6px', fontSize: 9, fontWeight: 600, color: '#AEAEB2', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
            Due tasks
          </div>
          {tasks.map((t) => {
            const cal = calMap.get(t.calendarContainerId);
            return (
              <div
                key={t.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  padding: '5px 10px',
                  fontSize: 12,
                  color: '#3A3A3C',
                  cursor: 'default',
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: cal?.color ?? '#8DA286',
                    flexShrink: 0,
                  }}
                />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.title}
                </span>
                {t.estimatedMinutes > 0 && (
                  <span style={{ marginLeft: 'auto', fontSize: 10, color: '#AEAEB2', flexShrink: 0 }}>
                    {t.estimatedMinutes >= 60
                      ? `${Math.floor(t.estimatedMinutes / 60)}h${t.estimatedMinutes % 60 ? ` ${t.estimatedMinutes % 60}m` : ''}`
                      : `${t.estimatedMinutes}m`}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
