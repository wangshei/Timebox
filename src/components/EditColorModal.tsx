import React, { useState, useEffect } from 'react';
import { XMarkIcon, CheckIcon } from '@heroicons/react/24/solid';
import { ColorPicker } from './ColorPicker';
import type { CalendarContainer } from '../types';

interface EditColorModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  initialName: string;
  initialColor: string;
  onSave: (name: string, color: string, calendarContainerId?: string | null) => void;
  /** When set, show "Parent calendar" dropdown (for Edit Category). */
  calendarContainers?: CalendarContainer[];
  initialCalendarContainerId?: string | null;
}

/** Edit Category / Edit Calendar style: modal with Name, Color (2×4 swatches), optional Calendar, Cancel, Save (blue + check). */
export function EditColorModal({
  isOpen,
  onClose,
  title,
  initialName,
  initialColor,
  onSave,
  calendarContainers,
  initialCalendarContainerId,
}: EditColorModalProps) {
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor);
  const [calendarContainerId, setCalendarContainerId] = useState<string | null>(initialCalendarContainerId ?? null);

  useEffect(() => {
    if (isOpen) {
      setName(initialName);
      setColor(initialColor);
      setCalendarContainerId(initialCalendarContainerId ?? null);
    }
  }, [isOpen, initialName, initialColor, initialCalendarContainerId]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave(name.trim(), color, calendarContainers ? calendarContainerId : undefined);
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/20" onClick={onClose} aria-hidden />
      <div className="fixed left-1/2 top-1/2 z-[70] -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-white shadow-xl rounded-xl border border-neutral-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
          <h2 className="text-base font-semibold text-neutral-900">{title}</h2>
          <button type="button" onClick={onClose} className="p-1.5 hover:bg-neutral-100 rounded-lg text-neutral-500 transition-colors">
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-5">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Name"
              autoFocus
            />
          </div>
          {calendarContainers && calendarContainers.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">Parent calendar</label>
              <select
                value={calendarContainerId ?? ''}
                onChange={(e) => setCalendarContainerId(e.target.value || null)}
                className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">— None (ungrouped)</option>
                {calendarContainers.map((cal) => (
                  <option key={cal.id} value={cal.id}>{cal.name}</option>
                ))}
              </select>
            </div>
          )}
          <ColorPicker
            label="Color"
            value={color}
            onChange={setColor}
            swatchSize="md"
          />
          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:pointer-events-none rounded-lg transition-colors"
            >
              <CheckIcon className="h-4 w-4" />
              Save
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
