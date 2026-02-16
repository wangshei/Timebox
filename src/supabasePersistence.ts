import { supabase } from './supabaseClient';
import { useStore } from './store/useStore';
import { DEFAULT_PALETTE_COLOR } from './constants/colors';
import type { Task, TimeBlock, CalendarContainer, Category, Tag, Event } from './types';

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

  const [containersRes, categoriesRes, tagsRes, tasksRes, blocksRes, eventsRes] = await Promise.all([
    supabase.from('calendar_containers').select('*').eq('user_id', userId),
    supabase.from('categories').select('*').eq('user_id', userId),
    supabase.from('tags').select('*').eq('user_id', userId),
    supabase.from('tasks').select('*').eq('user_id', userId),
    supabase.from('time_blocks').select('*').eq('user_id', userId),
    supabase.from('events').select('*').eq('user_id', userId),
  ]);

  const hasError =
    containersRes.error ||
    categoriesRes.error ||
    tagsRes.error ||
    tasksRes.error ||
    blocksRes.error ||
    eventsRes.error;
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

  let containers = (containersRes.data ?? []) as any[];
  let categories = (categoriesRes.data ?? []) as any[];
  const tags = (tagsRes.data ?? []) as any[];
  const tasks = (tasksRes.data ?? []) as any[];
  const blocks = (blocksRes.data ?? []) as any[];
  const events = (eventsRes.data ?? []) as any[];

  // New user: give them a default Personal calendar + a General category so
  // they can start adding tasks/events immediately. The persistence
  // subscription (started before this function) will save these to Supabase.
  if (containers.length === 0) {
    const defaultCalId = generateId();
    containers = [
      { id: defaultCalId, name: 'Personal', color: DEFAULT_PALETTE_COLOR },
    ];
    if (categories.length === 0) {
      categories = [
        { id: generateId(), name: 'General', color: DEFAULT_PALETTE_COLOR, calendar_container_id: defaultCalId },
      ];
    }
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
      calendarContainers,
      containerVisibility: visibility,
      categories: categories.map(
      (c): Category => ({
        id: c.id,
        name: c.name,
        color: c.color,
        calendarContainerId: c.calendar_container_id ?? null,
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
      })
    ),
    };
  });
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

  // Delete child tables first, then parents, to avoid FK issues.
  check('time_blocks', 'delete', await supabase.from('time_blocks').delete().eq('user_id', userId));
  check('events', 'delete', await supabase.from('events').delete().eq('user_id', userId));
  check('tasks', 'delete', await supabase.from('tasks').delete().eq('user_id', userId));
  check('tags', 'delete', await supabase.from('tags').delete().eq('user_id', userId));
  check('categories', 'delete', await supabase.from('categories').delete().eq('user_id', userId));
  check('calendar_containers', 'delete', await supabase.from('calendar_containers').delete().eq('user_id', userId));

  // Bail early if deletes failed (e.g. missing RLS policies) — don't lose data by inserting partial state.
  if (errors.length > 0) {
    // eslint-disable-next-line no-console
    console.error('[supabasePersistence] Aborting inserts due to delete errors — check RLS policies and table existence');
    return;
  }

  // Insert parent tables first, then children, to satisfy FK constraints.
  if (state.calendarContainers.length) {
    check('calendar_containers', 'insert', await supabase.from('calendar_containers').insert(
      state.calendarContainers.map((c) => ({
        id: c.id,
        user_id: userId,
        name: c.name,
        color: c.color,
      }))
    ));
  }
  if (state.categories.length) {
    check('categories', 'insert', await supabase.from('categories').insert(
      state.categories.map((c) => ({
        id: c.id,
        user_id: userId,
        name: c.name,
        color: c.color,
        calendar_container_id: c.calendarContainerId ?? null,
      }))
    ));
  }
  if (state.tags.length) {
    check('tags', 'insert', await supabase.from('tags').insert(
      state.tags.map((t) => ({
        id: t.id,
        user_id: userId,
        name: t.name,
        type: t.type ?? null,
        category_id: t.categoryId ?? null,
      }))
    ));
  }
  if (state.tasks.length) {
    check('tasks', 'insert', await supabase.from('tasks').insert(
      state.tasks.map((t) => ({
        id: t.id,
        user_id: userId,
        title: t.title,
        estimated_minutes: t.estimatedMinutes,
        calendar_container_id: t.calendarContainerId,
        category_id: t.categoryId,
        tag_ids: t.tagIds,
        flexible: t.flexible,
        status: t.status ?? null,
      }))
    ));
  }
  if (state.timeBlocks.length) {
    check('time_blocks', 'insert', await supabase.from('time_blocks').insert(
      state.timeBlocks.map((b) => ({
        id: b.id,
        user_id: userId,
        task_id: b.taskId ?? null,
        title: b.title ?? null,
        calendar_container_id: b.calendarContainerId,
        category_id: b.categoryId,
        tag_ids: b.tagIds,
        start: b.start,
        end: b.end,
        date: b.date,
        mode: b.mode,
        source: b.source,
      }))
    ));
  }
  if (state.events.length) {
    check('events', 'insert', await supabase.from('events').insert(
      state.events.map((e) => ({
        id: e.id,
        user_id: userId,
        title: e.title,
        calendar_container_id: e.calendarContainerId,
        category_id: e.categoryId,
        start: e.start,
        end: e.end,
        date: e.date,
        recurring: e.recurring,
        recurrence_pattern: e.recurrencePattern ?? null,
      }))
    ));
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

/** Subscribe to store changes and persist to Supabase for the current user. */
export function startSupabasePersistence() {
  if (!supabase || typeof window === 'undefined') return () => {};

  let saving = false;
  let pendingSlice: PersistableState | null = null;

  async function flush(slice: PersistableState) {
    const userId = await getCurrentUserId();
    if (!userId) return;
    saving = true;
    try {
      await saveSupabaseStateForUser(userId, slice);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[supabasePersistence] Save error', e);
    } finally {
      saving = false;
      // If the store changed while we were saving, save the latest state now.
      if (pendingSlice) {
        const next = pendingSlice;
        pendingSlice = null;
        void flush(next);
      }
    }
  }

  const unsubscribe = useStore.subscribe<PersistableState>(
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
        // Queue latest state so it's saved after the current save completes.
        pendingSlice = slice;
        return;
      }
      void flush(slice);
    }
  );

  return unsubscribe;
}

