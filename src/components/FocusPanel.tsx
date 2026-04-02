import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
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
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99];
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

interface FocusPanelProps {
  onStop: () => void;
  fullPage?: boolean;
  onToggleView?: () => void;
}

export function FocusPanel({ onStop, fullPage = false, onToggleView }: FocusPanelProps) {
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

  // Working-on tasks (dragged from backlog)
  const [workingTaskIds, setWorkingTaskIds] = useState<string[]>([]);
  const [dragOverWorking, setDragOverWorking] = useState(false);

  // Auto-save
  const [saveIndicator, setSaveIndicator] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Display
  const [elapsed, setElapsed] = useState('0:00');
  const [pomodoroDisplay, setPomodoroDisplay] = useState('25:00');
  // Progress 0-1 for the ring animation
  const [progress, setProgress] = useState(0);

  const todoInputRef = useRef<HTMLInputElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  const block = activeTimer ? timeBlocks.find((b) => b.id === activeTimer.blockId) : null;
  const category = block ? categories.find((c) => c.id === block.categoryId) : null;
  const accentColor = category?.color ?? THEME.primary;

  // Linked task
  const linkedTask = useMemo(() => {
    if (!block) return null;
    return tasks.find((t) => t.title === block.title && t.categoryId === block.categoryId) ?? null;
  }, [block, tasks]);

  // Undone tasks for backlog (exclude tasks already in working section)
  const undoneTasks = useMemo(() => {
    return tasks.filter(
      (t) => t.status !== 'done' && t.status !== 'archived' && !workingTaskIds.includes(t.id)
    );
  }, [tasks, workingTaskIds]);

  const workingTasks = useMemo(() => {
    return workingTaskIds
      .map((id) => tasks.find((t) => t.id === id))
      .filter(Boolean) as typeof tasks;
  }, [workingTaskIds, tasks]);

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
      if (paused) return;
      const now = Date.now();
      const elapsedMs = now - activeTimer.startedAt - totalPausedMs;
      setElapsed(formatTime(elapsedMs));

      if (timerMode === 'pomodoro') {
        const { work, break_ } = getPresetMinutes(pomodoroPreset, customPreset);
        const phaseMs = now - pomodoroStartedAt - pomodoroPausedMs;
        const phaseDurationMs = (pomodoroPhase === 'work' ? work : break_) * 60 * 1000;
        const remaining = phaseDurationMs - phaseMs;

        // Update progress for ring
        setProgress(Math.min(1, Math.max(0, phaseMs / phaseDurationMs)));

        if (remaining <= 0) {
          if (!muted) playChime();
          if (pomodoroPhase === 'work') {
            sendNotification('Pomodoro', 'Work phase complete! Time for a break.');
            setPomodoroPhase('break');
            setPomodoroStartedAt(now);
            setPomodoroPausedMs(0);
            setShowBreakOverlay(true);
            setPomodoroDisplay(formatTime(break_ * 60 * 1000));
            setProgress(0);
          } else {
            sendNotification('Pomodoro', 'Break over! Back to focus.');
            setPomodoroPhase('work');
            setPomodoroStartedAt(now);
            setPomodoroPausedMs(0);
            setShowBreakOverlay(false);
            setPomodoroDisplay(formatTime(work * 60 * 1000));
            setProgress(0);
          }
        } else {
          setPomodoroDisplay(formatTime(remaining));
        }
      } else {
        // Free timer - gentle looping progress every 60s
        const elMs = now - activeTimer.startedAt - totalPausedMs;
        setProgress((elMs % 60000) / 60000);
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
      setProgress(0);
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
    setProgress(0);
  }, [pomodoroPreset, customPreset]);

  // ─── Drag handlers for task backlog ──────────────────────────────────────

  const handleDragStartTask = useCallback((e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('text/plain', taskId);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDropOnWorking = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOverWorking(false);
    const taskId = e.dataTransfer.getData('text/plain');
    if (taskId && !workingTaskIds.includes(taskId)) {
      setWorkingTaskIds((prev) => [...prev, taskId]);
    }
  }, [workingTaskIds]);

  const removeFromWorking = useCallback((taskId: string) => {
    setWorkingTaskIds((prev) => prev.filter((id) => id !== taskId));
  }, []);

  if (!activeTimer || !block) return null;

  // ─── Shared sub-components ─────────────────────────────────────────────

  const timerColor = paused
    ? THEME.textMuted
    : pomodoroPhase === 'break'
    ? '#FF9500'
    : accentColor;

  const timerDisplay = timerMode === 'pomodoro' ? pomodoroDisplay : elapsed;
  const phaseLabel = paused ? 'Paused' : pomodoroPhase === 'break' ? 'Break' : 'Focus';

  // SVG ring dimensions
  const ringSize = fullPage ? 220 : 100;
  const ringStroke = fullPage ? 6 : 3;
  const ringRadius = (ringSize - ringStroke) / 2;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringDashoffset = ringCircumference * (1 - progress);

  // ─── Timer ring component ──────────────────────────────────────────────

  const timerRing = (
    <div className="relative flex items-center justify-center" style={{ width: ringSize, height: ringSize }}>
      {/* Background glow (fullpage only) */}
      {fullPage && (
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: `radial-gradient(circle, ${timerColor}12 0%, transparent 70%)`,
            animation: paused ? 'none' : 'focusGlow 3s ease-in-out infinite',
          }}
        />
      )}
      <svg
        width={ringSize}
        height={ringSize}
        className="absolute inset-0"
        style={{ transform: 'rotate(-90deg)' }}
      >
        {/* Track */}
        <circle
          cx={ringSize / 2}
          cy={ringSize / 2}
          r={ringRadius}
          fill="none"
          stroke="rgba(0,0,0,0.06)"
          strokeWidth={ringStroke}
        />
        {/* Progress */}
        <circle
          cx={ringSize / 2}
          cy={ringSize / 2}
          r={ringRadius}
          fill="none"
          stroke={timerColor}
          strokeWidth={ringStroke}
          strokeLinecap="round"
          strokeDasharray={ringCircumference}
          strokeDashoffset={ringDashoffset}
          style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s' }}
        />
      </svg>
      {/* Orbiting dot animation */}
      {fullPage && !paused && (
        <div
          className="absolute"
          style={{
            width: ringSize,
            height: ringSize,
            animation: 'focusOrbit 4s linear infinite',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: timerColor,
              opacity: 0.5,
              filter: 'blur(2px)',
            }}
          />
        </div>
      )}
      {/* Center content */}
      <div className="relative flex flex-col items-center justify-center">
        <div
          className="font-mono tabular-nums font-semibold"
          style={{
            fontSize: fullPage ? 48 : 28,
            color: timerColor,
            lineHeight: 1.1,
            letterSpacing: '-0.02em',
            animation: paused ? 'pulse 1.5s ease-in-out infinite' : 'none',
          }}
        >
          {timerDisplay}
        </div>
        {(timerMode === 'pomodoro' || paused) && (
          <div
            style={{
              fontSize: fullPage ? 13 : 10,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase' as const,
              color: timerColor,
              marginTop: fullPage ? 6 : 2,
            }}
          >
            {phaseLabel}
          </div>
        )}
        {timerMode === 'pomodoro' && (
          <div
            className="font-mono tabular-nums"
            style={{ fontSize: fullPage ? 12 : 10, color: THEME.textSecondary, marginTop: fullPage ? 8 : 4 }}
          >
            Total: {elapsed}
          </div>
        )}
      </div>
    </div>
  );

  // ─── Mode toggle buttons ──────────────────────────────────────────────

  const modeToggle = (
    <div className="flex items-center justify-center gap-2 flex-wrap">
      <button
        type="button"
        onClick={() => setTimerMode('free')}
        className="px-3 py-1.5 text-xs font-medium rounded-lg transition-all"
        style={
          timerMode === 'free'
            ? { backgroundColor: 'rgba(141,162,134,0.14)', color: THEME.primary, border: '1px solid rgba(141,162,134,0.30)' }
            : { backgroundColor: 'rgba(0,0,0,0.04)', color: THEME.textSecondary, border: '1px solid rgba(0,0,0,0.08)' }
        }
      >
        Free timer
      </button>
      <button
        type="button"
        onClick={() => setTimerMode('pomodoro')}
        className="px-3 py-1.5 text-xs font-medium rounded-lg transition-all"
        style={
          timerMode === 'pomodoro'
            ? { backgroundColor: 'rgba(141,162,134,0.14)', color: THEME.primary, border: '1px solid rgba(141,162,134,0.30)' }
            : { backgroundColor: 'rgba(0,0,0,0.04)', color: THEME.textSecondary, border: '1px solid rgba(0,0,0,0.08)' }
        }
      >
        Pomodoro
      </button>
      {timerMode === 'pomodoro' && (
        <>
          <select
            value={pomodoroPreset}
            onChange={(e) => setPomodoroPreset(e.target.value as PomodoroPreset)}
            className="text-xs rounded-lg outline-none cursor-pointer"
            style={{
              padding: '6px 8px',
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
          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            title={muted ? 'Unmute alerts' : 'Mute alerts'}
            className="p-1.5 rounded-lg transition-colors"
            style={{
              color: muted ? THEME.textMuted : THEME.textSecondary,
              backgroundColor: muted ? 'rgba(0,0,0,0.06)' : 'transparent',
            }}
          >
            {muted ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 5L6 9H2v6h4l5 4V5z" />
                <line x1="23" y1="9" x2="17" y2="15" />
                <line x1="17" y1="9" x2="23" y2="15" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 5L6 9H2v6h4l5 4V5z" />
                <path d="M19.07 4.93a10 10 0 010 14.14" />
                <path d="M15.54 8.46a5 5 0 010 7.07" />
              </svg>
            )}
          </button>
        </>
      )}
    </div>
  );

  // Custom preset inputs
  const customInputs = timerMode === 'pomodoro' && pomodoroPreset === 'custom' && (
    <div className="flex items-center justify-center gap-2 mt-2">
      <label style={{ fontSize: 11, color: THEME.textSecondary }}>Work</label>
      <input
        type="number"
        min={1}
        max={180}
        defaultValue={customPreset.work}
        onBlur={(e) => handleCustomWorkChange(e.target.value)}
        className="w-14 text-center text-xs rounded-lg outline-none"
        style={{
          padding: '4px 6px',
          border: '1px solid rgba(0,0,0,0.10)',
          color: THEME.textPrimary,
          backgroundColor: '#FFFFFF',
        }}
      />
      <label style={{ fontSize: 11, color: THEME.textSecondary }}>min /</label>
      <label style={{ fontSize: 11, color: THEME.textSecondary }}>Break</label>
      <input
        type="number"
        min={1}
        max={60}
        defaultValue={customPreset.break_}
        onBlur={(e) => handleCustomBreakChange(e.target.value)}
        className="w-14 text-center text-xs rounded-lg outline-none"
        style={{
          padding: '4px 6px',
          border: '1px solid rgba(0,0,0,0.10)',
          color: THEME.textPrimary,
          backgroundColor: '#FFFFFF',
        }}
      />
      <label style={{ fontSize: 11, color: THEME.textSecondary }}>min</label>
    </div>
  );

  // ─── Action buttons ────────────────────────────────────────────────────

  const actionButtons = (
    <div className={`flex gap-3 ${fullPage ? 'justify-center' : ''}`}>
      <button
        type="button"
        onClick={paused ? handleResume : handlePause}
        className="flex items-center justify-center gap-2 font-semibold rounded-xl transition-colors"
        style={{
          padding: fullPage ? '12px 32px' : '10px 16px',
          fontSize: fullPage ? 14 : 12,
          flex: fullPage ? undefined : 1,
          backgroundColor: paused ? THEME.primary : 'rgba(0,0,0,0.06)',
          color: paused ? '#FFFFFF' : THEME.textPrimary,
          border: paused ? 'none' : '1px solid rgba(0,0,0,0.10)',
          cursor: 'pointer',
        }}
        onMouseEnter={(e) => {
          if (paused) e.currentTarget.style.backgroundColor = THEME.primaryHover ?? '#7A9173';
          else e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.10)';
        }}
        onMouseLeave={(e) => {
          if (paused) e.currentTarget.style.backgroundColor = THEME.primary;
          else e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.06)';
        }}
      >
        {paused ? (
          <>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            Resume
          </>
        ) : (
          <>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
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
        className="flex items-center justify-center gap-2 font-semibold rounded-xl transition-colors"
        style={{
          padding: fullPage ? '12px 32px' : '10px 16px',
          fontSize: fullPage ? 14 : 12,
          flex: fullPage ? undefined : 1,
          backgroundColor: THEME.destructiveRed,
          color: '#FFFFFF',
          cursor: 'pointer',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#E0352B'; }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = THEME.destructiveRed; }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
          <rect x="4" y="4" width="16" height="16" rx="2" />
        </svg>
        End Session
      </button>
    </div>
  );

  // ─── Quick todos section ───────────────────────────────────────────────

  const todosSection = (
    <div>
      <label
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.09em',
          textTransform: 'uppercase' as const,
          color: THEME.textSecondary,
          display: 'block',
          marginBottom: 8,
        }}
      >
        Quick todos
      </label>
      {quickTodos.length > 0 && (
        <div className="mb-2" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {quickTodos.map((todo) => (
            <div
              key={todo.id}
              className="flex items-start gap-2 group rounded-lg transition-colors"
              style={{ padding: '6px 8px', backgroundColor: 'transparent' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.03)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              <button
                type="button"
                onClick={() => toggleTodo(todo.id)}
                className="flex-shrink-0 flex items-center justify-center rounded transition-colors mt-0.5"
                style={{
                  width: 16,
                  height: 16,
                  border: todo.done ? 'none' : `1.5px solid ${accentColor}`,
                  backgroundColor: todo.done ? accentColor : 'transparent',
                }}
              >
                {todo.done && (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
              <span
                className="flex-1 min-w-0"
                style={{
                  fontSize: 12,
                  lineHeight: 1.5,
                  color: todo.done ? THEME.textSecondary : THEME.textPrimary,
                  textDecoration: todo.done ? 'line-through' : 'none',
                  opacity: todo.done ? 0.6 : 1,
                  wordBreak: 'break-word',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {todo.text}
              </span>
              <button
                type="button"
                onClick={() => removeTodo(todo.id)}
                className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded"
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
      <div className="flex items-center gap-2">
        <input
          ref={todoInputRef}
          type="text"
          value={newTodoText}
          onChange={(e) => setNewTodoText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') addTodo(); }}
          placeholder="Type + enter to add..."
          className="flex-1 min-w-0 outline-none rounded-lg"
          style={{
            fontSize: 12,
            padding: '8px 12px',
            border: '1px solid rgba(0,0,0,0.08)',
            backgroundColor: 'rgba(0,0,0,0.02)',
            color: THEME.textPrimary,
          }}
        />
      </div>
    </div>
  );

  // ─── Notes section ─────────────────────────────────────────────────────

  const notesSection = (
    <div>
      <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
        <label
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.09em',
            textTransform: 'uppercase' as const,
            color: THEME.textSecondary,
          }}
        >
          Session notes
        </label>
        {saveIndicator && (
          <span style={{ fontSize: 9, color: THEME.primary, fontWeight: 500, opacity: 0.8 }}>
            Saved
          </span>
        )}
      </div>
      <textarea
        ref={notesRef}
        value={sessionNotes}
        onChange={(e) => setSessionNotes(e.target.value)}
        placeholder="Quick notes, links, anything..."
        rows={fullPage ? 4 : 5}
        className="w-full outline-none resize-none rounded-xl"
        style={{
          fontSize: 12,
          lineHeight: 1.6,
          padding: '10px 12px',
          border: '1px solid rgba(0,0,0,0.08)',
          color: THEME.textPrimary,
          backgroundColor: 'rgba(0,0,0,0.02)',
          fontFamily: 'inherit',
        }}
      />
    </div>
  );

  // ─── Break overlay ─────────────────────────────────────────────────────

  const breakOverlay = showBreakOverlay && (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center"
      style={{
        backgroundColor: 'rgba(252,251,247,0.95)',
        zIndex: 20,
        backdropFilter: 'blur(4px)',
      }}
    >
      <div className="text-center px-8">
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '0.1em',
            textTransform: 'uppercase' as const,
            color: '#FF9500',
            marginBottom: 12,
          }}
        >
          Time for a break
        </div>
        <div
          className="font-mono tabular-nums font-semibold"
          style={{ fontSize: fullPage ? 52 : 36, color: '#FF9500', lineHeight: 1.1 }}
        >
          {pomodoroDisplay}
        </div>
        <div style={{ fontSize: 12, color: THEME.textSecondary, marginTop: 12 }}>
          Step away, stretch, breathe.
        </div>
        <div className="flex items-center justify-center gap-3 mt-6">
          <button
            type="button"
            onClick={dismissBreakOverlay}
            className="px-5 py-2 text-xs font-medium rounded-xl transition-colors"
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
            className="px-5 py-2 text-xs font-medium rounded-xl transition-colors"
            style={{ backgroundColor: THEME.primary, color: '#FFFFFF' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = THEME.primaryHover; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = THEME.primary; }}
          >
            Skip break
          </button>
        </div>
      </div>
    </div>
  );

  // ─── CSS animations ────────────────────────────────────────────────────

  const animStyles = (
    <style>{`
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.4; }
      }
      @keyframes focusGlow {
        0%, 100% { transform: scale(1); opacity: 0.6; }
        50% { transform: scale(1.08); opacity: 1; }
      }
      @keyframes focusOrbit {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      @keyframes floatIn {
        from { opacity: 0; transform: translateY(12px); }
        to { opacity: 1; transform: translateY(0); }
      }
    `}</style>
  );

  // ═══════════════════════════════════════════════════════════════════════
  // FULL-PAGE MODE
  // ═══════════════════════════════════════════════════════════════════════

  if (fullPage) {
    const content = (
      <div
        className="fixed inset-0 flex flex-col"
        style={{
          zIndex: 50,
          backgroundColor: '#FCFBF7',
          animation: 'floatIn 0.3s ease-out',
        }}
      >
        {/* Top bar */}
        <div
          className="flex-shrink-0 flex items-center justify-between"
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid rgba(0,0,0,0.07)',
          }}
        >
          <div className="flex items-center gap-3">
            <span
              className="rounded-full"
              style={{ width: 10, height: 10, backgroundColor: accentColor }}
            />
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: THEME.textPrimary }}>
                {block.title}
              </div>
              {category && (
                <div style={{ fontSize: 11, color: THEME.textSecondary, marginTop: 1 }}>
                  {category.name}
                  {linkedTask?.priority && (
                    <span
                      className="ml-2 px-1.5 py-0.5 rounded-full font-medium inline-block"
                      style={{
                        fontSize: 9,
                        backgroundColor: linkedTask.priority >= 4 ? 'rgba(255,59,48,0.10)' : 'rgba(0,0,0,0.05)',
                        color: linkedTask.priority >= 4 ? '#FF3B30' : THEME.textSecondary,
                      }}
                    >
                      P{linkedTask.priority}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          {/* Minimize button */}
          {onToggleView && (
            <button
              type="button"
              onClick={onToggleView}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{
                color: THEME.textSecondary,
                backgroundColor: 'rgba(0,0,0,0.04)',
                border: '1px solid rgba(0,0,0,0.08)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.08)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.04)'; }}
              title="Minimize to sidebar"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="4 14 10 14 10 20" />
                <polyline points="20 10 14 10 14 4" />
                <line x1="14" y1="10" x2="21" y2="3" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
              Minimize
            </button>
          )}
        </div>

        {/* Main content — two columns */}
        <div className="flex-1 min-h-0 flex overflow-hidden">
          {/* Left: Timer + controls */}
          <div
            className="flex-1 flex flex-col items-center justify-center overflow-y-auto"
            style={{ padding: '32px 24px', gap: 28 }}
          >
            {timerRing}
            {modeToggle}
            {customInputs}
            {actionButtons}
          </div>

          {/* Right: Tasks + Notes + Todos */}
          <div
            className="flex-shrink-0 flex flex-col overflow-y-auto"
            style={{
              width: 380,
              borderLeft: '1px solid rgba(0,0,0,0.07)',
              padding: '20px 24px',
              gap: 20,
            }}
          >
            {/* Working On section — drop zone */}
            <div>
              <label
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: '0.09em',
                  textTransform: 'uppercase' as const,
                  color: THEME.textSecondary,
                  display: 'block',
                  marginBottom: 8,
                }}
              >
                Working on
              </label>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOverWorking(true); }}
                onDragLeave={() => setDragOverWorking(false)}
                onDrop={handleDropOnWorking}
                className="rounded-xl transition-all"
                style={{
                  minHeight: 48,
                  padding: workingTasks.length > 0 ? '4px 0' : '12px 16px',
                  border: `2px dashed ${dragOverWorking ? accentColor : 'rgba(0,0,0,0.10)'}`,
                  backgroundColor: dragOverWorking ? `${accentColor}08` : 'rgba(0,0,0,0.015)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                }}
              >
                {workingTasks.length === 0 && (
                  <div style={{ fontSize: 11, color: THEME.textSecondary, textAlign: 'center', opacity: 0.7 }}>
                    Drag tasks here from backlog
                  </div>
                )}
                {workingTasks.map((task) => {
                  const taskCat = categories.find((c) => c.id === task.categoryId);
                  return (
                    <div
                      key={task.id}
                      className="flex items-center gap-2 group rounded-lg"
                      style={{ padding: '6px 10px' }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.03)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                      <span
                        className="flex-shrink-0 rounded-full"
                        style={{ width: 7, height: 7, backgroundColor: taskCat?.color ?? THEME.textMuted }}
                      />
                      <span
                        className="flex-1 min-w-0"
                        style={{
                          fontSize: 12,
                          color: THEME.textPrimary,
                          wordBreak: 'break-word',
                        }}
                      >
                        {task.title}
                      </span>
                      {task.estimatedMinutes > 0 && (
                        <span style={{ fontSize: 10, color: THEME.textSecondary, flexShrink: 0 }}>
                          {task.estimatedMinutes}m
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => removeFromWorking(task.id)}
                        className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded"
                        style={{ color: THEME.textSecondary }}
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {todosSection}
            {notesSection}

            {/* Task backlog */}
            {undoneTasks.length > 0 && (
              <div>
                <label
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: '0.09em',
                    textTransform: 'uppercase' as const,
                    color: THEME.textSecondary,
                    display: 'block',
                    marginBottom: 8,
                  }}
                >
                  Task backlog
                </label>
                <div
                  className="rounded-xl overflow-hidden"
                  style={{
                    border: '1px solid rgba(0,0,0,0.07)',
                    backgroundColor: 'rgba(0,0,0,0.015)',
                    maxHeight: 200,
                    overflowY: 'auto',
                  }}
                >
                  {undoneTasks.slice(0, 20).map((task) => {
                    const taskCat = categories.find((c) => c.id === task.categoryId);
                    return (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={(e) => handleDragStartTask(e, task.id)}
                        className="flex items-center gap-2 cursor-grab active:cursor-grabbing transition-colors"
                        style={{
                          padding: '7px 12px',
                          borderBottom: '1px solid rgba(0,0,0,0.04)',
                          fontSize: 12,
                          color: THEME.textPrimary,
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.03)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                      >
                        <svg width="8" height="12" viewBox="0 0 8 12" fill="none" style={{ flexShrink: 0, opacity: 0.3 }}>
                          <circle cx="2" cy="2" r="1" fill="currentColor" />
                          <circle cx="6" cy="2" r="1" fill="currentColor" />
                          <circle cx="2" cy="6" r="1" fill="currentColor" />
                          <circle cx="6" cy="6" r="1" fill="currentColor" />
                          <circle cx="2" cy="10" r="1" fill="currentColor" />
                          <circle cx="6" cy="10" r="1" fill="currentColor" />
                        </svg>
                        <span
                          className="flex-shrink-0 rounded-full"
                          style={{ width: 6, height: 6, backgroundColor: taskCat?.color ?? THEME.textMuted }}
                        />
                        <span className="flex-1 min-w-0" style={{ wordBreak: 'break-word' }}>
                          {task.title}
                        </span>
                        {task.priority && (
                          <span style={{ fontSize: 9, color: THEME.textMuted, flexShrink: 0, fontWeight: 500 }}>
                            P{task.priority}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {breakOverlay}
        {animStyles}
      </div>
    );

    return createPortal(content, document.body);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SIDEBAR MODE (compact)
  // ═══════════════════════════════════════════════════════════════════════

  return (
    <div className="flex flex-col h-full relative" style={{ backgroundColor: '#FCFBF7' }}>
      {/* Timer header */}
      <div
        className="flex-shrink-0"
        style={{ padding: '16px 16px 14px', borderBottom: '1px solid rgba(0,0,0,0.07)' }}
      >
        <div className="flex items-center justify-center mb-3">
          {timerRing}
        </div>
        {modeToggle}
        {customInputs}
      </div>

      {/* Current task */}
      <div className="flex-shrink-0" style={{ padding: '10px 16px', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
        <div className="flex items-center gap-2">
          <span
            className="flex-shrink-0 rounded-full"
            style={{ width: 8, height: 8, backgroundColor: accentColor }}
          />
          <span
            style={{ fontSize: 13, fontWeight: 600, color: THEME.textPrimary, wordBreak: 'break-word' }}
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
        {linkedTask && (
          <div className="mt-1.5 pl-5 flex items-center gap-2" style={{ fontSize: 10, color: THEME.textSecondary }}>
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
            {linkedTask.estimatedMinutes > 0 && <span>Est. {linkedTask.estimatedMinutes}m</span>}
          </div>
        )}
        {/* Expand to full page button */}
        {onToggleView && (
          <button
            type="button"
            onClick={onToggleView}
            className="mt-2 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors w-full justify-center"
            style={{
              color: THEME.textSecondary,
              backgroundColor: 'rgba(0,0,0,0.04)',
              border: '1px solid rgba(0,0,0,0.08)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.08)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.04)'; }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 3 21 3 21 9" />
              <polyline points="9 21 3 21 3 15" />
              <line x1="21" y1="3" x2="14" y2="10" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
            Expand
          </button>
        )}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 min-h-0 overflow-y-auto" style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {todosSection}
          {notesSection}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex-shrink-0" style={{ padding: '12px 16px', borderTop: '1px solid rgba(0,0,0,0.07)' }}>
        {actionButtons}
      </div>

      {breakOverlay}
      {animStyles}
    </div>
  );
}
