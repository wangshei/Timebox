import { supabase } from './supabaseClient';
import { useStore } from './store/useStore';
import { DEFAULT_PALETTE_COLOR } from './constants/colors';
import { getLocalTimeZone } from './utils/dateTime';
import type { Task, TimeBlock, CalendarContainer, Category, Tag, Event } from './types';

/** Delete the current user's account via the database function.
 *  Requires the `delete_own_account` RPC (see docs/SUPABASE_SETUP.md). */
export async function deleteOwnAccount(): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Supabase not configured' };
  const { error } = await supabase.rpc('delete_own_account');
  if (error) return { error: error.message };
  await supabase.auth.signOut();
  return { error: null };
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return String(Date.now()) + '-' + Math.random().toString(36).slice(2, 9);
}

type PersistableState = {
  tasks: Task[];
  timeBlocks: TimeBlock[];
  calendarContainers: CalendarContainer[];
  categories: Category[];
  tags: Tag[];
  events: Event[];
};

// Gate: saves are blocked until the initial Supabase load completes.
// This prevents the seed/localStorage state (with empty categories/events)
// from wiping Supabase data during the window between subscription start
// and loadSupabaseState completion.
let supabaseLoaded = false;

async function getCurrentUserId(): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id;
}

// --- Load from Supabase into the Zustand store ---

