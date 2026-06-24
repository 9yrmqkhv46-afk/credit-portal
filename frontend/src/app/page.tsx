'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Logo } from '@/components/ui/Logo';
import { GlassBackground } from '@/components/ui/GlassBackground';

const FEATURES = [
  {
    title: 'Accurate Calculations',
    body: 'Industry-standard serviceability assessment with stress testing, DTI ratios, and income shading.',
    iconBg: 'from-brand to-brand-dark',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
    ),
  },
  {
    title: 'Secure Portal',
    body: 'Your financial data is stored securely with encrypted authentication and role-based access control.',
    iconBg: 'from-emerald-500 to-emerald-700',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    ),
  },
  {
    title: 'Multiple Scenarios',
    body: 'Run multiple loan scenarios and compare results to find the right borrowing strategy for your needs.',
    iconBg: 'from-indigo-500 to-indigo-700',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    ),
  },
];

export default function LandingPage() {
  return (
    <div className="relative min-h-screen flex flex-col">
      <GlassBackground variant="dark" />

      {/* Header */}
      <header className="glass-nav-dark sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-1.5 shadow-sm">
            <Logo width={170} />
          </div>
          <div className="flex gap-2 sm:gap-3 items-center">
            <Link href="/admin-login" className="text-sm text-secondary hover:text-white font-medium px-2">
              Admin
            </Link>
            <Link href="/login">
              <Button variant="ghost" className="text-secondary hover:bg-white/10">Login</Button>
            </Link>
            <Link href="/register">
              <Button variant="primary">Get Started</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 w-full">
        <div className="text-center max-w-3xl mx-auto">
          <span className="inline-flex items-center rounded-full bg-white/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-emerald-200 ring-1 ring-white/20 backdrop-blur-sm">
            Professional borrowing capacity calculator
          </span>
          <h1 className="mt-6 text-4xl sm:text-6xl font-bold text-white leading-tight">
            Know Your{' '}
            <span className="bg-gradient-to-r from-emerald-300 to-teal-200 bg-clip-text text-transparent">
              Borrowing Power
            </span>
          </h1>
          <p className="mt-6 text-lg text-secondary leading-relaxed">
            Complete your financial profile, run loan scenarios, and get instant results with detailed
            CommBank-style repayment breakdowns — all in one secure, beautifully simple portal.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/register">
              <Button size="lg">Calculate Your Borrowing Power</Button>
            </Link>
            <Link href="/login">
              <Button variant="secondary" size="lg">Sign In to Your Portal</Button>
            </Link>
          </div>
        </div>

        {/* Feature Cards */}
        <div className="mt-24 grid md:grid-cols-3 gap-6">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="glass-dark rounded-2xl p-6 text-white transition duration-300 hover:-translate-y-1 hover:shadow-2xl"
            >
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${f.iconBg} flex items-center justify-center mb-4 shadow-lg`}>
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  {f.icon}
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-white">{f.title}</h3>
              <p className="mt-2 text-secondary/90 text-sm leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center text-sm text-secondary">
          <p>TransformBiz Credit Lenders Portal — Professional Borrowing Capacity Calculator</p>
        </div>
      </footer>
    </div>
  );
}
