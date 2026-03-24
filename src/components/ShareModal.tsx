import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  XMarkIcon,
  LinkIcon,
  CheckIcon,
  TrashIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/solid';
import type { ShareScope } from '../types/sharing';

export type ShareRole = 'viewer' | 'editor' | 'admin';

export interface Collaborator {
  id: string;
  email: string;
  role: ShareRole;
  status: 'pending' | 'accepted' | 'declined';
}

interface ShareModalProps {
  /** What is being shared */
  scope: ShareScope;
  /** ID of the calendar/category/tag */
  scopeId: string;
  /** Display name (e.g. "Work Calendar") */
  name: string;
  /** Color for accent styling */
  color: string;
  /** Current collaborators */
  collaborators: Collaborator[];
  /** Called when user invites someone */
  onInvite: (email: string, role: ShareRole) => void;
  /** Called when user removes a collaborator */
  onRemove: (collaboratorId: string) => void;
  /** Called when user updates a collaborator's role */
  onUpdateRole: (collaboratorId: string, role: ShareRole) => void;
  /** Called when user copies the share link */
  onCopyLink: () => void;
  /** Close modal */
  onClose: () => void;
}

const ROLE_LABELS: Record<ShareRole, string> = {
  viewer: 'Viewer',
  editor: 'Editor',
  admin: 'Admin',
};

const ROLE_DESCRIPTIONS: Record<ShareRole, string> = {
  viewer: 'Can view events and blocks',
  editor: 'Can view, add, and edit',
  admin: 'Full access + manage sharing',
};

const SCOPE_LABELS: Record<ShareScope, string> = {
  calendar: 'Calendar',
  category: 'Category',
  tag: 'Tag',
  event: 'Event',
};

