import React, { useState } from 'react';
import { XMarkIcon, PlusIcon, PencilIcon, TrashIcon, CalendarIcon, FolderIcon, TagIcon } from '@heroicons/react/24/solid';
import type { CalendarContainer, Category, Tag } from '../types';
import { ColorPicker } from './ColorPicker';
import { DEFAULT_PALETTE_COLOR } from '../constants/colors';

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

type TabType = 'calendars' | 'categories' | 'tags';

export function SettingsPanel({
  isOpen,
  onClose,
  calendarContainers,
  categories,
  tags,
  onUpdateCalendar,
  onUpdateCategory,
  onUpdateTag,
  onDeleteCalendar,
  onDeleteCategory,
  onDeleteTag,
  onAddCalendar,
  onAddCategory,
  onAddTag,
}: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>('calendars');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState(DEFAULT_PALETTE_COLOR);
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(DEFAULT_PALETTE_COLOR);
  const [editCalendarIds, setEditCalendarIds] = useState<string[]>([]);

  if (!isOpen) return null;

  const handleStartEdit = (id: string, name: string, color?: string, category?: Category) => {
    setEditingId(id);
    setEditName(name);
    setEditColor(color || DEFAULT_PALETTE_COLOR);
    if (activeTab === 'categories' && category) {
      const ids = (category.calendarContainerIds && category.calendarContainerIds.length > 0)
        ? category.calendarContainerIds
        : (category.calendarContainerId ? [category.calendarContainerId] : []);
      setEditCalendarIds(ids);
    }
    setIsAdding(false);
  };

  const handleSaveEdit = () => {
    if (!editName.trim() || !editingId) return;

    if (activeTab === 'calendars' && onUpdateCalendar) {
      onUpdateCalendar(editingId, { name: editName, color: editColor });
    } else if (activeTab === 'categories' && onUpdateCategory) {
      onUpdateCategory(editingId, { name: editName, color: editColor, calendarContainerIds: editCalendarIds.length > 0 ? editCalendarIds : null });
    } else if (activeTab === 'tags' && onUpdateTag) {
      onUpdateTag(editingId, { name: editName });
    }

    setEditingId(null);
    setEditName('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditCalendarIds([]);
    setIsAdding(false);
    setNewName('');
  };

  const handleStartAdd = () => {
    setIsAdding(true);
    setEditingId(null);
    setNewName('');
    setNewColor(DEFAULT_PALETTE_COLOR);
  };

  const handleSaveAdd = () => {
    if (!newName.trim()) return;

    const color = newColor && /^#[0-9A-Fa-f]{6}$/.test(newColor) ? newColor : DEFAULT_PALETTE_COLOR;
    if (activeTab === 'calendars' && onAddCalendar) {
      onAddCalendar({ name: newName.trim(), color });
    } else if (activeTab === 'categories' && onAddCategory) {
      const firstCalId = calendarContainers[0]?.id;
      onAddCategory({
        name: newName.trim(),
        color,
        calendarContainerId: firstCalId ?? undefined,
        calendarContainerIds: firstCalId ? [firstCalId] : undefined,
      });
    } else if (activeTab === 'tags' && onAddTag) {
      onAddTag({ name: newName.trim() });
    }

    setIsAdding(false);
    setNewName('');
    setNewColor(DEFAULT_PALETTE_COLOR);
  };

  const handleDelete = (id: string) => {
    if (activeTab === 'calendars' && onDeleteCalendar) {
      onDeleteCalendar(id);
    } else if (activeTab === 'categories' && onDeleteCategory) {
      onDeleteCategory(id);
    } else if (activeTab === 'tags' && onDeleteTag) {
      onDeleteTag(id);
    }
  };

  const tabs = [
    { id: 'calendars' as const, label: 'Calendars', icon: CalendarIcon },
    { id: 'categories' as const, label: 'Categories', icon: FolderIcon },
    { id: 'tags' as const, label: 'Tags', icon: TagIcon },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-xl shadow-2xl w-[50%] min-w-[400px] max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
          <h2 className="text-xl font-medium text-neutral-900">Settings</h2>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-neutral-100 rounded-lg transition-colors"
          >
            <XMarkIcon className="h-5 w-5 text-neutral-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-neutral-200 px-6 pt-4">
          <div className="flex gap-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setEditingId(null);
                    setIsAdding(false);
                  }}
                  className={`px-4 py-2.5 rounded-t-lg transition-all text-sm font-medium flex items-center gap-2 ${
                    activeTab === tab.id
                      ? 'bg-neutral-100 text-neutral-900'
                      : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-3">
            {/* Calendars List */}
            {activeTab === 'calendars' &&
              calendarContainers.map((calendar) => (
                <div key={calendar.id}>
                  {editingId === calendar.id ? (
                    <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-4 space-y-3">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Calendar name"
                        autoFocus
                      />
                      <ColorPicker
                        label="Color"
                        value={editColor}
                        onChange={setEditColor}
                        swatchSize="sm"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleSaveEdit}
                          className="px-4 py-2 bg-[#0044A8] text-white rounded-lg hover:bg-[#003380] transition-colors text-sm font-medium"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={handleCancelEdit}
                          className="px-4 py-2 bg-neutral-200 text-neutral-700 rounded-lg hover:bg-neutral-300 transition-colors text-sm font-medium"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 px-4 py-3 bg-neutral-50 rounded-lg group">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: calendar.color }} />
                      <CalendarIcon className="h-4 w-4 text-neutral-400" />
                      <span className="flex-1 text-sm text-neutral-700">{calendar.name}</span>
                      <button
                        type="button"
                        onClick={() => handleStartEdit(calendar.id, calendar.name, calendar.color)}
                        className="p-2 hover:bg-neutral-200 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <PencilIcon className="h-4 w-4 text-neutral-500" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(calendar.id)}
                        className="p-2 hover:bg-red-100 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <TrashIcon className="h-4 w-4 text-red-500" />
                      </button>
                    </div>
                  )}
                </div>
              ))}

            {/* Categories List */}
            {activeTab === 'categories' &&
              categories.map((category) => (
                <div key={category.id}>
                  {editingId === category.id ? (
                    <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-4 space-y-3">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Category name"
                        autoFocus
                      />
                      <ColorPicker
                        label="Color"
                        value={editColor}
                        onChange={setEditColor}
                        swatchSize="sm"
                      />
                      <div>
                        <span className="block text-xs font-medium text-neutral-600 mb-2">Show on calendars</span>
                        <div className="flex flex-wrap gap-2">
                          {calendarContainers.map((cal) => {
                            const checked = editCalendarIds.includes(cal.id);
                            return (
                              <label key={cal.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-neutral-200 bg-white cursor-pointer hover:bg-neutral-50">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => {
                                    setEditCalendarIds((prev) =>
                                      prev.includes(cal.id) ? prev.filter((id) => id !== cal.id) : [...prev, cal.id]
                                    );
                                  }}
                                  className="rounded border-neutral-300"
                                />
                                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cal.color }} />
                                <span className="text-sm text-neutral-700">{cal.name}</span>
                              </label>
                            );
                          })}
                        </div>
                        {calendarContainers.length === 0 && (
                          <p className="text-xs text-neutral-500">Add a calendar first.</p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleSaveEdit}
                          className="px-4 py-2 bg-[#0044A8] text-white rounded-lg hover:bg-[#003380] transition-colors text-sm font-medium"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={handleCancelEdit}
                          className="px-4 py-2 bg-neutral-200 text-neutral-700 rounded-lg hover:bg-neutral-300 transition-colors text-sm font-medium"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 px-4 py-3 bg-neutral-50 rounded-lg group">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: category.color }} />
                      <FolderIcon className="h-4 w-4 text-neutral-400" />
                      <span className="flex-1 text-sm text-neutral-700">{category.name}</span>
                      <button
                        type="button"
                        onClick={() => handleStartEdit(category.id, category.name, category.color, category)}
                        className="p-2 hover:bg-neutral-200 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <PencilIcon className="h-4 w-4 text-neutral-500" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(category.id)}
                        className="p-2 hover:bg-red-100 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <TrashIcon className="h-4 w-4 text-red-500" />
                      </button>
                    </div>
                  )}
                </div>
              ))}

            {/* Tags List */}
            {activeTab === 'tags' &&
              tags.map((tag) => (
                <div key={tag.id}>
                  {editingId === tag.id ? (
                    <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-4 space-y-3">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Tag name"
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleSaveEdit}
                          className="px-4 py-2 bg-[#0044A8] text-white rounded-lg hover:bg-[#003380] transition-colors text-sm font-medium"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={handleCancelEdit}
                          className="px-4 py-2 bg-neutral-200 text-neutral-700 rounded-lg hover:bg-neutral-300 transition-colors text-sm font-medium"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 px-4 py-3 bg-neutral-50 rounded-lg group">
                      <TagIcon className="h-4 w-4 text-neutral-400" />
                      <span className="flex-1 text-sm text-neutral-700">{tag.name}</span>
                      <button
                        type="button"
                        onClick={() => handleStartEdit(tag.id, tag.name)}
                        className="p-2 hover:bg-neutral-200 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <PencilIcon className="h-4 w-4 text-neutral-500" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(tag.id)}
                        className="p-2 hover:bg-red-100 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <TrashIcon className="h-4 w-4 text-red-500" />
                      </button>
                    </div>
                  )}
                </div>
              ))}

            {/* Add New Button/Form */}
            {isAdding ? (
              <div className="bg-neutral-50 border-2 border-dashed border-neutral-300 rounded-lg p-4 space-y-3">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={`New ${activeTab.slice(0, -1)} name`}
                  autoFocus
                />
                {(activeTab === 'calendars' || activeTab === 'categories') && (
                  <ColorPicker
                    label="Color"
                    value={newColor}
                    onChange={setNewColor}
                    swatchSize="sm"
                  />
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleSaveAdd}
                    className="px-4 py-2 bg-[#0044A8] text-white rounded-lg hover:bg-[#003380] transition-colors text-sm font-medium"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="px-4 py-2 bg-neutral-200 text-neutral-700 rounded-lg hover:bg-neutral-300 transition-colors text-sm font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleStartAdd}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-neutral-300 rounded-lg text-neutral-500 hover:text-neutral-700 hover:border-neutral-400 transition-colors"
              >
                <PlusIcon className="h-4 w-4" />
                Add {activeTab.slice(0, -1)}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
