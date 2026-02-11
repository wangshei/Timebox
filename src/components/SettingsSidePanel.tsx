import React, { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import type { CalendarContainer, Category, Tag } from '../types';
import { ColorPicker } from './ColorPicker';
import { EditColorModal } from './EditColorModal';
import { EditTagModal } from './EditTagModal';

interface SettingsSidePanelProps {
  calendarContainers: CalendarContainer[];
  categories: Category[];
  tags: Tag[];
  onAddCalendar: (c: Omit<CalendarContainer, 'id'>) => void;
  onUpdateCalendar: (id: string, u: Partial<CalendarContainer>) => void;
  onDeleteCalendar: (id: string) => void;
  onAddCategory: (c: Omit<Category, 'id'>) => void;
  onUpdateCategory: (id: string, u: Partial<Category>) => void;
  onDeleteCategory: (id: string) => void;
  onAddTag: (t: Omit<Tag, 'id'>) => void;
  onUpdateTag: (id: string, u: Partial<Tag>) => void;
  onDeleteTag: (id: string) => void;
  onSave: () => void;
  onRevert: () => void;
}

export function SettingsSidePanel({
  calendarContainers,
  categories,
  tags,
  onAddCalendar,
  onUpdateCalendar,
  onDeleteCalendar,
  onAddCategory,
  onUpdateCategory,
  onDeleteCategory,
  onAddTag,
  onUpdateTag,
  onDeleteTag,
  onSave,
  onRevert,
}: SettingsSidePanelProps) {
  const [editingCalendarId, setEditingCalendarId] = useState<string | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [newCalendar, setNewCalendar] = useState({ name: '', color: '#86C0F4' });
  const [newCategory, setNewCategory] = useState({ name: '', color: '#6b7280', calendarContainerId: '' as string | null });
  const [newTag, setNewTag] = useState({ name: '', type: '' as 'project' | 'hobby' | undefined, categoryId: '' as string | null });

  const handleAddCalendar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCalendar.name.trim()) return;
    onAddCalendar({ name: newCalendar.name.trim(), color: newCalendar.color || '#86C0F4' });
    setNewCalendar({ name: '', color: '#86C0F4' });
  };
  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategory.name.trim()) return;
    onAddCategory({
      name: newCategory.name.trim(),
      color: newCategory.color || '#6b7280',
      calendarContainerId: newCategory.calendarContainerId || undefined,
    });
    setNewCategory({ name: '', color: '#6b7280', calendarContainerId: null });
  };
  const handleAddTag = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTag.name.trim()) return;
    onAddTag({
      name: newTag.name.trim(),
      type: newTag.type || undefined,
      categoryId: newTag.categoryId || undefined,
    });
    setNewTag({ name: '', type: undefined, categoryId: null });
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-y-auto px-3 py-3 min-h-0">
        <p className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wide mb-3 pl-0.5">Organization</p>

        {/* Calendars */}
        <section className="mb-4">
          <p className="text-[11px] font-medium text-neutral-400 uppercase tracking-wide mb-1.5 pl-0.5">Calendars</p>
          <form onSubmit={handleAddCalendar} className="flex gap-1.5 mb-2">
            <input
              type="text"
              value={newCalendar.name}
              onChange={(e) => setNewCalendar((p) => ({ ...p, name: e.target.value }))}
              placeholder="Add calendar"
              className="flex-1 min-w-0 px-2.5 py-1.5 text-sm border border-neutral-200 rounded-md focus:outline-none focus:ring-1 focus:ring-neutral-300"
            />
            <button type="submit" className="p-1.5 rounded-md border border-neutral-200 text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700 shrink-0" title="Add">
              <Plus className="w-3.5 h-3.5" />
            </button>
          </form>
          <div className="space-y-0.5">
            {calendarContainers.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-1.5 py-1.5 px-2 rounded-md border-l-[3px] group hover:bg-neutral-50/80"
                style={{ borderLeftColor: c.color, backgroundColor: `${c.color}08` }}
              >
                <span className="flex-1 text-sm text-neutral-800 truncate min-w-0">{c.name}</span>
                <button type="button" onClick={() => setEditingCalendarId(c.id)} className="p-1 rounded text-neutral-400 hover:text-neutral-600 opacity-0 group-hover:opacity-100 transition-opacity" title="Edit">
                  <Pencil className="w-3 h-3" />
                </button>
                <button type="button" onClick={() => onDeleteCalendar(c.id)} className="p-1 rounded text-neutral-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity" title="Delete">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Categories */}
        <section className="mb-4">
          <p className="text-[11px] font-medium text-neutral-400 uppercase tracking-wide mb-1.5 pl-0.5">Categories</p>
          <form onSubmit={handleAddCategory} className="flex gap-1.5 mb-2">
            <input
              type="text"
              value={newCategory.name}
              onChange={(e) => setNewCategory((p) => ({ ...p, name: e.target.value }))}
              placeholder="Add category"
              className="flex-1 min-w-0 px-2.5 py-1.5 text-sm border border-neutral-200 rounded-md focus:outline-none focus:ring-1 focus:ring-neutral-300"
            />
            <button type="submit" className="p-1.5 rounded-md border border-neutral-200 text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700 shrink-0" title="Add">
              <Plus className="w-3.5 h-3.5" />
            </button>
          </form>
          {calendarContainers.length > 0 && (
            <select
              value={newCategory.calendarContainerId ?? ''}
              onChange={(e) => setNewCategory((p) => ({ ...p, calendarContainerId: e.target.value || null }))}
              className="w-full mb-2 px-2.5 py-1.5 text-xs border border-neutral-200 rounded-md focus:outline-none focus:ring-1 focus:ring-neutral-300"
            >
              <option value="">Under calendar —</option>
              {calendarContainers.map((cal) => (
                <option key={cal.id} value={cal.id}>{cal.name}</option>
              ))}
            </select>
          )}
          <ColorPicker value={newCategory.color} onChange={(color) => setNewCategory((p) => ({ ...p, color }))} label="" />
          <div className="space-y-0.5 mt-2">
            {categories.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-1.5 py-1.5 px-2 rounded-md border-l-[3px] group hover:bg-neutral-50/80"
                style={{ borderLeftColor: c.color, backgroundColor: `${c.color}08` }}
              >
                <span className="flex-1 text-sm text-neutral-800 truncate min-w-0">{c.name}</span>
                <button type="button" onClick={() => setEditingCategoryId(c.id)} className="p-1 rounded text-neutral-400 hover:text-neutral-600 opacity-0 group-hover:opacity-100 transition-opacity" title="Edit">
                  <Pencil className="w-3 h-3" />
                </button>
                <button type="button" onClick={() => onDeleteCategory(c.id)} className="p-1 rounded text-neutral-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity" title="Delete">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Tags */}
        <section className="mb-2">
          <p className="text-[11px] font-medium text-neutral-400 uppercase tracking-wide mb-1.5 pl-0.5">Tags</p>
          <form onSubmit={handleAddTag} className="flex flex-wrap gap-1.5 mb-2">
            <input
              type="text"
              value={newTag.name}
              onChange={(e) => setNewTag((p) => ({ ...p, name: e.target.value }))}
              placeholder="Add tag"
              className="flex-1 min-w-[80px] px-2.5 py-1.5 text-sm border border-neutral-200 rounded-md focus:outline-none focus:ring-1 focus:ring-neutral-300"
            />
            {categories.length > 0 && (
              <select
                value={newTag.categoryId ?? ''}
                onChange={(e) => setNewTag((p) => ({ ...p, categoryId: e.target.value || null }))}
                className="px-2 py-1.5 text-xs border border-neutral-200 rounded-md"
              >
                <option value="">—</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            )}
            <button type="submit" className="p-1.5 rounded-md border border-neutral-200 text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700 shrink-0" title="Add">
              <Plus className="w-3.5 h-3.5" />
            </button>
          </form>
          <div className="space-y-0.5">
            {tags.map((t) => (
              <div key={t.id} className="flex items-center gap-1.5 py-1.5 px-2 rounded-md group hover:bg-neutral-50/80">
                <span className="flex-1 text-sm text-neutral-800 truncate min-w-0">{t.name}</span>
                {t.type && <span className="text-[10px] text-neutral-400">{t.type}</span>}
                <button type="button" onClick={() => setEditingTagId(t.id)} className="p-1 rounded text-neutral-400 hover:text-neutral-600 opacity-0 group-hover:opacity-100 transition-opacity" title="Edit">
                  <Pencil className="w-3 h-3" />
                </button>
                <button type="button" onClick={() => onDeleteTag(t.id)} className="p-1 rounded text-neutral-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity" title="Delete">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Save / Revert at bottom */}
      <div className="flex-shrink-0 px-3 py-3 border-t border-neutral-100 bg-white flex gap-2">
        <button
          type="button"
          onClick={onRevert}
          className="flex-1 py-2 text-sm font-medium text-neutral-600 hover:text-neutral-900 border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors"
        >
          Revert
        </button>
        <button
          type="button"
          onClick={onSave}
          className="flex-1 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
        >
          Save
        </button>
      </div>

      <EditColorModal
        isOpen={editingCalendarId !== null}
        onClose={() => setEditingCalendarId(null)}
        title="Edit Calendar"
        initialName={calendarContainers.find((c) => c.id === editingCalendarId)?.name ?? ''}
        initialColor={calendarContainers.find((c) => c.id === editingCalendarId)?.color ?? '#86C0F4'}
        onSave={(name, color) => {
          if (editingCalendarId) onUpdateCalendar(editingCalendarId, { name, color });
          setEditingCalendarId(null);
        }}
      />
      <EditColorModal
        isOpen={editingCategoryId !== null}
        onClose={() => setEditingCategoryId(null)}
        title="Edit Category"
        initialName={categories.find((c) => c.id === editingCategoryId)?.name ?? ''}
        initialColor={categories.find((c) => c.id === editingCategoryId)?.color ?? '#6b7280'}
        calendarContainers={calendarContainers}
        initialCalendarContainerId={categories.find((c) => c.id === editingCategoryId)?.calendarContainerId}
        onSave={(name, color, calendarContainerId) => {
          if (editingCategoryId) onUpdateCategory(editingCategoryId, { name, color, calendarContainerId: calendarContainerId ?? undefined });
          setEditingCategoryId(null);
        }}
      />
      <EditTagModal
        isOpen={editingTagId !== null}
        onClose={() => setEditingTagId(null)}
        initialName={tags.find((t) => t.id === editingTagId)?.name ?? ''}
        initialType={tags.find((t) => t.id === editingTagId)?.type}
        initialCategoryId={tags.find((t) => t.id === editingTagId)?.categoryId}
        categories={categories}
        onSave={(name, type, categoryId) => {
          if (editingTagId) onUpdateTag(editingTagId, { name, type, categoryId: categoryId ?? undefined });
          setEditingTagId(null);
        }}
      />
    </div>
  );
}