function RoleDropdown({
  value,
  onChange,
  color,
}: {
  value: ShareRole;
  onChange: (role: ShareRole) => void;
  color: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', handler, true);
    return () => document.removeEventListener('pointerdown', handler, true);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 3,
          fontSize: 11,
          fontWeight: 500,
          color: '#3A3A3C',
          backgroundColor: 'rgba(0,0,0,0.04)',
          border: '1px solid rgba(0,0,0,0.08)',
          borderRadius: 6,
          padding: '4px 8px',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        {ROLE_LABELS[value]}
        <ChevronDownIcon style={{ width: 10, height: 10, color: '#8E8E93' }} />
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 4,
            backgroundColor: '#FFFFFF',
            border: '1px solid rgba(0,0,0,0.10)',
            borderRadius: 8,
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            zIndex: 300,
            minWidth: 160,
            overflow: 'hidden',
          }}
        >
          {(['viewer', 'editor', 'admin'] as ShareRole[]).map((role) => (
            <button
              key={role}
              type="button"
              onClick={() => {
                onChange(role);
                setOpen(false);
              }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                width: '100%',
                padding: '8px 12px',
                border: 'none',
                background: value === role ? `${color}08` : 'transparent',
                cursor: 'pointer',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => {
                if (value !== role) e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.03)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = value === role ? `${color}08` : 'transparent';
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 500, color: value === role ? color : '#1C1C1E' }}>
                {ROLE_LABELS[role]}
              </span>
              <span style={{ fontSize: 10, color: '#8E8E93', marginTop: 1 }}>
                {ROLE_DESCRIPTIONS[role]}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ShareModal({
  scope,
  scopeId,
  name,
  color,
  collaborators,
  onInvite,
  onRemove,
  onUpdateRole,
  onCopyLink,
  onClose,
}: ShareModalProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<ShareRole>('viewer');
  const [linkCopied, setLinkCopied] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleInvite = () => {
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes('@')) return;
    onInvite(trimmed, role);
    setEmail('');
  };

  const handleCopyLink = () => {
    onCopyLink();
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 250,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.25)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={modalRef}
        style={{
          width: 400,
          maxHeight: '80vh',
          backgroundColor: '#FFFFFF',
          borderRadius: 14,
          boxShadow: '0 8px 40px rgba(0,0,0,0.16)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px 12px',
            borderBottom: '1px solid rgba(0,0,0,0.07)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 3,
                backgroundColor: color,
                flexShrink: 0,
              }}
            />
            <div style={{ minWidth: 0 }}>
              <h3
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#1C1C1E',
                  margin: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                Share {name}
              </h3>
              <span style={{ fontSize: 10, color: '#8E8E93', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {SCOPE_LABELS[scope]}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: 4,
              borderRadius: 6,
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              color: '#8E8E93',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <XMarkIcon style={{ width: 18, height: 18 }} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>
          {/* Copy link section */}
          <button
            type="button"
            onClick={handleCopyLink}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid rgba(0,0,0,0.08)',
              backgroundColor: linkCopied ? `${color}08` : '#FAFAFA',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => {
              if (!linkCopied) e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.04)';
            }}
            onMouseLeave={(e) => {
              if (!linkCopied) e.currentTarget.style.backgroundColor = '#FAFAFA';
            }}
          >
            {linkCopied ? (
              <CheckIcon style={{ width: 16, height: 16, color, flexShrink: 0 }} />
            ) : (
              <LinkIcon style={{ width: 16, height: 16, color: '#8E8E93', flexShrink: 0 }} />
            )}
            <div style={{ flex: 1, textAlign: 'left' }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: linkCopied ? color : '#1C1C1E' }}>
                {linkCopied ? 'Link copied!' : 'Copy public view link'}
              </span>
              <span style={{ display: 'block', fontSize: 10, color: '#8E8E93', marginTop: 1 }}>
                Anyone with the link can view
              </span>
            </div>
          </button>

          {/* Divider */}
          <div style={{ height: 1, backgroundColor: 'rgba(0,0,0,0.06)', margin: '16px 0' }} />

          {/* Add people */}
          <div>
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '0.09em',
                textTransform: 'uppercase',
                color: '#8E8E93',
              }}
            >
              Add people
            </span>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleInvite();
                  }
                }}
                placeholder="Email address"
                style={{
                  flex: 1,
                  fontSize: 12,
                  padding: '7px 10px',
                  borderRadius: 8,
                  border: '1px solid rgba(0,0,0,0.10)',
                  backgroundColor: '#FFFFFF',
                  color: '#1C1C1E',
                  outline: 'none',
                }}
              />
              <RoleDropdown value={role} onChange={setRole} color={color} />
              <button
                type="button"
                onClick={handleInvite}
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  padding: '7px 14px',
                  borderRadius: 8,
                  border: 'none',
                  backgroundColor: color,
                  color: '#FFFFFF',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  opacity: email.trim().includes('@') ? 1 : 0.5,
                }}
              >
                Invite
              </button>
            </div>
          </div>

          {/* Collaborators list */}
          {collaborators.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: '0.09em',
                  textTransform: 'uppercase',
                  color: '#8E8E93',
                }}
              >
                People with access ({collaborators.length})
              </span>
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {collaborators.map((collab) => (
                  <CollaboratorRow
                    key={collab.id}
                    collaborator={collab}
                    color={color}
                    onUpdateRole={(r) => onUpdateRole(collab.id, r)}
                    onRemove={() => onRemove(collab.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function CollaboratorRow({
  collaborator,
  color,
  onUpdateRole,
  onRemove,
}: {
  collaborator: Collaborator;
  color: string;
  onUpdateRole: (role: ShareRole) => void;
  onRemove: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 8px',
        borderRadius: 8,
        backgroundColor: hovered ? 'rgba(0,0,0,0.03)' : 'transparent',
        transition: 'background-color 0.1s',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Avatar circle */}
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          backgroundColor: `${color}18`,
          color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          fontWeight: 600,
          flexShrink: 0,
        }}
      >
        {collaborator.email.charAt(0).toUpperCase()}
      </div>

      {/* Email + status */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            display: 'block',
            fontSize: 12,
            fontWeight: 500,
            color: '#1C1C1E',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {collaborator.email}
        </span>
        {collaborator.status === 'pending' && (
          <span style={{ fontSize: 10, color: '#AEAEB2' }}>Invite pending</span>
        )}
      </div>

      {/* Role dropdown */}
      <RoleDropdown value={collaborator.role} onChange={onUpdateRole} color={color} />

      {/* Remove button */}
      <button
        type="button"
        onClick={onRemove}
        style={{
          padding: 4,
          borderRadius: 4,
          border: 'none',
          background: 'none',
          cursor: 'pointer',
          color: '#AEAEB2',
          opacity: hovered ? 1 : 0,
          transition: 'opacity 0.1s',
          flexShrink: 0,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = '#FF3B30')}
        onMouseLeave={(e) => (e.currentTarget.style.color = '#AEAEB2')}
        title="Remove"
      >
        <TrashIcon style={{ width: 14, height: 14 }} />
      </button>
    </div>
  );
}
