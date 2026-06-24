'use client';

import React, { useEffect, useRef, useState } from 'react';

interface AnimatedNumberProps {
  /** The target value to animate to. */
  value: number;
  /** Animation duration in ms. */
  durationMs?: number;
  /** Decimal places to display. */
  decimals?: number;
  /** Optional prefix (e.g. "$"). */
  prefix?: string;
  /** Optional suffix (e.g. "x", "%"). */
  suffix?: string;
  /** Use locale grouping (thousands separators). Defaults to true. */
  group?: boolean;
  className?: string;
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Smoothly counts from the previous value up to `value` using
 * requestAnimationFrame. Respects prefers-reduced-motion by snapping to the
 * final value immediately.
 */
export function AnimatedNumber({
  value,
  durationMs = 900,
  decimals = 0,
  prefix = '',
  suffix = '',
  group = true,
  className = '',
}: AnimatedNumberProps) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;

    if (from === to) return;

    if (prefersReducedMotion() || durationMs <= 0) {
      fromRef.current = to;
      setDisplay(to);
      return;
    }

    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / durationMs);
      const eased = easeOutCubic(t);
      const current = from + (to - from) * eased;
      setDisplay(current);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
        setDisplay(to);
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      fromRef.current = to;
    };
  }, [value, durationMs]);

  const formatted = group
    ? display.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })
    : display.toFixed(decimals);

  return (
    <span className={className}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}

export default AnimatedNumber;
