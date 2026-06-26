'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import api from '@/lib/api';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';

/**
 * Borrowing Power Studio — an immersive, real-time lending console.
 *
 * Every input change re-drives the deterministic 2026 bank-policy engine
 * (via the /bank-policies API) and re-renders live visualizations: a bank
 * "capacity race", an affordability gauge with cost breakdown, rate-shock and
 * sensitivity analysis, a repayment area chart, and an actionable path to
 * approval. Pure SVG charts, glass UI, fluid motion — no chart libraries.
 */

// --- formatting helpers -----------------------------------------------------
const money = (n: number) => `$${Math.round(n || 0).toLocaleString()}`;
const moneyShort = (n: number) => {
  const v = Math.round(n || 0);
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `$${Math.round(v / 1000)}k`;
  return `$${v}`;
};
const PASS_COLOR: Record<string, string> = { PASS: 'var(--accent-emerald)', MARGINAL: 'var(--accent-gold)', FAIL: 'var(--accent-crimson)' };
const AU_STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'];

type Purpose = 'OWNER_OCC' | 'INVESTMENT' | 'COMMERCIAL_PROPERTY_LIGHT';
type Repayment = 'PI' | 'IO';

interface Inputs {
  primary: number; secondary: number; monthlyExpenses: number; savings: number;
  propertyValue: number; loanAmount: number; rate: number; term: number;
  cardLimit: number; adults: number; children: number;
  purpose: Purpose; repayment: Repayment; ioYears: number; state: string; selfEmployed: boolean;
}

const DEFAULTS: Inputs = {
  primary: 140000, secondary: 30000, monthlyExpenses: 4200, savings: 220000,
  propertyValue: 1050000, loanAmount: 840000, rate: 6.2, term: 30,
  cardLimit: 15000, adults: 2, children: 1,
  purpose: 'OWNER_OCC', repayment: 'PI', ioYears: 5, state: 'NSW', selfEmployed: false,
};

function buildScenario(i: Inputs) {
  const incomeSources: any[] = [];
  if (i.selfEmployed) incomeSources.push({ type: 'BUSINESS', amount: i.primary, frequency: 'ANNUAL', yearsFinancials: 3 });
  else incomeSources.push({ type: 'SALARY_PRIMARY', amount: i.primary, frequency: 'ANNUAL' });
  if (i.secondary > 0) incomeSources.push({ type: 'SALARY_SECONDARY', amount: i.secondary, frequency: 'ANNUAL' });
  const debts = i.cardLimit > 0 ? [{ id: 'cc', type: 'CREDIT_CARD', source: 'STANDALONE', creditLimit: i.cardLimit }] : [];
  return {
    client: { numberOfAdults: i.adults, numberOfChildren: i.children, isSelfEmployed: i.selfEmployed },
    incomeSources,
    expenses: { declaredMonthlyLiving: i.monthlyExpenses },
    properties: [],
    debts,
    scenario: {
      purpose: i.purpose, targetLoanAmount: i.loanAmount, targetPropertyValue: i.propertyValue,
      termYears: i.term, interestRate: i.rate / 100, repaymentType: i.repayment,
    },
  };
}

// ===========================================================================
// Small presentational primitives
// ===========================================================================

function Slider({ label, value, onChange, min, max, step = 1, fmt }: {
  label: string; value: number; onChange: (n: number) => void; min: number; max: number; step?: number; fmt?: (n: number) => string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label className="text-xs font-medium text-secondary">{label}</label>
        <span className="tnum text-sm font-semibold text-primary">{fmt ? fmt(value) : value}</span>
      </div>
      <input type="range" className="range-teal mt-1.5" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

function Seg<T extends string>({ value, options, onChange }: { value: T; options: Array<{ v: T; label: string }>; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.v} type="button" className="seg-btn" data-on={value === o.v} onClick={() => onChange(o.v)}>{o.label}</button>
      ))}
    </div>
  );
}

function Stepper({ label, value, onChange, min = 0, max = 9 }: { label: string; value: number; onChange: (n: number) => void; min?: number; max?: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs font-medium text-secondary">{label}</span>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => onChange(Math.max(min, value - 1))} className="h-7 w-7 rounded-lg bg-white/8 text-primary ring-1 ring-white/12 hover:bg-white/15">−</button>
        <span className="tnum w-5 text-center text-sm font-semibold text-primary">{value}</span>
        <button type="button" onClick={() => onChange(Math.min(max, value + 1))} className="h-7 w-7 rounded-lg bg-white/8 text-primary ring-1 ring-white/12 hover:bg-white/15">+</button>
      </div>
    </div>
  );
}

