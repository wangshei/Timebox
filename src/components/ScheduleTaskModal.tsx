import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';

export interface ScheduleTaskParams {
  date: string;
  startTime: string;
  blockMinutes?: number;
}

interface ScheduleTaskModalProps {
  isOpen: boolean;
  taskTitle?: string;
  defaultDate: string;
  defaultStartTime: string;
  defaultBlockMinutes: number;
  onSchedule: (params: ScheduleTaskParams) => void;
  onClose: () => void;
}

export function ScheduleTaskModal({
  isOpen,
  taskTitle,
  defaultDate,
  defaultStartTime,
  defaultBlockMinutes,
  onSchedule,
  onClose,
}: ScheduleTaskModalProps) {
  const [date, setDate] = useState(defaultDate);
  const [startTime, setStartTime] = useState(defaultStartTime);
  const [blockMinutes, setBlockMinutes] = useState(defaultBlockMinutes);

  useEffect(() => {
    if (isOpen) {
      setDate(defaultDate);
      setStartTime(defaultStartTime);
      setBlockMinutes(defaultBlockMinutes);
    }
  }, [isOpen, defaultDate, defaultStartTime, defaultBlockMinutes]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSchedule({ date, startTime, blockMinutes });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full md:max-w-md md:rounded-2xl rounded-t-2xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
          <h2 className="text-lg font-medium text-neutral-900">
            Schedule task{taskTitle ? `: ${taskTitle}` : ''}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-neutral-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-neutral-500" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Start time</label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Block length (minutes)
            </label>
            <input
              type="number"
              min={15}
              max={240}
              step={15}
              value={blockMinutes}
              onChange={(e) => setBlockMinutes(Number(e.target.value) || 60)}
              className="w-full px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-neutral-100 text-neutral-700 rounded-lg hover:bg-neutral-200 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              Schedule
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
