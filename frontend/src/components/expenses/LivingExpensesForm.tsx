'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import api from '@/lib/api';
import { LivingExpenses, ExpenseSummary, Frequency } from '@/types';
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

// --- Expanded living-expense categories (A2), persisted on ExpenseSummary. ---
// `nullable` columns accept null when blank; non-nullable (DB default 0) send 0.
type ExpenseRow = {
  amountKey: keyof ExpenseSummary;
  freqKey: keyof ExpenseSummary;
  label: string;
  nullable: boolean;
};
const EXPENSE_ROWS: ExpenseRow[] = [
  { amountKey: 'groceries', freqKey: 'groceriesFreq', label: 'Groceries', nullable: false },
  { amountKey: 'rental', freqKey: 'rentalFreq', label: 'Rent / rental', nullable: true },
  { amountKey: 'transport', freqKey: 'transportFreq', label: 'Transport', nullable: false },
  { amountKey: 'utilities', freqKey: 'utilitiesFreq', label: 'Utilities', nullable: false },
  { amountKey: 'schoolFees', freqKey: 'schoolFeesFreq', label: 'School fees', nullable: true },
  { amountKey: 'homeLoanRepayment', freqKey: 'homeLoanRepaymentFreq', label: 'Home loan repayment', nullable: true },
  { amountKey: 'creditCardRepayment', freqKey: 'creditCardRepaymentFreq', label: 'Credit card repayment', nullable: true },
  { amountKey: 'otherLoanRepayment', freqKey: 'otherLoanRepaymentFreq', label: 'Other loan repayment', nullable: true },
];

type ExpenseState = Record<string, { amount: number | null; freq: Frequency }>;

function emptyExpenseState(): ExpenseState {
  const s: ExpenseState = {};
  for (const r of EXPENSE_ROWS) s[r.amountKey] = { amount: null, freq: 'MONTHLY' };
  return s;
}

export function LivingExpensesForm() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [expenses, setExpenses] = useState<ExpenseState>(emptyExpenseState());
  const [expenseExists, setExpenseExists] = useState(false);
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
    // Expanded ExpenseSummary categories (separate endpoint).
    try {
      const res = await api.get('/client/expense-summary');
      const es: ExpenseSummary | null = res.data?.expenseSummary || null;
      if (es) {
        setExpenseExists(true);
        const next = emptyExpenseState();
        for (const r of EXPENSE_ROWS) {
          const amt = es[r.amountKey] as number | null | undefined;
          const freq = (es[r.freqKey] as Frequency | undefined) || 'MONTHLY';
          next[r.amountKey] = { amount: amt === undefined ? null : amt, freq };
        }
        setExpenses(next);
      }
    } catch { /* no expense summary yet */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalAdditional = ADDITIONAL_FIELDS.reduce((sum, f) => sum + (Number(form[f.key]) || 0), 0);

  function updateExpense(key: string, patch: Partial<{ amount: number | null; freq: Frequency }>) {
    setExpenses((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

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

    // Build the ExpenseSummary payload for the expanded categories. Empty rows
    // are omitted for non-nullable columns (DB default 0) and sent as null for
    // nullable columns, keeping Zod/columns consistent.
    const expensePayload: Record<string, unknown> = {};
    for (const r of EXPENSE_ROWS) {
      const cell = expenses[r.amountKey];
      const amt = optNum(cell.amount);
      if (amt === undefined) {
        if (!r.nullable) { expensePayload[r.amountKey] = 0; }
        else { expensePayload[r.amountKey] = null; }
      } else {
        expensePayload[r.amountKey] = amt;
      }
      expensePayload[r.freqKey] = cell.freq;
    }

    try {
      await api.put('/client/living-expenses', payload);
      // Upsert the ExpenseSummary: PUT when it already exists, else POST.
      if (expenseExists) {
        await api.put('/client/expense-summary', expensePayload);
      } else {
        await api.post('/client/expense-summary', expensePayload);
        setExpenseExists(true);
      }
      setSuccess('Living expenses saved.');
    }
    catch (err) { setError(extractApiError(err, 'Failed to save living expenses.')); }
    finally { setSaving(false); }
  }

  if (loading) return <p className="text-sm text-muted">Loading living expenses…</p>;

  return (
    <div className="space-y-5">
      {error && <Alert variant="error">{error}</Alert>}
      {success && <Alert variant="success">{success}</Alert>}

      <div className="grid gap-3 md:grid-cols-2">
        <Input label="Basic living expense amount" type="number" min="0" value={String(form.basicExpenseAmount)}
          onChange={(e) => setForm({ ...form, basicExpenseAmount: parseFloat(e.target.value) || 0 })} />
        <Select label="Frequency" options={FREQUENCY_OPTIONS} value={form.basicExpenseFrequency}
          onChange={(e) => setForm({ ...form, basicExpenseFrequency: e.target.value as Frequency })} />
      </div>

      {/* Expanded living-expense categories: each an OPTIONAL row with a
          frequency selector (Monthly / Quarterly / Yearly + Weekly / Fortnightly). */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">
          Living expense categories (each optional, choose a frequency)
        </p>
        <div className="space-y-2">
          {EXPENSE_ROWS.map((r) => (
            <div key={String(r.amountKey)} className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_auto]">
              <Input
                label={r.label}
                type="number"
                min="0"
                placeholder={r.nullable ? 'Optional' : '0'}
                value={String(expenses[r.amountKey]?.amount ?? '')}
                onChange={(e) => updateExpense(String(r.amountKey), { amount: e.target.value === '' ? null : parseFloat(e.target.value) })}
              />
              <Select
                label="Frequency"
                options={FREQUENCY_OPTIONS}
                value={expenses[r.amountKey]?.freq || 'MONTHLY'}
                onChange={(e) => updateExpense(String(r.amountKey), { freq: e.target.value as Frequency })}
              />
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-faint">
          Home / credit-card / other loan repayments entered here are treated as additive monthly
          commitments by the servicing engine (kept separate from the Liabilities module).
        </p>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Additional categories (monthly)</p>
        <div className="grid gap-3 md:grid-cols-2">
          {ADDITIONAL_FIELDS.map((f) => (
            <Input key={f.key} label={f.label} type="number" min="0" placeholder="Optional"
              value={String((form[f.key] as number | null) ?? '')}
              onChange={(e) => setForm({ ...form, [f.key]: e.target.value === '' ? null : parseFloat(e.target.value) })} />
          ))}
        </div>
        <p className="mt-2 text-sm text-secondary">
          Total additional: <span className="font-semibold">{money(totalAdditional)}</span>
        </p>
      </div>

      <div className="border-t border-white/10 pt-3">
        <label className="flex items-center gap-2 text-sm text-secondary">
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
      <p className="text-xs text-faint">
        The engine applies a HEM-style floor: the greater of declared expenses and the minimum is used.
      </p>
    </div>
  );
}

export default LivingExpensesForm;
