import React, { useState } from 'react';
import { X, Plus, Pencil, Trash2 } from 'lucide-react';
import type { CalendarContainer, Category, Tag } from '../types';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { ColorPicker } from './ColorPicker';
import { EditColorModal } from './EditColorModal';
import { EditTagModal } from './EditTagModal';

type TabValue = 'calendars' | 'categories' | 'tags';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
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
}

export function SettingsPanel({
  isOpen,
  onClose,
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
}: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<TabValue>('calendars');
  const [editingCalendarId, setEditingCalendarId] = useState<string | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [newCalendar, setNewCalendar] = useState({ name: '', color: '#86C0F4' });
  const [newCategory, setNewCategory] = useState({ name: '', color: '#6b7280', calendarContainerId: '' as string | null });
  const [newTag, setNewTag] = useState({ name: '', type: '' as 'project' | 'hobby' | undefined, categoryId: '' as string | null });

  if (!isOpen) return null;

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
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} aria-hidden />
      <div className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-md max-h-[85vh] bg-white shadow-xl rounded-2xl border border-neutral-200 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-neutral-100">
          <h2 className="text-base font-semibold text-neutral-900">Settings</h2>
          <button type="button" onClick={onClose} className="p-2 hover:bg-neutral-100 rounded-lg text-neutral-500 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)} className="flex-1 flex flex-col overflow-hidden min-h-0">
          <div className="px-4 pt-3 pb-2 flex-shrink-0">
            <TabsList className="w-full grid grid-cols-3 h-9 rounded-lg bg-neutral-100 p-0.5">
              <TabsTrigger value="calendars" className="text-xs font-medium rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm">Calendars</TabsTrigger>
              <TabsTrigger value="categories" className="text-xs font-medium rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm">Categories</TabsTrigger>
              <TabsTrigger value="tags" className="text-xs font-medium rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm">Tags</TabsTrigger>
            </TabsList>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4 min-h-0 space-y-6">
            <TabsContent value="calendars" className="mt-0 space-y-5">
              <form onSubmit={handleAddCalendar} className="space-y-3 p-3 rounded-xl bg-neutral-50 border border-neutral-100">
                <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Add calendar</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newCalendar.name}
                    onChange={(e) => setNewCalendar((p) => ({ ...p, name: e.target.value }))}
                    placeholder="Calendar name"
                    className="flex-1 px-3 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <button type="submit" className="px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shrink-0 inline-flex items-center gap-1.5">
                    <Plus className="w-4 h-4" /> Add
                  </button>
                </div>
                <ColorPicker value={newCalendar.color} onChange={(color) => setNewCalendar((p) => ({ ...p, color }))} label="Color" />
              </form>
              <ul className="space-y-1">
                {calendarContainers.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 py-2.5 px-3 rounded-lg border-l-[3px] hover:bg-neutral-50" style={{ borderLeftColor: c.color, backgroundColor: `${c.color}08` }}>
                    <span className="flex-1 text-sm font-medium text-neutral-900">{c.name}</span>
                    <button type="button" onClick={() => setEditingCalendarId(c.id)} className="p-2 hover:bg-white rounded-lg text-neutral-400 hover:text-neutral-600 transition-colors" title="Edit">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" onClick={() => onDeleteCalendar(c.id)} className="p-2 hover:bg-red-50 rounded-lg text-red-500 hover:text-red-600 transition-colors" title="Delete">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </TabsContent>
            <TabsContent value="categories" className="mt-0 space-y-5">
              <form onSubmit={handleAddCategory} className="space-y-3 p-3 rounded-xl bg-neutral-50 border border-neutral-100">
                <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Add category</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newCategory.name}
                    onChange={(e) => setNewCategory((p) => ({ ...p, name: e.target.value }))}
                    placeholder="Category name"
                    className="flex-1 px-3 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <button type="submit" className="px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shrink-0 inline-flex items-center gap-1.5">
                    <Plus className="w-4 h-4" /> Add
                  </button>
                </div>
                {calendarContainers.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-neutral-600 mb-1">Parent calendar</label>
                    <select
                      value={newCategory.calendarContainerId ?? ''}
                      onChange={(e) => setNewCategory((p) => ({ ...p, calendarContainerId: e.target.value || null }))}
                      className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg"
                    >
                      <option value="">— None</option>
                      {calendarContainers.map((cal) => (
                        <option key={cal.id} value={cal.id}>{cal.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <ColorPicker value={newCategory.color} onChange={(color) => setNewCategory((p) => ({ ...p, color }))} label="Color" />
              </form>
              <ul className="space-y-1">
                {categories.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 py-2.5 px-3 rounded-lg border-l-[3px] hover:bg-neutral-50" style={{ borderLeftColor: c.color, backgroundColor: `${c.color}08` }}>
                    <span className="flex-1 text-sm font-medium text-neutral-900">{c.name}</span>
                    <button type="button" onClick={() => setEditingCategoryId(c.id)} className="p-2 hover:bg-white rounded-lg text-neutral-400 hover:text-neutral-600 transition-colors" title="Edit">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" onClick={() => onDeleteCategory(c.id)} className="p-2 hover:bg-red-50 rounded-lg text-red-500 hover:text-red-600 transition-colors" title="Delete">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </TabsContent>
            <TabsContent value="tags" className="mt-0 space-y-5">
              <form onSubmit={handleAddTag} className="space-y-3 p-3 rounded-xl bg-neutral-50 border border-neutral-100">
                <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Add tag</p>
                <div className="flex gap-2 flex-wrap">
                  <input
                    type="text"
                    value={newTag.name}
                    onChange={(e) => setNewTag((p) => ({ ...p, name: e.target.value }))}
                    placeholder="Tag name"
                    className="flex-1 min-w-[120px] px-3 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  {categories.length > 0 && (
                    <select
                      value={newTag.categoryId ?? ''}
                      onChange={(e) => setNewTag((p) => ({ ...p, categoryId: e.target.value || null }))}
                      className="px-3 py-2 text-sm border border-neutral-200 rounded-lg"
                    >
                      <option value="">— Category</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  )}
                  <select
                    value={newTag.type || ''}
                    onChange={(e) => setNewTag((p) => ({ ...p, type: (e.target.value || undefined) as 'project' | 'hobby' | undefined }))}
                    className="px-3 py-2 text-sm border border-neutral-200 rounded-lg"
                  >
                    <option value="">— Type</option>
                    <option value="project">Project</option>
                    <option value="hobby">Hobby</option>
                  </select>
                  <button type="submit" className="px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shrink-0 inline-flex items-center gap-1.5">
                    <Plus className="w-4 h-4" /> Add
                  </button>
                </div>
              </form>
              <ul className="space-y-1">
                {tags.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 py-2.5 px-3 rounded-lg hover:bg-neutral-50">
                    <span className="flex-1 text-sm font-medium text-neutral-900">{t.name}</span>
                    {t.type && <span className="text-xs text-neutral-500 bg-neutral-100 px-2 py-0.5 rounded">{t.type}</span>}
                    <button type="button" onClick={() => setEditingTagId(t.id)} className="p-2 hover:bg-white rounded-lg text-neutral-400 hover:text-neutral-600 transition-colors" title="Edit">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" onClick={() => onDeleteTag(t.id)} className="p-2 hover:bg-red-50 rounded-lg text-red-500 hover:text-red-600 transition-colors" title="Delete">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </TabsContent>
          </div>
        </Tabs>
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
    </>
  );
}