export async function loadSupabaseState() {
  if (!supabase) return;
  const userId = await getCurrentUserId();
  if (!userId) {
    // eslint-disable-next-line no-console
    console.warn('[supabasePersistence] loadSupabaseState: no authenticated user — skipping');
    return;
  }
  // eslint-disable-next-line no-console
  console.log('[supabasePersistence] Loading state for user', userId);

  const [containersRes, categoriesRes, tagsRes, tasksRes, blocksRes, eventsRes, settingsRes] = await Promise.all([
    supabase.from('calendar_containers').select('*').eq('user_id', userId),
    supabase.from('categories').select('*').eq('user_id', userId),
    supabase.from('tags').select('*').eq('user_id', userId),
    supabase.from('tasks').select('*').eq('user_id', userId),
    supabase.from('time_blocks').select('*').eq('user_id', userId),
    supabase.from('events').select('*').eq('user_id', userId),
    supabase.from('user_settings').select('timezone, has_completed_setup').eq('user_id', userId).maybeSingle(),
  ]);

  const hasError =
    containersRes.error ||
    categoriesRes.error ||
    tagsRes.error ||
    tasksRes.error ||
    blocksRes.error ||
    eventsRes.error;
  // settingsRes.error is non-fatal (table may not exist yet)
  if (hasError) {
    // eslint-disable-next-line no-console
    console.error(
      '[supabasePersistence] Load error — if every table shows a 42501 or "permission denied" error, ' +
        'RLS policies are likely missing. Run the full policy SQL from docs/SUPABASE_SETUP.md §2.',
      {
        containers: containersRes.error,
        categories: categoriesRes.error,
        tags: tagsRes.error,
        tasks: tasksRes.error,
        blocks: blocksRes.error,
        events: eventsRes.error,
      }
    );
    return;
  }

  // eslint-disable-next-line no-console
  console.log('[supabasePersistence] Loaded from Supabase:', {
    containers: (containersRes.data ?? []).length,
    categories: (categoriesRes.data ?? []).length,
    tags: (tagsRes.data ?? []).length,
    tasks: (tasksRes.data ?? []).length,
    blocks: (blocksRes.data ?? []).length,
    events: (eventsRes.data ?? []).length,
  });

  // Ensure user timezone is stored; use browser timezone if missing (table may not exist yet)
  const settings = settingsRes.data as { timezone?: string; has_completed_setup?: boolean } | null;
  const timezone = (settings?.timezone?.trim() || getLocalTimeZone());
  const hasCompletedSetupFromDb = settings?.has_completed_setup === true;
  const upsertRes = await supabase.from('user_settings').upsert(
    { user_id: userId, timezone },
    { onConflict: 'user_id' }
  );
  if (upsertRes.error) {
    // eslint-disable-next-line no-console
    console.warn('[supabasePersistence] user_settings upsert skipped (table may not exist):', upsertRes.error);
  }

  let containers = (containersRes.data ?? []) as any[];
  let categories = (categoriesRes.data ?? []) as any[];
  const tags = (tagsRes.data ?? []) as any[];
  const tasks = (tasksRes.data ?? []) as any[];
  const blocks = (blocksRes.data ?? []) as any[];
  const events = (eventsRes.data ?? []) as any[];

  // New user (or data lost): give them a default Personal calendar + a General
  // category so they can start adding tasks/events immediately. The persistence
  // subscription (started before this function) will save these to Supabase.
  if (containers.length === 0) {
    const defaultCalId = generateId();
    containers = [
      { id: defaultCalId, name: 'Personal', color: DEFAULT_PALETTE_COLOR },
    ];
  }
  // Always ensure at least one category exists (categories may have been lost
  // independently of containers, e.g. due to a previous persistence bug).
  if (categories.length === 0 && containers.length > 0) {
    categories = [
      { id: generateId(), name: 'General', color: DEFAULT_PALETTE_COLOR, calendar_container_id: containers[0].id },
    ];
  }

  useStore.setState((prev) => {
    const calendarContainers = containers.map(
      (c): CalendarContainer => ({ id: c.id, name: c.name, color: c.color })
    );
    const visibility =
      containers.length > 0 && calendarContainers.length > 0
        ? { ...prev.containerVisibility, ...Object.fromEntries(calendarContainers.map((c) => [c.id, true])) }
        : prev.containerVisibility;
    return {
      ...prev,
      hasCompletedSetup: hasCompletedSetupFromDb,
      calendarContainers,
      containerVisibility: visibility,
      categories: categories.map(
      (c): Category => ({
        id: c.id,
        name: c.name,
        color: c.color,
        calendarContainerId: c.calendar_container_id ?? null,
        calendarContainerIds: c.calendar_container_ids ?? null,
      })
    ),
    tags: tags.map(
      (t): Tag => ({
        id: t.id,
        name: t.name,
        type: t.type ?? undefined,
        categoryId: t.category_id ?? null,
      })
    ),
    tasks: tasks.map(
      (t): Task => ({
        id: t.id,
        title: t.title,
        estimatedMinutes: t.estimated_minutes,
        calendarContainerId: t.calendar_container_id,
        categoryId: t.category_id,
        tagIds: t.tag_ids ?? [],
        flexible: t.flexible,
        status: t.status ?? undefined,
        dueDate: t.due_date ?? null,
        link: t.link ?? null,
        description: t.description ?? null,
        notes: (t as any).notes ?? null,
        priority: typeof t.priority === 'number' ? t.priority : undefined,
        pinned: t.pinned ?? false,
        emoji: t.emoji ?? null,
      })
    ),
    timeBlocks: blocks.map(
      (b): TimeBlock => ({
        id: b.id,
        taskId: b.task_id ?? null,
        title: b.title ?? undefined,
        calendarContainerId: b.calendar_container_id,
        categoryId: b.category_id,
        tagIds: b.tag_ids ?? [],
        start: b.start,
        end: b.end,
        date: b.date,
        mode: b.mode,
        source: b.source,
        confirmationStatus: b.confirmation_status ?? undefined,
        recordedStart: b.recorded_start ?? null,
        recordedEnd: b.recorded_end ?? null,
        link: b.link ?? null,
        description: b.description ?? null,
        notes: b.notes ?? null,
      })
    ),
    events: events.map(
      (e): Event => ({
        id: e.id,
        title: e.title,
        calendarContainerId: e.calendar_container_id,
        categoryId: e.category_id,
        start: e.start,
        end: e.end,
        date: e.date,
        recurring: e.recurring,
        recurrencePattern: e.recurrence_pattern ?? undefined,
        recurrenceDays: e.recurrence_days ?? undefined,
        recurrenceSeriesId: e.recurrence_series_id ?? null,
        link: e.link ?? null,
        description: e.description ?? null,
        notes: (e as any).notes ?? null,
        source: (e as any).source ?? undefined,
      })
    ),
    };
  });

  // Mark as loaded so the persistence subscription can start saving.
  supabaseLoaded = true;

  // Trigger one immediate save so the loaded state is persisted (helps ensure save path works).
  // userId is already declared above, so reuse it.
  if (userId) {
    const state = useStore.getState();
    const slice: PersistableState = {
      tasks: state.tasks,
      timeBlocks: state.timeBlocks,
      calendarContainers: state.calendarContainers,
      categories: state.categories,
      tags: state.tags,
      events: state.events,
    };
    try {
      await saveSupabaseStateForUser(userId, slice);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[supabasePersistence] Post-load save failed', e);
    }
  }
}

