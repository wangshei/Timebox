import React, { useState, useEffect, useRef } from 'react';
import { XMarkIcon, PlusIcon, TagIcon, Bars3Icon } from '@heroicons/react/24/solid';
import { Category, Tag } from '../App';
import { DEFAULT_PALETTE_COLOR } from '../constants/colors';
import { getLocalDateString } from '../utils/dateTime';
import type { CalendarContainer, Task, TimeBlock, Mode } from '../types';

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
  onAddTask: (task: {
    title: string;
    estimatedHours: number;
    category: Category;
    tags: Tag[];
    calendar: 'personal' | 'work' | 'school';
  }) => void;
  onUpdateTask?: (id: string, updates: Partial<Task>) => void;
  onUpdateTimeBlock?: (id: string, updates: Partial<TimeBlock>) => void;
  onAddEvent: (event: {
    title: string;
    startTime: string;
    endTime: string;
    date: string;
    category: Category;
    tags: Tag[];
    calendar: string;
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
  onAddTask,
  onUpdateTask,
  onUpdateTimeBlock,
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

  const [panelPos, setPanelPos] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, left: 0, top: 0 });

  useEffect(() => {
    if (isOpen && typeof window !== 'undefined') {
      const maxH = (window.innerHeight * PANEL_MAX_HEIGHT) / 100;
      const x = Math.max(16, window.innerWidth - PANEL_WIDTH - 24);
      const y = Math.max(16, window.innerHeight - maxH - 24);
      setPanelPos({ x, y });
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
    }
  }, [isOpen, editingTimeBlock?.id, categories, tags]);

  // Reset when modal opens with new mode (and not editing). When recording, force event-only.
  useEffect(() => {
    if (isOpen && !editingTask && !editingTimeBlock) {
      setMode(isRecording ? 'event' : initialMode);
    }
  }, [isOpen, initialMode, isRecording, editingTask, editingTimeBlock]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const fallbackCalendar =
      selectedCalendar || calendars[0]?.id || (editingTimeBlock?.calendarContainerId ?? '');
    if (!fallbackCalendar) {
      if (!calendars.length && onRequireCalendar) onRequireCalendar();
      return;
    }

    // Resolve category: use selected, or create from typed name if we have onAddCategory
    let categoryToUse = selectedCategory ?? categories.find((c) => c.calendarContainerId === fallbackCalendar) ?? null;
    if (!categoryToUse && categoryInput.trim() && onAddCategory) {
      categoryToUse = onAddCategory({
        name: categoryInput.trim(),
        color: DEFAULT_PALETTE_COLOR,
        calendarContainerId: fallbackCalendar,
      });
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

    if (editingTimeBlock && onUpdateTimeBlock) {
      onUpdateTimeBlock(editingTimeBlock.id, {
        title,
        start: startTime,
        end: endTime,
        date,
        calendarContainerId: fallbackCalendar,
        categoryId: categoryToUse.id,
        tagIds: tagsToUse.map((t) => t.id),
      });
    } else if (mode === 'task') {
      onAddTask({
        title,
        estimatedHours,
        category: categoryToUse,
        tags: tagsToUse,
        calendar: fallbackCalendar,
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
      });
    }

    setTitle('');
    setEstimatedHours(1);
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

      {/* Draggable small panel — doesn't block calendar */}
      <div
        className="absolute pointer-events-auto bg-white w-[380px] max-w-[calc(100vw-32px)] shadow-xl rounded-2xl border border-neutral-200 flex flex-col overflow-hidden"
        style={{
          left: panelPos.x,
          top: panelPos.y,
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
              : editingTimeBlock
                ? 'Edit Event'
                : isRecording
                  ? 'Record Event'
                  : mode === 'task'
                    ? 'Add Task'
                    : 'Add Planned'}
          </h2>
          {!editingTask && !editingTimeBlock && onViewModeChange && (
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
        {!editingTimeBlock && !isRecording && (
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
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Estimated Hours</label>
              <div className="flex gap-2 items-center">
                <input type="range" min="0.5" max="8" step="0.5" value={estimatedHours} onChange={(e) => setEstimatedHours(parseFloat(e.target.value))} className="flex-1 h-1.5 bg-neutral-200 rounded-lg appearance-none cursor-pointer" style={{ background: `linear-gradient(to right, #0044A8 0%, #0044A8 ${((estimatedHours - 0.5) / 7.5) * 100}%, #e5e7eb ${((estimatedHours - 0.5) / 7.5) * 100}%, #e5e7eb 100%)` }} />
                <span className="text-sm font-medium text-neutral-900 w-8">{estimatedHours}h</span>
              </div>
            </div>
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

          {/* Calendar before category so category choices can depend on calendar */}
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">
              Calendar (e.g. Work, School — left border on block)
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
                    className={`min-w-[70px] px-2 py-1.5 rounded-md border text-xs font-medium transition-all capitalize ${
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

          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">
              Category (type of activity — color on block)
            </label>
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
              placeholder="Type category name and press Enter to add or select"
              className="w-full px-3 py-2 text-sm bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
            />
            <div className="grid grid-cols-2 gap-1.5">
              {categories
                .filter((category) =>
                  selectedCalendar && category.calendarContainerId
                    ? category.calendarContainerId === selectedCalendar
                    : true
                )
                .map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => { setSelectedCategory(category); setCategoryInput(''); }}
                    className={`px-2 py-2 rounded-md border transition-all flex items-center gap-1.5 text-xs font-medium ${
                      selectedCategory?.id === category.id
                        ? 'border-current shadow-sm'
                        : 'border-neutral-200 hover:border-neutral-300'
                    }`}
                    style={{
                      color: selectedCategory?.id === category.id ? category.color : '#737373',
                      backgroundColor: selectedCategory?.id === category.id ? `${category.color}15` : 'transparent',
                    }}
                  >
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: category.color }}
                    />
                    {category.name}
                  </button>
                ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">Tags (optional — type and press Enter to add)</label>
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
              placeholder="Type tag name, press Enter to add"
              className="w-full px-3 py-2 text-sm bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
            />
            <div className="flex flex-wrap gap-1.5">
              {selectedTags.map((tag) => (
                <span key={tag.id} className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-neutral-800 text-white">
                  <TagIcon className="h-3 w-3" />
                  {tag.name}
                </span>
              ))}
              {tags
                .filter((t) => t.categoryId === selectedCategory?.id && !selectedTags.some((s) => s.id === t.id))
                .map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className="px-2 py-1 rounded-full text-xs bg-neutral-100 text-neutral-600 hover:bg-neutral-200 flex items-center gap-1"
                  >
                    <TagIcon className="h-3 w-3" />
                    {tag.name}
                  </button>
                ))}
            </div>
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
              {mode === 'task' && editingTask ? 'Save' : isRecording ? 'Record Event' : `Add ${mode === 'task' ? 'Task' : 'Event'}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
