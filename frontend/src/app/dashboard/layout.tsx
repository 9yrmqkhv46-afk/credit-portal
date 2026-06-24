'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { Logo } from '@/components/ui/Logo';
import { GlassBackground } from '@/components/ui/GlassBackground';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();

  if (loading) {
    return (
      <div className="relative min-h-screen flex items-center justify-center">
        <GlassBackground variant="light" />
        <Spinner size="lg" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="relative min-h-screen flex items-center justify-center">
        <GlassBackground variant="light" />
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen">
      <GlassBackground variant="light" />
      <nav className="glass-nav sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center gap-8">
              <Link href="/dashboard" className="flex items-center gap-2" aria-label="TransformBiz home">
                <Logo width={160} />
              </Link>
              <div className="hidden sm:flex items-center gap-4">
                <Link href="/dashboard" className="text-sm font-medium text-slate-700 hover:text-brand transition-colors">
                  Dashboard
                </Link>
                <Link href="/dashboard/profile" className="text-sm font-medium text-slate-700 hover:text-brand transition-colors">
                  Profile
                </Link>
                <Link href="/dashboard/financials" className="text-sm font-medium text-slate-700 hover:text-brand transition-colors">
                  Servicing
                </Link>
                <Link href="/dashboard/calculator" className="text-sm font-medium text-slate-700 hover:text-brand transition-colors">
                  Calculator
                </Link>
                <Link href="/dashboard/properties/growth" className="text-sm font-medium text-slate-700 hover:text-brand transition-colors">
                  Property Growth
                </Link>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-slate-600">{user.name}</span>
              <Button variant="ghost" size="sm" onClick={logout}>
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