// --- Persist from Zustand store into Supabase ---

async function saveSupabaseStateForUser(userId: string, state: PersistableState) {
  if (!supabase) return;

  const errors: Array<{ table: string; op: string; error: unknown }> = [];

  function check(table: string, op: string, result: { error: unknown }) {
    if (result.error) {
      errors.push({ table, op, error: result.error });
      // eslint-disable-next-line no-console
      console.error(`[supabasePersistence] ${op} ${table} failed`, result.error);
    }
  }

  // --- PHASE 1: UPSERT everything first (parent → child order for FK safety) ---
  // This ensures data is never lost even if the delete phase fails.

  if (state.calendarContainers.length) {
    check('calendar_containers', 'upsert', await supabase.from('calendar_containers').upsert(
      state.calendarContainers.map((c) => ({
        id: c.id,
        user_id: userId,
        name: c.name,
        color: c.color,
      })),
      { onConflict: 'id' }
    ));
  }
  if (state.categories.length) {
    check('categories', 'upsert', await supabase.from('categories').upsert(
      state.categories.map((c) => ({
        id: c.id,
        user_id: userId,
        name: c.name,
        color: c.color,
        calendar_container_id: c.calendarContainerId ?? null,
        calendar_container_ids: c.calendarContainerIds ?? null,
      })),
      { onConflict: 'id' }
    ));
  }
  if (state.tags.length) {
    check('tags', 'upsert', await supabase.from('tags').upsert(
      state.tags.map((t) => ({
        id: t.id,
        user_id: userId,
        name: t.name,
        type: t.type ?? null,
        category_id: t.categoryId ?? null,
      })),
      { onConflict: 'id' }
    ));
  }
  if (state.tasks.length) {
    check('tasks', 'upsert', await supabase.from('tasks').upsert(
      state.tasks.map((t) => ({
        id: t.id,
        user_id: userId,
        title: t.title ?? '',
        estimated_minutes: t.estimatedMinutes ?? 0,
        calendar_container_id: t.calendarContainerId,
        category_id: t.categoryId,
        tag_ids: Array.isArray(t.tagIds) ? t.tagIds : [],
        flexible: t.flexible ?? true,
        status: t.status ?? null,
        due_date: t.dueDate ?? null,
        link: t.link ?? null,
        description: t.description ?? null,
        notes: t.notes ?? null,
        priority: typeof t.priority === 'number' ? t.priority : null,
        pinned: t.pinned ?? false,
        emoji: t.emoji ?? null,
      })),
      { onConflict: 'id' }
    ));
  }
  if (state.timeBlocks.length) {
    check('time_blocks', 'upsert', await supabase.from('time_blocks').upsert(
      state.timeBlocks.map((b) => ({
        id: b.id,
        user_id: userId,
        task_id: b.taskId ?? null,
        title: b.title ?? null,
        calendar_container_id: b.calendarContainerId,
        category_id: b.categoryId,
        tag_ids: Array.isArray(b.tagIds) ? b.tagIds : [],
        start: b.start ?? '',
        end: b.end ?? '',
        date: b.date ?? '',
        mode: b.mode ?? 'planned',
        source: b.source ?? 'manual',
        confirmation_status: b.confirmationStatus ?? null,
        recorded_start: b.recordedStart ?? null,
        recorded_end: b.recordedEnd ?? null,
        link: b.link ?? null,
        description: b.description ?? null,
        notes: b.notes ?? null,
      })),
      { onConflict: 'id' }
    ));
  }
  if (state.events.length) {
    check('events', 'upsert', await supabase.from('events').upsert(
      state.events.map((e) => ({
        id: e.id,
        user_id: userId,
        title: e.title ?? '',
        calendar_container_id: e.calendarContainerId,
        category_id: e.categoryId,
        start: e.start ?? '',
        end: e.end ?? '',
        date: e.date ?? '',
        recurring: e.recurring ?? false,
        recurrence_pattern: e.recurrencePattern ?? null,
        recurrence_days: e.recurrenceDays ?? null,
        recurrence_series_id: e.recurrenceSeriesId ?? null,
        link: e.link ?? null,
        description: e.description ?? null,
        notes: e.notes ?? null,
        source: e.source ?? null,
      })),
      { onConflict: 'id' }
    ));
  }

  // Bail if upserts failed — don't delete orphans when we couldn't even write current data.
  if (errors.length > 0) {
    // eslint-disable-next-line no-console
    console.error(`[supabasePersistence] Save had ${errors.length} upsert error(s) — skipping orphan cleanup`, errors);
    useStore.getState().setSaveError(true);
    return;
  }

  // --- PHASE 2: Delete orphaned rows (items removed from the store) ---
  // Only delete by specific IDs, NOT "delete all". This way, if phase 1 partially
  // failed on a previous run, we don't wipe data that hasn't been re-inserted.

  const containerIds = state.calendarContainers.map((c) => c.id);
  const categoryIds = state.categories.map((c) => c.id);
  const tagIds = state.tags.map((t) => t.id);
  const taskIds = state.tasks.map((t) => t.id);
  const blockIds = state.timeBlocks.map((b) => b.id);
  const eventIds = state.events.map((e) => e.id);

  // Delete children first (FK order), then parents.
  if (blockIds.length > 0) {
    check('time_blocks', 'delete-orphans', await supabase.from('time_blocks').delete().eq('user_id', userId).not('id', 'in', `(${blockIds.join(',')})`));
  } else {
    check('time_blocks', 'delete-all', await supabase.from('time_blocks').delete().eq('user_id', userId));
  }
  if (eventIds.length > 0) {
    check('events', 'delete-orphans', await supabase.from('events').delete().eq('user_id', userId).not('id', 'in', `(${eventIds.join(',')})`));
  } else {
    check('events', 'delete-all', await supabase.from('events').delete().eq('user_id', userId));
  }
  if (taskIds.length > 0) {
    check('tasks', 'delete-orphans', await supabase.from('tasks').delete().eq('user_id', userId).not('id', 'in', `(${taskIds.join(',')})`));
  } else {
    check('tasks', 'delete-all', await supabase.from('tasks').delete().eq('user_id', userId));
  }
  if (tagIds.length > 0) {
    check('tags', 'delete-orphans', await supabase.from('tags').delete().eq('user_id', userId).not('id', 'in', `(${tagIds.join(',')})`));
  } else {
    check('tags', 'delete-all', await supabase.from('tags').delete().eq('user_id', userId));
  }
  if (categoryIds.length > 0) {
    check('categories', 'delete-orphans', await supabase.from('categories').delete().eq('user_id', userId).not('id', 'in', `(${categoryIds.join(',')})`));
  } else {
    check('categories', 'delete-all', await supabase.from('categories').delete().eq('user_id', userId));
  }
  if (containerIds.length > 0) {
    check('calendar_containers', 'delete-orphans', await supabase.from('calendar_containers').delete().eq('user_id', userId).not('id', 'in', `(${containerIds.join(',')})`));
  } else {
    check('calendar_containers', 'delete-all', await supabase.from('calendar_containers').delete().eq('user_id', userId));
  }

  if (errors.length > 0) {
    // eslint-disable-next-line no-console
    console.error(`[supabasePersistence] Save completed with ${errors.length} error(s)`, errors);
  } else {
    // eslint-disable-next-line no-console
    console.log('[supabasePersistence] Save OK:', {
      containers: state.calendarContainers.length,
      categories: state.categories.length,
      tags: state.tags.length,
      tasks: state.tasks.length,
      timeBlocks: state.timeBlocks.length,
      events: state.events.length,
    });
  }
}

