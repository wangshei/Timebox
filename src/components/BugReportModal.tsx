import React, { useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/solid';
import type { SupabaseClient } from '@supabase/supabase-js';

interface BugReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail?: string;
  supabase: SupabaseClient | null;
}

type Status = 'idle' | 'submitting' | 'success' | 'error';

const SUPPORT_EMAIL = 'wangsheila.work@gmail.com';

export function BugReportModal({ isOpen, onClose, userEmail, supabase }: BugReportModalProps) {
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleClose = () => {
    if (status === 'submitting') return;
    setDescription('');
    setStatus('idle');
    setErrorMsg('');
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return;

    setStatus('submitting');
    setErrorMsg('');

    try {
      if (supabase) {
        const { error } = await supabase.from('bug_reports').insert([
          {
            user_email: userEmail ?? null,
            description: description.trim(),
          },
        ]);
        if (error) throw error;
      }
      setStatus('success');
    } catch (err) {
      console.error('[BugReport] submit failed', err);
      setStatus('error');
      setErrorMsg('Could not submit — please email us directly.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center px-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.30)' }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div
        className="w-full rounded-2xl flex flex-col overflow-hidden"
        style={{
          maxWidth: '24rem',
          backgroundColor: '#FFFFFF',
          border: '1px solid rgba(0,0,0,0.07)',
          boxShadow: '0 16px 48px rgba(0,0,0,0.18)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}
        >
          <div className="flex items-center gap-2">
            {/* Bug icon */}
            <div
              className="w-6 h-6 rounded-md flex items-center justify-center"
              style={{ backgroundColor: 'rgba(141,162,134,0.12)' }}
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="#8DA286" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="8" cy="9" r="4" />
                <path d="M8 5V3" />
                <path d="M4 9H2M14 9h-2" />
                <path d="M4.5 5.5 3 4M11.5 5.5 13 4" />
                <path d="M4.5 12.5 3 14M11.5 12.5 13 14" />
              </svg>
            </div>
            <span className="text-sm font-semibold" style={{ color: '#1C1C1E' }}>Report a bug</span>
          </div>
          <button
            onClick={handleClose}
            className="p-1 rounded-lg transition-colors"
            style={{ color: '#8E8E93' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.06)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4">
          {status === 'success' ? (
            /* Success state */
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ backgroundColor: 'rgba(141,162,134,0.15)' }}
              >
                <svg width="18" height="14" viewBox="0 0 18 14" fill="none">
                  <path d="M1.5 7l4.5 4.5 10-9" stroke="#8DA286" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-sm font-semibold" style={{ color: '#1C1C1E' }}>Report submitted — thank you!</p>
                <p className="text-xs leading-relaxed" style={{ color: '#636366' }}>
                  For urgent issues, reach us at{' '}
                  <a
                    href={`mailto:${SUPPORT_EMAIL}`}
                    className="font-medium underline"
                    style={{ color: '#8DA286' }}
                  >
                    {SUPPORT_EMAIL}
                  </a>
                </p>
              </div>
              <button
                onClick={handleClose}
                className="mt-1 px-6 py-2 rounded-xl text-sm font-semibold transition-all"
                style={{ backgroundColor: '#8DA286', color: '#1C1C1E' }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#7A9278')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#8DA286')}
              >
                Close
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              {/* Account row */}
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-xl"
                style={{ backgroundColor: '#F5F4F0' }}
              >
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                  style={{ backgroundColor: '#DBE4D7', color: '#5A7454' }}
                >
                  {userEmail ? userEmail[0]!.toUpperCase() : '?'}
                </div>
                <span className="text-xs truncate" style={{ color: '#636366' }}>
                  {userEmail ?? 'Not signed in'}
                </span>
              </div>

              {/* Description */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium" style={{ color: '#636366' }}>
                  What happened?
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe what you were doing and what went wrong…"
                  rows={4}
                  required
                  className="px-3 py-2.5 text-sm rounded-xl outline-none resize-none transition-all"
                  style={{
                    backgroundColor: '#F5F4F0',
                    color: '#1C1C1E',
                    border: '1.5px solid transparent',
                    lineHeight: '1.5',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.border = '1.5px solid rgba(141,162,134,0.65)';
                    e.currentTarget.style.backgroundColor = '#FFFFFF';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.border = '1.5px solid transparent';
                    e.currentTarget.style.backgroundColor = '#F5F4F0';
                  }}
                />
              </div>

              {/* Direct contact */}
              <p className="text-[10px] leading-relaxed" style={{ color: '#C7C7CC' }}>
                For urgent issues, email{' '}
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  style={{ color: '#8E8E93' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#1C1C1E')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = '#8E8E93')}
                >
                  {SUPPORT_EMAIL}
                </a>
              </p>

              {status === 'error' && (
                <p className="text-xs px-3 py-2 rounded-lg" style={{
                  backgroundColor: 'rgba(255,59,48,0.06)',
                  color: '#B85050',
                  border: '1px solid rgba(255,59,48,0.12)',
                }}>
                  {errorMsg}
                </p>
              )}

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={handleClose}
                  className="text-xs font-medium transition-colors"
                  style={{ color: '#8E8E93' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#1C1C1E')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = '#8E8E93')}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!description.trim() || status === 'submitting'}
                  className="px-5 py-2 rounded-xl text-xs font-semibold transition-all disabled:opacity-40"
                  style={{ backgroundColor: '#8DA286', color: '#1C1C1E' }}
                  onMouseEnter={(e) => {
                    if (description.trim() && status !== 'submitting') {
                      e.currentTarget.style.backgroundColor = '#7A9278';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#8DA286';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  {status === 'submitting' ? 'Sending…' : 'Submit report'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