// --- charts -----------------------------------------------------------------

function LineChart({ points, height = 190 }: { points: Array<{ x: number; y: number; label?: string }>; height?: number }) {
  if (points.length < 2) return <div className="flex h-[190px] items-center justify-center text-sm text-muted">No data</div>;
  const w = 560, h = height, pad = 34;
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const sx = (x: number) => pad + ((x - minX) / ((maxX - minX) || 1)) * (w - 2 * pad);
  const sy = (y: number) => h - pad - ((y - minY) / ((maxY - minY) || 1)) * (h - 2 * pad);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(' ');
  const area = `${line} L${sx(maxX).toFixed(1)} ${h - pad} L${sx(minX).toFixed(1)} ${h - pad} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="line chart">
      <defs>
        <linearGradient id="lc" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(0,196,212,0.35)" />
          <stop offset="100%" stopColor="rgba(0,196,212,0)" />
        </linearGradient>
      </defs>
      {[0, 0.5, 1].map((g) => (
        <line key={g} x1={pad} x2={w - pad} y1={pad + g * (h - 2 * pad)} y2={pad + g * (h - 2 * pad)} stroke="rgba(255,255,255,0.06)" />
      ))}
      <path d={area} fill="url(#lc)" />
      <path d={line} fill="none" stroke="var(--accent-teal)" strokeWidth={2.5} className="chart-line" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={3} fill="var(--accent-teal)" />
      ))}
      <text x={pad} y={h - 8} className="tnum" fontSize="10" fill="rgba(140,165,210,0.7)">{points[0].label}</text>
      <text x={w - pad} y={h - 8} textAnchor="end" className="tnum" fontSize="10" fill="rgba(140,165,210,0.7)">{points[points.length - 1].label}</text>
    </svg>
  );
}

function AreaChart({ series }: { series: Array<{ period: number; balance: number; phase: string }> }) {
  if (series.length < 2) return <div className="flex h-[190px] items-center justify-center text-sm text-muted">No data</div>;
  const w = 560, h = 190, pad = 34;
  const maxP = Math.max(...series.map((s) => s.period));
  const maxB = Math.max(...series.map((s) => s.balance));
  const sx = (p: number) => pad + (p / maxP) * (w - 2 * pad);
  const sy = (b: number) => h - pad - (b / (maxB || 1)) * (h - 2 * pad);
  const line = series.map((s, i) => `${i ? 'L' : 'M'}${sx(s.period).toFixed(1)} ${sy(s.balance).toFixed(1)}`).join(' ');
  const area = `${line} L${sx(maxP).toFixed(1)} ${h - pad} L${sx(0).toFixed(1)} ${h - pad} Z`;
  const ioEnd = series.filter((s) => s.phase === 'IO').slice(-1)[0];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="amortization">
      <defs>
        <linearGradient id="ac" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(61,142,255,0.40)" />
          <stop offset="100%" stopColor="rgba(61,142,255,0)" />
        </linearGradient>
      </defs>
      {ioEnd && <rect x={pad} y={pad} width={sx(ioEnd.period) - pad} height={h - 2 * pad} fill="rgba(240,180,41,0.08)" />}
      <path d={area} fill="url(#ac)" />
      <path d={line} fill="none" stroke="var(--accent-sapphire)" strokeWidth={2.5} className="chart-line" strokeLinecap="round" />
      {ioEnd && <text x={sx(ioEnd.period / 2)} y={pad + 14} textAnchor="middle" fontSize="10" fill="var(--accent-gold)">interest-only</text>}
    </svg>
  );
}

function Gauge({ value, target, max }: { value: number; target: number; max: number }) {
  const pct = Math.max(0, Math.min(1, value / (max || 1)));
  const targetPct = Math.max(0, Math.min(1, target / (max || 1)));
  const covers = value >= target;
  return (
    <div>
      <div className="relative h-4 w-full overflow-hidden rounded-full bg-white/8">
        <div className="race-bar h-full rounded-full" style={{ width: `${pct * 100}%`, background: covers ? 'linear-gradient(90deg,var(--accent-emerald),var(--accent-teal))' : 'linear-gradient(90deg,var(--accent-gold),var(--accent-crimson))' }} />
        <div className="absolute top-0 h-full w-0.5 bg-white/80" style={{ left: `${targetPct * 100}%` }} title="target" />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted"><span>capacity</span><span className="tnum">target {moneyShort(target)}</span></div>
    </div>
  );
}

// ===========================================================================
// Main page
// ===========================================================================

type Scene = 'compare' | 'afford' | 'risk' | 'repay';

export default function StudioPage() {
  const [inputs, setInputs] = useState<Inputs>(DEFAULTS);
  const [scene, setScene] = useState<Scene>('compare');
  const [loading, setLoading] = useState(false);
  const [offline, setOffline] = useState(false);

  const [rows, setRows] = useState<any[]>([]);
  const [bestBank, setBestBank] = useState<string>('');
  const [amort, setAmort] = useState<any>(null);
  const [stress, setStress] = useState<any>(null);
  const [sens, setSens] = useState<any>(null);
  const [opt, setOpt] = useState<any>(null);
  const [afford, setAfford] = useState<any>(null);

  const reqId = useRef(0);
  const set = <K extends keyof Inputs>(k: K, v: Inputs[K]) => setInputs((prev) => ({ ...prev, [k]: v }));

  const serialized = JSON.stringify(inputs);
  useEffect(() => {
    const id = ++reqId.current;
    const t = setTimeout(async () => {
      setLoading(true);
      const body = buildScenario(inputs);
      try {
        const [cmp, am] = await Promise.all([
          api.post('/bank-policies/compare', body),
          api.post('/bank-policies/amortization', { principal: inputs.loanAmount, annualRate: inputs.rate / 100, termYears: inputs.term, ioYears: inputs.repayment === 'IO' ? inputs.ioYears : 0 }),
        ]);
        if (id !== reqId.current) return;
        setOffline(false);
        setRows(cmp.data.rows || []);
        setAmort(am.data);
        const best = cmp.data.bestPick || cmp.data.rows?.[0]?.brandCode;
        setBestBank(best || '');
        if (best) {
          const [st, se, op, af] = await Promise.all([
            api.post(`/bank-policies/${best}/stress`, { scenario: body, shockBps: 300 }),
            api.post(`/bank-policies/${best}/sensitivity`, { scenario: body, variable: 'interestRate', steps: 9 }),
            api.post(`/bank-policies/${best}/optimize`, { scenario: body }),
            api.post(`/bank-policies/${best}/affordability`, { scenario: body, savings: inputs.savings, state: inputs.state }),
          ]);
          if (id !== reqId.current) return;
          setStress(st.data); setSens(se.data); setOpt(op.data); setAfford(af.data);
        }
      } catch {
        if (id === reqId.current) setOffline(true);
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serialized]);

  const sortedRows = useMemo(() => [...rows].sort((a, b) => b.finalMaxBorrow - a.finalMaxBorrow), [rows]);
  const topRow = sortedRows[0];
  const maxBorrow = topRow?.finalMaxBorrow || 1;
  const passCount = rows.filter((r) => r.passFail === 'PASS').length;
  const lvr = inputs.propertyValue > 0 ? (inputs.loanAmount / inputs.propertyValue) * 100 : 0;

  const sensPoints = (sens?.points || []).map((p: any) => ({ x: p.value, y: p.maxBorrow, label: `${(p.value * 100).toFixed(1)}%` }));
  const amortSeries = (amort?.schedule || []).map((s: any) => ({ period: s.period, balance: s.closingBalance, phase: s.phase }));

  return (
    <div className="relative space-y-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl glass-3 p-7">
        <div className="studio-aurora" aria-hidden="true" />
        <div className="relative animate-enter">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-teal">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-teal" /> Live engine · 10 lenders
          </div>
          <h1 className="mt-2 font-display text-4xl font-bold text-primary">Borrowing Power Studio</h1>
          <p className="mt-1 max-w-2xl text-secondary">Move any dial and watch all ten 2026 lender policies recompute in real time — capacity, affordability, rate-shock resilience and the smartest path to approval.</p>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiTile label="Top capacity" value={topRow ? money(topRow.finalMaxBorrow) : '—'} accent="teal" pulseKey={maxBorrow} />
            <KpiTile label="Lenders approving" value={`${passCount}/${rows.length || 10}`} accent="emerald" pulseKey={passCount} />
            <KpiTile label="Requested LVR" value={`${lvr.toFixed(1)}%`} accent={lvr > 80 ? 'gold' : 'teal'} pulseKey={Math.round(lvr)} />
            <KpiTile label="Best lender" value={bestBank || '—'} accent="sapphire" pulseKey={bestBank as any} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_1fr]">
        {/* Control deck */}
        <div className="space-y-4 rounded-2xl glass-2 p-5 lg:sticky lg:top-4 lg:self-start">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-primary">Control deck</h2>
            <button type="button" onClick={() => setInputs(DEFAULTS)} className="text-xs font-semibold text-brand hover:underline">Reset</button>
          </div>

          <div className="flex flex-wrap gap-2">
            <Seg<Purpose> value={inputs.purpose} onChange={(v) => set('purpose', v)} options={[{ v: 'OWNER_OCC', label: 'Owner-occ' }, { v: 'INVESTMENT', label: 'Investment' }, { v: 'COMMERCIAL_PROPERTY_LIGHT', label: 'Commercial' }]} />
            <Seg<Repayment> value={inputs.repayment} onChange={(v) => set('repayment', v)} options={[{ v: 'PI', label: 'P&I' }, { v: 'IO', label: 'Interest-only' }]} />
          </div>

          <Slider label={inputs.selfEmployed ? 'Business income (yr)' : 'Primary income (yr)'} value={inputs.primary} min={40000} max={500000} step={5000} onChange={(n) => set('primary', n)} fmt={money} />
          <Slider label="Secondary income (yr)" value={inputs.secondary} min={0} max={200000} step={5000} onChange={(n) => set('secondary', n)} fmt={money} />
          <Slider label="Living expenses (mo)" value={inputs.monthlyExpenses} min={1500} max={14000} step={100} onChange={(n) => set('monthlyExpenses', n)} fmt={money} />
          <Slider label="Savings / deposit" value={inputs.savings} min={20000} max={800000} step={5000} onChange={(n) => set('savings', n)} fmt={money} />
          <Slider label="Property value" value={inputs.propertyValue} min={300000} max={3500000} step={10000} onChange={(n) => set('propertyValue', n)} fmt={moneyShort} />
          <Slider label="Loan amount" value={inputs.loanAmount} min={100000} max={3000000} step={10000} onChange={(n) => set('loanAmount', n)} fmt={moneyShort} />
          <Slider label="Interest rate" value={inputs.rate} min={4} max={9} step={0.05} onChange={(n) => set('rate', n)} fmt={(n) => `${n.toFixed(2)}%`} />
          <Slider label="Term (years)" value={inputs.term} min={10} max={30} step={1} onChange={(n) => set('term', n)} />
          <Slider label="Credit-card limits" value={inputs.cardLimit} min={0} max={80000} step={1000} onChange={(n) => set('cardLimit', n)} fmt={money} />

          <div className="grid grid-cols-2 gap-3">
            <Stepper label="Adults" value={inputs.adults} min={1} max={6} onChange={(n) => set('adults', n)} />
            <Stepper label="Children" value={inputs.children} min={0} max={8} onChange={(n) => set('children', n)} />
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-xs font-medium text-secondary">Self-employed</span>
            <button type="button" role="switch" aria-checked={inputs.selfEmployed} className="switch" data-on={inputs.selfEmployed} onClick={() => set('selfEmployed', !inputs.selfEmployed)}>
              <span className="switch-thumb" />
            </button>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-secondary">State</span>
            <select value={inputs.state} onChange={(e) => set('state', e.target.value)} className="glass-input rounded-lg px-2 py-1 text-sm">
              {AU_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {/* Stage */}
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {([['compare', 'Lender race'], ['afford', 'Affordability'], ['risk', 'Risk & sensitivity'], ['repay', 'Repayments']] as Array<[Scene, string]>).map(([s, label]) => (
              <button key={s} type="button" onClick={() => setScene(s)} className={`rounded-full px-4 py-1.5 text-sm font-medium ring-1 transition ${scene === s ? 'bg-brand/20 text-brand ring-brand/50' : 'text-secondary ring-white/15 hover:bg-white/10'}`}>{label}</button>
            ))}
            <span className="ml-auto flex items-center gap-2 text-xs text-muted">
              {loading ? <><span className="inline-block h-2 w-2 animate-ping rounded-full bg-teal" /> recomputing…</> : offline ? <span className="text-gold">API offline — start the backend to go live</span> : <><span className="inline-block h-2 w-2 rounded-full bg-emerald" /> up to date</>}
            </span>
          </div>

          {scene === 'compare' && (
            <div key="compare" className="scene-in space-y-4">
              <div className="rounded-2xl glass-2 p-5">
                <h3 className="mb-4 font-display text-lg font-semibold text-primary">Lender capacity race</h3>
                <div className="space-y-2.5">
                  {sortedRows.length === 0 && <EmptyRows offline={offline} />}
                  {sortedRows.map((r, idx) => (
                    <div key={r.brandCode} className="group">
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2">
                          {idx === 0 && <span>🏆</span>}
                          <span className="font-semibold text-primary">{r.bankName}</span>
                          <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: 'rgba(255,255,255,0.06)', color: PASS_COLOR[r.passFail] }}>{r.passFail}</span>
                        </span>
                        <span className="tnum font-semibold text-primary">{money(r.finalMaxBorrow)}</span>
                      </div>
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/6">
                        <div className="race-bar h-full rounded-full" style={{ width: `${(r.finalMaxBorrow / maxBorrow) * 100}%`, background: `linear-gradient(90deg, ${PASS_COLOR[r.passFail]}, rgba(255,255,255,0.15))` }} />
                      </div>
                      <div className="mt-0.5 flex justify-between text-[11px] text-muted"><span>DTI {r.dti}x · LVR {(r.lvr * 100).toFixed(0)}%</span><span>limited by {r.bindingConstraint}</span></div>
                    </div>
                  ))}
                </div>
              </div>
              {opt && !opt.alreadyApproved && opt.suggestions?.length > 0 && (
                <div className="rounded-2xl glass-2 p-5">
                  <h3 className="font-display text-lg font-semibold text-primary">Path to approval — {bestBank}</h3>
                  <p className="mt-0.5 text-sm text-muted">Shortfall of {money(opt.gap)}. Smallest levers to reach approval:</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {opt.suggestions.map((s: any, i: number) => (
                      <div key={i} className="rounded-xl bg-white/5 p-3 text-sm ring-1 ring-white/8">
                        <span className="text-secondary">{s.description}</span>
                        {s.resultingPass && <span className="ml-1 text-emerald">→ approves ✓</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {opt?.alreadyApproved && (
                <div className="rounded-2xl bg-success-light p-4 text-sm text-emerald ring-1 ring-emerald/30">✓ {bestBank} already approves the requested {money(inputs.loanAmount)}.</div>
              )}
            </div>
          )}

          {scene === 'afford' && (
            <div key="afford" className="scene-in space-y-4">
              <div className="rounded-2xl glass-2 p-5">
                <h3 className="font-display text-lg font-semibold text-primary">Maximum purchase price — {bestBank}</h3>
                <div className="mt-4 flex flex-wrap items-end gap-x-8 gap-y-3">
                  <div>
                    <div className="text-xs text-muted">You could buy up to</div>
                    <div className="tnum font-display text-4xl font-bold text-primary"><AnimatedNumber value={afford?.maxPropertyPrice || 0} prefix="$" /></div>
                  </div>
                  <div className="text-sm text-secondary">
                    <div>Loan required <span className="tnum font-semibold text-primary">{money(afford?.loanRequired || 0)}</span></div>
                    <div>LVR <span className="tnum font-semibold text-primary">{((afford?.lvr || 0) * 100).toFixed(1)}%</span> · limited by <span className="text-teal">{afford?.limitedBy}</span></div>
                  </div>
                </div>
                <div className="mt-4"><Gauge value={afford?.maxPropertyPrice || 0} target={inputs.propertyValue} max={Math.max(afford?.maxPropertyPrice || 0, inputs.propertyValue) * 1.1} /></div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl glass-2 p-5">
                  <h4 className="text-sm font-semibold text-primary">Upfront costs</h4>
                  <CostRow label="Stamp duty" value={afford?.upfrontCosts?.stampDuty} />
                  <CostRow label="Government fees" value={afford?.upfrontCosts?.governmentFees} />
                  <CostRow label="Conveyancing" value={afford?.upfrontCosts?.conveyancing} />
                  <CostRow label="LMI premium" value={afford?.lmiPremium} />
                  <div className="mt-2 flex justify-between border-t border-white/10 pt-2 text-sm font-semibold text-primary"><span>Total</span><span className="tnum">{money((afford?.upfrontCosts?.total || 0) + (afford?.lmiPremium || 0))}</span></div>
                </div>
                <div className="rounded-2xl glass-2 p-5">
                  <h4 className="text-sm font-semibold text-primary">Deposit split</h4>
                  <CostRow label="Your savings" value={inputs.savings} />
                  <CostRow label="Towards property" value={afford?.depositTowardsProperty} />
                  <CostRow label="Eaten by costs" value={(inputs.savings) - (afford?.depositTowardsProperty || 0)} />
                  <p className="mt-2 text-[11px] text-muted">Modelled estimate — not financial advice, official duty, or an LMI quote.</p>
                </div>
              </div>
            </div>
          )}

          {scene === 'risk' && (
            <div key="risk" className="scene-in space-y-4">
              <div className="rounded-2xl glass-2 p-5">
                <h3 className="font-display text-lg font-semibold text-primary">Rate-shock stress (+3%) — {bestBank}</h3>
                <div className="mt-3 flex flex-wrap items-center gap-6">
                  <div className={`rounded-xl px-4 py-3 text-center ring-1 ${stress?.survives ? 'bg-success-light text-emerald ring-emerald/30' : 'bg-danger-light text-crimson ring-crimson/30'}`}>
                    <div className="text-xs uppercase tracking-wide">{stress?.survives ? 'Survives' : 'Fails'}</div>
                    <div className="text-lg font-bold">{stress?.survives ? 'Resilient' : 'At risk'}</div>
                  </div>
                  <Metric label="Base surplus" value={money(stress?.baseSurplus || 0)} />
                  <Metric label="After +3%" value={money(stress?.shockedSurplus || 0)} />
                  <Metric label="Capacity after shock" value={money(stress?.maxBorrowAfterShock || 0)} />
                </div>
              </div>
              <div className="rounded-2xl glass-2 p-5">
                <h3 className="font-display text-lg font-semibold text-primary">Borrowing capacity vs interest rate</h3>
                <p className="text-sm text-muted">How {bestBank}&rsquo;s maximum loan moves as rates change.</p>
                <div className="mt-2"><LineChart points={sensPoints} /></div>
              </div>
            </div>
          )}

          {scene === 'repay' && (
            <div key="repay" className="scene-in space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <Metric big label="Monthly (P&I)" value={money(amort?.monthlyRepaymentPI || 0)} />
                <Metric big label={inputs.repayment === 'IO' ? 'Monthly (IO)' : 'Total interest'} value={inputs.repayment === 'IO' ? money(amort?.monthlyRepaymentIO || 0) : money(amort?.totalInterest || 0)} />
                <Metric big label="Comparison rate" value={`${((amort?.comparisonRate || 0) * 100).toFixed(2)}%`} />
              </div>
              <div className="rounded-2xl glass-2 p-5">
                <h3 className="font-display text-lg font-semibold text-primary">Loan balance over {inputs.term} years</h3>
                <div className="mt-2"><AreaChart series={amortSeries} /></div>
                <p className="mt-1 text-[11px] text-muted">Total repaid <span className="tnum text-secondary">{money(amort?.totalRepaid || 0)}</span> · total interest <span className="tnum text-secondary">{money(amort?.totalInterest || 0)}</span></p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- tiny display helpers ---------------------------------------------------

function KpiTile({ label, value, accent, pulseKey }: { label: string; value: string; accent: string; pulseKey: any }) {
  const color: Record<string, string> = { teal: 'text-teal', emerald: 'text-emerald', gold: 'text-gold', sapphire: 'text-sapphire' };
  return (
    <div className="kpi-tile rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
      {/* Keyed overlay remounts on value change, replaying the glow with no effect. */}
      <span key={String(pulseKey)} className="kpi-pulse pointer-events-none absolute inset-0 rounded-2xl" aria-hidden="true" />
      <div className="relative text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <div className={`tnum relative mt-0.5 text-lg font-bold ${color[accent] || 'text-primary'}`}>{value}</div>
    </div>
  );
}

function Metric({ label, value, big = false }: { label: string; value: string; big?: boolean }) {
  return (
    <div className={big ? 'rounded-2xl glass-2 p-4' : ''}>
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <div className={`tnum font-bold text-primary ${big ? 'text-2xl' : 'text-lg'}`}>{value}</div>
    </div>
  );
}

function CostRow({ label, value }: { label: string; value?: number }) {
  return (
    <div className="mt-1.5 flex justify-between text-sm">
      <span className="text-secondary">{label}</span>
      <span className="tnum text-primary">{money(value || 0)}</span>
    </div>
  );
}

function EmptyRows({ offline }: { offline: boolean }) {
  if (offline) return <p className="py-6 text-center text-sm text-gold">Couldn&rsquo;t reach the lending engine. Start the backend API and adjust a dial to go live.</p>;
  return (
    <div className="space-y-2">
      {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-8 w-full" />)}
    </div>
  );
}
