import { invoke } from '@tauri-apps/api/core';

export interface ActivityEntry {
  id: number;
  app_name: string;
  window_title: string;
  category: string;
  start_time: string;
  end_time: string;
  duration_secs: number;
  date: string;
}

export interface AppDetail {
  app_name: string;
  minutes: number;
}

export interface CategorySummary {
  category: string;
  total_minutes: number;
  app_details: AppDetail[];
}

/** Check if we're running inside Tauri */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function startTracking(): Promise<void> {
  if (!isTauri()) return;
  await invoke('start_tracking');
}

export async function stopTracking(): Promise<void> {
  if (!isTauri()) return;
  await invoke('stop_tracking');
}

export async function isTracking(): Promise<boolean> {
  if (!isTauri()) return false;
  return invoke<boolean>('is_tracking');
}

export async function getActivityLog(dateFrom: string, dateTo: string): Promise<ActivityEntry[]> {
  if (!isTauri()) return [];
  return invoke<ActivityEntry[]>('get_activity_log', { dateFrom, dateTo });
}

export async function getActivitySummary(date: string): Promise<CategorySummary[]> {
  if (!isTauri()) return [];
  return invoke<CategorySummary[]>('get_activity_summary', { date });
}

export interface ActivityBlock {
  category: string;
  app_name: string;
  start_time: string; // ISO 8601
  end_time: string;
  duration_secs: number;
  date: string;
}

export async function getActivityBlocks(date: string): Promise<ActivityBlock[]> {
  if (!isTauri()) return [];
  return invoke<ActivityBlock[]>('get_activity_blocks', { date });
}
