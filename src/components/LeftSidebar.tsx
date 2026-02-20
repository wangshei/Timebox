import React, { useState } from 'react';
import {
  CalendarIcon,
  TagIcon,
  FolderIcon,
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
  /** Time blocks used to derive sidebar hierarchy (view only: which categories/tags appear under each calendar). */
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
  /** When set, the calendar with this id is shown as selected (e.g. light gray background). */
  focusedCalendarId?: string | null;
  onFocusCategory?: (id: string) => void;
  endDayLabel?: string;
  onEndDay?: () => void;
  planVsActualSection?: React.ReactNode;
  /** Whether inline edit mode is allowed (e.g. only when there is data to edit). */
  canEditOrganization?: boolean;
  /** Shortcuts popup state, controlled by parent. */
  isShortcutsOpen?: boolean;
  onToggleShortcuts?: () => void;
  /** Edit mode state, controlled by parent header. */
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
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleExpandCategory = (id: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
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

  const cancelEdit = () => {
    setEditingId(null);
    setEditingType(null);
    setEditName('');
  };

  const saveEdit = () => {
    if (!editingId || !editName.trim()) return;
    if (editingType === 'calendar') {
      onUpdateCalendar(editingId, { name: editName.trim(), color: editColor });
    } else if (editingType === 'category') {
      onUpdateCategory(editingId, { name: editName.trim(), color: editColor });
    } else if (editingType === 'tag') {
      onUpdateTag(editingId, { name: editName.trim() });
    }
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

  const cancelAdd = () => {
    setIsAdding(false);
    setAddingType(null);
    setAddingParentId(null);
    setAddName('');
    setAddExistingCategoryId(null);
  };

  const saveAdd = () => {
    if (!addName.trim()) return;
    if (addingType === 'calendar') {
      onAddCalendar({ name: addName.trim(), color: addColor });
    } else if (addingType === 'category') {
      if (addingParentId && addExistingCategoryId) {
        // Attach an existing category to this calendar (via calendarContainerId)
        onUpdateCategory(addExistingCategoryId, { calendarContainerId: addingParentId });
      } else if (addingParentId) {
        // Create a new category already associated with this calendar
        onAddCategory({ name: addName.trim(), color: addColor, calendarContainerId: addingParentId });
      } else {
        // Global category (no specific calendar yet)
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

  // Sidebar hierarchy is a VIEW: derive from timeBlocks, plus any categories explicitly associated to a calendar.
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

  // Also include categories that have an explicit calendarContainerId, even if no blocks yet
  categories.forEach((cat) => {
    if (!cat.calendarContainerId) return;
    if (!categoryIdsByCalendar.has(cat.calendarContainerId)) {
      categoryIdsByCalendar.set(cat.calendarContainerId, new Set());
    }
    categoryIdsByCalendar.get(cat.calendarContainerId)!.add(cat.id);
  });
  const categoriesByCalendar = new Map<string, Category[]>();
  calendarContainers.forEach((cal) => {
    const ids = categoryIdsByCalendar.get(cal.id);
    if (!ids?.size) return;
    const list = [...ids].map((id) => categories.find((c) => c.id === id)).filter(Boolean) as Category[];
    if (list.length) categoriesByCalendar.set(cal.id, list);
  });
  // Show tags that (1) appear in time blocks for this calendar:category, OR (2) belong to this category by categoryId (so newly added tags appear immediately)
  const tagsByCalendarCategory = new Map<string, Tag[]>();
  categoriesByCalendar.forEach((cats, calId) => {
    cats.forEach((cat) => {
      const key = `${calId}:${cat.id}`;
      const idsFromBlocks = tagIdsByCalendarCategory.get(key);
      const tagsFromBlocks = idsFromBlocks?.size
        ? [...idsFromBlocks].map((id) => tags.find((t) => t.id === id)).filter(Boolean) as Tag[]
        : [];
      const tagsByCategoryId = tags.filter((t) => t.categoryId === cat.id);
      const seen = new Set<string>();
      const list: Tag[] = [];
      for (const t of tagsFromBlocks) {
        if (!seen.has(t.id)) {
          seen.add(t.id);
          list.push(t);
        }
      }
      for (const t of tagsByCategoryId) {
        if (!seen.has(t.id)) {
          seen.add(t.id);
          list.push(t);
        }
      }
      if (list.length) tagsByCalendarCategory.set(key, list);
    });
  });

  const InlineEditForm = ({
    name,
    setName,
    color,
    setColor,
    showColor,
    onSave,
    onCancel,
  }: {
    name: string;
    setName: (v: string) => void;
    color: string;
    setColor: (v: string) => void;
    showColor: boolean;
    onSave: () => void;
    onCancel: () => void;
  }) => (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); onSave(); }
          if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
        }}
        className="w-full px-2 py-1.5 text-sm bg-white border border-neutral-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        autoFocus
      />
      {showColor && (
        <ColorPicker value={color} onChange={setColor} swatchSize="sm" />
      )}
      <div className="flex gap-2">
        <button type="button" onClick={onSave} className="flex-1 px-3 py-1.5 bg-[#0044A8] text-white text-sm rounded hover:bg-[#003380] transition-colors">
          Save
        </button>
        <button type="button" onClick={onCancel} className="px-3 py-1.5 bg-neutral-200 text-neutral-700 text-sm rounded hover:bg-neutral-300 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col flex-1 min-h-0 pb-4">
      {/* Add calendar link */}
      <div className="px-4 pt-2 pb-1 flex-shrink-0">
        <button
          type="button"
          onClick={() => startAdd('calendar')}
          className="text-xs font-medium text-neutral-600 hover:text-[#0044A8] transition-colors flex items-center gap-1.5 py-1.5 px-0"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          Add calendar
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-2">
        {/* Add Calendar / Add Category forms (global) */}
        {isAdding && addingType === 'calendar' && (
          <InlineEditForm
            name={addName}
            setName={setAddName}
            color={addColor}
            setColor={setAddColor}
            showColor
            onSave={saveAdd}
            onCancel={cancelAdd}
          />
        )}
        {isAdding && addingType === 'category' && !addingParentId && (
          <InlineEditForm
            name={addName}
            setName={setAddName}
            color={addColor}
            setColor={setAddColor}
            showColor
            onSave={saveAdd}
            onCancel={cancelAdd}
          />
        )}

        {calendarContainers.map((calendar) => (
          <div
            key={calendar.id}
            className={`rounded-lg pb-1 ${focusedCalendarId === calendar.id ? 'bg-neutral-200/80' : 'bg-neutral-50/60'}`}
          >
            {editingId === calendar.id && editingType === 'calendar' ? (
              <InlineEditForm
                name={editName}
                setName={setEditName}
                color={editColor}
                setColor={setEditColor}
                showColor
                onSave={saveEdit}
                onCancel={cancelEdit}
              />
            ) : (
              <div className={`group flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors ${focusedCalendarId === calendar.id ? 'bg-neutral-300/50 hover:bg-neutral-300/70' : 'hover:bg-neutral-50'}`}>
                <button
                  type="button"
                  onClick={() => toggleExpandCalendar(calendar.id)}
                  className="p-0.5 hover:bg-neutral-200 rounded transition-colors"
                >
                  {expandedCalendars.has(calendar.id) ? (
                    <ChevronDownIcon className="h-3.5 w-3.5 text-neutral-500" />
                  ) : (
                    <ChevronRightIcon className="h-3.5 w-3.5 text-neutral-500" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => onFocusCalendar?.(calendar.id)}
                  className="flex-1 flex items-center gap-1.5 text-left min-w-0"
                >
                  <CalendarIcon className="h-4 w-4 text-neutral-400 flex-shrink-0" />
                  <span className="text-sm font-bold truncate" style={{ color: calendar.color }}>
                    {calendar.name}
                  </span>
                </button>
                {!isEditMode && (
                  <input
                    type="checkbox"
                    checked={visibility[calendar.id] ?? true}
                    onChange={() => onToggleVisibility(calendar.id)}
                    className="w-3.5 h-3.5 rounded cursor-pointer flex-shrink-0 ml-auto"
                    style={{ accentColor: calendar.color }}
                  />
                )}
                {isEditMode && (
                  <div className="flex gap-1 flex-shrink-0 items-center">
                    <button
                      type="button"
                      onClick={() => startEdit('calendar', calendar)}
                      className="p-1 hover:bg-blue-100 rounded transition-colors"
                      title="Edit calendar"
                    >
                      <PencilIcon className="h-3.5 w-3.5 text-blue-600" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete('calendar', calendar.id)}
                      className="p-1 hover:bg-red-100 rounded transition-colors"
                      title="Delete"
                    >
                      <TrashIcon className="h-3.5 w-3.5 text-red-600" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {expandedCalendars.has(calendar.id) && (
              <div className="ml-10 mt-1 space-y-1">
                {(categoriesByCalendar.get(calendar.id) ?? []).map((category) => (
                  <div key={category.id}>
                    {editingId === category.id && editingType === 'category' ? (
                      <InlineEditForm
                        name={editName}
                        setName={setEditName}
                        color={editColor}
                        setColor={setEditColor}
                        showColor
                        onSave={saveEdit}
                        onCancel={cancelEdit}
                      />
                    ) : (
                      <div className="group flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-neutral-50 transition-colors">
                        <button
                          type="button"
                          onClick={() => toggleExpandCategory(category.id)}
                          className="p-0.5 hover:bg-neutral-200 rounded transition-colors"
                        >
                          {expandedCategories.has(category.id) ? (
                            <ChevronDownIcon className="h-3.5 w-3.5 text-neutral-500" />
                          ) : (
                            <ChevronRightIcon className="h-3.5 w-3.5 text-neutral-500" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => onFocusCategory?.(category.id)}
                          className="flex-1 flex items-center gap-1.5 text-left min-w-0"
                        >
                          <FolderIcon className="h-4 w-4 text-neutral-400 flex-shrink-0" />
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: category.color }} />
                          <span className="text-sm text-neutral-700 truncate">{category.name}</span>
                        </button>
                        {isEditMode && (
                          <div className="flex gap-1 flex-shrink-0">
                            <button
                              type="button"
                              onClick={() => startEdit('category', category)}
                              className="p-1 hover:bg-blue-100 rounded transition-colors"
                              title="Edit"
                            >
                              <PencilIcon className="h-3.5 w-3.5 text-blue-600" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete('category', category.id)}
                              className="p-1 hover:bg-red-100 rounded transition-colors"
                              title="Delete"
                            >
                              <TrashIcon className="h-3.5 w-3.5 text-red-600" />
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {expandedCategories.has(category.id) && (
                      <div className="ml-8 mt-1 space-y-1">
                        {(tagsByCalendarCategory.get(`${calendar.id}:${category.id}`) ?? []).map((tag) =>
                          editingId === tag.id && editingType === 'tag' ? (
                            <div key={tag.id} className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
                              <input
                                type="text"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="w-full px-2 py-1.5 text-sm bg-white border border-neutral-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                autoFocus
                              />
                              <div className="flex gap-2">
                                <button type="button" onClick={saveEdit} className="flex-1 px-3 py-1.5 bg-[#0044A8] text-white text-sm rounded hover:bg-[#003380] transition-colors">
                                  Save
                                </button>
                                <button type="button" onClick={cancelEdit} className="px-3 py-1.5 bg-neutral-200 text-neutral-700 text-sm rounded hover:bg-neutral-300 transition-colors">
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div key={tag.id} className="group flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-neutral-50 transition-colors">
                              <span className="w-3.5 flex-shrink-0" />
                              <TagIcon className="h-3.5 w-3.5 text-neutral-400 flex-shrink-0" />
                              <span className="flex-1 text-sm text-neutral-600 truncate min-w-0">{tag.name}</span>
                              {isEditMode && (
                                <div className="flex gap-1 flex-shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => startEdit('tag', tag)}
                                    className="p-1 hover:bg-blue-100 rounded transition-colors"
                                    title="Edit"
                                  >
                                    <PencilIcon className="h-3.5 w-3.5 text-blue-600" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDelete('tag', tag.id)}
                                    className="p-1 hover:bg-red-100 rounded transition-colors"
                                    title="Delete"
                                  >
                                    <TrashIcon className="h-3.5 w-3.5 text-red-600" />
                                  </button>
                                </div>
                              )}
                            </div>
                          )
                        )}
                        <button
                          type="button"
                          onClick={() => startAdd('tag', category.id)}
                          className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-neutral-500 hover:text-[#0044A8] hover:bg-neutral-50 rounded-lg transition-colors"
                        >
                          <PlusIcon className="h-3 w-3" />
                          Add Tag
                        </button>
                        {isAdding && addingType === 'tag' && addingParentId === category.id && (
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
                            <input
                              type="text"
                              value={addName}
                              onChange={(e) => setAddName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') { e.preventDefault(); saveAdd(); }
                                if (e.key === 'Escape') { e.preventDefault(); cancelAdd(); }
                              }}
                              placeholder="Tag name"
                              className="w-full px-2 py-1.5 text-sm bg-white border border-neutral-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                              autoFocus
                            />
                            <div className="flex gap-2">
                              <button type="button" onClick={saveAdd} className="flex-1 px-3 py-1.5 bg-[#0044A8] text-white text-sm rounded hover:bg-[#003380] transition-colors">
                                Save
                              </button>
                              <button type="button" onClick={cancelAdd} className="px-3 py-1.5 bg-neutral-200 text-neutral-700 text-sm rounded hover:bg-neutral-300 transition-colors">
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => startAdd('category', calendar.id)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-neutral-500 hover:text-[#0044A8] hover:bg-neutral-50 rounded-lg transition-colors"
                >
                  <PlusIcon className="h-3 w-3" />
                  Add Category
                </button>
                {isAdding && addingType === 'category' && addingParentId === calendar.id && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-3">
                    <p className="text-xs font-medium text-neutral-600">Add or attach a category</p>
                    <div className="flex flex-wrap gap-1">
                      {categories.map((cat) => (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => {
                            setAddExistingCategoryId(cat.id);
                            setAddName(cat.name);
                            setAddColor(cat.color);
                          }}
                          className={`px-2 py-1 rounded-md border text-xs ${
                            addExistingCategoryId === cat.id
                              ? 'border-blue-500 bg-blue-50 text-blue-700'
                              : 'border-neutral-200 text-neutral-600 hover:border-neutral-300'
                          }`}
                        >
                          {cat.name}
                        </button>
                      ))}
                    </div>
                    <InlineEditForm
                      name={addName}
                      setName={setAddName}
                      color={addColor}
                      setColor={setAddColor}
                      showColor
                      onSave={saveAdd}
                      onCancel={cancelAdd}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {planVsActualSection && (
        <div className="flex-shrink-0 border-t border-neutral-100">
          {/* Header: label left, eye right (same structure as Organization) */}
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-transparent">
            <span className="text-[8px] font-medium text-neutral-500 tracking-wide">
              Plan vs Actual
            </span>
            <button
              type="button"
              onClick={() => setIsPlanVsActualOpen(!isPlanVsActualOpen)}
              className="p-2 rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 transition-colors"
              title={isPlanVsActualOpen ? 'Hide' : 'Show'}
              aria-label={isPlanVsActualOpen ? 'Hide Plan vs Actual' : 'Show Plan vs Actual'}
            >
              {isPlanVsActualOpen ? (
                <EyeSlashIcon className="h-4 w-4" />
              ) : (
                <EyeIcon className="h-4 w-4" />
              )}
            </button>
          </div>
          {isPlanVsActualOpen && (
            <div className="px-4 pb-4">
              {planVsActualSection}
            </div>
          )}
        </div>
      )}


      {onEndDay && endDayLabel && (
        <div className="flex-shrink-0 px-4 py-2 border-t border-neutral-100">
          <button
            type="button"
            onClick={onEndDay}
            className="w-full text-left px-2 py-1.5 text-xs text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50 rounded transition-colors"
          >
            {endDayLabel}
          </button>
        </div>
      )}

      {/* Shortcuts trigger at very bottom */}
      {onToggleShortcuts && (
        <>
          <div className="flex-shrink-0 px-4 py-2 border-t border-neutral-100">
            <button
              type="button"
              onClick={onToggleShortcuts}
              className="w-full flex items-center justify-between px-2 py-1.5 text-[10px] font-medium text-neutral-500 hover:text-neutral-800 hover:bg-neutral-50 rounded transition-colors"
            >
              <span>Keyboard shortcuts</span>
              <span className="inline-flex items-center justify-center w-5 h-5 text-[10px] rounded border border-neutral-300 bg-neutral-50">
                ?
              </span>
            </button>
          </div>
          {isShortcutsOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={onToggleShortcuts}
                aria-hidden
              />
              <div className="fixed bottom-16 left-4 z-50 w-56 rounded-lg border border-neutral-200 bg-white shadow-lg py-2 px-3">
                <p className="text-[10px] font-medium text-neutral-500 uppercase tracking-wide mb-2">
                  Shortcuts
                </p>
                <div className="space-y-1.5 text-xs text-neutral-700">
                  <div className="flex justify-between gap-4">
                    <kbd className="font-mono bg-neutral-100 px-1.5 py-0.5 rounded">
                      d
                    </kbd>
                    <span>Day view</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <kbd className="font-mono bg-neutral-100 px-1.5 py-0.5 rounded">
                      w
                    </kbd>
                    <span>Week view</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <kbd className="font-mono bg-neutral-100 px-1.5 py-0.5 rounded">
                      m
                    </kbd>
                    <span>Month view</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <kbd className="font-mono bg-neutral-100 px-1.5 py-0.5 rounded">
                      p
                    </kbd>
                    <span>Plan mode</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <kbd className="font-mono bg-neutral-100 px-1.5 py-0.5 rounded">
                      r
                    </kbd>
                    <span>Record mode</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <kbd className="font-mono bg-neutral-100 px-1.5 py-0.5 rounded">
                      a
                    </kbd>
                    <span>Show all calendars</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
