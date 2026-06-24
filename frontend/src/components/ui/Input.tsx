'use client';

import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, className = '', id, ...props }: InputProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-secondary mb-1.5">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`glass-input block w-full rounded-xl border border-white/15 px-3.5 py-2.5 text-primary shadow-sm transition focus:border-brand focus:ring-2 focus:ring-brand/40 focus:outline-none sm:text-sm ${error ? 'border-danger/60 focus:border-danger focus:ring-danger/30' : ''} ${className}`}
        {...props}
      />
      {error && <p className="mt-1 text-sm text-danger">{error}</p>}
    </div>
  );
}
