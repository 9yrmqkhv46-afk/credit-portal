'use client';

import React, { useEffect, useRef } from 'react';

/**
 * Mandate 5 — Section A: Hyper-realistic 24/7 live wallpaper.
 *
 * A single GPU-accelerated <canvas> rendering six simultaneous layers behind
 * every page (landing, client portal, admin portal):
 *   1. Deep-space base   — radial gradient that "breathes" on a 12s sine cycle.
 *   2. Aurora bands      — 3 drifting sine-wave colour washes (teal/sapphire/gold).
 *   3. Glow orbs         — 5 large radial blobs drifting + bouncing off edges.
 *   4. Star field        — 200 twinkling stars (15 bright) drifting upward.
 *   5. Finance data stream — 40 columns of falling financial glyphs (Matrix-style, subtle).
 *   6. Blueprint grid    — rendered via the CSS overlay below (drifts diagonally).
 *
 * Rendered once (root layout), behind all content (z -10), aria-hidden and
 * pointer-events:none. Frame rate is capped to ~60fps via performance.now()
 * delta timing, and devicePixelRatio scaling keeps it sharp on HiDPI screens.
 * Under prefers-reduced-motion the loop is skipped and a single static frame
 * is drawn instead.
 */

interface Orb {
  x: number; y: number; vx: number; vy: number; r: number; rgb: string; opacity: number;
}
interface Star {
  x: number; y: number; r: number; phase: number; speed: number; bright: boolean;
}
interface StreamColumn {
  x: number; y: number; speed: number; chars: string[]; fontSize: number;
}

// Glow orb definitions — [r, opacity, vx, vy, rgb]
const ORB_DEFS: Array<{ r: number; opacity: number; vx: number; vy: number; rgb: string }> = [
  { r: 500, opacity: 0.07, vx: 0.22, vy: 0.18, rgb: '0, 196, 212' },   // teal
  { r: 700, opacity: 0.05, vx: -0.16, vy: 0.24, rgb: '61, 142, 255' }, // sapphire
  { r: 350, opacity: 0.04, vx: 0.30, vy: -0.12, rgb: '240, 180, 41' }, // gold
  { r: 280, opacity: 0.03, vx: -0.20, vy: -0.20, rgb: '255, 77, 106' },// crimson
  { r: 220, opacity: 0.025, vx: 0.14, vy: 0.28, rgb: '0, 229, 135' },  // emerald
];

const FINANCE_CHARS = [
  '$', '%', '↑', '↓', '≋', '◈', '▲', '▼',
  'L', 'V', 'R', 'D', 'T', 'I', 'C', 'A', 'G',
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  '.', '×', '÷', '=', '+',
];

const STAR_COUNT = 200;
const BRIGHT_STARS = 15;
const STREAM_COLUMNS = 40;
const TARGET_FPS = 60;
const FRAME_MS = 1000 / TARGET_FPS;

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

