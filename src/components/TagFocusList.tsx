import React from 'react';
import { Tag as TagIcon } from 'lucide-react';
import type { Tag } from '../types';

const TAG_DOT_COLOR = '#6b7280';

interface TagFocusListProps {
  tags: Tag[];
  /** Notion-like: tighter rows, left-aligned */
  compact?: boolean;
}

export function TagFocusList({ tags, compact = false }: TagFocusListProps) {
  return (
    <div className="space-y-0.5">
      {tags.map((tag) => (
        <div
          key={tag.id}
          className="w-full flex items-center gap-2 pl-1.5 pr-1.5 py-1.5 rounded text-left text-sm text-neutral-700 min-w-0"
        >
          <div
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: TAG_DOT_COLOR }}
          />
          <TagIcon className="w-3.5 h-3.5 text-neutral-400 flex-shrink-0" />
          <span className="flex-1 truncate">{tag.name}</span>
        </div>
      ))}
    </div>
  );
}
