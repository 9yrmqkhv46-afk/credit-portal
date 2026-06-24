'use client';

import React, { useId, useMemo } from 'react';

/**
 * CagrSparkline (Goal 2.2) — an inline-SVG trend line that draws itself
 * left-to-right (via stroke-dashoffset, ~1.1s) representing capital growth from
 * purchase price to current value. A small smooth CAGR series is synthesised
 * so the curve reads as compounding growth. An ROI badge bounces in after the
 * line finishes drawing.
 *
 * Self-contained (no external assets). Under prefers-reduced-motion the line
 * renders fully drawn and the badge appears statically (global CSS rule).
 */

interface CagrSparklineProps {
  purchase: number | null | undefined;
  current: number;
  /** Optional precomputed CAGR % to display in the badge. */
  cagrPercent?: number | null;
  /** Years held — used only to shape the synthesised curve. */
  yearsHeld?: number | null;
  width?: number;
  height?: number;
  className?: string;
}

export function CagrSparkline({
  purchase,
  current,
  cagrPercent,
  yearsHeld,
  width = 240,
  height = 64,
  className = '',
}: CagrSparklineProps) {
  const gradId = useId().replace(/:/g, '');
  const hasBase = !!purchase && purchase > 0;

  const { line, area, growthPct, up } = useMemo(() => {
    const pad = 6;
    const w = width;
    const h = height;
    const start = hasBase ? (purchase as number) : current * 0.7;
    const end = current;
    const ratio = start > 0 ? end / start : 1;
    const steps = 24;
    // Compounding curve: value(t) = start * ratio^t, with a faint wobble.
    const vals: number[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const wobble = 1 + Math.sin(t * Math.PI * 3) * 0.012;
      vals.push(start * Math.pow(ratio, t) * wobble);
    }
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const span = max - min || 1;
    const pts = vals.map((v, i) => {
      const x = pad + (i / steps) * (w - pad * 2);
      const y = h - pad - ((v - min) / span) * (h - pad * 2);
      return [x, y] as const;
    });
    const lineD = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    const areaD = `${lineD} L${pts[pts.length - 1][0].toFixed(1)},${(h - pad).toFixed(1)} L${pts[0][0].toFixed(1)},${(h - pad).toFixed(1)} Z`;
    const gp = (ratio - 1) * 100;
    return { line: lineD, area: areaD, growthPct: gp, up: gp >= 0 };
  }, [purchase, current, hasBase, width, height]);

  const stroke = up ? 'rgba(0,229,135,0.95)' : 'rgba(255,77,106,0.95)';
  const badgePct = cagrPercent != null ? cagrPercent : growthPct;
  const badgeLabel = `${cagrPercent != null ? 'CAGR' : 'ROI'} ${badgePct >= 0 ? '+' : ''}${badgePct.toFixed(1)}%`;

  return (
    <div className={`relative inline-flex w-full items-center ${className}`}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        role="img"
        aria-label={`Capital growth trend, ${growthPct >= 0 ? 'up' : 'down'} ${Math.abs(growthPct).toFixed(1)} percent`}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={`spark-${gradId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={up ? 'rgba(0,229,135,0.28)' : 'rgba(255,77,106,0.28)'} />
            <stop offset="100%" stopColor="rgba(0,229,135,0)" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#spark-${gradId})`} stroke="none" className="spark-area" />
        <path
          d={line}
          fill="none"
          stroke={stroke}
          strokeWidth={2.25}
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={100}
          className="spark-path"
        />
      </svg>
      <span
        className={`roi-badge absolute right-1 top-0 rounded-full px-2 py-0.5 text-[10px] font-semibold tnum ${
          up ? 'bg-success-light text-emerald' : 'bg-danger-light text-crimson'
        }`}
      >
        {badgeLabel}
      </span>
    </div>
  );
}

export default CagrSparkline;
