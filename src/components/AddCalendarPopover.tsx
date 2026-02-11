import React, { useState, useRef, useEffect } from 'react';
import type { CalendarContainer } from '../types';
import { ColorPicker } from './ColorPicker';

interface AddCalendarPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  onAdd: (c: Omit<CalendarContainer, 'id'>) => void;
}

export function AddCalendarPopover({ isOpen, onClose, anchorRef, onAdd }: AddCalendarPopoverProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#86C0F4');
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
    onAdd({ name: name.trim(), color: color || '#86C0F4' });
    setName('');
    setColor('#86C0F4');
    onClose();
  };

  return (
    <div
      ref={popoverRef}
      className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border border-neutral-200 bg-white p-3 shadow-lg"
      style={{ marginLeft: 0 }}
    >
      <p className="text-xs font-medium text-neutral-500 mb-2">Add calendar</p>
      <form onSubmit={handleSubmit} className="space-y-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Calendar name"
          className="w-full px-2.5 py-1.5 text-sm border border-neutral-200 rounded-md focus:outline-none focus:ring-1 focus:ring-neutral-300"
          autoFocus
        />
        <ColorPicker value={color} onChange={setColor} label="Color (left border)" />
        <div className="flex justify-end gap-1.5 pt-1">
          <button type="button" onClick={onClose} className="px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100 rounded">
            Cancel
          </button>
          <button type="submit" className="px-2 py-1 text-xs font-medium text-neutral-800 bg-neutral-100 hover:bg-neutral-200 rounded">
            Add
          </button>
        </div>
      </form>
    </div>
  );
}