export function WallpaperEngine() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let raf = 0;
    let lastFrame = 0;
    let t = 0; // global time accumulator (seconds)

    const orbs: Orb[] = [];
    const stars: Star[] = [];
    const columns: StreamColumn[] = [];

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function seed() {
      // Orbs
      orbs.length = 0;
      for (const d of ORB_DEFS) {
        orbs.push({
          x: rand(0, width),
          y: rand(0, height),
          vx: d.vx,
          vy: d.vy,
          r: d.r,
          rgb: d.rgb,
          opacity: d.opacity,
        });
      }
      // Stars
      stars.length = 0;
      for (let i = 0; i < STAR_COUNT; i++) {
        const bright = i < BRIGHT_STARS;
        stars.push({
          x: rand(0, width),
          y: rand(0, height),
          r: bright ? rand(1.8, 2.4) : rand(0.5, 1.4),
          phase: rand(0, Math.PI * 2),
          speed: rand(0.008, 0.025),
          bright,
        });
      }
      // Finance data stream
      columns.length = 0;
      const colWidth = width / STREAM_COLUMNS;
      for (let i = 0; i < STREAM_COLUMNS; i++) {
        const len = Math.floor(rand(6, 18));
        const chars: string[] = [];
        for (let j = 0; j < len; j++) {
          chars.push(FINANCE_CHARS[Math.floor(Math.random() * FINANCE_CHARS.length)]);
        }
        columns.push({
          x: i * colWidth + colWidth * 0.5,
          y: rand(-height, 0),
          speed: rand(1.2, 2.8),
          chars,
          fontSize: 11,
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

    // ---- Layer 1: breathing deep-space base ----
    function drawBase() {
      // Luminosity oscillates 0.96..1.04 over a 12s sine cycle.
      const breath = 1 + 0.04 * Math.sin((t / 12) * Math.PI * 2);
      const cx = width * 0.5;
      const cy = height * 0.35;
      const g = ctx!.createRadialGradient(cx, cy, 0, cx, cy, Math.max(width, height) * 0.95);
      const lift = (hex: number) => Math.min(255, Math.round(hex * breath));
      g.addColorStop(0, `rgb(${lift(0x08)}, ${lift(0x0f)}, ${lift(0x2e)})`);
      g.addColorStop(0.55, `rgb(${lift(0x05)}, ${lift(0x09)}, ${lift(0x1a)})`);
      g.addColorStop(1, `rgb(${lift(0x02)}, ${lift(0x04)}, ${lift(0x08)})`);
      ctx!.fillStyle = g;
      ctx!.fillRect(0, 0, width, height);
    }

    // ---- Layer 2: aurora bands ----
    const BANDS = [
      { rgb: '0,196,212', alpha: 0.06, amp: 180, period: 8, drift: 0.15, baseY: 0.32 },
      { rgb: '30,80,255', alpha: 0.04, amp: 240, period: 11, drift: -0.10, baseY: 0.5 },
      { rgb: '240,180,40', alpha: 0.03, amp: 120, period: 15, drift: 0.08, baseY: 0.68 },
    ];
    function drawAurora() {
      ctx!.globalCompositeOperation = 'lighter';
      for (const b of BANDS) {
        const phase = (t / b.period) * Math.PI * 2;
        const shift = (t * b.drift * 60) % width;
        ctx!.beginPath();
        ctx!.moveTo(-50, height);
        const baseY = height * b.baseY;
        for (let x = -50; x <= width + 50; x += 24) {
          const y = baseY + Math.sin((x + shift) / 220 + phase) * b.amp * 0.5
            + Math.sin((x + shift) / 90 - phase) * b.amp * 0.18;
          ctx!.lineTo(x, y);
        }
        ctx!.lineTo(width + 50, height);
        ctx!.closePath();
        const grad = ctx!.createLinearGradient(0, baseY - b.amp, 0, height);
        grad.addColorStop(0, `rgba(${b.rgb}, ${b.alpha})`);
        grad.addColorStop(1, `rgba(${b.rgb}, 0)`);
        ctx!.fillStyle = grad;
        ctx!.fill();
      }
      ctx!.globalCompositeOperation = 'source-over';
    }

    // ---- Layer 3: glow orbs ----
    function drawOrbs() {
      ctx!.globalCompositeOperation = 'lighter';
      for (const o of orbs) {
        const rg = ctx!.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r);
        rg.addColorStop(0, `rgba(${o.rgb}, ${o.opacity * 0.8})`);
        rg.addColorStop(1, `rgba(${o.rgb}, 0)`);
        ctx!.fillStyle = rg;
        ctx!.beginPath();
        ctx!.arc(o.x, o.y, o.r, 0, Math.PI * 2);
        ctx!.fill();
      }
      ctx!.globalCompositeOperation = 'source-over';
    }

    // ---- Layer 4: star field ----
    function drawStars() {
      for (const s of stars) {
        const opacity = 0.2 + 0.35 * Math.abs(Math.sin(s.phase));
        if (s.bright) {
          ctx!.shadowBlur = 6;
          ctx!.shadowColor = 'rgba(255,255,255,0.8)';
        }
        ctx!.fillStyle = `rgba(210, 230, 255, ${opacity})`;
        ctx!.beginPath();
        ctx!.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx!.fill();
        if (s.bright) ctx!.shadowBlur = 0;
      }
    }

    // ---- Layer 5: finance data stream ----
    function drawStream() {
      ctx!.font = `11px var(--font-mono, monospace)`;
      ctx!.textAlign = 'center';
      for (const col of columns) {
        for (let i = 0; i < col.chars.length; i++) {
          const cy = col.y - i * 14;
          if (cy < -14 || cy > height + 14) continue;
          // Leading char brighter, trail fades out.
          const alpha = i === 0 ? 0.18 : Math.max(0.02, 0.12 - i * 0.012);
          ctx!.fillStyle = `rgba(0, 196, 212, ${alpha})`;
          ctx!.fillText(col.chars[i], col.x, cy);
        }
      }
      ctx!.textAlign = 'start';
    }

    function step(dt: number) {
      // dt normalised to 60fps frames.
      const f = dt / FRAME_MS;
      t += dt / 1000;

      for (const o of orbs) {
        o.x += o.vx * f;
        o.y += o.vy * f;
        if (o.x < -o.r * 0.3 || o.x > width + o.r * 0.3) o.vx *= -1;
        if (o.y < -o.r * 0.3 || o.y > height + o.r * 0.3) o.vy *= -1;
      }
      for (const s of stars) {
        s.phase += s.speed * f;
        s.y -= 0.04 * f;
        if (s.y < -3) {
          s.y = height + 3;
          s.x = rand(0, width);
        }
      }
      for (const col of columns) {
        col.y += col.speed * f;
        const topChar = col.y - col.chars.length * 14;
        if (topChar > height) {
          col.y = rand(-400, -100);
          // occasionally reshuffle a couple of glyphs for life
          const idx = Math.floor(Math.random() * col.chars.length);
          col.chars[idx] = FINANCE_CHARS[Math.floor(Math.random() * FINANCE_CHARS.length)];
        }
      }
    }

    function render() {
      drawBase();
      drawAurora();
      drawOrbs();
      drawStars();
      drawStream();
    }

    function loop(now: number) {
      raf = requestAnimationFrame(loop);
      const dt = now - lastFrame;
      if (dt < FRAME_MS) return; // cap to ~60fps
      lastFrame = now;
      step(Math.min(dt, FRAME_MS * 3)); // clamp big jumps (tab refocus)
      render();
    }

    resize();
    window.addEventListener('resize', resize);

    if (prefersReduced) {
      render(); // single static frame
    } else {
      lastFrame = performance.now();
      raf = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <canvas
        ref={canvasRef}
        className="gpu-layer absolute inset-0 h-full w-full"
        style={{ transform: 'translateZ(0)', willChange: 'transform' }}
      />
    </div>
  );
}

export default WallpaperEngine;
