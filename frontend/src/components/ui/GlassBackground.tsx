import React from 'react';

interface GlassBackgroundProps {
  /** Use the darker, cooler slate gradient (hero / admin surfaces). */
  variant?: 'light' | 'dark';
  className?: string;
}

/**
 * Fixed, full-page layered gradient backdrop with a few soft, blurred colour
 * "blobs" that give depth behind the frosted glass panels. Rendered once per
 * page, positioned behind all content (z -10) and pointer-events:none so it
 * never interferes with interaction.
 *
 * Kept intentionally lightweight: only 3 blurred layers to stay performant.
 */
export function GlassBackground({ variant = 'light', className = '' }: GlassBackgroundProps) {
  const isDark = variant === 'dark';
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none fixed inset-0 -z-10 overflow-hidden ${
        isDark ? 'app-gradient-dark' : 'app-gradient'
      } ${className}`}
    >
      <span
        className="glass-blob"
        style={{
          top: '-8rem',
          left: '-6rem',
          width: '24rem',
          height: '24rem',
          background: isDark ? 'rgba(45, 212, 191, 0.35)' : 'rgba(44, 95, 102, 0.45)',
        }}
      />
      <span
        className="glass-blob"
        style={{
          top: '20%',
          right: '-8rem',
          width: '26rem',
          height: '26rem',
          background: isDark ? 'rgba(16, 185, 129, 0.3)' : 'rgba(16, 185, 129, 0.35)',
        }}
      />
      <span
        className="glass-blob"
        style={{
          bottom: '-10rem',
          left: '30%',
          width: '28rem',
          height: '28rem',
          background: isDark ? 'rgba(99, 102, 241, 0.28)' : 'rgba(99, 102, 241, 0.3)',
        }}
      />
    </div>
  );
}

export default GlassBackground;
