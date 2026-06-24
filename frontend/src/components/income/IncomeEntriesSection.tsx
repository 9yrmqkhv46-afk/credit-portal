'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import api from '@/lib/api';
import { IncomeEntry, IncomeCategory, IncomeOwner, Frequency, Applicant, Household } from '@/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Alert } from '@/components/ui/Alert';
import { INCOME_CATEGORY_GROUPS, incomeCategoryLabel, shadedMonthly, DEDUCTION_CATEGORIES } from '@/lib/income';
import { money, FREQUENCY_OPTIONS } from '@/lib/servicingUi';

function extractApiError(err: unknown, fallback: string): string {
  const ax = err as AxiosError<{ error?: string; details?: { message: string }[] }>;
  return ax.response?.data?.details?.[0]?.message || ax.response?.data?.error || fallback;
}

interface RowState {
  id?: string;
  applicantId: string | null;
  owner: IncomeOwner;
  category: IncomeCategory;
  amount: number;
  frequency: Frequency;
  hecsFlag: boolean;
  hecsAmount: number | null;
}

function toRow(e: IncomeEntry): RowState {
  return {
    id: e.id, applicantId: e.applicantId, owner: (e.owner as IncomeOwner) || 'SELF', category: e.category, amount: e.amount,
    frequency: e.frequency, hecsFlag: e.hecsFlag, hecsAmount: e.hecsAmount,
  };
}

const NEW_ROW: RowState = {
  applicantId: null, owner: 'SELF', category: 'BASE_SALARY_PAYG', amount: 0, frequency: 'ANNUAL',
  hecsFlag: false, hecsAmount: null,
};

