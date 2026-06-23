import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  /** Visual treatment. `glass` (default) = frosted light panel; `dark` = frosted slate panel; `solid` = opaque white. */
  variant?: 'glass' | 'dark' | 'solid';
  /** Add a subtle hover lift. Defaults to true. */
  hover?: boolean;
}

export function Card({ children, className = '', title, variant = 'glass', hover = true }: CardProps) {
  const variantStyles = {
    glass: 'glass text-slate-800',
    dark: 'glass-dark text-white',
    solid: 'bg-white border border-gray-200 text-slate-800 shadow-sm',
  };

  const hoverStyles = hover
    ? 'transition duration-300 hover:-translate-y-0.5 hover:shadow-2xl'
    : '';

  const titleColor = variant === 'dark' ? 'text-white' : 'text-slate-900';

  return (
    <div className={`rounded-2xl p-6 ${variantStyles[variant]} ${hoverStyles} ${className}`}>
      {title && <h3 className={`text-lg font-semibold ${titleColor} mb-4`}>{title}</h3>}
      {children}
    </div>
  );
}
