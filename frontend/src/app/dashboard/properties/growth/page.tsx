'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { Property, PortfolioGrowth } from '@/types';
import { Spinner } from '@/components/ui/Spinner';
import { CagrSparkline } from '@/components/ui/CagrSparkline';

function money(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });
}
function moneyShort(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  const v = Math.round(n);
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `$${Math.round(v / 1000)}k`;
  return `$${v}`;
}
function pct(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `${n.toFixed(1)}%`;
}

// --- Infographics -----------------------------------------------------------

interface Segment { label: string; value: number; color: string }

/** Donut chart (SVG) — used for the equity vs debt split of a property. */
function DonutChart({ segments, centerTop, centerSub, size = 148, thickness = 20 }: {
  segments: Segment[]; centerTop: string; centerSub: string; size?: number; thickness?: number;
}) {
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0) || 1;
  const r = (size - thickness) / 2;
  const C = 2 * Math.PI * r;
  // Precompute arc lengths + cumulative offsets functionally (no mutation during render).
  const lengths = segments.map((seg) => (Math.max(0, seg.value) / total) * C);
  const offsets = lengths.map((_, i) => lengths.slice(0, i).reduce((a, b) => a + b, 0));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="equity and debt split">
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={thickness} />
        {segments.map((seg, i) => (
          <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={seg.color}
            strokeWidth={thickness} strokeDasharray={`${lengths[i]} ${C - lengths[i]}`} strokeDashoffset={-offsets[i]}
            style={{ transition: 'stroke-dasharray 0.9s var(--ease-spring, ease), stroke-dashoffset 0.9s var(--ease-spring, ease)' }} />
        ))}
      </g>
      <text x={size / 2} y={size / 2 - 2} textAnchor="middle" className="tnum font-display" fontSize="26" fontWeight="700" fill="var(--text-primary, #eaf1ff)">{centerTop}</text>
      <text x={size / 2} y={size / 2 + 18} textAnchor="middle" fontSize="11" fill="var(--text-muted, #8ca5d2)" style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}>{centerSub}</text>
    </svg>
  );
}

/** Vertical bar graph (CSS) — purchase vs current value vs equity. */
function MiniBarChart({ bars, height = 148 }: { bars: Segment[]; height?: number }) {
  const max = Math.max(...bars.map((b) => Math.max(0, b.value)), 1);
  return (
    <div className="flex w-full items-end justify-around gap-3" style={{ height }}>
      {bars.map((b, i) => (
        <div key={i} className="flex h-full flex-1 flex-col items-center justify-end">
          <span className="tnum mb-1 text-xs font-semibold text-primary">{moneyShort(b.value)}</span>
          <div className="w-full rounded-t-lg race-bar" style={{ height: `${(Math.max(0, b.value) / max) * 82}%`, minHeight: 4, background: `linear-gradient(180deg, ${b.color}, rgba(255,255,255,0.10))` }} />
          <span className="mt-1.5 text-center text-[11px] font-medium text-muted">{b.label}</span>
        </div>
      ))}
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-secondary">
      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} /> {label}
    </span>
  );
}

/** Growth bar: purchase price -> current value, coloured green/amber/red. */
function GrowthBar({ purchase, current }: { purchase: number | null; current: number }) {
  if (!purchase || purchase <= 0) {
    return <div className="h-2.5 w-full rounded-full bg-white/10" aria-hidden="true" />;
  }
  const ratio = current / purchase;
  const growthPct = (ratio - 1) * 100;
  const color = growthPct >= 10 ? 'bg-emerald-500' : growthPct >= 0 ? 'bg-amber-500' : 'bg-red-500';
  const fill = Math.max(4, Math.min(100, (ratio / 2) * 100));
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/10" role="img" aria-label={`Growth ${growthPct.toFixed(1)} percent`}>
      <div className={`h-full ${color} transition-all`} style={{ width: `${fill}%` }} />
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="glass hover-lift rounded-2xl p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-1 font-display text-3xl font-extrabold tracking-tight text-primary">{value}</p>
      {sub && <p className="mt-0.5 text-sm font-medium text-secondary">{sub}</p>}
    </div>
  );
}

const EQUITY_COLOR = 'var(--accent-emerald, #34d399)';
const DEBT_COLOR = 'var(--accent-crimson, #f87171)';
const PURCHASE_COLOR = 'var(--accent-sapphire, #3d8eff)';
const CURRENT_COLOR = 'var(--accent-teal, #00c4d4)';

