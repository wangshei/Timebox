import React from 'react';
import { COLOR, RADIUS, FONT_SIZE, FONT_WEIGHT, SHADOW } from '../../styles/tokens';

export interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
  /** Shorter label for mobile/compact contexts */
  shortLabel?: string;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  compact?: boolean;
  /** sm 28px, md 32px (default), touch 44px */
  size?: 'sm' | 'md' | 'touch';
  fullWidth?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

const H = { sm: 28, md: 32, touch: 44 } as const;

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  compact = false,
  size = 'md',
  fullWidth,
  className = '',
  style: outerStyle,
}: SegmentedControlProps<T>) {
  const stretch = fullWidth || !!outerStyle?.flex;
  return (
    <div
      role="tablist"
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'stretch',
        backgroundColor: 'rgba(0,0,0,0.06)',
        borderRadius: RADIUS.md,
        padding: 2,
        gap: 1,
        height: H[size],
        boxSizing: 'border-box',
        width: fullWidth ? '100%' : undefined,
        ...outerStyle,
      }}
    >
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-pressed={isActive}
            onClick={() => onChange(option.value)}
            className="touch-manipulation"
            style={{
              flex: stretch ? 1 : undefined,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              padding: compact ? '0 8px' : '0 12px',
              fontSize: size === 'touch' ? FONT_SIZE.md : FONT_SIZE.sm,
              fontWeight: isActive ? FONT_WEIGHT.medium : FONT_WEIGHT.regular,
              borderRadius: RADIUS.sm,
              border: 'none',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s ease',
              backgroundColor: isActive ? COLOR.surface : 'transparent',
              color: isActive ? COLOR.text : COLOR.text2,
              boxShadow: isActive ? SHADOW.sh1 : 'none',
            }}
          >
            {compact && option.shortLabel ? option.shortLabel : option.label}
          </button>
        );
      })}
    </div>
  );
}
