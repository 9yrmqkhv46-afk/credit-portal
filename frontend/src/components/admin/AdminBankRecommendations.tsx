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
const prettyPattern = (p: string) => p.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

/** Build a printable HTML doc for the top 3 and open the print dialog (save as PDF). */
function exportPdf(clientName: string, scenario: any, top3: any[]) {
  const rows = top3.map((r, i) => `
    <div class="card">
      <div class="head"><span class="rank">${['1st','2nd','3rd'][i]}</span> <strong>${r.bankName}</strong>
        <span class="badge">${r.category.replace('_', ' ')}</span>
        <span class="pf ${r.calcResult.passFail}">${r.calcResult.passFail}</span></div>
      <p class="reason">${r.reasonSummary}</p>
      <p class="metrics">Max borrow: <strong>${money(r.calcResult.finalMaxBorrow)}</strong> ·
        DTI ${r.calcResult.dtiRatio}x · LVR ${(r.calcResult.lvrRatio * 100).toFixed(0)}% ·
        Surplus ${money(r.calcResult.netMonthlySurplus)}/mo · Stress ${(r.calcResult.stressRateUsed * 100).toFixed(2)}%</p>
    </div>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Recommended Lenders — ${clientName}</title>
    <style>
      body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#0b1220;margin:40px;}
      h1{font-size:20px;margin:0 0 4px;} .sub{color:#5b6472;font-size:12px;margin:0 0 18px;}
      .scenario{background:#f3f6fb;border-radius:8px;padding:10px 12px;font-size:12px;color:#3a4452;margin-bottom:18px;}
      .card{border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;margin-bottom:12px;}
      .head{font-size:15px;margin-bottom:6px;} .rank{color:#0a8a91;font-weight:700;margin-right:6px;}
      .badge{font-size:11px;background:#eef2f7;border-radius:999px;padding:2px 8px;margin-left:8px;color:#3a4452;}
      .pf{font-weight:700;margin-left:8px;} .pf.PASS{color:#0a8f57;} .pf.MARGINAL{color:#b8860b;} .pf.FAIL{color:#c02b3a;}
      .reason{font-size:13px;color:#283142;margin:4px 0;} .metrics{font-size:12px;color:#5b6472;margin:4px 0 0;}
      .disc{margin-top:18px;font-size:11px;color:#8a93a3;}
    </style></head><body>
      <h1>Recommended Lenders — Top 3</h1>
      <p class="sub">${clientName} · generated ${new Date().toLocaleDateString()}</p>
      <div class="scenario">Scenario: ${String(scenario?.purpose || '').replace('_', ' ')} · target loan ${money(scenario?.targetLoanAmount)} · property ${money(scenario?.targetPropertyValue)} · ${scenario?.termYears}yr · ${((scenario?.interestRate || 0) * 100).toFixed(2)}% ${scenario?.repaymentType}</div>
      ${rows}
      <p class="disc">Indicative modelling only — not official lender policy or a credit decision.</p>
    </body></html>`;
  const w = window.open('', '_blank', 'width=820,height=900');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}

export function AdminBankRecommendations({ clientId, clientName = 'Client' }: { clientId: string; clientName?: string }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [top3, setTop3] = useState<any[]>([]);
  const [all, setAll] = useState<any[]>([]);
  const [scenario, setScenario] = useState<any>(null);
  const [patterns, setPatterns] = useState<string[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [ran, setRan] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/admin/clients/${clientId}/bank-recommendations`);
      setTop3(res.data.top3 || []);
      setAll(res.data.all || []);
      setScenario(res.data.scenarioUsed || null);
      setPatterns(res.data.patterns || []);
      setRan(true);
    } catch (e: any) {
      toast(e?.response?.data?.error || 'Could not compute recommendations', { accent: 'crimson' });
    } finally {
      setLoading(false);
    }
  };

  const share = async () => {
    setSharing(true);
    try {
      await api.post(`/admin/clients/${clientId}/bank-recommendations/share`);
      toast('Top 3 sent to the client’s messages', { accent: 'emerald' });
    } catch (e: any) {
      toast(e?.response?.data?.error || 'Could not share', { accent: 'crimson' });
    } finally {
      setSharing(false);
    }
  };

  return (
    <Card title="Recommended Lenders (Top 3)">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-secondary">Reads this client’s saved income, expenses, properties, debts and latest scenario, matches their profile pattern, then ranks the best banks.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={run} disabled={loading} className="rounded-xl bg-gradient-to-br from-brand to-brand-dark px-4 py-2 text-sm font-semibold text-on-accent shadow-lg shadow-brand/30 hover:brightness-110 disabled:opacity-50">
            {loading ? 'Analysing…' : ran ? 'Re-run' : 'Suggest top 3 banks'}
          </button>
          {top3.length > 0 && (
            <>
              <button type="button" onClick={() => exportPdf(clientName, scenario, top3)} className="rounded-xl px-4 py-2 text-sm font-semibold text-secondary ring-1 ring-white/15 hover:bg-white/10">Export PDF</button>
              <button type="button" onClick={share} disabled={sharing} className="rounded-xl px-4 py-2 text-sm font-semibold text-brand ring-1 ring-brand/40 hover:bg-brand-light disabled:opacity-50">{sharing ? 'Sending…' : 'Send to client'}</button>
            </>
          )}
        </div>
      </div>

      {patterns.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">Detected profile:</span>
          {patterns.map((p) => <span key={p} className="rounded-full bg-accent-light px-2.5 py-0.5 text-xs font-semibold text-sapphire ring-1 ring-sapphire/30">{prettyPattern(p)}</span>)}
        </div>
      )}

      {scenario && (
        <p className="tnum mt-2 rounded-lg bg-white/5 px-3 py-2 text-xs text-muted">
          Scenario used: {scenario.purpose.replace('_', ' ')} · target loan {money(scenario.targetLoanAmount)} · property {money(scenario.targetPropertyValue)} · {scenario.termYears}yr · {(scenario.interestRate * 100).toFixed(2)}% {scenario.repaymentType}
        </p>
      )}

      {ran && top3.length === 0 && <p className="mt-3 text-sm text-muted">No active bank policies returned a result.</p>}

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
