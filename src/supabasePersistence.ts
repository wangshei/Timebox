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

// Local-only userId read from the cached JWT — no network call, so transient
// network blips can't return null and trigger a spurious sign-out.
async function getCurrentUserIdLocal(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

// --- Load from Supabase into the Zustand store ---

export async function loadSupabaseState(isInitialLoad = true) {
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
    supabase.from('user_settings').select('timezone, has_completed_setup, week_starts_on_monday, wake_time, sleep_time').eq('user_id', userId).maybeSingle(),
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
    // Still mark as loaded so saves aren't permanently blocked.
    // The store already has data from localStorage — better to save that than nothing.
    supabaseLoaded = true;
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
  const settings = settingsRes.data as { timezone?: string; has_completed_setup?: boolean; week_starts_on_monday?: boolean; wake_time?: string; sleep_time?: string } | null;
  const timezone = (settings?.timezone?.trim() || getLocalTimeZone());
  const hasCompletedSetupFromDb = settings?.has_completed_setup === true;
  const weekStartsOnMondayFromDb = settings?.week_starts_on_monday ?? false;
  const wakeTimeFromDb = settings?.wake_time ?? '08:00';
  const sleepTimeFromDb = settings?.sleep_time ?? '23:00';
  const upsertRes = await supabase.from('user_settings').upsert(
    { user_id: userId, timezone },
    { onConflict: 'user_id' }
  );
  if (upsertRes.error) {
    // eslint-disable-next-line no-console
    console.warn('[supabasePersistence] user_settings upsert skipped (table may not exist):', upsertRes.error);
  }

  // Filter out gcal containers/categories/events on load — they're ephemeral and
  // will be re-injected from the Google API. Any that leaked into Supabase from
  // earlier versions will be cleaned up by the orphan-delete phase on next save.
  let containers = ((containersRes.data ?? []) as any[]).filter((c: any) => !String(c.id).startsWith('gcal-'));
  let categories = ((categoriesRes.data ?? []) as any[]).filter((c: any) => !String(c.id).startsWith('gcal-cat-'));
  const tags = (tagsRes.data ?? []) as any[];
  const tasks = (tasksRes.data ?? []) as any[];
  const blocks = (blocksRes.data ?? []) as any[];
  // Ephemeral events (never our own persisted rows): imported gcal mirrors and
  // shared-calendar events. Both are re-injected in memory on each load, so filter
  // them out of the DB read; any that leaked into the table (older versions persisted
  // shared events) get cleaned up by the orphan-delete phase on the next save.
  const events = ((eventsRes.data ?? []) as any[]).filter(
    (e: any) => !String(e.id).startsWith('gcal-evt-') && !String(e.id).startsWith('shared-') && !e.shared_from_share_id
  );

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
    // Preserve gcal items that only exist in memory (not persisted to Supabase)
    const prevGcalContainers = prev.calendarContainers.filter(c => c.id.startsWith('gcal-'));
    const prevGcalCategories = prev.categories.filter(c => c.id.startsWith('gcal-cat-'));
    // Memory-only/ephemeral events: imported gcal mirrors (gcal-evt-) and shared
    // events (re-injected from the share on load). Preserve them across the DB read so
    // they don't flicker. Write-back events (local UUID id stamped with a googleEventId)
    // ARE persisted and load via the DB path — don't double-preserve those.
    const prevGcalEvents = prev.events.filter(e => e.id.startsWith('gcal-evt-') || !!e.sharedFromShareId);

    const calendarContainers = [
      ...containers.map((c): CalendarContainer => {
        const existing = prev.calendarContainers.find((ex) => ex.id === c.id);
        return { id: c.id, name: c.name, color: c.color, sortOrder: (c as any).sort_order ?? existing?.sortOrder ?? undefined };
      }),
      ...prevGcalContainers,
    ];
    const visibility =
      containers.length > 0 && calendarContainers.length > 0
        ? { ...prev.containerVisibility, ...Object.fromEntries(calendarContainers.map((c) => [c.id, true])) }
        : prev.containerVisibility;
    return {
      ...prev,
      hasCompletedSetup: hasCompletedSetupFromDb,
      weekStartsOnMonday: weekStartsOnMondayFromDb,
      wakeTime: wakeTimeFromDb,
      sleepTime: sleepTimeFromDb,
      calendarContainers,
      containerVisibility: visibility,
      categories: [
      ...categories.map(
      (c): Category => {
        const existing = prev.categories.find((ex) => ex.id === c.id);
        return {
          id: c.id,
          name: c.name,
          color: c.color,
          calendarContainerId: c.calendar_container_id ?? null,
          calendarContainerIds: c.calendar_container_ids ?? null,
          sortOrder: (c as any).sort_order ?? existing?.sortOrder ?? undefined,
        };
      }
    ),
      ...prevGcalCategories,
    ],
    tags: tags.map(
      (t): Tag => {
        const existing = prev.tags.find((ex) => ex.id === t.id);
        return {
          id: t.id,
          name: t.name,
          type: t.type ?? undefined,
          categoryId: t.category_id ?? null,
          sortOrder: (t as any).sort_order ?? existing?.sortOrder ?? undefined,
        };
      }
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
    events: [
      ...events.map(
        (e): Event => {
          // Preserve locally-set timezone from current store if DB doesn't have the column yet
          const existing = prev.events.find((ex) => ex.id === e.id);
          return {
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
            endDate: (e as any).end_date ?? undefined,
            // Fall back to the in-memory value when the DB column doesn't exist yet
            // (migration not applied) so a just-made change isn't wiped on reload.
            attendanceStatus: (e as any).attendance_status ?? existing?.attendanceStatus ?? undefined,
            googleEventId: (e as any).google_event_id ?? existing?.googleEventId ?? null,
            attendees: (e as any).attendees ?? existing?.attendees ?? null,
            // timezone lives in localStorage (via Zustand persistence), not Supabase yet
            timezone: existing?.timezone ?? null,
          };
        }
      ),
      ...prevGcalEvents,
    ],
    };
  });

  // Mark as loaded so the persistence subscription can start saving.
  supabaseLoaded = true;
}