/** Persist hasCompletedSetup to Supabase so it survives refresh and different devices. */
export async function persistOnboardingToSupabase(hasCompletedSetup: boolean) {
  if (!supabase) return;
  const userId = await getCurrentUserId();
  if (!userId) return;
  const { error } = await supabase
    .from('user_settings')
    .update({ has_completed_setup: hasCompletedSetup })
    .eq('user_id', userId);
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[supabasePersistence] persistOnboardingToSupabase failed (column may not exist yet):', error);
  }
}

/** Subscribe to store changes and persist to Supabase for the current user. */
export function startSupabasePersistence() {
  if (!supabase || typeof window === 'undefined') return () => {};

  // Reset the loaded flag so saves are blocked until loadSupabaseState finishes.
  supabaseLoaded = false;

  let saving = false;
  let pendingSlice: PersistableState | null = null;
  let lastSaveCompletedAt = 0;

  async function flush(slice: PersistableState) {
    if (!supabaseLoaded) {
      // eslint-disable-next-line no-console
      console.log('[supabasePersistence] Skipping save — initial load not yet complete.');
      saving = false;
      return;
    }
    const userId = await getCurrentUserId();
    if (!userId) {
      // eslint-disable-next-line no-console
      console.warn('[supabasePersistence] Skipping save — user deleted or not signed in. Forcing sign-out.');
      useStore.getState().setSessionExpired(true);
      // Force sign-out so stale JWT is cleared and UI shows auth screen
      void supabase!.auth.signOut();
      saving = false;
      return;
    }
    // eslint-disable-next-line no-console
    console.log('[supabasePersistence] Saving...', { tasks: slice.tasks.length, timeBlocks: slice.timeBlocks.length, events: slice.events.length });
    try {
      await saveSupabaseStateForUser(userId, slice);
      lastSaveCompletedAt = Date.now();
      // Clear any previous error on success
      if (useStore.getState().saveError) useStore.getState().setSaveError(false);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[supabasePersistence] Save error', e);
      useStore.getState().setSaveError(true);
    } finally {
      // If the store changed while we were saving, save the latest state now.
      if (pendingSlice) {
        const next = pendingSlice;
        pendingSlice = null;
        void flush(next);
      } else {
        saving = false;
      }
    }
  }

  const unsubscribeStore = useStore.subscribe<PersistableState>(
    (state) => ({
      tasks: state.tasks,
      timeBlocks: state.timeBlocks,
      calendarContainers: state.calendarContainers,
      categories: state.categories,
      tags: state.tags,
      events: state.events,
    }),
    (slice) => {
      if (saving) {
        pendingSlice = slice;
        return;
      }
      // Set saving SYNCHRONOUSLY before the async flush starts,
      // so a second change arriving before getCurrentUserId() returns
      // will be queued instead of starting a parallel save.
      saving = true;
      void flush(slice);
    }
  );

  // Realtime: reload state when another client makes a change
  let reloadTimer: ReturnType<typeof setTimeout> | null = null;

  function scheduleReload() {
    if (reloadTimer) clearTimeout(reloadTimer);
    reloadTimer = setTimeout(async () => {
      // Skip reload while tab is hidden — avoids jarring refreshes on tab switch
      if (document.hidden) return;
      // Skip if our own save just completed (self-echo guard, 3s window)
      if (Date.now() - lastSaveCompletedAt < 3000) return;
      // Skip if currently saving (our save will overwrite anyway)
      if (saving) return;
      // eslint-disable-next-line no-console
      console.log('[supabasePersistence] Remote change detected, reloading...');
      try { await loadSupabaseState(); } catch (e) { console.error(e); }
    }, 500);
  }

  const channel = supabase
    .channel('timebox-db-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, scheduleReload)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'time_blocks' }, scheduleReload)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, scheduleReload)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_containers' }, scheduleReload)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, scheduleReload)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tags' }, scheduleReload)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'user_settings' }, scheduleReload)
    .subscribe();

  return () => {
    unsubscribeStore();
    void supabase!.removeChannel(channel);
    if (reloadTimer) clearTimeout(reloadTimer);
  };
}

