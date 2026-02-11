import React, { useState, useEffect } from 'react';
import { X, Check } from 'lucide-react';
import { PALETTE_COLORS } from '../constants/colors';

interface EditColorModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  initialName: string;
  initialColor: string;
  onSave: (name: string, color: string) => void;
}

/** Edit Category / Edit Calendar style: modal with Name, Color (2×4 swatches), Cancel, Save (blue + check). */
export function EditColorModal({
  isOpen,
  onClose,
  title,
  initialName,
  initialColor,
  onSave,
}: EditColorModalProps) {
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor);

  useEffect(() => {
    if (isOpen) {
      setName(initialName);
      setColor(initialColor);
    }
  }, [isOpen, initialName, initialColor]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave(name.trim(), color);
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/20" onClick={onClose} aria-hidden />
      <div className="fixed left-1/2 top-1/2 z-[70] -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-white shadow-xl rounded-xl border border-neutral-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
          <h2 className="text-base font-semibold text-neutral-900">{title}</h2>
          <button type="button" onClick={onClose} className="p-1.5 hover:bg-neutral-100 rounded-lg text-neutral-500 transition-colors">
            <X className="w-4 h-4" />
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
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">Color</label>
            <div className="grid grid-cols-4 gap-2">
              {PALETTE_COLORS.map(({ name: n, value: hex }, i) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setColor(hex)}
                  className={`aspect-square rounded-lg border-2 transition-all flex-shrink-0 ${
                    color.toLowerCase() === hex.toLowerCase()
                      ? 'border-neutral-400 ring-2 ring-neutral-300'
                      : 'border-neutral-200 hover:border-neutral-300'
                  }`}
                  style={{ backgroundColor: hex }}
                  title={n}
                  aria-label={n}
                />
              ))}
              <label className="aspect-square rounded-lg border-2 border-neutral-200 hover:border-neutral-300 cursor-pointer flex items-center justify-center overflow-hidden">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-full h-full cursor-pointer opacity-0 absolute inset-0"
                />
                <span className="text-[10px] text-neutral-500 px-1">Custom</span>
              </label>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:pointer-events-none rounded-lg transition-colors"
            >
              <Check className="w-4 h-4" />
              Save
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
