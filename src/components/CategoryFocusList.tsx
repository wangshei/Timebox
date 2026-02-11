import React from 'react';
import type { Category } from '../types';

interface CategoryFocusListProps {
  categories: Category[];
  focusedCategoryId: string | null;
  onFocusCategory: (id: string) => void;
  /** Notion-like: tighter rows, left-aligned */
  compact?: boolean;
}

/** Click a category to exaggerate its blocks and mute others; click again to clear. */
export function CategoryFocusList({
  categories,
  focusedCategoryId,
  onFocusCategory,
  compact = false,
}: CategoryFocusListProps) {
  return (
    <div className="space-y-0.5">
      {categories.map((cat) => (
        <button
          key={cat.id}
          type="button"
          onClick={() => onFocusCategory(cat.id)}
          className={`w-full flex items-center gap-2 px-1.5 py-1 rounded text-left text-sm transition-colors min-w-0 ${
            focusedCategoryId === cat.id ? 'bg-neutral-100 text-neutral-900' : 'hover:bg-neutral-50 text-neutral-700'
          }`}
        >
          <div
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: cat.color }}
          />
          <span className="flex-1 truncate text-left">{cat.name}</span>
        </button>
      ))}
    </div>
  );
}
