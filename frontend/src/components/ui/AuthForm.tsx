'use client';

import React, { useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { AxiosError } from 'axios';

type RoleTab = 'CLIENT' | 'ADMIN';

interface AuthFormProps {
  defaultRole?: RoleTab;
}

/** Inline brand SVG: a building with a rising graph line. */
function BrandMark(): React.ReactElement {
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden="true">
      <rect x="6" y="22" width="14" height="28" rx="2" fill="#01696f" />
      <rect x="22" y="14" width="14" height="36" rx="2" fill="#0a8a91" />
      <rect x="38" y="28" width="12" height="22" rx="2" fill="#d19900" />
      <path d="M8 20 L20 14 L32 17 L48 6" stroke="#d19900" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M44 6 L48 6 L48 10" stroke="#d19900" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Floating-label text field. */
function FloatingField({
  id, label, type, value, onChange, autoComplete, trailing,
}: {
  id: string;
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  trailing?: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="relative">
      <input
        id={id}
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        placeholder=" "
        required
        className="peer block w-full rounded-xl border border-white/20 bg-white/10 px-3.5 pt-5 pb-2 text-white placeholder-transparent shadow-sm outline-none transition focus:border-[#d19900] focus:ring-2 focus:ring-[#d19900]/40"
      />
      <label
        htmlFor={id}
        className="pointer-events-none absolute left-3.5 top-1.5 text-xs font-medium text-white/60 transition-all peer-placeholder-shown:top-3.5 peer-placeholder-shown:text-sm peer-placeholder-shown:text-white/50 peer-focus:top-1.5 peer-focus:text-xs peer-focus:text-[#d19900]"
      >
        {label}
      </label>
      {trailing && <div className="absolute right-2 top-1/2 -translate-y-1/2">{trailing}</div>}
    </div>
  );
}

export function AuthForm({ defaultRole = 'CLIENT' }: AuthFormProps): React.ReactElement {
  const router = useRouter();
  const { login, logout } = useAuth();
  const [role, setRole] = useState<RoleTab>(defaultRole);
  const [subRole, setSubRole] = useState('SENIOR_BROKER');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [transition, setTransition] = useState<null | 'CLIENT' | 'ADMIN'>(null);
  const [wiggle, setWiggle] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const triggerWiggle = (msg: string) => {
    setError(msg);
    setWiggle(false);
    // restart animation
    requestAnimationFrame(() => setWiggle(true));
    window.setTimeout(() => setWiggle(false), 450);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email || !password) {
      triggerWiggle('Please enter both email and password.');
      return;
    }
    setLoading(true);
    try {
      const user = await login(email, password);
      if (role === 'ADMIN' && user.role !== 'ADMIN') {
        logout();
        setLoading(false);
        triggerWiggle('These credentials are not authorized for administrator access.');
        return;
      }
      // Persist the selected admin sub-role for display/permission hints.
      if (user.role === 'ADMIN' && typeof window !== 'undefined') {
        localStorage.setItem('adminSubRole', subRole);
      }
      setSuccess(true);
      // Role-specific post-login transition overlay, then navigate.
      const dest = user.role === 'ADMIN' ? '/admin' : '/dashboard';
      const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if (reduced) { router.push(dest); return; }
      setTransition(user.role === 'ADMIN' ? 'ADMIN' : 'CLIENT');
      window.setTimeout(() => router.push(dest), 680);
    } catch (err) {
      const axiosError = err as AxiosError<{ error?: string }>;
      setLoading(false);
      triggerWiggle(axiosError.response?.data?.error || 'Invalid email or password.');
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4">
      {/* The live wallpaper (WallpaperEngine) is mounted globally in the root
          layout and now shows through on the login pages — no opaque backdrop. */}

      {/* Post-login transition overlays (Mandate 5 — Section F) */}
      {transition === 'CLIENT' && (
        <div className="login-sweep fixed inset-0 z-[200]" aria-hidden="true" style={{ background: 'linear-gradient(90deg, var(--accent-teal), #024e54)' }} />
      )}
      {transition === 'ADMIN' && (
        <div className="fixed inset-0 z-[200] grid grid-cols-2 grid-rows-2" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="login-panel" style={{ animationDelay: `${i * 60}ms`, background: 'linear-gradient(135deg, rgba(0,196,212,0.30), rgba(2,78,84,0.75))' }} />
          ))}
        </div>
      )}
      {/* Orbiting finance-symbol pills around the card (visionOS signature).
          Motion is disabled under prefers-reduced-motion via globals.css. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden items-center justify-center sm:flex">
        <div className="relative h-0 w-0">
          {['AU$', 'LVR', 'DTI', 'CAGR', 'IRR', 'P&I', 'IO', '%', '↑', '$'].map((sym, i) => {
            const total = 10;
            const radius = 190 + (i % 3) * 46;
            const delay = -(26 / total) * i;
            return (
              <span key={i} className="orbit" style={{ animationDelay: `${delay}s` }}>
                <span className="orbit-arm" style={{ transform: `translateX(${radius}px)` }}>
                  <span className="orbit-pill" style={{ animationDelay: `${delay}s` }}>
                    {sym}
                  </span>
                </span>
              </span>
            );
          })}
        </div>
      </div>
      <div
        ref={cardRef}
        className={`auth-card glass-dark w-full max-w-md rounded-2xl p-8 text-white ${success ? 'auth-success' : ''} ${wiggle ? 'auth-wiggle' : ''}`}
      >
        <div className="flex flex-col items-center text-center">
          <Link href="/" aria-label="TransformBiz home" className="rounded-xl">
            <BrandMark />
          </Link>
          <h1 className="mt-3 text-2xl font-bold tracking-tight">TransformBiz</h1>
          <p className="mt-1 text-sm text-white/60">Commercial Lending Intelligence</p>
        </div>

        {/* Role tabs with sliding pill */}
        <div
          role="tablist"
          aria-label="Account type"
          className="relative mt-6 grid grid-cols-2 rounded-xl bg-white/10 p-1 text-sm font-semibold"
        >
          <span
            aria-hidden="true"
            className="absolute top-1 bottom-1 w-[calc(50%-0.25rem)] rounded-lg bg-[#01696f] transition-transform duration-300 ease-out"
            style={{ transform: role === 'ADMIN' ? 'translateX(calc(100% + 0.5rem))' : 'translateX(0)' }}
          />
          <button
            type="button"
            role="tab"
            aria-selected={role === 'CLIENT'}
            onClick={() => setRole('CLIENT')}
            className={`relative z-10 rounded-lg py-2 transition-colors ${role === 'CLIENT' ? 'text-white' : 'text-white/60'}`}
          >
            Client
          </button>
        </div>

        {/* Context-aware heading (Mandate 5 — Section F) */}
        <div className="mt-5 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#01696f]/30 text-[#5fd6dd]">
            {role === 'ADMIN' ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M3 8h18v11a1 1 0 01-1 1H4a1 1 0 01-1-1V8zM8 8V6a2 2 0 012-2h4a2 2 0 012 2v2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M3 11l9-8 9 8M5 10v10h14V10" strokeLinecap="round" strokeLinejoin="round" /></svg>
            )}
          </span>
          <div>
            <p className="text-sm font-semibold text-white">{role === 'ADMIN' ? 'Team Login' : 'Welcome back'}</p>
            <p className="text-xs text-white/55">{role === 'ADMIN' ? 'Manage your clients and applications.' : 'Track your loan application in real time.'}</p>
          </div>
        </div>

        {role === 'ADMIN' && (
          <div className="mt-3">
            <label htmlFor="subrole" className="mb-1 block text-xs font-medium text-white/60">Sign in as</label>
            <select
              id="subrole"
              value={subRole}
              onChange={(e) => setSubRole(e.target.value)}
              className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white focus:border-[#d19900] focus:outline-none focus:ring-2 focus:ring-[#d19900]/40"
            >
              <option value="SENIOR_BROKER">Senior Broker</option>
              <option value="BROKER">Broker</option>
              <option value="ASSISTANT">Assistant</option>
            </select>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-4 rounded-lg border border-red-400/40 bg-red-500/15 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4" noValidate>
          <FloatingField id="email" label="Email address" type="email" value={email} onChange={setEmail} autoComplete="email" />
          <FloatingField
            id="password"
            label="Password"
            type={showPw ? 'text' : 'password'}
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            trailing={
              <button
                type="button"
                onClick={() => setShowPw((s) => !s)}
                aria-label={showPw ? 'Hide password' : 'Show password'}
                className="rounded-md px-2 py-1 text-xs font-medium text-white/70 hover:text-white focus:outline-none focus:ring-2 focus:ring-[#d19900]/50"
              >
                {showPw ? 'Hide' : 'Show'}
              </button>
            }
          />
          <button
            type="submit"
            disabled={loading}
            className="btn-shimmer flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[#01696f] to-[#024e54] px-4 py-3 font-semibold text-white shadow-lg shadow-[#01696f]/30 transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-[#d19900]/60 disabled:opacity-60"
          >
            {loading && (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {role === 'ADMIN' ? 'Sign In as Administrator' : 'Sign In'}
          </button>
        </form>

        {/* Role-specific preview below the form */}
        {role === 'CLIENT' ? (
          <div className="mt-4">
            <div className="flex items-center justify-center gap-1.5 opacity-60">
              {['Pre-Approval', 'Contract', 'Settlement'].map((s, i) => (
                <React.Fragment key={s}>
                  {i > 0 && <span className="text-white/30" aria-hidden="true">→</span>}
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/70">{s}</span>
                </React.Fragment>
              ))}
            </div>
            <p className="mt-2 text-center text-[11px] text-white/40">First time here? Ask your broker for your login link.</p>
          </div>
        ) : (
          <div className="mt-4">
            <div className="flex items-center justify-center gap-2 opacity-50" style={{ filter: 'blur(0.4px)' }}>
              {[['Active Clients', '24'], ['Pending Stages', '7'], ['New Messages', '3']].map(([l, v]) => (
                <span key={l} className="rounded-lg bg-white/10 px-2.5 py-1 text-center text-[10px] text-white/70">
                  <span className="block text-sm font-bold text-[#5fd6dd]">{v}</span>{l}
                </span>
              ))}
            </div>
            <p className="mt-2 text-center text-[11px] text-white/40">Forgot your access?</p>
          </div>
        )}

        <p className="mt-5 text-center text-xs text-white/50">
          {role === 'ADMIN' ? (
            <>Not an admin?{' '}
              <button type="button" onClick={() => setRole('CLIENT')} className="font-medium text-[#d19900] hover:underline">
                Client sign in
              </button>
            </>
          ) : (
            <>New here?{' '}
              <Link href="/register" className="font-medium text-[#d19900] hover:underline">
                Create an account
              </Link>
            </>
          )}
        </p>
        <p className="mt-2 text-center text-[11px] text-white/40">
          Indicative estimates only - not a credit decision.
        </p>
      </div>
    </div>
  );
}

export default AuthForm;
