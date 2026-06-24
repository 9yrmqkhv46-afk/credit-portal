'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import api from '@/lib/api';
import { ProposedHomeLoan } from '@/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
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

type Editable = Partial<ProposedHomeLoan>;
const EMPTY: Editable = {
  productType: '', investmentFlag: false, loanAmount: 0, termYears: 30, ioTermYears: 0,
  interestRate: 0.06, lvr: null, overrideRate: false, securityLinks: 0, ownership: '', includeInServicing: true,
};

interface Props { readOnly?: boolean; initialLoans?: ProposedHomeLoan[]; }

export function ProposedHomeLoansTable({ readOnly = false, initialLoans }: Props) {
  const [items, setItems] = useState<ProposedHomeLoan[]>(initialLoans || []);
  const [loading, setLoading] = useState(!initialLoans);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Editable>(EMPTY);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await api.get('/client/proposed-loans');
      setItems(Array.isArray(res.data?.proposedLoans) ? res.data.proposedLoans : []);
    } catch { setError('Unable to load proposed loans.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (!initialLoans) fetchData(); }, [initialLoans, fetchData]);

  // The first INCLUDED proposed loan is the one assessed by the calculator.
  const assessedId = items.find((l) => l.includeInServicing !== false)?.id;

  async function toggleInclude(l: ProposedHomeLoan) {
    if (readOnly) return;
    const next = !(l.includeInServicing !== false);
    setItems((prev) => prev.map((x) => (x.id === l.id ? { ...x, includeInServicing: next } : x)));
    try { await setIncludeInServicing('proposedLoan', l.id, next); }
    catch {
      setItems((prev) => prev.map((x) => (x.id === l.id ? { ...x, includeInServicing: !next } : x)));
      setError('Failed to update servicing selection.');
    }
  }

  function openAdd() { setEditing({ ...EMPTY }); setEditId(null); setError(''); setModalOpen(true); }
  function openEdit(l: ProposedHomeLoan) { setEditing({ ...l }); setEditId(l.id); setError(''); setModalOpen(true); }

  async function save() {
    setSaving(true); setError('');
    const payload = {
      productType: editing.productType || null,
      investmentFlag: !!editing.investmentFlag,
      loanAmount: optNum(editing.loanAmount) ?? 0,
      termYears: optNum(editing.termYears) ?? 30,
      ioTermYears: optNum(editing.ioTermYears) ?? 0,
      interestRate: optNum(editing.interestRate) ?? null,
      lvr: optNum(editing.lvr) ?? null,
      overrideRate: !!editing.overrideRate,
      securityLinks: optNum(editing.securityLinks) ?? 0,
      ownership: editing.ownership || null,
      includeInServicing: editing.includeInServicing !== false,
    };
    try {
      if (editId) await api.put(`/client/proposed-loans/${editId}`, payload);
      else await api.post('/client/proposed-loans', payload);
      setModalOpen(false); await fetchData();
    } catch (err) { setError(extractApiError(err, 'Failed to save proposed loan.')); }
    finally { setSaving(false); }
  }

  async function remove(l: ProposedHomeLoan) {
    if (!confirm('Delete this proposed loan?')) return;
    try { await api.delete(`/client/proposed-loans/${l.id}`); await fetchData(); }
    catch { setError('Failed to delete proposed loan.'); }
  }

  if (loading) return <p className="text-sm text-slate-500">Loading proposed loans…</p>;

  return (
    <div className="space-y-4">
      {error && <Alert variant="error">{error}</Alert>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium text-slate-700">
          {items.length} proposed loan{items.length === 1 ? '' : 's'}
          <span className="ml-2 text-xs text-slate-500">(the first included loan is assessed by the calculator)</span>
        </p>
        {!readOnly && <Button size="sm" onClick={openAdd}>+ Add proposed loan</Button>}
      </div>
      {!readOnly && (
        <p className="text-xs text-slate-500">Tick a loan to include it; the first ticked loan is assessed by the borrowing calculation.</p>
      )}

      <div className="overflow-x-auto rounded-xl border border-white/50 bg-white/40 backdrop-blur-sm">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-white/60 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Product type</th>
              <th className="px-3 py-2">Investment</th>
              <th className="px-3 py-2">Loan amount</th>
              <th className="px-3 py-2">Term</th>
              <th className="px-3 py-2">IO term</th>
              <th className="px-3 py-2">LVR</th>
              <th className="px-3 py-2">Override rate</th>
              <th className="px-3 py-2">Rate</th>
              <th className="px-3 py-2">Security links</th>
              <th className="px-3 py-2">Ownership</th>
              <th className="px-3 py-2">Assessed</th>
              {!readOnly && <th className="px-3 py-2">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {items.map((l, idx) => (
              <tr key={l.id} className="row-hover border-b border-white/30 text-slate-800">
                <td className="px-3 py-2">{idx + 1}</td>
                <td className="px-3 py-2">{l.productType || '—'}</td>
                <td className="px-3 py-2">{l.investmentFlag ? 'Yes' : 'No'}</td>
                <td className="px-3 py-2">{money(l.loanAmount)}</td>
                <td className="px-3 py-2">{l.termYears} yr</td>
                <td className="px-3 py-2">{l.ioTermYears} yr</td>
                <td className="px-3 py-2">{l.lvr != null ? pct(l.lvr) : '—'}</td>
                <td className="px-3 py-2">{l.overrideRate ? 'Yes' : 'No'}</td>
                <td className="px-3 py-2">{l.interestRate != null ? pct(l.interestRate * 100) : '—'}</td>
                <td className="px-3 py-2">{l.securityLinks}</td>
                <td className="px-3 py-2">{l.ownership || '—'}</td>
                <td className="px-3 py-2">
                  <div className="inline-flex items-center gap-2">
                    <ToggleSwitch
                      checked={l.includeInServicing !== false}
                      disabled={readOnly}
                      onChange={() => toggleInclude(l)}
                      label={`Assess ${l.productType || 'loan'}`}
                    />
                    {l.id === assessedId && <Badge variant="success">assessed</Badge>}
                  </div>
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
              <tr><td colSpan={readOnly ? 12 : 13} className="px-3 py-6 text-center text-sm text-slate-500">No proposed loans.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editId ? 'Edit proposed loan' : 'Add proposed loan'}>
          <div className="space-y-3">
            {error && <Alert variant="error">{error}</Alert>}
            <div className="grid grid-cols-2 gap-3">
              <Input label="Product type" value={editing.productType || ''} onChange={(e) => setEditing({ ...editing, productType: e.target.value })} />
              <Input label="Loan amount" type="number" min="0" value={String(editing.loanAmount ?? '')}
                onChange={(e) => setEditing({ ...editing, loanAmount: parseFloat(e.target.value) || 0 })} />
              <Input label="Term (yrs)" type="number" min="1" max="40" value={String(editing.termYears ?? 30)}
                onChange={(e) => setEditing({ ...editing, termYears: parseInt(e.target.value) || 30 })} />
              <Input label="IO term (yrs)" type="number" min="0" max="40" value={String(editing.ioTermYears ?? 0)}
                onChange={(e) => setEditing({ ...editing, ioTermYears: parseInt(e.target.value) || 0 })} />
              <Input label="LVR (%)" type="number" step="0.1" min="0" value={String(editing.lvr ?? '')}
                onChange={(e) => setEditing({ ...editing, lvr: e.target.value === '' ? null : parseFloat(e.target.value) })} />
              <Input label="Interest rate (%)" type="number" step="0.01" min="0"
                value={editing.interestRate != null ? String(editing.interestRate * 100) : ''}
                onChange={(e) => setEditing({ ...editing, interestRate: e.target.value === '' ? null : parseFloat(e.target.value) / 100 })} />
              <Input label="Security links" type="number" min="0" value={String(editing.securityLinks ?? 0)}
                onChange={(e) => setEditing({ ...editing, securityLinks: parseInt(e.target.value) || 0 })} />
              <Input label="Ownership" value={editing.ownership || ''} onChange={(e) => setEditing({ ...editing, ownership: e.target.value })} />
            </div>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={!!editing.investmentFlag} onChange={(e) => setEditing({ ...editing, investmentFlag: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand" /> Investment
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={!!editing.overrideRate} onChange={(e) => setEditing({ ...editing, overrideRate: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand" /> Override rate
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={editing.includeInServicing !== false} onChange={(e) => setEditing({ ...editing, includeInServicing: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand" /> Assess this loan
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

export default ProposedHomeLoansTable;
