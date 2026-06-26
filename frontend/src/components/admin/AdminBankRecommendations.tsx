'use client';

import React, { useState } from 'react';
import api from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';

/* eslint-disable @typescript-eslint/no-explicit-any */

const money = (n: number) => `$${Math.round(n || 0).toLocaleString()}`;
const catColor: Record<string, string> = {
  PRIMARY: 'bg-success-light text-emerald ring-emerald/40',
  SECONDARY: 'bg-gold-light text-gold ring-gold/40',
  LONG_SHOT: 'bg-white/8 text-muted ring-white/15',
};
const passColor: Record<string, string> = { PASS: 'text-emerald', MARGINAL: 'text-gold', FAIL: 'text-crimson' };
const medal = ['🥇', '🥈', '🥉'];

/**
 * Reads this client's stored CRM data, runs the 2026 bank policy engine, and
 * suggests the top 3 lenders to approach (with reasons). Admin client detail.
 */
export function AdminBankRecommendations({ clientId }: { clientId: string }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [top3, setTop3] = useState<any[]>([]);
  const [all, setAll] = useState<any[]>([]);
  const [scenario, setScenario] = useState<any>(null);
  const [showAll, setShowAll] = useState(false);
  const [ran, setRan] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/admin/clients/${clientId}/bank-recommendations`);
      setTop3(res.data.top3 || []);
      setAll(res.data.all || []);
      setScenario(res.data.scenarioUsed || null);
      setRan(true);
    } catch (e: any) {
      toast(e?.response?.data?.error || 'Could not compute recommendations', { accent: 'crimson' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card title="Recommended Lenders (Top 3)">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-secondary">Suggests the best banks for this client from their saved income, expenses, properties, debts and latest scenario.</p>
        <button type="button" onClick={run} disabled={loading} className="rounded-xl bg-gradient-to-br from-brand to-brand-dark px-4 py-2 text-sm font-semibold text-on-accent shadow-lg shadow-brand/30 hover:brightness-110 disabled:opacity-50">
          {loading ? 'Analysing…' : ran ? 'Re-run' : 'Suggest top 3 banks'}
        </button>
      </div>

      {scenario && (
        <p className="tnum mt-3 rounded-lg bg-white/5 px-3 py-2 text-xs text-muted">
          Scenario used: {scenario.purpose.replace('_', ' ')} · target loan {money(scenario.targetLoanAmount)} · property {money(scenario.targetPropertyValue)} · {scenario.termYears}yr · {(scenario.interestRate * 100).toFixed(2)}% {scenario.repaymentType}
        </p>
      )}

      {ran && top3.length === 0 && (
        <p className="mt-3 text-sm text-muted">No active bank policies returned a result.</p>
      )}

      <div className="mt-3 space-y-3">
        {top3.map((r, i) => (
          <div key={r.brandCode} className="rounded-2xl border border-white/12 bg-white/5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">{medal[i]}</span>
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
              <span>DTI {r.calcResult.dtiRatio}x</span>
              <span>LVR {(r.calcResult.lvrRatio * 100).toFixed(0)}%</span>
              <span>Surplus {money(r.calcResult.netMonthlySurplus)}/mo</span>
              <span>Stress {(r.calcResult.stressRateUsed * 100).toFixed(2)}%</span>
            </div>
          </div>
        ))}
      </div>

      {all.length > 3 && (
        <div className="mt-3">
          <button type="button" onClick={() => setShowAll((s) => !s)} className="text-xs font-semibold text-brand hover:underline">
            {showAll ? 'Hide' : `Show all ${all.length} lenders`}
          </button>
          {showAll && (
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="px-2 py-1">Bank</th><th className="px-2 py-1">Result</th><th className="px-2 py-1 text-right">Max borrow</th><th className="px-2 py-1 text-right">Score</th>
                </tr>
              </thead>
              <tbody>
                {all.slice(3).map((r) => (
                  <tr key={r.brandCode} className="border-t border-white/8">
                    <td className="px-2 py-1.5 text-secondary">{r.bankName}</td>
                    <td className={`px-2 py-1.5 ${passColor[r.calcResult.passFail]}`}>{r.calcResult.passFail}</td>
                    <td className="tnum px-2 py-1.5 text-right text-primary">{money(r.calcResult.finalMaxBorrow)}</td>
                    <td className="tnum px-2 py-1.5 text-right text-muted">{(r.score * 100).toFixed(0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </Card>
  );
}

export default AdminBankRecommendations;
