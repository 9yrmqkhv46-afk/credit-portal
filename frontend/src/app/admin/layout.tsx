'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { Logo } from '@/components/ui/Logo';
import { GlassBackground } from '@/components/ui/GlassBackground';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();

  if (loading) {
    return (
      <div className="relative min-h-screen flex items-center justify-center">
        <GlassBackground variant="dark" />
        <Spinner size="lg" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="relative min-h-screen flex items-center justify-center">
        <GlassBackground variant="dark" />
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen">
      <GlassBackground variant="dark" />
      <nav className="glass-nav-dark sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center gap-8">
              <Link href="/admin" className="flex items-center gap-3" aria-label="TransformBiz Admin home">
                <span className="inline-flex items-center bg-white rounded-lg px-2 py-1 shadow-sm">
                  <Logo width={140} />
                </span>
                <span className="text-sm font-semibold text-white tracking-wide uppercase">Admin</span>
              </Link>
              <div className="hidden sm:flex items-center gap-4">
                <Link href="/admin" className="text-sm font-medium text-slate-200 hover:text-white transition-colors">
                  Clients
                </Link>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-slate-200">{user.name}</span>
              <Button variant="ghost" size="sm" onClick={logout} className="text-slate-200 hover:bg-white/10 hover:text-white">
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
