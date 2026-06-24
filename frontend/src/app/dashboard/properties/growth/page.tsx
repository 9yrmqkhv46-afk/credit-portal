'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { Property, PortfolioGrowth } from '@/types';
import { Spinner } from '@/components/ui/Spinner';

function money(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });
}
function pct(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `${n.toFixed(1)}%`;
}

/** Growth bar: purchase price -> current value, coloured green/amber/red. */
function GrowthBar({ purchase, current }: { purchase: number | null; current: number }) {
  if (!purchase || purchase <= 0) {
    return <div className="h-2 w-full rounded-full bg-white/10" aria-hidden="true" />;
  }
  const ratio = current / purchase;
  const growthPct = (ratio - 1) * 100;
  const color = growthPct >= 10 ? 'bg-emerald-500' : growthPct >= 0 ? 'bg-amber-500' : 'bg-red-500';
  // Fill proportional to growth, capped 0..100 for display.
  const fill = Math.max(4, Math.min(100, (ratio / 2) * 100));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-white/10" role="img" aria-label={`Growth ${growthPct.toFixed(1)} percent`}>
      <div className={`h-full ${color} transition-all`} style={{ width: `${fill}%` }} />
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="glass rounded-2xl p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold text-primary">{value}</p>
      {sub && <p className="mt-0.5 text-sm text-secondary">{sub}</p>}
    </div>
  );
}

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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary">Property Growth &amp; Progress</h1>
          <p className="text-sm text-secondary">Portfolio capital growth, equity and rental yield over time.</p>
        </div>
        <Link href="/dashboard/profile" className="text-sm font-medium text-brand hover:text-brand-dark">
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

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {properties.map((p) => {
              const g = p.growth;
              return (
                <div key={p.id} className="glass rounded-2xl p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-primary">{p.address}</h3>
                      <p className="text-xs text-muted">
                        {p.type.replace(/_/g, ' ')}{p.postcode ? ` · ${p.postcode}` : ''}
                        {p.includeInServicing === false && (
                          <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-secondary">Excluded from servicing</span>
                        )}
                      </p>
                    </div>
                    <span className="text-right">
                      <span className="block text-lg font-bold text-primary">{money(p.estimatedValue)}</span>
                      <span className="text-xs text-muted">current value</span>
                    </span>
                  </div>

                  <div className="mt-4">
                    <div className="mb-1 flex justify-between text-xs text-muted">
                      <span>Purchase {money(g?.purchasePrice ?? p.purchasePrice ?? null)}</span>
                      <span>Now {money(p.estimatedValue)}</span>
                    </div>
                    <GrowthBar purchase={g?.purchasePrice ?? p.purchasePrice ?? null} current={p.estimatedValue} />
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <div>
                      <p className="text-xs text-muted">Growth</p>
                      <p className="font-semibold text-primary">{money(g?.capitalGrowthDollars)}</p>
                      <p className="text-xs text-muted">{pct(g?.capitalGrowthPercent)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted">CAGR</p>
                      <p className="font-semibold text-primary">{pct(g?.cagrPercent)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted">Years held</p>
                      <p className="font-semibold text-primary">{g?.yearsHeld ? g.yearsHeld.toFixed(1) : '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted">Gross yield</p>
                      <p className="font-semibold text-primary">{pct(g?.grossYieldPercent)}</p>
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
