import React, { useState } from 'react';
import { Task, Category, Tag } from '../App';
import { TaskCard } from './TaskCard';
import { Plus } from 'lucide-react';

interface RightSidebarProps {
  tasks: Task[];
  unscheduledTasks: Task[];
  partiallyCompletedTasks: Task[];
  selectedDate?: string;
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
  isMobile?: boolean;
  isBottomSheet?: boolean;
}

export type TaskViewMode = 'overview' | 'plan';

export function RightSidebar({ tasks, unscheduledTasks, partiallyCompletedTasks, selectedDate = new Date().toISOString().split('T')[0], categories, tags, onAddTask, onOpenScheduleTask, onEditTask, onDeleteTask, onOpenAddModal, isMobile = false, isBottomSheet = false }: RightSidebarProps) {
  const [viewMode, setViewMode] = useState<TaskViewMode>('overview');
  
  return (
    <div className={`bg-white flex flex-col overflow-hidden ${
      isBottomSheet ? 'h-full' : isMobile ? 'w-full border-l border-neutral-200' : 'w-80 border-l border-neutral-200'
    }`}>
      {/* Mode Toggle */}
      <div className={`border-b border-neutral-200 ${isBottomSheet ? 'px-4 py-3' : 'px-6 py-4'}`}>
        <div className="bg-neutral-100 rounded-lg p-1 flex">
          <button
            onClick={() => setViewMode('overview')}
            className={`flex-1 py-1.5 px-3 text-sm rounded-md transition-all ${
              viewMode === 'overview'
                ? 'bg-white text-neutral-900 shadow-sm'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setViewMode('plan')}
            className={`flex-1 py-1.5 px-3 text-sm rounded-md transition-all ${
              viewMode === 'plan'
                ? 'bg-white text-neutral-900 shadow-sm'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            Plan
          </button>
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
              {partiallyCompletedTasks.map(task => (
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