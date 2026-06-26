'use client';

import React, { useEffect, useRef, useState } from 'react';
import api from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface BankRow { brandCode: string; bankName: string }
interface ImportResult { applied: number; warnings: string[]; activated: boolean; policyVersion: string }

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * Treats an editable Microsoft Word (.docx) document as the source of truth for
 * each bank's lending policy: download the doc, edit the "Policy Parameters"
 * block, and upload it back to create a new active policy version that drives
 * the engine — no JSON editing required.
 */
export function BankPolicyDocx() {
  const { toast } = useToast();
  const [banks, setBanks] = useState<BankRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, ImportResult>>({});
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    api.get('/bank-policies').then((res) => {
      const seen = new Set<string>();
      const rows: BankRow[] = [];
      for (const v of res.data.versions || []) {
        if (v.isActive && !seen.has(v.brandCode)) { seen.add(v.brandCode); rows.push({ brandCode: v.brandCode, bankName: v.bankName }); }
      }
      setBanks(rows.sort((a, b) => a.bankName.localeCompare(b.bankName)));
    }).catch(() => toast('Could not load banks', { accent: 'crimson' }));
  }, [toast]);

  const triggerDownload = (data: BlobPart, filename: string) => {
    const url = window.URL.createObjectURL(new Blob([data], { type: DOCX_MIME }));
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    window.URL.revokeObjectURL(url);
  };

  const downloadBank = async (brandCode: string) => {
    setBusy(`dl-${brandCode}`);
    try {
      const res = await api.get(`/bank-policies/${brandCode}/docx`, { responseType: 'blob' });
      triggerDownload(res.data, `${brandCode}-2026-lending-policy.docx`);
    } catch {
      toast('Could not download the document', { accent: 'crimson' });
    } finally { setBusy(null); }
  };

  const downloadAll = async () => {
    setBusy('dl-all');
    try {
      const res = await api.get('/bank-policies/docx', { responseType: 'blob' });
      triggerDownload(res.data, '2026-bank-lending-policy-library.docx');
    } catch {
      toast('Could not download the library', { accent: 'crimson' });
    } finally { setBusy(null); }
  };

  const uploadBank = async (brandCode: string, file: File) => {
    setBusy(`up-${brandCode}`);
    try {
      const dataBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const res = await api.post(`/bank-policies/${brandCode}/docx`, { dataBase64, activate: true });
      const r = res.data;
      setResults((prev) => ({ ...prev, [brandCode]: { applied: r.applied, warnings: r.warnings || [], activated: r.activated, policyVersion: r.policy?.policyVersion } }));
      toast(`${brandCode}: applied ${r.applied} parameters${r.activated ? ' (activated)' : ''}`, { accent: 'emerald' });
    } catch (e: any) {
      toast(e?.response?.data?.error || 'Import failed', { accent: 'crimson' });
    } finally { setBusy(null); }
  };

  return (
    <Card title="Edit policies in Word (.docx)">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-secondary">
          The Word document is the editable source of truth. Download a bank&rsquo;s <code className="rounded bg-white/10 px-1">.docx</code>,
          edit the values in the <strong>Policy Parameters</strong> block (keep the BEGIN/END markers and the keys on the left of <code className="rounded bg-white/10 px-1">=</code>),
          then upload it back. The engine immediately uses the new values as a fresh, audited policy version.
        </p>
        <button type="button" onClick={downloadAll} disabled={busy === 'dl-all'} className="shrink-0 rounded-xl bg-gradient-to-br from-brand to-brand-dark px-4 py-2 text-sm font-semibold text-on-accent shadow-lg shadow-brand/30 hover:brightness-110 disabled:opacity-50">
          {busy === 'dl-all' ? 'Generating…' : 'Download full library (.docx)'}
        </button>
      </div>

      <div className="mt-4 divide-y divide-white/8">
        {banks.map((b) => {
          const r = results[b.brandCode];
          return (
            <div key={b.brandCode} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <span className="font-semibold text-primary">{b.bankName}</span>
                <span className="ml-2 text-xs text-muted">{b.brandCode}</span>
                {r && (
                  <span className="ml-2 text-xs text-emerald">
                    ✓ {r.applied} params applied{r.activated ? ' · active' : ''}{r.policyVersion ? ` · ${r.policyVersion}` : ''}
                  </span>
                )}
                {r?.warnings?.length > 0 && (
                  <ul className="ml-4 mt-1 list-disc text-xs text-gold">
                    {r.warnings.slice(0, 5).map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => downloadBank(b.brandCode)} disabled={busy === `dl-${b.brandCode}`} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-secondary ring-1 ring-white/15 hover:bg-white/10 disabled:opacity-50">
                  {busy === `dl-${b.brandCode}` ? '…' : 'Download .docx'}
                </button>
                <input
                  ref={(el) => { fileInputs.current[b.brandCode] = el; }}
                  type="file"
                  accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadBank(b.brandCode, f); e.target.value = ''; }}
                />
                <button type="button" onClick={() => fileInputs.current[b.brandCode]?.click()} disabled={busy === `up-${b.brandCode}`} className="rounded-lg bg-brand/15 px-3 py-1.5 text-xs font-semibold text-brand ring-1 ring-brand/40 hover:bg-brand/25 disabled:opacity-50">
                  {busy === `up-${b.brandCode}` ? 'Importing…' : 'Upload edited .docx'}
                </button>
              </div>
            </div>
          );
        })}
        {banks.length === 0 && <p className="py-4 text-sm text-muted">Loading banks…</p>}
      </div>
    </Card>
  );
}

export default BankPolicyDocx;
