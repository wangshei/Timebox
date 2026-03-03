import { create } from 'zustand';
import { useStore } from './useStore';
import type { Task, TimeBlock, Event, CalendarContainer, Category, Tag } from '../types';

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
}

const MAX_HISTORY = 50;

interface HistoryState {
  past: DomainSnapshot[];
  future: DomainSnapshot[];
  saveSnapshot: () => void;
  undo: () => void;
  redo: () => void;
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
  });
}

export const useHistoryStore = create<HistoryState>()((set, get) => ({
  past: [],
  future: [],

  saveSnapshot: () => {
    const snapshot = captureDomainSnapshot();
    console.log('[HistoryStore] saveSnapshot — past will have', get().past.length + 1, 'entries. timeBlocks:', snapshot.timeBlocks.length, 'tasks:', snapshot.tasks.length);
    set((s) => ({
      past: [...s.past.slice(-(MAX_HISTORY - 1)), snapshot],
      future: [],
    }));
  },

  undo: () => {
    const { past } = get();
    console.log('[HistoryStore] undo called — past.length:', past.length);
    if (past.length === 0) { console.log('[HistoryStore] nothing to undo'); return; }
    const current = captureDomainSnapshot();
    const previous = past[past.length - 1];
    console.log('[HistoryStore] restoring snapshot. current timeBlocks:', current.timeBlocks.length, 'previous timeBlocks:', previous.timeBlocks.length);
    set((s) => ({
      past: s.past.slice(0, -1),
      future: [current, ...s.future],
    }));
    applySnapshot(previous);
    console.log('[HistoryStore] snapshot applied. store timeBlocks now:', useStore.getState().timeBlocks.length);
  },

  redo: () => {
    const { future } = get();
    console.log('[HistoryStore] redo called — future.length:', future.length);
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
