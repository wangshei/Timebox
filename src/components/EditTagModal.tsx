import React, { useState, useEffect } from 'react';
import { XMarkIcon, CheckIcon } from '@heroicons/react/24/solid';
import type { Category } from '../types';

interface EditTagModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialName: string;
  initialType?: 'project' | 'hobby';
  initialCategoryId?: string | null;
  onSave: (name: string, type?: 'project' | 'hobby', categoryId?: string | null) => void;
  categories?: Category[];
}

const inputStyle: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  border: '1px solid rgba(0,0,0,0.12)',
  color: '#1C1C1E',
};

export function EditTagModal({
  isOpen,
  onClose,
  initialName,
  initialType,
  initialCategoryId,
  onSave,
  categories = [],
}: EditTagModalProps) {
  const [name, setName] = useState(initialName);
  const [type, setType] = useState<'project' | 'hobby' | ''>(initialType || '');
  const [categoryId, setCategoryId] = useState<string | null>(initialCategoryId ?? null);

  useEffect(() => {
    if (isOpen) {
      setName(initialName);
      setType(initialType || '');
      setCategoryId(initialCategoryId ?? null);
    }
  }, [isOpen, initialName, initialType, initialCategoryId]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave(name.trim(), type === '' ? undefined : type, categoryId);
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/20" onClick={onClose} aria-hidden />
      <div
        className="fixed left-1/2 top-1/2 z-[70] -translate-x-1/2 -translate-y-1/2 w-full max-w-sm rounded-xl overflow-hidden"
        style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.09)', boxShadow: '0 16px 48px rgba(0,0,0,0.10)' }}
      >
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
          <h2 className="text-sm font-semibold" style={{ color: '#1C1C1E' }}>Edit Tag</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: '#8E8E93' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.07)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: '#636366' }}>Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none transition-colors"
              style={inputStyle}
              placeholder="Tag name"
              autoFocus
            />
          </div>
          {categories.length > 0 && (
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: '#636366' }}>Parent category</label>
              <select
                value={categoryId ?? ''}
                onChange={(e) => setCategoryId(e.target.value || null)}
                className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none transition-colors"
                style={inputStyle}
              >
                <option value="">— None (ungrouped)</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: '#636366' }}>Type</label>
            <select
              value={type}
              onChange={(e) => setType((e.target.value || '') as 'project' | 'hobby' | '')}
              className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none transition-colors"
              style={inputStyle}
            >
              <option value="">—</option>
              <option value="project">Project</option>
              <option value="hobby">Hobby</option>
            </select>
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium rounded-lg transition-colors"
              style={{ color: '#636366' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 disabled:pointer-events-none"
              style={{ backgroundColor: '#4A80F0' }}
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
