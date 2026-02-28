import React, { useState, useEffect, useRef } from 'react';
import { XMarkIcon, PlusIcon, TagIcon, Bars3Icon, ChevronDownIcon, ChevronUpIcon, StarIcon } from '@heroicons/react/24/solid';
import type { Category, Tag } from '../types';
import { DEFAULT_PALETTE_COLOR, THEME } from '../constants/colors';
import { getLocalDateString } from '../utils/dateTime';
import type { CalendarContainer, Task, TimeBlock, Event, Mode, RecurrencePattern } from '../types';
import { SegmentedControl } from './ui/SegmentedControl';
import { Chip } from './ui/chip';

type AddMode = 'task' | 'event';

interface AddModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  tags: Tag[];
  calendarContainers?: CalendarContainer[];
  initialMode?: AddMode;
  /** @deprecated No longer used; plan vs record is time-based (future = planned, past confirm = recorded). */
  viewMode?: Mode;
  /** When set, modal is in edit mode for this task */
  editingTask?: Task | null;
  /** When set, modal edits an existing time block (event). */
  editingTimeBlock?: TimeBlock | null;
  /** When set, modal edits an existing event (from events table). */
  editingEvent?: Event | null;
  onAddTask: (task: {
    title: string;
    estimatedHours: number;
    category: Category;
    tags: Tag[];
    calendar: 'personal' | 'work' | 'school';
    dueDate?: string | null;
    link?: string | null;
    description?: string | null;
  }) => void;
  onUpdateTask?: (id: string, updates: Partial<Task>) => void;
  onUpdateTimeBlock?: (id: string, updates: Partial<TimeBlock>) => void;
  onUpdateEvent?: (id: string, updates: Partial<Event> & { recurrenceEditScope?: 'this' | 'all' | 'all_after' }) => void;
  onAddEvent: (event: {
    title: string;
    startTime: string;
    endTime: string;
    date: string;
    category: Category;
    tags: Tag[];
    calendar: string;
    recurring?: boolean;
    recurrencePattern?: RecurrencePattern;
    recurrenceDays?: number[];
    link?: string | null;
    description?: string | null;
  }) => void;
  /** When the user needs to add a calendar (e.g. no calendars exist yet). */
  onRequireCalendar?: () => void;
  /** Create a category (e.g. from typed name); return the new category. Used for type-to-add. */
  onAddCategory?: (c: Omit<Category, 'id'>) => Category;
  /** Create a tag under a category; return the new tag. Used for type-to-add. */
  onAddTag?: (t: Omit<Tag, 'id'>) => Tag;
}

const PANEL_WIDTH = 380;
const PANEL_MAX_HEIGHT = 85; // vh

