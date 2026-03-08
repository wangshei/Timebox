import React, { useState } from 'react';
import { XMarkIcon, PlusIcon, PencilIcon, TrashIcon, CalendarIcon, FolderIcon, TagIcon, CheckIcon, Cog6ToothIcon, UserPlusIcon, UserGroupIcon, CloudIcon } from '@heroicons/react/24/solid';
import type { CalendarContainer, Category, Tag } from '../types';
import type { CalendarShare, ShareMember, ShareScope } from '../types/sharing';
import { ColorPicker } from './ColorPicker';
import { DEFAULT_PALETTE_COLOR } from '../constants/colors';

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
                  className="flex items-center gap-1 px-2 py-0.5 rounded-md transition-all"
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
          className="px-2.5 py-1 rounded-md text-xs transition-colors"
          style={{ backgroundColor: 'rgba(0,0,0,0.06)', color: TEXT_SECONDARY }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.10)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.06)'; }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          className="flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium transition-colors"
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
        <div className="flex gap-1.5">
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
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors flex-shrink-0"
            style={{ backgroundColor: PRIMARY, color: '#FFFFFF' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#7A9278'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = PRIMARY; }}
          >
            <PlusIcon className="h-3 w-3" /> Invite
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
            className="px-2.5 py-1 rounded-md text-xs transition-colors"
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

                {/* ── Google Calendar ── */}
                <div style={{ gridColumn: '1 / -1', marginTop: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: TEXT_MUTED, letterSpacing: '0.05em', textTransform: 'uppercase' as const, display: 'block', marginBottom: 8 }}>Google Calendar</span>
                  <div className="space-y-3">
                    {/* Connected calendars */}
                    {gcalConnectedCalendars.length > 0 && (
                      <div className="space-y-2">
                        {gcalConnectedCalendars.map((cal, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-2 rounded-lg"
                            style={{ backgroundColor: '#4285F410', border: '1px solid #4285F428', padding: '8px 10px 8px 12px' }}
                          >
                            <CloudIcon className="h-3 w-3 flex-shrink-0" style={{ color: '#4285F4' }} />
                            <div className="flex-1 min-w-0">
                              <span className="block truncate" style={{ fontSize: 12, fontWeight: 500, color: TEXT }}>{cal.name}</span>
                              <span className="block truncate" style={{ fontSize: 10, color: TEXT_MUTED }}>
                                {cal.mode === 'migrate_listen' ? 'Migrated & listening' : cal.mode === 'listen_with_history' ? 'Listening (with history)' : 'Listening (fresh)'}
                                {cal.lastSync && ` · Last sync: ${new Date(cal.lastSync).toLocaleTimeString()}`}
                              </span>
                            </div>
                            <button
                              type="button"
                              className="p-0.5 rounded transition-all flex-shrink-0"
                              style={{ color: '#C87868' }}
                              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(200,120,104,0.10)'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                              onClick={() => setGcalConnectedCalendars((prev) => prev.filter((_, idx) => idx !== i))}
                              title="Disconnect"
                            >
                              <TrashIcon className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Connect new */}
                    {gcalStep === 'idle' && (
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
                            <p className="mt-1 pl-6" style={{ fontSize: 10, color: TEXT_MUTED, lineHeight: 1.4 }}>{desc}</p>
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
                              setGcalStep('connected');
                              setGcalConnectedCalendars((prev) => [
                                ...prev,
                                { name: `Google Calendar (${gcalSyncMode})`, mode: gcalSyncMode, lastSync: new Date().toISOString() },
                              ]);
                              setTimeout(() => setGcalStep('idle'), 100);
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

        {/* ── Delete confirmation overlay ── */}
        {confirmDeleteId && (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ backgroundColor: 'rgba(0,0,0,0.18)', borderRadius: 14, zIndex: 10 }}
          >
            <div
              className="rounded-2xl p-5 mx-4"
              style={{
                backgroundColor: '#FFFFFF',
                border: '1px solid rgba(0,0,0,0.09)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
                maxWidth: 300,
                width: '100%',
              }}
            >
              <p style={{ fontSize: 14, fontWeight: 600, color: TEXT, marginBottom: 8 }}>Delete "{confirmDeleteName}"?</p>
              <p style={{ fontSize: 12, color: TEXT_SECONDARY, marginBottom: 20, lineHeight: 1.5 }}>
                This cannot be undone. Are you sure you want to delete this {activeTab.slice(0, -1)}?
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => { setConfirmDeleteId(null); setConfirmDeleteName(''); }}
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
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                  style={{ backgroundColor: '#FF3B30', color: '#FFFFFF' }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#D93025'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#FF3B30'; }}
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
