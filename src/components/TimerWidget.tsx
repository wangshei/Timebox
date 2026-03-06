import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { getLocalDateString } from '../utils/dateTime';
import { parseTimeToMinutes } from '../utils/taskHelpers';
import { THEME } from '../constants/colors';
import { Chip } from './ui/chip';
import { PlayIcon, StopIcon } from '@heroicons/react/24/solid';

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function getCurrentHHMM(): string {
  const now = new Date();
  return `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function addMinutesHHMM(hhmm: string, mins: number): string {
  const total = parseTimeToMinutes(hhmm) + mins;
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function TimerWidget() {
  const activeTimer = useStore((s) => s.activeTimer);
  const timeBlocks = useStore((s) => s.timeBlocks);
  const categories = useStore((s) => s.categories);
  const tags = useStore((s) => s.tags);
  const calendarContainers = useStore((s) => s.calendarContainers);
  const addTimeBlock = useStore((s) => s.addTimeBlock);
  const startTimer = useStore((s) => s.startTimer);
  const stopTimer = useStore((s) => s.stopTimer);

  const [showPopover, setShowPopover] = useState(false);
  const [title, setTitle] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [elapsed, setElapsed] = useState('0:00');
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedCategory = categories.find((c) => c.id === selectedCategoryId);
  const categoryTags = tags.filter((t) => t.categoryId === selectedCategoryId);

  // Tick elapsed time when timer is running
  useEffect(() => {
    if (!activeTimer) {
      setElapsed('0:00');
      return;
    }
    const tick = () => setElapsed(formatElapsed(Date.now() - activeTimer.startedAt));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [activeTimer]);

  // Close popover on outside click
  useEffect(() => {
    if (!showPopover) return;
    const handler = (e: PointerEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowPopover(false);
      }
    };
    document.addEventListener('pointerdown', handler, true);
    return () => document.removeEventListener('pointerdown', handler, true);
  }, [showPopover]);

  // Focus input when popover opens
  useEffect(() => {
    if (showPopover) {
      if (categories.length > 0 && !selectedCategoryId) {
        setSelectedCategoryId(categories[0].id);
      }
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [showPopover]);

  // Clear tags when category changes
  useEffect(() => {
    setSelectedTagIds([]);
  }, [selectedCategoryId]);

  const handlePlayClick = useCallback(() => {
    if (activeTimer) return;
    setTitle('');
    setSelectedTagIds([]);
    setShowPopover(true);
  }, [activeTimer]);

  const toggleTag = useCallback((tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  }, []);

  const handleCreateAndStart = useCallback(() => {
    if (!title.trim()) return;
    const cat = categories.find((c) => c.id === selectedCategoryId);
    if (!cat) return;

    const now = getCurrentHHMM();
    const blockId = addTimeBlock({
      title: title.trim(),
      calendarContainerId: cat.calendarContainerId ?? calendarContainers[0]?.id ?? '',
      categoryId: cat.id,
      tagIds: selectedTagIds,
      start: now,
      end: addMinutesHHMM(now, 30),
      date: getLocalDateString(),
      mode: 'planned',
      source: 'unplanned',
    });

    if (blockId) {
      startTimer(blockId);
      setShowPopover(false);
      setTitle('');
      setSelectedTagIds([]);
    }
  }, [title, selectedCategoryId, selectedTagIds, categories, calendarContainers, addTimeBlock, startTimer]);

  // Timer is running — show elapsed + stop
  if (activeTimer) {
    const timerBlock = timeBlocks.find((b) => b.id === activeTimer.blockId);
    return (
      <div className="flex items-center gap-1.5">
        <span
          className="font-mono font-medium tabular-nums"
          style={{ fontSize: 11, color: THEME.primary }}
          title={timerBlock?.title ?? 'Timer'}
        >
          {elapsed}
        </span>
        <button
          type="button"
          onClick={stopTimer}
          className="p-0.5 rounded transition-colors flex-shrink-0"
          style={{ color: '#FF3B30', backgroundColor: 'transparent' }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,59,48,0.10)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
          title="Stop timer"
        >
          <StopIcon className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  // No timer — show play icon
  return (
    <div className="relative flex items-center">
      <button
        type="button"
        onClick={handlePlayClick}
        className="p-1 rounded transition-colors flex-shrink-0"
        style={{ color: THEME.textMuted, backgroundColor: 'transparent' }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(141,162,134,0.12)';
          e.currentTarget.style.color = THEME.primary;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
          e.currentTarget.style.color = THEME.textMuted;
        }}
        title="Start new timer"
      >
        <PlayIcon className="w-3.5 h-3.5" />
      </button>

      {/* New block popover */}
      {showPopover && (
        <div
          ref={popoverRef}
          className="absolute top-full right-0 mt-1 z-50 rounded-xl shadow-lg"
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid rgba(0,0,0,0.10)',
            width: 240,
            padding: 14,
          }}
        >
          <div className="space-y-3">
            {/* Title input */}
            <input
              ref={inputRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateAndStart();
                if (e.key === 'Escape') setShowPopover(false);
              }}
              placeholder="What are you working on?"
              className="w-full px-2.5 py-1.5 text-xs rounded-lg outline-none"
              style={{
                border: '1px solid rgba(0,0,0,0.10)',
                color: THEME.textPrimary,
                backgroundColor: 'rgba(0,0,0,0.02)',
              }}
            />

            {/* Category chips */}
            <div>
              <label className="block mb-1.5" style={{ fontSize: 10, fontWeight: 600, color: '#636366', letterSpacing: '0.04em' }}>
                Category
              </label>
              <div className="flex flex-wrap gap-1.5">
                {categories.map((cat) => {
                  const isSel = selectedCategoryId === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setSelectedCategoryId(cat.id)}
                      className="rounded-full transition-all"
                    >
                      <Chip
                        variant={isSel ? 'subtle' : 'outline'}
                        color={isSel ? cat.color : undefined}
                        className={`!px-2 !py-1 !text-[10px] !max-w-none ${!isSel ? 'border-[rgba(0,0,0,0.12)]' : ''}`}
                        style={!isSel ? { color: THEME.textSecondary, borderColor: 'rgba(0,0,0,0.12)' } : undefined}
                      >
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: isSel ? cat.color : THEME.textMuted }} />
                        {cat.name}
                      </Chip>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tags — shown after category is selected, only if category has tags */}
            {selectedCategory && categoryTags.length > 0 && (
              <div>
                <label className="block mb-1.5" style={{ fontSize: 10, fontWeight: 600, color: '#636366', letterSpacing: '0.04em' }}>
                  Tags <span style={{ fontWeight: 400, color: '#8E8E93' }}>(optional)</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {categoryTags.map((tag) => {
                    const isSel = selectedTagIds.includes(tag.id);
                    const catColor = selectedCategory.color ?? THEME.primary;
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => toggleTag(tag.id)}
                        className="rounded-full transition-all"
                      >
                        <Chip
                          variant={isSel ? 'subtle' : 'outline'}
                          color={isSel ? catColor : undefined}
                          className={`!px-2 !py-1 !text-[10px] !max-w-none ${!isSel ? 'border-[rgba(0,0,0,0.12)]' : ''}`}
                          style={!isSel ? { color: THEME.textSecondary, borderColor: 'rgba(0,0,0,0.12)' } : undefined}
                        >
                          {tag.name}
                        </Chip>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Start button */}
            <button
              type="button"
              onClick={handleCreateAndStart}
              disabled={!title.trim()}
              className="w-full py-1.5 text-xs font-medium rounded-lg transition-colors"
              style={{
                backgroundColor: title.trim() ? THEME.primary : 'rgba(0,0,0,0.06)',
                color: title.trim() ? '#FFFFFF' : '#AEAEB2',
                cursor: title.trim() ? 'pointer' : 'default',
              }}
            >
              Start Timer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
