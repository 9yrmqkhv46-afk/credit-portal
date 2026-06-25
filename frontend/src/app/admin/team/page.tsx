'use client';

import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';

/**
 * Mandate 5 — Section B: Team Management (Super Admin only).
 *
 * NOTE: Multi-admin RBAC requires backend role columns + endpoints. This panel
 * is an interactive front-end simulation (in-memory) so the workflow can be
 * demonstrated end-to-end; account creation/edits are not yet persisted.
 */

const ROLES = [
  { value: 'SUPER_ADMIN', label: 'Super Admin' },
  { value: 'SENIOR_BROKER', label: 'Senior Broker' },
  { value: 'BROKER', label: 'Broker' },
  { value: 'ASSISTANT', label: 'Assistant' },
];

interface Admin {
  id: string;
  name: string;
  email: string;
  role: string;
  lastLogin: string;
  active: boolean;
  clients: number;
}

const SEED: Admin[] = [
  { id: '1', name: 'Sarah Chen', email: 'sarah@transformbiz.com', role: 'SUPER_ADMIN', lastLogin: 'Today, 9:12 AM', active: true, clients: 12 },
  { id: '2', name: 'James Patel', email: 'james@transformbiz.com', role: 'SENIOR_BROKER', lastLogin: 'Yesterday, 4:40 PM', active: true, clients: 8 },
  { id: '3', name: 'Mia Rossi', email: 'mia@transformbiz.com', role: 'BROKER', lastLogin: '3 days ago', active: true, clients: 5 },
  { id: '4', name: 'Tom Nguyen', email: 'tom@transformbiz.com', role: 'ASSISTANT', lastLogin: '2 weeks ago', active: false, clients: 0 },
];

function roleLabel(v: string): string {
  return ROLES.find((r) => r.value === v)?.label ?? v;
}

