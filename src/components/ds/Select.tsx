import React from 'react';
import { fieldStyle, FieldSize } from './Input';

export interface SelectOption { value: string; label: string }
export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size' | 'style' | 'onChange'> {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  size?: FieldSize;
  style?: React.CSSProperties;
}

/** Native <select> styled with tokens. */
export function Select({ options, value, onChange, size = 'md', style, ...rest }: SelectProps) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...fieldStyle(size), paddingRight: 8, ...style }} {...rest}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
