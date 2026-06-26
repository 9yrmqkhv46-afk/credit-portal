'use client';

import React, { useEffect, useMemo, useState } from 'react';
import api from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface VersionRow {
  id: string; brandCode: string; bankName: string; policyVersion: string;
  isActive: boolean; effectiveFrom: string; updatedAt: string; notes: string | null;
}

const PRODUCTS = [
  { key: 'residentialOwnerOcc', label: 'Owner-Occupied' },
  { key: 'residentialInvestment', label: 'Investment' },
  { key: 'commercialPropertyLight', label: 'Commercial (Light)' },
] as const;

const SELECTION = ['topByEquity', 'topByLoanBalance', 'all'].map((v) => ({ value: v, label: v }));
const money = (n: number) => `$${Math.round(n || 0).toLocaleString()}`;

function sampleScenario() {
  return {
    client: { numberOfAdults: 2, numberOfChildren: 1 },
    incomeSources: [{ type: 'SALARY_PRIMARY', amount: 160000, frequency: 'ANNUAL' }, { type: 'SALARY_PRIMARY', amount: 90000, frequency: 'ANNUAL' }],
    expenses: { declaredMonthlyLiving: 4000 },
    properties: [],
    debts: [{ id: 'cc', type: 'CREDIT_CARD', source: 'STANDALONE', creditLimit: 12000 }],
    scenario: { purpose: 'OWNER_OCC', targetLoanAmount: 700000, targetPropertyValue: 1000000, termYears: 30, interestRate: 0.062, repaymentType: 'PI' },
  };
}

