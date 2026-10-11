/**
 * Feature flags. Parked features keep their code in the repo but have their UI
 * entry points hidden. See src/_parked/README.md for how to re-enable each.
 */
export const FEATURES: Record<'compareMode' | 'activityPanel' | 'bookingLinks' | 'autoSchedule', boolean> = {
  compareMode: false,
  activityPanel: false,
  bookingLinks: false,
  autoSchedule: false,
};
