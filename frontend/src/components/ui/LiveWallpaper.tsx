'use client';

import React, { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { SpatialBackground, SpatialVariant } from './SpatialBackground';

/**
 * LiveWallpaper — a self-contained "living wallpaper" that sits BEHIND all
 * glass UI on the landing page, the client dashboard and the admin area.
 *
 * Layers (back -> front):
 *   1. .lw-void   — opaque near-black deep-space base.
 *   2. .lw-image  — OPTIONAL real image base layer. Driven by the CSS custom
 *                   property `--wallpaper-image` (defaults to `none`). Drop a
 *                   committed asset in `frontend/public` (e.g. /wallpaper.svg)
 *                   and set, in globals.css or on <body>:
 *                       --wallpaper-image: url('/wallpaper.svg');
 *                   and it becomes the base layer; the generated CSS/SVG
 *                   wallpaper below still tints over it. No network/external
 *                   URLs are used by default (sandbox is offline).
 *   3. .lw-mesh   — animated multi-stop MESH GRADIENT (teal / sapphire / gold
 *                   / emerald) that slowly drifts its positions (~48s loop).
 *   4. canvas     — the existing SpatialBackground (drifting glow orbs +
 *                   data-star particles + blueprint grid), transparent so the
 *                   mesh shows through.
 *   5. skyline    — low-opacity inline-SVG property/skyline silhouette band
 *                   with slow parallax drift (two depth layers).
 *   6. .lw-grain  — faint animated grain overlay for richness (cheap CSS).
 *   7. scrim      — readability dimmer/vignette. The app + admin variants use
 *                   a stronger dark scrim so dense content (tables, forms,
 *                   messaging) stays legible over the wallpaper.
 *
 * Fixed, full-viewport, z-index behind content, aria-hidden, pointer-events
 * none. All motion is pure CSS / canvas and is frozen to a static frame under
 * prefers-reduced-motion (global rule in globals.css + canvas guard).
 */

interface LiveWallpaperProps {
  /** Force a variant. When omitted it is derived from the current route. */
  variant?: SpatialVariant;
}

function variantFromPath(pathname: string | null): SpatialVariant {
  if (!pathname) return 'app';
  if (pathname === '/') return 'landing';
  if (pathname === '/admin' || pathname.startsWith('/admin/') || pathname === '/admin-login') return 'admin';
  return 'app';
}

/** Deterministic skyline + rising-graph silhouette spanning 0..1000 (units),
 * drawn twice across a 0..2000 viewBox so a -50% parallax translate loops
 * seamlessly. Pure geometry — no external assets. */
function Skyline({ tint }: { tint: string }) {
  const { buildings, graph } = useMemo(() => {
    const rects: { x: number; w: number; h: number }[] = [];
    let x = 0;
    let seed = 1337;
    const rand = () => {
      // tiny deterministic LCG so SSR + client markup match
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    while (x < 1000) {
      const w = 26 + Math.floor(rand() * 46);
      const h = 60 + Math.floor(rand() * 240);
      rects.push({ x, w, h });
      x += w + 6 + Math.floor(rand() * 14);
    }
    // Rising trend (CAGR-style) line across the band.
    const pts: string[] = [];
    for (let i = 0; i <= 20; i++) {
      const gx = (i / 20) * 1000;
      const base = 360 - Math.pow(i / 20, 1.4) * 250;
      const wobble = Math.sin(i * 1.3) * 10;
      pts.push(`${gx.toFixed(1)},${(base + wobble).toFixed(1)}`);
    }
    return { buildings: rects, graph: pts.join(' ') };
  }, []);

  const renderGroup = (offset: number, key: string) => (
    <g key={key} transform={`translate(${offset},0)`}>
      {buildings.map((b, i) => (
        <rect key={i} x={b.x} y={400 - b.h} width={b.w} height={b.h} rx={2} fill={tint} />
      ))}
      <polyline
        points={graph}
        fill="none"
        stroke="rgba(0,196,212,0.55)"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );

  return (
    <svg viewBox="0 0 2000 400" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      {renderGroup(0, 'a')}
      {renderGroup(1000, 'b')}
    </svg>
  );
}

export function LiveWallpaper({ variant: forced }: LiveWallpaperProps) {
  const pathname = usePathname();
  const variant = forced ?? variantFromPath(pathname);

  return (
    <div aria-hidden="true" className="live-wallpaper" data-variant={variant}>
      <div className="lw-layer lw-void" />
      <div className="lw-layer lw-image" />
      <div className="lw-layer lw-mesh" />
      <SpatialBackground embedded variant={variant} />
      <div className="lw-layer lw-skyline lw-skyline-back">
        <Skyline tint="rgba(10,20,40,0.85)" />
      </div>
      <div className="lw-layer lw-skyline lw-skyline-front">
        <Skyline tint="rgba(6,12,26,0.95)" />
      </div>
      <div className="lw-layer lw-grain" />
      <div className={`lw-layer lw-scrim lw-scrim-${variant}`} />
    </div>
  );
}

export default LiveWallpaper;
