import React, { useState, useEffect, useRef } from 'react';
import { XMarkIcon, PlusIcon, TagIcon, Bars3Icon, ChevronDownIcon, ChevronUpIcon, StarIcon, UserPlusIcon, ClockIcon, CalendarDaysIcon, PencilSquareIcon, CheckCircleIcon } from '@heroicons/react/24/solid';
import type { Category, Tag } from '../types';
import { DEFAULT_PALETTE_COLOR, THEME } from '../constants/colors';
import { getLocalDateString, getLocalTimeZone, getTimezoneAbbr } from '../utils/dateTime';

// Common IANA timezones shown at top of picker
const COMMON_TIMEZONES = [
  'America/Los_Angeles', 'America/Denver', 'America/Chicago', 'America/New_York',
  'America/Toronto', 'America/Sao_Paulo', 'Europe/London', 'Europe/Paris',
  'Europe/Berlin', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Shanghai', 'Asia/Tokyo',
  'Asia/Seoul', 'Australia/Sydney', 'Pacific/Auckland',
];

function getAllTimezones(): string[] {
  try {
    if ('supportedValuesOf' in Intl) {
      return (Intl as unknown as { supportedValuesOf: (key: string) => string[] }).supportedValuesOf('timeZone');
    }
  } catch { /* fallback */ }
  return COMMON_TIMEZONES;
}

const ALL_TIMEZONES = getAllTimezones();
import type { CalendarContainer, Task, TimeBlock, Event, Mode, RecurrencePattern } from '../types';
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
  /** Pre-selected scope for editing a recurring event (passed from the scope picker popup). */
  initialRecurrenceEditScope?: 'this' | 'all' | 'all_after';
  /** Pre-fill date/time from drag-to-create (used when adding, not editing). */
  initialDate?: string | null;
  initialStartTime?: string | null;
  initialEndTime?: string | null;
  onAddTask: (task: {
    title: string;
    estimatedHours: number;
    category: Category;
    tags: Tag[];
    calendar: 'personal' | 'work' | 'school';
    dueDate?: string | null;
    link?: string | null;
    description?: string | null;
    notes?: string | null;
    /** When created from a calendar drag, schedule the task at this slot. */
    scheduleAt?: { date: string; startTime: string; endTime: string } | null;
  }) => void;
  onUpdateTask?: (id: string, updates: Partial<Task>) => void;
  onUpdateTimeBlock?: (id: string, updates: Partial<TimeBlock>) => void;
  onUpdateEvent?: (id: string, updates: Partial<Event> & { recurrenceEditScope?: 'this' | 'all' | 'all_after' }) => void;
  onAddEvent: (event: {
    title: string;
    startTime: string;
    endTime: string;
    date: string;
    endDate?: string;
    category: Category;
    tags: Tag[];
    calendar: string;
    recurring?: boolean;
    recurrencePattern?: RecurrencePattern;
    recurrenceDays?: number[];
    link?: string | null;
    description?: string | null;
    notes?: string | null;
    inviteEmails?: string[];
    excludedSubscribers?: string[];
    timezone?: string | null;
  }) => void;
  /** When the user needs to add a calendar (e.g. no calendars exist yet). */
  onRequireCalendar?: () => void;
  /** Create a category (e.g. from typed name); return the new category. Used for type-to-add. */
  onAddCategory?: (c: Omit<Category, 'id'>) => Category;
  /** Create a tag under a category; return the new tag. Used for type-to-add. */
  onAddTag?: (t: Omit<Tag, 'id'>) => Tag;
  /** Existing subscribers inherited from the selected calendar/category/tags. */
  existingSubscribers?: Array<{ email: string; source: string; sourceId: string }>;
}

