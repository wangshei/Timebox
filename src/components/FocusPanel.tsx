import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { THEME } from '../constants/colors';

// ─── Types ───────────────────────────────────────────────────────────────────

type TimerMode = 'free' | 'pomodoro';
type PomodoroPreset = '25/5' | '50/10' | 'custom';
type PomodoroPhase = 'work' | 'break';

interface QuickTodo {
  id: string;
  text: string;
  done: boolean;
}

interface CustomPreset {
  work: number;
  break_: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(ms: number): string {
  const totalSec = Math.floor(Math.abs(ms) / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function getPresetMinutes(preset: PomodoroPreset, custom: CustomPreset): { work: number; break_: number } {
  if (preset === '50/10') return { work: 50, break_: 10 };
  if (preset === 'custom') return custom;
  return { work: 25, break_: 5 };
}

function loadCustomPreset(): CustomPreset {
  try {
    const raw = localStorage.getItem('timebox_pomodoro_custom');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.work > 0 && parsed.break_ > 0) return parsed;
    }
  } catch { /* ignore */ }
  return { work: 30, break_: 10 };
}

function saveCustomPreset(preset: CustomPreset) {
  localStorage.setItem('timebox_pomodoro_custom', JSON.stringify(preset));
}

// ─── Audio ───────────────────────────────────────────────────────────────────

let audioCtx: AudioContext | null = null;

function playChime() {
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    const ctx = audioCtx;

    // Play a gentle two-tone chime
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5

    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + i * 0.15);
      gain.gain.linearRampToValueAtTime(0.15, now + i * 0.15 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.6);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.15);
      osc.stop(now + i * 0.15 + 0.7);
    });
  } catch { /* Web Audio not available */ }
}

function sendNotification(title: string, body: string) {
  try {
    if (Notification.permission === 'granted') {
      new Notification(title, { body });
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then((p) => {
        if (p === 'granted') new Notification(title, { body });
      });
    }
  } catch { /* not available */ }
}

let todoCounter = 0;

// ─── Component ───────────────────────────────────────────────────────────────