export function AddModal({
  isOpen,
  onClose,
  categories,
  tags,
  calendarContainers = [],
  initialMode = 'task',
  viewMode = 'overall',
  editingTask = null,
  editingTimeBlock = null,
  editingEvent = null,
  onAddTask,
  onUpdateTask,
  onUpdateTimeBlock,
  onUpdateEvent,
  onAddEvent,
  onRequireCalendar,
  onAddCategory,
  onAddTag,
}: AddModalProps) {
  const [mode, setMode] = useState<AddMode>(initialMode);
  const [title, setTitle] = useState('');
  const [estimatedHours, setEstimatedHours] = useState(1);
  const [date, setDate] = useState(getLocalDateString());
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(categories[0] || null);
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]);
  const [categoryInput, setCategoryInput] = useState('');
  const [tagInput, setTagInput] = useState('');
  // Use real calendars when available; fall back to seed IDs only in legacy/no-Supabase scenarios.
  const defaultCalendars = [
    { id: 'personal', name: 'Personal', color: '#86C0F4' },
    { id: 'work', name: 'Work', color: '#9F5FB0' },
    { id: 'school', name: 'School', color: '#EC8309' },
  ];
  const calendars = calendarContainers.length > 0 ? calendarContainers : defaultCalendars;
  const [selectedCalendar, setSelectedCalendar] = useState(calendars[0]?.id ?? 'personal');
  const [dueDate, setDueDate] = useState<string>('');
  const [link, setLink] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [pinned, setPinned] = useState<boolean>(false);
  const [priority, setPriority] = useState<number | undefined>(undefined);
  const [moreOpen, setMoreOpen] = useState(false);
  const [recurrencePattern, setRecurrencePattern] = useState<RecurrencePattern>('none');
  const [recurrenceDays, setRecurrenceDays] = useState<number[]>([]); // 0=Sun .. 6=Sat for custom
  const [recurrenceEditScope, setRecurrenceEditScope] = useState<'this' | 'all' | 'all_after'>('this');
  const [showCategoryInput, setShowCategoryInput] = useState(false);
  const [showTagInput, setShowTagInput] = useState(false);

  const [panelPos, setPanelPos] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, left: 0, top: 0 });

  // Show newly added category immediately (before parent re-render) so user can continue without refresh
  const categoriesToShow = React.useMemo(() => {
    if (!selectedCategory) return categories;
    const inList = categories.some((c) => c.id === selectedCategory.id);
    if (inList) return categories;
    return [...categories, selectedCategory];
  }, [categories, selectedCategory]);

  useEffect(() => {
    if (isOpen && typeof window !== 'undefined') {
      const maxH = (window.innerHeight * PANEL_MAX_HEIGHT) / 100;
      const x = Math.max(16, window.innerWidth - PANEL_WIDTH - 24);
      const y = Math.max(16, window.innerHeight - maxH - 24);
      setPanelPos({ x, y });
    }
  }, [isOpen]);

  // Reset recurrence when modal closes so a new event doesn't keep previous recurrence
  useEffect(() => {
    if (!isOpen) {
      setRecurrencePattern('none');
      setRecurrenceDays([]);
      setRecurrenceEditScope('this');
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      setPanelPos((p) => ({
        x: Math.max(0, dragStart.current.left + dx),
        y: Math.max(0, dragStart.current.top + dy),
      }));
    };
    const onUp = () => setIsDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isDragging]);

  // Prefill when editing
  useEffect(() => {
    if (isOpen && editingTask) {
      setMode('task');
      setTitle(editingTask.title);
      setEstimatedHours(Math.round((editingTask.estimatedMinutes / 60) * 10) / 10);
      setSelectedCategory(categories.find(c => c.id === editingTask.categoryId) ?? (categories[0] || null));
      setSelectedTags(tags.filter(t => editingTask.tagIds.includes(t.id)));
      setSelectedCalendar(editingTask.calendarContainerId);
      setDueDate(editingTask.dueDate ?? '');
      setLink(editingTask.link ?? '');
      setDescription(editingTask.description ?? '');
      setPinned(!!editingTask.pinned);
      setPriority(typeof editingTask.priority === 'number' ? editingTask.priority : undefined);
    }
  }, [isOpen, editingTask?.id, categories, tags]);

  useEffect(() => {
    if (isOpen && editingTimeBlock) {
      setMode('event');
      setTitle(editingTimeBlock.title ?? '');
      setDate(editingTimeBlock.date);
      setStartTime(editingTimeBlock.start);
      setEndTime(editingTimeBlock.end);
      setSelectedCategory(categories.find((c) => c.id === editingTimeBlock.categoryId) ?? (categories[0] || null));
      setSelectedTags(tags.filter((t) => editingTimeBlock.tagIds.includes(t.id)));
      setSelectedCalendar(editingTimeBlock.calendarContainerId);
      setLink(editingTimeBlock.link ?? '');
      setDescription(editingTimeBlock.description ?? '');
      setNotes((editingTimeBlock as any).notes ?? '');
      setPinned(false);
      setPriority(undefined);
    }
  }, [isOpen, editingTimeBlock?.id, categories, tags]);

  useEffect(() => {
    if (isOpen && editingEvent) {
      setMode('event');
      setTitle(editingEvent.title ?? '');
      setDate(editingEvent.date);
      setStartTime(editingEvent.start);
      setEndTime(editingEvent.end);
      setSelectedCategory(categories.find((c) => c.id === editingEvent.categoryId) ?? (categories[0] || null));
      setSelectedTags([]);
      setSelectedCalendar(editingEvent.calendarContainerId);
      setRecurrencePattern(editingEvent.recurrencePattern ?? 'none');
      setRecurrenceDays(editingEvent.recurrenceDays ?? []);
      setLink(editingEvent.link ?? '');
      setDescription(editingEvent.description ?? '');
      setPinned(false);
      setPriority(undefined);
    }
  }, [isOpen, editingEvent?.id, categories]);

  // Reset add mode when modal opens (unless editing).
  useEffect(() => {
    if (isOpen && !editingTask && !editingTimeBlock && !editingEvent) {
      setMode(initialMode);
      setPinned(false);
      setPriority(undefined);
    }
  }, [isOpen, initialMode, editingTask, editingTimeBlock, editingEvent]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const fallbackCalendar =
      selectedCalendar || calendars[0]?.id || (editingTimeBlock?.calendarContainerId ?? editingEvent?.calendarContainerId ?? '');
    if (!fallbackCalendar) {
      if (!calendars.length && onRequireCalendar) onRequireCalendar();
      return;
    }

    // Category is always committed immediately via the inline "+" form (or pre-selected)
    const categoryToUse: Category | null =
      selectedCategory ??
      categories.find((c) => c.calendarContainerId === fallbackCalendar) ??
      categories.find((c) => c.calendarContainerIds?.includes(fallbackCalendar)) ??
      null;
    if (!categoryToUse) return;

    // Tags are committed immediately via the inline "+" form or pill toggle
    const tagsToUse = [...selectedTags];

    if (editingTask && onUpdateTask) {
      onUpdateTask(editingTask.id, {
        title,
        estimatedMinutes: estimatedHours * 60,
        categoryId: categoryToUse.id,
        tagIds: tagsToUse.map((t) => t.id),
        calendarContainerId: fallbackCalendar,
        dueDate: dueDate.trim() || null,
        link: link.trim() || null,
        description: description.trim() || null,
        pinned,
        priority,
      });
    } else if (editingEvent && onUpdateEvent) {
      onUpdateEvent(editingEvent.id, {
        title,
        start: startTime,
        end: endTime,
        date,
        calendarContainerId: fallbackCalendar,
        categoryId: categoryToUse.id,
        recurring: recurrencePattern !== 'none',
        recurrencePattern: recurrencePattern === 'none' ? undefined : recurrencePattern,
        recurrenceDays: recurrencePattern === 'custom' && recurrenceDays.length > 0 ? recurrenceDays : undefined,
        recurrenceEditScope: (editingEvent.recurring || recurrencePattern !== 'none') ? recurrenceEditScope : undefined,
        link: link.trim() || null,
        description: description.trim() || null,
      });
    } else if (editingTimeBlock && onUpdateTimeBlock) {
      onUpdateTimeBlock(editingTimeBlock.id, {
        title,
        start: startTime,
        end: endTime,
        date,
        calendarContainerId: fallbackCalendar,
        categoryId: categoryToUse.id,
        tagIds: tagsToUse.map((t) => t.id),
        link: link.trim() || null,
        description: description.trim() || null,
        notes: notes.trim() || null,
        // Pass recurrence fields so draft-block→recurring-event conversion works
        recurring: recurrencePattern !== 'none',
        recurrencePattern: recurrencePattern === 'none' ? undefined : recurrencePattern,
        recurrenceDays: recurrencePattern === 'custom' && recurrenceDays.length > 0 ? recurrenceDays : undefined,
      } as any);
    } else if (mode === 'task') {
      onAddTask({
        title,
        estimatedHours,
        category: categoryToUse,
        tags: tagsToUse,
        calendar: fallbackCalendar,
        dueDate: dueDate.trim() || null,
        link: link.trim() || null,
        description: description.trim() || null,
        priority,
      });
    } else {
      onAddEvent({
        title,
        startTime,
        endTime,
        date,
        category: categoryToUse,
        tags: tagsToUse,
        calendar: fallbackCalendar,
        recurring: recurrencePattern !== 'none',
        recurrencePattern: recurrencePattern === 'none' ? undefined : recurrencePattern,
        recurrenceDays: recurrencePattern === 'custom' && recurrenceDays.length > 0 ? recurrenceDays : undefined,
        link: link.trim() || null,
        description: description.trim() || null,
      });
    }

    setTitle('');
    setEstimatedHours(1);
    setDueDate('');
    setLink('');
    setDescription('');
    setNotes('');
    setDate(getLocalDateString());
    setStartTime('09:00');
    setEndTime('10:00');
    setSelectedCategory(categories[0] || null);
    setSelectedTags([]);
    setCategoryInput('');
    setTagInput('');
    setSelectedCalendar(calendars[0]?.id ?? 'personal');
    setPinned(false);
    setPriority(undefined);
    onClose();
  };

  const toggleTag = (tag: Tag) => {
    setSelectedTags(prev =>
      prev.find(t => t.id === tag.id)
        ? prev.filter(t => t.id !== tag.id)
        : [...prev, tag]
    );
  };

  if (!isOpen) return null;

  const maxH = typeof window !== 'undefined' ? (window.innerHeight * PANEL_MAX_HEIGHT) / 100 : 560;

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      {/* Light backdrop — click to close, calendar stays visible */}
      <div className="absolute inset-0 bg-black/15 pointer-events-auto" onClick={onClose} aria-hidden />

      {/* Draggable panel — Monet warm canvas theme */}
      <div
        className="absolute pointer-events-auto flex flex-col overflow-hidden"
        style={{
          left: panelPos.x,
          top: panelPos.y,
          width: `${PANEL_WIDTH}px`,
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: maxH,
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid rgba(160, 140, 120, 0.2)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.05)',
        }}
      >
        {/* Drag header */}
        <div
          className="flex items-center gap-2 px-4 py-2.5 shrink-0 cursor-grab active:cursor-grabbing select-none"
          style={{ borderBottom: '1px solid rgba(0,0,0,0.08)' }}
          onMouseDown={(e) => {
            if ((e.target as HTMLElement).closest('button')) return;
            setIsDragging(true);
            dragStart.current = { x: e.clientX, y: e.clientY, left: panelPos.x, top: panelPos.y };
          }}
        >
          <Bars3Icon className="h-3.5 w-3.5 shrink-0" style={{ color: '#8E8E93' }} />
          <h2 className="text-sm font-semibold flex-1 min-w-0 truncate" style={{ color: '#1C1C1E' }}>
            {editingTask
              ? 'Edit Task'
              : editingTimeBlock || editingEvent
                ? 'Edit Event'
                : mode === 'task'
                  ? 'New Task'
                  : 'New Event'}
          </h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg transition-colors shrink-0" style={{ color: '#8E8E93' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.07)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Task/Event Toggle — when adding (not editing) */}
        {!editingTimeBlock && !editingEvent && !editingTask && (
          <div className="px-4 pt-3" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex' }}>
              <SegmentedControl
                options={[
                  { value: 'task' as AddMode, label: 'Task' },
                  { value: 'event' as AddMode, label: 'Event' },
                ]}
                value={mode}
                onChange={setMode}
                style={{ flex: 1 }}
              />
            </div>
            <p className="text-[10px] px-1" style={{ color: '#8E8E93' }}>
              {mode === 'task'
                ? 'Tasks are flexible — schedule them anytime'
                : 'Events are fixed — they happen at a set time'}
            </p>
          </div>
        )}

        {/* Form — compact, scrollable; primary button is type="submit" so Enter submits */}
        <form
          onSubmit={handleSubmit}
          className="flex-1 min-h-0 flex flex-col overflow-hidden"
        >
          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-4">
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: '#636366' }}>{mode === 'task' ? 'Task Title' : 'Event Title'}</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={mode === 'task' ? 'e.g., Finish proposal...' : 'e.g., Team standup...'} className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none transition-all" style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.09)', color: '#1C1C1E' }} autoFocus />
          </div>

          {mode === 'task' && (
            <>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: '#636366' }}>Estimated Time</label>
                <div className="flex gap-3 items-center">
                  <input
                    type="range" min="0.5" max="8" step="0.5" value={estimatedHours}
                    onChange={(e) => setEstimatedHours(parseFloat(e.target.value))}
                    className="flex-1 h-1.5 appearance-none cursor-pointer rounded-full"
                    style={{ background: `linear-gradient(to right, #8DA286 0%, #8DA286 ${((estimatedHours - 0.5) / 7.5) * 100}%, rgba(0,0,0,0.09) ${((estimatedHours - 0.5) / 7.5) * 100}%, rgba(0,0,0,0.09) 100%)` }}
                  />
                  <span className="text-sm font-bold w-10 text-right" style={{ color: '#8DA286' }}>{estimatedHours}h</span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: '#636366' }}>Due date <span style={{ color: '#8E8E93', fontWeight: 400 }}>(optional)</span></label>
                <input
                  type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none"
                  style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.09)', color: '#1C1C1E' }}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: '#636366' }}>
                  Priority
                </label>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((level) => {
                    const active = priority >= level;
                    return (
                      <button
                        key={level}
                        type="button"
                        onClick={() => setPriority(level)}
                        className="p-0.5 rounded-full transition-colors"
                        style={{
                          color: active ? '#F5A623' : '#D1D1D6',
                          backgroundColor: active ? 'rgba(245,166,35,0.08)' : 'transparent',
                        }}
                      >
                        <StarIcon className="h-4 w-4" />
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {mode === 'event' && (
            <>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: '#636366' }}>Date</label>
                <input
                  type="date" value={date} onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none"
                  style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.09)', color: '#1C1C1E' }}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: '#636366' }}>Start</label>
                  <input
                    type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none"
                    style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.09)', color: '#1C1C1E' }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: '#636366' }}>End</label>
                  <input
                    type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none"
                    style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.09)', color: '#1C1C1E' }}
                  />
                </div>
              </div>
            </>
          )}

          {/* Calendar — horizontal pill select */}
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: '#636366' }}>Calendar</label>
            {calendars.length === 0 ? (
              <button
                type="button"
                onClick={onRequireCalendar}
                className="w-full px-3 py-2 text-sm font-medium flex items-center justify-center gap-1.5 rounded-lg"
                style={{ color: THEME.primary, backgroundColor: `rgba(141,162,134,0.08)`, border: `1.5px dashed ${THEME.primary}40` }}
              >
                <PlusIcon className="h-3.5 w-3.5" />
                Add a calendar first
              </button>
            ) : (
              <div className="flex gap-1.5 flex-wrap">
                {calendars.map((cal) => {
                  const isSel = selectedCalendar === cal.id;
                  return (
                    <button
                      key={cal.id}
                      type="button"
                      onClick={() => setSelectedCalendar(cal.id)}
                      className="rounded-full transition-all capitalize"
                    >
                      <Chip
                        variant={isSel ? 'subtle' : 'outline'}
                        color={isSel ? cal.color : undefined}
                        className={!isSel ? 'border-[rgba(0,0,0,0.12)] text-[var(--muted-foreground)]' : ''}
                        style={!isSel ? { color: THEME.textSecondary, borderColor: 'rgba(0,0,0,0.12)' } : undefined}
                      >
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: isSel ? cal.color : THEME.textMuted }} />
                        {cal.name}
                      </Chip>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Category — pill select, with colored dot */}
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: '#636366' }}>Category</label>
            <div className="flex gap-1.5 flex-wrap items-center">
              {categoriesToShow
                .filter((category) => {
                  if (!selectedCalendar) return true;
                  const ids = category.calendarContainerIds;
                  if (ids && ids.length > 0) return ids.includes(selectedCalendar);
                  return category.calendarContainerId === selectedCalendar || !category.calendarContainerId;
                })
                .map((category) => {
                  const isSel = selectedCategory?.id === category.id;
                  return (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => setSelectedCategory(category)}
                      className="rounded-full transition-all"
                    >
                      <Chip
                        variant={isSel ? 'subtle' : 'outline'}
                        color={isSel ? category.color : undefined}
                        className={!isSel ? 'border-[rgba(0,0,0,0.12)]' : ''}
                        style={!isSel ? { color: THEME.textSecondary, borderColor: 'rgba(0,0,0,0.12)' } : undefined}
                      >
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: isSel ? category.color : THEME.textMuted }} />
                        {category.name}
                      </Chip>
                    </button>
                  );
                })}
              {onAddCategory && !showCategoryInput && (
                <button
                  type="button"
                  onClick={() => setShowCategoryInput(true)}
                  className="flex items-center justify-center rounded-full transition-all"
                  style={{ width: 22, height: 22, border: '1.5px dashed rgba(0,0,0,0.18)', color: '#8E8E93' }}
                  title="New category"
                >
                  <PlusIcon className="h-3 w-3" />
                </button>
              )}
            </div>
            {showCategoryInput && (
              <input
                type="text"
                value={categoryInput}
                onChange={(e) => setCategoryInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const name = categoryInput.trim();
                    if (name && onAddCategory && selectedCalendar) {
                      const existing = categories.find(
                        (c) => c.name.toLowerCase() === name.toLowerCase() &&
                          (c.calendarContainerId === selectedCalendar || c.calendarContainerIds?.includes(selectedCalendar))
                      );
                      const cat = existing ?? onAddCategory({ name, color: DEFAULT_PALETTE_COLOR, calendarContainerId: selectedCalendar, calendarContainerIds: [selectedCalendar] });
                      setSelectedCategory(cat);
                    }
                    setCategoryInput('');
                    setShowCategoryInput(false);
                  }
                  if (e.key === 'Escape') { setCategoryInput(''); setShowCategoryInput(false); }
                }}
                onBlur={() => { setCategoryInput(''); setShowCategoryInput(false); }}
                placeholder="Category name, Enter to add…"
                autoFocus
                className="mt-1.5 w-full px-3 py-2 text-sm rounded-lg focus:outline-none transition-all"
                style={{ backgroundColor: THEME.card, border: `1px solid ${THEME.borderMedium}`, color: THEME.textPrimary }}
              />
            )}
          </div>

          {/* Tags — multi-select pills */}
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: '#636366' }}>Tags <span style={{ color: '#8E8E93', fontWeight: 400 }}>(optional)</span></label>
            <div className="flex gap-1.5 flex-wrap items-center">
              {tags
                .filter((t) => t.categoryId === selectedCategory?.id)
                .map((tag) => {
                  const isSelected = selectedTags.some((s) => s.id === tag.id);
                  const catColor = selectedCategory?.color ?? THEME.primary;
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => toggleTag(tag)}
                      className="rounded-full transition-all"
                    >
                      <Chip
                        variant={isSelected ? 'subtle' : 'outline'}
                        color={isSelected ? catColor : undefined}
                        className={!isSelected ? 'border-[rgba(0,0,0,0.09)]' : ''}
                        style={!isSelected ? { color: THEME.textMuted, borderColor: 'rgba(0,0,0,0.09)' } : undefined}
                      >
                        {tag.name}
                      </Chip>
                    </button>
                  );
                })}
              {onAddTag && selectedCategory && !showTagInput && (
                <button
                  type="button"
                  onClick={() => setShowTagInput(true)}
                  className="flex items-center justify-center rounded-full transition-all"
                  style={{ width: 22, height: 22, border: '1.5px dashed rgba(0,0,0,0.18)', color: '#8E8E93' }}
                  title="New tag"
                >
                  <PlusIcon className="h-3 w-3" />
                </button>
              )}
            </div>
            {showTagInput && (
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    const name = tagInput.trim().replace(/,/g, '');
                    if (name && selectedCategory) {
                      const existing = tags.find((t) => t.name.toLowerCase() === name.toLowerCase() && t.categoryId === selectedCategory.id);
                      if (existing) setSelectedTags((prev) => prev.some((t) => t.id === existing.id) ? prev : [...prev, existing]);
                      else if (onAddTag) setSelectedTags((prev) => [...prev, onAddTag({ name, categoryId: selectedCategory.id })]);
                    }
                    setTagInput('');
                    setShowTagInput(false);
                  }
                  if (e.key === 'Escape') { setTagInput(''); setShowTagInput(false); }
                }}
                onBlur={() => { setTagInput(''); setShowTagInput(false); }}
                placeholder="Tag name, Enter to add…"
                autoFocus
                className="mt-1.5 w-full px-3 py-2 text-sm rounded-lg focus:outline-none transition-all"
                style={{ backgroundColor: THEME.card, border: `1px solid ${THEME.borderMedium}`, color: THEME.textPrimary }}
              />
            )}
          </div>

          {/* Quick Notes — shown inline on the block */}
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: '#636366' }}>
              Quick Notes <span style={{ color: '#8E8E93', fontWeight: 400 }}>(shown on block)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Quick reminder, context, or link to notes…"
              rows={2}
              className="w-full px-3 py-2 text-xs rounded-lg focus:outline-none resize-none italic"
              style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.09)', color: '#636366', fontStyle: 'italic' }}
            />
          </div>

          {/* More — Link, Description, Repeat (collapsible) */}
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(0,0,0,0.09)' }}>
            <button
              type="button"
              onClick={() => setMoreOpen((o) => !o)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold transition-colors"
              style={{
                color: '#636366',
                backgroundColor: moreOpen ? 'rgba(0,0,0,0.04)' : 'transparent',
                borderBottom: moreOpen ? '1px solid rgba(0,0,0,0.08)' : 'none',
              }}
            >
              <span>More options {mode === 'event' ? '(link, description, repeat)' : '(link, description)'}</span>
              {moreOpen ? <ChevronUpIcon className="h-3.5 w-3.5" /> : <ChevronDownIcon className="h-3.5 w-3.5" />}
            </button>
            {moreOpen && (
              <div className="p-3 space-y-3" style={{ backgroundColor: '#FCFBF7' }}>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: '#636366' }}>Link <span style={{ color: '#8E8E93', fontWeight: 400 }}>(optional)</span></label>
                  <input type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://..." className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none" style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.09)', color: '#1C1C1E' }} />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: '#636366' }}>Description <span style={{ color: '#8E8E93', fontWeight: 400 }}>(optional)</span></label>
                  <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Longer description or context…" rows={2} className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none resize-y" style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.09)', color: '#1C1C1E' }} />
                </div>
                {mode === 'event' && (
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: '#636366' }}>Repeat</label>
                    <div className="flex flex-wrap gap-1.5">
                      {(['none', 'daily', 'every_other_day', 'weekly', 'monthly', 'custom'] as const).map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setRecurrencePattern(p)}
                          className="px-2 py-1.5 text-xs font-medium rounded-full transition-all"
                          style={recurrencePattern === p
                            ? { backgroundColor: 'rgba(141,162,134,0.14)', color: '#8DA286', border: '1.5px solid #8DA286' }
                            : { backgroundColor: 'transparent', color: '#636366', border: '1.5px solid rgba(0,0,0,0.12)' }}
                        >
                          {p === 'none' ? 'None' : p === 'every_other_day' ? 'Every other day' : p.charAt(0).toUpperCase() + p.slice(1)}
                        </button>
                      ))}
                    </div>
                    {recurrencePattern === 'custom' && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, i) => (
                          <button
                            key={day}
                            type="button"
                            onClick={() => { setRecurrenceDays((prev) => prev.includes(i) ? prev.filter((d) => d !== i) : [...prev, i].sort((a, b) => a - b)); }}
                            className="px-2 py-1 text-xs font-medium rounded-full"
                            style={recurrenceDays.includes(i)
                              ? { backgroundColor: 'rgba(141,162,134,0.14)', color: '#8DA286', border: '1.5px solid #8DA286' }
                              : { backgroundColor: 'transparent', color: '#636366', border: '1.5px solid rgba(0,0,0,0.12)' }}
                          >
                            {day}
                          </button>
                        ))}
                      </div>
                    )}
                    {editingEvent && (editingEvent.recurring || recurrencePattern !== 'none') && (
                      <div className="mt-2">
                        <label className="block text-xs font-semibold mb-1" style={{ color: '#636366' }}>Edit scope</label>
                        <div className="flex flex-wrap gap-1.5">
                          {(['this', 'all', 'all_after'] as const).map((scope) => (
                            <button
                              key={scope}
                              type="button"
                              onClick={() => setRecurrenceEditScope(scope)}
                              className="px-2 py-1.5 text-xs font-medium rounded-full transition-all"
                              style={recurrenceEditScope === scope
                                ? { backgroundColor: 'rgba(141,162,134,0.14)', color: '#8DA286', border: '1.5px solid #8DA286' }
                                : { backgroundColor: 'transparent', color: '#636366', border: '1.5px solid rgba(0,0,0,0.12)' }}
                            >
                              {scope === 'this' ? 'This event' : scope === 'all' ? 'All events' : 'All after'}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          </div>

          {/* Submit row */}
          <div className="px-4 py-3 flex gap-2 shrink-0" style={{ borderTop: '1px solid rgba(0,0,0,0.08)', backgroundColor: '#FFFFFF' }}>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-3 py-2 text-sm font-medium rounded-xl transition-colors"
              style={{ backgroundColor: 'rgba(0,0,0,0.05)', color: '#636366' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || (!selectedCategory && !categoryInput.trim())}
              className="flex-1 px-3 py-2 text-sm font-semibold rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
              style={{ backgroundColor: '#8DA286', color: '#1C1C1E' }}
            >
              <PlusIcon className="h-4 w-4" />
              {mode === 'task' && editingTask ? 'Save Task' : editingEvent || editingTimeBlock ? 'Save' : `Add ${mode === 'task' ? 'Task' : 'Event'}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
