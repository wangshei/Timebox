import React, { useState } from 'react';
import {
  PlusIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  PencilIcon,
  TrashIcon,
  EyeIcon,
  EyeSlashIcon,
} from '@heroicons/react/24/solid';
import type { CalendarContainer, Category, Tag, TimeBlock } from '../types';
import type { CalendarContainerVisibility } from '../types';
import { ColorPicker } from './ColorPicker';
import { DEFAULT_PALETTE_COLOR } from '../constants/colors';

interface LeftSidebarProps {
  calendarContainers: CalendarContainer[];
  categories: Category[];
  tags: Tag[];
  timeBlocks: TimeBlock[];
  visibility: CalendarContainerVisibility;
  onToggleVisibility: (containerId: string) => void;
  onUpdateCalendar: (id: string, u: Partial<CalendarContainer>) => void;
  onAddCalendar: (c: Omit<CalendarContainer, 'id'>) => void;
  onDeleteCalendar: (id: string) => void;
  onUpdateCategory: (id: string, u: Partial<Category>) => void;
  onAddCategory: (c: Omit<Category, 'id'>) => void;
  onDeleteCategory: (id: string) => void;
  onUpdateTag: (id: string, u: Partial<Tag>) => void;
  onAddTag: (t: Omit<Tag, 'id'>) => void;
  onDeleteTag: (id: string) => void;
  onFocusCalendar?: (id: string) => void;
  focusedCalendarId?: string | null;
  onFocusCategory?: (id: string) => void;
  endDayLabel?: string;
  onEndDay?: () => void;
  planVsActualSection?: React.ReactNode;
  canEditOrganization?: boolean;
  isShortcutsOpen?: boolean;
  onToggleShortcuts?: () => void;
  isEditMode?: boolean;
}

