import React, { useState } from 'react';
import { XMarkIcon, PlusIcon, PencilIcon, TrashIcon, CalendarIcon, FolderIcon, TagIcon, CheckIcon, Cog6ToothIcon, UserPlusIcon, UserGroupIcon, CloudIcon } from '@heroicons/react/24/solid';
import type { CalendarContainer, Category, Tag } from '../types';
import type { CalendarShare, ShareMember, ShareScope } from '../types/sharing';
import { ColorPicker } from './ColorPicker';
import { DEFAULT_PALETTE_COLOR } from '../constants/colors';
import { getGoogleAuthUrl, isGoogleConnected, disconnectGoogle, fetchGoogleCalendars, getGcalSelectedCalendarIds, setGcalSelectedCalendarIds } from '../services/googleCalendar';
import { useStore } from '../store/useStore';
import { getLocalTimeZone, getBrowserTimeZone } from '../utils/dateTime';

// Common IANA timezones shown at the top of the picker
const COMMON_TIMEZONES = [
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Toronto',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Australia/Sydney',
  'Pacific/Auckland',
];

/** Get all available IANA timezones from the browser. */
function getAllTimezones(): string[] {
  try {
    // Use Intl.supportedValuesOf if available (modern browsers)
    if ('supportedValuesOf' in Intl) {
      return (Intl as unknown as { supportedValuesOf: (key: string) => string[] }).supportedValuesOf('timeZone');
    }
  } catch { /* fallback */ }
  // Fallback: return common timezones only
  return COMMON_TIMEZONES;
}

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  calendarContainers: CalendarContainer[];
  categories: Category[];
  tags: Tag[];
  onAddCalendar: (c: Omit<CalendarContainer, 'id'>, opts?: { skipAutoGeneral?: boolean }) => string;
  onUpdateCalendar: (id: string, u: Partial<CalendarContainer>) => void;
  onDeleteCalendar: (id: string) => void;
  onAddCategory: (c: Omit<Category, 'id'>) => void;
  onUpdateCategory: (id: string, u: Partial<Category>) => void;
  onDeleteCategory: (id: string) => void;
  onAddTag: (t: Omit<Tag, 'id'>) => void;
  onUpdateTag: (id: string, u: Partial<Tag>) => void;
  onDeleteTag: (id: string) => void;
  weekStartsOnMonday?: boolean;
  onWeekStartsOnMondayChange?: (value: boolean) => void;
  wakeTime?: string;
  sleepTime?: string;
  onWakeTimeChange?: (time: string) => void;
  onSleepTimeChange?: (time: string) => void;
  onExploreFeaturesClick?: () => void;
  notificationScope?: 'events' | 'events_and_tasks' | 'off';
  onNotificationScopeChange?: (scope: 'events' | 'events_and_tasks' | 'off') => void;
  notificationLeadMinutes?: number;
  onNotificationLeadMinutesChange?: (minutes: number) => void;
  emailNotificationsEnabled?: boolean;
  onEmailNotificationsEnabledChange?: (val: boolean) => void;
}

type TabType = 'calendars' | 'categories' | 'tags' | 'general';

const PRIMARY = '#8DA286';
const BG = '#FCFBF7';
const BORDER = 'rgba(0,0,0,0.08)';
const TEXT = '#1C1C1E';
const TEXT_MUTED = '#8E8E93';
const TEXT_SECONDARY = '#636366';

