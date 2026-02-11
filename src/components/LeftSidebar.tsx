import React, { useState } from 'react';
import {
  Calendar as CalendarIcon,
  Tag as TagIcon,
  FolderKanban,
  Plus,
  Check,
  ChevronRight,
  ChevronDown,
  Pencil,
  Trash2,
} from 'lucide-react';
import type { CalendarContainer, Category, Tag, TimeBlock } from '../types';
import type { CalendarContainerVisibility } from '../types';

const COLOR_OPTIONS = [
  '#0044A8',
  '#9F5FB0',
  '#13B49F',
  '#EC8309',
  '#D93D3D',
  '#E85C8B',
  '#8B7355',
  '#5B5B5B',
  '#7FB800',
  '#E6B800',
];

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
  onFocusCategory?: (id: string) => void;
  endDayLabel?: string;
  onEndDay?: () => void;
  planVsActualSection?: React.ReactNode;
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
  onFocusCategory,
  endDayLabel,
  onEndDay,
  planVsActualSection,
}: LeftSidebarProps) {
  const [expandedCalendars, setExpandedCalendars] = useState<Set<string>>(new Set(calendarContainers.map((c) => c.id)));
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [isEditMode, setIsEditMode] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingType, setEditingType] = useState<'calendar' | 'category' | 'tag' | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('#0044A8');

  const [isAdding, setIsAdding] = useState(false);
  const [addingType, setAddingType] = useState<'calendar' | 'category' | 'tag' | null>(null);
  const [addingParentId, setAddingParentId] = useState<string | null>(null);
  const [addName, setAddName] = useState('');
  const [addColor, setAddColor] = useState('#0044A8');

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
    setEditColor(item.color ?? '#0044A8');
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
    setAddColor('#0044A8');
    setEditingId(null);
  };

  const cancelAdd = () => {
    setIsAdding(false);
    setAddingType(null);
    setAddingParentId(null);
    setAddName('');
  };

  const saveAdd = () => {
    if (!addName.trim()) return;
    if (addingType === 'calendar') {
      onAddCalendar({ name: addName.trim(), color: addColor });
    } else if (addingType === 'category') {
      // Categories are global; they appear under a calendar when blocks use that calendar+category
      onAddCategory({ name: addName.trim(), color: addColor });
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

  // Sidebar hierarchy is a VIEW: derive from timeBlocks. Categories/tags are global; we show them under a calendar only when blocks exist for that calendar (+ category/tag).
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
      const ids = tagIdsByCalendarCategory.get(key);
      if (!ids?.size) return;
      const list = [...ids].map((id) => tags.find((t) => t.id === id)).filter(Boolean) as Tag[];
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
        className="w-full px-2 py-1.5 text-sm bg-white border border-neutral-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        autoFocus
      />
      {showColor && (
        <div className="flex gap-1.5 flex-wrap">
          {COLOR_OPTIONS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={`w-6 h-6 rounded transition-all ${color === c ? 'ring-2 ring-offset-1 ring-blue-500 scale-110' : 'hover:scale-105'}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
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
      {/* Organization header: title + edit toggle; add actions one line below */}
      <div className="px-4 py-3 border-b border-neutral-100 flex-shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="text-[6px] font-medium text-neutral-500 uppercase tracking-wide">Organization</h2>
          <button
            type="button"
            onClick={() => setIsEditMode(!isEditMode)}
            className={`p-2 rounded-lg transition-colors ${isEditMode ? 'bg-blue-50 text-[#0044A8]' : 'hover:bg-neutral-100 text-neutral-500'}`}
            title={isEditMode ? 'Done editing' : 'Edit organization'}
          >
            {isEditMode ? <Check className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
          </button>
        </div>
        {isEditMode && (
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => startAdd('calendar')}
              className="text-xs font-medium text-[#0044A8] hover:text-[#003380] transition-colors flex items-center gap-1"
            >
              <Plus className="w-3 h-3" />
              Add Calendar
            </button>
            <button
              type="button"
              onClick={() => startAdd('category')}
              className="text-xs font-medium text-[#0044A8] hover:text-[#003380] transition-colors flex items-center gap-1"
            >
              <Plus className="w-3 h-3" />
              Add Category
            </button>
          </div>
        )}
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
        {isAdding && addingType === 'category' && (
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
          <div key={calendar.id}>
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
              <div className="group flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-neutral-50 transition-colors">
                <button
                  type="button"
                  onClick={() => toggleExpandCalendar(calendar.id)}
                  className="p-0.5 hover:bg-neutral-200 rounded transition-colors"
                >
                  {expandedCalendars.has(calendar.id) ? (
                    <ChevronDown className="w-3.5 h-3.5 text-neutral-500" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-neutral-500" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => onFocusCalendar?.(calendar.id)}
                  className="flex-1 flex items-center gap-1.5 text-left min-w-0"
                >
                  <CalendarIcon className="w-4 h-4 text-neutral-400 flex-shrink-0" />
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
                      onClick={() => startAdd('category', calendar.id)}
                      className="p-1 hover:bg-blue-100 rounded transition-colors text-blue-600"
                      title="Add category under this calendar"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => startEdit('calendar', calendar)}
                      className="p-1 hover:bg-blue-100 rounded transition-colors"
                      title="Edit calendar"
                    >
                      <Pencil className="w-3.5 h-3.5 text-blue-600" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete('calendar', calendar.id)}
                      className="p-1 hover:bg-red-100 rounded transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-600" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {expandedCalendars.has(calendar.id) && (
              <div className="ml-5 mt-1 space-y-1">
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
                            <ChevronDown className="w-3.5 h-3.5 text-neutral-500" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5 text-neutral-500" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => onFocusCategory?.(category.id)}
                          className="flex-1 flex items-center gap-1.5 text-left min-w-0"
                        >
                          <FolderKanban className="w-4 h-4 text-neutral-400 flex-shrink-0" />
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
                              <Pencil className="w-3.5 h-3.5 text-blue-600" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete('category', category.id)}
                              className="p-1 hover:bg-red-100 rounded transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-red-600" />
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {expandedCategories.has(category.id) && (
                      <div className="ml-6 mt-1 space-y-1">
                        {isEditMode && (
                          <button
                            type="button"
                            onClick={() => startAdd('tag', category.id)}
                            className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-neutral-500 hover:text-[#0044A8] hover:bg-neutral-50 rounded-lg transition-colors"
                          >
                            <Plus className="w-3 h-3" />
                            Add Tag
                          </button>
                        )}

                        {isAdding && addingType === 'tag' && addingParentId === category.id && (
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
                            <input
                              type="text"
                              value={addName}
                              onChange={(e) => setAddName(e.target.value)}
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
                              <TagIcon className="w-3.5 h-3.5 text-neutral-400 flex-shrink-0" />
                              <span className="flex-1 text-sm text-neutral-600 truncate min-w-0">{tag.name}</span>
                              {isEditMode && (
                                <div className="flex gap-1 flex-shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => startEdit('tag', tag)}
                                    className="p-1 hover:bg-blue-100 rounded transition-colors"
                                    title="Edit"
                                  >
                                    <Pencil className="w-3.5 h-3.5 text-blue-600" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDelete('tag', tag.id)}
                                    className="p-1 hover:bg-red-100 rounded transition-colors"
                                    title="Delete"
                                  >
                                    <Trash2 className="w-3.5 h-3.5 text-red-600" />
                                  </button>
                                </div>
                              )}
                            </div>
                          )
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

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

      {planVsActualSection && (
        <div className="flex-shrink-0 border-t border-neutral-100">
          {planVsActualSection}
        </div>
      )}
    </div>
  );
}
