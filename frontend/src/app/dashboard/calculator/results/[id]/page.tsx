'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { Alert } from '@/components/ui/Alert';
import api from '@/lib/api';
import { LoanScenario } from '@/types';
import { computeRepayments } from '@/lib/repayments';

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '--';
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function formatPercent(value: number | null | undefined): string {
  if (value == null) return '--';
  return `${value.toFixed(2)}x`;
}

type FrequencyKey = 'monthly' | 'fortnightly' | 'weekly';

const FREQUENCY_TABS: { key: FrequencyKey; label: string }[] = [
  { key: 'monthly', label: 'Monthly' },
  { key: 'fortnightly', label: 'Fortnightly' },
  { key: 'weekly', label: 'Weekly' },
];

export default function ResultsPage() {
  const params = useParams();
  const id = params.id as string;
  const [scenario, setScenario] = useState<LoanScenario | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [frequency, setFrequency] = useState<FrequencyKey>('monthly');

  useEffect(() => {
    const fetchScenario = async () => {
      try {
        const res = await api.get(`/loan-scenarios/${id}`);
        setScenario(res.data.scenario);
      } catch {
        setError('Failed to load scenario results.');
      } finally {
        setLoading(false);
      }
    };
    fetchScenario();
  }, [id]);

  if (loading) return <Spinner size="lg" className="py-20" />;
  if (error) return <Alert variant="error">{error}</Alert>;
  if (!scenario) return <Alert variant="error">Scenario not found.</Alert>;

  const messages = scenario.messages ? JSON.parse(scenario.messages) : [];
  const passesAll = scenario.passesServiceability && scenario.passesDti;

  // Recompute the CommBank-style repayment breakdown client-side from the saved
  // scenario, at the ACTUAL interest rate (no stress buffer).
  const principal = scenario.maxBorrowingCapacity ?? 0;
  const actualRatePct = (scenario.interestRate * 100).toFixed(2);
  const repayments = computeRepayments(
    principal,
    scenario.interestRate,
    scenario.loanTermYears,
    scenario.repaymentType
  );
  const selectedRepayment = repayments[frequency];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Borrowing Capacity Results</h1>
          <p className="mt-1 text-slate-600">
            {scenario.purpose} | {scenario.repaymentType === 'PI' ? 'Principal & Interest' : 'Interest Only'} | {scenario.loanTermYears} years
          </p>
        </div>
        <Link href="/dashboard/calculator">
          <Button variant="secondary">New Scenario</Button>
        </Link>
      </div>

      {/* Main Result (hero) */}
      <div className="relative overflow-hidden rounded-2xl border border-white/20 bg-gradient-to-br from-brand to-brand-dark p-8 text-center shadow-2xl shadow-brand/30">
        <div className="glass-blob" style={{ top: '-6rem', right: '-4rem', width: '18rem', height: '18rem', background: 'rgba(45, 212, 191, 0.35)' }} />
        <div className="relative">
          <p className="text-sm uppercase tracking-widest font-semibold text-emerald-100">Maximum Borrowing Capacity</p>
          <p className="mt-3 text-5xl sm:text-6xl font-bold text-white drop-shadow-sm">
            {formatCurrency(scenario.maxBorrowingCapacity)}
          </p>
          <div className="mt-5">
            {passesAll ? (
              <Badge variant="success">Passes All Checks</Badge>
            ) : (
              <Badge variant="danger">Capacity Limited</Badge>
            )}
          </div>
        </div>
      </div>

      {/* Estimated Repayments (CommBank-style, at actual rate) */}
      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Estimated Repayments</h3>
            <p className="text-sm text-slate-500">At your {actualRatePct}% rate over {scenario.loanTermYears} years</p>
          </div>
          {/* Frequency toggle — frosted segmented control */}
          <div className="inline-flex rounded-xl border border-white/60 bg-white/40 p-1 backdrop-blur-md shadow-sm">
            {FREQUENCY_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFrequency(tab.key)}
                className={[
                  'rounded-lg px-4 py-1.5 text-sm font-medium transition',
                  frequency === tab.key
                    ? 'bg-gradient-to-br from-brand to-brand-dark text-white shadow-md'
                    : 'text-slate-600 hover:text-slate-900',
                ].join(' ')}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 flex items-baseline gap-2">
          <span className="text-4xl font-bold text-brand">{formatCurrency(selectedRepayment)}</span>
          <span className="text-sm text-slate-500">/ {frequency}</span>
        </div>

        <dl className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-white/50 bg-white/40 p-4">
            <dt className="text-xs uppercase tracking-wide text-slate-500">Monthly</dt>
            <dd className="mt-1 text-lg font-semibold text-slate-900">{formatCurrency(repayments.monthly)}</dd>
          </div>
          <div className="rounded-xl border border-white/50 bg-white/40 p-4">
            <dt className="text-xs uppercase tracking-wide text-slate-500">Total Interest</dt>
            <dd className="mt-1 text-lg font-semibold text-slate-900">{formatCurrency(repayments.totalInterest)}</dd>
          </div>
          <div className="rounded-xl border border-white/50 bg-white/40 p-4">
            <dt className="text-xs uppercase tracking-wide text-slate-500">Total Cost</dt>
            <dd className="mt-1 text-lg font-semibold text-slate-900">{formatCurrency(repayments.totalRepayments)}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-slate-400">
          Estimate only. {scenario.repaymentType === 'PI' ? 'Principal & Interest' : 'Interest Only'} at the actual rate;
          total cost includes principal plus interest over the full term.
        </p>
      </Card>

      {/* Breakdown */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card title="Income vs Expenses">
          <dl className="space-y-3">
            <div className="flex justify-between">
              <dt className="text-sm text-gray-600">Total Monthly Income</dt>
              <dd className="text-sm font-semibold text-green-700">{formatCurrency(scenario.totalMonthlyIncome)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-gray-600">Total Monthly Expenses</dt>
              <dd className="text-sm font-semibold text-red-700">{formatCurrency(scenario.totalMonthlyExpenses)}</dd>
            </div>
            <div className="border-t pt-3 flex justify-between">
              <dt className="text-sm font-medium text-gray-900">Net Monthly Surplus</dt>
              <dd className="text-sm font-bold text-gray-900">{formatCurrency(scenario.netMonthlySurplus)}</dd>
            </div>
          </dl>
        </Card>

        <Card title="Capacity Limits">
          <dl className="space-y-3">
            <div className="flex justify-between">
              <dt className="text-sm text-gray-600">Serviceability Max</dt>
              <dd className="text-sm font-semibold">{formatCurrency(scenario.serviceabilityMax)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-gray-600">DTI Max</dt>
              <dd className="text-sm font-semibold">{formatCurrency(scenario.dtiMax)}</dd>
            </div>
            <div className="border-t pt-3 flex justify-between">
              <dt className="text-sm font-medium text-gray-900">Final (lower of the two)</dt>
              <dd className="text-sm font-bold text-brand">{formatCurrency(scenario.maxBorrowingCapacity)}</dd>
            </div>
          </dl>
        </Card>
      </div>

      {/* DTI Ratio */}
      <Card title="Debt-to-Income Ratio">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="w-full bg-slate-200/70 rounded-full h-4 overflow-hidden">
              <div
                className={`h-4 rounded-full transition-all ${(scenario.dtiRatio ?? 0) <= 6 ? 'bg-gradient-to-r from-emerald-400 to-emerald-600' : 'bg-gradient-to-r from-red-400 to-red-600'}`}
                style={{ width: `${Math.min(((scenario.dtiRatio ?? 0) / 8) * 100, 100)}%` }}
              />
            </div>
            <div className="flex justify-between mt-1 text-xs text-slate-500">
              <span>0x</span>
              <span>6x (cap)</span>
              <span>8x</span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-gray-900">{formatPercent(scenario.dtiRatio)}</p>
            <p className="text-xs text-gray-500">DTI Ratio</p>
          </div>
        </div>
        <div className="mt-3">
          {scenario.passesDti ? (
            <Badge variant="success">Passes DTI Check</Badge>
          ) : (
            <Badge variant="danger">Exceeds DTI Cap</Badge>
          )}
        </div>
      </Card>

      {/* Serviceability assessment repayment (stress rate) */}
      <Card title="Serviceability Assessment (Stress Rate)">
        <p className="text-3xl font-bold text-gray-900">{formatCurrency(scenario.monthlyRepayment)}<span className="text-base font-normal text-gray-500"> / month</span></p>
        <p className="text-sm text-gray-600 mt-1">
          This is the assessment figure used to test serviceability, based on a {((scenario.interestRate * 100) + 3).toFixed(1)}% stress rate
          ({(scenario.interestRate * 100).toFixed(1)}% + 3% buffer). Your estimated repayments above use your actual {actualRatePct}% rate.
        </p>
      </Card>

      {/* Messages */}
      {messages.length > 0 && (
        <Card title="Assessment Messages">
          <ul className="space-y-2">
            {messages.map((msg: string, idx: number) => (
              <li key={idx} className="flex items-start gap-2 text-sm text-gray-700">
                <span className="text-brand mt-0.5">&#8226;</span>
                {msg}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="flex gap-4">
        <Link href="/dashboard/calculator" className="flex-1">
          <Button variant="secondary" className="w-full">Run Another Scenario</Button>
        </Link>
        <Link href="/dashboard" className="flex-1">
          <Button variant="ghost" className="w-full">Back to Dashboard</Button>
        </Link>
      </div>
    </div>
  );
}
