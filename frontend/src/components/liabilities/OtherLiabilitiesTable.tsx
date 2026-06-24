'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import api from '@/lib/api';
import { PersonalLiability, PersonalLiabilityType } from '@/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { Alert } from '@/components/ui/Alert';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import {
  money, pct, recalculateBorrowingCapacity, setIncludeInServicing, ServicingCalcResult,
} from '@/lib/servicingUi';

// Assumed minimum credit-card repayment as a % of limit (mirrors backend config).
const CC_REPAYMENT_PCT = 0.03;

const LIABILITY_TYPE_OPTIONS = [
  { value: 'CREDIT_CARD', label: 'Credit card' },
  { value: 'CAR_LOAN', label: 'Car loan' },
  { value: 'PERSONAL_LOAN', label: 'Personal loan' },
  { value: 'HECS', label: 'HECS / HELP' },
  { value: 'OTHER', label: 'Other' },
];

function extractApiError(err: unknown, fallback: string): string {
  const ax = err as AxiosError<{ error?: string; details?: { message: string }[] }>;
  return ax.response?.data?.details?.[0]?.message || ax.response?.data?.error || fallback;
}
function optNum(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : undefined;
}

type EditableLiability = Partial<PersonalLiability> & { type: PersonalLiabilityType };
const EMPTY: EditableLiability = {
  type: 'CREDIT_CARD', limit: null, interestRate: null, remainingTermYears: null,
  repaymentAmount: null, ownership: '', ownershipPercent: null, lender: '', includeInServicing: true,
};

interface Props {
  readOnly?: boolean;
  initialLiabilities?: PersonalLiability[];
}

/** Display the effective monthly repayment, using the CC limit assumption. */
function effectiveRepayment(l: PersonalLiability): { value: number | null; assumed: boolean } {
  if (l.repaymentAmount && l.repaymentAmount > 0) return { value: l.repaymentAmount, assumed: false };
  if (l.type === 'CREDIT_CARD' && l.limit && l.limit > 0) {
    return { value: l.limit * CC_REPAYMENT_PCT, assumed: true };
  }
  return { value: null, assumed: false };
}

