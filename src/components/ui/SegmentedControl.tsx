import React from 'react';

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
  className?: string;
  style?: React.CSSProperties;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  compact = false,
  className = '',
  style: outerStyle,
}: SegmentedControlProps<T>) {
  return (
    <div
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.06)',
        borderRadius: 8,
        padding: 2,
        gap: 1,
        ...outerStyle,
      }}
    >
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className="touch-manipulation"
            style={{
              flex: outerStyle?.flex ? 1 : undefined,
              padding: compact ? '4px 10px' : '5px 12px',
              fontSize: 12,
              fontWeight: isActive ? 500 : 400,
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s ease',
              backgroundColor: isActive ? '#FFFFFF' : 'transparent',
              color: isActive ? '#1C1C1E' : '#636366',
              boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.10), 0 0 0 0.5px rgba(0,0,0,0.04)' : 'none',
            }}
          >
            {compact && option.shortLabel ? option.shortLabel : option.label}
          </button>
        );
      })}
    </div>
  );
}
