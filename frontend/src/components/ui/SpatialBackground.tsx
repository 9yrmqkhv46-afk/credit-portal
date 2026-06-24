'use client';

import React, { useEffect, useRef } from 'react';

/**
 * Fixed (or embedded), full-viewport spatial canvas backdrop (visionOS
 * "deep space"):
 *   - deep radial-gradient base (skipped in `embedded` mode so an underlying
 *     mesh-gradient / wallpaper image can show through)
 *   - 4 slow drifting low-opacity glow orbs that bounce off the edges
 *   - upward-drifting "data star" particles that wrap around
 *   - a CSS blueprint grid overlay (very low opacity)
 *
 * Rendered behind all content (z -10 when standalone), aria-hidden +
 * pointer-events:none. Under prefers-reduced-motion the animation loop is
 * skipped and a single static frame is drawn instead.
 *
 * The `variant` prop dims the orbs / star field so the app and admin areas
 * read calmer + darker than the vivid landing page. `embedded` makes the
 * component fill its positioned parent (used inside <LiveWallpaper/>) and
 * keeps the canvas transparent so layered gradients remain visible.
 */

export type SpatialVariant = 'landing' | 'app' | 'admin';

interface SpatialBackgroundProps {
  /** Tunes orb / star intensity. Defaults to 'app'. */
  variant?: SpatialVariant;
  /**
   * When true the component fills its (positioned) parent instead of the
   * viewport, and the canvas is cleared transparent each frame instead of
   * painting an opaque deep-space base. Used by <LiveWallpaper/>.
   */
  embedded?: boolean;
}

interface Orb {
  x: number; y: number; vx: number; vy: number; r: number; color: string;
}
interface Star {
  x: number; y: number; vy: number; size: number; alpha: number;
}

const ORB_COLORS = [
  'rgba(0, 196, 212, 0.55)',   // teal
  'rgba(61, 142, 255, 0.45)',  // sapphire
  'rgba(240, 180, 41, 0.32)',  // gold
  'rgba(0, 229, 135, 0.32)',   // emerald
];

/** Per-variant intensity tuning (orb brightness, star count + brightness). */
const VARIANT_TUNING: Record<SpatialVariant, { orbAlpha: number; starCount: number; starAlpha: number }> = {
  landing: { orbAlpha: 1.0, starCount: 120, starAlpha: 1.0 },
  app:     { orbAlpha: 0.6, starCount: 80, starAlpha: 0.75 },
  admin:   { orbAlpha: 0.55, starCount: 70, starAlpha: 0.7 },
};

export function SpatialBackground({ variant = 'app', embedded = false }: SpatialBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const tuning = VARIANT_TUNING[variant] ?? VARIANT_TUNING.app;

    let width = 0;
    let height = 0;
    let dpr = 1;
    const orbs: Orb[] = [];
    const stars: Star[] = [];
    let raf = 0;

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function seed() {
      orbs.length = 0;
      for (let i = 0; i < ORB_COLORS.length; i++) {
        orbs.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.25,
          vy: (Math.random() - 0.5) * 0.25,
          r: Math.min(width, height) * (0.22 + Math.random() * 0.12),
          color: ORB_COLORS[i],
        });
      }
      stars.length = 0;
      for (let i = 0; i < tuning.starCount; i++) {
        stars.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vy: 0.15 + Math.random() * 0.5,
          size: Math.random() * 1.6 + 0.3,
          alpha: (Math.random() * 0.5 + 0.15) * tuning.starAlpha,
        });
      }
    }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas!.width = Math.floor(width * dpr);
      canvas!.height = Math.floor(height * dpr);
      canvas!.style.width = `${width}px`;
      canvas!.style.height = `${height}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    }

    function drawBase() {
      const g = ctx!.createRadialGradient(
        width * 0.5, height * 0.35, 0,
        width * 0.5, height * 0.35, Math.max(width, height) * 0.9
      );
      g.addColorStop(0, '#0a1224');
      g.addColorStop(0.55, '#070b16');
      g.addColorStop(1, '#04060d');
      ctx!.fillStyle = g;
      ctx!.fillRect(0, 0, width, height);
    }

    function drawOrbs() {
      ctx!.globalCompositeOperation = 'lighter';
      ctx!.globalAlpha = tuning.orbAlpha;
      for (const o of orbs) {
        const rg = ctx!.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r);
        rg.addColorStop(0, o.color);
        rg.addColorStop(1, 'transparent');
        ctx!.fillStyle = rg;
        ctx!.beginPath();
        ctx!.arc(o.x, o.y, o.r, 0, Math.PI * 2);
        ctx!.fill();
      }
      ctx!.globalAlpha = 1;
      ctx!.globalCompositeOperation = 'source-over';
    }

    function drawStars() {
      for (const s of stars) {
        ctx!.fillStyle = `rgba(180, 220, 255, ${s.alpha})`;
        ctx!.fillRect(s.x, s.y, s.size, s.size);
      }
    }

    function step() {
      for (const o of orbs) {
        o.x += o.vx;
        o.y += o.vy;
        if (o.x < 0 || o.x > width) o.vx *= -1;
        if (o.y < 0 || o.y > height) o.vy *= -1;
      }
      for (const s of stars) {
        s.y -= s.vy;
        if (s.y < -2) {
          s.y = height + 2;
          s.x = Math.random() * width;
        }
      }
    }

    function render() {
      // In embedded mode keep the canvas transparent so the underlying
      // mesh-gradient / wallpaper image shows through; otherwise paint the
      // opaque deep-space base (standalone behaviour).
      if (embedded) {
        ctx!.clearRect(0, 0, width, height);
      } else {
        drawBase();
      }
      drawOrbs();
      drawStars();
    }

    function loop() {
      step();
      render();
      raf = requestAnimationFrame(loop);
    }

    resize();
    window.addEventListener('resize', resize);

    if (prefersReduced) {
      render(); // single static frame
    } else {
      loop();
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [variant, embedded]);

  const wrapperClass = embedded
    ? 'pointer-events-none absolute inset-0 overflow-hidden'
    : 'pointer-events-none fixed inset-0 -z-10 overflow-hidden';

  return (
    <div aria-hidden="true" className={wrapperClass}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {/* Blueprint grid overlay (very low opacity). */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, rgba(255,255,255,0.035) 0, rgba(255,255,255,0.035) 1px, transparent 1px, transparent 48px),' +
            'repeating-linear-gradient(90deg, rgba(255,255,255,0.035) 0, rgba(255,255,255,0.035) 1px, transparent 1px, transparent 48px)',
          maskImage: 'radial-gradient(circle at 50% 30%, black 0%, transparent 85%)',
          WebkitMaskImage: 'radial-gradient(circle at 50% 30%, black 0%, transparent 85%)',
        }}
      />
    </div>
  );
}

export default SpatialBackground;
