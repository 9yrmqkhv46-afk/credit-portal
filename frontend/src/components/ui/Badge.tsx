import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  className?: string;
}

export function Badge({ children, variant = 'neutral', className = '' }: BadgeProps) {
  const variantStyles = {
    success: 'bg-green-100/80 text-green-800 ring-1 ring-green-600/20',
    warning: 'bg-amber-100/80 text-amber-800 ring-1 ring-amber-600/20',
    danger: 'bg-red-100/80 text-red-800 ring-1 ring-red-600/20',
    info: 'bg-brand-light/90 text-brand ring-1 ring-brand/20',
    neutral: 'bg-slate-100/80 text-slate-700 ring-1 ring-slate-500/20',
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold backdrop-blur-sm ${variantStyles[variant]} ${className}`}>
      {children}
    </span>
  );
}
