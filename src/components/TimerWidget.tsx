import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { getLocalDateString } from '../utils/dateTime';
import { parseTimeToMinutes } from '../utils/taskHelpers';
import { THEME } from '../constants/colors';
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
  const calendarContainers = useStore((s) => s.calendarContainers);
  const addTimeBlock = useStore((s) => s.addTimeBlock);
  const startTimer = useStore((s) => s.startTimer);
  const stopTimer = useStore((s) => s.stopTimer);

  const [showPopover, setShowPopover] = useState(false);
  const [title, setTitle] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [elapsed, setElapsed] = useState('0:00');
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Find a block at the current time
  const currentBlock = (() => {
    const today = getLocalDateString();
    const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
    return timeBlocks.find(
      (b) =>
        b.date === today &&
        parseTimeToMinutes(b.start) <= nowMins &&
        parseTimeToMinutes(b.end) > nowMins
    ) ?? null;
  })();

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
      // Set default category
      if (categories.length > 0 && !selectedCategoryId) {
        setSelectedCategoryId(categories[0].id);
      }
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [showPopover]);

  const handlePlayClick = useCallback(() => {
    if (activeTimer) return; // already running
    if (currentBlock) {
      // Start timer for existing block
      startTimer(currentBlock.id);
    } else {
      // Show popover to create a new block
      setTitle('');
      setShowPopover(true);
    }
  }, [activeTimer, currentBlock, startTimer]);

  const handleStartExisting = useCallback(() => {
    if (currentBlock) startTimer(currentBlock.id);
  }, [currentBlock, startTimer]);

  const handleCreateAndStart = useCallback(() => {
    if (!title.trim()) return;
    const cat = categories.find((c) => c.id === selectedCategoryId);
    if (!cat) return;

    const now = getCurrentHHMM();
    const blockId = addTimeBlock({
      title: title.trim(),
      calendarContainerId: cat.calendarContainerId ?? calendarContainers[0]?.id ?? '',
      categoryId: cat.id,
      tagIds: [],
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
    }
  }, [title, selectedCategoryId, categories, calendarContainers, addTimeBlock, startTimer]);

  // Timer is running — show elapsed + stop
  if (activeTimer) {
    const timerBlock = timeBlocks.find((b) => b.id === activeTimer.blockId);
    return (
      <div className="flex items-center gap-1.5">
        <span
          className="text-xs font-mono font-semibold tabular-nums"
          style={{ color: THEME.primary, minWidth: 40 }}
          title={timerBlock?.title ?? 'Timer'}
        >
          {elapsed}
        </span>
        <button
          type="button"
          onClick={stopTimer}
          className="p-1 rounded-md transition-colors"
          style={{ color: '#FF3B30' }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,59,48,0.10)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
          title="Stop timer"
        >
          <StopIcon className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  // No timer — show play button (+ optional start existing block)
  return (
    <div className="relative flex items-center gap-1">
      {/* If a block exists at current time, show start button for it */}
      {currentBlock && (
        <button
          type="button"
          onClick={handleStartExisting}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-medium transition-colors truncate max-w-[100px]"
          style={{
            color: THEME.primary,
            backgroundColor: 'rgba(141,162,134,0.08)',
            border: '1px solid rgba(141,162,134,0.20)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(141,162,134,0.16)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(141,162,134,0.08)'; }}
          title={`Start: ${currentBlock.title}`}
        >
          <PlayIcon className="w-2.5 h-2.5 flex-shrink-0" />
          <span className="truncate">{currentBlock.title}</span>
        </button>
      )}

      {/* Play button to create new ad-hoc block */}
      <button
        type="button"
        onClick={handlePlayClick}
        className="p-1 rounded-md transition-colors"
        style={{ color: THEME.textSecondary }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(141,162,134,0.12)';
          e.currentTarget.style.color = THEME.primary;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
          e.currentTarget.style.color = THEME.textSecondary;
        }}
        title={currentBlock ? 'Start timer for current block' : 'Start new timer'}
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
            width: 220,
            padding: 12,
          }}
        >
          <div className="space-y-2">
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
            <select
              value={selectedCategoryId}
              onChange={(e) => setSelectedCategoryId(e.target.value)}
              className="w-full px-2 py-1.5 text-xs rounded-lg outline-none appearance-none cursor-pointer"
              style={{
                border: '1px solid rgba(0,0,0,0.10)',
                color: THEME.textPrimary,
                backgroundColor: 'rgba(0,0,0,0.02)',
              }}
            >
              {categories.map((cat) => {
                const cal = calendarContainers.find((c) => c.id === cat.calendarContainerId);
                return (
                  <option key={cat.id} value={cat.id}>
                    {cal ? `${cal.name} / ` : ''}{cat.name}
                  </option>
                );
              })}
            </select>
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
