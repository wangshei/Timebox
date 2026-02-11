import React, { useMemo, useState } from 'react';
import { Task, Category, Tag } from '../App';
import { TaskCard } from './TaskCard';
import { Plus, Square } from 'lucide-react';
import type { TimeBlock } from '../types';

interface RightSidebarProps {
  tasks: Task[];
  unscheduledTasks: Task[];
  partiallyCompletedTasks: Task[];
  fixedMissedTasks?: Task[];
  selectedDate?: string;
  timeBlocks?: TimeBlock[];
  categories: Category[];
  tags: Tag[];
  onAddTask: (task: {
    title: string;
    estimatedHours: number;
    category: Category;
    tags: Tag[];
    calendar: 'personal' | 'work' | 'school';
  }) => void;
  onOpenScheduleTask?: (taskId: string) => void;
  onEditTask?: (taskId: string) => void;
  onDeleteTask?: (taskId: string) => void;
  onOpenAddModal?: (mode: 'task' | 'event') => void;
  /** When a block is dropped from the calendar, unschedule it (remove from calendar). */
  onDropBlock?: (blockId: string) => void;
  isMobile?: boolean;
  isBottomSheet?: boolean;
}

export type TaskViewMode = 'overview' | 'plan';

export function RightSidebar({ tasks, unscheduledTasks, partiallyCompletedTasks, fixedMissedTasks = [], selectedDate = new Date().toISOString().split('T')[0], timeBlocks, categories, tags, onAddTask, onOpenScheduleTask, onEditTask, onDeleteTask, onOpenAddModal, onDropBlock, isMobile = false, isBottomSheet = false }: RightSidebarProps) {
  const [viewMode, setViewMode] = useState<TaskViewMode>('overview');
  const [overviewRange, setOverviewRange] = useState<'today' | 'week' | 'month'>('today');
  const [isDragOverBlock, setIsDragOverBlock] = useState(false);

  const dateSet = useMemo(() => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const base = new Date(y, (m ?? 1) - 1, d ?? 1);
    if (overviewRange === 'today') return new Set([selectedDate]);
    if (overviewRange === 'week') {
      const start = new Date(base);
      start.setDate(base.getDate() - base.getDay());
      const s = new Set<string>();
      for (let i = 0; i < 7; i++) {
        const di = new Date(start);
        di.setDate(start.getDate() + i);
        s.add(di.toISOString().slice(0, 10));
      }
      return s;
    }
    // month
    const s = new Set<string>();
    const first = new Date(base.getFullYear(), base.getMonth(), 1);
    const next = new Date(base.getFullYear(), base.getMonth() + 1, 1);
    for (let dt = new Date(first); dt < next; dt.setDate(dt.getDate() + 1)) {
      s.add(dt.toISOString().slice(0, 10));
    }
    return s;
  }, [selectedDate, overviewRange]);

  const taskIdsInRange = useMemo(() => {
    const set = new Set<string>();
    (timeBlocks ?? []).forEach((b) => {
      if (b.taskId && dateSet.has(b.date)) set.add(b.taskId);
    });
    return set;
  }, [timeBlocks, dateSet]);

  const filteredPartially = useMemo(() => {
    if (viewMode !== 'overview' || !timeBlocks) return partiallyCompletedTasks;
    return partiallyCompletedTasks.filter((t) => taskIdsInRange.has(t.id));
  }, [partiallyCompletedTasks, taskIdsInRange, timeBlocks, viewMode]);

  const filteredFixed = useMemo(() => {
    if (viewMode !== 'overview' || !timeBlocks) return fixedMissedTasks;
    return fixedMissedTasks.filter((t) => taskIdsInRange.has(t.id));
  }, [fixedMissedTasks, taskIdsInRange, timeBlocks, viewMode]);

  const handleDragOver = (e: React.DragEvent) => {
    if (!onDropBlock || !e.dataTransfer.types.includes('application/x-timebox-block-id')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsDragOverBlock(true);
  };
  const handleDragLeave = () => setIsDragOverBlock(false);
  const handleDrop = (e: React.DragEvent) => {
    const blockId = e.dataTransfer.getData('application/x-timebox-block-id');
    setIsDragOverBlock(false);
    if (onDropBlock && blockId) {
      e.preventDefault();
      onDropBlock(blockId);
    }
  };

  return (
    <div
      className={`bg-white flex flex-col overflow-hidden ${
        isBottomSheet ? 'h-full' : isMobile ? 'w-full border-l border-neutral-200' : 'w-80 border-l border-neutral-200'
      } ${isDragOverBlock ? 'ring-2 ring-inset ring-blue-300 bg-blue-50/50' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Mode Toggle + Overview range */}
      <div className={`border-b border-neutral-200 ${isBottomSheet ? 'px-4 py-3' : 'px-6 py-3'}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <span>Overview</span>
            <button
              type="button"
              onClick={() => setViewMode(viewMode === 'overview' ? 'plan' : 'overview')}
              className={`inline-flex items-center justify-center w-6 h-6 rounded border transition-all ${
                viewMode === 'plan'
                  ? 'bg-blue-50 border-blue-500 text-blue-700'
                  : 'bg-neutral-50 border-neutral-200 text-neutral-400'
              }`}
              title="Toggle planning blocks"
            >
              <Square className="w-3.5 h-3.5" />
            </button>
          </div>
          {viewMode === 'overview' && (
            <div className="flex rounded-lg bg-neutral-100 p-0.5">
              <button
                type="button"
                onClick={() => setOverviewRange('today')}
                className={`px-2 py-0.5 text-[11px] font-medium rounded-md transition-all ${
                  overviewRange === 'today' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setOverviewRange('week')}
                className={`px-2 py-0.5 text-[11px] font-medium rounded-md transition-all ${
                  overviewRange === 'week' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                Week
              </button>
              <button
                type="button"
                onClick={() => setOverviewRange('month')}
                className={`px-2 py-0.5 text-[11px] font-medium rounded-md transition-all ${
                  overviewRange === 'month' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                Month
              </button>
            </div>
          )}
        </div>
      </div>

      <div className={`flex-1 overflow-y-auto space-y-6 ${isBottomSheet ? 'px-4 py-4 pb-6' : 'p-6 pb-8'}`}>
        {/* Unscheduled Tasks */}
        <div>
          <h2 className="text-sm font-medium text-neutral-500 mb-4">Unscheduled Tasks</h2>
          <div className={viewMode === 'plan' ? 'space-y-2' : 'space-y-3'}>
            {unscheduledTasks.length === 0 ? (
              <p className="text-sm text-neutral-400">No unscheduled tasks</p>
            ) : (
              unscheduledTasks.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  viewMode={viewMode}
                  onScheduleTask={onOpenScheduleTask ? () => onOpenScheduleTask(task.id) : undefined}
                  onEditTask={onEditTask ? () => onEditTask(task.id) : undefined}
                  onDeleteTask={onDeleteTask ? () => onDeleteTask(task.id) : undefined}
                />
              ))
            )}
          </div>
        </div>

        {/* Partially Completed */}
        {partiallyCompletedTasks.length > 0 && (
          <div>
            <h2 className="text-sm font-medium text-neutral-500 mb-4">Partially Completed</h2>
            <div className={viewMode === 'plan' ? 'space-y-2' : 'space-y-3'}>
              {filteredPartially.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  viewMode={viewMode}
                  onScheduleTask={onOpenScheduleTask ? () => onOpenScheduleTask(task.id) : undefined}
                  onEditTask={onEditTask ? () => onEditTask(task.id) : undefined}
                  onDeleteTask={onDeleteTask ? () => onDeleteTask(task.id) : undefined}
                />
              ))}
            </div>
          </div>
        )}

        {/* Fixed / Missed */}
        {fixedMissedTasks.length > 0 && (
          <div>
            <h2 className="text-sm font-medium text-neutral-500 mb-4">Fixed / Missed</h2>
            <div className={viewMode === 'plan' ? 'space-y-2' : 'space-y-3'}>
              {filteredFixed.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  viewMode={viewMode}
                  onScheduleTask={onOpenScheduleTask ? () => onOpenScheduleTask(task.id) : undefined}
                  onEditTask={onEditTask ? () => onEditTask(task.id) : undefined}
                  onDeleteTask={onDeleteTask ? () => onDeleteTask(task.id) : undefined}
                />
              ))}
            </div>
          </div>
        )}

        {/* Events */}
        <div>
          <h2 className="text-sm font-medium text-neutral-500 mb-4">Events</h2>
          <div className="text-sm text-neutral-400 text-center py-4">
            No upcoming events
          </div>
        </div>
      </div>
    </div>
  );
}