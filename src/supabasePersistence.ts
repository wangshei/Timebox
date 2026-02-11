import { supabase } from './supabaseClient';
import { useStore } from './store/useStore';
import type { Task, TimeBlock, CalendarContainer, Category, Tag, Event } from './types';

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
  if (!userId) return;

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
    console.error('[supabasePersistence] Load error', {
      containers: containersRes.error,
      categories: categoriesRes.error,
      tags: tagsRes.error,
      tasks: tasksRes.error,
      blocks: blocksRes.error,
      events: eventsRes.error,
    });
    return;
  }

  const containers = (containersRes.data ?? []) as any[];
  const categories = (categoriesRes.data ?? []) as any[];
  const tags = (tagsRes.data ?? []) as any[];
  const tasks = (tasksRes.data ?? []) as any[];
  const blocks = (blocksRes.data ?? []) as any[];
  const events = (eventsRes.data ?? []) as any[];

  useStore.setState((prev) => ({
    ...prev,
    calendarContainers: containers.map(
      (c): CalendarContainer => ({ id: c.id, name: c.name, color: c.color })
    ),
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
  }));
}

// --- Persist from Zustand store into Supabase ---

async function saveSupabaseStateForUser(userId: string, state: PersistableState) {
  if (!supabase) return;

  // Simple v1 strategy: replace all rows for this user with current store contents.
  // Order: child tables first, then parents, to avoid FK issues during delete/insert.
  await supabase.from('time_blocks').delete().eq('user_id', userId);
  await supabase.from('events').delete().eq('user_id', userId);
  await supabase.from('tasks').delete().eq('user_id', userId);
  await supabase.from('tags').delete().eq('user_id', userId);
  await supabase.from('categories').delete().eq('user_id', userId);
  await supabase.from('calendar_containers').delete().eq('user_id', userId);

  if (state.calendarContainers.length) {
    await supabase.from('calendar_containers').insert(
      state.calendarContainers.map((c) => ({
        id: c.id,
        user_id: userId,
        name: c.name,
        color: c.color,
      }))
    );
  }
  if (state.categories.length) {
    await supabase.from('categories').insert(
      state.categories.map((c) => ({
        id: c.id,
        user_id: userId,
        name: c.name,
        color: c.color,
        calendar_container_id: c.calendarContainerId ?? null,
      }))
    );
  }
  if (state.tags.length) {
    await supabase.from('tags').insert(
      state.tags.map((t) => ({
        id: t.id,
        user_id: userId,
        name: t.name,
        type: t.type ?? null,
        category_id: t.categoryId ?? null,
      }))
    );
  }
  if (state.tasks.length) {
    await supabase.from('tasks').insert(
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
    );
  }
  if (state.timeBlocks.length) {
    await supabase.from('time_blocks').insert(
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
    );
  }
  if (state.events.length) {
    await supabase.from('events').insert(
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
    );
  }
}

/** Subscribe to store changes and persist to Supabase for the current user. */
export function startSupabasePersistence() {
  if (!supabase || typeof window === 'undefined') return () => {};

  let currentUserId: string | null = null;
  let saving = false;

  const unsubscribe = useStore.subscribe<PersistableState>(
    (state) => ({
      tasks: state.tasks,
      timeBlocks: state.timeBlocks,
      calendarContainers: state.calendarContainers,
      categories: state.categories,
      tags: state.tags,
      events: state.events,
    }),
    async (slice) => {
      if (saving) return;
      const userId = await getCurrentUserId();
      if (!userId) return;
      currentUserId = userId;
      saving = true;
      try {
        await saveSupabaseStateForUser(userId, slice);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[supabasePersistence] Save error', e);
      } finally {
        saving = false;
      }
    }
  );

  return unsubscribe;
}

