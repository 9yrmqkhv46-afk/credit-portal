'use client';

import React, { useState } from 'react';
import { BankPolicyLibrary } from '@/components/admin/BankPolicyLibrary';
import { BankScenarioRunner } from '@/components/admin/BankScenarioRunner';

export default function BankPoliciesPage() {
  const [tab, setTab] = useState<'library' | 'scenario'>('library');

  return (
    <div className="space-y-5">
      <div className="animate-enter">
        <h1 className="font-display text-2xl font-bold text-primary">2026 Bank Policy Library</h1>
        <p className="mt-1 text-secondary">Maintain each lender&rsquo;s serviceability policy and find the best bank for a client scenario.</p>
        <p className="mt-1 text-xs text-muted">Modelled estimates for indicative comparison only — not official lender policy or a credit decision.</p>
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={() => setTab('library')} className={`rounded-full px-4 py-1.5 text-sm font-medium ring-1 transition ${tab === 'library' ? 'bg-brand/20 text-brand ring-brand/50' : 'text-secondary ring-white/15 hover:bg-white/10'}`}>Policy Library</button>
        <button type="button" onClick={() => setTab('scenario')} className={`rounded-full px-4 py-1.5 text-sm font-medium ring-1 transition ${tab === 'scenario' ? 'bg-brand/20 text-brand ring-brand/50' : 'text-secondary ring-white/15 hover:bg-white/10'}`}>Which Bank? (Scenario)</button>
      </div>

      {tab === 'library' ? <BankPolicyLibrary /> : <BankScenarioRunner />}
    </div>
  );
}
