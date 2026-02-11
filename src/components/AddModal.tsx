import React, { useState, useEffect, useRef } from 'react';
import { X, Plus, Tag as TagIcon, GripVertical } from 'lucide-react';
import { Category, Tag } from '../App';
import type { CalendarContainer, Task, TimeBlock } from '../types';

type AddMode = 'task' | 'event';

interface AddModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  tags: Tag[];
  calendarContainers?: CalendarContainer[];
  initialMode?: AddMode;
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
  editingTask = null,
  editingTimeBlock = null,
  onAddTask,
  onUpdateTask,
  onUpdateTimeBlock,
  onAddEvent,
}: AddModalProps) {
  const [mode, setMode] = useState<AddMode>(initialMode);
  const [title, setTitle] = useState('');
  const [estimatedHours, setEstimatedHours] = useState(1);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(categories[0] || null);
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]);
  const defaultCalendars = [{ id: 'personal', name: 'Personal', color: '#86C0F4' }, { id: 'work', name: 'Work', color: '#9F5FB0' }, { id: 'school', name: 'School', color: '#EC8309' }];
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

  // Reset when modal opens with new mode (and not editing)
  useEffect(() => {
    if (isOpen && !editingTask && !editingTimeBlock) {
      setMode(initialMode);
    }
  }, [isOpen, initialMode, editingTask, editingTimeBlock]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const fallbackCategory = selectedCategory ?? categories[0] ?? null;
    const fallbackCalendar =
      selectedCalendar || calendars[0]?.id || (editingTimeBlock?.calendarContainerId ?? '');

    if (!fallbackCategory || !fallbackCalendar) return;

    // When editing an existing time block (e.g. created by drag), always treat as event submit.
    if (editingTimeBlock && onUpdateTimeBlock) {
      onUpdateTimeBlock(editingTimeBlock.id, {
        title,
        start: startTime,
        end: endTime,
        date,
        calendarContainerId: fallbackCalendar,
        categoryId: fallbackCategory.id,
        tagIds: selectedTags.map((t) => t.id),
      });
    } else if (mode === 'task') {
      onAddTask({
        title,
        estimatedHours,
        category: fallbackCategory,
        tags: selectedTags,
        calendar: fallbackCalendar,
      });
    } else {
      onAddEvent({
        title,
        startTime,
        endTime,
        date,
        category: fallbackCategory,
        tags: selectedTags,
        calendar: fallbackCalendar,
      });
    }

    // Reset form
    setTitle('');
    setEstimatedHours(1);
    setDate(new Date().toISOString().split('T')[0]);
    setStartTime('09:00');
    setEndTime('10:00');
    setSelectedCategory(categories[0] || null);
    setSelectedTags([]);
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
        className="absolute pointer-events-auto bg-white w-[380px] max-w-[calc(100vw-32px)] shadow-xl rounded-xl border border-neutral-200 flex flex-col overflow-hidden"
        style={{
          left: panelPos.x,
          top: panelPos.y,
          maxHeight: maxH,
        }}
      >
        {/* Drag handle + Header */}
        <div
          className="flex items-center gap-2 px-3 py-2 border-b border-neutral-200 shrink-0 cursor-grab active:cursor-grabbing select-none"
          onMouseDown={(e) => {
            if ((e.target as HTMLElement).closest('button')) return;
            setIsDragging(true);
            dragStart.current = { x: e.clientX, y: e.clientY, left: panelPos.x, top: panelPos.y };
          }}
        >
          <GripVertical className="w-4 h-4 text-neutral-400 shrink-0" />
          <h2 className="text-sm font-medium text-neutral-900 flex-1 truncate">
            {mode === 'task'
              ? (editingTask ? 'Edit Task' : 'Add Task')
              : (editingTimeBlock ? 'Edit Event' : 'Add Event')}
          </h2>
          <button type="button" onClick={onClose} className="p-1.5 hover:bg-neutral-100 rounded-md transition-colors shrink-0">
            <X className="w-4 h-4 text-neutral-500" />
          </button>
        </div>

        {/* Mode Toggle (hidden when editing an event block) */}
        {!editingTimeBlock && (
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

        {/* Form — compact, scrollable */}
        <form onSubmit={handleSubmit} className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-4">
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
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full px-3 py-2 text-sm bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">Start</label>
                  <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-full px-3 py-2 text-sm bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">End</label>
                  <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="w-full px-3 py-2 text-sm bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">Category (type of activity — color on block)</label>
            <div className="grid grid-cols-2 gap-1.5">
              {categories.map((category) => (
                <button key={category.id} type="button" onClick={() => setSelectedCategory(category)} className={`px-2 py-2 rounded-md border transition-all flex items-center gap-1.5 text-xs font-medium ${selectedCategory?.id === category.id ? 'border-current shadow-sm' : 'border-neutral-200 hover:border-neutral-300'}`} style={{ color: selectedCategory?.id === category.id ? category.color : '#737373', backgroundColor: selectedCategory?.id === category.id ? `${category.color}15` : 'transparent' }}>
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: category.color }} />
                  {category.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">Calendar (e.g. Work, School — left border on block)</label>
            <div className="flex gap-1.5 flex-wrap">
              {calendars.map((cal) => (
                <button key={cal.id} type="button" onClick={() => setSelectedCalendar(cal.id)} className={`min-w-[70px] px-2 py-1.5 rounded-md border text-xs font-medium transition-all capitalize ${selectedCalendar === cal.id ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-neutral-200 text-neutral-600 hover:border-neutral-300'}`}>
                  {cal.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">Tags (optional — e.g. dance under Hobby)</label>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => {
                const isSelected = selectedTags.find(t => t.id === tag.id);
                return (
                  <button key={tag.id} type="button" onClick={() => toggleTag(tag)} className={`px-2 py-1 rounded-full text-xs transition-all flex items-center gap-1 ${isSelected ? 'bg-neutral-800 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}>
                    <TagIcon className="w-3 h-3" />
                    {tag.name}
                  </button>
                );
              })}
            </div>
          </div>
        </form>

        <div className="px-4 py-3 border-t border-neutral-200 flex gap-2 shrink-0 bg-white">
          <button type="button" onClick={onClose} className="flex-1 px-3 py-2 text-sm font-medium text-neutral-700 bg-neutral-100 rounded-lg hover:bg-neutral-200">
            Cancel
          </button>
          <button type="button" onClick={handleSubmit} disabled={!title.trim() || !selectedCategory} className="flex-1 px-3 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5">
            <Plus className="w-4 h-4" />
            {mode === 'task' && editingTask ? 'Save' : `Add ${mode === 'task' ? 'Task' : 'Event'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
