import { create } from 'zustand';
import { useStore } from './useStore';
import type { Task, TimeBlock, Event, CalendarContainer, Category, Tag, Sticker } from '../types';

/**
 * Domain-state snapshot for undo/redo.
 * Captures only domain data — UI state (view, selection, etc.) is not affected.
 */
export interface DomainSnapshot {
  tasks: Task[];
  timeBlocks: TimeBlock[];
  events: Event[];
  calendarContainers: CalendarContainer[];
  categories: Category[];
  tags: Tag[];
  stickers: Sticker[];
}

const MAX_HISTORY = 50;

interface HistoryState {
  past: DomainSnapshot[];
  future: DomainSnapshot[];
  saveSnapshot: () => void;
  undo: () => void;
  redo: () => void;
  /** Drop all history (sign-out / user switch, B-46). */
  clear: () => void;
}

function captureDomainSnapshot(): DomainSnapshot {
  const s = useStore.getState();
  return {
    tasks: s.tasks,
    timeBlocks: s.timeBlocks,
    events: s.events,
    calendarContainers: s.calendarContainers,
    categories: s.categories,
    tags: s.tags,
    stickers: s.stickers,
  };
}

function applySnapshot(snapshot: DomainSnapshot) {
  useStore.setState({
    tasks: snapshot.tasks,
    timeBlocks: snapshot.timeBlocks,
    events: snapshot.events,
    calendarContainers: snapshot.calendarContainers,
    categories: snapshot.categories,
    tags: snapshot.tags,
    // Older snapshots may predate sticker capture.
    ...(snapshot.stickers ? { stickers: snapshot.stickers } : {}),
  });
}

export const useHistoryStore = create<HistoryState>()((set, get) => ({
  past: [],
  future: [],

  clear: () => set({ past: [], future: [] }),

  saveSnapshot: () => {
    const snapshot = captureDomainSnapshot();
    set((s) => ({
      past: [...s.past.slice(-(MAX_HISTORY - 1)), snapshot],
      future: [],
    }));
  },

  undo: () => {
    const { past } = get();
    if (past.length === 0) { console.log('[HistoryStore] nothing to undo'); return; }
    const current = captureDomainSnapshot();
    const previous = past[past.length - 1];
    set((s) => ({
      past: s.past.slice(0, -1),
      future: [current, ...s.future],
    }));
    applySnapshot(previous);
  },

  redo: () => {
    const { future } = get();
    if (future.length === 0) { console.log('[HistoryStore] nothing to redo'); return; }
    const current = captureDomainSnapshot();
    const next = future[0];
    set((s) => ({
      past: [...s.past, current],
      future: s.future.slice(1),
    }));
    applySnapshot(next);
  },
}));
