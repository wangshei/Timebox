import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { THEME } from '../constants/colors';

// ─── Types ───────────────────────────────────────────────────────────────────

type TimerMode = 'free' | 'pomodoro';
type PomodoroPreset = '25/5' | '50/10';
type PomodoroPhase = 'work' | 'break';

interface QuickTodo {
  id: string;
  text: string;
  done: boolean;
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

function getPresetMinutes(preset: PomodoroPreset): { work: number; break_: number } {
  if (preset === '50/10') return { work: 50, break_: 10 };
  return { work: 25, break_: 5 };
}

let todoCounter = 0;

// ─── Component ───────────────────────────────────────────────────────────────

export function FocusPanel({ onStop }: { onStop: () => void }) {
  const activeTimer = useStore((s) => s.activeTimer);
  const timeBlocks = useStore((s) => s.timeBlocks);
  const categories = useStore((s) => s.categories);
  const updateTimeBlock = useStore((s) => s.updateTimeBlock);

  // Timer mode
  const [timerMode, setTimerMode] = useState<TimerMode>('free');
  const [pomodoroPreset, setPomodoroPreset] = useState<PomodoroPreset>('25/5');
  const [pomodoroPhase, setPomodoroPhase] = useState<PomodoroPhase>('work');
  const [pomodoroStartedAt, setPomodoroStartedAt] = useState<number>(Date.now());
  const [showBreakOverlay, setShowBreakOverlay] = useState(false);

  // Session content
  const [sessionNotes, setSessionNotes] = useState('');
  const [quickTodos, setQuickTodos] = useState<QuickTodo[]>([]);
  const [newTodoText, setNewTodoText] = useState('');

  // Display
  const [elapsed, setElapsed] = useState('0:00');
  const [pomodoroDisplay, setPomodoroDisplay] = useState('25:00');

  const todoInputRef = useRef<HTMLInputElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  const block = activeTimer ? timeBlocks.find((b) => b.id === activeTimer.blockId) : null;
  const category = block ? categories.find((c) => c.id === block.categoryId) : null;
  const accentColor = category?.color ?? THEME.primary;

  // ─── Tick timer ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!activeTimer) return;

    const tick = () => {
      const now = Date.now();
      const elapsedMs = now - activeTimer.startedAt;
      setElapsed(formatTime(elapsedMs));

      if (timerMode === 'pomodoro') {
        const { work, break_ } = getPresetMinutes(pomodoroPreset);
        const phaseMs = now - pomodoroStartedAt;
        const phaseDurationMs = (pomodoroPhase === 'work' ? work : break_) * 60 * 1000;
        const remaining = phaseDurationMs - phaseMs;

        if (remaining <= 0) {
          // Phase ended — switch
          if (pomodoroPhase === 'work') {
            setPomodoroPhase('break');
            setPomodoroStartedAt(now);
            setShowBreakOverlay(true);
            setPomodoroDisplay(formatTime(break_ * 60 * 1000));
          } else {
            setPomodoroPhase('work');
            setPomodoroStartedAt(now);
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
  }, [activeTimer, timerMode, pomodoroPreset, pomodoroPhase, pomodoroStartedAt]);

  // Reset pomodoro when switching modes or presets
  useEffect(() => {
    if (timerMode === 'pomodoro') {
      const { work } = getPresetMinutes(pomodoroPreset);
      setPomodoroPhase('work');
      setPomodoroStartedAt(Date.now());
      setShowBreakOverlay(false);
      setPomodoroDisplay(formatTime(work * 60 * 1000));
    }
  }, [timerMode, pomodoroPreset]);

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

  // ─── Stop & save ─────────────────────────────────────────────────────────

  const handleStop = useCallback(() => {
    if (activeTimer) {
      // Compile session notes + todos into a single notes string
      const parts: string[] = [];
      if (sessionNotes.trim()) parts.push(sessionNotes.trim());
      const todoLines = quickTodos
        .map((t) => `${t.done ? '[x]' : '[ ]'} ${t.text}`)
        .join('\n');
      if (todoLines) parts.push(todoLines);

      if (parts.length > 0) {
        const compiled = parts.join('\n\n');
        const existing = block?.notes?.trim() ?? '';
        const combined = existing ? `${existing}\n\n${compiled}` : compiled;
        updateTimeBlock(activeTimer.blockId, { notes: combined });
      }
    }
    onStop();
  }, [activeTimer, sessionNotes, quickTodos, block, updateTimeBlock, onStop]);

  const dismissBreakOverlay = useCallback(() => {
    setShowBreakOverlay(false);
  }, []);

  const skipBreak = useCallback(() => {
    const { work } = getPresetMinutes(pomodoroPreset);
    setPomodoroPhase('work');
    setPomodoroStartedAt(Date.now());
    setShowBreakOverlay(false);
    setPomodoroDisplay(formatTime(work * 60 * 1000));
  }, [pomodoroPreset]);

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
                color: pomodoroPhase === 'break' ? '#FF9500' : accentColor,
                lineHeight: 1.1,
                letterSpacing: '-0.02em',
              }}
            >
              {timerMode === 'pomodoro' ? pomodoroDisplay : elapsed}
            </div>

            {/* Phase label for pomodoro */}
            {timerMode === 'pomodoro' && (
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: pomodoroPhase === 'break' ? '#FF9500' : accentColor,
                  marginTop: 2,
                }}
              >
                {pomodoroPhase === 'break' ? 'Break' : 'Focus'}
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

        {/* Timer mode toggle */}
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
            </select>
          )}
        </div>
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
              Session notes
            </label>
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

      {/* ── Stop button ── */}
      <div className="flex-shrink-0 px-4 py-3" style={{ borderTop: '1px solid rgba(0,0,0,0.07)' }}>
        <button
          type="button"
          onClick={handleStop}
          className="w-full py-2 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
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
    </div>
  );
}
