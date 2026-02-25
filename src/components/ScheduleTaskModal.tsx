import React, { useState, useEffect } from 'react';
import { XMarkIcon } from '@heroicons/react/24/solid';

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

const inputClass = "w-full px-4 py-2 rounded-lg focus:outline-none transition-colors";
const inputStyle: React.CSSProperties = {
  backgroundColor: '#F5F1EB',
  border: '1px solid rgba(160,140,120,0.25)',
  color: '#2C2820',
};

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
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full md:max-w-md md:rounded-2xl rounded-t-2xl"
        style={{ backgroundColor: '#FDFBF8', boxShadow: '0 20px 60px rgba(44,40,32,0.18)' }}
      >
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid rgba(160,140,120,0.15)' }}
        >
          <h2 className="text-base font-semibold" style={{ color: '#2C2820' }}>
            Schedule{taskTitle ? `: ${taskTitle}` : ' task'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: '#A08C78' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(160,140,120,0.12)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: '#6B6058' }}>Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={inputClass}
              style={inputStyle}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: '#6B6058' }}>Start time</label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className={inputClass}
              style={inputStyle}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: '#6B6058' }}>
              Block length (minutes)
            </label>
            <input
              type="number"
              min={15}
              max={240}
              step={15}
              value={blockMinutes}
              onChange={(e) => setBlockMinutes(Number(e.target.value) || 60)}
              className={inputClass}
              style={inputStyle}
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl font-medium text-sm transition-colors"
              style={{ backgroundColor: 'rgba(160,140,120,0.1)', color: '#6B6058', border: '1px solid rgba(160,140,120,0.2)' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(160,140,120,0.18)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(160,140,120,0.1)'; }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2.5 text-white rounded-xl font-medium text-sm transition-colors"
              style={{ backgroundColor: '#5B9BAD' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#4A8A9C'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#5B9BAD'; }}
            >
              Schedule
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
