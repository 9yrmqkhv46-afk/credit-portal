'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Alert } from '@/components/ui/Alert';
import api from '@/lib/api';
import { LoanPurpose, RepaymentType } from '@/types';
import { AxiosError } from 'axios';

const PURPOSE_OPTIONS = [
  { value: 'PURCHASE', label: 'Owner Occupied Purchase' },
  { value: 'INVESTMENT', label: 'Investment Property' },
  { value: 'REFINANCE', label: 'Refinance' },
  { value: 'CONSTRUCTION', label: 'Construction' },
  { value: 'EQUITY_RELEASE', label: 'Equity Release' },
];

const REPAYMENT_OPTIONS = [
  { value: 'PI', label: 'Principal & Interest' },
  { value: 'IO', label: 'Interest Only' },
];

export default function CalculatorPage() {
  const router = useRouter();
  const [purpose, setPurpose] = useState<LoanPurpose>('PURCHASE');
  const [repaymentType, setRepaymentType] = useState<RepaymentType>('PI');
  const [loanTermYears, setLoanTermYears] = useState(30);
  const [interestRate, setInterestRate] = useState(6.5);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const payload = {
        purpose,
        repaymentType,
        loanTermYears: Number(loanTermYears),
        interestRate: Number(interestRate) / 100, // Convert percentage to decimal
      };
      const res = await api.post('/loan-scenarios', payload);
      const scenarioId = res.data.scenario.id;
      router.push(`/dashboard/calculator/results/${scenarioId}`);
    } catch (err) {
      const axiosError = err as AxiosError<{ error?: string }>;
      setError(axiosError.response?.data?.error || 'Failed to calculate. Make sure your profile is complete.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Borrowing Calculator</h1>
        <p className="mt-1 text-gray-600">Configure your loan scenario and calculate your maximum borrowing capacity.</p>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      <Card>
        <form onSubmit={handleSubmit} className="space-y-6">
          <Select
            label="Loan Purpose"
            options={PURPOSE_OPTIONS}
            value={purpose}
            onChange={(e) => setPurpose(e.target.value as LoanPurpose)}
          />

          <Select
            label="Repayment Type"
            options={REPAYMENT_OPTIONS}
            value={repaymentType}
            onChange={(e) => setRepaymentType(e.target.value as RepaymentType)}
          />

          <Input
            label="Loan Term (years)"
            type="number"
            min="1"
            max="40"
            value={String(loanTermYears)}
            onChange={(e) => setLoanTermYears(parseInt(e.target.value) || 30)}
          />

          <Input
            label="Assumed Interest Rate (%)"
            type="number"
            min="0"
            max="20"
            step="0.1"
            value={String(interestRate)}
            onChange={(e) => setInterestRate(parseFloat(e.target.value) || 0)}
          />

          <div className="bg-brand-light rounded-lg p-4 text-sm text-brand">
            <p className="font-semibold">How this works</p>
            <p className="mt-1">
              The calculator uses your complete financial profile (income, debts, expenses, dependants) to determine your maximum borrowing capacity. A stress rate buffer of 3% will be applied above your assumed interest rate.
            </p>
          </div>

          <Button type="submit" loading={loading} size="lg" className="w-full">
            Calculate Borrowing Capacity
          </Button>
        </form>
      </Card>
    </div>
  );
}
