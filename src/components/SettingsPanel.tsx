import React, { useState } from 'react';
import { XMarkIcon, PlusIcon, PencilIcon, TrashIcon, CalendarIcon, FolderIcon, TagIcon, CheckIcon } from '@heroicons/react/24/solid';
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

const PRIMARY = '#8DA286';
const BG = '#FCFBF7';
const BORDER = 'rgba(0,0,0,0.08)';
const TEXT = '#1C1C1E';
const TEXT_MUTED = '#8E8E93';
const TEXT_SECONDARY = '#636366';

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
      onUpdateCategory(editingId, { name: editName, color: editColor, calendarContainerIds: editCalendarIds.length > 0 ? editCalendarIds : undefined });
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

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '7px 10px',
    fontSize: 13,
    color: TEXT,
    backgroundColor: '#FFFFFF',
    border: `1px solid ${BORDER}`,
    borderRadius: 8,
    outline: 'none',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
      />

      <div
        className="relative flex flex-col"
        style={{
          backgroundColor: BG,
          borderRadius: 14,
          boxShadow: '0 24px 64px rgba(0,0,0,0.14)',
          border: `1px solid ${BORDER}`,
          width: '44%',
          minWidth: 380,
          maxWidth: 580,
          maxHeight: '80vh',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3.5 flex-shrink-0"
          style={{ borderBottom: `1px solid ${BORDER}` }}
        >
          <h2 style={{ fontSize: 15, fontWeight: 600, color: TEXT }}>Settings</h2>
          <button
            onClick={onClose}
            className="flex items-center justify-center rounded-lg transition-colors"
            style={{ width: 28, height: 28, color: TEXT_MUTED }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.07)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-5 pt-3 pb-0 flex-shrink-0">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setEditingId(null);
                  setIsAdding(false);
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all"
                style={{
                  fontSize: 12,
                  fontWeight: active ? 600 : 400,
                  color: active ? PRIMARY : TEXT_SECONDARY,
                  backgroundColor: active ? `${PRIMARY}14` : 'transparent',
                  border: active ? `1px solid ${PRIMARY}28` : '1px solid transparent',
                }}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Divider */}
        <div style={{ height: 1, backgroundColor: BORDER, margin: '12px 20px 0' }} />

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
          {/* Calendars */}
          {activeTab === 'calendars' &&
            calendarContainers.map((calendar) => (
              <div key={calendar.id}>
                {editingId === calendar.id ? (
                  <div
                    className="space-y-3 p-3 rounded-xl"
                    style={{ backgroundColor: 'rgba(0,0,0,0.03)', border: `1px solid ${BORDER}` }}
                  >
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      style={inputStyle}
                      placeholder="Calendar name"
                      autoFocus
                      onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit()}
                    />
                    <ColorPicker label="Color" value={editColor} onChange={setEditColor} swatchSize="sm" />
                    <div className="flex gap-2">
                      <button type="button" onClick={handleSaveEdit} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors" style={{ backgroundColor: PRIMARY, color: '#FFFFFF' }}>
                        <CheckIcon className="h-3 w-3" /> Save
                      </button>
                      <button type="button" onClick={handleCancelEdit} className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors" style={{ backgroundColor: 'rgba(0,0,0,0.07)', color: TEXT_SECONDARY }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl group"
                    style={{ backgroundColor: 'rgba(0,0,0,0.02)', border: `1px solid ${BORDER}` }}
                  >
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: calendar.color }} />
                    <span className="flex-1 text-sm" style={{ color: TEXT, fontWeight: 500, fontSize: 13 }}>{calendar.name}</span>
                    <button
                      type="button"
                      onClick={() => handleStartEdit(calendar.id, calendar.name, calendar.color)}
                      className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                      style={{ color: TEXT_MUTED }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.07)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                      <PencilIcon className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(calendar.id)}
                      className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                      style={{ color: '#C87868' }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(200,120,104,0.10)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))}

          {/* Categories */}
          {activeTab === 'categories' &&
            categories.map((category) => {
              const calIds = (category.calendarContainerIds && category.calendarContainerIds.length > 0)
                ? category.calendarContainerIds
                : (category.calendarContainerId ? [category.calendarContainerId] : []);
              const calNames = calIds.map(id => calendarContainers.find(c => c.id === id)?.name).filter(Boolean);
              return (
                <div key={category.id}>
                  {editingId === category.id ? (
                    <div
                      className="space-y-3 p-3 rounded-xl"
                      style={{ backgroundColor: 'rgba(0,0,0,0.03)', border: `1px solid ${BORDER}` }}
                    >
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        style={inputStyle}
                        placeholder="Category name"
                        autoFocus
                        onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit()}
                      />
                      <ColorPicker label="Color" value={editColor} onChange={setEditColor} swatchSize="sm" />
                      <div>
                        <span className="block mb-1.5" style={{ fontSize: 11, fontWeight: 500, color: TEXT_MUTED }}>Show on calendars</span>
                        <div className="flex flex-wrap gap-1.5">
                          {calendarContainers.map((cal) => {
                            const checked = editCalendarIds.includes(cal.id);
                            return (
                              <button
                                key={cal.id}
                                type="button"
                                onClick={() => {
                                  setEditCalendarIds((prev) =>
                                    prev.includes(cal.id) ? prev.filter((id) => id !== cal.id) : [...prev, cal.id]
                                  );
                                }}
                                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all"
                                style={{
                                  fontSize: 12,
                                  backgroundColor: checked ? `${cal.color}18` : 'rgba(0,0,0,0.04)',
                                  border: checked ? `1.5px solid ${cal.color}50` : `1px solid ${BORDER}`,
                                  color: checked ? cal.color : TEXT_SECONDARY,
                                  fontWeight: checked ? 500 : 400,
                                }}
                              >
                                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cal.color }} />
                                {cal.name}
                                {checked && <CheckIcon className="h-3 w-3 flex-shrink-0" />}
                              </button>
                            );
                          })}
                        </div>
                        {calendarContainers.length === 0 && (
                          <p style={{ fontSize: 11, color: TEXT_MUTED }}>Add a calendar first.</p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button type="button" onClick={handleSaveEdit} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium" style={{ backgroundColor: PRIMARY, color: '#FFFFFF' }}>
                          <CheckIcon className="h-3 w-3" /> Save
                        </button>
                        <button type="button" onClick={handleCancelEdit} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ backgroundColor: 'rgba(0,0,0,0.07)', color: TEXT_SECONDARY }}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl group"
                      style={{ backgroundColor: 'rgba(0,0,0,0.02)', border: `1px solid ${BORDER}` }}
                    >
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: category.color }} />
                      <div className="flex-1 min-w-0">
                        <span className="block" style={{ fontSize: 13, fontWeight: 500, color: TEXT }}>{category.name}</span>
                        {calNames.length > 0 && (
                          <span style={{ fontSize: 11, color: TEXT_MUTED }}>{calNames.join(', ')}</span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleStartEdit(category.id, category.name, category.color, category)}
                        className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                        style={{ color: TEXT_MUTED }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.07)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                      >
                        <PencilIcon className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(category.id)}
                        className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                        style={{ color: '#C87868' }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(200,120,104,0.10)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                      >
                        <TrashIcon className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

          {/* Tags */}
          {activeTab === 'tags' &&
            tags.map((tag) => (
              <div key={tag.id}>
                {editingId === tag.id ? (
                  <div
                    className="space-y-3 p-3 rounded-xl"
                    style={{ backgroundColor: 'rgba(0,0,0,0.03)', border: `1px solid ${BORDER}` }}
                  >
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      style={inputStyle}
                      placeholder="Tag name"
                      autoFocus
                      onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit()}
                    />
                    <div className="flex gap-2">
                      <button type="button" onClick={handleSaveEdit} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium" style={{ backgroundColor: PRIMARY, color: '#FFFFFF' }}>
                        <CheckIcon className="h-3 w-3" /> Save
                      </button>
                      <button type="button" onClick={handleCancelEdit} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ backgroundColor: 'rgba(0,0,0,0.07)', color: TEXT_SECONDARY }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl group"
                    style={{ backgroundColor: 'rgba(0,0,0,0.02)', border: `1px solid ${BORDER}` }}
                  >
                    <TagIcon className="h-3.5 w-3.5 flex-shrink-0" style={{ color: TEXT_MUTED }} />
                    <span className="flex-1" style={{ fontSize: 13, fontWeight: 500, color: TEXT }}>{tag.name}</span>
                    <button
                      type="button"
                      onClick={() => handleStartEdit(tag.id, tag.name)}
                      className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                      style={{ color: TEXT_MUTED }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.07)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                      <PencilIcon className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(tag.id)}
                      className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                      style={{ color: '#C87868' }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(200,120,104,0.10)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))}

          {/* Add New */}
          {isAdding ? (
            <div
              className="space-y-3 p-3 rounded-xl"
              style={{ border: `1.5px dashed ${PRIMARY}50`, backgroundColor: `${PRIMARY}06` }}
            >
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                style={inputStyle}
                placeholder={`New ${activeTab.slice(0, -1)} name`}
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleSaveAdd()}
              />
              {(activeTab === 'calendars' || activeTab === 'categories') && (
                <ColorPicker label="Color" value={newColor} onChange={setNewColor} swatchSize="sm" />
              )}
              <div className="flex gap-2">
                <button type="button" onClick={handleSaveAdd} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium" style={{ backgroundColor: PRIMARY, color: '#FFFFFF' }}>
                  <PlusIcon className="h-3 w-3" /> Add
                </button>
                <button type="button" onClick={handleCancelEdit} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ backgroundColor: 'rgba(0,0,0,0.07)', color: TEXT_SECONDARY }}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleStartAdd}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl transition-all"
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: TEXT_MUTED,
                border: `1.5px dashed rgba(0,0,0,0.15)`,
                backgroundColor: 'transparent',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = PRIMARY;
                e.currentTarget.style.borderColor = `${PRIMARY}60`;
                e.currentTarget.style.backgroundColor = `${PRIMARY}06`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = TEXT_MUTED;
                e.currentTarget.style.borderColor = 'rgba(0,0,0,0.15)';
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Add {activeTab.slice(0, -1)}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
