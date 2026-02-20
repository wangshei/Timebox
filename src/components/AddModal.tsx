import React, { useState, useEffect, useRef } from 'react';
import { XMarkIcon, PlusIcon, TagIcon, Bars3Icon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/solid';
import { Category, Tag } from '../App';
import { DEFAULT_PALETTE_COLOR } from '../constants/colors';
import { getLocalDateString } from '../utils/dateTime';
import type { CalendarContainer, Task, TimeBlock, Event, Mode, RecurrencePattern } from '../types';

type AddMode = 'task' | 'event';

interface AddModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  tags: Tag[];
  calendarContainers?: CalendarContainer[];
  initialMode?: AddMode;
  /** App plan/record mode — when recording, modal shows only "Record Event" with gray header */
  viewMode?: Mode;
  /** Switch plan/record from modal (so user can change mode with popup open) */
  onViewModeChange?: (mode: Mode) => void;
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
  viewMode = 'planning',
  onViewModeChange,
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
  const isRecording = viewMode === 'recording';
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
  const [moreOpen, setMoreOpen] = useState(false);
  const [recurrencePattern, setRecurrencePattern] = useState<RecurrencePattern>('none');
  const [recurrenceDays, setRecurrenceDays] = useState<number[]>([]); // 0=Sun .. 6=Sat for custom
  const [recurrenceEditScope, setRecurrenceEditScope] = useState<'this' | 'all' | 'all_after'>('this');

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
    }
  }, [isOpen, editingEvent?.id, categories]);

  // Reset when modal opens with new mode (and not editing). When recording, force event-only.
  useEffect(() => {
    if (isOpen && !editingTask && !editingTimeBlock && !editingEvent) {
      setMode(isRecording ? 'event' : initialMode);
    }
  }, [isOpen, initialMode, isRecording, editingTask, editingTimeBlock, editingEvent]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const fallbackCalendar =
      selectedCalendar || calendars[0]?.id || (editingTimeBlock?.calendarContainerId ?? editingEvent?.calendarContainerId ?? '');
    if (!fallbackCalendar) {
      if (!calendars.length && onRequireCalendar) onRequireCalendar();
      return;
    }

    // Resolve category: when user typed a name, use it (find existing or create); otherwise use selected or first for calendar
    const typedCategoryName = categoryInput.trim();
    let categoryToUse: Category | null = null;
    if (typedCategoryName) {
      const matchCalendar = (c: Category) =>
        c.calendarContainerId === fallbackCalendar ||
        (c.calendarContainerIds && c.calendarContainerIds.length > 0 && c.calendarContainerIds.includes(fallbackCalendar));
      const existing = categories.find(
        (c) => c.name.toLowerCase() === typedCategoryName.toLowerCase() && matchCalendar(c)
      );
      categoryToUse = existing ?? (onAddCategory ? onAddCategory({
        name: typedCategoryName,
        color: DEFAULT_PALETTE_COLOR,
        calendarContainerId: fallbackCalendar,
        calendarContainerIds: [fallbackCalendar],
      }) : null);
    }
    if (!categoryToUse) {
      categoryToUse = selectedCategory ?? categories.find((c) => c.calendarContainerId === fallbackCalendar) ?? categories.find((c) => c.calendarContainerIds?.includes(fallbackCalendar)) ?? null;
    }
    if (!categoryToUse) return;

    // Resolve tags: selectedTags + create from tagInput (comma-separated) under categoryToUse
    let tagsToUse = [...selectedTags];
    if (tagInput.trim() && onAddTag) {
      const names = tagInput.split(',').map((s) => s.trim()).filter(Boolean);
      for (const name of names) {
        const existing = tags.find((t) => t.name.toLowerCase() === name.toLowerCase() && t.categoryId === categoryToUse!.id);
        if (existing) tagsToUse.push(existing);
        else tagsToUse.push(onAddTag({ name, categoryId: categoryToUse.id }));
      }
    }

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
      });
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
    setDate(getLocalDateString());
    setStartTime('09:00');
    setEndTime('10:00');
    setSelectedCategory(categories[0] || null);
    setSelectedTags([]);
    setCategoryInput('');
    setTagInput('');
    setSelectedCalendar(calendars[0]?.id ?? 'personal');
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

      {/* Draggable panel — fixed width so Add Task and Add Event (from + button) match */}
      <div
        className="absolute pointer-events-auto bg-white shadow-xl rounded-2xl border border-neutral-200 flex flex-col overflow-hidden"
        style={{
          left: panelPos.x,
          top: panelPos.y,
          width: `${PANEL_WIDTH}px`,
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: maxH,
        }}
      >
        {/* Drag handle + Header — gray when recording to differentiate "Record Event" */}
        <div
          className={`flex items-center gap-2 px-3 py-2 border-b border-neutral-200 shrink-0 cursor-grab active:cursor-grabbing select-none ${
            isRecording ? 'bg-neutral-200' : ''
          }`}
          onMouseDown={(e) => {
            if ((e.target as HTMLElement).closest('button')) return;
            setIsDragging(true);
            dragStart.current = { x: e.clientX, y: e.clientY, left: panelPos.x, top: panelPos.y };
          }}
        >
          <Bars3Icon className="h-4 w-4 text-neutral-400 shrink-0" />
          <h2 className="text-sm font-medium text-neutral-900 flex-1 min-w-0 truncate">
            {editingTask
              ? 'Edit Task'
              : editingTimeBlock || editingEvent
                ? 'Edit Event'
                : isRecording
                  ? 'Record Event'
                  : mode === 'task'
                    ? 'Add Task'
                    : 'Add Planned'}
          </h2>
          {!editingTask && !editingTimeBlock && !editingEvent && onViewModeChange && (
            <button
              type="button"
              onClick={() => onViewModeChange(viewMode === 'planning' ? 'recording' : 'planning')}
              className="px-2 py-1 text-xs font-medium rounded transition-all touch-manipulation bg-white text-neutral-800 shadow-sm border border-neutral-100 shrink-0 hover:bg-neutral-50"
            >
              {viewMode === 'planning' ? 'Record Mode' : 'Plan Mode'}
            </button>
          )}
          <button type="button" onClick={onClose} className="p-1.5 hover:bg-neutral-100 rounded-md transition-colors shrink-0">
            <XMarkIcon className="h-4 w-4 text-neutral-500" />
          </button>
        </div>

        {/* Task/Event Toggle — only in planning mode; recording is event-only (things that happened) */}
        {!editingTimeBlock && !editingEvent && !isRecording && (
          <div className="px-4 pt-3">
            <div className="bg-neutral-100 rounded-md p-0.5 flex">
              <button type="button" onClick={() => setMode('task')} className={`flex-1 py-1.5 px-3 rounded text-xs font-medium transition-all ${mode === 'task' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'}`}>
                Task
              </button>
              <button type="button" onClick={() => setMode('event')} className={`flex-1 py-1.5 px-3 rounded text-xs font-medium transition-all ${mode === 'event' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'}`}>
                Event
              </button>
            </div>
          </div>
        )}

        {/* Form — compact, scrollable; primary button is type="submit" so Enter submits */}
        <form
          onSubmit={handleSubmit}
          className="flex-1 min-h-0 flex flex-col overflow-hidden"
        >
          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-4">
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">{mode === 'task' ? 'Task Title' : 'Event Title'}</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={mode === 'task' ? 'e.g., Finish proposal' : 'e.g., Team meeting'} className="w-full px-3 py-2 text-sm bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" autoFocus />
          </div>

          {mode === 'task' && (
            <>
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1">Estimated Hours</label>
                <div className="flex gap-2 items-center">
                  <input type="range" min="0.5" max="8" step="0.5" value={estimatedHours} onChange={(e) => setEstimatedHours(parseFloat(e.target.value))} className="flex-1 h-1.5 bg-neutral-200 rounded-lg appearance-none cursor-pointer" style={{ background: `linear-gradient(to right, #0044A8 0%, #0044A8 ${((estimatedHours - 0.5) / 7.5) * 100}%, #e5e7eb ${((estimatedHours - 0.5) / 7.5) * 100}%, #e5e7eb 100%)` }} />
                  <span className="text-sm font-medium text-neutral-900 w-8">{estimatedHours}h</span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1">Due date (optional)</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </>
          )}

          {mode === 'event' && (
            <>
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1">Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">Start</label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">End</label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </>
          )}

          {/* Calendar — horizontal pill select */}
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">
              Calendar (left border on block)
            </label>
            {calendars.length === 0 ? (
              <button
                type="button"
                onClick={onRequireCalendar}
                className="w-full px-3 py-2 text-xs font-medium text-blue-700 bg-blue-50 border border-dashed border-blue-300 rounded-lg hover:bg-blue-100 flex items-center justify-center gap-1.5"
              >
                <PlusIcon className="h-3.5 w-3.5" />
                Add a calendar to schedule events
              </button>
            ) : (
              <div className="flex gap-1.5 flex-wrap">
                {calendars.map((cal) => (
                  <button
                    key={cal.id}
                    type="button"
                    onClick={() => setSelectedCalendar(cal.id)}
                    className={`min-w-[70px] px-2 py-1.5 rounded-md border text-xs font-medium transition-all capitalize flex items-center justify-center ${
                      selectedCalendar === cal.id
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-neutral-200 text-neutral-600 hover:border-neutral-300'
                    }`}
                  >
                    {cal.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Category — same horizontal pill select, with colored dot */}
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">
              Category (color on block)
            </label>
            <div className="flex gap-1.5 flex-wrap">
              {categoriesToShow
                .filter((category) => {
                  if (!selectedCalendar) return true;
                  const ids = category.calendarContainerIds;
                  if (ids && ids.length > 0) return ids.includes(selectedCalendar);
                  return category.calendarContainerId === selectedCalendar || !category.calendarContainerId;
                })
                .map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => { setSelectedCategory(category); setCategoryInput(''); }}
                    className={`min-w-[70px] px-2 py-1.5 rounded-md border text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
                      selectedCategory?.id === category.id
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-neutral-200 text-neutral-600 hover:border-neutral-300'
                    }`}
                  >
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: category.color }}
                    />
                    {category.name}
                  </button>
                ))}
            </div>
            <input
              type="text"
              value={categoryInput}
              onChange={(e) => setCategoryInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const name = categoryInput.trim();
                  if (!name) return;
                  const forCalendar = categories.filter((c) => c.calendarContainerId === selectedCalendar);
                  const existing = forCalendar.find((c) => c.name.toLowerCase() === name.toLowerCase());
                  if (existing) {
                    setSelectedCategory(existing);
                    setCategoryInput('');
                  } else if (onAddCategory && selectedCalendar) {
                    const newCat = onAddCategory({ name, color: DEFAULT_PALETTE_COLOR, calendarContainerId: selectedCalendar });
                    setSelectedCategory(newCat);
                    setCategoryInput('');
                  }
                }
              }}
              placeholder="Type and Enter to add"
              className="mt-1.5 w-full px-2 py-1.5 text-xs bg-neutral-50 border border-neutral-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Tags — same horizontal pill select, with tag icon; multi-select */}
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">Tags (optional)</label>
            <div className="flex gap-1.5 flex-wrap">
              {tags
                .filter((t) => t.categoryId === selectedCategory?.id)
                .map((tag) => {
                  const isSelected = selectedTags.some((s) => s.id === tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => toggleTag(tag)}
                      className={`min-w-[60px] px-2 py-1.5 rounded-md border text-xs font-medium transition-all flex items-center justify-center gap-1 ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-neutral-200 text-neutral-600 hover:border-neutral-300'
                      }`}
                    >
                      <TagIcon className="h-3 w-3 shrink-0" />
                      {tag.name}
                    </button>
                  );
                })}
            </div>
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault();
                  const name = tagInput.trim().replace(/,/g, '');
                  if (!name) return;
                  const categoryId = selectedCategory?.id ?? null;
                  if (!categoryId) return;
                  const existing = tags.find((t) => t.name.toLowerCase() === name.toLowerCase() && t.categoryId === categoryId);
                  if (existing) setSelectedTags((prev) => (prev.some((t) => t.id === existing.id) ? prev : [...prev, existing]));
                  else if (onAddTag) setSelectedTags((prev) => [...prev, onAddTag({ name, categoryId })]);
                  setTagInput('');
                }
              }}
              placeholder="Type and Enter to add"
              className="mt-1.5 w-full px-2 py-1.5 text-xs bg-neutral-50 border border-neutral-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* More — Link, Description, Repeat (collapsible) */}
          <div className="border border-neutral-200 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setMoreOpen((o) => !o)}
              className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-neutral-700 bg-neutral-50 hover:bg-neutral-100 ${moreOpen ? 'border-b border-neutral-200' : ''}`}
            >
              <span>More (link, description{mode === 'event' ? ', repeat' : ''})</span>
              {moreOpen ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
            </button>
            {moreOpen && (
              <div className="p-3 space-y-3 bg-white">
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">Link (optional)</label>
                  <input type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://..." className="w-full px-3 py-2 text-sm bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">Description (optional)</label>
                  <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Notes or details..." rows={2} className="w-full px-3 py-2 text-sm bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y" />
                </div>
                {mode === 'event' && (
                  <div>
                    <label className="block text-xs font-medium text-neutral-600 mb-1">Repeat</label>
                    <div className="flex flex-wrap gap-1.5">
                      {(['none', 'daily', 'every_other_day', 'weekly', 'monthly', 'custom'] as const).map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setRecurrencePattern(p)}
                          className={`px-2 py-1.5 text-xs font-medium rounded-md border transition-all ${
                            recurrencePattern === p
                              ? 'bg-blue-50 border-blue-500 text-blue-700'
                              : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                          }`}
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
                            className={`px-2 py-1 text-xs font-medium rounded border ${
                              recurrenceDays.includes(i) ? 'bg-blue-50 border-blue-500 text-blue-700' : 'border-neutral-200 text-neutral-600'
                            }`}
                          >
                            {day}
                          </button>
                        ))}
                      </div>
                    )}
                    {editingEvent && (editingEvent.recurring || recurrencePattern !== 'none') && (
                      <div className="mt-2">
                        <label className="block text-xs font-medium text-neutral-600 mb-1">Edit</label>
                        <div className="flex flex-wrap gap-1.5">
                          {(['this', 'all', 'all_after'] as const).map((scope) => (
                            <button
                              key={scope}
                              type="button"
                              onClick={() => setRecurrenceEditScope(scope)}
                              className={`px-2 py-1.5 text-xs font-medium rounded-md border transition-all ${
                                recurrenceEditScope === scope
                                  ? 'bg-blue-50 border-blue-500 text-blue-700'
                                  : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                              }`}
                            >
                              {scope === 'this' ? 'This event' : scope === 'all' ? 'All events' : 'All events after'}
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

          <div className="px-4 py-3 border-t border-neutral-200 flex gap-2 shrink-0 bg-white">
            <button type="button" onClick={onClose} className="flex-1 px-3 py-2 text-sm font-medium text-neutral-700 bg-neutral-100 rounded-lg hover:bg-neutral-200">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || (!selectedCategory && !categoryInput.trim())}
              className="flex-1 px-3 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
            >
              <PlusIcon className="h-4 w-4" />
              {mode === 'task' && editingTask ? 'Save' : editingEvent || editingTimeBlock ? 'Save' : isRecording ? 'Record Event' : `Add ${mode === 'task' ? 'Task' : 'Event'}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
