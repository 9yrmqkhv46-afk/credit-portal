'use client';

import React, { useState } from 'react';
import api from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';

/* eslint-disable @typescript-eslint/no-explicit-any */

const FREQ = ['WEEKLY', 'FORTNIGHTLY', 'MONTHLY', 'ANNUAL'].map((v) => ({ value: v, label: v[0] + v.slice(1).toLowerCase() }));
const INCOME_TYPES = ['SALARY_PRIMARY', 'SALARY_SECONDARY', 'RENTAL', 'GOV', 'BUSINESS', 'OTHER'].map((v) => ({ value: v, label: v.replace('_', ' ') }));
const DEBT_TYPES = ['CREDIT_CARD', 'PERSONAL_LOAN', 'CAR_LOAN', 'HECS_HELP', 'BUSINESS_UNSECURED', 'OTHER'].map((v) => ({ value: v, label: v.replace(/_/g, ' ') }));
const PROP_TYPES = [{ value: 'OWNER_OCC', label: 'Owner-occ' }, { value: 'INVESTMENT', label: 'Investment' }, { value: 'COMMERCIAL', label: 'Commercial' }];
const PURPOSES = [{ value: 'OWNER_OCC', label: 'Owner-occupied' }, { value: 'INVESTMENT', label: 'Investment' }, { value: 'COMMERCIAL_PROPERTY_LIGHT', label: 'Commercial (light)' }];

const money = (n: number) => `$${Math.round(n || 0).toLocaleString()}`;

function defaultScenario() {
  return {
    client: { numberOfAdults: 2, numberOfChildren: 1, isSelfEmployed: false },
    incomeSources: [
      { type: 'SALARY_PRIMARY', amount: 140000, frequency: 'ANNUAL' },
      { type: 'SALARY_PRIMARY', amount: 95000, frequency: 'ANNUAL' },
    ],
    expenses: { declaredMonthlyLiving: 4000, monthlyRent: 0 },
    properties: [
      { id: 'p1', type: 'INVESTMENT', estimatedValue: 800000, currentLoanBalance: 400000, currentRepaymentAmount: 2200, grossRentalIncomeMonthly: 2600, lender: 'Existing Bank', isIncludedInCalc: true, includeOverrideForBank: {} as Record<string, boolean> },
    ],
    debts: [
      { id: 'd1', type: 'CREDIT_CARD', source: 'STANDALONE', lender: 'Visa', creditLimit: 15000 },
    ],
    scenario: { purpose: 'OWNER_OCC', targetLoanAmount: 700000, targetPropertyValue: 1000000, termYears: 30, interestRate: 0.062, repaymentType: 'PI' },
  };
}

const catColor: Record<string, string> = {
  PRIMARY: 'bg-success-light text-emerald ring-emerald/40',
  SECONDARY: 'bg-gold-light text-gold ring-gold/40',
  LONG_SHOT: 'bg-white/8 text-muted ring-white/15',
};
const passColor: Record<string, string> = { PASS: 'text-emerald', MARGINAL: 'text-gold', FAIL: 'text-crimson' };

