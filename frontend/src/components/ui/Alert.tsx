import React from 'react';

interface AlertProps {
  variant?: 'success' | 'error' | 'warning' | 'info';
  children: React.ReactNode;
  className?: string;
}

export function Alert({ variant = 'info', children, className = '' }: AlertProps) {
  const variantStyles = {
    success: 'bg-success-light border-success/40 text-success',
    error: 'bg-danger-light border-danger/40 text-danger',
    warning: 'bg-warning-light border-warning/40 text-warning',
    info: 'bg-brand-light border-brand/40 text-brand',
  };

  return (
    <div className={`rounded-xl border p-4 text-sm backdrop-blur-md shadow-sm ${variantStyles[variant]} ${className}`}>
      {children}
    </div>
  );
}
