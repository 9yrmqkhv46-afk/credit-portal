'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { IncomeEntriesSection } from '@/components/income/IncomeEntriesSection';
import { PropertyPortfolioTable } from '@/components/properties/PropertyPortfolioTable';
import { OtherLiabilitiesTable } from '@/components/liabilities/OtherLiabilitiesTable';
import { ExistingHomeLoansTable } from '@/components/loans/ExistingHomeLoansTable';
import { ProposedHomeLoansTable } from '@/components/loans/ProposedHomeLoansTable';
import { LivingExpensesForm } from '@/components/expenses/LivingExpensesForm';

const TABS = [
  { key: 'income', label: 'Income' },
  { key: 'properties', label: 'Property portfolio' },
  { key: 'liabilities', label: 'Other liabilities' },
  { key: 'existing', label: 'Existing home loans' },
  { key: 'proposed', label: 'Proposed home loans' },
  { key: 'expenses', label: 'Living expenses' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

const HELP: Record<TabKey, string> = {
  income: 'Add each income stream per applicant. Variable income is shaded; deductions reduce assessable income.',
  properties: 'Manage your property portfolio. Toggle "Include in servicing" then recalculate borrowing capacity.',
  liabilities: 'Credit cards, car/personal loans and other liabilities. Credit cards use an assumed repayment when none is set.',
  existing: 'Existing home loans contribute monthly commitments when included in servicing.',
  proposed: 'Proposed home loans — the first included loan is assessed by the calculator.',
  expenses: 'Declared living expenses (a HEM-style floor still applies) plus additional categories and notional rent.',
};

export default function FinancialsPage() {
  const [tab, setTab] = useState<TabKey>('income');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Servicing &amp; Financials</h1>
          <p className="mt-1 text-slate-600">Detailed income, property portfolio, liabilities and loans used in serviceability.</p>
        </div>
        <Link href="/dashboard/profile" className="text-sm font-medium text-brand hover:text-brand-dark">
          Back to profile →
        </Link>
      </div>

      <Card className="py-3">
        <nav className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={[
                'rounded-xl px-3 py-1.5 text-sm font-medium transition',
                tab === t.key ? 'bg-brand text-white shadow-sm' : 'text-slate-600 hover:bg-white/60',
              ].join(' ')}>
              {t.label}
            </button>
          ))}
        </nav>
      </Card>

      <Card>
        <p className="mb-4 text-sm text-slate-500">{HELP[tab]}</p>
        {tab === 'income' && <IncomeEntriesSection />}
        {tab === 'properties' && <PropertyPortfolioTable />}
        {tab === 'liabilities' && <OtherLiabilitiesTable />}
        {tab === 'existing' && <ExistingHomeLoansTable />}
        {tab === 'proposed' && <ProposedHomeLoansTable />}
        {tab === 'expenses' && <LivingExpensesForm />}
      </Card>

      <p className="text-xs text-slate-500">Indicative estimate only - not a credit decision.</p>
    </div>
  );
}
