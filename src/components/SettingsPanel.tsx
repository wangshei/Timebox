import React, { useState } from 'react';
import { X, Plus, Pencil, Trash2 } from 'lucide-react';
import type { CalendarContainer, Category, Tag } from '../types';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';

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
  const [newCategory, setNewCategory] = useState({ name: '', color: '#6b7280' });
  const [newTag, setNewTag] = useState({ name: '', type: '' as 'project' | 'hobby' | undefined });

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
    onAddCategory({ name: newCategory.name.trim(), color: newCategory.color || '#6b7280' });
    setNewCategory({ name: '', color: '#6b7280' });
  };
  const handleAddTag = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTag.name.trim()) return;
    onAddTag({ name: newTag.name.trim(), type: newTag.type || undefined });
    setNewTag({ name: '', type: undefined });
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} aria-hidden />
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-sm bg-white shadow-xl flex flex-col border-l border-neutral-200">
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
          <h2 className="text-lg font-medium text-neutral-900">Settings</h2>
          <button type="button" onClick={onClose} className="p-2 hover:bg-neutral-100 rounded-lg">
            <X className="w-5 h-5 text-neutral-500" />
          </button>
        </div>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)} className="flex-1 flex flex-col overflow-hidden">
          <div className="px-4 pt-3">
            <p className="text-xs text-neutral-500 mb-2">Calendar = function/bucket (left border). Category = type of activity (block color). Tag = optional.</p>
            <TabsList className="w-full grid grid-cols-3">
              <TabsTrigger value="calendars" className="text-xs">Calendars</TabsTrigger>
              <TabsTrigger value="categories" className="text-xs">Categories</TabsTrigger>
              <TabsTrigger value="tags" className="text-xs">Tags</TabsTrigger>
            </TabsList>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <TabsContent value="calendars" className="mt-0 space-y-4">
              <form onSubmit={handleAddCalendar} className="flex gap-2">
                <input
                  type="text"
                  value={newCalendar.name}
                  onChange={(e) => setNewCalendar((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Name"
                  className="flex-1 px-3 py-2 text-sm border border-neutral-200 rounded-lg"
                />
                <input
                  type="color"
                  value={newCalendar.color}
                  onChange={(e) => setNewCalendar((p) => ({ ...p, color: e.target.value }))}
                  className="w-9 h-9 rounded border border-neutral-200 cursor-pointer"
                />
                <button type="submit" className="p-2 bg-neutral-100 hover:bg-neutral-200 rounded-lg">
                  <Plus className="w-4 h-4" />
                </button>
              </form>
              <ul className="space-y-2">
                {calendarContainers.map((c) =>
                  editingCalendarId === c.id ? (
                    <CalendarEditRow
                      key={c.id}
                      item={c}
                      onSave={(name, color) => {
                        onUpdateCalendar(c.id, { name, color });
                        setEditingCalendarId(null);
                      }}
                      onCancel={() => setEditingCalendarId(null)}
                    />
                  ) : (
                    <li key={c.id} className="flex items-center gap-2 py-2 border-b border-neutral-100">
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                      <span className="flex-1 text-sm text-neutral-900">{c.name}</span>
                      <button type="button" onClick={() => setEditingCalendarId(c.id)} className="p-1.5 hover:bg-neutral-100 rounded">
                        <Pencil className="w-3.5 h-3.5 text-neutral-500" />
                      </button>
                      <button type="button" onClick={() => onDeleteCalendar(c.id)} className="p-1.5 hover:bg-red-50 rounded text-red-600">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  )
                )}
              </ul>
            </TabsContent>
            <TabsContent value="categories" className="mt-0 space-y-4">
              <form onSubmit={handleAddCategory} className="flex gap-2">
                <input
                  type="text"
                  value={newCategory.name}
                  onChange={(e) => setNewCategory((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Name"
                  className="flex-1 px-3 py-2 text-sm border border-neutral-200 rounded-lg"
                />
                <input
                  type="color"
                  value={newCategory.color}
                  onChange={(e) => setNewCategory((p) => ({ ...p, color: e.target.value }))}
                  className="w-9 h-9 rounded border border-neutral-200 cursor-pointer"
                />
                <button type="submit" className="p-2 bg-neutral-100 hover:bg-neutral-200 rounded-lg">
                  <Plus className="w-4 h-4" />
                </button>
              </form>
              <ul className="space-y-2">
                {categories.map((c) =>
                  editingCategoryId === c.id ? (
                    <CategoryEditRow
                      key={c.id}
                      item={c}
                      onSave={(name, color) => {
                        onUpdateCategory(c.id, { name, color });
                        setEditingCategoryId(null);
                      }}
                      onCancel={() => setEditingCategoryId(null)}
                    />
                  ) : (
                    <li key={c.id} className="flex items-center gap-2 py-2 border-b border-neutral-100">
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                      <span className="flex-1 text-sm text-neutral-900">{c.name}</span>
                      <button type="button" onClick={() => setEditingCategoryId(c.id)} className="p-1.5 hover:bg-neutral-100 rounded">
                        <Pencil className="w-3.5 h-3.5 text-neutral-500" />
                      </button>
                      <button type="button" onClick={() => onDeleteCategory(c.id)} className="p-1.5 hover:bg-red-50 rounded text-red-600">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  )
                )}
              </ul>
            </TabsContent>
            <TabsContent value="tags" className="mt-0 space-y-4">
              <form onSubmit={handleAddTag} className="flex gap-2">
                <input
                  type="text"
                  value={newTag.name}
                  onChange={(e) => setNewTag((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Tag name"
                  className="flex-1 px-3 py-2 text-sm border border-neutral-200 rounded-lg"
                />
                <select
                  value={newTag.type || ''}
                  onChange={(e) => setNewTag((p) => ({ ...p, type: (e.target.value || undefined) as 'project' | 'hobby' | undefined }))}
                  className="px-2 py-2 text-sm border border-neutral-200 rounded-lg"
                >
                  <option value="">—</option>
                  <option value="project">Project</option>
                  <option value="hobby">Hobby</option>
                </select>
                <button type="submit" className="p-2 bg-neutral-100 hover:bg-neutral-200 rounded-lg">
                  <Plus className="w-4 h-4" />
                </button>
              </form>
              <ul className="space-y-2">
                {tags.map((t) =>
                  editingTagId === t.id ? (
                    <TagEditRow
                      key={t.id}
                      item={t}
                      onSave={(name, type) => {
                        onUpdateTag(t.id, { name, type });
                        setEditingTagId(null);
                      }}
                      onCancel={() => setEditingTagId(null)}
                    />
                  ) : (
                    <li key={t.id} className="flex items-center gap-2 py-2 border-b border-neutral-100">
                      <span className="flex-1 text-sm text-neutral-900">{t.name}</span>
                      {t.type && <span className="text-xs text-neutral-500">{t.type}</span>}
                      <button type="button" onClick={() => setEditingTagId(t.id)} className="p-1.5 hover:bg-neutral-100 rounded">
                        <Pencil className="w-3.5 h-3.5 text-neutral-500" />
                      </button>
                      <button type="button" onClick={() => onDeleteTag(t.id)} className="p-1.5 hover:bg-red-50 rounded text-red-600">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  )
                )}
              </ul>
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </>
  );
}

function CalendarEditRow({
  item,
  onSave,
  onCancel,
}: {
  item: CalendarContainer;
  onSave: (name: string, color: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(item.name);
  const [color, setColor] = useState(item.color);
  return (
    <li className="flex items-center gap-2 py-2 border-b border-neutral-100">
      <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-8 h-8 rounded border cursor-pointer" />
      <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="flex-1 px-2 py-1 text-sm border rounded" />
      <button type="button" onClick={() => onSave(name, color)} className="text-sm text-blue-600 font-medium">Save</button>
      <button type="button" onClick={onCancel} className="text-sm text-neutral-500">Cancel</button>
    </li>
  );
}

function CategoryEditRow({
  item,
  onSave,
  onCancel,
}: {
  item: Category;
  onSave: (name: string, color: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(item.name);
  const [color, setColor] = useState(item.color);
  return (
    <li className="flex items-center gap-2 py-2 border-b border-neutral-100">
      <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-8 h-8 rounded border cursor-pointer" />
      <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="flex-1 px-2 py-1 text-sm border rounded" />
      <button type="button" onClick={() => onSave(name, color)} className="text-sm text-blue-600 font-medium">Save</button>
      <button type="button" onClick={onCancel} className="text-sm text-neutral-500">Cancel</button>
    </li>
  );
}

function TagEditRow({
  item,
  onSave,
  onCancel,
}: {
  item: Tag;
  onSave: (name: string, type?: 'project' | 'hobby') => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(item.name);
  const [type, setType] = useState<string>(item.type || '');
  return (
    <li className="flex items-center gap-2 py-2 border-b border-neutral-100">
      <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="flex-1 px-2 py-1 text-sm border rounded" />
      <select value={type} onChange={(e) => setType(e.target.value)} className="px-2 py-1 text-sm border rounded">
        <option value="">—</option>
        <option value="project">Project</option>
        <option value="hobby">Hobby</option>
      </select>
      <button type="button" onClick={() => onSave(name, type as 'project' | 'hobby' || undefined)} className="text-sm text-blue-600 font-medium">Save</button>
      <button type="button" onClick={onCancel} className="text-sm text-neutral-500">Cancel</button>
    </li>
  );
}