export default function PropertyGrowthPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioGrowth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/client/properties/growth');
        setProperties(res.data.properties || []);
        setPortfolio(res.data.portfolio || null);
      } catch {
        setError('Unable to load property growth. Add a property to your profile first.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  }

  return (
    <div className="space-y-7 antialiased">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-[2.6rem] font-extrabold leading-tight tracking-tight text-primary">Property Growth &amp; Progress</h1>
          <p className="mt-1 text-base font-medium text-secondary">Portfolio capital growth, equity and rental yield over time.</p>
        </div>
        <Link href="/dashboard/profile" className="text-sm font-semibold text-brand hover:text-brand-dark">
          Manage properties →
        </Link>
      </div>

      {error && (
        <div className="glass rounded-2xl p-6 text-secondary">{error}</div>
      )}

      {portfolio && portfolio.propertyCount > 0 && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Portfolio value" value={money(portfolio.totalValue)} sub={`${portfolio.propertyCount} properties`} />
            <StatCard label="Total equity" value={money(portfolio.totalEquity)} sub={`Debt ${money(portfolio.totalDebt)}`} />
            <StatCard label="Capital growth" value={money(portfolio.totalCapitalGrowthDollars)} sub={pct(portfolio.totalCapitalGrowthPercent)} />
            <StatCard label="Blended gross yield" value={pct(portfolio.blendedGrossYieldPercent)} />
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {properties.map((p, idx) => {
              const g = p.growth;
              const purchase = g?.purchasePrice ?? p.purchasePrice ?? null;
              const value = p.estimatedValue;
              const debt = p.mortgageBalance ?? 0;
              const equity = Math.max(0, value - debt);
              const equityPct = value > 0 ? Math.round((equity / value) * 100) : 0;
              const barSegments: Segment[] = [
                ...(purchase ? [{ label: 'Purchase', value: purchase, color: PURCHASE_COLOR }] : []),
                { label: 'Current', value, color: CURRENT_COLOR },
                { label: 'Equity', value: equity, color: EQUITY_COLOR },
              ];
              return (
                <div
                  key={p.id}
                  className="glass hover-lift stagger-in rounded-2xl p-6"
                  style={{ animationDelay: `${idx * 80}ms` }}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-display text-xl font-extrabold tracking-tight text-primary">{p.address}</h3>
                      <p className="mt-0.5 text-xs font-medium text-muted">
                        {p.type.replace(/_/g, ' ')}{p.postcode ? ` · ${p.postcode}` : ''}
                        {p.includeInServicing === false && (
                          <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-secondary">Excluded from servicing</span>
                        )}
                      </p>
                    </div>
                    <span className="text-right">
                      <span className="block font-display text-2xl font-extrabold tracking-tight text-primary">{money(value)}</span>
                      <span className="text-xs font-medium text-muted">current value</span>
                    </span>
                  </div>

                  {/* Infographics: equity/debt donut + purchase/value/equity bars */}
                  <div className="mt-5 grid grid-cols-1 gap-4 rounded-xl bg-white/[0.03] p-4 ring-1 ring-white/8 sm:grid-cols-2">
                    <div className="flex flex-col items-center">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">Equity vs debt</p>
                      <DonutChart
                        segments={[{ label: 'Equity', value: equity, color: EQUITY_COLOR }, { label: 'Debt', value: debt, color: DEBT_COLOR }]}
                        centerTop={`${equityPct}%`}
                        centerSub="equity"
                      />
                      <div className="mt-2 flex gap-4">
                        <LegendDot color={EQUITY_COLOR} label={`Equity ${moneyShort(equity)}`} />
                        <LegendDot color={DEBT_COLOR} label={`Debt ${moneyShort(debt)}`} />
                      </div>
                    </div>
                    <div className="flex flex-col">
                      <p className="mb-1 text-center text-xs font-semibold uppercase tracking-wider text-muted">Value breakdown</p>
                      <MiniBarChart bars={barSegments} />
                    </div>
                  </div>

                  <div className="mt-5">
                    <div className="mb-1.5 flex justify-between text-xs font-medium text-muted">
                      <span>Purchase {money(purchase)}</span>
                      <span>Now {money(value)}</span>
                    </div>
                    <GrowthBar purchase={purchase} current={value} />
                    <CagrSparkline
                      purchase={purchase}
                      current={value}
                      cagrPercent={g?.cagrPercent}
                      yearsHeld={g?.yearsHeld}
                      className="mt-3"
                    />
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div>
                      <p className="text-xs font-medium text-muted">Growth</p>
                      <p className="text-base font-bold tracking-tight text-primary">{money(g?.capitalGrowthDollars)}</p>
                      <p className="text-xs font-medium text-muted">{pct(g?.capitalGrowthPercent)}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted">CAGR</p>
                      <p className="text-base font-bold tracking-tight text-primary">{pct(g?.cagrPercent)}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted">Years held</p>
                      <p className="text-base font-bold tracking-tight text-primary">{g?.yearsHeld ? g.yearsHeld.toFixed(1) : '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted">Gross yield</p>
                      <p className="text-base font-bold tracking-tight text-primary">{pct(g?.grossYieldPercent)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {portfolio && portfolio.propertyCount === 0 && !error && (
        <div className="glass rounded-2xl p-6 text-secondary">
          No properties yet. Add a property in your <Link href="/dashboard/profile" className="text-brand">profile</Link> to see growth.
        </div>
      )}

      <p className="text-xs text-muted">Indicative estimate only - not a credit decision.</p>
    </div>
  );
}
