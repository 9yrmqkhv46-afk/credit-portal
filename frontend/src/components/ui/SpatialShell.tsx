'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/Button';

export interface ShellNavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

interface SpatialShellProps {
  navItems: ShellNavItem[];
  homeHref: string;
  brand: string;
  /** Small uppercase tag shown beside the brand (e.g. "Admin"). */
  tag?: string;
  userName: string;
  onLogout: () => void;
  children: React.ReactNode;
}

/**
 * visionOS spatial shell: a left glass sidebar (260px expanded / 64px collapsed)
 * with a sliding teal active-pill that tracks the active route via
 * getBoundingClientRect, a sticky glass topbar (breadcrumb + user + collapse
 * toggle), and a single scrolling #content region. All routes/links are
 * preserved by the caller. Motion respects prefers-reduced-motion via globals.
 */
export function SpatialShell({ navItems, homeHref, brand, tag, userName, onLogout, children }: SpatialShellProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const [pill, setPill] = useState<{ top: number; height: number; visible: boolean }>({ top: 0, height: 0, visible: false });

  // Resolve the active nav index (longest matching prefix).
  const activeIndex = (() => {
    let best = -1;
    let bestLen = -1;
    navItems.forEach((it, i) => {
      if ((pathname === it.href || pathname.startsWith(it.href + '/')) && it.href.length > bestLen) {
        best = i; bestLen = it.href.length;
      }
    });
    // Exact home match fallback.
    if (best === -1) {
      const exact = navItems.findIndex((it) => it.href === pathname);
      if (exact >= 0) best = exact;
    }
    return best;
  })();

  const measure = () => {
    const el = activeIndex >= 0 ? itemRefs.current[activeIndex] : null;
    const nav = navRef.current;
    if (!el || !nav) { setPill((p) => ({ ...p, visible: false })); return; }
    const a = el.getBoundingClientRect();
    const b = nav.getBoundingClientRect();
    setPill({ top: a.top - b.top, height: a.height, visible: true });
  };

  useLayoutEffect(() => { measure(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [activeIndex, collapsed, pathname]);
  useEffect(() => {
    const onResize = () => measure();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, collapsed]);

  const breadcrumb = activeIndex >= 0 ? navItems[activeIndex].label : brand;

  return (
    <div className="relative flex min-h-screen">
      {/* Sidebar */}
      <aside
        className="spatial-sidebar sticky top-0 z-40 flex h-screen flex-col"
        style={{ width: collapsed ? 64 : 260 }}
      >
        <div className="flex h-16 items-center gap-2 px-4">
          <Link href={homeHref} aria-label={`${brand} home`} className="flex items-center gap-2 overflow-hidden">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-brand-dark text-sm font-bold text-white shadow-[0_0_16px_-2px_rgba(0,196,212,0.7)]">
              T
            </span>
            {!collapsed && (
              <span className="truncate font-display text-sm font-bold tracking-tight text-primary">
                {brand}
                {tag && <span className="ml-1 text-[10px] font-semibold uppercase text-brand">{tag}</span>}
              </span>
            )}
          </Link>
        </div>

        <nav ref={navRef} className="relative mt-2 flex-1 px-2" aria-label="Primary">
          {/* Sliding teal active-pill */}
          <span
            className="nav-pill"
            aria-hidden="true"
            style={{ transform: `translateY(${pill.top}px)`, height: pill.height, opacity: pill.visible ? 1 : 0 }}
          />
          <ul className="relative z-10 space-y-1">
            {navItems.map((it, i) => {
              const active = i === activeIndex;
              return (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    ref={(el) => { itemRefs.current[i] = el; }}
                    title={collapsed ? it.label : undefined}
                    aria-current={active ? 'page' : undefined}
                    className={`flex min-h-[44px] items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                      active ? 'text-primary' : 'text-secondary hover:text-primary'
                    }`}
                  >
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center ${active ? 'text-brand' : ''}`}>
                      {it.icon}
                    </span>
                    {!collapsed && <span className="truncate">{it.label}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-white/10 p-2">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            data-collapsed={collapsed ? 'true' : 'false'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="collapse-btn flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-secondary transition-colors hover:bg-white/10 hover:text-primary"
          >
            <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-h-screen flex-1 flex-col">
        <header className="glass-nav sticky top-0 z-30 flex h-16 items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="text-xs text-faint">{brand}</span>
            <span className="text-faint" aria-hidden="true">/</span>
            <span className="font-display text-sm font-semibold text-primary">{breadcrumb}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-secondary sm:inline">{userName}</span>
            <Button variant="ghost" size="sm" onClick={onLogout}>Sign Out</Button>
          </div>
        </header>

        <main id="content" className="flex-1 overflow-y-auto px-4 py-8 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

export default SpatialShell;
