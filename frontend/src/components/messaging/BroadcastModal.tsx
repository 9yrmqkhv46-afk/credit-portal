'use client';

import React, { useMemo, useState } from 'react';
import api from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { AdminClientListItem } from '@/types';

interface Props {
  open: boolean;
  onClose: () => void;
  clients: AdminClientListItem[];
  onSent?: () => void;
}

type Audience = 'all' | 'active' | 'custom';

/**
 * Mandate 5 — Section E: Broadcast a message to many clients at once.
 * Posts to /api/admin/messages/broadcast and animates a per-recipient
 * "sending" progress indicator.
 */
export function BroadcastModal({ open, onClose, clients, onSent }: Props) {
  const { toast } = useToast();
  const [audience, setAudience] = useState<Audience>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(0);

  const recipients = useMemo(() => {
    if (audience === 'active') return clients.filter((c) => c.clientProfile?.status === 'Active');
    if (audience === 'custom') return clients.filter((c) => selected.has(c.id));
    return clients;
  }, [audience, clients, selected]);

  if (!open) return null;

  const toggle = (id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const send = async () => {
    if (!body.trim()) { toast('Enter a message to broadcast', { accent: 'crimson' }); return; }
    if (recipients.length === 0) { toast('No recipients selected', { accent: 'crimson' }); return; }
    setSending(true);
    setProgress(0);
    // Animated per-recipient ticker for feedback.
    const total = recipients.length;
    let i = 0;
    const ticker = window.setInterval(() => {
      i = Math.min(total, i + 1);
      setProgress(i);
      if (i >= total) window.clearInterval(ticker);
    }, Math.max(60, Math.min(220, 1200 / total)));
    try {
      const payload = audience === 'custom'
        ? { body: body.trim(), clientIds: Array.from(selected) }
        : { body: body.trim(), audience };
      const res = await api.post('/admin/messages/broadcast', payload);
      window.clearInterval(ticker);
      setProgress(total);
      toast(`Broadcast sent to ${res.data.sent ?? total} client(s)`, { accent: 'emerald' });
      onSent?.();
      setBody('');
      setSelected(new Set());
      setSending(false);
      onClose();
    } catch {
      window.clearInterval(ticker);
      setSending(false);
      toast('Could not send broadcast', { accent: 'crimson' });
    }
  };

  const opt = (val: Audience, label: string) => (
    <button type="button" onClick={() => setAudience(val)} className={`rounded-lg px-3 py-1.5 text-sm font-medium ring-1 transition ${audience === val ? 'bg-brand/20 text-brand ring-brand/50' : 'text-secondary ring-white/15 hover:bg-white/10'}`}>
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[110] overflow-y-auto" role="dialog" aria-modal="true" aria-label="Broadcast message">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
        <div className="glass-4 animate-pop relative w-full max-w-lg rounded-2xl p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold text-primary">Broadcast Message</h3>
            <button type="button" aria-label="Close" onClick={onClose} className="rounded-md px-2 text-muted hover:text-primary">×</button>
          </div>

          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Recipients</span>
          <div className="flex flex-wrap gap-2">
            {opt('all', `All clients (${clients.length})`)}
            {opt('active', `Active only (${clients.filter((c) => c.clientProfile?.status === 'Active').length})`)}
            {opt('custom', 'Custom selection')}
          </div>

          {audience === 'custom' && (
            <div className="mt-3 max-h-40 space-y-1 overflow-y-auto rounded-xl border border-white/12 p-2">
              {clients.map((c) => (
                <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm text-secondary hover:bg-white/8">
                  <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} className="accent-[var(--accent-teal)]" />
                  <span className="truncate">{c.name}</span>
                  <span className="ml-auto truncate text-xs text-muted">{c.email}</span>
                </label>
              ))}
            </div>
          )}

          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            placeholder="Type your broadcast message…"
            className="glass-input mt-3 w-full resize-none rounded-xl border border-white/15 px-3 py-2 text-sm text-primary focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
          />

          <p className="mt-2 rounded-lg bg-gold-light/60 px-3 py-2 text-xs text-gold ring-1 ring-gold/30">
            This sends the same message to all {recipients.length} selected client(s). Review before sending.
          </p>

          {sending && (
            <div className="mt-3">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div className="h-full bg-brand transition-all" style={{ width: `${recipients.length ? (progress / recipients.length) * 100 : 0}%` }} />
              </div>
              <p className="tnum mt-1 text-center text-xs text-muted">Sending {progress} / {recipients.length}…</p>
            </div>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-semibold text-secondary ring-1 ring-white/15 hover:bg-white/10">Cancel</button>
            <button type="button" onClick={send} disabled={sending} className="rounded-xl bg-gradient-to-br from-brand to-brand-dark px-4 py-2 text-sm font-semibold text-on-accent shadow-lg shadow-brand/30 hover:brightness-110 disabled:opacity-50">
              Send Broadcast
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default BroadcastModal;
