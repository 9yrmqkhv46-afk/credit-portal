'use client';

import React from 'react';
import { useAuth } from '@/context/AuthContext';
import { Spinner } from '@/components/ui/Spinner';
import { SpatialShell, ShellNavItem } from '@/components/ui/SpatialShell';

const NAV: ShellNavItem[] = [
  {
    href: '/admin',
    label: 'Clients',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-5 w-5">
        <path d="M16 11a4 4 0 10-4-4 4 4 0 004 4zm-8 1a3.5 3.5 0 10-3.5-3.5A3.5 3.5 0 008 12zm0 2c-3 0-6 1.6-6 4v2h8v-2c0-1 .4-1.9 1-2.7A9.6 9.6 0 008 14zm8 0c-3.3 0-7 1.7-7 4.3V20h14v-1.7c0-2.6-3.7-4.3-7-4.3z" />
      </svg>
    ),
  },
  {
    href: '/admin/messages',
    label: 'Messages',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-5 w-5">
        <path d="M4 4h16a2 2 0 012 2v10a2 2 0 01-2 2H8l-4 4V6a2 2 0 012-2z" />
      </svg>
    ),
  },
  {
    href: '/admin/bank-policies',
    label: 'Bank Policies 2026',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-5 w-5">
        <path d="M12 2L2 7v2h20V7L12 2zM4 11v7H3v2h18v-2h-1v-7h-2v7h-3v-7h-2v7h-2v-7H9v7H6v-7H4z" />
      </svg>
    ),
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();

  if (loading || !user) {
    return (
      <div className="relative flex min-h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <SpatialShell
      navItems={NAV}
      homeHref="/admin"
      brand="TransformBiz"
      tag="Admin"
      userName={user.name}
      onLogout={logout}
    >
      {children}
    </SpatialShell>
  );
}