export function FocusPanel({ onStop }: { onStop: () => void }) {
  const activeTimer = useStore((s) => s.activeTimer);
  const timeBlocks = useStore((s) => s.timeBlocks);
  const categories = useStore((s) => s.categories);
  const tasks = useStore((s) => s.tasks);
  const updateTimeBlock = useStore((s) => s.updateTimeBlock);

  // Timer mode
  const [timerMode, setTimerMode] = useState<TimerMode>('free');
  const [pomodoroPreset, setPomodoroPreset] = useState<PomodoroPreset>('25/5');
  const [customPreset, setCustomPreset] = useState<CustomPreset>(loadCustomPreset);
  const [pomodoroPhase, setPomodoroPhase] = useState<PomodoroPhase>('work');
  const [pomodoroStartedAt, setPomodoroStartedAt] = useState<number>(Date.now());
  const [showBreakOverlay, setShowBreakOverlay] = useState(false);
  const [muted, setMuted] = useState(false);

  // Pause state
  const [paused, setPaused] = useState(false);
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const [totalPausedMs, setTotalPausedMs] = useState(0);
  const [pomodoroPausedMs, setPomodoroPausedMs] = useState(0);

  // Session content
  const [sessionNotes, setSessionNotes] = useState('');
  const [quickTodos, setQuickTodos] = useState<QuickTodo[]>([]);
  const [newTodoText, setNewTodoText] = useState('');

  // Auto-save
  const [saveIndicator, setSaveIndicator] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Display
  const [elapsed, setElapsed] = useState('0:00');
  const [pomodoroDisplay, setPomodoroDisplay] = useState('25:00');

  const todoInputRef = useRef<HTMLInputElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  const block = activeTimer ? timeBlocks.find((b) => b.id === activeTimer.blockId) : null;
  const category = block ? categories.find((c) => c.id === block.categoryId) : null;
  const accentColor = category?.color ?? THEME.primary;

  // Linked task
  const linkedTask = useMemo(() => {
    if (!block) return null;
    // Find task with same title and category
    return tasks.find((t) => t.title === block.title && t.categoryId === block.categoryId) ?? null;
  }, [block, tasks]);

  // ─── Restore notes from block on mount ──────────────────────────────────

  useEffect(() => {
    if (block?.notes) {
      setSessionNotes(block.notes);
    }
  }, [block?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Request notification permission early ──────────────────────────────

  useEffect(() => {
    try {
      if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
        Notification.requestPermission();
      }
    } catch { /* not available */ }
  }, []);

  // ─── Auto-save notes every 30s ──────────────────────────────────────────

  useEffect(() => {
    if (!activeTimer) return;

    const interval = setInterval(() => {
      if (!activeTimer) return;

      const parts: string[] = [];
      if (sessionNotes.trim()) parts.push(sessionNotes.trim());
      const todoLines = quickTodos
        .map((t) => `${t.done ? '[x]' : '[ ]'} ${t.text}`)
        .join('\n');
      if (todoLines) parts.push(todoLines);

      if (parts.length > 0) {
        const compiled = parts.join('\n\n');
        updateTimeBlock(activeTimer.blockId, { notes: compiled });

        setSaveIndicator(true);
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => setSaveIndicator(false), 2000);
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [activeTimer, sessionNotes, quickTodos, updateTimeBlock]);

  // ─── Tick timer ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!activeTimer) return;

    const tick = () => {
      if (paused) return; // Don't tick while paused

      const now = Date.now();
      const elapsedMs = now - activeTimer.startedAt - totalPausedMs;
      setElapsed(formatTime(elapsedMs));

      if (timerMode === 'pomodoro') {
        const { work, break_ } = getPresetMinutes(pomodoroPreset, customPreset);
        const phaseMs = now - pomodoroStartedAt - pomodoroPausedMs;
        const phaseDurationMs = (pomodoroPhase === 'work' ? work : break_) * 60 * 1000;
        const remaining = phaseDurationMs - phaseMs;

        if (remaining <= 0) {
          // Phase ended — play sound + notify BEFORE switching
          if (!muted) playChime();

          if (pomodoroPhase === 'work') {
            sendNotification('Pomodoro', 'Work phase complete! Time for a break.');
            setPomodoroPhase('break');
            setPomodoroStartedAt(now);
            setPomodoroPausedMs(0);
            setShowBreakOverlay(true);
            setPomodoroDisplay(formatTime(break_ * 60 * 1000));
          } else {
            sendNotification('Pomodoro', 'Break over! Back to focus.');
            setPomodoroPhase('work');
            setPomodoroStartedAt(now);
            setPomodoroPausedMs(0);
            setShowBreakOverlay(false);
            setPomodoroDisplay(formatTime(work * 60 * 1000));
          }
        } else {
          setPomodoroDisplay(formatTime(remaining));
        }
      }
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [activeTimer, timerMode, pomodoroPreset, customPreset, pomodoroPhase, pomodoroStartedAt, paused, totalPausedMs, pomodoroPausedMs, muted]);

  // Reset pomodoro when switching modes or presets
  useEffect(() => {
    if (timerMode === 'pomodoro') {
      const { work } = getPresetMinutes(pomodoroPreset, customPreset);
      setPomodoroPhase('work');
      setPomodoroStartedAt(Date.now());
      setPomodoroPausedMs(0);
      setShowBreakOverlay(false);
      setPomodoroDisplay(formatTime(work * 60 * 1000));
    }
  }, [timerMode, pomodoroPreset, customPreset.work, customPreset.break_]);

  // ─── Pause / Resume ────────────────────────────────────────────────────

  const handlePause = useCallback(() => {
    setPaused(true);
    setPausedAt(Date.now());
  }, []);

  const handleResume = useCallback(() => {
    if (pausedAt) {
      const pauseDuration = Date.now() - pausedAt;
      setTotalPausedMs((prev) => prev + pauseDuration);
      setPomodoroPausedMs((prev) => prev + pauseDuration);
    }
    setPaused(false);
    setPausedAt(null);
  }, [pausedAt]);

  // ─── Quick todos ─────────────────────────────────────────────────────────

  const addTodo = useCallback(() => {
    const text = newTodoText.trim();
    if (!text) return;
    setQuickTodos((prev) => [...prev, { id: `qt-${++todoCounter}`, text, done: false }]);
    setNewTodoText('');
  }, [newTodoText]);

  const toggleTodo = useCallback((id: string) => {
    setQuickTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t))
    );
  }, []);

  const removeTodo = useCallback((id: string) => {
    setQuickTodos((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ─── Custom preset handlers ──────────────────────────────────────────────

  const handleCustomWorkChange = useCallback((val: string) => {
    const n = parseInt(val, 10);
    if (!isNaN(n) && n > 0 && n <= 180) {
      const next = { ...customPreset, work: n };
      setCustomPreset(next);
      saveCustomPreset(next);
    }
  }, [customPreset]);

  const handleCustomBreakChange = useCallback((val: string) => {
    const n = parseInt(val, 10);
    if (!isNaN(n) && n > 0 && n <= 60) {
      const next = { ...customPreset, break_: n };
      setCustomPreset(next);
      saveCustomPreset(next);
    }
  }, [customPreset]);

  // ─── Stop & save ─────────────────────────────────────────────────────────

  const handleStop = useCallback(() => {
    if (activeTimer) {
      const parts: string[] = [];
      if (sessionNotes.trim()) parts.push(sessionNotes.trim());
      const todoLines = quickTodos
        .map((t) => `${t.done ? '[x]' : '[ ]'} ${t.text}`)
        .join('\n');
      if (todoLines) parts.push(todoLines);

      if (parts.length > 0) {
        const compiled = parts.join('\n\n');
        updateTimeBlock(activeTimer.blockId, { notes: compiled });
      }
    }
    onStop();
  }, [activeTimer, sessionNotes, quickTodos, updateTimeBlock, onStop]);

  const dismissBreakOverlay = useCallback(() => {
    setShowBreakOverlay(false);
  }, []);

  const skipBreak = useCallback(() => {
    const { work } = getPresetMinutes(pomodoroPreset, customPreset);
    setPomodoroPhase('work');
    setPomodoroStartedAt(Date.now());
    setPomodoroPausedMs(0);
    setShowBreakOverlay(false);
    setPomodoroDisplay(formatTime(work * 60 * 1000));
  }, [pomodoroPreset, customPreset]);

  if (!activeTimer || !block) return null;

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: '#FCFBF7' }}>
      {/* ── Timer header ── */}
      <div
        className="flex-shrink-0 px-4 pt-4 pb-3"
        style={{ borderBottom: '1px solid rgba(0,0,0,0.07)' }}
      >
        {/* Timer display */}
        <div className="flex items-center justify-center mb-3">
          <div className="text-center">
            {/* Main timer number */}
            <div
              className="font-mono tabular-nums font-semibold"
              style={{
                fontSize: timerMode === 'pomodoro' ? 32 : 28,
                color: paused ? THEME.textMuted : (pomodoroPhase === 'break' ? '#FF9500' : accentColor),
                lineHeight: 1.1,
                letterSpacing: '-0.02em',
                animation: paused ? 'pulse 1.5s ease-in-out infinite' : 'none',
              }}
            >
              {timerMode === 'pomodoro' ? pomodoroDisplay : elapsed}
            </div>

            {/* Phase / pause label */}
            {(timerMode === 'pomodoro' || paused) && (
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: paused ? THEME.textMuted : (pomodoroPhase === 'break' ? '#FF9500' : accentColor),
                  marginTop: 2,
                }}
              >
                {paused ? 'Paused' : (pomodoroPhase === 'break' ? 'Break' : 'Focus')}
              </div>
            )}

            {/* Elapsed sub-label in pomodoro mode */}
            {timerMode === 'pomodoro' && (
              <div
                className="font-mono tabular-nums"
                style={{ fontSize: 10, color: THEME.textSecondary, marginTop: 4 }}
              >
                Total: {elapsed}
              </div>
            )}
          </div>
        </div>

        {/* Timer mode toggle + mute */}
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setTimerMode('free')}
            className="px-2.5 py-1 text-xs font-medium rounded-md transition-all"
            style={
              timerMode === 'free'
                ? { backgroundColor: 'rgba(141,162,134,0.14)', color: THEME.primary, border: `1px solid rgba(141,162,134,0.30)` }
                : { backgroundColor: 'rgba(0,0,0,0.04)', color: THEME.textSecondary, border: '1px solid rgba(0,0,0,0.08)' }
            }
          >
            Free timer
          </button>
          <button
            type="button"
            onClick={() => setTimerMode('pomodoro')}
            className="px-2.5 py-1 text-xs font-medium rounded-md transition-all"
            style={
              timerMode === 'pomodoro'
                ? { backgroundColor: 'rgba(141,162,134,0.14)', color: THEME.primary, border: `1px solid rgba(141,162,134,0.30)` }
                : { backgroundColor: 'rgba(0,0,0,0.04)', color: THEME.textSecondary, border: '1px solid rgba(0,0,0,0.08)' }
            }
          >
            Pomodoro
          </button>

          {/* Preset selector (only in pomodoro mode) */}
          {timerMode === 'pomodoro' && (
            <>
              <select
                value={pomodoroPreset}
                onChange={(e) => setPomodoroPreset(e.target.value as PomodoroPreset)}
                className="text-xs rounded-md outline-none cursor-pointer"
                style={{
                  padding: '4px 6px',
                  border: '1px solid rgba(0,0,0,0.10)',
                  backgroundColor: '#FFFFFF',
                  color: THEME.textSecondary,
                  fontSize: 11,
                }}
              >
                <option value="25/5">25/5</option>
                <option value="50/10">50/10</option>
                <option value="custom">Custom</option>
              </select>

              {/* Mute toggle */}
              <button
                type="button"
                onClick={() => setMuted((m) => !m)}
                title={muted ? 'Unmute alerts' : 'Mute alerts'}
                className="p-1 rounded transition-colors"
                style={{
                  color: muted ? THEME.textMuted : THEME.textSecondary,
                  backgroundColor: muted ? 'rgba(0,0,0,0.06)' : 'transparent',
                }}
              >
                {muted ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 5L6 9H2v6h4l5 4V5z" />
                    <line x1="23" y1="9" x2="17" y2="15" />
                    <line x1="17" y1="9" x2="23" y2="15" />
                  </svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 5L6 9H2v6h4l5 4V5z" />
                    <path d="M19.07 4.93a10 10 0 010 14.14" />
                    <path d="M15.54 8.46a5 5 0 010 7.07" />
                  </svg>
                )}
              </button>
            </>
          )}
        </div>

        {/* Custom preset inputs */}
        {timerMode === 'pomodoro' && pomodoroPreset === 'custom' && (
          <div className="flex items-center justify-center gap-2 mt-2">
            <label style={{ fontSize: 10, color: THEME.textSecondary }}>Work</label>
            <input
              type="number"
              min={1}
              max={180}
              defaultValue={customPreset.work}
              onBlur={(e) => handleCustomWorkChange(e.target.value)}
              className="w-12 text-center text-xs rounded outline-none"
              style={{
                padding: '2px 4px',
                border: '1px solid rgba(0,0,0,0.10)',
                color: THEME.textPrimary,
                backgroundColor: '#FFFFFF',
              }}
            />
            <label style={{ fontSize: 10, color: THEME.textSecondary }}>min /</label>
            <label style={{ fontSize: 10, color: THEME.textSecondary }}>Break</label>
            <input
              type="number"
              min={1}
              max={60}
              defaultValue={customPreset.break_}
              onBlur={(e) => handleCustomBreakChange(e.target.value)}
              className="w-12 text-center text-xs rounded outline-none"
              style={{
                padding: '2px 4px',
                border: '1px solid rgba(0,0,0,0.10)',
                color: THEME.textPrimary,
                backgroundColor: '#FFFFFF',
              }}
            />
            <label style={{ fontSize: 10, color: THEME.textSecondary }}>min</label>
          </div>
        )}
      </div>

      {/* ── Current task ── */}
      <div className="flex-shrink-0 px-4 py-2.5" style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
        <div className="flex items-center gap-2">
          <span
            className="flex-shrink-0 rounded-full"
            style={{ width: 8, height: 8, backgroundColor: accentColor }}
          />
          <span
            className="truncate"
            style={{ fontSize: 13, fontWeight: 600, color: THEME.textPrimary }}
            title={block.title}
          >
            {block.title}
          </span>
        </div>
        {category && (
          <div className="mt-0.5 pl-5" style={{ fontSize: 10, color: THEME.textSecondary }}>
            {category.name}
          </div>
        )}

        {/* Linked task info */}
        {linkedTask && (
          <div
            className="mt-1.5 pl-5 flex items-center gap-2"
            style={{ fontSize: 10, color: THEME.textSecondary }}
          >
            {linkedTask.priority && (
              <span
                className="px-1.5 py-0.5 rounded-full font-medium"
                style={{
                  fontSize: 9,
                  backgroundColor: linkedTask.priority >= 4 ? 'rgba(255,59,48,0.10)' : 'rgba(0,0,0,0.05)',
                  color: linkedTask.priority >= 4 ? '#FF3B30' : THEME.textSecondary,
                }}
              >
                P{linkedTask.priority}
              </span>
            )}
            {linkedTask.estimatedMinutes > 0 && (
              <span>Est. {linkedTask.estimatedMinutes}m</span>
            )}
            {linkedTask.status && (
              <span style={{ opacity: 0.7 }}>{linkedTask.status.replace(/_/g, ' ')}</span>
            )}
          </div>
        )}
      </div>

      {/* ── Scrollable content: notes + todos ── */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
        <div className="space-y-4">
          {/* Quick todos */}
          <div>
            <label
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '0.09em',
                textTransform: 'uppercase',
                color: THEME.textSecondary,
                display: 'block',
                marginBottom: 6,
              }}
            >
              Quick todos
            </label>

            {/* Todo list */}
            {quickTodos.length > 0 && (
              <div className="mb-2 space-y-0.5">
                {quickTodos.map((todo) => (
                  <div
                    key={todo.id}
                    className="flex items-center gap-2 group rounded-md px-1.5 py-1 transition-colors"
                    style={{ backgroundColor: 'transparent' }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.03)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                  >
                    <button
                      type="button"
                      onClick={() => toggleTodo(todo.id)}
                      className="flex-shrink-0 flex items-center justify-center rounded transition-colors"
                      style={{
                        width: 15,
                        height: 15,
                        border: todo.done ? 'none' : `1.5px solid ${accentColor}`,
                        backgroundColor: todo.done ? accentColor : 'transparent',
                      }}
                    >
                      {todo.done && (
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </button>
                    <span
                      className="flex-1 min-w-0 truncate"
                      style={{
                        fontSize: 12,
                        color: todo.done ? THEME.textSecondary : THEME.textPrimary,
                        textDecoration: todo.done ? 'line-through' : 'none',
                        opacity: todo.done ? 0.6 : 1,
                      }}
                    >
                      {todo.text}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeTodo(todo.id)}
                      className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded"
                      style={{ color: THEME.textSecondary }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = THEME.destructiveRed; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = THEME.textSecondary; }}
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add todo input */}
            <div className="flex items-center gap-1.5">
              <input
                ref={todoInputRef}
                type="text"
                value={newTodoText}
                onChange={(e) => setNewTodoText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addTodo();
                }}
                placeholder="Type + enter to add..."
                className="flex-1 min-w-0 outline-none rounded-md"
                style={{
                  fontSize: 11,
                  padding: '5px 8px',
                  border: '1px solid rgba(0,0,0,0.08)',
                  backgroundColor: 'rgba(0,0,0,0.02)',
                  color: THEME.textPrimary,
                }}
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
              <label
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: '0.09em',
                  textTransform: 'uppercase',
                  color: THEME.textSecondary,
                }}
              >
                Session notes
              </label>
              {saveIndicator && (
                <span
                  style={{
                    fontSize: 9,
                    color: THEME.primary,
                    fontWeight: 500,
                    opacity: 0.8,
                    transition: 'opacity 0.3s',
                  }}
                >
                  Saved
                </span>
              )}
            </div>
            <textarea
              ref={notesRef}
              value={sessionNotes}
              onChange={(e) => setSessionNotes(e.target.value)}
              placeholder="Quick notes, links, anything..."
              rows={5}
              className="w-full outline-none resize-none rounded-lg"
              style={{
                fontSize: 11,
                lineHeight: 1.6,
                padding: '8px 10px',
                border: '1px solid rgba(0,0,0,0.08)',
                color: THEME.textPrimary,
                backgroundColor: 'rgba(0,0,0,0.02)',
                fontFamily: 'inherit',
              }}
            />
          </div>
        </div>
      </div>

      {/* ── Pause + Stop buttons ── */}
      <div className="flex-shrink-0 px-4 py-3 flex gap-2" style={{ borderTop: '1px solid rgba(0,0,0,0.07)' }}>
        <button
          type="button"
          onClick={paused ? handleResume : handlePause}
          className="flex-1 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5"
          style={{
            backgroundColor: paused ? THEME.primary : 'rgba(0,0,0,0.06)',
            color: paused ? '#FFFFFF' : THEME.textPrimary,
            border: paused ? 'none' : '1px solid rgba(0,0,0,0.10)',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => {
            if (paused) {
              e.currentTarget.style.backgroundColor = THEME.primaryHover ?? '#7A9173';
            } else {
              e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.10)';
            }
          }}
          onMouseLeave={(e) => {
            if (paused) {
              e.currentTarget.style.backgroundColor = THEME.primary;
            } else {
              e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.06)';
            }
          }}
        >
          {paused ? (
            <>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              Resume
            </>
          ) : (
            <>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
              Pause
            </>
          )}
        </button>
        <button
          type="button"
          onClick={handleStop}
          className="flex-1 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
          style={{ backgroundColor: THEME.destructiveRed, color: '#FFFFFF', cursor: 'pointer' }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#E0352B'; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = THEME.destructiveRed; }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
            <rect x="4" y="4" width="16" height="16" rx="2" />
          </svg>
          End Session
        </button>
      </div>

      {/* ── Break overlay (Pomodoro) ── */}
      {showBreakOverlay && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
          style={{
            backgroundColor: 'rgba(252,251,247,0.95)',
            zIndex: 10,
            backdropFilter: 'blur(4px)',
          }}
        >
          <div className="text-center px-6">
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: '#FF9500',
                marginBottom: 8,
              }}
            >
              Time for a break
            </div>
            <div
              className="font-mono tabular-nums font-semibold"
              style={{ fontSize: 36, color: '#FF9500', lineHeight: 1.1 }}
            >
              {pomodoroDisplay}
            </div>
            <div style={{ fontSize: 11, color: THEME.textSecondary, marginTop: 8 }}>
              Step away, stretch, breathe.
            </div>
            <div className="flex items-center justify-center gap-2 mt-5">
              <button
                type="button"
                onClick={dismissBreakOverlay}
                className="px-4 py-1.5 text-xs font-medium rounded-lg transition-colors"
                style={{
                  backgroundColor: 'rgba(0,0,0,0.06)',
                  color: THEME.textPrimary,
                  border: '1px solid rgba(0,0,0,0.10)',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.10)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.06)'; }}
              >
                Dismiss
              </button>
              <button
                type="button"
                onClick={skipBreak}
                className="px-4 py-1.5 text-xs font-medium rounded-lg transition-colors"
                style={{
                  backgroundColor: THEME.primary,
                  color: '#FFFFFF',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = THEME.primaryHover; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = THEME.primary; }}
              >
                Skip break
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pulse animation for paused state */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
