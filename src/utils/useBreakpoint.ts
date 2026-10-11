import { useEffect, useState } from 'react';

/** Single source of truth for responsive layout. phone <768, tablet 768-1023, desktop >=1024. */
export const BREAKPOINTS = { tablet: 768, desktop: 1024 } as const;

export type BreakpointInfo = {
  width: number;
  isPhone: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  /** Anything below desktop uses the mobile layout (phone + tablet). */
  isCompact: boolean;
};

function compute(width: number): BreakpointInfo {
  return {
    width,
    isPhone: width < BREAKPOINTS.tablet,
    isTablet: width >= BREAKPOINTS.tablet && width < BREAKPOINTS.desktop,
    isDesktop: width >= BREAKPOINTS.desktop,
    isCompact: width < BREAKPOINTS.desktop,
  };
}

/** Reactive viewport breakpoint (updates on resize / rotation). */
export function useBreakpoint(): BreakpointInfo {
  const [info, setInfo] = useState<BreakpointInfo>(() =>
    compute(typeof window === 'undefined' ? BREAKPOINTS.desktop : window.innerWidth),
  );
  useEffect(() => {
    const update = () => setInfo((prev) => {
      const next = compute(window.innerWidth);
      return prev.isPhone === next.isPhone && prev.isTablet === next.isTablet && prev.isDesktop === next.isDesktop ? prev : next;
    });
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);
  return info;
}
