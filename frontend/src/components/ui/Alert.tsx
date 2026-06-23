import React from 'react';

interface AlertProps {
  variant?: 'success' | 'error' | 'warning' | 'info';
  children: React.ReactNode;
  className?: string;
}

export function Alert({ variant = 'info', children, className = '' }: AlertProps) {
  const variantStyles = {
    success: 'bg-green-50/80 border-green-300/60 text-green-800',
    error: 'bg-red-50/80 border-red-300/60 text-red-800',
    warning: 'bg-amber-50/80 border-amber-300/60 text-amber-800',
    info: 'bg-brand-light/80 border-brand/30 text-brand',
  };

  return (
    <div className={`rounded-xl border p-4 text-sm backdrop-blur-md shadow-sm ${variantStyles[variant]} ${className}`}>
      {children}
    </div>
  );
}
