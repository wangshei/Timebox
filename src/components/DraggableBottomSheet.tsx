import React, { useState, useRef, useEffect } from 'react';
import { Bars3Icon } from '@heroicons/react/24/solid';
import { Task, Category, Tag } from '../App';
import { RightSidebar } from './RightSidebar';
import type { TimeBlock } from '../types';

interface DraggableBottomSheetProps {
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
  onOpenAddModal: (mode: 'task' | 'event') => void;
  onDropBlock?: (blockId: string) => void;
  onBreakIntoChunks?: (taskId: string, chunkMinutes: number) => void;
  onSplitTask?: (taskId: string, chunkMinutes: number) => void;
}

export function DraggableBottomSheet({ tasks, unscheduledTasks, partiallyCompletedTasks, fixedMissedTasks = [], selectedDate, timeBlocks, categories, tags, onAddTask, onOpenScheduleTask, onEditTask, onDeleteTask, onOpenAddModal, onDropBlock, onBreakIntoChunks, onSplitTask }: DraggableBottomSheetProps) {
  const maxHeight = typeof window !== 'undefined' ? window.innerHeight * 0.85 : 600;
  const halfHeight = typeof window !== 'undefined' ? window.innerHeight * 0.5 : 400;
  const minHeight = 80;
  
  const [height, setHeight] = useState(halfHeight); // Start at half screen
  const [isDragging, setIsDragging] = useState(false);
  const [startY, setStartY] = useState(0);
  const [startHeight, setStartHeight] = useState(0);
  const sheetRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true);
    setStartY(e.touches[0].clientY);
    setStartHeight(height);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    
    const currentY = e.touches[0].clientY;
    const deltaY = startY - currentY; // Positive when dragging up
    const newHeight = Math.min(Math.max(startHeight + deltaY, minHeight), maxHeight);
    setHeight(newHeight);
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    
    // Snap to positions
    if (height < 150) {
      setHeight(minHeight);
    } else if (height < halfHeight - 50) {
      setHeight(halfHeight * 0.5); // Quarter screen
    } else if (height < halfHeight + 50) {
      setHeight(halfHeight); // Half screen
    } else {
      setHeight(maxHeight); // Almost full screen
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setStartY(e.clientY);
    setStartHeight(height);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      
      const deltaY = startY - e.clientY;
      const newHeight = Math.min(Math.max(startHeight + deltaY, minHeight), maxHeight);
      setHeight(newHeight);
    };

    const handleMouseUp = () => {
      if (!isDragging) return;
      setIsDragging(false);
      
      // Snap to positions
      if (height < 150) {
        setHeight(minHeight);
      } else if (height < halfHeight - 50) {
        setHeight(halfHeight * 0.5);
      } else if (height < halfHeight + 50) {
        setHeight(halfHeight);
      } else {
        setHeight(maxHeight);
      }
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, startY, startHeight, height, maxHeight, halfHeight]);

  return (
    <div
      ref={sheetRef}
      className="fixed bottom-0 left-0 right-0 bg-white border-t border-neutral-200 rounded-t-2xl shadow-2xl transition-shadow lg:hidden flex flex-col"
      style={{
        height: `${height}px`,
        touchAction: 'none',
      }}
    >
      {/* Drag Handle */}
      <div
        className="flex items-center justify-center py-3 cursor-grab active:cursor-grabbing flex-shrink-0"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
      >
        <div className="w-12 h-1.5 bg-neutral-300 rounded-full" />
      </div>

      {/* Content - scrollable */}
      <div className="flex-1 overflow-hidden">
        <RightSidebar tasks={tasks} unscheduledTasks={unscheduledTasks} partiallyCompletedTasks={partiallyCompletedTasks} fixedMissedTasks={fixedMissedTasks} selectedDate={selectedDate} timeBlocks={timeBlocks} categories={categories} tags={tags} onAddTask={onAddTask} onOpenScheduleTask={onOpenScheduleTask} onEditTask={onEditTask} onDeleteTask={onDeleteTask} onOpenAddModal={onOpenAddModal} onDropBlock={onDropBlock} onBreakIntoChunks={onBreakIntoChunks} onSplitTask={onSplitTask} isMobile isBottomSheet />
      </div>
    </div>
  );
}