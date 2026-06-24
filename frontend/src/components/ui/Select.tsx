'use client';

import React from 'react';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: SelectOption[];
}

export function Select({ label, error, options, className = '', id, ...props }: SelectProps) {
  const selectId = id || label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={selectId} className="block text-sm font-medium text-secondary mb-1.5">
          {label}
        </label>
      )}
      <select
        id={selectId}
        className={`glass-input block w-full rounded-xl border border-white/15 px-3.5 py-2.5 text-primary shadow-sm transition focus:border-brand focus:ring-2 focus:ring-brand/40 focus:outline-none sm:text-sm ${error ? 'border-danger/60 focus:border-danger focus:ring-danger/30' : ''} ${className}`}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-[#0c1322] text-primary">
            {option.label}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-sm text-danger">{error}</p>}
    </div>
  );
}