export default function TeamManagementPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [admins, setAdmins] = useState<Admin[]>(SEED);
  const [addOpen, setAddOpen] = useState(false);
  const [removeFor, setRemoveFor] = useState<Admin | null>(null);
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', role: 'BROKER' });

  // Single-tier deployments seed an ADMIN; treat ADMIN as super-admin here.
  const isSuperAdmin = user?.role === 'ADMIN' || (user?.role as string) === 'SUPER_ADMIN';

  const hasUnassigned = admins.some((a) => !a.active && a.clients === 0) && admins.some((a) => !a.active);

  const addMember = () => {
    if (!form.firstName || !form.lastName || !form.email) {
      toast('Please complete all fields', { accent: 'crimson' });
      return;
    }
    const a: Admin = {
      id: String(Date.now()),
      name: `${form.firstName} ${form.lastName}`,
      email: form.email,
      role: form.role,
      lastLogin: 'Never',
      active: true,
      clients: 0,
    };
    setAdmins((xs) => [...xs, a]);
    toast(`Welcome email sent to ${form.email}`, { accent: 'emerald' });
    setAddOpen(false);
    setForm({ firstName: '', lastName: '', email: '', role: 'BROKER' });
  };

  const toggleActive = (a: Admin) => {
    setAdmins((xs) => xs.map((x) => (x.id === a.id ? { ...x, active: !x.active } : x)));
    toast(a.active ? `${a.name} deactivated` : `${a.name} reactivated`, { accent: a.active ? 'gold' : 'emerald' });
  };

  const remove = () => {
    if (!removeFor) return;
    setAdmins((xs) => xs.filter((x) => x.id !== removeFor.id));
    toast(`${removeFor.name} removed from the team`, { accent: 'crimson' });
    setRemoveFor(null);
  };

  if (!isSuperAdmin) {
    return (
      <div className="glass-3 rounded-2xl p-8 text-center">
        <h1 className="font-display text-xl font-bold text-primary">Team Management</h1>
        <p className="mt-2 text-secondary">This area is restricted to Super Admins.</p>
      </div>
    );
  }

  const input = 'glass-input w-full rounded-xl border border-white/15 px-3 py-2 text-sm text-primary focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-primary">Team Management</h1>
          <p className="mt-1 text-secondary">{admins.length} team members</p>
        </div>
        <button type="button" onClick={() => setAddOpen(true)} className="rounded-xl bg-gradient-to-br from-brand to-brand-dark px-4 py-2 text-sm font-semibold text-on-accent shadow-lg shadow-brand/30 hover:brightness-110">
          + Add Team Member
        </button>
      </div>

      {hasUnassigned && (
        <div className="rounded-xl bg-gold-light/60 px-4 py-2 text-sm text-gold ring-1 ring-gold/30">
          Some deactivated members have unassigned clients. Reassign them to keep coverage.
        </div>
      )}

      <div className="glass-2 overflow-x-auto rounded-2xl">
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs font-semibold uppercase tracking-wider text-muted">
              <th className="px-5 py-3">Name</th>
              <th className="px-5 py-3">Role</th>
              <th className="px-5 py-3">Last Login</th>
              <th className="px-5 py-3">Clients</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {admins.map((a) => (
              <tr key={a.id} className={`border-b border-white/6 ${a.active ? '' : 'opacity-50'}`}>
                <td className="px-5 py-3">
                  <p className="text-sm font-medium text-primary">{a.name}</p>
                  <p className="text-xs text-muted">{a.email}</p>
                </td>
                <td className="px-5 py-3 text-sm text-secondary">{roleLabel(a.role)}</td>
                <td className="px-5 py-3 text-sm text-secondary">{a.lastLogin}</td>
                <td className="tnum px-5 py-3 text-sm text-secondary">{a.clients}</td>
                <td className="px-5 py-3">
                  {a.active
                    ? <span className="rounded-full bg-success-light px-2.5 py-0.5 text-xs font-semibold text-emerald ring-1 ring-emerald/40">Active</span>
                    : <span className="rounded-full bg-white/8 px-2.5 py-0.5 text-xs font-semibold text-muted ring-1 ring-white/15">Inactive</span>}
                </td>
                <td className="px-5 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => toggleActive(a)} className={`text-xs font-medium ${a.active ? 'text-gold hover:underline' : 'text-emerald hover:underline'}`}>
                      {a.active ? 'Deactivate' : 'Reactivate'}
                    </button>
                    <button type="button" onClick={() => setRemoveFor(a)} className="text-xs font-medium text-crimson hover:underline">Remove</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add member modal */}
      {addOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setAddOpen(false)} />
          <div className="glass-4 animate-pop relative w-full max-w-md rounded-2xl p-6">
            <h3 className="font-display text-lg font-semibold text-primary">Add Team Member</h3>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <input className={input} placeholder="First name" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
              <input className={input} placeholder="Last name" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            </div>
            <input className={`${input} mt-3`} type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <select className={`${input} mt-3`} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setAddOpen(false)} className="rounded-xl px-4 py-2 text-sm font-semibold text-secondary ring-1 ring-white/15 hover:bg-white/10">Cancel</button>
              <button type="button" onClick={addMember} className="rounded-xl bg-gradient-to-br from-brand to-brand-dark px-4 py-2 text-sm font-semibold text-on-accent hover:brightness-110">Create Account</button>
            </div>
          </div>
        </div>
      )}

      {/* Remove confirmation */}
      {removeFor && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setRemoveFor(null)} />
          <div className="glass-4 animate-pop relative w-full max-w-sm rounded-2xl p-6">
            <h3 className="font-display text-lg font-semibold text-crimson">Remove {removeFor.name}?</h3>
            <p className="mt-1 text-sm text-secondary">They will lose access immediately. Their {removeFor.clients} client(s) will need reassigning.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setRemoveFor(null)} className="rounded-xl px-4 py-2 text-sm font-semibold text-secondary ring-1 ring-white/15 hover:bg-white/10">Cancel</button>
              <button type="button" onClick={remove} className="rounded-xl bg-crimson px-4 py-2 text-sm font-semibold text-on-accent hover:brightness-110">Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
