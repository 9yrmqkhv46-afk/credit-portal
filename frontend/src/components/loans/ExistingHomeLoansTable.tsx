'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import api from '@/lib/api';
import { ExistingHomeLoan } from '@/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Alert } from '@/components/ui/Alert';
import { money, pct, setIncludeInServicing } from '@/lib/servicingUi';

function extractApiError(err: unknown, fallback: string): string {
  const ax = err as AxiosError<{ error?: string; details?: { message: string }[] }>;
  return ax.response?.data?.details?.[0]?.message || ax.response?.data?.error || fallback;
}
function optNum(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : undefined;
}

type Editable = Partial<ExistingHomeLoan>;
const EMPTY: Editable = {
  locFlag: false, investmentFlag: false, loanAmount: 0, interestRate: 0.06, termYears: 30,
  ioTermYears: 0, monthlyRepayment: null, lender: '', securityLinks: 0, ownership: '', includeInServicing: true,
};

interface Props { readOnly?: boolean; initialLoans?: ExistingHomeLoan[]; }

export function ExistingHomeLoansTable({ readOnly = false, initialLoans }: Props) {
  const [items, setItems] = useState<ExistingHomeLoan[]>(initialLoans || []);
  const [loading, setLoading] = useState(!initialLoans);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Editable>(EMPTY);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await api.get('/client/existing-home-loans');
      setItems(Array.isArray(res.data?.existingHomeLoans) ? res.data.existingHomeLoans : []);
    } catch { setError('Unable to load existing home loans.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (!initialLoans) fetchData(); }, [initialLoans, fetchData]);

  const includedCount = items.filter((l) => l.includeInServicing !== false).length;

  async function toggleInclude(l: ExistingHomeLoan) {
    if (readOnly) return;
    const next = !(l.includeInServicing !== false);
    setItems((prev) => prev.map((x) => (x.id === l.id ? { ...x, includeInServicing: next } : x)));
    try { await setIncludeInServicing('existingHomeLoan', l.id, next); }
    catch {
      setItems((prev) => prev.map((x) => (x.id === l.id ? { ...x, includeInServicing: !next } : x)));
      setError('Failed to update servicing selection.');
    }
  }

  function openAdd() { setEditing({ ...EMPTY }); setEditId(null); setError(''); setModalOpen(true); }
  function openEdit(l: ExistingHomeLoan) {
    setEditing({ ...l }); setEditId(l.id); setError(''); setModalOpen(true);
  }

  async function save() {
    setSaving(true); setError('');
    const payload = {
      locFlag: !!editing.locFlag,
      investmentFlag: !!editing.investmentFlag,
      loanAmount: optNum(editing.loanAmount) ?? 0,
      interestRate: optNum(editing.interestRate) ?? 0,
      termYears: optNum(editing.termYears) ?? 30,
      ioTermYears: optNum(editing.ioTermYears) ?? 0,
      monthlyRepayment: optNum(editing.monthlyRepayment) ?? null,
      lender: editing.lender || null,
      securityLinks: optNum(editing.securityLinks) ?? 0,
      ownership: editing.ownership || null,
      includeInServicing: editing.includeInServicing !== false,
    };
    try {
      if (editId) await api.put(`/client/existing-home-loans/${editId}`, payload);
      else await api.post('/client/existing-home-loans', payload);
      setModalOpen(false); await fetchData();
    } catch (err) { setError(extractApiError(err, 'Failed to save loan.')); }
    finally { setSaving(false); }
  }

  async function remove(l: ExistingHomeLoan) {
    if (!confirm('Delete this existing home loan?')) return;
    try { await api.delete(`/client/existing-home-loans/${l.id}`); await fetchData(); }
    catch { setError('Failed to delete loan.'); }
  }

  if (loading) return <p className="text-sm text-slate-500">Loading existing home loans…</p>;

  return (
    <div className="space-y-4">
      {error && <Alert variant="error">{error}</Alert>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium text-slate-700">
          {items.length} existing home loan{items.length === 1 ? '' : 's'},{' '}
          <span className="text-brand">{includedCount} included</span>
        </p>
        {!readOnly && <Button size="sm" onClick={openAdd}>+ Add existing loan</Button>}
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/50 bg-white/40 backdrop-blur-sm">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-white/60 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Lender</th>
              <th className="px-3 py-2">LOC</th>
              <th className="px-3 py-2">Investment</th>
              <th className="px-3 py-2">Loan amount</th>
              <th className="px-3 py-2">Rate</th>
              <th className="px-3 py-2">Term</th>
              <th className="px-3 py-2">IO term</th>
              <th className="px-3 py-2">Monthly repay</th>
              <th className="px-3 py-2">Security links</th>
              <th className="px-3 py-2">Ownership</th>
              <th className="px-3 py-2">Include</th>
              {!readOnly && <th className="px-3 py-2">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {items.map((l, idx) => (
              <tr key={l.id} className="border-b border-white/30 text-slate-800">
                <td className="px-3 py-2">{idx + 1}</td>
                <td className="px-3 py-2">{l.lender || '—'}</td>
                <td className="px-3 py-2">{l.locFlag ? 'Yes' : 'No'}</td>
                <td className="px-3 py-2">{l.investmentFlag ? 'Yes' : 'No'}</td>
                <td className="px-3 py-2">{money(l.loanAmount)}</td>
                <td className="px-3 py-2">{pct(l.interestRate * 100)}</td>
                <td className="px-3 py-2">{l.termYears} yr</td>
                <td className="px-3 py-2">{l.ioTermYears} yr</td>
                <td className="px-3 py-2">{money(l.monthlyRepayment)}</td>
                <td className="px-3 py-2">{l.securityLinks}</td>
                <td className="px-3 py-2">{l.ownership || '—'}</td>
                <td className="px-3 py-2">
                  <input type="checkbox" disabled={readOnly} checked={l.includeInServicing !== false}
                    onChange={() => toggleInclude(l)}
                    className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand" />
                </td>
                {!readOnly && (
                  <td className="px-3 py-2 whitespace-nowrap">
                    <button onClick={() => openEdit(l)} className="mr-2 text-xs font-medium text-brand hover:underline">Edit</button>
                    <button onClick={() => remove(l)} className="text-xs font-medium text-red-600 hover:underline">Delete</button>
                  </td>
                )}
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={readOnly ? 12 : 13} className="px-3 py-6 text-center text-sm text-slate-500">No existing home loans.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editId ? 'Edit existing loan' : 'Add existing loan'}>
          <div className="space-y-3">
            {error && <Alert variant="error">{error}</Alert>}
            <div className="grid grid-cols-2 gap-3">
              <Input label="Lender" value={editing.lender || ''} onChange={(e) => setEditing({ ...editing, lender: e.target.value })} />
              <Input label="Loan amount" type="number" min="0" value={String(editing.loanAmount ?? '')}
                onChange={(e) => setEditing({ ...editing, loanAmount: parseFloat(e.target.value) || 0 })} />
              <Input label="Interest rate (%)" type="number" step="0.01" min="0"
                value={editing.interestRate != null ? String(editing.interestRate * 100) : ''}
                onChange={(e) => setEditing({ ...editing, interestRate: e.target.value === '' ? 0 : parseFloat(e.target.value) / 100 })} />
              <Input label="Term (yrs)" type="number" min="1" max="40" value={String(editing.termYears ?? 30)}
                onChange={(e) => setEditing({ ...editing, termYears: parseInt(e.target.value) || 30 })} />
              <Input label="IO term (yrs)" type="number" min="0" max="40" value={String(editing.ioTermYears ?? 0)}
                onChange={(e) => setEditing({ ...editing, ioTermYears: parseInt(e.target.value) || 0 })} />
              <Input label="Monthly repayment" type="number" min="0" placeholder="Optional" value={String(editing.monthlyRepayment ?? '')}
                onChange={(e) => setEditing({ ...editing, monthlyRepayment: e.target.value === '' ? null : parseFloat(e.target.value) })} />
              <Input label="Security links" type="number" min="0" value={String(editing.securityLinks ?? 0)}
                onChange={(e) => setEditing({ ...editing, securityLinks: parseInt(e.target.value) || 0 })} />
              <Input label="Ownership" value={editing.ownership || ''} onChange={(e) => setEditing({ ...editing, ownership: e.target.value })} />
            </div>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={!!editing.locFlag} onChange={(e) => setEditing({ ...editing, locFlag: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand" /> Line of credit
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={!!editing.investmentFlag} onChange={(e) => setEditing({ ...editing, investmentFlag: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand" /> Investment
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={editing.includeInServicing !== false} onChange={(e) => setEditing({ ...editing, includeInServicing: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand" /> Include in servicing
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button onClick={save} loading={saving}>{editId ? 'Save' : 'Add'}</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default ExistingHomeLoansTable;
