'use client';

import React, { useEffect, useState } from 'react';
import api from '@/lib/api';
import { useToast } from '@/components/ui/Toast';

/** Backend origin (strip the trailing /api) for the OAuth redirect. */
function backendOrigin(): string {
  const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
  return base.replace(/\/api\/?$/, '');
}

/**
 * Mandate 5 — Section D: "Connect Microsoft 365" onboarding banner.
 * Shown on the admin dashboard until Microsoft OAuth is connected. Once
 * connected it collapses to a small green "Connected" pill.
 */
export function Microsoft365Banner() {
  const { toast } = useToast();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Surface the OAuth callback result (?ms365=connected|error).
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const status = params.get('ms365');
      if (status === 'connected') toast('Microsoft 365 connected', { accent: 'emerald' });
      else if (status === 'error') toast('Microsoft 365 connection failed', { accent: 'crimson' });
    }
    api.get('/meetings/status')
      .then((res) => setConnected(Boolean(res.data.connected)))
      .catch(() => setConnected(false));
  }, [toast]);

  if (connected) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-success-light px-3 py-1 text-xs font-semibold text-emerald ring-1 ring-emerald/40">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald" /> Microsoft 365 Connected
      </span>
    );
  }

  if (connected === null || dismissed) return null;

  return (
    <div className="glass-3 animate-enter flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3 ring-1 ring-brand/30">
      <p className="flex items-center gap-2 text-sm text-secondary">
        <span className="text-base">🔗</span>
        Connect Microsoft 365 to enable Teams meetings and calendar sync.
      </p>
      <div className="flex items-center gap-2">
        <a
          href={`${backendOrigin()}/auth/microsoft`}
          className="rounded-lg bg-gradient-to-br from-brand to-brand-dark px-3 py-1.5 text-sm font-semibold text-on-accent shadow-lg shadow-brand/30 hover:brightness-110"
        >
          Connect Microsoft 365 →
        </a>
        <button type="button" aria-label="Dismiss" onClick={() => setDismissed(true)} className="rounded-md px-2 text-muted hover:text-primary">×</button>
      </div>
    </div>
  );
}

export default Microsoft365Banner;