const PANEL_WIDTH = 344;
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
  initialRecurrenceEditScope,
  onAddTask,
  onUpdateTask,
  onUpdateTimeBlock,
  onUpdateEvent,
  onAddEvent,
  onRequireCalendar,
  onAddCategory,
  onAddTag,
  initialDate = null,
  initialStartTime = null,
  initialEndTime = null,
  existingSubscribers = [],
}: AddModalProps) {
  const [mode, setMode] = useState<AddMode>(initialMode);
  const [title, setTitle] = useState('');
  const [estimatedHours, setEstimatedHours] = useState(1);
  const [date, setDate] = useState(getLocalDateString());
  const [endDate, setEndDate] = useState(getLocalDateString());
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
  const getCategoriesForCalendar = (calId: string): Category[] =>
    categories.filter(
      (c) =>
        c.calendarContainerId === calId ||
        (c.calendarContainerIds && c.calendarContainerIds.length > 0 && c.calendarContainerIds.includes(calId))
    );
  const firstCategoryForCalendar = (calId: string): Category | null =>
    getCategoriesForCalendar(calId)[0] ?? null;
  const [selectedCalendar, setSelectedCalendar] = useState(calendars[0]?.id ?? 'personal');
  const [dueDate, setDueDate] = useState<string>('');
  const [link, setLink] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [pinned, setPinned] = useState<boolean>(false);
  const [priority, setPriority] = useState<number | undefined>(undefined);
  const [moreOpen, setMoreOpen] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [recurrencePattern, setRecurrencePattern] = useState<RecurrencePattern>('none');
  const [recurrenceDays, setRecurrenceDays] = useState<number[]>([]); // 0=Sun .. 6=Sat for custom
  const [recurrenceEditScope, setRecurrenceEditScope] = useState<'this' | 'all' | 'all_after'>('this');
  const [showCategoryInput, setShowCategoryInput] = useState(false);
  const [showTagInput, setShowTagInput] = useState(false);

  // Invite state (event mode only)
  const [inviteEmails, setInviteEmails] = useState<string[]>([]);
  const [inviteInput, setInviteInput] = useState('');
  const [showInviteSection, setShowInviteSection] = useState(false);
  const [excludedSubscribers, setExcludedSubscribers] = useState<Set<string>>(new Set());

  // Timezone state (event mode only)
  const [timezone, setTimezone] = useState<string>(getLocalTimeZone());
  const [timezoneEnabled, setTimezoneEnabled] = useState(true);
  const [tzPickerOpen, setTzPickerOpen] = useState(false);
  const [tzSearch, setTzSearch] = useState('');
  const tzPickerRef = useRef<HTMLDivElement>(null);
  const tzSearchInputRef = useRef<HTMLInputElement>(null);

  // Close timezone picker on click outside
  useEffect(() => {
    if (!tzPickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (tzPickerRef.current && !tzPickerRef.current.contains(e.target as Node)) {
        setTzPickerOpen(false);
        setTzSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [tzPickerOpen]);

  const handleAddInvite = () => {
    const email = inviteInput.trim().toLowerCase();
    if (!email || !email.includes('@') || inviteEmails.includes(email)) return;
    setInviteEmails((prev) => [...prev, email]);
    setInviteInput('');
  };

  const handleRemoveInvite = (email: string) => {
    setInviteEmails((prev) => prev.filter((e) => e !== email));
  };

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

  // Reset recurrence when modal closes; apply initial scope when opening
  useEffect(() => {
    if (isOpen) {
      if (initialRecurrenceEditScope) {
        setRecurrenceEditScope(initialRecurrenceEditScope);
      }
    } else {
      setRecurrencePattern('none');
      setRecurrenceDays([]);
      setRecurrenceEditScope('this');
    }
  }, [isOpen, initialRecurrenceEditScope]);

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

  // Prefill when editing — only when modal opens or the edited entity changes (not when categories/tags update)
  // so that adding a new category/tag doesn't reset the form or wipe typed input.
  useEffect(() => {
    if (isOpen && editingTask) {
      setMode('task');
      setTitle(editingTask.title);
      setEstimatedHours(Math.round((editingTask.estimatedMinutes / 60) * 10) / 10);
      setSelectedCategory(categories.find(c => c.id === editingTask.categoryId) ?? firstCategoryForCalendar(editingTask.calendarContainerId) ?? null);
      setSelectedTags(tags.filter(t => editingTask.tagIds.includes(t.id)));
      setSelectedCalendar(editingTask.calendarContainerId);
      setDueDate(editingTask.dueDate ?? '');
      setLink(editingTask.link ?? '');
      setDescription(editingTask.description ?? '');
      setNotes(editingTask.notes ?? '');
      setPinned(!!editingTask.pinned);
      setPriority(typeof editingTask.priority === 'number' ? editingTask.priority : undefined);
    }
  }, [isOpen, editingTask?.id]); // categories/tags intentionally omitted to avoid form reset on add

  useEffect(() => {
    if (isOpen && editingTimeBlock) {
      setMode('event');
      setTitle(editingTimeBlock.title ?? '');
      setDate(editingTimeBlock.date);
      setEndDate(editingTimeBlock.date);
      setStartTime(editingTimeBlock.start);
      setEndTime(editingTimeBlock.end);
      setSelectedCategory(categories.find((c) => c.id === editingTimeBlock.categoryId) ?? firstCategoryForCalendar(editingTimeBlock.calendarContainerId) ?? null);
      setSelectedTags(tags.filter((t) => editingTimeBlock.tagIds.includes(t.id)));
      setSelectedCalendar(editingTimeBlock.calendarContainerId);
      setLink(editingTimeBlock.link ?? '');
      setDescription(editingTimeBlock.description ?? '');
      setNotes((editingTimeBlock as any).notes ?? '');
      setPinned(false);
      setPriority(undefined);
    }
  }, [isOpen, editingTimeBlock?.id]); // categories/tags intentionally omitted to avoid form reset on add

  useEffect(() => {
    if (isOpen && editingEvent) {
      setMode('event');
      setTitle(editingEvent.title ?? '');
      setDate(editingEvent.date);
      setEndDate(editingEvent.endDate ?? editingEvent.date);
      setStartTime(editingEvent.start);
      setEndTime(editingEvent.end);
      setSelectedCategory(categories.find((c) => c.id === editingEvent.categoryId) ?? firstCategoryForCalendar(editingEvent.calendarContainerId) ?? null);
      setSelectedTags([]);
      setSelectedCalendar(editingEvent.calendarContainerId);
      setRecurrencePattern(editingEvent.recurrencePattern ?? 'none');
      setRecurrenceDays(editingEvent.recurrenceDays ?? []);
      setLink(editingEvent.link ?? '');
      setDescription(editingEvent.description ?? '');
      setNotes(editingEvent.notes ?? '');
      setPinned(false);
      setPriority(undefined);
      // Timezone: if editing event has one, enable it; otherwise floating
      if (editingEvent.timezone) {
        setTimezoneEnabled(true);
        setTimezone(editingEvent.timezone);
      } else {
        setTimezoneEnabled(false);
        setTimezone(getLocalTimeZone());
      }
    }
  }, [isOpen, editingEvent?.id]); // categories intentionally omitted to avoid form reset on add

  // Reset the form to a clean slate whenever the modal opens for a NEW item (not editing).
  // The modal never unmounts (it returns null while closed), so every field must be cleared
  // here or stale values from a previous edit/create leak into the fresh form.
  // Prefill date/time from drag-to-create when provided.
  useEffect(() => {
    if (isOpen && !editingTask && !editingTimeBlock && !editingEvent) {
      setMode(initialMode);
      setTitle('');
      setEstimatedHours(1);
      setDate(initialDate ?? getLocalDateString());
      setEndDate(initialDate ?? getLocalDateString());
      setStartTime(initialStartTime ?? '09:00');
      setEndTime(initialEndTime ?? '10:00');
      setSelectedCalendar(calendars[0]?.id ?? 'personal');
      setSelectedTags([]);
      setDueDate('');
      setLink('');
      setDescription('');
      setNotes('');
      setPinned(false);
      setPriority(undefined);
      setMoreOpen(false);
      setShowNotes(false);
      setRecurrencePattern('none');
      setRecurrenceDays([]);
      setRecurrenceEditScope('this');
      setInviteEmails([]);
      setInviteInput('');
      setShowInviteSection(false);
      setExcludedSubscribers(new Set());
      setTimezone(getLocalTimeZone());
      setTimezoneEnabled(true);
    }
  }, [isOpen, initialMode, editingTask, editingTimeBlock, editingEvent, initialDate, initialStartTime, initialEndTime]);

  // Keep category in sync with selected calendar: when opening for new event/task, or when user changes calendar, use first category for that calendar.
  useEffect(() => {
    if (!isOpen || editingTask || editingTimeBlock || editingEvent) return;
    const first = firstCategoryForCalendar(selectedCalendar);
    setSelectedCategory((prev) => {
      const belongs = prev && getCategoriesForCalendar(selectedCalendar).some((c) => c.id === prev.id);
      return belongs ? prev : first ?? prev;
    });
  }, [isOpen, selectedCalendar, editingTask, editingTimeBlock, editingEvent, categories]);

  // Auto-advance endDate when endTime < startTime (cross-midnight event)
  useEffect(() => {
    if (mode !== 'event') return;
    const parseT = (t: string) => { const [h, m] = t.split(':').map(Number); return (h ?? 0) * 60 + (m ?? 0); };
    if (parseT(endTime) < parseT(startTime) && endDate === date) {
      // Advance endDate to next day
      const d = new Date(date + 'T00:00:00');
      d.setDate(d.getDate() + 1);
      const nextDay = d.toISOString().split('T')[0];
      setEndDate(nextDay);
    }
  }, [mode, startTime, endTime, date, endDate]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const fallbackCalendar =
      selectedCalendar || calendars[0]?.id || (editingTimeBlock?.calendarContainerId ?? editingEvent?.calendarContainerId ?? '');
    if (!fallbackCalendar) {
      if (!calendars.length && onRequireCalendar) onRequireCalendar();
      return;
    }

    // Category: use selected, or first category that belongs to the selected calendar
    const categoryToUse: Category | null =
      selectedCategory ?? firstCategoryForCalendar(fallbackCalendar) ?? null;
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
        notes: notes.trim() || null,
        pinned,
        priority,
      });
    } else if (editingEvent && onUpdateEvent) {
      onUpdateEvent(editingEvent.id, {
        title,
        start: startTime,
        end: endTime,
        date,
        endDate: endDate !== date ? endDate : undefined,
        calendarContainerId: fallbackCalendar,
        categoryId: categoryToUse.id,
        recurring: recurrencePattern !== 'none',
        recurrencePattern: recurrencePattern === 'none' ? undefined : recurrencePattern,
        recurrenceDays: recurrencePattern === 'custom' && recurrenceDays.length > 0 ? recurrenceDays : undefined,
        recurrenceEditScope: (editingEvent.recurring || recurrencePattern !== 'none') ? recurrenceEditScope : undefined,
        link: link.trim() || null,
        description: description.trim() || null,
        notes: notes.trim() || null,
        timezone: timezoneEnabled ? timezone : null,
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
        notes: notes.trim() || null,
        priority,
        scheduleAt: initialDate && initialStartTime && initialEndTime
          ? { date: initialDate, startTime: initialStartTime, endTime: initialEndTime }
          : null,
      });
    } else {
      onAddEvent({
        title,
        startTime,
        endTime,
        date,
        endDate: endDate !== date ? endDate : undefined,
        category: categoryToUse,
        tags: tagsToUse,
        calendar: fallbackCalendar,
        recurring: recurrencePattern !== 'none',
        recurrencePattern: recurrencePattern === 'none' ? undefined : recurrencePattern,
        recurrenceDays: recurrencePattern === 'custom' && recurrenceDays.length > 0 ? recurrenceDays : undefined,
        link: link.trim() || null,
        description: description.trim() || null,
        notes: notes.trim() || null,
        inviteEmails: inviteEmails.length > 0 ? inviteEmails : undefined,
        excludedSubscribers: excludedSubscribers.size > 0 ? [...excludedSubscribers] : undefined,
        timezone: timezoneEnabled ? timezone : null,
      });
    }

    setTitle('');
    setEstimatedHours(1);
    setDueDate('');
    setLink('');
    setDescription('');
    setNotes('');
    setDate(getLocalDateString());
    setEndDate(getLocalDateString());
    setStartTime('09:00');
    setEndTime('10:00');
    setSelectedCategory(categories[0] || null);
    setSelectedTags([]);
    setCategoryInput('');
    setTagInput('');
    setSelectedCalendar(calendars[0]?.id ?? 'personal');
    setPinned(false);
    setPriority(undefined);
    setInviteEmails([]);
    setInviteInput('');
    setShowInviteSection(false);
    setExcludedSubscribers(new Set());
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

  const isMobileModal = typeof window !== 'undefined' && window.innerWidth < 1024;

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      {/* Light backdrop — click to close, calendar stays visible */}
      <div className="absolute inset-0 bg-black/15 pointer-events-auto" onClick={onClose} aria-hidden />

      {/* Draggable panel — Monet warm canvas theme; centered on mobile */}
      <div
        className={`pointer-events-auto flex flex-col overflow-hidden ${isMobileModal ? 'fixed inset-x-4 top-[8vh]' : 'absolute'}`}
        style={{
          ...(isMobileModal ? {} : { left: panelPos.x, top: panelPos.y, width: `${PANEL_WIDTH}px` }),
          maxWidth: isMobileModal ? undefined : 'calc(100vw - 32px)',
          maxHeight: maxH,
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid rgba(160, 140, 120, 0.2)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.05)',
        }}
      >
        {/* Drag header (drag disabled on mobile) */}
        <div
          className="flex items-center gap-2 px-4 py-2.5 shrink-0 cursor-grab active:cursor-grabbing select-none"
          style={{ borderBottom: '1px solid rgba(0,0,0,0.08)' }}
          onMouseDown={(e) => {
            if (isMobileModal) return;
            if ((e.target as HTMLElement).closest('button')) return;
            setIsDragging(true);
            dragStart.current = { x: e.clientX, y: e.clientY, left: panelPos.x, top: panelPos.y };
          }}
        >
          <Bars3Icon className="h-3.5 w-3.5 shrink-0" style={{ color: '#8E8E93' }} />
          <h2 className="text-sm font-semibold flex-1 min-w-0 truncate" style={{ color: '#1C1C1E' }}>
            {editingTask
              ? 'Edit To-Do'
              : editingTimeBlock || editingEvent
                ? 'Edit Event'
                : mode === 'task'
                  ? 'New To-Do'
                  : 'New Event'}
          </h2>
          {/* Compact mode switch — small icon to flip between To-Do and Event (new only) */}
          {!editingTimeBlock && !editingEvent && !editingTask && (
            <button
              type="button"
              onClick={() => setMode(mode === 'task' ? 'event' : 'task')}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium shrink-0 transition-colors"
              style={{ color: THEME.primary, backgroundColor: 'rgba(141,162,134,0.10)' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(141,162,134,0.18)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(141,162,134,0.10)')}
              title={mode === 'task' ? 'Switch to Event' : 'Switch to To-Do'}
            >
              {mode === 'task'
                ? <><CalendarDaysIcon className="h-3.5 w-3.5" /> Event</>
                : <><CheckCircleIcon className="h-3.5 w-3.5" /> To-Do</>}
            </button>
          )}
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg transition-colors shrink-0" style={{ color: '#8E8E93' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.07)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Form — compact, scrollable; primary button is type="submit" so Enter submits */}
        <form
          onSubmit={handleSubmit}
          className="flex-1 min-h-0 flex flex-col overflow-hidden"
        >
          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-3">
          {/* Title — borderless with a sage underline (Google-Calendar style) */}
          <div>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={mode === 'task' ? 'Add to-do title' : 'Add event title'}
              className="w-full bg-transparent focus:outline-none"
              style={{
                fontSize: 15,
                fontWeight: 500,
                color: THEME.textPrimary,
                padding: '2px 0 7px',
                border: 'none',
                borderBottom: `2px solid ${title ? THEME.primary : 'rgba(0,0,0,0.12)'}`,
              }}
              onFocus={(e) => { e.currentTarget.style.borderBottomColor = THEME.primary; }}
              onBlur={(e) => { e.currentTarget.style.borderBottomColor = title ? THEME.primary : 'rgba(0,0,0,0.12)'; }}
              autoFocus
            />
          </div>

          {mode === 'task' && (
            <>
              {/* Estimated time — icon-led row */}
              <div className="flex items-center gap-2.5">
                <ClockIcon className="h-4 w-4 shrink-0" style={{ color: '#8E8E93' }} />
                <div className="flex-1 flex gap-3 items-center">
                  <input
                    type="range" min="0.25" max="8" step="0.25" value={estimatedHours}
                    onChange={(e) => setEstimatedHours(parseFloat(e.target.value))}
                    className="flex-1 h-1.5 appearance-none cursor-pointer rounded-full"
                    style={{ background: `linear-gradient(to right, ${THEME.primary} 0%, ${THEME.primary} ${((estimatedHours - 0.25) / 7.75) * 100}%, rgba(0,0,0,0.09) ${((estimatedHours - 0.25) / 7.75) * 100}%, rgba(0,0,0,0.09) 100%)` }}
                  />
                  <span className="text-sm font-bold w-14 text-right" style={{ color: THEME.primary }}>
                    {estimatedHours >= 1 ? `${estimatedHours}h` : `${Math.round(estimatedHours * 60)}m`}
                  </span>
                </div>
              </div>
              {/* Due date — icon-led row */}
              <div className="flex items-center gap-2.5">
                <CalendarDaysIcon className="h-4 w-4 shrink-0" style={{ color: '#8E8E93' }} />
                <input
                  type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
                  className="flex-1 px-2.5 text-sm rounded-lg focus:outline-none"
                  style={{ height: 30, backgroundColor: '#FFFFFF', border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.10), 0 1px 2px rgba(0,0,0,0.06)', color: dueDate ? THEME.textPrimary : '#8E8E93' }}
                />
              </div>
              {moreOpen && (
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
              )}
            </>
          )}

          {mode === 'event' && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: '#636366' }}>Start date</label>
                  <input
                    type="date" value={date} onChange={(e) => {
                      const newDate = e.target.value;
                      setDate(newDate);
                      // Keep endDate >= date
                      if (endDate < newDate) setEndDate(newDate);
                    }}
                    className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none"
                    style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.09)', color: '#1C1C1E' }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: '#636366' }}>End date</label>
                  <input
                    type="date" value={endDate} min={date} onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none"
                    style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.09)', color: '#1C1C1E' }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: '#636366' }}>Start time</label>
                  <input
                    type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none"
                    style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.09)', color: '#1C1C1E' }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: '#636366' }}>End time</label>
                  <input
                    type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none"
                    style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.09)', color: '#1C1C1E' }}
                  />
                </div>
              </div>
              {/* Timezone toggle + picker */}
              <div className="relative" style={{ marginTop: 2 }} ref={tzPickerRef}>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={timezoneEnabled}
                      onChange={(e) => { setTimezoneEnabled(e.target.checked); setTzPickerOpen(false); }}
                      className="rounded"
                      style={{ width: 14, height: 14, accentColor: '#8DA286' }}
                    />
                    <span style={{ fontSize: 11, color: '#636366' }}>Timezone:</span>
                  </label>
                  {timezoneEnabled ? (
                    <button
                      type="button"
                      onClick={() => { setTzPickerOpen(!tzPickerOpen); setTzSearch(''); setTimeout(() => tzSearchInputRef.current?.focus(), 50); }}
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors"
                      style={{ fontSize: 11, color: '#8DA286', backgroundColor: tzPickerOpen ? 'rgba(141,162,134,0.10)' : 'transparent' }}
                      onMouseEnter={(e) => { if (!tzPickerOpen) e.currentTarget.style.backgroundColor = 'rgba(141,162,134,0.06)'; }}
                      onMouseLeave={(e) => { if (!tzPickerOpen) e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                      {getTimezoneAbbr(timezone)} ({timezone.split('/').pop()?.replace(/_/g, ' ')})
                      <ChevronDownIcon className="h-3 w-3" style={{ transform: tzPickerOpen ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }} />
                    </button>
                  ) : (
                    <span style={{ fontSize: 11, color: '#AEAEB2' }}>None (floating)</span>
                  )}
                </div>
                {tzPickerOpen && timezoneEnabled && (
                  <div
                    className="absolute left-0 mt-1 rounded-lg shadow-lg overflow-hidden"
                    style={{ zIndex: 50, width: 260, backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.10)' }}
                  >
                    <div className="p-1.5">
                      <input
                        ref={tzSearchInputRef}
                        type="text"
                        value={tzSearch}
                        onChange={(e) => setTzSearch(e.target.value)}
                        placeholder="Search timezones…"
                        className="w-full px-2 py-1.5 text-xs rounded-md focus:outline-none"
                        style={{ backgroundColor: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.08)', color: '#1C1C1E' }}
                      />
                    </div>
                    <div className="overflow-y-auto" style={{ maxHeight: 180 }}>
                      {(() => {
                        const q = tzSearch.toLowerCase();
                        const filtered = q
                          ? ALL_TIMEZONES.filter(tz => tz.toLowerCase().includes(q))
                          : [...COMMON_TIMEZONES, '---', ...ALL_TIMEZONES.filter(tz => !new Set(COMMON_TIMEZONES).has(tz))];
                        return filtered.map((tz, i) =>
                          tz === '---' ? (
                            <div key={`sep-${i}`} className="my-0.5" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }} />
                          ) : (
                            <button
                              key={tz}
                              type="button"
                              className="w-full text-left px-2.5 py-1.5 text-xs transition-colors flex items-center justify-between"
                              style={{
                                color: tz === timezone ? '#8DA286' : '#1C1C1E',
                                backgroundColor: tz === timezone ? 'rgba(141,162,134,0.08)' : 'transparent',
                                fontWeight: tz === timezone ? 600 : 400,
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(141,162,134,0.08)'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = tz === timezone ? 'rgba(141,162,134,0.08)' : 'transparent'; }}
                              onClick={() => { setTimezone(tz); setTzPickerOpen(false); setTzSearch(''); }}
                            >
                              <span>{tz.replace(/_/g, ' ')}</span>
                              <span style={{ color: '#8E8E93', fontWeight: 400 }}>{getTimezoneAbbr(tz)}</span>
                            </button>
                          )
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Calendar · Category · Tags — single row of compact dropdowns (Google-style) */}
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
            <div>
              {(() => {
                // Soft, borderless dropdowns: light gray shadow instead of a border.
                const selectStyle: React.CSSProperties = {
                  width: '100%', minWidth: 0, fontSize: 12, height: 30, borderRadius: 8,
                  border: 'none', backgroundColor: '#FFFFFF', color: THEME.textPrimary, outline: 'none',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.10), 0 1px 2px rgba(0,0,0,0.06)',
                  appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
                };
                const chevronBg = 'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'10\' viewBox=\'0 0 20 20\' fill=\'%238E8E93\'><path d=\'M5.5 7.5l4.5 4.5 4.5-4.5\' stroke=\'%238E8E93\' stroke-width=\'2\' fill=\'none\' stroke-linecap=\'round\'/></svg>")';
                const catsForCalendar = categoriesToShow.filter((category) => {
                  if (!selectedCalendar) return true;
                  const ids = category.calendarContainerIds;
                  if (ids && ids.length > 0) return ids.includes(selectedCalendar);
                  return category.calendarContainerId === selectedCalendar || !category.calendarContainerId;
                });
                const tagsForCategory = tags.filter((t) => t.categoryId === selectedCategory?.id);
                const calColor = calendars.find((c) => c.id === selectedCalendar)?.color ?? THEME.primary;
                const catColor = selectedCategory?.color ?? 'rgba(0,0,0,0.18)';
                // A dropdown wrapper that shows a leading color dot + chevron.
                const Dropdown = ({ dot, padLeft = 24, children, ...rest }: any) => (
                  <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                    {dot !== undefined && (
                      <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', width: 8, height: 8, borderRadius: '50%', backgroundColor: dot, pointerEvents: 'none' }} />
                    )}
                    <select
                      {...rest}
                      style={{ ...selectStyle, paddingLeft: padLeft, paddingRight: 20, backgroundImage: chevronBg, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 7px center' }}
                    >
                      {children}
                    </select>
                  </div>
                );
                return (
                  <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                    <Dropdown dot={calColor} value={selectedCalendar} onChange={(e: any) => setSelectedCalendar(e.target.value)} title="Calendar">
                      {calendars.map((cal) => <option key={cal.id} value={cal.id}>{cal.name}</option>)}
                    </Dropdown>
                    <Dropdown
                      dot={catColor}
                      value={selectedCategory?.id ?? ''}
                      title="Category"
                      onChange={(e: any) => {
                        if (e.target.value === '__add__') { setShowCategoryInput(true); return; }
                        setSelectedCategory(catsForCalendar.find((c) => c.id === e.target.value) ?? null);
                      }}
                    >
                      {catsForCalendar.length === 0 && <option value="">No categories</option>}
                      {catsForCalendar.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      {onAddCategory && <option value="__add__">+ New category…</option>}
                    </Dropdown>
                    <Dropdown
                      padLeft={10}
                      value=""
                      title="Tags"
                      disabled={!selectedCategory}
                      onChange={(e: any) => {
                        if (e.target.value === '__add__') { setShowTagInput(true); return; }
                        const tag = tagsForCategory.find((t) => t.id === e.target.value);
                        if (tag) setSelectedTags((prev) => prev.some((s) => s.id === tag.id) ? prev : [...prev, tag]);
                      }}
                    >
                      <option value="">Tags…</option>
                      {tagsForCategory.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      {onAddTag && selectedCategory && <option value="__add__">+ New tag…</option>}
                    </Dropdown>
                  </div>
                );
              })()}

              {/* Selected tags as removable chips */}
              {selectedTags.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                  {selectedTags.map((tag) => (
                    <button key={tag.id} type="button" onClick={() => toggleTag(tag)} className="rounded-full" title="Remove tag">
                      <Chip variant="subtle" color={selectedCategory?.color ?? THEME.primary}>
                        {tag.name}
                        <XMarkIcon className="h-3 w-3" />
                      </Chip>
                    </button>
                  ))}
                </div>
              )}

              {/* Inline create inputs (category / tag) */}
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
          )}

          {/* Quick Notes — collapsed by default; an icon-led "Add note" row expands it */}
          {(showNotes || notes) ? (
            <div className="flex items-start gap-2.5">
              <PencilSquareIcon className="h-4 w-4 shrink-0 mt-2" style={{ color: '#8E8E93' }} />
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Quick reminder, context, or link to notes…"
                rows={2}
                autoFocus
                className="flex-1 px-2.5 py-1.5 text-xs rounded-lg focus:outline-none resize-none"
                style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.09)', color: '#636366', fontStyle: 'italic' }}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowNotes(true)}
              className="flex items-center gap-2.5 w-full text-left rounded-lg transition-colors"
              style={{ padding: '4px 0', color: '#8E8E93' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = THEME.textPrimary)}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#8E8E93')}
            >
              <PencilSquareIcon className="h-4 w-4 shrink-0" />
              <span className="text-sm">Add note</span>
            </button>
          )}

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
                    <div className="flex flex-wrap gap-x-1.5 gap-y-2">
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
                      <div className="mt-2 flex flex-wrap gap-x-1 gap-y-2">
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
                      <div className="mt-2 px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: 'rgba(141,162,134,0.08)', color: '#636366' }}>
                        Editing: <span className="font-medium" style={{ color: '#8DA286' }}>
                          {recurrenceEditScope === 'this' ? 'this event only' : recurrenceEditScope === 'all' ? 'all events in series' : 'this and all future events'}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          </div>

          {/* Invite section — event mode only */}
          {mode === 'event' && (
            <div className="px-4 py-2" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
              <button
                type="button"
                onClick={() => setShowInviteSection((o) => !o)}
                className="w-full flex items-center gap-1.5 py-1 text-xs font-semibold transition-colors"
                style={{ color: (inviteEmails.length > 0 || existingSubscribers.length > 0) ? '#8DA286' : '#636366' }}
              >
                <UserPlusIcon className="h-3.5 w-3.5" />
                <span>Invite people{(inviteEmails.length + existingSubscribers.filter(s => !excludedSubscribers.has(s.email)).length) > 0 ? ` (${inviteEmails.length + existingSubscribers.filter(s => !excludedSubscribers.has(s.email)).length})` : ''}</span>
                {showInviteSection ? <ChevronUpIcon className="h-3 w-3 ml-auto" /> : <ChevronDownIcon className="h-3 w-3 ml-auto" />}
              </button>
              {showInviteSection && (
                <div className="mt-2 space-y-2">
                  {/* Existing subscribers from calendar/category/tag */}
                  {existingSubscribers.length > 0 && (
                    <div>
                      <p style={{ fontSize: 10, fontWeight: 600, color: '#8E8E93', letterSpacing: '0.05em', textTransform: 'uppercase', margin: '0 0 4px' }}>
                        Subscribers
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {existingSubscribers.map((sub) => {
                          const isExcluded = excludedSubscribers.has(sub.email);
                          return (
                            <span
                              key={sub.email}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                              style={{
                                backgroundColor: isExcluded ? 'rgba(0,0,0,0.04)' : 'rgba(141,162,134,0.12)',
                                color: isExcluded ? '#AEAEB2' : '#636366',
                                border: `1px solid ${isExcluded ? 'rgba(0,0,0,0.06)' : 'rgba(141,162,134,0.25)'}`,
                                textDecoration: isExcluded ? 'line-through' : 'none',
                              }}
                            >
                              {sub.email}
                              <span style={{ fontSize: 9, color: '#AEAEB2' }}>({sub.source})</span>
                              <button
                                type="button"
                                onClick={() => {
                                  setExcludedSubscribers(prev => {
                                    const next = new Set(prev);
                                    if (next.has(sub.email)) next.delete(sub.email);
                                    else next.add(sub.email);
                                    return next;
                                  });
                                }}
                                className="rounded-full p-0.5 transition-colors hover:bg-black/10"
                                title={isExcluded ? 'Re-include in this event' : 'Exclude from this event'}
                              >
                                <XMarkIcon className="h-2.5 w-2.5" />
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {/* Add new invitees */}
                  <div className="flex gap-1.5">
                    <input
                      type="email"
                      value={inviteInput}
                      onChange={(e) => setInviteInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddInvite(); } }}
                      placeholder="Email address"
                      className="flex-1 px-2.5 py-1.5 text-xs rounded-lg focus:outline-none"
                      style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.09)', color: '#1C1C1E' }}
                    />
                    <button
                      type="button"
                      onClick={handleAddInvite}
                      className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors"
                      style={{ backgroundColor: '#8DA286', color: '#FFFFFF' }}
                    >
                      <PlusIcon className="h-3 w-3" /> Add
                    </button>
                  </div>
                  {inviteEmails.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {inviteEmails.map((email) => (
                        <span
                          key={email}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                          style={{ backgroundColor: 'rgba(141,162,134,0.12)', color: '#636366', border: '1px solid rgba(141,162,134,0.25)' }}
                        >
                          {email}
                          <button
                            type="button"
                            onClick={() => handleRemoveInvite(email)}
                            className="rounded-full p-0.5 transition-colors hover:bg-black/10"
                          >
                            <XMarkIcon className="h-2.5 w-2.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="text-xs" style={{ color: '#8E8E93', fontSize: 10, lineHeight: 1.4 }}>
                    Timebox users will see this event in their calendar. Non-users will get an email invite + Google Calendar event.
                  </p>
                </div>
              )}
            </div>
          )}

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
              style={{ backgroundColor: '#8DA286', color: '#FFFFFF' }}
            >
              <PlusIcon className="h-4 w-4" />
              {mode === 'task' && editingTask ? 'Save Todo' : editingEvent || editingTimeBlock ? 'Save' : `Add ${mode === 'task' ? 'Todo' : 'Event'}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
