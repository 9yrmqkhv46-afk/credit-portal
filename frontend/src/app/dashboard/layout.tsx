'use client';

import React from 'react';
import { useAuth } from '@/context/AuthContext';
import { Spinner } from '@/components/ui/Spinner';
import { SpatialShell, ShellNavItem } from '@/components/ui/SpatialShell';

const ICONS = {
  dashboard: <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" />,
  profile: <path d="M12 12a5 5 0 100-10 5 5 0 000 10zm0 2c-5 0-9 2.5-9 6v2h18v-2c0-3.5-4-6-9-6z" />,
  calculator: <path d="M7 2h10a2 2 0 012 2v16a2 2 0 01-2 2H7a2 2 0 01-2-2V4a2 2 0 012-2zm0 5h10V4H7v3zm1 3h2v2H8v-2zm0 4h2v2H8v-2zm4-4h2v2h-2v-2zm0 4h4v2h-4v-2zm4-4h2v2h-2v-2z" />,
  growth: <path d="M3 3v18h18v-2H5V3H3zm14.5 4L13 11.5l-3-3L6 12.5 7.4 14l2.6-2.6 3 3L18.9 8.4 21 10.5V5h-5.5l2 2z" />,
  timeline: <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 5h-2v6l5 3 1-1.7-4-2.3V7z" />,
  messages: <path d="M4 4h16a2 2 0 012 2v10a2 2 0 01-2 2H8l-4 4V6a2 2 0 012-2z" />,
};

function Svg({ children }: { children: React.ReactNode }) {
  return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-5 w-5">{children}</svg>;
}

const NAV: ShellNavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: <Svg>{ICONS.dashboard}</Svg> },
  { href: '/dashboard/application', label: 'Application Status', icon: <Svg>{ICONS.timeline}</Svg> },
  { href: '/dashboard/messages', label: 'Messages', icon: <Svg>{ICONS.messages}</Svg> },
  { href: '/dashboard/profile', label: 'Profile', icon: <Svg>{ICONS.profile}</Svg> },
  { href: '/dashboard/calculator', label: 'Calculator', icon: <Svg>{ICONS.calculator}</Svg> },
  { href: '/dashboard/properties/growth', label: 'Property Growth', icon: <Svg>{ICONS.growth}</Svg> },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
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
      homeHref="/dashboard"
      brand="TransformBiz"
      userName={user.name}
      onLogout={logout}
    >
      {children}
    </SpatialShell>
  );
}
