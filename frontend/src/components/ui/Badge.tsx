import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  className?: string;
}

export function Badge({ children, variant = 'neutral', className = '' }: BadgeProps) {
  const variantStyles = {
    success: 'bg-success-light text-success ring-1 ring-success/30',
    warning: 'bg-warning-light text-warning ring-1 ring-warning/30',
    danger: 'bg-danger-light text-danger ring-1 ring-danger/30',
    info: 'bg-brand-light text-brand ring-1 ring-brand/30',
    neutral: 'bg-white/10 text-secondary ring-1 ring-white/15',
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold backdrop-blur-sm ${variantStyles[variant]} ${className}`}>
      {children}
    </span>
  );
}
