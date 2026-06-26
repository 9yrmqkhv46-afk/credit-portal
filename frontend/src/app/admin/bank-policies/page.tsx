'use client';

import React, { useState } from 'react';
import api from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { BankPolicyLibrary } from '@/components/admin/BankPolicyLibrary';
import { BankScenarioRunner } from '@/components/admin/BankScenarioRunner';
import { BankPolicyDocx } from '@/components/admin/BankPolicyDocx';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export default function BankPoliciesPage() {
  const [tab, setTab] = useState<'library' | 'word' | 'scenario'>('library');
  const [downloading, setDownloading] = useState(false);
  const { toast } = useToast();

  const downloadWord = async () => {
    setDownloading(true);
    try {
      const res = await api.get('/bank-policies/docx', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: DOCX_MIME }));
      const a = document.createElement('a');
      a.href = url;
      a.download = '2026-bank-lending-policy-library.docx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      toast('Could not download the policy document', { accent: 'crimson' });
    } finally {
      setDownloading(false);
    }
  };

  const tabBtn = (id: typeof tab, label: string) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={`rounded-full px-4 py-1.5 text-sm font-medium ring-1 transition ${tab === id ? 'bg-brand/20 text-brand ring-brand/50' : 'text-secondary ring-white/15 hover:bg-white/10'}`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-5">
      <div className="animate-enter flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-primary">2026 Bank Policy Library</h1>
          <p className="mt-1 text-secondary">Maintain each lender&rsquo;s serviceability policy and find the best bank for a client scenario.</p>
          <p className="mt-1 text-xs text-muted">Modelled estimates for indicative comparison only — not official lender policy or a credit decision.</p>
        </div>
        <button type="button" onClick={downloadWord} disabled={downloading} className="shrink-0 rounded-xl px-4 py-2 text-sm font-semibold text-secondary ring-1 ring-white/15 hover:bg-white/10 disabled:opacity-50">
          {downloading ? 'Generating…' : 'Download Word doc (.docx)'}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabBtn('library', 'Policy Library')}
        {tabBtn('word', 'Edit in Word')}
        {tabBtn('scenario', 'Which Bank? (Scenario)')}
      </div>

      {tab === 'library' && <BankPolicyLibrary />}
      {tab === 'word' && <BankPolicyDocx />}
      {tab === 'scenario' && <BankScenarioRunner />}
    </div>
  );
}
