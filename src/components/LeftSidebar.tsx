import React, { useState } from 'react';
import {
  PlusIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  PencilIcon,
  EyeIcon,
  EyeSlashIcon,
  ArrowLeftIcon,
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
  onAddCalendar: (c: Omit<CalendarContainer, 'id'>, opts?: { skipAutoGeneral?: boolean }) => string;
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
  isCompareMode?: boolean;
  onExitCompare?: () => void;
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
  isCompareMode = false,
  onExitCompare,
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
        // ADD the calendar to the category's calendarContainerIds (not replace)
        const existingCat = categories.find((c) => c.id === addExistingCategoryId);
        const currentIds = (existingCat?.calendarContainerIds && existingCat.calendarContainerIds.length > 0)
          ? existingCat.calendarContainerIds
          : (existingCat?.calendarContainerId ? [existingCat.calendarContainerId] : []);
        const newIds = currentIds.includes(addingParentId) ? currentIds : [...currentIds, addingParentId];
        onUpdateCategory(addExistingCategoryId, { calendarContainerId: newIds[0], calendarContainerIds: newIds });
      } else if (addingParentId) {
        onAddCategory({ name: addName.trim(), color: addColor, calendarContainerId: addingParentId, calendarContainerIds: [addingParentId] });
      } else {
        onAddCategory({ name: addName.trim(), color: addColor });
      }
    } else if (addingType === 'tag' && addingParentId) {
      onAddTag({ name: addName.trim(), categoryId: addingParentId });
    }
    cancelAdd();
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
  // Include all categories under every calendar they belong to (supports multi-calendar assignment)
  categories.forEach((cat) => {
    const calIds = (cat.calendarContainerIds && cat.calendarContainerIds.length > 0)
      ? cat.calendarContainerIds
      : (cat.calendarContainerId ? [cat.calendarContainerId] : []);
    calIds.forEach((calId) => {
      if (!categoryIdsByCalendar.has(calId)) categoryIdsByCalendar.set(calId, new Set());
      categoryIdsByCalendar.get(calId)!.add(cat.id);
    });
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

  // Compact inline form for adding/editing
  const InlineEditForm = ({
    name, setName, color, setColor, showColor, onSave, onCancel,
  }: {
    name: string; setName: (v: string) => void;
    color: string; setColor: (v: string) => void;
    showColor: boolean; onSave: () => void; onCancel: () => void;
  }) => (
    <div className="rounded-lg p-3 space-y-2.5 my-1" style={{ backgroundColor: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.07)' }}>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); onSave(); }
          if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
        }}
        className="w-full px-2 py-1.5 text-xs rounded-md focus:outline-none"
        style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.10)', color: '#8E8E93' }}
        autoFocus
      />
      {showColor && <ColorPicker value={color} onChange={setColor} swatchSize="sm" />}
      <div className="flex gap-1.5">
        <button type="button" onClick={onSave}
          className="flex-1 px-2 py-1 text-xs font-medium rounded-md transition-colors"
          style={{ backgroundColor: '#8DA286', color: '#8E8E93' }}>
          Save
        </button>
        <button type="button" onClick={onCancel}
          className="px-2 py-1 text-xs rounded-md transition-colors"
          style={{ backgroundColor: 'rgba(0,0,0,0.06)', color: '#636366' }}>
          Cancel
        </button>
      </div>
    </div>
  );

  const iconBtn = (onClick: () => void, icon: React.ReactNode, color: string, bg: string) => (
    <button type="button" onClick={onClick}
      className="p-0.5 rounded transition-colors flex-shrink-0"
      style={{ color, backgroundColor: 'transparent' }}
      onMouseEnter={e => (e.currentTarget.style.backgroundColor = bg)}
      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
    >
      {icon}
    </button>
  );

  // Helper: a Notion-style row — color dot + label left, chevron + actions right
  const Row = ({
    depth, color, label, chevron, onChevronClick, onLabelClick, actions, muted,
  }: {
    depth: number;
    color?: string;
    label: string;
    chevron?: 'open' | 'closed' | 'none';
    onChevronClick?: () => void;
    onLabelClick?: () => void;
    actions?: React.ReactNode;
    muted?: boolean;
  }) => {
    const [hovered, setHovered] = React.useState(false);
    const pl = depth === 0 ? 4 : depth === 1 ? 16 : 28;
    return (
      <div
        className="flex items-center w-full overflow-hidden"
        style={{
          height: 28,
          paddingLeft: pl,
          paddingRight: 4,
          backgroundColor: hovered ? 'rgba(0,0,0,0.04)' : 'transparent',
          borderRadius: 6,
          cursor: 'default',
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Color dot — leftmost, text starts right after it */}
        {color && (
          <span
            className="flex-shrink-0 rounded-sm"
            style={{ width: 8, height: 8, marginRight: 6, backgroundColor: color, opacity: muted ? 0.3 : 1 }}
          />
        )}

        {/* Label — fills remaining space, text left-aligned */}
        <button
          type="button"
          onClick={onLabelClick}
          className="flex-1 min-w-0"
          style={{
            fontSize: depth === 0 ? 14 : 13,
            fontWeight: depth === 0 ? 500 : 400,
            color: muted ? '#AEAEB2' : depth === 0 ? '#8E8E93' : '#3A3A3C',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            letterSpacing: depth === 0 ? '-0.01em' : '0',
            textAlign: 'left',
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
          }}
        >
          {label}
        </button>

        {/* Right side: chevron + actions */}
        <div className="flex items-center gap-0.5 flex-shrink-0 ml-1">
          {/* Chevron toggle — right-aligned */}
          <button
            type="button"
            onClick={onChevronClick}
            className="flex items-center justify-center"
            style={{
              width: 16, height: 16,
              color: '#AEAEB2',
              visibility: chevron === 'none' ? 'hidden' : 'visible',
            }}
          >
            <ChevronRightIcon
              className="h-3 w-3 transition-transform duration-150"
              style={{ transform: chevron === 'open' ? 'rotate(90deg)' : 'rotate(0deg)' }}
            />
          </button>

          {/* Hover actions */}
          {actions && (
            <div
              className="flex items-center gap-0.5"
              style={{ opacity: hovered ? 1 : 0, transition: 'opacity 0.1s' }}
            >
              {actions}
            </div>
          )}
        </div>
      </div>
    );
  };

  // Helper: small "+ label" add button — single line, never wraps
  const AddBtn = ({ label, onClick, hoverColor }: { label: string; onClick: () => void; hoverColor?: string }) => {
    const [hov, setHov] = React.useState(false);
    return (
      <button
        type="button"
        onClick={onClick}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          height: 24,
          fontSize: 11,
          fontWeight: 400,
          color: hov ? (hoverColor ?? '#8DA286') : '#AEAEB2',
          whiteSpace: 'nowrap',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '0 4px',
        }}
      >
        <PlusIcon style={{ width: 11, height: 11, flexShrink: 0 }} />
        <span>{label}</span>
      </button>
    );
  };

  // Compare mode: replace entire sidebar with analytics
  if (isCompareMode) {
    return (
      <div data-tour="left-sidebar" className="flex flex-col flex-1 min-h-0 overflow-hidden" style={{ backgroundColor: '#FCFBF7', paddingLeft: 4 }}>
        {/* Compare header — just back arrow, no title (outer header already shows "Compare") */}
        <div className="flex items-center px-2 py-2 shrink-0" style={{ borderBottom: '1px solid rgba(0,0,0,0.07)' }}>
          <button
            type="button"
            onClick={onExitCompare}
            className="p-1 rounded-md transition-colors"
            style={{ color: '#8E8E93' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#636366')}
            onMouseLeave={e => (e.currentTarget.style.color = '#8E8E93')}
            title="Exit compare mode"
          >
            <ArrowLeftIcon className="h-3.5 w-3.5" />
          </button>
        </div>
        {/* Analytics section fills remaining space */}
        <div className="flex-1 min-h-0 overflow-y-auto px-3 pt-2 pb-3">
          {planVsActualSection}
        </div>
      </div>
    );
  }

  return (
    <div data-tour="left-sidebar" className="flex flex-col flex-1 min-h-0 overflow-hidden" style={{ backgroundColor: '#FCFBF7', paddingLeft: 4 }}>
      {/* Scrollable list — calendars, categories, tags */}
      <div data-tour="calendar-list" className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-1.5 pt-1 pb-2">
        {calendarContainers.map((calendar) => {
          const isVisible = visibility[calendar.id] ?? true;
          const isExpanded = expandedCalendars.has(calendar.id);
          const calCategories = categoriesByCalendar.get(calendar.id) ?? [];
          const hasChildren = calCategories.length > 0;

          return (
            <div key={calendar.id}>
              {editingId === calendar.id && editingType === 'calendar' ? (
                <div className="px-2 py-1">
                  <InlineEditForm name={editName} setName={setEditName} color={editColor} setColor={setEditColor} showColor onSave={saveEdit} onCancel={cancelEdit} />
                </div>
              ) : (
                <Row
                  depth={0}
                  color={calendar.color}
                  label={calendar.name}
                  chevron={hasChildren ? (isExpanded ? 'open' : 'closed') : 'none'}
                  muted={!isVisible}
                  onChevronClick={() => toggleExpandCalendar(calendar.id)}
                  onLabelClick={() => onFocusCalendar?.(calendar.id)}
                  actions={
                    isEditMode ? (
                      <>
                        {iconBtn(() => startEdit('calendar', calendar), <PencilIcon className="h-3.5 w-3.5" />, '#8DA286', 'rgba(141,162,134,0.12)')}
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onToggleVisibility(calendar.id)}
                        className="flex-shrink-0 p-0.5 rounded transition-colors"
                        style={{ color: isVisible ? calendar.color : '#AEAEB2' }}
                        title={isVisible ? 'Hide' : 'Show'}
                      >
                        {isVisible ? <EyeIcon className="h-3.5 w-3.5" /> : <EyeSlashIcon className="h-3.5 w-3.5" />}
                      </button>
                    )
                  }
                />
              )}

              {/* Expanded categories */}
              {isExpanded && (
                <div>
                  {calCategories.map((category) => {
                    const catExpanded = expandedCategories.has(category.id);
                    const categoryTags = tagsByCalendarCategory.get(`${calendar.id}:${category.id}`) ?? [];

                    return (
                      <div key={category.id}>
                        {editingId === category.id && editingType === 'category' ? (
                          <div className="px-2 py-1">
                            <InlineEditForm name={editName} setName={setEditName} color={editColor} setColor={setEditColor} showColor onSave={saveEdit} onCancel={cancelEdit} />
                          </div>
                        ) : (
                          <Row
                            depth={1}
                            color={category.color}
                            label={category.name}
                            chevron={categoryTags.length > 0 ? (catExpanded ? 'open' : 'closed') : 'none'}
                            onChevronClick={() => toggleExpandCategory(category.id)}
                            onLabelClick={() => onFocusCategory?.(category.id)}
                            actions={isEditMode ? (
                              <>
                                {iconBtn(() => startEdit('category', category), <PencilIcon className="h-3.5 w-3.5" />, '#8DA286', 'rgba(141,162,134,0.12)')}
                              </>
                            ) : undefined}
                          />
                        )}

                        {/* Tags */}
                        {catExpanded && (
                          <div style={{ paddingLeft: 28, paddingRight: 8, paddingBottom: 4 }}>
                            {categoryTags.length > 0 && (
                              <div className="flex flex-wrap gap-2 py-1">
                                {categoryTags.map((tag) =>
                                  editingId === tag.id && editingType === 'tag' ? (
                                    <div key={tag.id} className="w-full">
                                      <div className="rounded-lg p-2 space-y-1.5" style={{ backgroundColor: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.07)' }}>
                                        <input
                                          type="text" value={editName}
                                          onChange={(e) => setEditName(e.target.value)}
                                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveEdit(); } if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); } }}
                                          className="w-full px-2 py-1 text-xs rounded-md focus:outline-none"
                                          style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.10)', color: '#8E8E93' }}
                                          autoFocus
                                        />
                                        <div className="flex gap-1">
                                          <button type="button" onClick={saveEdit} className="flex-1 px-2 py-0.5 text-xs font-medium rounded-md" style={{ backgroundColor: '#8DA286', color: '#8E8E93' }}>Save</button>
                                          <button type="button" onClick={cancelEdit} className="px-2 py-0.5 text-xs rounded-md" style={{ backgroundColor: 'rgba(0,0,0,0.06)', color: '#636366' }}>×</button>
                                        </div>
                                      </div>
                                    </div>
                                  ) : (
                                    <div key={tag.id} className="group/tag flex items-center gap-0.5">
                                      <span
                                        className="inline-flex items-center font-medium rounded-full cursor-default"
                                        style={{ fontSize: 10, padding: '4px 8px', color: category.color, backgroundColor: `${category.color}14`, border: `1px solid ${category.color}28` }}
                                      >
                                        {tag.name}
                                      </span>
                                      {isEditMode && (
                                        <div className="flex opacity-0 group-hover/tag:opacity-100 transition-opacity">
                                          {iconBtn(() => startEdit('tag', tag), <PencilIcon className="h-2 w-2" />, '#8DA286', 'rgba(141,162,134,0.12)')}
                                        </div>
                                      )}
                                    </div>
                                  )
                                )}
                              </div>
                            )}
                            <div className="mt-2"><AddBtn label="Add tag" onClick={() => startAdd('tag', category.id)} hoverColor={category.color} /></div>
                            {isAdding && addingType === 'tag' && addingParentId === category.id && (
                              <div className="mt-1 rounded-lg p-2 space-y-1.5" style={{ backgroundColor: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.07)' }}>
                                <input type="text" value={addName} onChange={(e) => setAddName(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveAdd(); } if (e.key === 'Escape') { e.preventDefault(); cancelAdd(); } }}
                                  placeholder="Tag name" className="w-full px-2 py-1 text-xs rounded-md focus:outline-none"
                                  style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.10)', color: '#8E8E93' }} autoFocus />
                                <div className="flex gap-1">
                                <button type="button" onClick={saveAdd} className="flex-1 px-2 py-0.5 text-xs font-medium rounded-md" style={{ backgroundColor: '#8DA286', color: '#8E8E93' }}>Add</button>
                                  <button type="button" onClick={cancelAdd} className="px-2 py-0.5 text-xs rounded-md" style={{ backgroundColor: 'rgba(0,0,0,0.06)', color: '#636366' }}>×</button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* + Add category */}
                  <div className="mt-1" style={{ paddingLeft: 16, paddingRight: 8 }}>
                    <AddBtn label="Add category" onClick={() => startAdd('category', calendar.id)} hoverColor={calendar.color} />
                    {isAdding && addingType === 'category' && addingParentId === calendar.id && (
                      <div className="mt-1 rounded-lg p-2.5 space-y-2" style={{ backgroundColor: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.07)' }}>
                        <p style={{ fontSize: 10, fontWeight: 500, color: '#636366' }}>Select existing or create new</p>
                        <div className="flex flex-wrap gap-2">
                          {categories.map((cat) => (
                            <button key={cat.id} type="button"
                              onClick={() => { setAddExistingCategoryId(cat.id); setAddName(cat.name); setAddColor(cat.color); }}
                              className="rounded-full font-medium transition-all"
                              style={{ fontSize: 10, padding: '4px 8px', ...(addExistingCategoryId === cat.id
                                ? { backgroundColor: `${cat.color}18`, color: cat.color, border: `1.5px solid ${cat.color}` }
                                : { backgroundColor: 'transparent', color: '#636366', border: '1px solid rgba(0,0,0,0.12)' }) }}
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

        {/* + Add calendar */}
        <div style={{ paddingLeft: 4, paddingTop: 4 }}>
          <AddBtn label="Add calendar" onClick={() => startAdd('calendar')} hoverColor="#8DA286" />
          {isAdding && addingType === 'calendar' && (
            <div className="mt-1 px-1">
              <InlineEditForm name={addName} setName={setAddName} color={addColor} setColor={setAddColor} showColor onSave={saveAdd} onCancel={cancelAdd} />
            </div>
          )}
        </div>
      </div>

      {/* Plan vs Actual section */}
      {planVsActualSection && (
        <div className="flex-shrink-0" style={{ borderTop: '1px solid rgba(0,0,0,0.07)' }}>
          <div className="flex items-center justify-between gap-2 px-3 py-2">
            <span className="text-sm font-semibold" style={{ color: '#636366' }}>
              Plan vs actual
            </span>
            <button
              type="button"
              onClick={() => setIsPlanVsActualOpen(!isPlanVsActualOpen)}
              className="p-1 rounded transition-colors"
              style={{ color: '#8E8E93' }}
              title={isPlanVsActualOpen ? 'Hide' : 'Show'}
            >
              {isPlanVsActualOpen ? <EyeSlashIcon className="h-3 w-3" /> : <EyeIcon className="h-3 w-3" />}
            </button>
          </div>
          {isPlanVsActualOpen && (
            <div className="px-3 pb-3">
              {planVsActualSection}
            </div>
          )}
        </div>
      )}

      {/* End Day button */}
      {onEndDay && endDayLabel && (
        <div className="flex-shrink-0 px-3 py-1.5" style={{ borderTop: '1px solid rgba(0,0,0,0.07)' }}>
          <button
            type="button"
            onClick={onEndDay}
            className="w-full text-left px-2 py-1 text-xs rounded-md transition-colors"
            style={{ color: '#8E8E93' }}
            onMouseEnter={e => { (e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.04)'); (e.currentTarget.style.color = '#636366'); }}
            onMouseLeave={e => { (e.currentTarget.style.backgroundColor = 'transparent'); (e.currentTarget.style.color = '#8E8E93'); }}
          >
            {endDayLabel}
          </button>
        </div>
      )}

      {/* Keyboard shortcuts */}
      {onToggleShortcuts && (
        <>
          <div className="flex-shrink-0 px-3 py-1.5" style={{ borderTop: '1px solid rgba(0,0,0,0.07)' }}>
            <button
              type="button"
              onClick={onToggleShortcuts}
              className="w-full flex items-center justify-between px-2 py-1 text-[10px] font-medium rounded-md transition-colors"
              style={{ color: '#8E8E93' }}
              onMouseEnter={e => { (e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.04)'); (e.currentTarget.style.color = '#636366'); }}
              onMouseLeave={e => { (e.currentTarget.style.backgroundColor = 'transparent'); (e.currentTarget.style.color = '#8E8E93'); }}
            >
              <span>Keyboard shortcuts</span>
              <span className="inline-flex items-center justify-center w-4 h-4 text-[9px] rounded font-bold" style={{ border: '1px solid rgba(0,0,0,0.12)', color: '#AEAEB2' }}>?</span>
            </button>
          </div>
          {isShortcutsOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={onToggleShortcuts} aria-hidden />
              <div className="fixed bottom-16 left-4 z-50 w-52 rounded-xl py-2 px-3" style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.09)', boxShadow: '0 8px 24px rgba(0,0,0,0.10)' }}>
              <p className="text-xs font-semibold mb-2" style={{ color: '#3A3A3C' }}>Shortcuts</p>
                <div className="space-y-1.5 text-xs" style={{ color: '#636366' }}>
                  {[['3', '3-Day view'], ['d', 'Day view'], ['w', 'Week view'], ['m', 'Month view'], ['c', 'Compare plan vs actual'], ['a', 'Show all calendars']].map(([key, label]) => (
                    <div key={key} className="flex justify-between gap-4">
                      <kbd className="font-mono text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(0,0,0,0.07)', border: '1px solid rgba(0,0,0,0.09)', color: '#3A3A3C' }}>{key}</kbd>
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
