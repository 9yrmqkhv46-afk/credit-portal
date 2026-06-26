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
 * suggests the top 3 lenders to approach (with plain-English explanations).
 * Optionally shows the EXPERIMENTAL scenario-pattern match (Algorithm B → A).
 */
export function AdminBankRecommendations({ clientId }: { clientId: string }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [top3, setTop3] = useState<any[]>([]);
  const [all, setAll] = useState<any[]>([]);
  const [scenario, setScenario] = useState<any>(null);
  const [explanations, setExplanations] = useState<Record<string, any>>({});
  const [match, setMatch] = useState<any>(null);
  const [showAll, setShowAll] = useState(false);
  const [openExplain, setOpenExplain] = useState<Record<string, boolean>>({});
  const [ran, setRan] = useState(false);

  const run = async (withMatch = false) => {
    setLoading(true);
    try {
      const res = await api.get(`/admin/clients/${clientId}/bank-recommendations${withMatch ? '?match=1' : ''}`);
      setTop3(res.data.top3 || []);
      setAll(res.data.all || []);
      setScenario(res.data.scenarioUsed || null);
      setExplanations(res.data.explanations || {});
      if (withMatch) setMatch(res.data.match || null);
      setRan(true);
    } catch (e: any) {
      toast(e?.response?.data?.error || 'Could not compute recommendations', { accent: 'crimson' });
    } finally {
      setLoading(false);
    }
  };

  const toggleExplain = (brand: string) => setOpenExplain((o) => ({ ...o, [brand]: !o[brand] }));

  return (
    <Card title="Recommended Lenders (Top 3)">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-secondary">Suggests the best banks for this client from their saved income, expenses, properties, debts and latest scenario.</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => run(false)} disabled={loading} className="rounded-xl bg-gradient-to-br from-brand to-brand-dark px-4 py-2 text-sm font-semibold text-on-accent shadow-lg shadow-brand/30 hover:brightness-110 disabled:opacity-50">
            {loading ? 'Analysing…' : ran ? 'Re-run' : 'Suggest top 3 banks'}
          </button>
          <button type="button" onClick={() => run(true)} disabled={loading} title="Experimental: pattern + semantic match, ordered by the deterministic engine" className="rounded-xl px-4 py-2 text-sm font-semibold text-secondary ring-1 ring-white/15 hover:bg-white/10 disabled:opacity-50">
            Scenario match (beta)
          </button>
        </div>
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
        {top3.map((r, i) => {
          const ex = explanations[r.brandCode];
          const open = openExplain[r.brandCode];
          return (
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

              {ex && (
                <div className="mt-2">
                  <button type="button" onClick={() => toggleExplain(r.brandCode)} className="text-xs font-semibold text-brand hover:underline">
                    {open ? 'Hide explanation' : 'Why this lender?'}
                  </button>
                  {open && (
                    <div className="mt-2 space-y-2 rounded-xl bg-white/5 p-3 text-sm">
                      <p className="font-medium text-primary">{ex.headline}</p>
                      <p className="text-secondary">{ex.narrative}</p>
                      {ex.strengths?.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-emerald">Strengths</p>
                          <ul className="ml-4 list-disc text-xs text-secondary">{ex.strengths.map((s: string, k: number) => <li key={k}>{s}</li>)}</ul>
                        </div>
                      )}
                      {ex.watchOuts?.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-gold">Watch-outs</p>
                          <ul className="ml-4 list-disc text-xs text-secondary">{ex.watchOuts.map((s: string, k: number) => <li key={k}>{s}</li>)}</ul>
                        </div>
                      )}
                      <p className="text-xs text-muted"><span className="font-semibold">Binding constraint:</span> {ex.bindingConstraint}</p>
                      {ex.nextSteps?.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-brand">Next steps</p>
                          <ul className="ml-4 list-disc text-xs text-secondary">{ex.nextSteps.map((s: string, k: number) => <li key={k}>{s}</li>)}</ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {match && (
        <div className="mt-4 rounded-2xl border border-brand/30 bg-brand/5 p-4">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-brand/20 px-2 py-0.5 text-xs font-semibold text-brand ring-1 ring-brand/40">EXPERIMENTAL</span>
            <span className="text-sm font-semibold text-primary">Scenario pattern match (Algorithm B → A)</span>
          </div>
          <p className="mt-1 text-xs text-muted">{match.disclaimer}</p>

          <div className="mt-2">
            <p className="text-xs font-semibold text-secondary">Detected client patterns</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {(match.patterns || []).map((p: any) => (
                <span key={p.pattern.id} className="rounded-full bg-white/8 px-2.5 py-0.5 text-xs text-secondary ring-1 ring-white/12">
                  {p.pattern.label} <span className="text-muted">({Math.round(p.confidence * 100)}%)</span>
                </span>
              ))}
            </div>
          </div>

          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="px-2 py-1">Bank</th>
                <th className="px-2 py-1 text-right">Match</th>
                <th className="px-2 py-1 text-right">Tag fit</th>
                <th className="px-2 py-1 text-right">Semantic</th>
                <th className="px-2 py-1 text-right">Engine</th>
              </tr>
            </thead>
            <tbody>
              {(match.cluster || []).slice(0, 6).map((c: any) => (
                <tr key={c.brandCode} className="border-t border-white/8 align-top">
                  <td className="px-2 py-1.5 text-secondary">
                    {c.bankName}
                    {c.matchedTags?.length > 0 && (
                      <span className="block text-[11px] text-muted">{c.matchedTags.join(' · ')}</span>
                    )}
                  </td>
                  <td className="tnum px-2 py-1.5 text-right font-semibold text-primary">{(c.matchScore * 100).toFixed(0)}</td>
                  <td className="tnum px-2 py-1.5 text-right text-muted">{(c.tagScore * 100).toFixed(0)}</td>
                  <td className="tnum px-2 py-1.5 text-right text-muted">{(c.semanticScore * 100).toFixed(0)}</td>
                  <td className="tnum px-2 py-1.5 text-right text-muted">{(c.engineScore * 100).toFixed(0)} <span className={passColor[c.passFail]}>{c.passFail}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-muted">Match = 70% tag fit + 30% semantic similarity (shortlist only). Final order always comes from the deterministic engine.</p>
        </div>
      )}

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
