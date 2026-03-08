/**
 * Desktop & browser notification service.
 * Schedules push notifications for upcoming events (and optionally tasks).
 * Uses Tauri notification plugin on desktop, Web Notification API on browser.
 */

import { isTauri } from './desktopActivity';
import { useStore } from '../store/useStore';
import type { Event, TimeBlock } from '../types';

// Track scheduled notification timeouts so we can cancel them
const scheduledTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

/** Request notification permission (browser only — Tauri handles this via capability). */
export async function requestNotificationPermission(): Promise<boolean> {
  if (isTauri()) return true; // Tauri handles via system permissions
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

/** Check if notifications are available and permitted. */
export function canSendNotifications(): boolean {
  if (isTauri()) return true;
  return 'Notification' in window && Notification.permission === 'granted';
}

/** Send a push notification. */
async function sendNotification(title: string, body: string) {
  if (isTauri()) {
    try {
      const { sendNotification: tauriNotify } = await import('@tauri-apps/plugin-notification');
      await tauriNotify({ title, body });
    } catch (err) {
      console.warn('[notifications] Tauri notification failed:', err);
    }
  } else if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/favicon.ico' });
  }
}

/** Format time for display. */
function fmtTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

/** Parse "HH:mm" + "YYYY-MM-DD" into a Date object. */
function parseDateTime(date: string, time: string): Date {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, m] = time.split(':').map(Number);
  return new Date(y, mo - 1, d, h, m);
}

/**
 * Schedule notifications for all upcoming events (and optionally tasks/blocks)
 * within the next 24 hours. Call this whenever events change or on date change.
 */
export function scheduleNotifications(
  events: Event[],
  timeBlocks: TimeBlock[],
) {
  const state = useStore.getState();
  const { notificationScope, notificationLeadMinutes } = state;

  // Clear all existing scheduled notifications
  for (const timeout of scheduledTimeouts.values()) {
    clearTimeout(timeout);
  }
  scheduledTimeouts.clear();

  if (notificationScope === 'off') return;
  if (!canSendNotifications()) return;

  const now = Date.now();
  const leadMs = notificationLeadMinutes * 60 * 1000;
  const maxFuture = 24 * 60 * 60 * 1000; // Only schedule for next 24h

  // Schedule event notifications
  for (const event of events) {
    const eventTime = parseDateTime(event.date, event.start);
    const notifyAt = eventTime.getTime() - leadMs;
    const delay = notifyAt - now;

    if (delay < 0 || delay > maxFuture) continue; // Past or too far future
    if (event.attendanceStatus === 'not_attended') continue; // Already marked not attended

    const key = `event-${event.id}`;
    const timeout = setTimeout(() => {
      const leadText = notificationLeadMinutes > 0
        ? `in ${notificationLeadMinutes} min`
        : 'now';
      sendNotification(
        event.title || 'Event',
        `Starts ${leadText} at ${fmtTime(event.start)}${event.location ? ` · ${event.location}` : ''}`,
      );
      scheduledTimeouts.delete(key);
    }, delay);
    scheduledTimeouts.set(key, timeout);
  }

  // Schedule task block notifications (if scope includes tasks)
  if (notificationScope === 'events_and_tasks') {
    for (const block of timeBlocks) {
      if (block.mode === 'recorded') continue; // Don't notify for recorded blocks
      if (block.confirmationStatus === 'confirmed' || block.confirmationStatus === 'skipped') continue;

      const blockTime = parseDateTime(block.date, block.start);
      const notifyAt = blockTime.getTime() - leadMs;
      const delay = notifyAt - now;

      if (delay < 0 || delay > maxFuture) continue;

      const key = `block-${block.id}`;
      const title = block.title || 'Task block';
      const timeout = setTimeout(() => {
        const leadText = notificationLeadMinutes > 0
          ? `in ${notificationLeadMinutes} min`
          : 'now';
        sendNotification(
          title,
          `Starts ${leadText} at ${fmtTime(block.start)}`,
        );
        scheduledTimeouts.delete(key);
      }, delay);
      scheduledTimeouts.set(key, timeout);
    }
  }
}

/** Clear all scheduled notifications. */
export function clearAllNotifications() {
  for (const timeout of scheduledTimeouts.values()) {
    clearTimeout(timeout);
  }
  scheduledTimeouts.clear();
}
