import React from 'react';
import type { Category } from '../types';

interface CategoryFocusListProps {
  categories: Category[];
  focusedCategoryId: string | null;
  onFocusCategory: (id: string) => void;
}

/** Click a category to exaggerate its blocks and mute others; click again to clear. */
export function CategoryFocusList({
  categories,
  focusedCategoryId,
  onFocusCategory,
}: CategoryFocusListProps) {
  return (
    <div className="space-y-0.5">
      <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">
        Categories (click to focus)
      </h3>
      {categories.map((cat) => (
        <button
          key={cat.id}
          type="button"
          onClick={() => onFocusCategory(cat.id)}
          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-sm transition-colors ${
            focusedCategoryId === cat.id ? 'bg-neutral-200 text-neutral-900' : 'hover:bg-neutral-50 text-neutral-700'
          }`}
        >
          <div
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: cat.color }}
          />
          <span className="flex-1 truncate">{cat.name}</span>
        </button>
      ))}
    </div>
  );
}
