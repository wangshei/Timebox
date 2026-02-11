import React from 'react';
import { Folder } from 'lucide-react';
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
          className={`w-full flex items-center gap-2 pl-2 pr-1.5 py-1.5 rounded-r text-left text-sm transition-colors min-w-0 border-l-[3px] ${
            focusedCategoryId === cat.id ? 'text-neutral-900 font-medium' : 'text-neutral-700 hover:opacity-90'
          }`}
          style={{ borderLeftColor: cat.color, backgroundColor: `${cat.color}18` }}
        >
          <Folder className="w-3.5 h-3.5 text-neutral-500 flex-shrink-0" />
          <span className="flex-1 truncate">{cat.name}</span>
        </button>
      ))}
    </div>
  );
}