export function LeftSidebar({
  calendarContainers,
  categories,
  tags,
  timeBlocks,
  visibility,
  onToggleVisibility,
  onUpdateCalendar,
  onAddCalendar,
  onDeleteCalendar,
  onUpdateCategory,
  onAddCategory,
  onDeleteCategory,
  onUpdateTag,
  onAddTag,
  onDeleteTag,
  onFocusCalendar,
  focusedCalendarId = null,
  onFocusCategory,
  endDayLabel,
  onEndDay,
  planVsActualSection,
  canEditOrganization = true,
  isShortcutsOpen = false,
  onToggleShortcuts,
  isEditMode = false,
}: LeftSidebarProps) {
  const [expandedCalendars, setExpandedCalendars] = useState<Set<string>>(new Set(calendarContainers.map((c) => c.id)));
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingType, setEditingType] = useState<'calendar' | 'category' | 'tag' | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState(DEFAULT_PALETTE_COLOR);

  const [isAdding, setIsAdding] = useState(false);
  const [addingType, setAddingType] = useState<'calendar' | 'category' | 'tag' | null>(null);
  const [addingParentId, setAddingParentId] = useState<string | null>(null);
  const [addName, setAddName] = useState('');
  const [addColor, setAddColor] = useState(DEFAULT_PALETTE_COLOR);
  const [addExistingCategoryId, setAddExistingCategoryId] = useState<string | null>(null);
  const [isPlanVsActualOpen, setIsPlanVsActualOpen] = useState(true);

  const toggleExpandCalendar = (id: string) => {
    setExpandedCalendars((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleExpandCategory = (id: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const startEdit = (type: 'calendar' | 'category' | 'tag', item: { id: string; name: string; color?: string }) => {
    setEditingType(type);
    setEditingId(item.id);
    setEditName(item.name);
    setEditColor(item.color ?? DEFAULT_PALETTE_COLOR);
    setIsAdding(false);
  };

  const cancelEdit = () => { setEditingId(null); setEditingType(null); setEditName(''); };

  const saveEdit = () => {
    if (!editingId || !editName.trim()) return;
    if (editingType === 'calendar') onUpdateCalendar(editingId, { name: editName.trim(), color: editColor });
    else if (editingType === 'category') onUpdateCategory(editingId, { name: editName.trim(), color: editColor });
    else if (editingType === 'tag') onUpdateTag(editingId, { name: editName.trim() });
    cancelEdit();
  };

  const startAdd = (type: 'calendar' | 'category' | 'tag', parentId?: string) => {
    setAddingType(type);
    setAddingParentId(parentId ?? null);
    setIsAdding(true);
    setAddName('');
    setAddColor(DEFAULT_PALETTE_COLOR);
    setAddExistingCategoryId(null);
    setEditingId(null);
  };

  const cancelAdd = () => { setIsAdding(false); setAddingType(null); setAddingParentId(null); setAddName(''); setAddExistingCategoryId(null); };

  const saveAdd = () => {
    if (!addName.trim()) return;
    if (addingType === 'calendar') {
      onAddCalendar({ name: addName.trim(), color: addColor });
    } else if (addingType === 'category') {
      if (addingParentId && addExistingCategoryId) {
        onUpdateCategory(addExistingCategoryId, { calendarContainerId: addingParentId });
      } else if (addingParentId) {
        onAddCategory({ name: addName.trim(), color: addColor, calendarContainerId: addingParentId });
      } else {
        onAddCategory({ name: addName.trim(), color: addColor });
      }
    } else if (addingType === 'tag' && addingParentId) {
      onAddTag({ name: addName.trim(), categoryId: addingParentId });
    }
    cancelAdd();
  };

  const handleDelete = (type: 'calendar' | 'category' | 'tag', id: string) => {
    if (type === 'calendar') onDeleteCalendar(id);
    else if (type === 'category') onDeleteCategory(id);
    else onDeleteTag(id);
  };

  // Build sidebar hierarchy from timeBlocks + explicit calendarContainerId
  const categoryIdsByCalendar = new Map<string, Set<string>>();
  const tagIdsByCalendarCategory = new Map<string, Set<string>>();
  timeBlocks.forEach((b) => {
    const calId = b.calendarContainerId;
    const catId = b.categoryId;
    if (!categoryIdsByCalendar.has(calId)) categoryIdsByCalendar.set(calId, new Set());
    categoryIdsByCalendar.get(calId)!.add(catId);
    const key = `${calId}:${catId}`;
    if (!tagIdsByCalendarCategory.has(key)) tagIdsByCalendarCategory.set(key, new Set());
    (b.tagIds ?? []).forEach((tid) => tagIdsByCalendarCategory.get(key)!.add(tid));
  });
  categories.forEach((cat) => {
    if (!cat.calendarContainerId) return;
    if (!categoryIdsByCalendar.has(cat.calendarContainerId)) categoryIdsByCalendar.set(cat.calendarContainerId, new Set());
    categoryIdsByCalendar.get(cat.calendarContainerId)!.add(cat.id);
  });
  const categoriesByCalendar = new Map<string, Category[]>();
  calendarContainers.forEach((cal) => {
    const ids = categoryIdsByCalendar.get(cal.id);
    if (!ids?.size) return;
    const list = [...ids].map((id) => categories.find((c) => c.id === id)).filter(Boolean) as Category[];
    if (list.length) categoriesByCalendar.set(cal.id, list);
  });
  const tagsByCalendarCategory = new Map<string, Tag[]>();
  categoriesByCalendar.forEach((cats, calId) => {
    cats.forEach((cat) => {
      const key = `${calId}:${cat.id}`;
      const idsFromBlocks = tagIdsByCalendarCategory.get(key);
      const tagsFromBlocks = idsFromBlocks?.size ? [...idsFromBlocks].map((id) => tags.find((t) => t.id === id)).filter(Boolean) as Tag[] : [];
      const tagsByCategoryId = tags.filter((t) => t.categoryId === cat.id);
      const seen = new Set<string>();
      const list: Tag[] = [];
      for (const t of [...tagsFromBlocks, ...tagsByCategoryId]) {
        if (!seen.has(t.id)) { seen.add(t.id); list.push(t); }
      }
      if (list.length) tagsByCalendarCategory.set(key, list);
    });
  });

  // Inline edit form — Monet themed
  const InlineEditForm = ({
    name, setName, color, setColor, showColor, onSave, onCancel,
  }: {
    name: string; setName: (v: string) => void;
    color: string; setColor: (v: string) => void;
    showColor: boolean; onSave: () => void; onCancel: () => void;
  }) => (
    <div className="rounded-xl p-3 space-y-2" style={{ backgroundColor: 'rgba(74,128,240,0.07)', border: '1px solid rgba(74,128,240,0.18)' }}>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); onSave(); }
          if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
        }}
        className="w-full px-2.5 py-1.5 text-sm rounded-lg focus:outline-none"
        style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.09)', color: '#1C1C1E' }}
        autoFocus
      />
      {showColor && <ColorPicker value={color} onChange={setColor} swatchSize="sm" />}
      <div className="flex gap-2">
        <button type="button" onClick={onSave} className="flex-1 px-3 py-1.5 text-xs font-semibold rounded-lg text-white transition-colors" style={{ backgroundColor: '#4A80F0' }}>
          Save
        </button>
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors" style={{ backgroundColor: 'rgba(0,0,0,0.06)', color: '#636366' }}>
          Cancel
        </button>
      </div>
    </div>
  );

  const iconBtn = (onClick: () => void, icon: React.ReactNode, color: string, bg: string) => (
    <button type="button" onClick={onClick} className="p-1 rounded-md transition-colors flex-shrink-0"
      style={{ color, backgroundColor: 'transparent' }}
      onMouseEnter={e => (e.currentTarget.style.backgroundColor = bg)}
      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
    >
      {icon}
    </button>
  );

  return (
    <div className="flex flex-col flex-1 min-h-0 pb-4" style={{ backgroundColor: '#EFEFE9' }}>
      {/* Add calendar */}
      <div className="px-4 pt-3 pb-1 flex-shrink-0">
        <button
          type="button"
          onClick={() => startAdd('calendar')}
          className="text-xs font-semibold flex items-center gap-1.5 py-1.5 px-0 transition-colors"
          style={{ color: '#8E8E93'}}
          onMouseEnter={e => (e.currentTarget.style.color = '#4A80F0')}
          onMouseLeave={e => (e.currentTarget.style.color = '#8E8E93')}
        >
          <PlusIcon className="h-3.5 w-3.5" />
          Add calendar
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-2 space-y-1.5">
        {/* Global add forms */}
        {isAdding && addingType === 'calendar' && (
          <InlineEditForm name={addName} setName={setAddName} color={addColor} setColor={setAddColor} showColor onSave={saveAdd} onCancel={cancelAdd} />
        )}
        {isAdding && addingType === 'category' && !addingParentId && (
          <InlineEditForm name={addName} setName={setAddName} color={addColor} setColor={setAddColor} showColor onSave={saveAdd} onCancel={cancelAdd} />
        )}

        {calendarContainers.map((calendar) => {
          const isFocused = focusedCalendarId === calendar.id;
          const isVisible = visibility[calendar.id] ?? true;
          const isExpanded = expandedCalendars.has(calendar.id);

          return (
            <div
              key={calendar.id}
              className="rounded-xl overflow-hidden"
              style={{
                backgroundColor: isFocused ? `${calendar.color}14` : 'rgba(255,255,255,0.55)',
                border: isFocused ? `1.5px solid ${calendar.color}40` : '1px solid rgba(0,0,0,0.08)',
                boxShadow: isFocused ? `0 0 0 1px ${calendar.color}20` : 'none',
              }}
            >
              {editingId === calendar.id && editingType === 'calendar' ? (
                <div className="p-2">
                  <InlineEditForm name={editName} setName={setEditName} color={editColor} setColor={setEditColor} showColor onSave={saveEdit} onCancel={cancelEdit} />
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-2.5 py-2 group">
                  {/* Expand chevron */}
                  <button
                    type="button"
                    onClick={() => toggleExpandCalendar(calendar.id)}
                    className="p-0.5 rounded transition-colors flex-shrink-0"
                    style={{ color: '#8E8E93'}}
                  >
                    {isExpanded
                      ? <ChevronDownIcon className="h-3 w-3" />
                      : <ChevronRightIcon className="h-3 w-3" />}
                  </button>

                  {/* Calendar color badge + name */}
                  <button
                    type="button"
                    onClick={() => onFocusCalendar?.(calendar.id)}
                    className="flex-1 flex items-center gap-2 text-left min-w-0"
                  >
                    {/* Color square — distinct from category dots */}
                    <span
                      className="flex-shrink-0 w-3.5 h-3.5 rounded-[3px]"
                      style={{ backgroundColor: calendar.color, opacity: isVisible ? 1 : 0.35 }}
                    />
                    <span
                      className="text-xs font-bold truncate"
                      style={{
                        color: isFocused ? calendar.color : '#3A3028',
                        opacity: isVisible ? 1 : 0.45,
                        letterSpacing: '0.01em',
                      }}
                    >
                      {calendar.name}
                    </span>
                  </button>

                  {/* Edit mode actions */}
                  {isEditMode && (
                    <div className="flex gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      {iconBtn(() => startEdit('calendar', calendar), <PencilIcon className="h-3 w-3" />, '#4A80F0', 'rgba(74,128,240,0.10)')}
                      {iconBtn(() => handleDelete('calendar', calendar.id), <TrashIcon className="h-3 w-3" />, '#B85050', 'rgba(255,59,48,0.08)')}
                    </div>
                  )}

                  {/* Visibility toggle */}
                  {!isEditMode && (
                    <button
                      type="button"
                      onClick={() => onToggleVisibility(calendar.id)}
                      className="flex-shrink-0 p-1 rounded-md opacity-0 group-hover:opacity-100 transition-all"
                      style={{ color: isVisible ? calendar.color : '#8E8E93' }}
                      title={isVisible ? 'Hide' : 'Show'}
                    >
                      {isVisible
                        ? <EyeIcon className="h-3.5 w-3.5" />
                        : <EyeSlashIcon className="h-3.5 w-3.5" />}
                    </button>
                  )}
                </div>
              )}

              {/* Expanded: categories */}
              {isExpanded && (
                <div className="pb-1.5">
                  {(categoriesByCalendar.get(calendar.id) ?? []).map((category) => {
                    const catExpanded = expandedCategories.has(category.id);
                    const categoryTags = tagsByCalendarCategory.get(`${calendar.id}:${category.id}`) ?? [];

                    return (
                      <div key={category.id} className="ml-6 mr-2">
                        {editingId === category.id && editingType === 'category' ? (
                          <InlineEditForm name={editName} setName={setEditName} color={editColor} setColor={setEditColor} showColor onSave={saveEdit} onCancel={cancelEdit} />
                        ) : (
                          <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg group transition-colors"
                            style={{ ':hover': { backgroundColor: 'rgba(0,0,0,0.03)' } } as any}
                            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.03)')}
                            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                          >
                            <button
                              type="button"
                              onClick={() => toggleExpandCategory(category.id)}
                              className="p-0.5 rounded flex-shrink-0"
                              style={{ color: '#8E8E93'}}
                            >
                              {catExpanded
                                ? <ChevronDownIcon className="h-3 w-3" />
                                : <ChevronRightIcon className="h-3 w-3" />}
                            </button>

                            {/* Category pill */}
                            <button
                              type="button"
                              onClick={() => onFocusCategory?.(category.id)}
                              className="flex-1 flex items-center gap-1.5 text-left min-w-0"
                            >
                              {/* Round dot — distinct from calendar square */}
                              <span
                                className="flex-shrink-0 w-2.5 h-2.5 rounded-full"
                                style={{ backgroundColor: category.color }}
                              />
                              <span className="text-xs font-medium truncate" style={{ color: '#3A3A3C' }}>
                                {category.name}
                              </span>
                            </button>

                            {isEditMode && (
                              <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                {iconBtn(() => startEdit('category', category), <PencilIcon className="h-2.5 w-2.5" />, '#4A80F0', 'rgba(74,128,240,0.10)')}
                                {iconBtn(() => handleDelete('category', category.id), <TrashIcon className="h-2.5 w-2.5" />, '#B85050', 'rgba(255,59,48,0.08)')}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Expanded: tags */}
                        {catExpanded && (
                          <div className="ml-6 mt-0.5 pb-1 space-y-0.5">
                            <div className="flex flex-wrap gap-1 py-1">
                              {categoryTags.map((tag) =>
                                editingId === tag.id && editingType === 'tag' ? (
                                  <div key={tag.id} className="w-full">
                                    <div className="rounded-xl p-2 space-y-2" style={{ backgroundColor: 'rgba(74,128,240,0.07)', border: '1px solid rgba(74,128,240,0.18)' }}>
                                      <input
                                        type="text"
                                        value={editName}
                                        onChange={(e) => setEditName(e.target.value)}
                                        className="w-full px-2 py-1 text-xs rounded-lg focus:outline-none"
                                        style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.09)', color: '#1C1C1E' }}
                                        autoFocus
                                      />
                                      <div className="flex gap-1.5">
                                        <button type="button" onClick={saveEdit} className="flex-1 px-2 py-1 text-xs font-semibold rounded-lg text-white" style={{ backgroundColor: '#4A80F0' }}>Save</button>
                                        <button type="button" onClick={cancelEdit} className="px-2 py-1 text-xs rounded-lg" style={{ backgroundColor: 'rgba(0,0,0,0.06)', color: '#636366' }}>×</button>
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <div key={tag.id} className="group/tag flex items-center gap-0.5">
                                    {/* Tag chip — pill with category color border */}
                                    <span
                                      className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full cursor-default"
                                      style={{
                                        color: category.color,
                                        backgroundColor: `${category.color}12`,
                                        border: `1px solid ${category.color}30`,
                                      }}
                                    >
                                      {tag.name}
                                    </span>
                                    {isEditMode && (
                                      <div className="flex opacity-0 group-hover/tag:opacity-100 transition-opacity">
                                        {iconBtn(() => startEdit('tag', tag), <PencilIcon className="h-2.5 w-2.5" />, '#4A80F0', 'rgba(74,128,240,0.10)')}
                                        {iconBtn(() => handleDelete('tag', tag.id), <TrashIcon className="h-2.5 w-2.5" />, '#B85050', 'rgba(255,59,48,0.08)')}
                                      </div>
                                    )}
                                  </div>
                                )
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => startAdd('tag', category.id)}
                              className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full transition-colors"
                              style={{ color: '#8E8E93', border: '1px dashed rgba(0,0,0,0.12)' }}
                              onMouseEnter={e => { (e.currentTarget.style.color = category.color); (e.currentTarget.style.borderColor = category.color); }}
                              onMouseLeave={e => { (e.currentTarget.style.color = '#8E8E93'); (e.currentTarget.style.borderColor = 'rgba(0,0,0,0.12)'); }}
                            >
                              <PlusIcon className="h-2.5 w-2.5" /> tag
                            </button>
                            {isAdding && addingType === 'tag' && addingParentId === category.id && (
                              <div className="w-full mt-1">
                                <div className="rounded-xl p-2 space-y-1.5" style={{ backgroundColor: 'rgba(74,128,240,0.07)', border: '1px solid rgba(74,128,240,0.18)' }}>
                                  <input
                                    type="text"
                                    value={addName}
                                    onChange={(e) => setAddName(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') { e.preventDefault(); saveAdd(); }
                                      if (e.key === 'Escape') { e.preventDefault(); cancelAdd(); }
                                    }}
                                    placeholder="Tag name"
                                    className="w-full px-2 py-1 text-xs rounded-lg focus:outline-none"
                                    style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.09)', color: '#1C1C1E' }}
                                    autoFocus
                                  />
                                  <div className="flex gap-1.5">
                                    <button type="button" onClick={saveAdd} className="flex-1 px-2 py-1 text-xs font-semibold rounded-lg text-white" style={{ backgroundColor: '#4A80F0' }}>Add</button>
                                    <button type="button" onClick={cancelAdd} className="px-2 py-1 text-xs rounded-lg" style={{ backgroundColor: 'rgba(0,0,0,0.06)', color: '#636366' }}>×</button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Add category button */}
                  <div className="ml-6 mr-2 mt-1">
                    <button
                      type="button"
                      onClick={() => startAdd('category', calendar.id)}
                      className="flex items-center gap-1.5 text-[10px] font-medium px-2 py-1 rounded-full transition-colors"
                      style={{ color: '#8E8E93', border: '1px dashed rgba(0,0,0,0.12)' }}
                      onMouseEnter={e => { (e.currentTarget.style.color = calendar.color); (e.currentTarget.style.borderColor = calendar.color); }}
                      onMouseLeave={e => { (e.currentTarget.style.color = '#8E8E93'); (e.currentTarget.style.borderColor = 'rgba(0,0,0,0.12)'); }}
                    >
                      <PlusIcon className="h-2.5 w-2.5" /> category
                    </button>
                    {isAdding && addingType === 'category' && addingParentId === calendar.id && (
                      <div className="mt-2 rounded-xl p-3 space-y-3" style={{ backgroundColor: 'rgba(74,128,240,0.07)', border: '1px solid rgba(74,128,240,0.18)' }}>
                        <p className="text-[10px] font-semibold" style={{ color: '#636366' }}>Attach or create category</p>
                        <div className="flex flex-wrap gap-1">
                          {categories.map((cat) => (
                            <button
                              key={cat.id}
                              type="button"
                              onClick={() => { setAddExistingCategoryId(cat.id); setAddName(cat.name); setAddColor(cat.color); }}
                              className="px-2 py-0.5 rounded-full text-[10px] font-medium transition-all"
                              style={addExistingCategoryId === cat.id
                                ? { backgroundColor: `${cat.color}18`, color: cat.color, border: `1.5px solid ${cat.color}` }
                                : { backgroundColor: 'transparent', color: '#636366', border: '1.5px solid rgba(0,0,0,0.10)' }}
                            >
                              {cat.name}
                            </button>
                          ))}
                        </div>
                        <InlineEditForm name={addName} setName={setAddName} color={addColor} setColor={setAddColor} showColor onSave={saveAdd} onCancel={cancelAdd} />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Plan vs Actual section */}
      {planVsActualSection && (
        <div className="flex-shrink-0" style={{ borderTop: '1px solid rgba(0,0,0,0.09)' }}>
          <div className="flex items-center justify-between gap-2 px-4 py-2.5">
            <span className="text-[9px] font-bold tracking-widest uppercase" style={{ color: '#8E8E93'}}>
              Plan vs Actual
            </span>
            <button
              type="button"
              onClick={() => setIsPlanVsActualOpen(!isPlanVsActualOpen)}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: '#8E8E93'}}
              title={isPlanVsActualOpen ? 'Hide' : 'Show'}
            >
              {isPlanVsActualOpen ? <EyeSlashIcon className="h-3.5 w-3.5" /> : <EyeIcon className="h-3.5 w-3.5" />}
            </button>
          </div>
          {isPlanVsActualOpen && (
            <div className="px-4 pb-4">
              {planVsActualSection}
            </div>
          )}
        </div>
      )}

      {/* End Day button */}
      {onEndDay && endDayLabel && (
        <div className="flex-shrink-0 px-4 py-2" style={{ borderTop: '1px solid rgba(0,0,0,0.09)' }}>
          <button
            type="button"
            onClick={onEndDay}
            className="w-full text-left px-3 py-1.5 text-xs font-medium rounded-lg transition-colors"
            style={{ color: '#8E8E93'}}
            onMouseEnter={e => { (e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)'); (e.currentTarget.style.color = '#636366'); }}
            onMouseLeave={e => { (e.currentTarget.style.backgroundColor = 'transparent'); (e.currentTarget.style.color = '#8E8E93'); }}
          >
            {endDayLabel}
          </button>
        </div>
      )}

      {/* Keyboard shortcuts */}
      {onToggleShortcuts && (
        <>
          <div className="flex-shrink-0 px-4 py-2" style={{ borderTop: '1px solid rgba(0,0,0,0.09)' }}>
            <button
              type="button"
              onClick={onToggleShortcuts}
              className="w-full flex items-center justify-between px-2 py-1.5 text-[10px] font-medium rounded-lg transition-colors"
              style={{ color: '#8E8E93'}}
              onMouseEnter={e => { (e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)'); (e.currentTarget.style.color = '#636366'); }}
              onMouseLeave={e => { (e.currentTarget.style.backgroundColor = 'transparent'); (e.currentTarget.style.color = '#8E8E93'); }}
            >
              <span>Keyboard shortcuts</span>
              <span className="inline-flex items-center justify-center w-5 h-5 text-[10px] rounded-md font-bold" style={{ border: '1.5px solid rgba(0,0,0,0.12)', color: '#8E8E93'}}>?</span>
            </button>
          </div>
          {isShortcutsOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={onToggleShortcuts} aria-hidden />
              <div className="fixed bottom-16 left-4 z-50 w-56 rounded-xl py-2 px-3" style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.09)', boxShadow: '0 8px 24px rgba(0,0,0,0.10)' }}>
                <p className="text-[9px] font-bold tracking-widest uppercase mb-2" style={{ color: '#8E8E93'}}>Shortcuts</p>
                <div className="space-y-1.5 text-xs" style={{ color: '#636366' }}>
                  {[['3', '3-Day view'], ['d', 'Day view'], ['w', 'Week view'], ['m', 'Month view'], ['c', 'Compare plan vs actual'], ['a', 'Show all calendars']].map(([key, label]) => (
                    <div key={key} className="flex justify-between gap-4">
                      <kbd className="font-mono text-[10px] px-1.5 py-0.5 rounded-md" style={{ backgroundColor: 'rgba(0,0,0,0.07)', border: '1px solid rgba(0,0,0,0.09)', color: '#3A3A3C' }}>{key}</kbd>
                      <span>{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
