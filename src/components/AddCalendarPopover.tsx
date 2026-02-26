import React, { useState, useRef, useEffect } from 'react';
import type { CalendarContainer } from '../types';
import { ColorPicker } from './ColorPicker';
import { DEFAULT_PALETTE_COLOR } from '../constants/colors';

interface AddCalendarPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  onAdd: (c: Omit<CalendarContainer, 'id'>) => void;
}

export function AddCalendarPopover({ isOpen, onClose, anchorRef, onAdd }: AddCalendarPopoverProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(DEFAULT_PALETTE_COLOR);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        anchorRef.current && !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose, anchorRef]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd({ name: name.trim(), color: color || DEFAULT_PALETTE_COLOR });
    setName('');
    setColor(DEFAULT_PALETTE_COLOR);
    onClose();
  };

  return (
    <div
      ref={popoverRef}
      className="absolute left-0 top-full z-50 mt-1 w-64 rounded-xl p-3"
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid rgba(0,0,0,0.09)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.10)',
        marginLeft: 0,
      }}
    >
      <p className="text-[10px] font-semibold uppercase tracking-widest mb-2.5" style={{ color: '#8E8E93' }}>Add calendar</p>
      <form onSubmit={handleSubmit} className="space-y-2.5">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Calendar name"
          className="w-full px-2.5 py-1.5 text-sm rounded-lg focus:outline-none transition-colors"
          style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.09)', color: '#1C1C1E' }}
          autoFocus
        />
        <ColorPicker value={color} onChange={setColor} label="Color (left border)" />
        <div className="flex justify-end gap-1.5 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-2.5 py-1 text-xs rounded-lg transition-colors"
            style={{ color: '#636366' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors"
            style={{ backgroundColor: 'rgba(91,155,173,0.12)', color: '#2C6070', border: '1px solid rgba(91,155,173,0.25)' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(91,155,173,0.2)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(91,155,173,0.12)'; }}
          >
            Add
          </button>
        </div>
      </form>
    </div>
  );
}
