'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import api from '@/lib/api';
import { LivingExpenses, Frequency } from '@/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Alert } from '@/components/ui/Alert';
import { money, FREQUENCY_OPTIONS } from '@/lib/servicingUi';

function extractApiError(err: unknown, fallback: string): string {
  const ax = err as AxiosError<{ error?: string; details?: { message: string }[] }>;
  return ax.response?.data?.details?.[0]?.message || ax.response?.data?.error || fallback;
}
function optNum(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : undefined;
}

type FormState = {
  basicExpenseAmount: number;
  basicExpenseFrequency: Frequency;
  propertyTax: number | null;
  strataBodyCorp: number | null;
  privateSchoolFees: number | null;
  childSupportMaintenance: number | null;
  privateHealthInsurance: number | null;
  lifeInsurance: number | null;
  secondaryResidenceCosts: number | null;
  otherNonHem: number | null;
  useNotionalRent: boolean;
  rentBoardAmount: number | null;
};

const EMPTY: FormState = {
  basicExpenseAmount: 0, basicExpenseFrequency: 'MONTHLY', propertyTax: null, strataBodyCorp: null,
  privateSchoolFees: null, childSupportMaintenance: null, privateHealthInsurance: null, lifeInsurance: null,
  secondaryResidenceCosts: null, otherNonHem: null, useNotionalRent: false, rentBoardAmount: null,
};

const ADDITIONAL_FIELDS: { key: keyof FormState; label: string }[] = [
  { key: 'propertyTax', label: 'Property tax' },
  { key: 'strataBodyCorp', label: 'Strata / body corp' },
  { key: 'privateSchoolFees', label: 'Private school fees' },
  { key: 'childSupportMaintenance', label: 'Child support maintenance' },
  { key: 'privateHealthInsurance', label: 'Private health insurance' },
  { key: 'lifeInsurance', label: 'Life / accident / illness insurance' },
  { key: 'secondaryResidenceCosts', label: 'Secondary residence costs' },
  { key: 'otherNonHem', label: 'Other (non-HEM)' },
];

export function LivingExpensesForm() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const res = await api.get('/client/living-expenses');
      const le: LivingExpenses | null = res.data?.livingExpenses || null;
      if (le) {
        setForm({
          basicExpenseAmount: le.basicExpenseAmount, basicExpenseFrequency: le.basicExpenseFrequency,
          propertyTax: le.propertyTax, strataBodyCorp: le.strataBodyCorp, privateSchoolFees: le.privateSchoolFees,
          childSupportMaintenance: le.childSupportMaintenance, privateHealthInsurance: le.privateHealthInsurance,
          lifeInsurance: le.lifeInsurance, secondaryResidenceCosts: le.secondaryResidenceCosts,
          otherNonHem: le.otherNonHem, useNotionalRent: le.useNotionalRent, rentBoardAmount: le.rentBoardAmount,
        });
      }
    } catch { /* none yet */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalAdditional = ADDITIONAL_FIELDS.reduce((sum, f) => sum + (Number(form[f.key]) || 0), 0);

  async function save() {
    setSaving(true); setError(''); setSuccess('');
    const payload = {
      basicExpenseAmount: optNum(form.basicExpenseAmount) ?? 0,
      basicExpenseFrequency: form.basicExpenseFrequency,
      propertyTax: optNum(form.propertyTax) ?? null,
      strataBodyCorp: optNum(form.strataBodyCorp) ?? null,
      privateSchoolFees: optNum(form.privateSchoolFees) ?? null,
      childSupportMaintenance: optNum(form.childSupportMaintenance) ?? null,
      privateHealthInsurance: optNum(form.privateHealthInsurance) ?? null,
      lifeInsurance: optNum(form.lifeInsurance) ?? null,
      secondaryResidenceCosts: optNum(form.secondaryResidenceCosts) ?? null,
      otherNonHem: optNum(form.otherNonHem) ?? null,
      useNotionalRent: form.useNotionalRent,
      rentBoardAmount: optNum(form.rentBoardAmount) ?? null,
    };
    try { await api.put('/client/living-expenses', payload); setSuccess('Living expenses saved.'); }
    catch (err) { setError(extractApiError(err, 'Failed to save living expenses.')); }
    finally { setSaving(false); }
  }

  if (loading) return <p className="text-sm text-slate-500">Loading living expenses…</p>;

  return (
    <div className="space-y-4">
      {error && <Alert variant="error">{error}</Alert>}
      {success && <Alert variant="success">{success}</Alert>}

      <div className="grid gap-3 md:grid-cols-2">
        <Input label="Basic living expense amount" type="number" min="0" value={String(form.basicExpenseAmount)}
          onChange={(e) => setForm({ ...form, basicExpenseAmount: parseFloat(e.target.value) || 0 })} />
        <Select label="Frequency" options={FREQUENCY_OPTIONS} value={form.basicExpenseFrequency}
          onChange={(e) => setForm({ ...form, basicExpenseFrequency: e.target.value as Frequency })} />
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Additional categories (monthly)</p>
        <div className="grid gap-3 md:grid-cols-2">
          {ADDITIONAL_FIELDS.map((f) => (
            <Input key={f.key} label={f.label} type="number" min="0" placeholder="Optional"
              value={String((form[f.key] as number | null) ?? '')}
              onChange={(e) => setForm({ ...form, [f.key]: e.target.value === '' ? null : parseFloat(e.target.value) })} />
          ))}
        </div>
        <p className="mt-2 text-sm text-slate-700">
          Total additional: <span className="font-semibold">{money(totalAdditional)}</span>
        </p>
      </div>

      <div className="border-t border-white/40 pt-3">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={form.useNotionalRent}
            onChange={(e) => setForm({ ...form, useNotionalRent: e.target.checked })}
            className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand" />
          Use notional rent / board
        </label>
        {form.useNotionalRent && (
          <div className="mt-3 max-w-xs">
            <Input label="Rent / board amount (monthly)" type="number" min="0" value={String(form.rentBoardAmount ?? '')}
              onChange={(e) => setForm({ ...form, rentBoardAmount: e.target.value === '' ? null : parseFloat(e.target.value) })} />
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <Button onClick={save} loading={saving}>Save living expenses</Button>
      </div>
      <p className="text-xs text-slate-500">
        The engine applies a HEM-style floor: the greater of declared expenses and the minimum is used.
      </p>
    </div>
  );
}

export default LivingExpensesForm;
