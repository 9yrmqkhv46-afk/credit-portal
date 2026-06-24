'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Logo } from '@/components/ui/Logo';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';

function reducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Indicative borrowing-power estimate (client-side only). */
function estimateBorrowing(income: number, dependants: number, monthlyDebts: number): number {
  if (income <= 0) return 0;
  // 30% of gross income to servicing, less existing debts and a per-dependant
  // living-cost allowance, annuitised at 6.5% + 3% buffer over 30 years.
  const dependantCost = dependants * 250;
  const monthlySurplus = (income * 0.3) / 12 - monthlyDebts - dependantCost;
  if (monthlySurplus <= 0) return 0;
  const annualRate = (6.5 + 3) / 100;
  const r = annualRate / 12;
  const n = 360;
  const pv = (monthlySurplus * (1 - Math.pow(1 + r, -n))) / r;
  const cap = income * 6;
  return Math.max(0, Math.min(Math.round(pv / 1000) * 1000, cap));
}

const FEATURE_PILLS = [
  'Bank-grade encryption',
  'Real-time status tracking',
  'Domain/Apify property data',
];

const WATERMARK = 'LVR · DTI · CAGR · SERVICEABILITY · APRA · PRE-APPROVAL · SETTLEMENT · OFFSET · LMI · ';

