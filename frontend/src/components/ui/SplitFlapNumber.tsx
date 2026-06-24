'use client';

import React, { useEffect, useRef, useState } from 'react';

/**
 * Split-flap / digit-flip number display (Goal 2.1).
 *
 * Renders a formatted number as individual flip cells. When the value changes,
 * only the digits that actually changed flip, staggered right-to-left for the
 * classic departure-board / odometer feel. Used for the landing hero
 * "Est. Borrowing Power" and the results "Maximum Borrowing Capacity".
 *
 * Respects prefers-reduced-motion: the flip keyframe is neutralised by the
 * global reduced-motion rule, so the value updates instantly with no motion.
 */

interface SplitFlapNumberProps {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  /** Locale thousands grouping. Defaults to true. */
  group?: boolean;
  /** Per-digit stagger in ms (right -> left). */
  stepMs?: number;
  className?: string;
}

function format(value: number, decimals: number, group: boolean, prefix: string, suffix: string): string {
  const core = group
    ? value.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    : value.toFixed(decimals);
  return `${prefix}${core}${suffix}`;
}

export function SplitFlapNumber({
  value,
  decimals = 0,
  prefix = '',
  suffix = '',
  group = true,
  stepMs = 55,
  className = '',
}: SplitFlapNumberProps) {
  const initial = format(value, decimals, group, prefix, suffix);
  const [display, setDisplay] = useState(initial);
  // A per-index nonce; bumping it remounts that cell and replays the flip.
  const [nonce, setNonce] = useState<number[]>(() => initial.split('').map(() => 0));
  const prevRef = useRef(initial);
  const mountedRef = useRef(false);

  useEffect(() => {
    const next = format(value, decimals, group, prefix, suffix);
    const prev = prevRef.current;

    // First client render: flip every cell in for a satisfying entrance.
    if (!mountedRef.current) {
      mountedRef.current = true;
      prevRef.current = next;
      setDisplay(next);
      setNonce(next.split('').map((_, i) => i + 1));
      return;
    }

    if (next === prev) return;

    // Right-align comparison so only genuinely changed digits flip.
    const nextChars = next.split('');
    const prevChars = prev.split('');
    const flips = nextChars.map((ch, i) => {
      const fromRight = nextChars.length - i;
      const prevCh = prevChars[prevChars.length - fromRight];
      return ch !== prevCh;
    });

    prevRef.current = next;
    setDisplay(next);
    setNonce((cur) =>
      nextChars.map((_, i) => {
        const base = cur[i] ?? 0;
        return flips[i] ? base + 1 : base;
      })
    );
  }, [value, decimals, group, prefix, suffix]);

  const chars = display.split('');
  return (
    <span className={`digit-flip ${className}`} role="img" aria-label={display}>
      {chars.map((ch, i) => {
        const fromRight = chars.length - 1 - i;
        const animated = (nonce[i] ?? 0) > 0;
        return (
          <span key={i} className="digit" aria-hidden="true">
            <span
              key={`${ch}-${nonce[i] ?? 0}`}
              className={animated ? 'digit-flap' : 'digit-flap is-static'}
              style={{ animationDelay: `${fromRight * stepMs}ms` }}
            >
              {ch}
            </span>
          </span>
        );
      })}
    </span>
  );
}

export default SplitFlapNumber;
