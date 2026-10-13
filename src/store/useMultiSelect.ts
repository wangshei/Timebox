import { create } from 'zustand';

/** Desktop multi-select of calendar items. Keys are `event:<id>` or `block:<id>`. UI-only, never persisted. */
interface MultiSelectState {
  keys: string[];
  /** Key of the item toggled last (the floating bar anchors to it). */
  last: string | null;
  toggle: (key: string) => void;
  /** Toggle `key`; when nothing is selected yet, also pull in the card currently open in a popover. */
  toggleWithPrimary: (key: string) => void;
  clear: () => void;
}

export const useMultiSelect = create<MultiSelectState>()((set) => ({
  keys: [],
  last: null,
  toggleWithPrimary: (key) => {
    const st = useMultiSelect.getState();
    if (st.keys.length === 0) {
      const primary = document.querySelector('[data-ms-primary="true"]')?.getAttribute('data-multisel-key');
      if (primary && primary !== key) st.toggle(primary);
    }
    useMultiSelect.getState().toggle(key);
  },
  toggle: (key) => set((s) => {
    if (s.keys.includes(key)) {
      const keys = s.keys.filter((k) => k !== key);
      return { keys, last: keys[keys.length - 1] ?? null };
    }
    return { keys: [...s.keys, key], last: key };
  }),
  clear: () => set((s) => (s.keys.length ? { keys: [], last: null } : s)),
}));

/** True when a click carries the multi-select modifier (Cmd/Ctrl or Shift both toggle). */
export const isMultiSelectClick = (e: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean }) => e.metaKey || e.ctrlKey || e.shiftKey;