export default function LandingPage() {
  const router = useRouter();
  const [navIn, setNavIn] = useState(false);
  const [income, setIncome] = useState(0);
  const [dependants, setDependants] = useState(0);
  const [debts, setDebts] = useState(800);
  const [leaving, setLeaving] = useState(false);
  const watermarkRef = useRef<HTMLDivElement>(null);

  const borrowing = useMemo(() => estimateBorrowing(income, dependants, debts), [income, dependants, debts]);

  // Slide the nav in after 600ms.
  useEffect(() => {
    const t = window.setTimeout(() => setNavIn(true), 600);
    return () => window.clearTimeout(t);
  }, []);

  // Auto-type $120,000 on load at 80ms/digit (skip under reduced motion).
  useEffect(() => {
    const target = 120000;
    if (reducedMotion()) { setIncome(target); return; }
    const digits = String(target).split('');
    let acc = '';
    let i = 0;
    const id = window.setInterval(() => {
      acc += digits[i];
      setIncome(parseInt(acc, 10) || 0);
      i++;
      if (i >= digits.length) window.clearInterval(id);
    }, 80);
    return () => window.clearInterval(id);
  }, []);

  // Ambient watermark upward scroll via rAF.
  useEffect(() => {
    if (reducedMotion()) return;
    let raf = 0;
    let offset = 0;
    const el = watermarkRef.current;
    const loop = () => {
      offset = (offset + 0.25) % 1000;
      if (el) el.style.transform = `translateY(${-offset}px)`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const goToLogin = () => {
    if (reducedMotion()) { router.push('/login'); return; }
    setLeaving(true);
    window.setTimeout(() => router.push('/login'), 520);
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Ambient scrolling watermark (very faint). */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex justify-center overflow-hidden" style={{ opacity: 0.025 }}>
        <div ref={watermarkRef} className="font-mono text-4xl font-bold leading-[2.2] tracking-widest text-white" style={{ writingMode: 'vertical-rl' as React.CSSProperties['writingMode'] }}>
          {WATERMARK.repeat(6)}
        </div>
      </div>

      {/* Top nav */}
      <nav
        className="glass-1 fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between px-4 transition-transform duration-500 sm:px-8"
        style={{ transform: navIn ? 'translateY(0)' : 'translateY(-100%)' }}
      >
        <Link href="/" aria-label="TransformBiz home" className="flex items-center">
          <Logo width={150} />
        </Link>
        <div className="flex items-center gap-2">
          <Link href="/login" className="rounded-lg px-3 py-1.5 text-sm font-medium text-secondary hover:bg-white/10 hover:text-primary">Client Login</Link>
          <Link href="/admin-login" className="rounded-lg px-3 py-1.5 text-sm font-medium text-secondary hover:bg-white/10 hover:text-primary">Admin Login</Link>
        </div>
      </nav>

      {/* Floating feature pills */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden lg:block">
        {FEATURE_PILLS.map((p, i) => {
          const positions = [
            { top: '24%', left: '10%' },
            { top: '62%', left: '8%' },
            { top: '40%', right: '9%' },
          ][i];
          return (
            <span
              key={p}
              className="glass-2 absolute rounded-full px-3.5 py-1.5 text-xs font-medium text-secondary"
              style={{
                ...positions,
                animation: reducedMotion() ? undefined : `pillBob ${6 + i}s ease-in-out ${i * 0.6}s infinite`,
              }}
            >
              {p}
            </span>
          );
        })}
      </div>

      {/* Hero */}
      <main className="relative z-10 flex min-h-screen items-center justify-center px-4 py-20">
        <div
          className="glass-5 w-full max-w-[560px] rounded-3xl p-7 sm:p-9 transition-all duration-500"
          style={{
            opacity: leaving ? 0 : 1,
            transform: leaving ? 'scale(0.92)' : 'scale(1)',
            filter: leaving ? 'blur(8px)' : 'blur(0)',
          }}
        >
          <h1 className="font-display text-3xl font-bold tracking-tight text-primary sm:text-4xl">How much can you borrow?</h1>
          <p className="mt-2 text-sm text-secondary">Get an instant indicative estimate, then speak to a TransformBiz specialist.</p>

          <div className="mt-6 space-y-5">
            {/* Income */}
            <div>
              <label htmlFor="income" className="mb-1.5 block text-sm font-medium text-secondary">Gross Annual Income</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">$</span>
                <input
                  id="income"
                  type="number"
                  inputMode="numeric"
                  value={income || ''}
                  onChange={(e) => setIncome(parseInt(e.target.value, 10) || 0)}
                  className="glass-input tnum w-full rounded-xl border border-white/15 py-2.5 pl-7 pr-3.5 text-primary focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
              </div>
            </div>

            {/* Dependants stepper */}
            <div>
              <span className="mb-1.5 block text-sm font-medium text-secondary">Dependants</span>
              <div className="flex items-center gap-3">
                <button type="button" aria-label="Fewer dependants" onClick={() => setDependants((d) => Math.max(0, d - 1))} className="flex h-10 w-10 items-center justify-center rounded-xl text-lg font-bold text-primary ring-1 ring-white/15 transition-transform hover:bg-white/10 active:scale-90">−</button>
                <span className="tnum w-10 text-center text-lg font-semibold text-primary">{dependants}</span>
                <button type="button" aria-label="More dependants" onClick={() => setDependants((d) => d + 1)} className="flex h-10 w-10 items-center justify-center rounded-xl text-lg font-bold text-primary ring-1 ring-white/15 transition-transform hover:bg-white/10 active:scale-90">+</button>
              </div>
            </div>

            {/* Debts slider */}
            <div>
              <label htmlFor="debts" className="mb-1.5 flex items-center justify-between text-sm font-medium text-secondary">
                <span>Existing Monthly Debts</span>
                <span className="tnum text-primary">${debts.toLocaleString()}</span>
              </label>
              <input
                id="debts"
                type="range"
                min={0}
                max={5000}
                step={50}
                value={debts}
                onChange={(e) => setDebts(parseInt(e.target.value, 10))}
                className="w-full accent-[var(--accent-teal)]"
              />
            </div>
          </div>

          {/* Result */}
          <div className="mt-7 rounded-2xl border border-brand/20 bg-brand-light/50 p-5 text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-brand">Est. Borrowing Power</p>
            <p
              className="tnum mt-1 font-display text-5xl font-bold sm:text-6xl"
              style={{ color: 'var(--accent-teal)', textShadow: '0 0 28px rgba(0,196,212,0.55)' }}
            >
              <AnimatedNumber value={borrowing} prefix="$" durationMs={500} />
            </p>
            <p className="mt-2 text-xs text-muted">Indicative estimate only. Speak to a specialist today.</p>
          </div>

          <button
            type="button"
            onClick={goToLogin}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-brand to-brand-dark px-5 py-3 font-semibold text-on-accent shadow-lg shadow-brand/30 transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-brand/50"
          >
            Get Full Assessment
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>
      </main>
    </div>
  );
}