export function SettingsPanel({
  isOpen,
  onClose,
  calendarContainers,
  categories,
  tags,
  onUpdateCalendar,
  onUpdateCategory,
  onUpdateTag,
  onDeleteCalendar,
  onDeleteCategory,
  onDeleteTag,
  onAddCalendar,
  onAddCategory,
  onAddTag,
  weekStartsOnMonday = false,
  onWeekStartsOnMondayChange,
  wakeTime = '08:00',
  sleepTime = '23:00',
  onWakeTimeChange,
  onSleepTimeChange,
  onExploreFeaturesClick,
  notificationScope = 'events',
  onNotificationScopeChange,
  notificationLeadMinutes = 5,
  onNotificationLeadMinutesChange,
  emailNotificationsEnabled = true,
  onEmailNotificationsEnabledChange,
}: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>('calendars');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState(DEFAULT_PALETTE_COLOR);
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(DEFAULT_PALETTE_COLOR);
  const [editCalendarIds, setEditCalendarIds] = useState<string[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeleteName, setConfirmDeleteName] = useState('');
  const [confirmDeleteInput, setConfirmDeleteInput] = useState('');

  // ── Timezone state ──
  const [tzSearch, setTzSearch] = useState('');
  const [tzDropdownOpen, setTzDropdownOpen] = useState(false);
  const [selectedTz, setSelectedTz] = useState(() => getLocalTimeZone());
  const browserTz = getBrowserTimeZone();

  // ── Secondary timezones state ──
  const [secondaryTzs, setSecondaryTzs] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('timebox_secondary_timezones');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.slice(0, 2);
      }
    } catch { /* ignore */ }
    return [];
  });
  const [secTzDropdownOpen, setSecTzDropdownOpen] = useState(false);
  const [secTzSearch, setSecTzSearch] = useState('');

  const filteredSecTzs = React.useMemo(() => {
    const excluded = new Set([selectedTz, ...secondaryTzs]);
    const available = allTimezones.filter(tz => !excluded.has(tz));
    if (!secTzSearch) {
      const commonSet = new Set(COMMON_TIMEZONES);
      const commonAvail = COMMON_TIMEZONES.filter(tz => !excluded.has(tz));
      const rest = available.filter(tz => !commonSet.has(tz));
      return [...commonAvail, ...(commonAvail.length > 0 && rest.length > 0 ? ['---'] : []), ...rest];
    }
    const q = secTzSearch.toLowerCase();
    return available.filter(tz => tz.toLowerCase().includes(q));
  }, [secTzSearch, allTimezones, selectedTz, secondaryTzs]);

  const addSecondaryTz = (tz: string) => {
    const updated = [...secondaryTzs, tz].slice(0, 2);
    setSecondaryTzs(updated);
    localStorage.setItem('timebox_secondary_timezones', JSON.stringify(updated));
    setSecTzDropdownOpen(false);
    setSecTzSearch('');
  };

  const removeSecondaryTz = (tz: string) => {
    const updated = secondaryTzs.filter(t => t !== tz);
    setSecondaryTzs(updated);
    localStorage.setItem('timebox_secondary_timezones', JSON.stringify(updated));
  };

  const getSecTzCurrentTime = (tz: string): string => {
    try {
      return new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }).format(new Date());
    } catch { return ''; }
  };

  const getSecTzAbbr = (tz: string): string => {
    try {
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' }).formatToParts(new Date());
      return parts.find(p => p.type === 'timeZoneName')?.value || '';
    } catch { return ''; }
  };
  const allTimezones = React.useMemo(() => getAllTimezones(), []);

  const filteredTimezones = React.useMemo(() => {
    if (!tzSearch) {
      // Show common timezones first, then all others
      const commonSet = new Set(COMMON_TIMEZONES);
      const rest = allTimezones.filter(tz => !commonSet.has(tz));
      return [...COMMON_TIMEZONES, '---', ...rest];
    }
    const q = tzSearch.toLowerCase();
    return allTimezones.filter(tz => tz.toLowerCase().includes(q));
  }, [tzSearch, allTimezones]);

  const handleTimezoneChange = (tz: string) => {
    setSelectedTz(tz);
    setTzDropdownOpen(false);
    setTzSearch('');
    if (tz === browserTz) {
      // Remove override — use browser detection
      localStorage.removeItem('timebox_user_timezone');
    } else {
      localStorage.setItem('timebox_user_timezone', tz);
    }
    // Store the new timezone so the next load triggers re-derivation
    localStorage.setItem('timebox_event_timezone', tz);
    // Reload to trigger timezone re-derivation in App.tsx
    window.location.reload();
  };

  // ── Sharing state ──
  const [sharingId, setSharingId] = useState<string | null>(null); // id of item being shared
  const [sharingScope, setSharingScope] = useState<ShareScope>('calendar');
  const [shares, setShares] = useState<CalendarShare[]>([]); // local state (will be persisted later)
  const [shareEmail, setShareEmail] = useState('');
  const [sharePushToGoogle, setSharePushToGoogle] = useState(true);
  const [shareIncludeExisting, setShareIncludeExisting] = useState(true);

  const handleStartShare = (id: string, scope: ShareScope) => {
    setSharingId(id);
    setSharingScope(scope);
    setShareEmail('');
    setEditingId(null);
    setIsAdding(false);
  };

  const handleAddShareMember = () => {
    if (!shareEmail.trim() || !sharingId) return;
    const email = shareEmail.trim().toLowerCase();

    setShares((prev) => {
      const existing = prev.find((s) => s.id === `share-${sharingId}`);
      const member: ShareMember = {
        id: `member-${Date.now()}`,
        shareId: `share-${sharingId}`,
        email,
        role: 'viewer',
        status: 'pending',
        pushToGoogle: sharePushToGoogle,
        token: Math.random().toString(36).slice(2, 10),
        invitedAt: new Date().toISOString(),
      };
      if (existing) {
        if (existing.members.some((m) => m.email === email)) return prev;
        return prev.map((s) =>
          s.id === existing.id ? { ...s, members: [...s.members, member] } : s
        );
      }
      const newShare: CalendarShare = {
        id: `share-${sharingId}`,
        ownerId: 'current-user',
        scope: sharingScope,
        ...(sharingScope === 'calendar' ? { calendarContainerId: sharingId } : {}),
        ...(sharingScope === 'category' ? { categoryId: sharingId } : {}),
        ...(sharingScope === 'tag' ? { tagId: sharingId } : {}),
        members: [member],
        includeExisting: shareIncludeExisting,
        pushToGoogle: sharePushToGoogle,
        createdAt: new Date().toISOString(),
      };
      return [...prev, newShare];
    });
    setShareEmail('');
  };

  const handleRemoveShareMember = (shareId: string, memberId: string) => {
    setShares((prev) =>
      prev
        .map((s) =>
          s.id === shareId ? { ...s, members: s.members.filter((m) => m.id !== memberId) } : s
        )
        .filter((s) => s.members.length > 0)
    );
  };

  const getShareForItem = (id: string) => shares.find((s) => s.id === `share-${id}`);
  const getMemberCount = (id: string) => getShareForItem(id)?.members.length ?? 0;

  // ── Google Calendar connect state ──
  const [gcalStep, setGcalStep] = useState<'idle' | 'choose_mode' | 'connecting' | 'connected'>('idle');
  const [gcalSyncMode, setGcalSyncMode] = useState<'migrate_listen' | 'listen_with_history' | 'listen_fresh'>('migrate_listen');
  const [gcalConnectedCalendars, setGcalConnectedCalendars] = useState<Array<{ name: string; mode: string; lastSync?: string }>>([
    // Dev: show a test connected calendar
    ...(import.meta.env.DEV ? [{ name: 'Work (Google)', mode: 'migrate_listen', lastSync: new Date().toISOString() }] : []),
  ]);

  // ── Google Calendar picker state (manage which calendars are imported) ──
  const [gcalPickerOpen, setGcalPickerOpen] = useState(false);
  const [gcalAvailable, setGcalAvailable] = useState<Array<{ id: string; summary: string; backgroundColor: string; primary?: boolean }>>([]);
  const [gcalPickerSelected, setGcalPickerSelected] = useState<Set<string>>(new Set());
  const [gcalPickerLoading, setGcalPickerLoading] = useState(false);
  const [gcalPickerSaving, setGcalPickerSaving] = useState(false);

  const openGcalPicker = async () => {
    setGcalPickerLoading(true);
    setGcalPickerOpen(true);
    try {
      const cals = await fetchGoogleCalendars();
      setGcalAvailable(cals);
      const savedSelection = getGcalSelectedCalendarIds();
      setGcalPickerSelected(savedSelection ?? new Set(cals.map(c => c.id)));
    } catch {
      // If fetch fails, close picker
      setGcalPickerOpen(false);
    } finally {
      setGcalPickerLoading(false);
    }
  };

  const saveGcalPicker = async () => {
    setGcalPickerSaving(true);
    setGcalSelectedCalendarIds([...gcalPickerSelected]);
    // Remove unselected gcal calendars from the store immediately
    const state = useStore.getState();
    const selectedContainerIds = new Set(
      gcalAvailable.filter(c => gcalPickerSelected.has(c.id)).map(c => `gcal-${c.id.replace(/[^a-zA-Z0-9]/g, '-')}`)
    );
    useStore.setState({
      calendarContainers: state.calendarContainers.filter(c => !c.id.startsWith('gcal-') || selectedContainerIds.has(c.id)),
      categories: state.categories.filter(c => {
        if (!c.id.startsWith('gcal-cat-')) return true;
        // Keep category if its parent container is selected
        return state.calendarContainers.some(
          cont => selectedContainerIds.has(cont.id) && c.calendarContainerId === cont.id
        );
      }),
      events: state.events.filter(e => {
        if (!e.googleEventId) return true;
        return selectedContainerIds.has(e.calendarContainerId);
      }),
    });
    setGcalPickerSaving(false);
    setGcalPickerOpen(false);
  };

  if (!isOpen) return null;

  const handleStartEdit = (id: string, name: string, color?: string, category?: Category) => {
    setEditingId(id);
    setEditName(name);
    setEditColor(color || DEFAULT_PALETTE_COLOR);
    if (activeTab === 'categories' && category) {
      const ids = (category.calendarContainerIds && category.calendarContainerIds.length > 0)
        ? category.calendarContainerIds
        : (category.calendarContainerId ? [category.calendarContainerId] : []);
      setEditCalendarIds(ids);
    }
    setIsAdding(false);
  };

  const handleSaveEdit = () => {
    if (!editName.trim() || !editingId) return;
    if (activeTab === 'calendars' && onUpdateCalendar) {
      onUpdateCalendar(editingId, { name: editName, color: editColor });
    } else if (activeTab === 'categories' && onUpdateCategory) {
      onUpdateCategory(editingId, {
        name: editName,
        color: editColor,
        calendarContainerId: editCalendarIds.length > 0 ? editCalendarIds[0] : undefined,
        calendarContainerIds: editCalendarIds.length > 0 ? editCalendarIds : undefined,
      });
    } else if (activeTab === 'tags' && onUpdateTag) {
      onUpdateTag(editingId, { name: editName });
    }
    setEditingId(null);
    setEditName('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditCalendarIds([]);
    setIsAdding(false);
    setNewName('');
  };

  const handleStartAdd = () => {
    setIsAdding(true);
    setEditingId(null);
    setNewName('');
    setNewColor(DEFAULT_PALETTE_COLOR);
  };

  const handleSaveAdd = () => {
    if (!newName.trim()) return;
    const color = newColor && /^#[0-9A-Fa-f]{6}$/.test(newColor) ? newColor : DEFAULT_PALETTE_COLOR;
    if (activeTab === 'calendars' && onAddCalendar) {
      onAddCalendar({ name: newName.trim(), color });
    } else if (activeTab === 'categories' && onAddCategory) {
      const firstCalId = calendarContainers[0]?.id;
      onAddCategory({ name: newName.trim(), color, calendarContainerId: firstCalId ?? undefined, calendarContainerIds: firstCalId ? [firstCalId] : undefined });
    } else if (activeTab === 'tags' && onAddTag) {
      onAddTag({ name: newName.trim() });
    }
    setIsAdding(false);
    setNewName('');
    setNewColor(DEFAULT_PALETTE_COLOR);
  };

  const handleDeleteRequest = (id: string, name: string) => {
    setConfirmDeleteId(id);
    setConfirmDeleteName(name);
  };

  const handleDeleteConfirm = () => {
    if (!confirmDeleteId) return;
    if (activeTab === 'calendars' && onDeleteCalendar) onDeleteCalendar(confirmDeleteId);
    else if (activeTab === 'categories' && onDeleteCategory) onDeleteCategory(confirmDeleteId);
    else if (activeTab === 'tags' && onDeleteTag) onDeleteTag(confirmDeleteId);
    setConfirmDeleteId(null);
    setConfirmDeleteName('');
    setConfirmDeleteInput('');
  };

  const tabs = [
    { id: 'general' as const, label: 'General', icon: Cog6ToothIcon },
    { id: 'calendars' as const, label: 'Calendars', icon: CalendarIcon },
    { id: 'categories' as const, label: 'Categories', icon: FolderIcon },
    { id: 'tags' as const, label: 'Tags', icon: TagIcon },
  ];

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '6px 10px',
    fontSize: 12,
    color: TEXT,
    backgroundColor: '#FFFFFF',
    border: `1px solid ${BORDER}`,
    borderRadius: 8,
    outline: 'none',
  };

  /* ── Shared edit / add form ── */
  const EditForm = ({ onSave, onCancel, showColor }: { onSave: () => void; onCancel: () => void; showColor: boolean }) => (
    <div
      className="space-y-2 p-3 rounded-xl"
      style={{ backgroundColor: 'rgba(0,0,0,0.03)', border: `1px solid ${BORDER}` }}
    >
      <input
        type="text"
        value={editName}
        onChange={(e) => setEditName(e.target.value)}
        style={inputStyle}
        placeholder="Name"
        autoFocus
        onKeyDown={(e) => e.key === 'Enter' && onSave()}
      />
      {showColor && <ColorPicker label="Color" value={editColor} onChange={setEditColor} swatchSize="sm" />}
      {activeTab === 'categories' && (
        <div>
          <span className="block mb-1" style={{ fontSize: 10, fontWeight: 500, color: TEXT_MUTED }}>Show on calendars</span>
          <div className="flex flex-wrap gap-x-1 gap-y-2">
            {calendarContainers.map((cal) => {
              const checked = editCalendarIds.includes(cal.id);
              return (
                <button
                  key={cal.id}
                  type="button"
                  onClick={() => setEditCalendarIds((prev) => prev.includes(cal.id) ? prev.filter((id) => id !== cal.id) : [...prev, cal.id])}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md transition-all"
                  style={{ fontSize: 11, backgroundColor: checked ? `${cal.color}18` : 'rgba(0,0,0,0.04)', border: checked ? `1.5px solid ${cal.color}50` : `1px solid ${BORDER}`, color: checked ? cal.color : TEXT_SECONDARY, fontWeight: checked ? 500 : 400 }}
                >
                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: cal.color }} />
                  {cal.name}
                  {checked && <CheckIcon style={{ width: 10, height: 10, flexShrink: 0 }} />}
                </button>
              );
            })}
            {calendarContainers.length === 0 && <p style={{ fontSize: 10, color: TEXT_MUTED }}>Add a calendar first.</p>}
          </div>
        </div>
      )}
      <div className="flex gap-1.5 justify-end pt-0.5">
        <button
          type="button"
          onClick={onCancel}
          className="px-2.5 py-1.5 rounded-md text-xs transition-colors"
          style={{ backgroundColor: 'rgba(0,0,0,0.06)', color: TEXT_SECONDARY }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.10)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.06)'; }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
          style={{ backgroundColor: PRIMARY, color: '#FFFFFF' }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#7A9278'; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = PRIMARY; }}
        >
          <CheckIcon className="h-3 w-3" /> Save
        </button>
      </div>
    </div>
  );

  /* ── Compact item card ── */
  const ItemCard = ({
    color, name, subtitle, icon: Icon,
    onEdit, onDelete, onShare, memberCount,
  }: {
    color: string; name: string; subtitle?: string;
    icon?: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
    onEdit: () => void; onDelete: () => void;
    onShare?: () => void; memberCount?: number;
  }) => (
    <div
      className="flex items-center gap-2 rounded-lg group"
      style={{ backgroundColor: `${color}10`, border: `1px solid ${color}28`, padding: '8px 10px 8px 12px' }}
    >
      {Icon
        ? <Icon className="h-3 w-3 flex-shrink-0" style={{ color }} />
        : <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
      }
      <div className="flex-1 min-w-0">
        <span className="block truncate" style={{ fontSize: 12, fontWeight: 500, color: TEXT }}>{name}</span>
        {subtitle && <span className="block truncate" style={{ fontSize: 10, color: TEXT_MUTED }}>{subtitle}</span>}
      </div>
      {onShare && (
        <button
          type="button"
          onClick={onShare}
          className="p-0.5 rounded opacity-0 group-hover:opacity-100 transition-all flex-shrink-0 relative"
          style={{ color: PRIMARY }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = `${PRIMARY}14`; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
          title="Share / Invite"
        >
          {(memberCount ?? 0) > 0 ? (
            <UserGroupIcon className="h-3 w-3" />
          ) : (
            <UserPlusIcon className="h-3 w-3" />
          )}
          {(memberCount ?? 0) > 0 && (
            <span
              className="absolute -top-1 -right-1 flex items-center justify-center rounded-full"
              style={{ width: 12, height: 12, fontSize: 8, fontWeight: 700, backgroundColor: PRIMARY, color: '#fff' }}
            >
              {memberCount}
            </span>
          )}
        </button>
      )}
      <button
        type="button"
        onClick={onEdit}
        className="p-0.5 rounded opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
        style={{ color: TEXT_MUTED }}
        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.07)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
      >
        <PencilIcon className="h-3 w-3" />
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="p-0.5 rounded opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
        style={{ color: '#C87868' }}
        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(200,120,104,0.10)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
      >
        <TrashIcon className="h-3 w-3" />
      </button>
    </div>
  );

  /* ── Inline share panel ── */
  const SharePanel = ({ itemId, itemName, scope, color }: { itemId: string; itemName: string; scope: ShareScope; color: string }) => {
    const share = getShareForItem(itemId);
    const members = share?.members ?? [];
    return (
      <div
        className="space-y-2.5 p-3 rounded-xl"
        style={{ backgroundColor: `${PRIMARY}06`, border: `1.5px solid ${PRIMARY}30` }}
      >
        <div className="flex items-center gap-2">
          <UserGroupIcon className="h-3.5 w-3.5 flex-shrink-0" style={{ color: PRIMARY }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: TEXT }}>Share "{itemName}"</span>
        </div>
        <p style={{ fontSize: 10, color: TEXT_MUTED, lineHeight: 1.4 }}>
          {scope === 'calendar' && 'All events in this calendar will be shared.'}
          {scope === 'category' && 'All events in this category will be shared.'}
          {scope === 'tag' && 'All events with this tag will be shared.'}
        </p>

        {/* Add member */}
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            type="email"
            value={shareEmail}
            onChange={(e) => setShareEmail(e.target.value)}
            placeholder="Email address"
            style={{ ...inputStyle, flex: 1 }}
            onKeyDown={(e) => e.key === 'Enter' && handleAddShareMember()}
          />
          <button
            type="button"
            onClick={handleAddShareMember}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 10px',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 500,
              backgroundColor: PRIMARY,
              color: '#FFFFFF',
              border: 'none',
              cursor: 'pointer',
              flexShrink: 0,
              whiteSpace: 'nowrap' as const,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#7A9278'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = PRIMARY; }}
          >
            <PlusIcon style={{ width: 12, height: 12 }} /> Invite
          </button>
        </div>

        {/* Options */}
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 cursor-pointer" style={{ fontSize: 10, color: TEXT_SECONDARY }}>
            <input
              type="checkbox"
              checked={shareIncludeExisting}
              onChange={(e) => setShareIncludeExisting(e.target.checked)}
              className="w-3 h-3 rounded border-neutral-300"
            />
            Include existing events
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer" style={{ fontSize: 10, color: TEXT_SECONDARY }}>
            <input
              type="checkbox"
              checked={sharePushToGoogle}
              onChange={(e) => setSharePushToGoogle(e.target.checked)}
              className="w-3 h-3 rounded border-neutral-300"
            />
            Push to Google Calendar
          </label>
        </div>

        {/* Member list */}
        {members.length > 0 && (
          <div className="space-y-1">
            <span style={{ fontSize: 10, fontWeight: 500, color: TEXT_MUTED }}>Members ({members.length})</span>
            {members.map((member) => (
              <div
                key={member.id}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg"
                style={{ backgroundColor: 'rgba(0,0,0,0.03)', border: `1px solid ${BORDER}` }}
              >
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: `${color}25`, color, fontSize: 9, fontWeight: 600 }}
                >
                  {member.email.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="block truncate" style={{ fontSize: 11, color: TEXT }}>{member.email}</span>
                  <span style={{ fontSize: 9, color: member.status === 'accepted' ? '#34C759' : member.status === 'declined' ? '#FF3B30' : TEXT_MUTED }}>
                    {member.status === 'pending' ? 'Pending' : member.status === 'accepted' ? 'Accepted' : 'Declined'}
                    {member.userId ? '' : ' (non-user)'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveShareMember(`share-${itemId}`, member.id)}
                  className="p-0.5 rounded transition-colors flex-shrink-0"
                  style={{ color: '#C87868' }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(200,120,104,0.10)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  <XMarkIcon className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Close */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setSharingId(null)}
            className="px-2.5 py-1.5 rounded-md text-xs transition-colors"
            style={{ backgroundColor: 'rgba(0,0,0,0.06)', color: TEXT_SECONDARY }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.10)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.06)'; }}
          >
            Done
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
      />

      {/* Panel — fixed size */}
      <div
        data-tour="settings-popup"
        className="relative flex flex-col"
        style={{
          backgroundColor: BG,
          borderRadius: 14,
          boxShadow: '0 24px 64px rgba(0,0,0,0.14)',
          border: `1px solid ${BORDER}`,
          width: 440,
          maxWidth: '92vw',
          height: 500,
          maxHeight: '85vh',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between flex-shrink-0"
          style={{ borderBottom: `1px solid ${BORDER}`, padding: '12px 16px 12px 20px' }}
        >
          <h2 style={{ fontSize: 14, fontWeight: 600, color: TEXT, paddingLeft: 2 }}>Settings</h2>
          <button
            onClick={onClose}
            className="flex items-center justify-center rounded-lg transition-colors"
            style={{ width: 26, height: 26, color: TEXT_MUTED }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.07)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 pt-3 pb-2 flex-shrink-0" style={{ paddingLeft: 16, paddingRight: 16 }}>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); setEditingId(null); setIsAdding(false); }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all"
                style={{
                  fontSize: 11,
                  fontWeight: active ? 600 : 400,
                  color: active ? PRIMARY : TEXT_SECONDARY,
                  backgroundColor: active ? `${PRIMARY}14` : 'transparent',
                  border: active ? `1px solid ${PRIMARY}28` : '1px solid transparent',
                }}
              >
                <Icon className="h-3 w-3" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Divider */}
        <div style={{ height: 1, backgroundColor: BORDER, margin: '12px 16px 0' }} />

        {/* Scrollable content — 2-column grid */}
        <div className="flex-1 overflow-y-auto min-h-0 px-4 py-4">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
              alignContent: 'start',
            }}
          >
            {/* ── General ── */}
            {activeTab === 'general' && (
              <>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label
                    htmlFor="week-starts-monday-toggle"
                    className="flex items-center justify-between gap-3 py-3 px-3 rounded-lg cursor-pointer"
                    style={{ backgroundColor: 'rgba(0,0,0,0.03)', border: `1px solid ${BORDER}` }}
                  >
                    <div className="flex-1 min-w-0">
                      <p style={{ fontSize: 12, fontWeight: 500, color: TEXT }}>Week starts on Monday</p>
                      <p style={{ fontSize: 10, color: TEXT_MUTED, marginTop: 2 }}>Show Mon–Sun in week and month views</p>
                    </div>
                    <button
                      id="week-starts-monday-toggle"
                      type="button"
                      role="switch"
                      aria-checked={weekStartsOnMonday}
                      onClick={(e) => {
                        e.preventDefault();
                        onWeekStartsOnMondayChange?.(!weekStartsOnMonday);
                      }}
                      className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-0 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2"
                      style={{
                        backgroundColor: weekStartsOnMonday ? PRIMARY : 'rgba(0,0,0,0.2)',
                        minWidth: 44,
                        minHeight: 24,
                      }}
                    >
                      <span
                        className="pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform"
                        style={{
                          marginLeft: 2,
                          marginTop: 2,
                          transform: weekStartsOnMonday ? 'translateX(20px)' : 'translateX(0)',
                        }}
                      />
                    </button>
                  </label>
                </div>

                {/* Wake / Sleep time */}
                <div
                  className="flex items-center justify-between gap-3 py-3 px-3 rounded-lg"
                  style={{ backgroundColor: 'rgba(0,0,0,0.03)', border: `1px solid ${BORDER}` }}
                >
                  <div className="flex-1 min-w-0">
                    <p style={{ fontSize: 12, fontWeight: 500, color: TEXT }}>Wake time</p>
                    <p style={{ fontSize: 10, color: TEXT_MUTED, marginTop: 2 }}>Earliest scheduling boundary</p>
                  </div>
                  <input
                    type="time"
                    value={wakeTime}
                    onChange={(e) => onWakeTimeChange?.(e.target.value)}
                    className="rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-neutral-300"
                    style={{ border: `1px solid ${BORDER}`, color: TEXT, backgroundColor: '#FFFFFF', width: 100 }}
                  />
                </div>
                <div
                  className="flex items-center justify-between gap-3 py-3 px-3 rounded-lg"
                  style={{ backgroundColor: 'rgba(0,0,0,0.03)', border: `1px solid ${BORDER}` }}
                >
                  <div className="flex-1 min-w-0">
                    <p style={{ fontSize: 12, fontWeight: 500, color: TEXT }}>Sleep time</p>
                    <p style={{ fontSize: 10, color: TEXT_MUTED, marginTop: 2 }}>Latest scheduling boundary</p>
                  </div>
                  <input
                    type="time"
                    value={sleepTime}
                    onChange={(e) => onSleepTimeChange?.(e.target.value)}
                    className="rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-neutral-300"
                    style={{ border: `1px solid ${BORDER}`, color: TEXT, backgroundColor: '#FFFFFF', width: 100 }}
                  />
                </div>

                {/* ── Timezone ── */}
                <div style={{ gridColumn: '1 / -1', marginTop: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: TEXT_MUTED, letterSpacing: '0.05em', textTransform: 'uppercase' as const, display: 'block', marginBottom: 8 }}>Timezone</span>
                  <div
                    className="py-3 px-3 rounded-lg"
                    style={{ backgroundColor: 'rgba(0,0,0,0.03)', border: `1px solid ${BORDER}` }}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex-1 min-w-0">
                        <p style={{ fontSize: 12, fontWeight: 500, color: TEXT }}>Current timezone</p>
                        <p style={{ fontSize: 10, color: TEXT_MUTED, marginTop: 2 }}>
                          Detected: {browserTz}
                          {selectedTz !== browserTz && (
                            <span style={{ color: PRIMARY }}> (overridden)</span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div style={{ position: 'relative', marginTop: 8 }}>
                      <button
                        type="button"
                        onClick={() => setTzDropdownOpen(!tzDropdownOpen)}
                        className="w-full flex items-center justify-between rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-neutral-300"
                        style={{ border: `1px solid ${BORDER}`, color: TEXT, backgroundColor: '#FFFFFF', textAlign: 'left' }}
                      >
                        <span className="truncate">{selectedTz}</span>
                        <svg className="w-3 h-3 ml-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tzDropdownOpen ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'} />
                        </svg>
                      </button>
                      {tzDropdownOpen && (
                        <div
                          style={{
                            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                            backgroundColor: '#FFFFFF', border: `1px solid ${BORDER}`, borderRadius: 8,
                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxHeight: 220, overflow: 'hidden',
                            display: 'flex', flexDirection: 'column', marginTop: 2,
                          }}
                        >
                          <div style={{ padding: '6px 8px', borderBottom: `1px solid ${BORDER}` }}>
                            <input
                              type="text"
                              placeholder="Search timezones..."
                              value={tzSearch}
                              onChange={(e) => setTzSearch(e.target.value)}
                              className="w-full text-xs px-2 py-1 rounded focus:outline-none"
                              style={{ border: `1px solid ${BORDER}`, color: TEXT }}
                              autoFocus
                            />
                          </div>
                          <div style={{ overflowY: 'auto', maxHeight: 180 }}>
                            {selectedTz !== browserTz && (
                              <button
                                type="button"
                                onClick={() => handleTimezoneChange(browserTz)}
                                className="w-full text-left px-3 py-1.5 text-xs hover:bg-neutral-100 transition-colors"
                                style={{ color: PRIMARY, fontWeight: 500, borderBottom: `1px solid ${BORDER}` }}
                              >
                                Reset to detected ({browserTz})
                              </button>
                            )}
                            {filteredTimezones.map((tz, i) =>
                              tz === '---' ? (
                                <div key={`sep-${i}`} style={{ borderTop: `1px solid ${BORDER}`, margin: '2px 0' }} />
                              ) : (
                                <button
                                  key={tz}
                                  type="button"
                                  onClick={() => handleTimezoneChange(tz)}
                                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-neutral-100 transition-colors"
                                  style={{
                                    color: tz === selectedTz ? PRIMARY : TEXT,
                                    fontWeight: tz === selectedTz ? 600 : 400,
                                  }}
                                >
                                  {tz}
                                </button>
                              )
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* ── Secondary Timezones ── */}
                <div style={{ gridColumn: '1 / -1', marginTop: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: TEXT_MUTED, letterSpacing: '0.05em', textTransform: 'uppercase' as const, display: 'block', marginBottom: 8 }}>Secondary timezones</span>
                  <div
                    className="py-3 px-3 rounded-lg"
                    style={{ backgroundColor: 'rgba(0,0,0,0.03)', border: `1px solid ${BORDER}` }}
                  >
                    <p style={{ fontSize: 10, color: TEXT_MUTED, marginBottom: 8 }}>
                      Show additional timezone columns in the calendar time gutter (max 2)
                    </p>
                    {/* List of added secondary timezones */}
                    {secondaryTzs.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                        {secondaryTzs.map((tz) => (
                          <div
                            key={tz}
                            className="flex items-center justify-between rounded-md px-2 py-1.5"
                            style={{ backgroundColor: '#FFFFFF', border: `1px solid ${BORDER}` }}
                          >
                            <div className="flex-1 min-w-0">
                              <span className="text-xs truncate block" style={{ color: TEXT, fontWeight: 500 }}>{tz}</span>
                              <span style={{ fontSize: 10, color: TEXT_MUTED }}>
                                {getSecTzAbbr(tz)} · {getSecTzCurrentTime(tz)}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeSecondaryTz(tz)}
                              className="ml-2 flex-shrink-0 p-0.5 rounded hover:bg-neutral-100 transition-colors"
                              style={{ color: TEXT_MUTED }}
                              title="Remove timezone"
                            >
                              <XMarkIcon className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Add timezone button/dropdown */}
                    {secondaryTzs.length < 2 && (
                      <div style={{ position: 'relative' }}>
                        <button
                          type="button"
                          onClick={() => setSecTzDropdownOpen(!secTzDropdownOpen)}
                          className="flex items-center gap-1 text-xs px-2 py-1 rounded-md hover:bg-neutral-100 transition-colors"
                          style={{ color: PRIMARY, fontWeight: 500, border: `1px dashed ${BORDER}` }}
                        >
                          <PlusIcon className="w-3 h-3" />
                          Add timezone
                        </button>
                        {secTzDropdownOpen && (
                          <div
                            style={{
                              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                              backgroundColor: '#FFFFFF', border: `1px solid ${BORDER}`, borderRadius: 8,
                              boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxHeight: 220, overflow: 'hidden',
                              display: 'flex', flexDirection: 'column', marginTop: 2,
                            }}
                          >
                            <div style={{ padding: '6px 8px', borderBottom: `1px solid ${BORDER}` }}>
                              <input
                                type="text"
                                placeholder="Search timezones..."
                                value={secTzSearch}
                                onChange={(e) => setSecTzSearch(e.target.value)}
                                className="w-full text-xs px-2 py-1 rounded focus:outline-none"
                                style={{ border: `1px solid ${BORDER}`, color: TEXT }}
                                autoFocus
                              />
                            </div>
                            <div style={{ overflowY: 'auto', maxHeight: 180 }}>
                              {filteredSecTzs.map((tz, i) =>
                                tz === '---' ? (
                                  <div key={`sep-${i}`} style={{ borderTop: `1px solid ${BORDER}`, margin: '2px 0' }} />
                                ) : (
                                  <button
                                    key={tz}
                                    type="button"
                                    onClick={() => addSecondaryTz(tz)}
                                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-neutral-100 transition-colors"
                                    style={{ color: TEXT }}
                                  >
                                    {tz}
                                  </button>
                                )
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Notifications ── */}
                <div style={{ gridColumn: '1 / -1', marginTop: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: TEXT_MUTED, letterSpacing: '0.05em', textTransform: 'uppercase' as const, display: 'block', marginBottom: 8 }}>Notifications</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {/* Push notification scope */}
                    <div
                      className="py-3 px-3 rounded-lg"
                      style={{ backgroundColor: 'rgba(0,0,0,0.03)', border: `1px solid ${BORDER}` }}
                    >
                      <p style={{ fontSize: 12, fontWeight: 500, color: TEXT, marginBottom: 2 }}>Push notifications</p>
                      <p style={{ fontSize: 10, color: TEXT_MUTED, marginBottom: 8 }}>Get reminded before events and tasks start</p>
                      <div className="flex flex-wrap gap-1.5">
                        {([
                          { value: 'events' as const, label: 'Events only' },
                          { value: 'events_and_tasks' as const, label: 'Events & tasks' },
                          { value: 'off' as const, label: 'Off' },
                        ]).map(opt => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => onNotificationScopeChange?.(opt.value)}
                            className="px-3 py-1.5 rounded-md transition-colors"
                            style={{
                              fontSize: 11,
                              fontWeight: notificationScope === opt.value ? 600 : 400,
                              backgroundColor: notificationScope === opt.value ? PRIMARY : 'rgba(0,0,0,0.05)',
                              color: notificationScope === opt.value ? '#FFFFFF' : TEXT_SECONDARY,
                              border: 'none',
                              cursor: 'pointer',
                            }}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Lead time */}
                    {notificationScope !== 'off' && (
                      <div
                        className="flex items-center justify-between gap-3 py-3 px-3 rounded-lg"
                        style={{ backgroundColor: 'rgba(0,0,0,0.03)', border: `1px solid ${BORDER}` }}
                      >
                        <div className="flex-1 min-w-0">
                          <p style={{ fontSize: 12, fontWeight: 500, color: TEXT }}>Remind before</p>
                          <p style={{ fontSize: 10, color: TEXT_MUTED, marginTop: 2 }}>Minutes before event starts</p>
                        </div>
                        <select
                          value={notificationLeadMinutes}
                          onChange={(e) => onNotificationLeadMinutesChange?.(Number(e.target.value))}
                          className="rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-neutral-300"
                          style={{ border: `1px solid ${BORDER}`, color: TEXT, backgroundColor: '#FFFFFF', width: 90 }}
                        >
                          <option value={0}>At start</option>
                          <option value={1}>1 min</option>
                          <option value={2}>2 min</option>
                          <option value={5}>5 min</option>
                          <option value={10}>10 min</option>
                          <option value={15}>15 min</option>
                          <option value={30}>30 min</option>
                          <option value={60}>1 hour</option>
                        </select>
                      </div>
                    )}

                    {/* Email notifications */}
                    <label
                      htmlFor="email-notif-toggle"
                      className="flex items-center justify-between gap-3 py-3 px-3 rounded-lg cursor-pointer"
                      style={{ backgroundColor: 'rgba(0,0,0,0.03)', border: `1px solid ${BORDER}` }}
                    >
                      <div className="flex-1 min-w-0">
                        <p style={{ fontSize: 12, fontWeight: 500, color: TEXT }}>Email notifications</p>
                        <p style={{ fontSize: 10, color: TEXT_MUTED, marginTop: 2 }}>Notify attendees by email when you change an event</p>
                      </div>
                      <button
                        id="email-notif-toggle"
                        type="button"
                        role="switch"
                        aria-checked={emailNotificationsEnabled}
                        onClick={(e) => {
                          e.preventDefault();
                          onEmailNotificationsEnabledChange?.(!emailNotificationsEnabled);
                        }}
                        className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-0 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2"
                        style={{
                          backgroundColor: emailNotificationsEnabled ? PRIMARY : 'rgba(0,0,0,0.2)',
                          minWidth: 44,
                          minHeight: 24,
                        }}
                      >
                        <span
                          className="pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform"
                          style={{
                            marginLeft: 2,
                            marginTop: 2,
                            transform: emailNotificationsEnabled ? 'translateX(20px)' : 'translateX(0)',
                          }}
                        />
                      </button>
                    </label>
                  </div>
                </div>

                {/* ── Google Calendar ── */}
                <div style={{ gridColumn: '1 / -1', marginTop: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: TEXT_MUTED, letterSpacing: '0.05em', textTransform: 'uppercase' as const, display: 'block', marginBottom: 8 }}>Google Calendar</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {/* Connected status */}
                    {isGoogleConnected() && (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          backgroundColor: '#4285F410',
                          border: '1px solid #4285F428',
                          padding: '8px 10px 8px 12px',
                          borderRadius: 8,
                        }}
                      >
                        <CloudIcon style={{ width: 14, height: 14, color: '#4285F4', flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: 12, fontWeight: 500, color: TEXT }}>Google Calendar connected</span>
                          <span style={{ display: 'block', fontSize: 10, color: TEXT_MUTED }}>
                            {localStorage.getItem('gcal_pending_sync_mode') === 'migrate_listen' ? 'Migrated & listening' : localStorage.getItem('gcal_pending_sync_mode') === 'listen_fresh' ? 'Listening (fresh)' : 'Listening (with history)'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            disconnectGoogle();
                            // Remove gcal containers/events from store
                            const state = useStore.getState();
                            useStore.setState({
                              calendarContainers: state.calendarContainers.filter(c => !c.id.startsWith('gcal-')),
                              categories: state.categories.filter(c => !c.id.startsWith('gcal-cat-')),
                              events: state.events.filter(e => !e.googleEventId),
                            });
                            setGcalStep('idle');
                          }}
                          style={{
                            fontSize: 10,
                            fontWeight: 500,
                            color: '#C87868',
                            background: 'none',
                            border: '1px solid rgba(200,120,104,0.25)',
                            borderRadius: 6,
                            padding: '3px 8px',
                            cursor: 'pointer',
                            flexShrink: 0,
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(200,120,104,0.08)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                        >
                          Disconnect
                        </button>
                      </div>
                    )}

                    {/* Manage which calendars are imported */}
                    {isGoogleConnected() && !gcalPickerOpen && (
                      <button
                        type="button"
                        onClick={openGcalPicker}
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                          padding: '7px 0',
                          borderRadius: 8,
                          fontSize: 11,
                          fontWeight: 500,
                          color: '#4285F4',
                          backgroundColor: 'transparent',
                          border: '1px solid #4285F430',
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#4285F408'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                      >
                        <CalendarIcon style={{ width: 12, height: 12 }} />
                        Manage imported calendars
                      </button>
                    )}

                    {/* Calendar picker */}
                    {isGoogleConnected() && gcalPickerOpen && (
                      <div
                        style={{
                          backgroundColor: '#4285F406',
                          border: '1.5px solid #4285F420',
                          borderRadius: 10,
                          padding: 12,
                        }}
                      >
                        <p style={{ fontSize: 11, fontWeight: 600, color: TEXT, marginBottom: 8 }}>
                          Imported calendars
                        </p>
                        {gcalPickerLoading ? (
                          <p style={{ fontSize: 11, color: TEXT_MUTED, textAlign: 'center', padding: '12px 0' }}>Loading calendars...</p>
                        ) : (
                          <>
                            <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 10 }}>
                              {gcalAvailable.map(cal => {
                                const checked = gcalPickerSelected.has(cal.id);
                                return (
                                  <button
                                    key={cal.id}
                                    type="button"
                                    onClick={() => {
                                      setGcalPickerSelected(prev => {
                                        const next = new Set(prev);
                                        if (next.has(cal.id)) next.delete(cal.id);
                                        else next.add(cal.id);
                                        return next;
                                      });
                                    }}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 8,
                                      width: '100%',
                                      padding: '6px 8px',
                                      borderRadius: 7,
                                      border: checked ? `1.5px solid ${cal.backgroundColor}50` : '1px solid rgba(0,0,0,0.05)',
                                      backgroundColor: checked ? `${cal.backgroundColor}08` : '#FFFFFF',
                                      cursor: 'pointer',
                                      marginBottom: 4,
                                      transition: 'all 0.12s',
                                      textAlign: 'left',
                                    }}
                                  >
                                    <div style={{
                                      width: 14,
                                      height: 14,
                                      borderRadius: 4,
                                      border: checked ? `2px solid ${cal.backgroundColor}` : '2px solid rgba(0,0,0,0.18)',
                                      backgroundColor: checked ? cal.backgroundColor : 'transparent',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      flexShrink: 0,
                                    }}>
                                      {checked && (
                                        <svg width="8" height="6" viewBox="0 0 10 8" fill="none">
                                          <path d="M1 4L3.5 6.5L9 1" stroke="#FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                        </svg>
                                      )}
                                    </div>
                                    <div style={{
                                      width: 8,
                                      height: 8,
                                      borderRadius: '50%',
                                      backgroundColor: cal.backgroundColor,
                                      flexShrink: 0,
                                    }} />
                                    <span style={{
                                      fontSize: 11,
                                      fontWeight: 500,
                                      color: checked ? TEXT : TEXT_MUTED,
                                      flex: 1,
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                    }}>
                                      {cal.summary}{cal.primary ? ' (Primary)' : ''}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                              <button
                                type="button"
                                onClick={() => setGcalPickerOpen(false)}
                                style={{
                                  fontSize: 10,
                                  fontWeight: 500,
                                  padding: '4px 10px',
                                  borderRadius: 6,
                                  backgroundColor: 'rgba(0,0,0,0.06)',
                                  color: TEXT_SECONDARY,
                                  border: 'none',
                                  cursor: 'pointer',
                                }}
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={saveGcalPicker}
                                disabled={gcalPickerSaving}
                                style={{
                                  fontSize: 10,
                                  fontWeight: 600,
                                  padding: '4px 12px',
                                  borderRadius: 6,
                                  backgroundColor: '#4285F4',
                                  color: '#FFFFFF',
                                  border: 'none',
                                  cursor: gcalPickerSaving ? 'default' : 'pointer',
                                  opacity: gcalPickerSaving ? 0.6 : 1,
                                }}
                              >
                                {gcalPickerSaving ? 'Saving...' : 'Save'}
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {/* Connect new — only show if not already connected */}
                    {gcalStep === 'idle' && !isGoogleConnected() && (
                      <button
                        type="button"
                        onClick={() => setGcalStep('choose_mode')}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl transition-all"
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: '#4285F4',
                          border: '1.5px dashed #4285F450',
                          backgroundColor: '#4285F406',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#4285F40F'; e.currentTarget.style.borderColor = '#4285F4'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#4285F406'; e.currentTarget.style.borderColor = '#4285F450'; }}
                      >
                        <CloudIcon className="h-4 w-4" />
                        Connect Google Calendar
                      </button>
                    )}

                    {/* Choose sync mode */}
                    {gcalStep === 'choose_mode' && (
                      <div
                        className="space-y-3 p-3 rounded-xl"
                        style={{ backgroundColor: '#4285F406', border: '1.5px solid #4285F430' }}
                      >
                        <p style={{ fontSize: 12, fontWeight: 600, color: TEXT }}>How would you like to connect?</p>
                        {([
                          { mode: 'migrate_listen' as const, title: 'Migrate & Listen', desc: 'Import all existing events, then only get new invites from others. Best if you\'re switching to Timebox.' },
                          { mode: 'listen_with_history' as const, title: 'Listen (with history)', desc: 'Import past invites from others + listen for new ones. Your own events stay in Google.' },
                          { mode: 'listen_fresh' as const, title: 'Listen (fresh start)', desc: 'No import. Only new invites from others show up going forward.' },
                        ]).map(({ mode, title, desc }) => (
                          <button
                            key={mode}
                            type="button"
                            className="w-full text-left px-3 py-2.5 rounded-lg transition-all"
                            style={{
                              border: gcalSyncMode === mode ? '1.5px solid #4285F4' : '1px solid rgba(0,0,0,0.08)',
                              backgroundColor: gcalSyncMode === mode ? '#4285F40A' : '#FFFFFF',
                            }}
                            onClick={() => setGcalSyncMode(mode)}
                          >
                            <div className="flex items-center gap-2">
                              <div
                                className="w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                                style={{ borderColor: gcalSyncMode === mode ? '#4285F4' : 'rgba(0,0,0,0.2)' }}
                              >
                                {gcalSyncMode === mode && (
                                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#4285F4' }} />
                                )}
                              </div>
                              <span style={{ fontSize: 12, fontWeight: 500, color: TEXT }}>{title}</span>
                            </div>
                            <p style={{ fontSize: 10, color: TEXT_MUTED, lineHeight: 1.4, textAlign: 'left', paddingLeft: 24, marginTop: 4 }}>{desc}</p>
                          </button>
                        ))}
                        <div className="flex gap-1.5 justify-end pt-1">
                          <button
                            type="button"
                            onClick={() => setGcalStep('idle')}
                            className="px-2.5 py-1 rounded-md text-xs transition-colors"
                            style={{ backgroundColor: 'rgba(0,0,0,0.06)', color: TEXT_SECONDARY }}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              // Store sync mode for after callback
                              localStorage.setItem('gcal_pending_sync_mode', gcalSyncMode);
                              window.location.href = getGoogleAuthUrl();
                            }}
                            className="flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium transition-colors"
                            style={{ backgroundColor: '#4285F4', color: '#FFFFFF' }}
                          >
                            <CloudIcon className="h-3 w-3" /> Connect
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Info box */}
                    <div
                      className="rounded-lg p-3"
                      style={{ backgroundColor: 'rgba(0,0,0,0.03)', border: `1px solid ${BORDER}` }}
                    >
                      <p style={{ fontSize: 11, fontWeight: 500, color: TEXT_SECONDARY, marginBottom: 4 }}>How it works</p>
                      <ul className="space-y-1.5" style={{ fontSize: 10, color: TEXT_MUTED, lineHeight: 1.4 }}>
                        <li>Timebox reads your Google Calendar using read-only access</li>
                        <li>After initial import, only invites from other people sync in</li>
                        <li>Events synced from Google appear as read-only on your calendar</li>
                        <li>Your Timebox events are never sent back to Google</li>
                      </ul>
                    </div>
                  </div>
                </div>

                {onExploreFeaturesClick && (
                  <button
                    type="button"
                    onClick={onExploreFeaturesClick}
                    className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg cursor-pointer transition-colors"
                    style={{
                      gridColumn: '1 / -1',
                      marginTop: 8,
                      backgroundColor: 'rgba(141,162,134,0.08)',
                      border: `1px solid rgba(141,162,134,0.25)`,
                      color: '#4A6741',
                      fontSize: 12,
                      fontWeight: 600,
                      width: '100%',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(141,162,134,0.15)')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(141,162,134,0.08)')}
                  >
                    Explore features
                  </button>
                )}

                {/* ── Install on Phone ── */}
                <div style={{ marginTop: 20, gridColumn: '1 / -1' }}>
                  <h2 style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.09em', textTransform: 'uppercase' as const, color: '#8E8E93', marginBottom: 10 }}>Install on Phone</h2>
                  <div
                    className="p-3 rounded-xl"
                    style={{ backgroundColor: 'rgba(0,0,0,0.02)', border: '1px solid rgba(0,0,0,0.07)' }}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(141,162,134,0.12)' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8DA286" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                          <line x1="12" y1="18" x2="12.01" y2="18" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p style={{ fontSize: 12, fontWeight: 600, color: '#1C1C1E', margin: 0 }}>Add to Home Screen</p>
                        <p style={{ fontSize: 11, color: '#8E8E93', margin: '2px 0 0' }}>Use Timebox as a full-screen app on your phone.</p>
                      </div>
                    </div>
                    <div style={{ marginTop: 10, fontSize: 12, color: '#3A3A3C', lineHeight: 1.6 }}>
                      <p style={{ fontWeight: 600, fontSize: 11, color: '#8E8E93', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>iPhone / iPad (Safari)</p>
                      <ol style={{ margin: 0, paddingLeft: 18 }}>
                        <li>Tap the <strong>Share</strong> button <span style={{ display: 'inline-block', width: 16, height: 16, verticalAlign: 'middle', marginLeft: 2 }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3A3A3C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg></span></li>
                        <li>Scroll down and tap <strong>Add to Home Screen</strong></li>
                        <li>Tap <strong>Add</strong></li>
                      </ol>
                      <p style={{ fontWeight: 600, fontSize: 11, color: '#8E8E93', margin: '12px 0 6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Android (Chrome)</p>
                      <ol style={{ margin: 0, paddingLeft: 18 }}>
                        <li>Tap the <strong>⋮</strong> menu (top right)</li>
                        <li>Tap <strong>Add to Home screen</strong></li>
                        <li>Tap <strong>Install</strong></li>
                      </ol>
                    </div>
                  </div>
                </div>

                {/* ── Get the Desktop App ── */}
                <div style={{ marginTop: 20, gridColumn: '1 / -1' }}>
                  <h2 style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.09em', textTransform: 'uppercase' as const, color: '#8E8E93', marginBottom: 10 }}>Desktop App</h2>
                  <div
                    className="p-3 rounded-xl"
                    style={{ backgroundColor: 'rgba(0,0,0,0.02)', border: '1px solid rgba(0,0,0,0.07)' }}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(141,162,134,0.12)' }}>
                        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                          <rect x="1.5" y="2.5" width="15" height="11" rx="1.5" stroke="#8DA286" strokeWidth="1.3" />
                          <path d="M5.5 15.5h7" stroke="#8DA286" strokeWidth="1.3" strokeLinecap="round" />
                          <path d="M9 13.5v2" stroke="#8DA286" strokeWidth="1.3" strokeLinecap="round" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p style={{ fontSize: 12, fontWeight: 600, color: '#1C1C1E', margin: 0 }}>Screen activity tracking</p>
                        <p style={{ fontSize: 11, color: '#8E8E93', margin: '2px 0 0' }}>Auto-records what you work on and shows it in your calendar. Knows when you're away.</p>
                      </div>
                    </div>
                    <a
                      href="https://timeboxing.club/desktop"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 mt-3 py-2 px-3 rounded-lg cursor-pointer transition-colors"
                      style={{
                        backgroundColor: '#1C1C1E',
                        color: '#FFFFFF',
                        fontSize: 12,
                        fontWeight: 600,
                        textDecoration: 'none',
                        width: '100%',
                        display: 'flex',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#3A3A3C')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#1C1C1E')}
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M7 1v9M3.5 6.5L7 10l3.5-3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M2 12h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                      </svg>
                      Download for macOS
                    </a>
                  </div>
                </div>
              </>
            )}

            {/* ── Calendars ── */}
            {activeTab === 'calendars' && calendarContainers.map((calendar) => {
              const calColor = calendar.color && /^#[0-9A-Fa-f]{6}$/.test(calendar.color) ? calendar.color : PRIMARY;
              const isEditing = editingId === calendar.id;
              const isSharing = sharingId === calendar.id && sharingScope === 'calendar';
              return (
                <div key={calendar.id} style={(isEditing || isSharing) ? { gridColumn: '1 / -1' } : undefined}>
                  {isSharing ? (
                    <SharePanel itemId={calendar.id} itemName={calendar.name} scope="calendar" color={calColor} />
                  ) : isEditing ? (
                    <EditForm onSave={handleSaveEdit} onCancel={handleCancelEdit} showColor />
                  ) : (
                    <ItemCard
                      color={calColor}
                      name={calendar.name}
                      onEdit={() => handleStartEdit(calendar.id, calendar.name, calendar.color)}
                      onDelete={() => handleDeleteRequest(calendar.id, calendar.name)}
                      onShare={() => handleStartShare(calendar.id, 'calendar')}
                      memberCount={getMemberCount(calendar.id)}
                    />
                  )}
                </div>
              );
            })}

            {/* ── Categories ── */}
            {activeTab === 'categories' && categories.map((category) => {
              const baseColor = category.color && /^#[0-9A-Fa-f]{6}$/.test(category.color) ? category.color : PRIMARY;
              const calIds = (category.calendarContainerIds && category.calendarContainerIds.length > 0)
                ? category.calendarContainerIds
                : (category.calendarContainerId ? [category.calendarContainerId] : []);
              const calNames = calIds.map(id => calendarContainers.find(c => c.id === id)?.name).filter(Boolean) as string[];
              const isEditing = editingId === category.id;
              const isSharing = sharingId === category.id && sharingScope === 'category';
              return (
                <div key={category.id} style={(isEditing || isSharing) ? { gridColumn: '1 / -1' } : undefined}>
                  {isSharing ? (
                    <SharePanel itemId={category.id} itemName={category.name} scope="category" color={baseColor} />
                  ) : isEditing ? (
                    <EditForm onSave={handleSaveEdit} onCancel={handleCancelEdit} showColor />
                  ) : (
                    <ItemCard
                      color={baseColor}
                      name={category.name}
                      subtitle={calNames.join(', ') || undefined}
                      onEdit={() => handleStartEdit(category.id, category.name, category.color, category)}
                      onDelete={() => handleDeleteRequest(category.id, category.name)}
                      onShare={() => handleStartShare(category.id, 'category')}
                      memberCount={getMemberCount(category.id)}
                    />
                  )}
                </div>
              );
            })}

            {/* ── Tags ── */}
            {activeTab === 'tags' && tags.map((tag) => {
              const parentCategory = tag.categoryId ? categories.find((c) => c.id === tag.categoryId) : undefined;
              const tagColor = parentCategory?.color && /^#[0-9A-Fa-f]{6}$/.test(parentCategory.color) ? parentCategory.color : PRIMARY;
              const isEditing = editingId === tag.id;
              const isSharing = sharingId === tag.id && sharingScope === 'tag';
              return (
                <div key={tag.id} style={(isEditing || isSharing) ? { gridColumn: '1 / -1' } : undefined}>
                  {isSharing ? (
                    <SharePanel itemId={tag.id} itemName={tag.name} scope="tag" color={tagColor} />
                  ) : isEditing ? (
                    <EditForm onSave={handleSaveEdit} onCancel={handleCancelEdit} showColor={false} />
                  ) : (
                    <ItemCard
                      color={tagColor}
                      name={tag.name}
                      subtitle={parentCategory?.name}
                      icon={TagIcon}
                      onEdit={() => handleStartEdit(tag.id, tag.name)}
                      onDelete={() => handleDeleteRequest(tag.id, tag.name)}
                      onShare={() => handleStartShare(tag.id, 'tag')}
                      memberCount={getMemberCount(tag.id)}
                    />
                  )}
                </div>
              );
            })}

            {/* ── Add new form (calendars, categories, tags only) ── */}
            {activeTab !== 'general' && (isAdding ? (
              <div
                className="space-y-2 p-3 rounded-xl"
                style={{ gridColumn: '1 / -1', border: `1.5px dashed ${PRIMARY}50`, backgroundColor: `${PRIMARY}06` }}
              >
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  style={inputStyle}
                  placeholder={`New ${activeTab.slice(0, -1)} name`}
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveAdd()}
                />
                {(activeTab === 'calendars' || activeTab === 'categories') && (
                  <ColorPicker label="Color" value={newColor} onChange={setNewColor} swatchSize="sm" />
                )}
                <div className="flex gap-1.5 justify-end pt-0.5">
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="px-2.5 py-1 rounded-md text-xs transition-colors"
                    style={{ backgroundColor: 'rgba(0,0,0,0.06)', color: TEXT_SECONDARY }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.10)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.06)'; }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveAdd}
                    className="flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium transition-colors"
                    style={{ backgroundColor: PRIMARY, color: '#FFFFFF' }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#7A9278'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = PRIMARY; }}
                  >
                    <PlusIcon className="h-3 w-3" /> Add
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleStartAdd}
                className="flex items-center justify-center gap-1.5 py-2 rounded-xl transition-all"
                style={{
                  gridColumn: '1 / -1',
                  fontSize: 12,
                  fontWeight: 500,
                  color: TEXT_MUTED,
                  border: `1.5px dashed rgba(0,0,0,0.15)`,
                  backgroundColor: 'transparent',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = PRIMARY;
                  e.currentTarget.style.borderColor = `${PRIMARY}60`;
                  e.currentTarget.style.backgroundColor = `${PRIMARY}06`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = TEXT_MUTED;
                  e.currentTarget.style.borderColor = 'rgba(0,0,0,0.15)';
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <PlusIcon className="h-3.5 w-3.5" />
                Add {activeTab.slice(0, -1)}
              </button>
            ))}
          </div>
        </div>

        {/* Version label */}
        <div className="flex-shrink-0 text-center py-2" style={{ borderTop: `1px solid ${BORDER}` }}>
          <span style={{ fontSize: 10, color: TEXT_MUTED, letterSpacing: '0.02em' }}>v{__APP_VERSION__}</span>
        </div>

        {/* ── Delete confirmation overlay ── */}
        {confirmDeleteId && (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ backgroundColor: 'rgba(0,0,0,0.18)', borderRadius: 14, zIndex: 10 }}
          >
            <div
              className="rounded-2xl mx-4"
              style={{
                backgroundColor: '#FFFFFF',
                border: '1px solid rgba(0,0,0,0.09)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
                maxWidth: 300,
                width: '100%',
                padding: 24,
              }}
            >
              <p style={{ fontSize: 14, fontWeight: 600, color: TEXT, marginBottom: 8 }}>Delete "{confirmDeleteName}"?</p>
              {activeTab === 'calendars' ? (
                <>
                  <p style={{ fontSize: 12, color: TEXT_SECONDARY, marginBottom: 12, lineHeight: 1.5 }}>
                    Type the following to confirm:
                  </p>
                  <p style={{ fontSize: 11, color: TEXT, marginBottom: 12, lineHeight: 1.5, fontWeight: 500, backgroundColor: 'rgba(0,0,0,0.04)', padding: '8px 10px', borderRadius: 8, userSelect: 'all' }}>
                    I understand the {confirmDeleteName} and events in it will be deleted forever
                  </p>
                  <input
                    type="text"
                    value={confirmDeleteInput}
                    onChange={(e) => setConfirmDeleteInput(e.target.value)}
                    placeholder="Type confirmation here..."
                    autoFocus
                    style={{
                      width: '100%',
                      fontSize: 11,
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: '1px solid rgba(0,0,0,0.12)',
                      outline: 'none',
                      marginBottom: 16,
                      color: TEXT,
                      backgroundColor: '#FAFAFA',
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = PRIMARY; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.12)'; }}
                  />
                </>
              ) : (
                <p style={{ fontSize: 12, color: TEXT_SECONDARY, marginBottom: 20, lineHeight: 1.5 }}>
                  This cannot be undone. Are you sure you want to delete this {activeTab.slice(0, -1)}?
                </p>
              )}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => { setConfirmDeleteId(null); setConfirmDeleteName(''); setConfirmDeleteInput(''); }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                  style={{ backgroundColor: 'rgba(0,0,0,0.06)', color: TEXT_SECONDARY }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.10)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.06)'; }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteConfirm}
                  disabled={activeTab === 'calendars' && confirmDeleteInput !== `I understand the ${confirmDeleteName} and events in it will be deleted forever`}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: activeTab === 'calendars' && confirmDeleteInput !== `I understand the ${confirmDeleteName} and events in it will be deleted forever` ? 'rgba(255,59,48,0.35)' : '#FF3B30',
                    color: '#FFFFFF',
                    cursor: activeTab === 'calendars' && confirmDeleteInput !== `I understand the ${confirmDeleteName} and events in it will be deleted forever` ? 'not-allowed' : 'pointer',
                  }}
                  onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = '#D93025'; }}
                  onMouseLeave={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = '#FF3B30'; }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
