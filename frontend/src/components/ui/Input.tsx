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
        <label htmlFor={inputId} className="block text-sm font-medium text-slate-700 mb-1.5">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`glass-input block w-full rounded-xl border border-white/60 px-3.5 py-2.5 text-slate-900 placeholder-slate-400 shadow-sm transition focus:border-brand focus:ring-2 focus:ring-brand/30 focus:outline-none sm:text-sm ${error ? 'border-red-400 focus:border-red-500 focus:ring-red-200' : ''} ${className}`}
        {...props}
      />
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}
