import React from 'react';
import { FolderIcon } from '@heroicons/react/24/solid';
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
}: CategoryFocusListProps) {
  return (
    <div className="space-y-0.5">
      {categories.map((cat) => {
        const isFocused = focusedCategoryId === cat.id;
        return (
          <button
            key={cat.id}
            type="button"
            onClick={() => onFocusCategory(cat.id)}
            className="w-full flex items-center gap-2 pl-2 pr-1.5 py-1.5 rounded-r text-left transition-all min-w-0 border-l-[3px]"
            style={{
              borderLeftColor: cat.color,
              backgroundColor: isFocused ? `${cat.color}22` : `${cat.color}10`,
              color: isFocused ? '#2C2820' : '#6B6058',
              fontWeight: isFocused ? 600 : 400,
              fontSize: '12px',
            }}
          >
            <FolderIcon className="h-3.5 w-3.5 flex-shrink-0" style={{ color: cat.color, opacity: 0.8 }} />
            <span className="flex-1 truncate">{cat.name}</span>
          </button>
        );
      })}
    </div>
  );
}
