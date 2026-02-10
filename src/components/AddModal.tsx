import React, { useState, useEffect } from 'react';
import { X, Plus, Tag as TagIcon, Calendar as CalendarIcon } from 'lucide-react';
import { Category, Tag } from '../App';
import type { CalendarContainer, Task } from '../types';

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
  onAddTask: (task: {
    title: string;
    estimatedHours: number;
    category: Category;
    tags: Tag[];
    calendar: 'personal' | 'work' | 'school';
  }) => void;
  onUpdateTask?: (id: string, updates: Partial<Task>) => void;
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

export function AddModal({ isOpen, onClose, categories, tags, calendarContainers = [], initialMode = 'task', editingTask = null, onAddTask, onUpdateTask, onAddEvent }: AddModalProps) {
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

  // Reset when modal opens with new mode (and not editing)
  useEffect(() => {
    if (isOpen && !editingTask) {
      setMode(initialMode);
    }
  }, [isOpen, initialMode, editingTask]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !selectedCategory) return;

    if (mode === 'task') {
      onAddTask({
        title,
        estimatedHours,
        category: selectedCategory,
        tags: selectedTags,
        calendar: selectedCalendar,
      });
    } else {
      onAddEvent({
        title,
        startTime,
        endTime,
        date,
        category: selectedCategory,
        tags: selectedTags,
        calendar: selectedCalendar,
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

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white w-full md:w-[500px] md:rounded-2xl rounded-t-2xl shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
          <h2 className="text-lg font-medium text-neutral-900">
            {mode === 'task' ? (editingTask ? 'Edit Task' : 'Add New Task') : 'Add New Event'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-neutral-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-neutral-500" />
          </button>
        </div>

        {/* Mode Toggle */}
        <div className="px-6 pt-4">
          <div className="bg-neutral-100 rounded-lg p-1 flex">
            <button
              type="button"
              onClick={() => setMode('task')}
              className={`flex-1 py-2 px-4 rounded-md transition-all text-sm font-medium ${
                mode === 'task'
                  ? 'bg-white text-neutral-900 shadow-sm'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Task
            </button>
            <button
              type="button"
              onClick={() => setMode('event')}
              className={`flex-1 py-2 px-4 rounded-md transition-all text-sm font-medium ${
                mode === 'event'
                  ? 'bg-white text-neutral-900 shadow-sm'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Event
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              {mode === 'task' ? 'Task Title' : 'Event Title'}
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={mode === 'task' ? 'e.g., Finish project proposal' : 'e.g., Team meeting'}
              className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              autoFocus
            />
          </div>

          {/* Task: Estimated Hours */}
          {mode === 'task' && (
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Estimated Hours
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="0.5"
                  max="8"
                  step="0.5"
                  value={estimatedHours}
                  onChange={(e) => setEstimatedHours(parseFloat(e.target.value))}
                  className="flex-1 h-2 bg-neutral-200 rounded-lg appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, #0044A8 0%, #0044A8 ${((estimatedHours - 0.5) / 7.5) * 100}%, #e5e7eb ${((estimatedHours - 0.5) / 7.5) * 100}%, #e5e7eb 100%)`
                  }}
                />
                <div className="w-16 px-3 py-2 bg-neutral-100 rounded-lg text-center font-medium text-neutral-900">
                  {estimatedHours}h
                </div>
              </div>
            </div>
          )}

          {/* Event: Date and Time */}
          {mode === 'event' && (
            <>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Date
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    Start Time
                  </label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    End Time
                  </label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>
              </div>
            </>
          )}

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-3">
              Category
            </label>
            <div className="grid grid-cols-2 gap-2">
              {categories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => setSelectedCategory(category)}
                  className={`px-4 py-3 rounded-lg border-2 transition-all flex items-center gap-2 ${
                    selectedCategory?.id === category.id
                      ? 'border-current shadow-sm'
                      : 'border-neutral-200 hover:border-neutral-300'
                  }`}
                  style={{
                    color: selectedCategory?.id === category.id ? category.color : '#737373',
                    backgroundColor: selectedCategory?.id === category.id ? `${category.color}10` : 'transparent',
                  }}
                >
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: category.color }}
                  />
                  <span className="text-sm font-medium">{category.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Calendar */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-3">
              Calendar
            </label>
            <div className="flex gap-2 flex-wrap">
              {calendars.map((cal) => (
                <button
                  key={cal.id}
                  type="button"
                  onClick={() => setSelectedCalendar(cal.id)}
                  className={`flex-1 min-w-[80px] px-4 py-2.5 rounded-lg border-2 transition-all capitalize ${
                    selectedCalendar === cal.id
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-neutral-200 text-neutral-600 hover:border-neutral-300'
                  }`}
                >
                  {cal.name}
                </button>
              ))}
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-3">
              Tags (optional)
            </label>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => {
                const isSelected = selectedTags.find(t => t.id === tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`px-3 py-1.5 rounded-full text-sm transition-all flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-neutral-900 text-white'
                        : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                    }`}
                  >
                    <TagIcon className="w-3 h-3" />
                    {tag.name}
                  </button>
                );
              })}
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-neutral-200 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-3 bg-neutral-100 text-neutral-700 rounded-lg hover:bg-neutral-200 transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!title.trim() || !selectedCategory}
            className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Plus className="w-5 h-5" />
            {mode === 'task' && editingTask ? 'Save' : `Add ${mode === 'task' ? 'Task' : 'Event'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