// --- Persist from Zustand store into Supabase ---

async function saveSupabaseStateForUser(userId: string, state: PersistableState) {
  if (!supabase) return;

  const errors: Array<{ table: string; op: string; error: unknown }> = [];
  // Tables whose PHASE 1 upsert failed — their orphan-delete must be skipped so we
  // don't delete rows that failed to (re-)upsert.
  const failedTables = new Set<string>();

  function check(table: string, op: string, result: { error: unknown }) {
    if (result.error) {
      errors.push({ table, op, error: result.error });
      if (op === 'upsert') failedTables.add(table);
      // eslint-disable-next-line no-console
      console.error(`[supabasePersistence] ${op} ${table} failed`, result.error);
    }
  }

  // --- PHASE 1: UPSERT everything first (parent → child order for FK safety) ---
  // This ensures data is never lost even if the delete phase fails.

  // Filter out gcal containers/categories — they're ephemeral, sourced from Google API on each load
  const nonGcalContainers = state.calendarContainers.filter(c => !c.id.startsWith('gcal-'));
  if (nonGcalContainers.length) {
    check('calendar_containers', 'upsert', await supabase.from('calendar_containers').upsert(
      nonGcalContainers.map((c) => ({
        id: c.id,
        user_id: userId,
        name: c.name,
        color: c.color,
      })),
      { onConflict: 'id' }
    ));
  }
  const nonGcalCategories = state.categories.filter(c => !c.id.startsWith('gcal-cat-'));
  if (nonGcalCategories.length) {
    // Try with calendar_container_ids first; if column doesn't exist, retry without it
    let catResult = await supabase.from('categories').upsert(
      nonGcalCategories.map((c) => ({
        id: c.id,
        user_id: userId,
        name: c.name,
        color: c.color,
        calendar_container_id: c.calendarContainerId ?? null,
        calendar_container_ids: c.calendarContainerIds ?? null,
      })),
      { onConflict: 'id' }
    );
    if (catResult.error && /calendar_container_ids|column/.test(catResult.error.message)) {
      // Column doesn't exist — retry without it
      catResult = await supabase.from('categories').upsert(
        nonGcalCategories.map((c) => ({
          id: c.id,
          user_id: userId,
          name: c.name,
          color: c.color,
          calendar_container_id: c.calendarContainerId ?? null,
        })),
        { onConflict: 'id' }
      );
    }
    check('categories', 'upsert', catResult);
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
    // Full row includes newer/optional columns. If any of them don't exist yet in the
    // DB (older schema), the whole upsert would fail — which also skips the tasks
    // orphan-delete (so deletes don't persist) AND drops status changes (so "done"
    // reverts on the next reload). Retry with only the core columns so a schema gap
    // degrades to "these optional fields aren't saved" instead of "nothing saves".
    const taskRow = (t: Task) => ({
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
    });
    let taskResult = await supabase.from('tasks').upsert(state.tasks.map(taskRow), { onConflict: 'id' });
    if (taskResult.error && /column|notes|priority|pinned|emoji|link|description/.test(taskResult.error.message)) {
      // eslint-disable-next-line no-console
      console.warn('[supabasePersistence] tasks upsert failed on an optional column — retrying with core columns only:', taskResult.error.message);
      taskResult = await supabase.from('tasks').upsert(
        state.tasks.map((t) => {
          const { notes, priority, pinned, emoji, link, description, ...core } = taskRow(t);
          return core;
        }),
        { onConflict: 'id' }
      );
    }
    check('tasks', 'upsert', taskResult);
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
  // Persist only our OWN events. Exclude ephemeral mirrors: imported gcal events
  // (gcal-evt-, sourced from Google each load) and shared-calendar events
  // (sharedFromShareId, re-injected from the share each load). Persisting shared events
  // made them un-deletable — they'd get re-injected on the next load. Write-back events
  // (local UUID id + googleEventId, no share id) DO persist and survive reloads.
  const nonGcalEvents = state.events.filter(e => !e.id.startsWith('gcal-evt-') && !e.sharedFromShareId);
  if (nonGcalEvents.length) {
    const eventRow = (e: Event) => ({
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
      end_date: e.endDate ?? null,
      // Newer columns — stripped on retry below if the migration isn't applied yet.
      attendance_status: e.attendanceStatus ?? null,
      google_event_id: e.googleEventId ?? null,
      attendees: e.attendees ?? null,
    });
    let evResult = await supabase.from('events').upsert(nonGcalEvents.map(eventRow), { onConflict: 'id' });
    if (evResult.error && /column|does not exist|schema cache/i.test(evResult.error.message)) {
      // A column is missing from this DB's schema. Retry with only the core columns so
      // a schema gap can't fail the whole events upsert — which would otherwise SKIP the
      // events orphan-delete (deletes never persist) and drop event edits. Optional
      // fields just won't be saved until the migration is applied.
      // eslint-disable-next-line no-console
      console.warn('[supabasePersistence] events upsert failed on an optional column — retrying with core columns only:', evResult.error.message);
      evResult = await supabase.from('events').upsert(
        nonGcalEvents.map((e) => ({
          id: e.id,
          user_id: userId,
          title: e.title ?? '',
          calendar_container_id: e.calendarContainerId,
          category_id: e.categoryId,
          start: e.start ?? '',
          end: e.end ?? '',
          date: e.date ?? '',
          recurring: e.recurring ?? false,
        })),
        { onConflict: 'id' }
      );
    }
    check('events', 'upsert', evResult);
  }

  // If upserts failed, log but continue with orphan cleanup for tables that succeeded.
  // Don't block the entire save — partial saves are better than no saves.
  if (errors.length > 0) {
    // eslint-disable-next-line no-console
    console.error(`[supabasePersistence] Save had ${errors.length} upsert error(s)`, errors);
  }

  // --- PHASE 2: Delete orphaned rows (items removed from the store) ---
  // Only delete by specific IDs, NOT "delete all". This way, if phase 1 partially
  // failed on a previous run, we don't wipe data that hasn't been re-inserted.

  const containerIds = nonGcalContainers.map((c) => c.id);
  const categoryIds = nonGcalCategories.map((c) => c.id);
  const tagIds = state.tags.map((t) => t.id);
  const taskIds = state.tasks.map((t) => t.id);
  const blockIds = state.timeBlocks.map((b) => b.id);
  const eventIds = nonGcalEvents.map((e) => e.id);

  // Max IDs that fit in a `not('id', 'in', ...)` URL without exceeding PostgREST limits.
  // Each UUID is ~36 chars + comma; PostgREST URL limit is ~8KB.
  const MAX_NOT_IN_IDS = 150;

  /**
   * Delete orphans for a table: rows on the server that are no longer in the store.
   *
   * We always compute the orphan set explicitly (fetch server IDs, diff against the
   * keep-list) and delete by ID with `.select('id')` so we can VERIFY how many rows
   * were actually removed. This matters because RLS silently drops a DELETE the policy
   * doesn't permit — it returns success with 0 affected rows, so a missing DELETE policy
   * looks exactly like a successful save while the row survives and "reappears" on the
   * next load. Verifying the affected count is the only way to catch that from the client.
   *
   * `allowDeleteAll` is kept for the caller's intent but no longer changes behavior —
   * an empty keep-list simply means every server row is an orphan.
   */
  async function deleteOrphans(table: string, keepIds: string[], _allowDeleteAll: boolean) {
    const keepSet = new Set(keepIds);
    const { data: serverRows, error: fetchErr } = await supabase!.from(table).select('id').eq('user_id', userId);
    if (fetchErr) {
      check(table, 'delete-orphans-fetch', { error: fetchErr });
      return;
    }
    const orphanIds = (serverRows || []).map((r: { id: string }) => r.id).filter((id: string) => !keepSet.has(id));
    if (orphanIds.length === 0) return;

    let deletedCount = 0;
    for (let i = 0; i < orphanIds.length; i += MAX_NOT_IN_IDS) {
      const batch = orphanIds.slice(i, i + MAX_NOT_IN_IDS);
      const res = await supabase!.from(table).delete().eq('user_id', userId).in('id', batch).select('id');
      check(table, 'delete-orphans', res);
      if (!res.error) deletedCount += (res.data?.length ?? 0);
    }

    // Verification: if we asked to remove N orphans but the DB removed 0 (and reported
    // no error), the DELETE was silently blocked by RLS. Surface it loudly and flag the
    // save as errored so a clobbering reload stays blocked and the user sees the banner.
    if (deletedCount === 0 && orphanIds.length > 0) {
      // eslint-disable-next-line no-console
      console.error(
        `[supabasePersistence] ⚠️ DELETE on "${table}" removed 0 of ${orphanIds.length} orphan row(s) with no error — ` +
          `the DELETE is being silently blocked by row-level security. Add a DELETE policy for the ` +
          `authenticated role (see docs/SUPABASE_SETUP.md §2b). Deleted items will keep reappearing until this is fixed.`,
        { table, orphanIds: orphanIds.slice(0, 10) }
      );
      errors.push({ table, op: 'delete-verify', error: `0 of ${orphanIds.length} rows deleted — DELETE RLS policy likely missing` });
    } else if (deletedCount < orphanIds.length) {
      // eslint-disable-next-line no-console
      console.warn(`[supabasePersistence] DELETE on "${table}" removed ${deletedCount} of ${orphanIds.length} orphan row(s).`);
    }
  }

  // Delete children first (FK order), then parents.
  // Skip orphan-delete for any table whose PHASE 1 upsert failed — deleting there could
  // remove rows that failed to (re-)upsert. allowDeleteAll uses UNFILTERED store counts so
  // a gcal-only user (empty keep-list purely from gcal filtering) isn't wiped.
  if (!failedTables.has('time_blocks')) await deleteOrphans('time_blocks', blockIds, true);
  if (!failedTables.has('events')) await deleteOrphans('events', eventIds, state.events.length === 0);
  if (!failedTables.has('tasks')) await deleteOrphans('tasks', taskIds, true);
  if (!failedTables.has('tags')) await deleteOrphans('tags', tagIds, true);
  if (!failedTables.has('categories')) await deleteOrphans('categories', categoryIds, state.categories.length === 0);
  if (!failedTables.has('calendar_containers')) await deleteOrphans('calendar_containers', containerIds, state.calendarContainers.length === 0);

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

  return { errors, failedTables };
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

/** Persist user preferences (weekStartsOnMonday, wakeTime, sleepTime) to Supabase. */
export async function persistUserPreferencesToSupabase(prefs: { week_starts_on_monday?: boolean; wake_time?: string; sleep_time?: string }) {
  if (!supabase) return;
  const userId = await getCurrentUserId();
  if (!userId) return;
  const { error } = await supabase
    .from('user_settings')
    .update(prefs)
    .eq('user_id', userId);
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[supabasePersistence] persistUserPreferencesToSupabase failed:', error);
  }
}

/** Subscribe to store changes and persist to Supabase for the current user. */
export function startSupabasePersistence() {
  if (!supabase || typeof window === 'undefined') return () => {};

  // Reset the loaded flag so saves are blocked until loadSupabaseState finishes.
  supabaseLoaded = false;

  let saving = false;
  let lastSaveHadErrors = false;
  let pendingSlice: PersistableState | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let lastSaveCompletedAt = 0; // timestamp of last successful save — used to ignore self-triggered reloads
  let lastLocalChangeAt = 0; // timestamp of last local store change — used to prevent stale reloads
  // Cache userId to avoid async getUser() call in beforeunload
  let cachedUserId: string | null = null;
  // Eagerly resolve userId so the realtime filter and first flush can use it.
  // Prefer the local session (no network) — falls back to server-validated getUser
  // only if the local session is missing (shouldn't normally happen at this point).
  void getCurrentUserIdLocal().then(async id => {
    if (id) { cachedUserId = id; return; }
    const fallback = await getCurrentUserId();
    if (fallback) cachedUserId = fallback;
  });

  async function flush(slice: PersistableState) {
    if (!supabaseLoaded) {
      // eslint-disable-next-line no-console
      console.warn('[supabasePersistence] ⚠️ Skipping save — supabaseLoaded is false');
      saving = false;
      return;
    }
    // Use the local cached JWT — a network blip on getUser() must not force-signout.
    const userId = cachedUserId ?? await getCurrentUserIdLocal();
    if (userId) cachedUserId = userId;
    if (!userId) {
      // No local session at all — user is genuinely signed out. Just skip the save;
      // the auth state listener will handle teardown.
      // eslint-disable-next-line no-console
      console.warn('[supabasePersistence] Skipping save — no local session.');
      saving = false;
      return;
    }
    // eslint-disable-next-line no-console
    const doneTasks = slice.tasks.filter(t => t.status === 'done').map(t => t.title);
    console.log('[supabasePersistence] Saving...', {
      tasks: slice.tasks.length,
      timeBlocks: slice.timeBlocks.length,
      events: slice.events.length,
      doneTasks,
    });
    try {
      const result = await saveSupabaseStateForUser(userId, slice);
      if (result && (result.errors.length > 0 || result.failedTables.size > 0)) {
        // Some upserts failed. Record the error and do NOT advance lastSaveCompletedAt,
        // so doReload's guard keeps blocking a clobbering reload. Change-triggered flushes
        // and the syncInterval will retry.
        lastSaveHadErrors = true;
        useStore.getState().setSaveError(true);
        // eslint-disable-next-line no-console
        console.warn('[supabasePersistence] Save completed WITH errors — reload stays blocked');
      } else {
        lastSaveHadErrors = false;
        lastSaveCompletedAt = Date.now();
        // eslint-disable-next-line no-console
        console.log('[supabasePersistence] Save completed OK');
        // Clear any previous error on success
        if (useStore.getState().saveError) useStore.getState().setSaveError(false);
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[supabasePersistence] Save THREW error', e);
      lastSaveHadErrors = true;
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

  function scheduleFlush(slice: PersistableState) {
    pendingSlice = slice;
    lastLocalChangeAt = Date.now();
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      if (!pendingSlice) return;
      const next = pendingSlice;
      pendingSlice = null;
      if (saving) {
        // A save is already in flight — re-queue so it picks up after
        pendingSlice = next;
        return;
      }
      saving = true;
      void flush(next);
    }, 500); // 500ms debounce — batches rapid changes (drag, typing)
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
      scheduleFlush(slice);
    }
  );

  // Flush pending saves before the user leaves the page
  const handleBeforeUnload = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    // If there's a pending slice that hasn't been saved yet, save it synchronously
    // using sendBeacon as a best-effort (Supabase REST upserts are too complex for
    // sendBeacon, so we do a synchronous XHR as last resort).
    const sliceToSave = pendingSlice;
    if (!sliceToSave || !cachedUserId || !supabaseLoaded) return;
    // Persist to localStorage immediately so the data survives even if Supabase
    // save doesn't complete in time.
    try {
      const state = useStore.getState();
      const localSlice = {
        tasks: state.tasks,
        timeBlocks: state.timeBlocks,
        calendarContainers: state.calendarContainers,
        categories: state.categories,
        tags: state.tags,
        events: state.events,
        viewMode: state.viewMode,
        view: state.view,
        selectedDate: state.selectedDate,
        containerVisibility: state.containerVisibility,
        defaultBlockMinutes: state.defaultBlockMinutes,
        weekStartsOnMonday: state.weekStartsOnMonday,
        wakeTime: state.wakeTime,
        sleepTime: state.sleepTime,
        hasCompletedSetup: state.hasCompletedSetup,
        userName: state.userName,
        onboardingTourComplete: state.onboardingTourComplete,
      };
      window.localStorage.setItem('timebox-state-v2', JSON.stringify(localSlice));
    } catch { /* ignore */ }
    // Fire the Supabase save (best-effort, browser may kill it)
    pendingSlice = null;
    saving = true;
    void flush(sliceToSave);
  };
  window.addEventListener('beforeunload', handleBeforeUnload);

  // When the browser comes back online, flush the current store to Supabase
  // so any edits made while offline are synced.
  const handleOnline = async () => {
    // eslint-disable-next-line no-console
    console.log('[supabasePersistence] Back online — syncing offline changes...');

    // If the app started offline, supabaseLoaded is still false because
    // loadSupabaseState was never called. Load now before flushing.
    if (!supabaseLoaded) {
      try {
        await loadSupabaseState(true);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[supabasePersistence] Failed to load after coming online', e);
        return;
      }
    }

    const state = useStore.getState();
    const slice: PersistableState = {
      tasks: state.tasks,
      timeBlocks: state.timeBlocks,
      calendarContainers: state.calendarContainers,
      categories: state.categories,
      tags: state.tags,
      events: state.events,
    };
    scheduleFlush(slice);
  };
  window.addEventListener('online', handleOnline);

  // Realtime: reload state when another client makes a change.
  // Queue changes while the tab is hidden and do ONE reload when it becomes visible.
  let reloadTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingRemoteChange = false;

  async function doReload() {
    // Skip if we're actively saving or have pending local changes — those changes
    // must complete first, otherwise we'd reload stale Supabase data and overwrite
    // (or lose) the user's edits.
    // Also skip if the last save had errors — DB may be missing data that exists locally.
    if (saving || pendingSlice || debounceTimer || lastSaveHadErrors) return;
    // Skip reloads triggered by our own recent changes — Realtime events from our own
    // writes can arrive before the DB is fully consistent (read-replica lag), causing
    // stale data to overwrite the local state (e.g. checked-off tasks reappearing).
    const now = Date.now();
    if (now - lastSaveCompletedAt < 5000 || now - lastLocalChangeAt < 5000) return;
    // eslint-disable-next-line no-console
    console.log('[supabasePersistence] Remote change detected, reloading...', {
      timeSinceLastSave: Date.now() - lastSaveCompletedAt,
      timeSinceLastChange: Date.now() - lastLocalChangeAt,
    });
    try { await loadSupabaseState(false); } catch (e) { console.error(e); }
  }

  function scheduleReload(payload: any) {
    // Only process changes for the current user (ignore other users' data)
    const eventUserId = payload?.new?.user_id || payload?.old?.user_id;
    if (eventUserId && cachedUserId && eventUserId !== cachedUserId) return;

    // If the tab is hidden, just note that a remote change happened.
    // We'll do one single reload when the user returns to the tab.
    if (document.hidden) {
      pendingRemoteChange = true;
      return;
    }
    if (reloadTimer) clearTimeout(reloadTimer);
    reloadTimer = setTimeout(doReload, 500);
  }

  const handleVisibilityChange = () => {
    // When tab becomes hidden, flush any pending save immediately
    if (document.hidden && pendingSlice && !saving) {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = null;
      const next = pendingSlice;
      pendingSlice = null;
      saving = true;
      void flush(next);
    }
    if (!document.hidden && pendingRemoteChange) {
      pendingRemoteChange = false;
      // Debounce slightly so multiple queued events collapse into one reload
      if (reloadTimer) clearTimeout(reloadTimer);
      reloadTimer = setTimeout(doReload, 600);
    }
  };
  document.addEventListener('visibilitychange', handleVisibilityChange);

  // Periodic sync fallback for Capacitor/mobile — realtime WebSocket may drop
  // when the app is backgrounded. Poll every 30s as a safety net.
  const syncInterval = setInterval(async () => {
    // Also bail while a save has unresolved errors — reloading would re-read the DB
    // (which still has the un-deleted / un-updated row) and clobber the local change,
    // making a deleted item "come back" moments later.
    if (!supabaseLoaded || saving || pendingSlice || debounceTimer || lastSaveHadErrors || document.hidden) return;
    const pollNow = Date.now();
    if (pollNow - lastSaveCompletedAt < 5000 || pollNow - lastLocalChangeAt < 5000) return;
    try { await loadSupabaseState(false); } catch { /* ignore */ }
  }, 30_000);

  // Realtime subscription — client-side filtering in scheduleReload validates user_id.
  // Server-side filter (`filter: user_id=eq.X`) would be ideal but cachedUserId
  // isn't available synchronously at subscription time, so we filter in the callback.
  const channel = supabase
    .channel('timebox-db-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, scheduleReload)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'time_blocks' }, scheduleReload)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, scheduleReload)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_containers' }, scheduleReload)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, scheduleReload)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tags' }, scheduleReload)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'user_settings' }, scheduleReload)
    .subscribe((status) => {
      // eslint-disable-next-line no-console
      if (status === 'CHANNEL_ERROR') console.warn('[supabasePersistence] Realtime channel error — will reconnect');
    });

  return () => {
    unsubscribeStore();
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('beforeunload', handleBeforeUnload);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    clearInterval(syncInterval);
    void supabase!.removeChannel(channel);
    if (reloadTimer) clearTimeout(reloadTimer);
    if (debounceTimer) clearTimeout(debounceTimer);
  };
}