export function BankScenarioRunner() {
  const { toast } = useToast();
  const [s, setS] = useState<any>(defaultScenario());
  const [recs, setRecs] = useState<any[]>([]);
  const [running, setRunning] = useState(false);

  const upd = (patch: any) => setS((prev: any) => ({ ...prev, ...patch }));
  const updScenario = (patch: any) => setS((prev: any) => ({ ...prev, scenario: { ...prev.scenario, ...patch } }));
  const updClient = (patch: any) => setS((prev: any) => ({ ...prev, client: { ...prev.client, ...patch } }));

  const run = async (payload = s) => {
    setRunning(true);
    try {
      const res = await api.post('/bank-policies/rank', payload);
      setRecs(res.data.recommendations || []);
    } catch {
      toast('Could not rank banks — is the policy library available?', { accent: 'crimson' });
    } finally {
      setRunning(false);
    }
  };

  // --- editable list helpers ---
  const addIncome = () => upd({ incomeSources: [...s.incomeSources, { type: 'OTHER', amount: 0, frequency: 'ANNUAL' }] });
  const addDebt = () => upd({ debts: [...s.debts, { id: `d${Date.now()}`, type: 'PERSONAL_LOAN', source: 'STANDALONE', monthlyRepayment: 0 }] });
  const addProp = () => upd({ properties: [...s.properties, { id: `p${Date.now()}`, type: 'INVESTMENT', estimatedValue: 0, currentLoanBalance: 0, currentRepaymentAmount: 0, grossRentalIncomeMonthly: 0, isIncludedInCalc: true, includeOverrideForBank: {} }] });

  const brands = recs.map((r) => r.brandCode);

  const toggleMatrix = (propIdx: number, brand: string) => {
    const next = { ...s };
    const prop = { ...next.properties[propIdx] };
    const ov = { ...(prop.includeOverrideForBank || {}) };
    const current = ov[brand] ?? prop.isIncludedInCalc;
    ov[brand] = !current;
    prop.includeOverrideForBank = ov;
    next.properties = next.properties.map((p: any, i: number) => (i === propIdx ? prop : p));
    setS(next);
    run(next); // re-run with the new inclusion
  };

  const field = 'glass-input w-full rounded-lg border border-white/15 px-2.5 py-1.5 text-sm text-primary focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30';

  return (
    <div className="space-y-5">
      {/* Scenario form */}
      <div className="glass-2 rounded-2xl p-5">
        <h3 className="mb-3 font-display text-base font-semibold text-primary">Client scenario</h3>
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Loan */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Loan request</p>
            <div className="grid grid-cols-2 gap-3">
              <Select label="Purpose" options={PURPOSES} value={s.scenario.purpose} onChange={(e) => updScenario({ purpose: e.target.value })} />
              <Select label="Repayment" options={[{ value: 'PI', label: 'P&I' }, { value: 'IO', label: 'Interest Only' }]} value={s.scenario.repaymentType} onChange={(e) => updScenario({ repaymentType: e.target.value })} />
              <Input label="Target loan ($)" type="number" value={String(s.scenario.targetLoanAmount)} onChange={(e) => updScenario({ targetLoanAmount: Number(e.target.value) || 0 })} />
              <Input label="Property value ($)" type="number" value={String(s.scenario.targetPropertyValue)} onChange={(e) => updScenario({ targetPropertyValue: Number(e.target.value) || 0 })} />
              <Input label="Term (yrs)" type="number" value={String(s.scenario.termYears)} onChange={(e) => updScenario({ termYears: Number(e.target.value) || 30 })} />
              <Input label="Rate (e.g. 0.062)" type="number" step="0.001" value={String(s.scenario.interestRate)} onChange={(e) => updScenario({ interestRate: Number(e.target.value) || 0 })} />
            </div>
          </div>
          {/* Household + expenses */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Household &amp; expenses</p>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Adults" type="number" value={String(s.client.numberOfAdults)} onChange={(e) => updClient({ numberOfAdults: Number(e.target.value) || 0 })} />
              <Input label="Children" type="number" value={String(s.client.numberOfChildren)} onChange={(e) => updClient({ numberOfChildren: Number(e.target.value) || 0 })} />
              <Input label="Declared living/mo ($)" type="number" value={String(s.expenses.declaredMonthlyLiving)} onChange={(e) => upd({ expenses: { ...s.expenses, declaredMonthlyLiving: Number(e.target.value) || 0 } })} />
              <Input label="Rent/mo ($)" type="number" value={String(s.expenses.monthlyRent)} onChange={(e) => upd({ expenses: { ...s.expenses, monthlyRent: Number(e.target.value) || 0 } })} />
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-secondary">
              <input type="checkbox" checked={!!s.client.isSelfEmployed} onChange={(e) => updClient({ isSelfEmployed: e.target.checked })} className="h-4 w-4 rounded text-brand focus:ring-brand" />
              Self-employed (applies segment DTI uplift where offered)
            </label>
          </div>
        </div>

        {/* Income rows */}
        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Income</p>
            <button type="button" onClick={addIncome} className="text-xs font-semibold text-brand hover:underline">+ Add income</button>
          </div>
          <div className="space-y-2">
            {s.incomeSources.map((row: any, i: number) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
                <select className={field} value={row.type} onChange={(e) => upd({ incomeSources: s.incomeSources.map((r: any, j: number) => (j === i ? { ...r, type: e.target.value } : r)) })}>
                  {INCOME_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <input className={field} type="number" value={row.amount} onChange={(e) => upd({ incomeSources: s.incomeSources.map((r: any, j: number) => (j === i ? { ...r, amount: Number(e.target.value) || 0 } : r)) })} />
                <select className={field} value={row.frequency} onChange={(e) => upd({ incomeSources: s.incomeSources.map((r: any, j: number) => (j === i ? { ...r, frequency: e.target.value } : r)) })}>
                  {FREQ.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <button type="button" onClick={() => upd({ incomeSources: s.incomeSources.filter((_: any, j: number) => j !== i) })} className="px-2 text-crimson hover:underline">×</button>
              </div>
            ))}
          </div>
        </div>

        {/* Debts + properties side by side */}
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <div className="mb-1 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Standalone debts</p>
              <button type="button" onClick={addDebt} className="text-xs font-semibold text-brand hover:underline">+ Add debt</button>
            </div>
            <div className="space-y-2">
              {s.debts.map((row: any, i: number) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
                  <select className={field} value={row.type} onChange={(e) => upd({ debts: s.debts.map((r: any, j: number) => (j === i ? { ...r, type: e.target.value } : r)) })}>
                    {DEBT_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <input className={field} type="number" placeholder={row.type === 'CREDIT_CARD' ? 'limit' : 'repay/mo'} value={row.type === 'CREDIT_CARD' ? (row.creditLimit ?? 0) : (row.monthlyRepayment ?? 0)} onChange={(e) => upd({ debts: s.debts.map((r: any, j: number) => (j === i ? { ...r, [row.type === 'CREDIT_CARD' ? 'creditLimit' : 'monthlyRepayment']: Number(e.target.value) || 0 } : r)) })} />
                  <input className={field} placeholder="lender" value={row.lender || ''} onChange={(e) => upd({ debts: s.debts.map((r: any, j: number) => (j === i ? { ...r, lender: e.target.value } : r)) })} />
                  <button type="button" onClick={() => upd({ debts: s.debts.filter((_: any, j: number) => j !== i) })} className="px-2 text-crimson hover:underline">×</button>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Properties (with secured loans)</p>
              <button type="button" onClick={addProp} className="text-xs font-semibold text-brand hover:underline">+ Add property</button>
            </div>
            <div className="space-y-2">
              {s.properties.map((row: any, i: number) => (
                <div key={i} className="rounded-lg border border-white/12 bg-white/4 p-2">
                  <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                    <select className={field} value={row.type} onChange={(e) => upd({ properties: s.properties.map((r: any, j: number) => (j === i ? { ...r, type: e.target.value } : r)) })}>
                      {PROP_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <input className={field} type="number" placeholder="value" value={row.estimatedValue} onChange={(e) => upd({ properties: s.properties.map((r: any, j: number) => (j === i ? { ...r, estimatedValue: Number(e.target.value) || 0 } : r)) })} />
                    <button type="button" onClick={() => upd({ properties: s.properties.filter((_: any, j: number) => j !== i) })} className="px-2 text-crimson hover:underline">×</button>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <input className={field} type="number" placeholder="loan bal" value={row.currentLoanBalance} onChange={(e) => upd({ properties: s.properties.map((r: any, j: number) => (j === i ? { ...r, currentLoanBalance: Number(e.target.value) || 0 } : r)) })} />
                    <input className={field} type="number" placeholder="repay/mo" value={row.currentRepaymentAmount} onChange={(e) => upd({ properties: s.properties.map((r: any, j: number) => (j === i ? { ...r, currentRepaymentAmount: Number(e.target.value) || 0 } : r)) })} />
                    <input className={field} type="number" placeholder="rent/mo" value={row.grossRentalIncomeMonthly} onChange={(e) => upd({ properties: s.properties.map((r: any, j: number) => (j === i ? { ...r, grossRentalIncomeMonthly: Number(e.target.value) || 0 } : r)) })} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button type="button" onClick={() => run()} disabled={running} className="ripple-btn rounded-xl bg-gradient-to-br from-brand to-brand-dark px-5 py-2.5 text-sm font-semibold text-on-accent shadow-lg shadow-brand/30 hover:brightness-110 disabled:opacity-50">
            {running ? 'Ranking…' : 'Rank banks for this scenario'}
          </button>
        </div>
      </div>

      {/* Recommendations */}
      {recs.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-display text-base font-semibold text-primary">Which bank should we approach?</h3>
          {recs.map((r) => (
            <div key={r.brandCode} className="glass-2 rounded-2xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${catColor[r.category]}`}>{r.category.replace('_', ' ')}</span>
                  <span className="font-semibold text-primary">{r.bankName}</span>
                  <span className="text-xs text-muted">{r.calcResult.policyVersion}</span>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-muted">Score <span className="tnum font-semibold text-primary">{(r.score * 100).toFixed(0)}</span></span>
                  <span className={`font-semibold ${passColor[r.calcResult.passFail]}`}>{r.calcResult.passFail}</span>
                </div>
              </div>
              <p className="mt-1 text-sm text-secondary">{r.reasonSummary}</p>
              <div className="tnum mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
                <span>Max borrow: <span className="font-semibold text-primary">{money(r.calcResult.finalMaxBorrow)}</span></span>
                <span>Serviceability: {money(r.calcResult.maxBorrowServiceability)}</span>
                <span>DTI cap: {money(r.calcResult.maxBorrowDti)}</span>
                <span>DTI {r.calcResult.dtiRatio}x</span>
                <span>LVR {(r.calcResult.lvrRatio * 100).toFixed(0)}%</span>
                <span>Surplus {money(r.calcResult.netMonthlySurplus)}/mo</span>
                <span>Stress {(r.calcResult.stressRateUsed * 100).toFixed(2)}%</span>
              </div>
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-brand">Reasons ({r.calcResult.reasons.length})</summary>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-secondary">
                  {r.calcResult.reasons.map((reason: string, i: number) => <li key={i}>{reason}</li>)}
                </ul>
              </details>
            </div>
          ))}

          {/* Property inclusion matrix */}
          {s.properties.length > 0 && (
            <div className="glass-2 overflow-x-auto rounded-2xl p-4">
              <h4 className="mb-2 font-display text-sm font-semibold text-primary">Property inclusion matrix</h4>
              <p className="mb-3 text-xs text-muted">Toggle a property off for a specific bank; that bank re-ranks instantly. ✓ = actually considered after the bank&apos;s selection cap.</p>
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="px-2 py-1">Property</th>
                    {brands.map((b) => <th key={b} className="px-2 py-1 text-center">{b}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {s.properties.map((p: any, i: number) => (
                    <tr key={p.id} className="border-t border-white/8">
                      <td className="px-2 py-1.5 text-secondary">{p.type} · {money(p.estimatedValue)}</td>
                      {brands.map((b) => {
                        const included = p.includeOverrideForBank?.[b] ?? p.isIncludedInCalc;
                        const considered = recs.find((r) => r.brandCode === b)?.calcResult.propertiesConsidered.includes(p.id);
                        return (
                          <td key={b} className="px-2 py-1.5 text-center">
                            <label className="inline-flex items-center gap-1">
                              <input type="checkbox" checked={!!included} onChange={() => toggleMatrix(i, b)} className="h-4 w-4 rounded text-brand focus:ring-brand" />
                              {considered ? <span className="text-emerald">✓</span> : <span className="text-faint">–</span>}
                            </label>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default BankScenarioRunner;
