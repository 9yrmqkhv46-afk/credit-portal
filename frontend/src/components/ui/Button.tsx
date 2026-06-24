'use client';

import React, { useState } from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  children: React.ReactNode;
}

interface Ripple { x: number; y: number; size: number; id: number; }

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  children,
  className = '',
  disabled,
  onPointerDown,
  ...props
}: ButtonProps) {
  const [ripples, setRipples] = useState<Ripple[]>([]);

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    // Tasteful press ripple (frozen under prefers-reduced-motion via CSS).
    if (!disabled && !loading) {
      const rect = e.currentTarget.getBoundingClientRect();
      const sizePx = Math.max(rect.width, rect.height);
      const id = Date.now() + Math.random();
      const next: Ripple = {
        x: e.clientX - rect.left - sizePx / 2,
        y: e.clientY - rect.top - sizePx / 2,
        size: sizePx,
        id,
      };
      setRipples((r) => [...r, next]);
      window.setTimeout(() => setRipples((r) => r.filter((p) => p.id !== id)), 520);
    }
    onPointerDown?.(e);
  };

  const baseStyles =
    'relative overflow-hidden inline-flex items-center justify-center font-semibold rounded-xl transition duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-transparent disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]';

  const variantStyles = {
    // Teal gradient with near-black text (Mandate 1: never white-on-teal).
    primary:
      'bg-gradient-to-br from-brand to-brand-dark text-on-accent shadow-lg shadow-brand/25 hover:shadow-xl hover:brightness-110 focus:ring-brand',
    // Frosted glass / outline.
    secondary:
      'glass-input border border-white/15 text-brand hover:bg-white/10 focus:ring-brand shadow-sm',
    danger:
      'bg-gradient-to-br from-danger to-crimson text-white shadow-lg shadow-danger/25 hover:brightness-110 focus:ring-danger',
    ghost: 'bg-transparent text-secondary hover:bg-white/10 hover:text-primary focus:ring-brand',
  };

  const sizeStyles = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2.5 text-sm',
    lg: 'px-6 py-3 text-base',
  };

  return (
    <button
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      disabled={disabled || loading}
      onPointerDown={handlePointerDown}
      {...props}
    >
      {ripples.map((r) => (
        <span
          key={r.id}
          className="ripple"
          aria-hidden="true"
          style={{ left: r.x, top: r.y, width: r.size, height: r.size }}
        />
      ))}
      {loading && (
        <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      )}
      {children}
    </button>
  );
}
