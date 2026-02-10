import React, { useState } from 'react';
import { CalendarView } from './components/CalendarView';
import { DraggableBottomSheet } from './components/DraggableBottomSheet';
import { RightSidebar } from './components/RightSidebar';
import { AddModal } from './components/AddModal';

export type Mode = 'planning' | 'recording';
export type View = 'day' | 'week' | 'month';

export interface Category {
  id: string;
  name: string;
  color: string;
}

export interface Tag {
  id: string;
  name: string;
}

export interface TimeBlock {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  date: string; // Add date field for weekly/monthly views
  category: Category;
  tags: Tag[];
  type: 'planned' | 'recorded';
  calendar: 'personal' | 'work' | 'school';
}

export interface Task {
  id: string;
  title: string;
  estimatedHours: number;
  recordedHours: number;
  category: Category;
  tags: Tag[];
  calendar: 'personal' | 'work' | 'school';
}

export default function App() {
  const [mode, setMode] = useState<Mode>('planning');
  const [view, setView] = useState<View>('day');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addModalMode, setAddModalMode] = useState<'task' | 'event'>('task');

  // Sample categories
  const categories: Category[] = [
    { id: '1', name: 'Deep Work', color: '#0044A8' },
    { id: '2', name: 'Meetings', color: '#9F5FB0' },
    { id: '3', name: 'Exercise', color: '#13B49F' },
    { id: '4', name: 'Learning', color: '#EC8309' },
  ];

  // Sample tags
  const tags: Tag[] = [
    { id: '1', name: 'Urgent' },
    { id: '2', name: 'Client work' },
    { id: '3', name: 'Personal' },
  ];

  // Sample time blocks
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([
    {
      id: '1',
      title: 'Morning workout',
      startTime: '07:00',
      endTime: '08:00',
      date: '2026-02-10',
      category: categories[2],
      tags: [tags[2]],
      type: 'planned',
      calendar: 'personal',
    },
    {
      id: '2',
      title: 'Client presentation prep',
      startTime: '09:00',
      endTime: '11:00',
      date: '2026-02-10',
      category: categories[0],
      tags: [tags[0], tags[1]],
      type: 'planned',
      calendar: 'work',
    },
    {
      id: '3',
      title: 'Team standup',
      startTime: '11:00',
      endTime: '11:30',
      date: '2026-02-10',
      category: categories[1],
      tags: [tags[1]],
      type: 'recorded',
      calendar: 'work',
    },
    {
      id: '4',
      title: 'Lunch break',
      startTime: '12:00',
      endTime: '13:00',
      date: '2026-02-10',
      category: categories[2],
      tags: [],
      type: 'recorded',
      calendar: 'personal',
    },
    {
      id: '5',
      title: 'Code review',
      startTime: '14:00',
      endTime: '15:30',
      date: '2026-02-10',
      category: categories[0],
      tags: [tags[1]],
      type: 'planned',
      calendar: 'work',
    },
    {
      id: '6',
      title: 'Design review',
      startTime: '10:00',
      endTime: '11:00',
      date: '2026-02-11',
      category: categories[1],
      tags: [tags[1]],
      type: 'planned',
      calendar: 'work',
    },
    {
      id: '7',
      title: 'Team workshop',
      startTime: '14:00',
      endTime: '16:00',
      date: '2026-02-12',
      category: categories[0],
      tags: [tags[0], tags[1]],
      type: 'planned',
      calendar: 'work',
    },
    {
      id: '8',
      title: 'Evening run',
      startTime: '18:00',
      endTime: '19:00',
      date: '2026-02-13',
      category: categories[2],
      tags: [tags[2]],
      type: 'planned',
      calendar: 'personal',
    },
  ]);

  // Sample tasks
  const [tasks, setTasks] = useState<Task[]>([
    {
      id: '1',
      title: 'Finish Q1 report',
      estimatedHours: 3,
      recordedHours: 0,
      category: categories[0],
      tags: [tags[0], tags[1]],
      calendar: 'work',
    },
    {
      id: '2',
      title: 'Update portfolio website',
      estimatedHours: 4,
      recordedHours: 1.5,
      category: categories[3],
      tags: [tags[2]],
      calendar: 'personal',
    },
    {
      id: '3',
      title: 'Read React documentation',
      estimatedHours: 2,
      recordedHours: 0,
      category: categories[3],
      tags: [tags[2]],
      calendar: 'personal',
    },
    {
      id: '4',
      title: 'Plan team offsite',
      estimatedHours: 1.5,
      recordedHours: 0.5,
      category: categories[1],
      tags: [tags[1]],
      calendar: 'work',
    },
  ]);

  // Calculate time spent by category for today
  const recordedBlocks = timeBlocks.filter(block => block.type === 'recorded');
  const timeByCategory = categories.map(category => {
    const categoryBlocks = recordedBlocks.filter(block => block.category.id === category.id);
    const totalMinutes = categoryBlocks.reduce((sum, block) => {
      const start = parseTime(block.startTime);
      const end = parseTime(block.endTime);
      return sum + (end - start);
    }, 0);
    return {
      category,
      hours: totalMinutes / 60,
    };
  }).filter(item => item.hours > 0);

  const handleAddTask = (taskData: {
    title: string;
    estimatedHours: number;
    category: Category;
    tags: Tag[];
    calendar: 'personal' | 'work' | 'school';
  }) => {
    const newTask: Task = {
      id: String(Date.now()),
      title: taskData.title,
      estimatedHours: taskData.estimatedHours,
      recordedHours: 0,
      category: taskData.category,
      tags: taskData.tags,
      calendar: taskData.calendar,
    };
    setTasks(prev => [...prev, newTask]);
  };

  const handleAddEvent = (eventData: {
    title: string;
    startTime: string;
    endTime: string;
    date: string;
    category: Category;
    tags: Tag[];
    calendar: 'personal' | 'work' | 'school';
  }) => {
    const newEvent: TimeBlock = {
      id: String(Date.now()),
      title: eventData.title,
      startTime: eventData.startTime,
      endTime: eventData.endTime,
      date: eventData.date,
      category: eventData.category,
      tags: eventData.tags,
      type: 'planned',
      calendar: eventData.calendar,
    };
    setTimeBlocks(prev => [...prev, newEvent]);
  };

  const handleOpenAddModal = (modalMode: 'task' | 'event' = 'task') => {
    setAddModalMode(modalMode);
    setIsAddModalOpen(true);
  };

  return (
    <div className="h-screen w-full bg-neutral-50 flex flex-col overflow-hidden">
      {/* Desktop Layout - 3 columns */}
      <div className="hidden lg:flex flex-1 overflow-hidden">
        <div className="w-72 bg-white border-r border-neutral-200 flex flex-col p-6">
          {/* Mode Toggle */}
          <div className="mb-8">
            <div className="bg-neutral-100 rounded-full p-1 flex">
              <button
                onClick={() => setMode('planning')}
                className={`flex-1 py-2.5 px-4 rounded-full transition-all ${
                  mode === 'planning'
                    ? 'bg-white text-neutral-900 shadow-sm'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                Planning
              </button>
              <button
                onClick={() => setMode('recording')}
                className={`flex-1 py-2.5 px-4 rounded-full transition-all ${
                  mode === 'recording'
                    ? 'bg-white text-neutral-900 shadow-sm'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                Recording
              </button>
            </div>
          </div>

          {/* Today Summary */}
          <div className="flex-1">
            <h2 className="text-sm font-medium text-neutral-500 mb-4">Today</h2>
            
            {timeByCategory.length > 0 ? (
              <div className="space-y-4">
                {timeByCategory.map(({ category, hours }) => {
                  const totalHours = timeByCategory.reduce((sum, item) => sum + item.hours, 0);
                  const percentage = (hours / totalHours) * 100;
                  return (
                    <div key={category.id} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: category.color }}
                          />
                          <span className="text-sm text-neutral-700">{category.name}</span>
                        </div>
                        <span className="text-sm text-neutral-500">{hours.toFixed(1)}h</span>
                      </div>
                      <div className="w-full bg-neutral-100 rounded-full h-2 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${percentage}%`,
                            backgroundColor: category.color,
                            opacity: 0.8,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
                
                <div className="pt-4 mt-4 border-t border-neutral-200">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-neutral-700">Total</span>
                    <span className="text-sm font-medium text-neutral-900">
                      {timeByCategory.reduce((sum, item) => sum + item.hours, 0).toFixed(1)}h
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-neutral-400 text-center py-8">
                No time recorded yet
              </div>
            )}
          </div>
        </div>

        <CalendarView 
          mode={mode} 
          view={view} 
          onViewChange={setView} 
          timeBlocks={timeBlocks}
          onOpenAddModal={handleOpenAddModal}
        />
        
        <RightSidebar tasks={tasks} categories={categories} tags={tags} onAddTask={handleAddTask} />
      </div>

      {/* Mobile Layout - Calendar with draggable bottom sheet */}
      <div className="flex lg:hidden flex-1 overflow-hidden relative">
        <CalendarView 
          mode={mode}
          onModeChange={setMode}
          view={view} 
          onViewChange={setView} 
          timeBlocks={timeBlocks}
          isMobile
          onOpenAddModal={handleOpenAddModal}
        />
        <DraggableBottomSheet tasks={tasks} categories={categories} tags={tags} onAddTask={handleAddTask} onOpenAddModal={handleOpenAddModal} />
      </div>

      {/* Add Modal - Global */}
      <AddModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        categories={categories}
        tags={tags}
        initialMode={addModalMode}
        onAddTask={handleAddTask}
        onAddEvent={handleAddEvent}
      />
    </div>
  );
}

function parseTime(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}