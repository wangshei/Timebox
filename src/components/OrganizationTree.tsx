import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Calendar, Folder, Tag as TagIcon } from 'lucide-react';
import type { CalendarContainer, Category, Tag } from '../types';
import type { CalendarContainerVisibility } from '../types';

const TAG_DOT_COLOR = '#6b7280';

interface OrganizationTreeProps {
  containers: CalendarContainer[];
  categories: Category[];
  tags: Tag[];
  visibility: CalendarContainerVisibility;
  onToggleVisibility: (containerId: string) => void;
  focusedCalendarId: string | null;
  focusedCategoryId: string | null;
  onFocusCalendar: (id: string) => void;
  onFocusCategory: (id: string) => void;
}

export function OrganizationTree({
  containers,
  categories,
  tags,
  visibility,
  onToggleVisibility,
  focusedCalendarId,
  focusedCategoryId,
  onFocusCalendar,
  onFocusCategory,
}: OrganizationTreeProps) {
  const [expandedCalendars, setExpandedCalendars] = useState<Record<string, boolean>>({});
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});

  const toggleCalendar = (id: string) =>
    setExpandedCalendars((prev) => ({ ...prev, [id]: !prev[id] }));
  const toggleCategory = (id: string) =>
    setExpandedCategories((prev) => ({ ...prev, [id]: !prev[id] }));

  const isCalendarExpanded = (id: string) => expandedCalendars[id] !== false;
  const isCategoryExpanded = (id: string) => expandedCategories[id] !== false;

  const categoriesByCalendar = new Map<string, Category[]>();
  const ungroupedCategories: Category[] = [];
  categories.forEach((c) => {
    const calId = c.calendarContainerId ?? undefined;
    if (calId) {
      if (!categoriesByCalendar.has(calId)) categoriesByCalendar.set(calId, []);
      categoriesByCalendar.get(calId)!.push(c);
    } else {
      ungroupedCategories.push(c);
    }
  });

  const tagsByCategory = new Map<string, Tag[]>();
  const ungroupedTags: Tag[] = [];
  tags.forEach((t) => {
    const catId = t.categoryId ?? undefined;
    if (catId) {
      if (!tagsByCategory.has(catId)) tagsByCategory.set(catId, []);
      tagsByCategory.get(catId)!.push(t);
    } else {
      ungroupedTags.push(t);
    }
  });

  return (
    <div className="space-y-0.5">
      {containers.map((container) => {
        const calCategories = categoriesByCalendar.get(container.id) ?? [];
        const expanded = isCalendarExpanded(container.id);
        return (
          <div key={container.id} className="min-w-0">
            <div className="flex items-center gap-1 min-w-0">
              <button
                type="button"
                onClick={() => toggleCalendar(container.id)}
                className="p-0.5 rounded text-neutral-400 hover:text-neutral-600 flex-shrink-0"
                aria-label={expanded ? 'Collapse' : 'Expand'}
              >
                {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
              <input
                id={`cal-${container.id}`}
                type="checkbox"
                checked={visibility[container.id] ?? true}
                onChange={(e) => {
                  e.stopPropagation();
                  onToggleVisibility(container.id);
                }}
                className="w-3.5 h-3.5 rounded border-neutral-300 text-blue-600 focus:ring-blue-500 flex-shrink-0"
              />
              <button
                type="button"
                onClick={() => onFocusCalendar(container.id)}
                className={`flex-1 flex items-center justify-start gap-2 pl-2 pr-1.5 py-1.5 rounded-r text-left text-sm transition-colors min-w-0 border-l-[3px] ${
                  focusedCalendarId === container.id ? 'text-neutral-900 font-medium' : 'text-neutral-700 hover:opacity-90'
                }`}
                style={{ borderLeftColor: container.color, backgroundColor: `${container.color}12` }}
              >
                <Calendar className="w-3.5 h-3.5 text-neutral-500 flex-shrink-0" />
                <span className="truncate">{container.name}</span>
              </button>
            </div>
            {expanded && calCategories.length > 0 && (
              <div className="ml-3 mt-0.5 space-y-0.5 border-l border-neutral-200 pl-2">
                {calCategories.map((cat) => {
                  const catTags = tagsByCategory.get(cat.id) ?? [];
                  const catExpanded = isCategoryExpanded(cat.id);
                  return (
                    <div key={cat.id} className="min-w-0">
                      <div className="flex items-center gap-1 min-w-0">
                        <button
                          type="button"
                          onClick={() => toggleCategory(cat.id)}
                          className="p-0.5 rounded text-neutral-400 hover:text-neutral-600 flex-shrink-0"
                          aria-label={catExpanded ? 'Collapse' : 'Expand'}
                        >
                          {catExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => onFocusCategory(cat.id)}
                          className={`flex-1 flex items-center justify-start gap-2 pl-2 pr-1.5 py-1 rounded-r text-left text-sm transition-colors min-w-0 border-l-[3px] ${
                            focusedCategoryId === cat.id ? 'text-neutral-900 font-medium' : 'text-neutral-700 hover:opacity-90'
                          }`}
                          style={{ borderLeftColor: cat.color, backgroundColor: `${cat.color}18` }}
                        >
                          <Folder className="w-3.5 h-3.5 text-neutral-500 flex-shrink-0" />
                          <span className="truncate">{cat.name}</span>
                        </button>
                      </div>
                      {catExpanded && catTags.length > 0 && (
                        <div className="ml-6 mt-0.5 space-y-0.5 border-l border-neutral-200 pl-2">
                          {catTags.map((tag) => (
                            <div
                              key={tag.id}
                              className="flex items-center justify-start gap-2 pl-1.5 pr-1.5 py-1 rounded text-left text-sm text-neutral-700 min-w-0"
                            >
                              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: TAG_DOT_COLOR }} />
                              <TagIcon className="w-3.5 h-3.5 text-neutral-400 flex-shrink-0" />
                              <span className="truncate">{tag.name}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      {ungroupedCategories.length > 0 && (
        <div className="pt-2 mt-1 border-t border-neutral-100">
          <p className="text-[10px] font-medium text-neutral-400 uppercase tracking-wide mb-1 pl-1">Ungrouped</p>
          <div className="space-y-0.5 pl-0.5">
            {ungroupedCategories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => onFocusCategory(cat.id)}
                className={`w-full flex items-center justify-start gap-2 pl-2 pr-1.5 py-1 rounded-r text-left text-sm transition-colors min-w-0 border-l-[3px] ${
                  focusedCategoryId === cat.id ? 'text-neutral-900 font-medium' : 'text-neutral-700 hover:opacity-90'
                }`}
                style={{ borderLeftColor: cat.color, backgroundColor: `${cat.color}18` }}
              >
                <Folder className="w-3.5 h-3.5 text-neutral-500 flex-shrink-0" />
                <span className="truncate">{cat.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {ungroupedTags.length > 0 && (
        <div className="pt-1.5 mt-1 border-t border-neutral-100">
          <p className="text-[10px] font-medium text-neutral-400 uppercase tracking-wide mb-1 pl-1">Ungrouped tags</p>
          <div className="space-y-0.5 pl-0.5">
            {ungroupedTags.map((tag) => (
              <div key={tag.id} className="flex items-center justify-start gap-2 pl-1.5 py-1 text-sm text-neutral-700 min-w-0">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: TAG_DOT_COLOR }} />
                <TagIcon className="w-3.5 h-3.5 text-neutral-400 flex-shrink-0" />
                <span className="truncate">{tag.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
