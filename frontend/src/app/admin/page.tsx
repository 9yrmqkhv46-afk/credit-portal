'use client';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Spinner } from '@/components/ui/Spinner';
import { Alert } from '@/components/ui/Alert';
import { Microsoft365Banner } from '@/components/admin/Microsoft365Banner';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';
import { AdminClientListItem } from '@/types';

type Row = {
  id: string;
  name: string;
  email: string;
  status: string;
  createdAt: string;
  latestScenario: { createdAt?: string; maxBorrowingCapacity?: number | null; dtiRatio?: number | null } | null;
};

const TABS = ['All', 'Active', 'Prospect', 'Inactive', 'Archived'] as const;
type Tab = typeof TABS[number];

// Simulated broker pool for the Transfer action (real assignment needs a
// broker-assignment column + endpoint — see PR notes).
const BROKERS = ['Sarah Chen (Senior Broker)', 'James Patel (Broker)', 'Mia Rossi (Broker)', 'Tom Nguyen (Assistant)'];

function daysSince(iso?: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return null;
  return Math.floor((Date.now() - d) / (1000 * 60 * 60 * 24));
}

function statusPill(status: string): string {
  switch (status) {
    case 'Active': return 'bg-success-light text-emerald ring-emerald/40';
    case 'Prospect': return 'bg-gold-light text-gold ring-gold/40';
    case 'Archived': return 'bg-white/8 text-muted ring-white/15';
    default: return 'bg-white/8 text-secondary ring-white/15';
  }
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const [clients, setClients] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>('All');
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [transferFor, setTransferFor] = useState<Row | null>(null);
  const [deleteFor, setDeleteFor] = useState<Row | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  // Single-tier deployments seed an ADMIN; treat ADMIN as super-admin here.
  const isSuperAdmin = user?.role === 'ADMIN' || (user?.role as string) === 'SUPER_ADMIN';

  const fetchClients = async () => {
    try {
      const res = await api.get('/admin/clients');
      const data = res.data.clients || res.data;
      const mapped: Row[] = Array.isArray(data) ? data.map((c: any) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        status: c.status || c.clientProfile?.status || 'Prospect',
        createdAt: c.createdAt,
        latestScenario: c.latestScenario || (c.loanScenarios?.[0] ?? null),
      })) : [];
      setClients(mapped);
    } catch {
      setError('Failed to load clients.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchClients(); }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(null);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = { All: clients.length };
    for (const t of TABS) if (t !== 'All') c[t] = clients.filter((x) => x.status === t).length;
    return c;
  }, [clients]);

  const filtered = useMemo(() => {
    let list = clients;
    if (tab !== 'All') list = list.filter((c) => c.status === tab);
    if (search) {
      const term = search.toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(term) || c.email.toLowerCase().includes(term) || c.status.toLowerCase().includes(term));
    }
    return list;
  }, [clients, tab, search]);

  const setStatus = async (row: Row, status: string, msg: string) => {
    setMenuOpen(null);
    // Optimistic update.
    setClients((cs) => cs.map((c) => (c.id === row.id ? { ...c, status } : c)));
    try {
      await api.patch(`/admin/clients/${row.id}/status`, { status });
      toast(msg, { accent: status === 'Archived' ? 'gold' : 'emerald' });
    } catch {
      toast('Could not update status', { accent: 'crimson' });
      fetchClients();
    }
  };

  const confirmTransfer = (broker: string) => {
    if (!transferFor) return;
    // Simulated assignment (no broker column yet).
    toast(`${transferFor.name} transferred to ${broker}`, { accent: 'teal' });
    setTransferFor(null);
  };

  const confirmDelete = () => {
    if (!deleteFor || deleteConfirm !== 'DELETE') return;
    const target = deleteFor;
    // Simulated delete (no destructive backend endpoint — see PR notes).
    setClients((cs) => cs.filter((c) => c.id !== target.id));
    toast(`${target.name} removed`, { accent: 'crimson' });
    setDeleteFor(null);
    setDeleteConfirm('');
  };

  if (loading) return <Spinner size="lg" className="py-20" />;
  if (error) return <Alert variant="error">{error}</Alert>;

  return (
    <div className="space-y-5">
      <Microsoft365Banner />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-primary">Client Management</h1>
          <p className="mt-1 text-secondary">{clients.length} total clients</p>
        </div>
        <input
          placeholder="Search clients…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="glass-input w-64 rounded-xl border border-white/15 px-3.5 py-2 text-sm text-primary focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 transition ${
              tab === t ? 'bg-brand/20 text-brand ring-brand/50' : 'text-secondary ring-white/15 hover:bg-white/10 hover:text-primary'
            }`}
          >
            {t} <span className="tnum text-xs opacity-70">{counts[t] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="glass-2 overflow-visible rounded-2xl">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Activity</th>
                <th className="px-5 py-3">Last Scenario</th>
                <th className="px-5 py-3">Max Borrowing</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((client) => {
                const ls = client.latestScenario;
                const since = daysSince(ls?.createdAt || client.createdAt);
                const archived = client.status === 'Archived';
                return (
                  <tr key={client.id} className={`border-b border-white/6 transition-colors hover:bg-white/6 ${archived ? 'opacity-50' : ''}`}>
                    <td className="cursor-pointer px-5 py-3" onClick={() => router.push(`/admin/clients/${client.id}`)}>
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand to-brand-dark text-xs font-bold text-on-accent">
                          {client.name.charAt(0).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-primary">{client.name}</p>
                          <p className="truncate text-xs text-muted">{client.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${statusPill(client.status)}`}>{client.status}</span>
                    </td>
                    <td className="px-5 py-3">
                      {since == null ? (
                        <span className="text-xs text-muted">—</span>
                      ) : since > 30 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-danger-light px-2 py-0.5 text-xs font-semibold text-crimson ring-1 ring-crimson/40">
                          <span className="h-1.5 w-1.5 rounded-full bg-crimson animate-ping-slow" /> At Risk · {since}d
                        </span>
                      ) : since > 14 ? (
                        <span className="rounded-full bg-gold-light px-2 py-0.5 text-xs font-semibold text-gold ring-1 ring-gold/40">Quiet · {since}d</span>
                      ) : (
                        <span className="tnum text-xs text-secondary">Active · {since}d ago</span>
                      )}
                    </td>
                    <td className="tnum px-5 py-3 text-sm text-secondary">
                      {ls?.createdAt ? new Date(ls.createdAt).toLocaleDateString() : '—'}
                    </td>
                    <td className="tnum px-5 py-3 text-sm font-semibold text-primary">
                      {ls?.maxBorrowingCapacity != null ? `$${ls.maxBorrowingCapacity.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="relative inline-block" ref={menuOpen === client.id ? menuRef : undefined}>
                        <button
                          type="button"
                          aria-label="Actions"
                          onClick={() => setMenuOpen(menuOpen === client.id ? null : client.id)}
                          className="rounded-lg px-2 py-1 text-lg leading-none text-muted hover:bg-white/10 hover:text-primary"
                        >
                          ⋯
                        </button>
                        {menuOpen === client.id && (
                          <div className="absolute right-0 z-30 mt-1 w-52 rounded-xl glass-4 p-1.5 text-left">
                            <button type="button" onClick={() => { setMenuOpen(null); router.push(`/admin/clients/${client.id}`); }} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-secondary hover:bg-white/10 hover:text-primary">Edit client details</button>
                            {archived ? (
                              <button type="button" onClick={() => setStatus(client, 'Active', `${client.name} reactivated`)} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-emerald hover:bg-white/10">Reactivate client</button>
                            ) : (
                              <button type="button" onClick={() => setStatus(client, 'Archived', `${client.name} archived`)} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-gold hover:bg-white/10">Archive client</button>
                            )}
                            <button type="button" onClick={() => { setMenuOpen(null); setTransferFor(client); }} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-secondary hover:bg-white/10 hover:text-primary">Transfer to broker</button>
                            {isSuperAdmin && (
                              <button type="button" onClick={() => { setMenuOpen(null); setDeleteFor(client); setDeleteConfirm(''); }} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-crimson hover:bg-danger-light/60">Delete client</button>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-sm text-muted">No clients in this view.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Transfer modal */}
      {transferFor && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setTransferFor(null)} />
          <div className="glass-4 animate-pop relative w-full max-w-sm rounded-2xl p-6">
            <h3 className="font-display text-lg font-semibold text-primary">Transfer {transferFor.name}</h3>
            <p className="mt-1 text-sm text-secondary">Reassign this client to another broker.</p>
            <div className="mt-4 space-y-1.5">
              {BROKERS.map((b) => (
                <button key={b} type="button" onClick={() => confirmTransfer(b)} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-secondary ring-1 ring-white/12 hover:bg-white/10 hover:text-primary">{b}</button>
              ))}
            </div>
            <div className="mt-5 flex justify-end">
              <button type="button" onClick={() => setTransferFor(null)} className="rounded-xl px-4 py-2 text-sm font-semibold text-secondary ring-1 ring-white/15 hover:bg-white/10">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteFor && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDeleteFor(null)} />
          <div className="glass-4 animate-pop relative w-full max-w-sm rounded-2xl p-6">
            <h3 className="font-display text-lg font-semibold text-crimson">Delete {deleteFor.name}?</h3>
            <p className="mt-1 text-sm text-secondary">This permanently removes the client. Type <span className="font-mono font-semibold text-primary">DELETE</span> to confirm.</p>
            <input
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder="DELETE"
              className="glass-input mt-3 w-full rounded-xl border border-white/15 px-3 py-2 text-sm text-primary focus:border-crimson focus:outline-none focus:ring-2 focus:ring-crimson/30"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteFor(null)} className="rounded-xl px-4 py-2 text-sm font-semibold text-secondary ring-1 ring-white/15 hover:bg-white/10">Cancel</button>
              <button type="button" onClick={confirmDelete} disabled={deleteConfirm !== 'DELETE'} className="rounded-xl bg-crimson px-4 py-2 text-sm font-semibold text-on-accent hover:brightness-110 disabled:opacity-40">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
