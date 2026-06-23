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

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '--';
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function formatPercent(value: number | null | undefined): string {
  if (value == null) return '--';
  return `${value.toFixed(2)}x`;
}

export default function ResultsPage() {
  const params = useParams();
  const id = params.id as string;
  const [scenario, setScenario] = useState<LoanScenario | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Borrowing Capacity Results</h1>
          <p className="mt-1 text-gray-600">
            {scenario.purpose} | {scenario.repaymentType === 'PI' ? 'Principal & Interest' : 'Interest Only'} | {scenario.loanTermYears} years
          </p>
        </div>
        <Link href="/dashboard/calculator">
          <Button variant="secondary">New Scenario</Button>
        </Link>
      </div>

      {/* Main Result */}
      <Card className="text-center">
        <p className="text-sm text-gray-600 uppercase tracking-wide font-medium">Maximum Borrowing Capacity</p>
        <p className="text-4xl font-bold text-blue-600 mt-2">
          {formatCurrency(scenario.maxBorrowingCapacity)}
        </p>
        <div className="mt-4">
          {passesAll ? (
            <Badge variant="success">Passes All Checks</Badge>
          ) : (
            <Badge variant="danger">Capacity Limited</Badge>
          )}
        </div>
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
              <dd className="text-sm font-bold text-blue-600">{formatCurrency(scenario.maxBorrowingCapacity)}</dd>
            </div>
          </dl>
        </Card>
      </div>

      {/* DTI Ratio */}
      <Card title="Debt-to-Income Ratio">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="w-full bg-gray-200 rounded-full h-4">
              <div
                className={`h-4 rounded-full ${(scenario.dtiRatio ?? 0) <= 6 ? 'bg-green-500' : 'bg-red-500'}`}
                style={{ width: `${Math.min(((scenario.dtiRatio ?? 0) / 8) * 100, 100)}%` }}
              />
            </div>
            <div className="flex justify-between mt-1 text-xs text-gray-500">
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

      {/* Monthly Repayment */}
      <Card title="Monthly Repayment at Stress Rate">
        <p className="text-3xl font-bold text-gray-900">{formatCurrency(scenario.monthlyRepayment)}</p>
        <p className="text-sm text-gray-600 mt-1">
          Based on {((scenario.interestRate * 100) + 3).toFixed(1)}% stress rate ({(scenario.interestRate * 100).toFixed(1)}% + 3% buffer)
        </p>
      </Card>

      {/* Messages */}
      {messages.length > 0 && (
        <Card title="Assessment Messages">
          <ul className="space-y-2">
            {messages.map((msg: string, idx: number) => (
              <li key={idx} className="flex items-start gap-2 text-sm text-gray-700">
                <span className="text-blue-500 mt-0.5">&#8226;</span>
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