export function OtherLiabilitiesTable({ readOnly = false, initialLiabilities }: Props) {
  const [items, setItems] = useState<PersonalLiability[]>(initialLiabilities || []);
  const [loading, setLoading] = useState(!initialLiabilities);
  const [error, setError] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<EditableLiability>(EMPTY);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [ratePct, setRatePct] = useState('6');
  const [recalcResult, setRecalcResult] = useState<ServicingCalcResult | null>(null);
  const [recalcing, setRecalcing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await api.get('/client/personal-liabilities');
      setItems(Array.isArray(res.data?.personalLiabilities) ? res.data.personalLiabilities : []);
    } catch { setError('Unable to load liabilities.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (!initialLiabilities) fetchData(); }, [initialLiabilities, fetchData]);

  const includedCount = items.filter((l) => l.includeInServicing !== false).length;

  async function toggleInclude(l: PersonalLiability) {
    if (readOnly) return;
    const next = !(l.includeInServicing !== false);
    setItems((prev) => prev.map((x) => (x.id === l.id ? { ...x, includeInServicing: next } : x)));
    try { await setIncludeInServicing('personalLiability', l.id, next); }
    catch {
      setItems((prev) => prev.map((x) => (x.id === l.id ? { ...x, includeInServicing: !next } : x)));
      setError('Failed to update servicing selection.');
    }
  }

  function openAdd() { setEditing({ ...EMPTY }); setEditId(null); setError(''); setModalOpen(true); }
  function openEdit(l: PersonalLiability) {
    setEditing({
      type: l.type, limit: l.limit, interestRate: l.interestRate, remainingTermYears: l.remainingTermYears,
      repaymentAmount: l.repaymentAmount, ownership: l.ownership ?? '', ownershipPercent: l.ownershipPercent,
      lender: l.lender ?? '', includeInServicing: l.includeInServicing !== false,
    });
    setEditId(l.id); setError(''); setModalOpen(true);
  }

  async function save() {
    setSaving(true); setError('');
    const rateDecimal = optNum(editing.interestRate);
    const payload: Record<string, unknown> = {
      type: editing.type,
      limit: optNum(editing.limit) ?? null,
      interestRate: rateDecimal ?? null,
      remainingTermYears: optNum(editing.remainingTermYears) ?? null,
      repaymentAmount: optNum(editing.repaymentAmount) ?? null,
      ownership: editing.ownership || null,
      ownershipPercent: optNum(editing.ownershipPercent) ?? null,
      lender: editing.lender || null,
      includeInServicing: editing.includeInServicing !== false,
    };
    try {
      if (editId) await api.put(`/client/personal-liabilities/${editId}`, payload);
      else await api.post('/client/personal-liabilities', payload);
      setModalOpen(false); await fetchData();
    } catch (err) { setError(extractApiError(err, 'Failed to save liability.')); }
    finally { setSaving(false); }
  }

  async function remove(l: PersonalLiability) {
    if (!confirm('Delete this liability?')) return;
    try { await api.delete(`/client/personal-liabilities/${l.id}`); await fetchData(); }
    catch { setError('Failed to delete liability.'); }
  }

  async function handleRecalc() {
    setRecalcing(true); setError('');
    try {
      const r = await recalculateBorrowingCapacity({ interestRate: (parseFloat(ratePct) || 6) / 100 });
      setRecalcResult(r);
    } catch (err) { setError(extractApiError(err, 'Unable to recalculate borrowing capacity.')); }
    finally { setRecalcing(false); }
  }

  if (loading) return <p className="text-sm text-muted">Loading liabilities…</p>;

  return (
    <div className="space-y-4">
      {error && <Alert variant="error">{error}</Alert>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium text-secondary">
          {items.length} liabilit{items.length === 1 ? 'y' : 'ies'} total,{' '}
          <span className="text-brand">{includedCount} included in servicing</span>
        </p>
        {!readOnly && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted">Rate %</span>
              <input type="number" step="0.1" value={ratePct} onChange={(e) => setRatePct(e.target.value)}
                className="glass-input w-16 rounded-lg border border-white/15 px-2 py-1 text-sm" />
            </div>
            <Button variant="secondary" size="sm" onClick={handleRecalc} loading={recalcing}>
              Recalculate borrowing capacity
            </Button>
            <Button size="sm" onClick={openAdd}>+ Add liability</Button>
          </div>
        )}
      </div>
      {!readOnly && (
        <p className="text-xs text-muted">Tick the items to include in the borrowing calculation.</p>
      )}

      {recalcResult && (
        <Alert variant="info">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
            <span className="font-semibold">
              Max borrowing capacity:{' '}
              <AnimatedNumber value={recalcResult.maxBorrowingCapacity} prefix="$" />
            </span>
            <span>Monthly commitments: {money(recalcResult.monthlyCommitments)}</span>
            <span>DTI: {recalcResult.dtiRatio.toFixed(2)}x</span>
          </div>
          <p className="mt-1 text-xs">Indicative estimate only - not a credit decision.</p>
        </Alert>
      )}

      <div className="overflow-x-auto rounded-xl border border-white/12 bg-white/5 backdrop-blur-sm">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-white/15 text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-3 py-2">Sr No.</th>
              <th className="px-3 py-2">Liability Type</th>
              <th className="px-3 py-2">Ownership</th>
              <th className="px-3 py-2">Ownership %</th>
              <th className="px-3 py-2">Lender</th>
              <th className="px-3 py-2">Credit limit</th>
              <th className="px-3 py-2">Interest rate</th>
              <th className="px-3 py-2">Monthly repayment</th>
              <th className="px-3 py-2">Include in servicing</th>
              {!readOnly && <th className="px-3 py-2">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {items.map((l, idx) => {
              const rep = effectiveRepayment(l);
              return (
                <tr key={l.id} className="row-hover border-b border-white/30 text-primary">
                  <td className="px-3 py-2">{idx + 1}</td>
                  <td className="px-3 py-2">{l.type.replace(/_/g, ' ')}</td>
                  <td className="px-3 py-2">{l.ownership || '—'}</td>
                  <td className="px-3 py-2">{l.ownershipPercent != null ? `${l.ownershipPercent}%` : '—'}</td>
                  <td className="px-3 py-2">{l.lender || '—'}</td>
                  <td className="px-3 py-2">{money(l.limit)}</td>
                  <td className="px-3 py-2">{l.interestRate != null ? pct(l.interestRate * 100) : '—'}</td>
                  <td className="px-3 py-2">
                    {money(rep.value)}
                    {rep.assumed && <span className="ml-1 text-xs text-faint">(assumed {(CC_REPAYMENT_PCT * 100).toFixed(0)}% of limit)</span>}
                  </td>
                  <td className="px-3 py-2">
                    <ToggleSwitch
                      checked={l.includeInServicing !== false}
                      disabled={readOnly}
                      onChange={() => toggleInclude(l)}
                      label={`Include ${l.type} in servicing`}
                    />
                  </td>
                  {!readOnly && (
                    <td className="px-3 py-2 whitespace-nowrap">
                      <button onClick={() => openEdit(l)} className="mr-2 text-xs font-medium text-brand hover:underline">Edit</button>
                      <button onClick={() => remove(l)} className="text-xs font-medium text-crimson hover:underline">Delete</button>
                    </td>
                  )}
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr><td colSpan={readOnly ? 9 : 10} className="px-3 py-6 text-center text-sm text-muted">No liabilities yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editId ? 'Edit liability' : 'Add liability'}>
          <div className="space-y-3">
            {error && <Alert variant="error">{error}</Alert>}
            <div className="grid grid-cols-2 gap-3">
              <Select label="Type" options={LIABILITY_TYPE_OPTIONS} value={editing.type}
                onChange={(e) => setEditing({ ...editing, type: e.target.value as PersonalLiabilityType })} />
              <Input label="Lender" value={editing.lender || ''}
                onChange={(e) => setEditing({ ...editing, lender: e.target.value })} />
              <Input label="Ownership" placeholder="e.g. Self / Joint" value={editing.ownership || ''}
                onChange={(e) => setEditing({ ...editing, ownership: e.target.value })} />
              <Input label="Ownership %" type="number" min="0" max="100" value={String(editing.ownershipPercent ?? '')}
                onChange={(e) => setEditing({ ...editing, ownershipPercent: e.target.value === '' ? null : parseFloat(e.target.value) })} />
              <Input label="Credit limit" type="number" min="0" value={String(editing.limit ?? '')}
                onChange={(e) => setEditing({ ...editing, limit: e.target.value === '' ? null : parseFloat(e.target.value) })} />
              <Input label="Interest rate (%)" type="number" step="0.01" min="0"
                value={editing.interestRate != null ? String(editing.interestRate * 100) : ''}
                onChange={(e) => setEditing({ ...editing, interestRate: e.target.value === '' ? null : parseFloat(e.target.value) / 100 })} />
              <Input label="Monthly repayment" type="number" min="0" placeholder="Optional (CC assumes 3% of limit)"
                value={String(editing.repaymentAmount ?? '')}
                onChange={(e) => setEditing({ ...editing, repaymentAmount: e.target.value === '' ? null : parseFloat(e.target.value) })} />
              <Input label="Remaining term (yrs)" type="number" min="0" value={String(editing.remainingTermYears ?? '')}
                onChange={(e) => setEditing({ ...editing, remainingTermYears: e.target.value === '' ? null : parseFloat(e.target.value) })} />
            </div>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={editing.includeInServicing !== false}
                onChange={(e) => setEditing({ ...editing, includeInServicing: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand" />
              <span className="text-sm text-secondary">Include in servicing</span>
            </label>
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

export default OtherLiabilitiesTable;