export function BankPolicyLibrary() {
  const { toast } = useToast();
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [activeOnly, setActiveOnly] = useState(false);
  const [filter, setFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [jsonText, setJsonText] = useState('');
  const [productTab, setProductTab] = useState<typeof PRODUCTS[number]['key']>('residentialOwnerOcc');
  const [newVersionLabel, setNewVersionLabel] = useState('');
  const [testResult, setTestResult] = useState<any>(null);
  const [audit, setAudit] = useState<any[]>([]);

  const loadVersions = async () => {
    try {
      const res = await api.get('/bank-policies');
      setVersions(res.data.versions || []);
    } catch {
      toast('Could not load the policy library', { accent: 'crimson' });
    }
  };

  useEffect(() => { loadVersions(); }, []);

  const parsed = useMemo<any>(() => { try { return JSON.parse(jsonText); } catch { return null; } }, [jsonText]);
  const jsonValid = parsed !== null;

  const openVersion = async (id: string) => {
    try {
      const res = await api.get(`/bank-policies/version/${id}`);
      setSelectedId(id);
      setJsonText(JSON.stringify(res.data.policy, null, 2));
      setTestResult(null);
      const a = await api.get(`/bank-policies/audit?brand=${res.data.policy.brandCode}`);
      setAudit(a.data.audit || []);
    } catch {
      toast('Could not open this version', { accent: 'crimson' });
    }
  };

  /** Quick-edit a nested field of the active product, keeping the JSON in sync. */
  const editProduct = (path: string[], value: any) => {
    if (!parsed) return;
    const next = JSON.parse(JSON.stringify(parsed));
    let node = next[productTab];
    for (let i = 0; i < path.length - 1; i++) node = node[path[i]];
    node[path[path.length - 1]] = value;
    setJsonText(JSON.stringify(next, null, 2));
  };

  const saveNewVersion = async (activate: boolean) => {
    if (!parsed) { toast('Fix the JSON before saving', { accent: 'crimson' }); return; }
    const policy = { ...parsed, policyVersion: newVersionLabel || parsed.policyVersion };
    try {
      await api.post(`/bank-policies/${policy.brandCode}/version`, { policy, activate });
      toast(`Saved ${policy.policyVersion}${activate ? ' (activated)' : ''}`, { accent: 'emerald' });
      setNewVersionLabel('');
      await loadVersions();
    } catch {
      toast('Save failed', { accent: 'crimson' });
    }
  };

  const activate = async (id: string) => {
    try { await api.post(`/bank-policies/version/${id}/activate`); toast('Version activated', { accent: 'emerald' }); await loadVersions(); }
    catch { toast('Activate failed', { accent: 'crimson' }); }
  };

  const clone = async () => {
    if (!selectedId) return;
    const label = window.prompt('New version label (e.g. CBA_2026.07):');
    if (!label) return;
    try { const res = await api.post(`/bank-policies/version/${selectedId}/clone`, { policyVersion: label }); toast('Cloned', { accent: 'emerald' }); await loadVersions(); openVersion(res.data.policy.id); }
    catch { toast('Clone failed', { accent: 'crimson' }); }
  };

  const runTest = async () => {
    if (!parsed) return;
    try {
      const res = await api.post(`/bank-policies/${parsed.brandCode}/calc`, sampleScenario());
      setTestResult(res.data.result);
    } catch {
      toast('Test run failed', { accent: 'crimson' });
    }
  };

  const filtered = versions.filter((v) =>
    (!activeOnly || v.isActive) &&
    (!filter || v.bankName.toLowerCase().includes(filter.toLowerCase()) || v.brandCode.toLowerCase().includes(filter.toLowerCase())),
  );

  const prod = parsed?.[productTab];
  const numField = 'glass-input w-full rounded-lg border border-white/15 px-2.5 py-1.5 text-sm text-primary focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30';

  return (
    <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
      {/* List */}
      <aside className="glass-2 max-h-[calc(100vh-12rem)] overflow-y-auto rounded-2xl p-3">
        <div className="mb-2 flex items-center gap-2">
          <input placeholder="Filter banks…" value={filter} onChange={(e) => setFilter(e.target.value)} className="glass-input flex-1 rounded-lg border border-white/15 px-2.5 py-1.5 text-sm text-primary focus:border-brand focus:outline-none" />
          <label className="flex items-center gap-1 text-xs text-secondary"><input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} className="h-3.5 w-3.5 rounded text-brand" />Active</label>
        </div>
        <table className="w-full text-sm">
          <tbody>
            {filtered.map((v) => (
              <tr key={v.id} onClick={() => openVersion(v.id)} className={`cursor-pointer border-b border-white/6 hover:bg-white/6 ${selectedId === v.id ? 'bg-brand-light' : ''}`}>
                <td className="px-2 py-2">
                  <p className="font-medium text-primary">{v.bankName}</p>
                  <p className="text-xs text-muted">{v.policyVersion}</p>
                </td>
                <td className="px-2 py-2 text-right">
                  {v.isActive
                    ? <span className="rounded-full bg-success-light px-2 py-0.5 text-[11px] font-semibold text-emerald ring-1 ring-emerald/40">Active</span>
                    : <button type="button" onClick={(e) => { e.stopPropagation(); activate(v.id); }} className="text-[11px] font-medium text-muted hover:text-emerald hover:underline">Activate</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </aside>

      {/* Editor */}
      <section className="space-y-4">
        {!selectedId ? (
          <div className="glass-2 rounded-2xl p-8 text-center text-muted">Select a bank policy to view and edit.</div>
        ) : (
          <>
            <div className="glass-2 rounded-2xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-display text-base font-semibold text-primary">{parsed?.bankName} <span className="text-xs text-muted">{parsed?.policyVersion}</span></h3>
                <div className="flex gap-2">
                  <button type="button" onClick={runTest} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-brand ring-1 ring-brand/40 hover:bg-brand-light">Test with sample scenario</button>
                  <button type="button" onClick={clone} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-secondary ring-1 ring-white/15 hover:bg-white/10">Clone</button>
                </div>
              </div>

              {/* Product tabs */}
              <div className="mt-3 flex gap-2">
                {PRODUCTS.map((p) => (
                  <button key={p.key} type="button" onClick={() => setProductTab(p.key)} className={`rounded-lg px-3 py-1.5 text-sm font-medium ring-1 transition ${productTab === p.key ? 'bg-brand/20 text-brand ring-brand/50' : 'text-secondary ring-white/15 hover:bg-white/10'}`}>{p.label}</button>
                ))}
              </div>

              {/* Quick-edit fields */}
              {prod && (
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <label className="text-xs text-muted">Max LVR<input className={numField} type="number" step="0.01" value={prod.maxLvr} onChange={(e) => editProduct(['maxLvr'], Number(e.target.value))} /></label>
                  <label className="text-xs text-muted">Max DTI<input className={numField} type="number" step="0.1" value={prod.maxDti} onChange={(e) => editProduct(['maxDti'], Number(e.target.value))} /></label>
                  <label className="text-xs text-muted">Buffer (bps)<input className={numField} type="number" value={prod.serviceabilityBufferBps} onChange={(e) => editProduct(['serviceabilityBufferBps'], Number(e.target.value))} /></label>
                  <label className="text-xs text-muted">Base rate<input className={numField} type="number" step="0.001" value={prod.baseRateAssumption} onChange={(e) => editProduct(['baseRateAssumption'], Number(e.target.value))} /></label>
                  <label className="text-xs text-muted">Rental accept %<input className={numField} type="number" step="0.05" value={prod.incomeShadingRules.rental.acceptPct} onChange={(e) => editProduct(['incomeShadingRules', 'rental', 'acceptPct'], Number(e.target.value))} /></label>
                  <label className="text-xs text-muted">Business accept %<input className={numField} type="number" step="0.05" value={prod.incomeShadingRules.businessIncome.acceptPct} onChange={(e) => editProduct(['incomeShadingRules', 'businessIncome', 'acceptPct'], Number(e.target.value))} /></label>
                  <label className="text-xs text-muted">Max properties<input className={numField} type="number" value={prod.propertyTreatmentRules.maxPropertiesConsidered} onChange={(e) => editProduct(['propertyTreatmentRules', 'maxPropertiesConsidered'], Number(e.target.value))} /></label>
                  <div className="text-xs text-muted">Selection<Select options={SELECTION} value={prod.propertyTreatmentRules.selectionStrategy} onChange={(e) => editProduct(['propertyTreatmentRules', 'selectionStrategy'], e.target.value)} /></div>
                  <label className="text-xs text-muted">Credit card % of limit<input className={numField} type="number" step="0.005" value={prod.debtTreatmentRules.creditCardRepaymentPctOfLimit} onChange={(e) => editProduct(['debtTreatmentRules', 'creditCardRepaymentPctOfLimit'], Number(e.target.value))} /></label>
                </div>
              )}

              {/* Quick presets */}
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => editProduct(['serviceabilityBufferBps'], 300)} className="rounded-full bg-white/8 px-2.5 py-1 text-xs text-secondary ring-1 ring-white/15 hover:bg-white/12">Preset: buffer 3%</button>
                <button type="button" onClick={() => editProduct(['maxDti'], 6)} className="rounded-full bg-white/8 px-2.5 py-1 text-xs text-secondary ring-1 ring-white/15 hover:bg-white/12">Preset: DTI 6x</button>
                <button type="button" onClick={() => editProduct(['maxLvr'], 0.8)} className="rounded-full bg-white/8 px-2.5 py-1 text-xs text-secondary ring-1 ring-white/15 hover:bg-white/12">Preset: LVR 80%</button>
              </div>

              {testResult && (
                <div className="mt-3 rounded-xl border border-brand/20 bg-brand-light/40 p-3 text-sm">
                  <p className="font-semibold text-primary">Sample run: max borrow {money(testResult.finalMaxBorrow)} · <span className={testResult.passFail === 'PASS' ? 'text-emerald' : testResult.passFail === 'MARGINAL' ? 'text-gold' : 'text-crimson'}>{testResult.passFail}</span></p>
                  <p className="tnum text-xs text-muted">DTI {testResult.dtiRatio}x · LVR {(testResult.lvrRatio * 100).toFixed(0)}% · surplus {money(testResult.netMonthlySurplus)}/mo · stress {(testResult.stressRateUsed * 100).toFixed(2)}%</p>
                </div>
              )}
            </div>

            {/* JSON preview / editor */}
            <div className="glass-2 rounded-2xl p-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold text-primary">Structured policy JSON {jsonValid ? <span className="text-xs text-emerald">valid</span> : <span className="text-xs text-crimson">invalid</span>}</p>
              </div>
              <textarea value={jsonText} onChange={(e) => setJsonText(e.target.value)} spellCheck={false} className="glass-input h-72 w-full rounded-xl border border-white/15 px-3 py-2 font-mono text-xs text-primary focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30" />
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <label className="text-xs text-muted">New version label
                  <input className={numField} placeholder={parsed?.policyVersion} value={newVersionLabel} onChange={(e) => setNewVersionLabel(e.target.value)} />
                </label>
                <button type="button" disabled={!jsonValid} onClick={() => saveNewVersion(false)} className="rounded-xl px-4 py-2 text-sm font-semibold text-secondary ring-1 ring-white/15 hover:bg-white/10 disabled:opacity-50">Save as new version</button>
                <button type="button" disabled={!jsonValid} onClick={() => saveNewVersion(true)} className="rounded-xl bg-gradient-to-br from-brand to-brand-dark px-4 py-2 text-sm font-semibold text-on-accent hover:brightness-110 disabled:opacity-50">Save &amp; activate</button>
              </div>
            </div>

            {/* Audit */}
            {audit.length > 0 && (
              <div className="glass-2 rounded-2xl p-4">
                <p className="mb-2 text-sm font-semibold text-primary">Change history</p>
                <ul className="space-y-1 text-xs text-secondary">
                  {audit.map((a, i) => (
                    <li key={i} className="flex justify-between gap-3">
                      <span><span className="font-medium text-primary">{a.action}</span> — {a.detail}{a.actorEmail ? ` (${a.actorEmail})` : ''}</span>
                      <span className="shrink-0 text-muted">{new Date(a.createdAt).toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

export default BankPolicyLibrary;