export function IncomeEntriesSection() {
  const [rows, setRows] = useState<RowState[]>([]);
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [maritalStatus, setMaritalStatus] = useState<string>('SINGLE');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [iRes, hRes, pRes] = await Promise.all([
        api.get('/client/income-entries'),
        api.get('/client/households').catch(() => ({ data: { households: [] } })),
        api.get('/client/profile').catch(() => ({ data: { profile: null } })),
      ]);
      const entries: IncomeEntry[] = Array.isArray(iRes.data?.incomeEntries) ? iRes.data.incomeEntries : [];
      setRows(entries.map(toRow));
      const households: Household[] = Array.isArray(hRes.data?.households) ? hRes.data.households : [];
      const apps: Applicant[] = households.flatMap((h) => h.applicants || []);
      setApplicants(apps);
      if (pRes.data?.profile?.maritalStatus) setMaritalStatus(pRes.data.profile.maritalStatus);
    } catch { setError('Unable to load income.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Partner is offered only for coupled households; Self is always available.
  const hasPartner = maritalStatus === 'MARRIED' || maritalStatus === 'DE_FACTO';
  const ownerOptions = hasPartner
    ? [{ value: 'SELF', label: 'Self' }, { value: 'PARTNER', label: 'Partner' }]
    : [{ value: 'SELF', label: 'Self' }];

  const applicantOptions = [
    { value: '', label: 'Primary applicant (you)' },
    ...applicants.map((a) => ({ value: a.id, label: a.name })),
  ];

  function updateRow(idx: number, patch: Partial<RowState>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function addRow() { setRows((prev) => [...prev, { ...NEW_ROW }]); }

  async function removeRow(idx: number) {
    const row = rows[idx];
    if (row.id) {
      try { await api.delete(`/client/income-entries/${row.id}`); }
      catch { setError('Failed to remove income row.'); return; }
    }
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }

  async function saveAll() {
    setSaving(true); setError(''); setSuccess('');
    try {
      for (const row of rows) {
        const payload = {
          applicantId: row.applicantId || null,
          owner: row.owner || 'SELF',
          category: row.category,
          amount: Number(row.amount) || 0,
          frequency: row.frequency,
          hecsFlag: row.hecsFlag,
          hecsAmount: row.hecsFlag ? (row.hecsAmount ?? 0) : null,
        };
        if (row.id) await api.put(`/client/income-entries/${row.id}`, payload);
        else {
          const res = await api.post('/client/income-entries', payload);
          row.id = res.data.incomeEntry.id;
        }
      }
      await fetchData();
      setSuccess('Income saved successfully.');
    } catch (err) { setError(extractApiError(err, 'Failed to save income.')); }
    finally { setSaving(false); }
  }

  if (loading) return <p className="text-sm text-muted">Loading income…</p>;

  return (
    <div className="space-y-4">
      {error && <Alert variant="error">{error}</Alert>}
      {success && <Alert variant="success">{success}</Alert>}

      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-secondary">
          {rows.length} income row{rows.length === 1 ? '' : 's'}
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={addRow}>+ Add income</Button>
          <Button size="sm" onClick={saveAll} loading={saving}>Save income</Button>
        </div>
      </div>

      <div className="space-y-3">
        {rows.map((row, idx) => {
          const hint = shadedMonthly(row.category, Number(row.amount) || 0, row.frequency);
          const isDeduction = DEDUCTION_CATEGORIES.includes(row.category);
          return (
            <div key={row.id || `new-${idx}`} className="rounded-xl border border-white/12 bg-white/5 p-4 backdrop-blur-sm">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold text-secondary">{incomeCategoryLabel(row.category)}</span>
                <button onClick={() => removeRow(idx)} className="text-xs font-medium text-crimson hover:underline">Remove</button>
              </div>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
                <div className="w-full">
                  <label className="mb-1.5 block text-sm font-medium text-secondary">Owner</label>
                  <select value={row.owner}
                    onChange={(e) => updateRow(idx, { owner: e.target.value as IncomeOwner })}
                    className="glass-input block w-full rounded-xl border border-white/15 px-3.5 py-2.5 text-sm text-primary"
                    aria-label="Income owner">
                    {ownerOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="w-full">
                  <label className="mb-1.5 block text-sm font-medium text-secondary">Applicant</label>
                  <select value={row.applicantId || ''}
                    onChange={(e) => updateRow(idx, { applicantId: e.target.value || null })}
                    className="glass-input block w-full rounded-xl border border-white/15 px-3.5 py-2.5 text-sm text-primary">
                    {applicantOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="w-full">
                  <label className="mb-1.5 block text-sm font-medium text-secondary">Income category</label>
                  <select value={row.category}
                    onChange={(e) => updateRow(idx, { category: e.target.value as IncomeCategory })}
                    className="glass-input block w-full rounded-xl border border-white/15 px-3.5 py-2.5 text-sm text-primary">
                    {INCOME_CATEGORY_GROUPS.map((grp) => (
                      <optgroup key={grp.group} label={grp.group}>
                        {grp.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </div>
                <Input label="Amount" type="number" min="0" value={String(row.amount)}
                  onChange={(e) => updateRow(idx, { amount: parseFloat(e.target.value) || 0 })} />
                <Select label="Frequency" options={FREQUENCY_OPTIONS} value={row.frequency}
                  onChange={(e) => updateRow(idx, { frequency: e.target.value as Frequency })} />
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-4">
                <span className="text-xs text-muted">
                  {isDeduction ? 'Monthly reduction' : 'Shaded monthly income'}:{' '}
                  <span className={`font-semibold ${hint < 0 ? 'text-crimson' : 'text-secondary'}`}>{money(hint)}</span>
                </span>
                <label className="flex items-center gap-2 text-sm text-secondary">
                  <input type="checkbox" checked={row.hecsFlag}
                    onChange={(e) => updateRow(idx, { hecsFlag: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand" />
                  HECS / HELP
                </label>
                {row.hecsFlag && (
                  <div className="w-40">
                    <Input label="HECS monthly $" type="number" min="0" value={String(row.hecsAmount ?? '')}
                      onChange={(e) => updateRow(idx, { hecsAmount: e.target.value === '' ? null : parseFloat(e.target.value) })} />
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {rows.length === 0 && (
          <p className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-muted">
            No income rows yet. Click &quot;Add income&quot; to begin.
          </p>
        )}
      </div>
      <p className="text-xs text-muted">
        Shading is indicative; the servicing engine is the source of truth. Deductions reduce assessable income.
      </p>
    </div>
  );
}

export default IncomeEntriesSection;
