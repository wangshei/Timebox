import React, { createContext, useContext, useRef } from 'react';

const NowContext = createContext<Date | null>(null);

/**
 * Returns the current "now" date. If wrapped in a NowProvider (e.g. during
 * the walkthrough demo), returns the frozen override date instead of real time.
 * Without a provider returns a stable Date ref (created once per component
 * mount) so it won't trigger useEffect dependency loops.
 */
export function useNow(): Date {
  const ctx = useContext(NowContext);
  const fallbackRef = useRef<Date | null>(null);
  if (ctx) return ctx;
  if (!fallbackRef.current) fallbackRef.current = new Date();
  return fallbackRef.current;
}

/** Returns true when a NowProvider is active (time is frozen for demo). */
export function useNowFrozen(): boolean {
  return useContext(NowContext) !== null;
}

export function NowProvider({ value, children }: { value: Date; children: React.ReactNode }) {
  return <NowContext.Provider value={value}>{children}</NowContext.Provider>;
}
