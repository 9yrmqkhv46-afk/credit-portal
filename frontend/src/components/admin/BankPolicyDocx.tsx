'use client';

import React, { useEffect, useRef, useState } from 'react';
import api from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface BankRow { brandCode: string; bankName: string }

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const money = (n: number) => `$${Math.round(n || 0).toLocaleString()}`;
const signed = (n: number) => `${n >= 0 ? '+' : ''}${money(n)}`;

/**
 * The editable Word (.docx) document is the source of truth for each bank's
 * lending policy. This panel lets an admin:
 *  - download a bank's .docx, edit the Policy Parameters, and re-upload it;
 *  - PREVIEW guardrail validation + borrowing-power impact BEFORE activating;
 *  - inspect the parameter-level change history (timeline);
 *  - verify tamper-evident integrity; and
 *  - back up / restore the whole library + export the compliance audit log.
 */
export function BankPolicyDocx() {
  const { toast } = useToast();
  const [banks, setBanks] = useState<BankRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const restoreInput = useRef<HTMLInputElement | null>(null);

  // Pending preview keyed by brand (holds the dry-run result + the file payload).
  const [preview, setPreview] = useState<Record<string, any>>({});
  const [timeline, setTimeline] = useState<Record<string, any[] | null>>({});
  const [integrity, setIntegrity] = useState<Record<string, boolean>>({});

  const loadBanks = () => {
    api.get('/bank-policies').then((res) => {
      const seen = new Set<string>();
      const rows: BankRow[] = [];
      for (const v of res.data.versions || []) {
        if (v.isActive && !seen.has(v.brandCode)) { seen.add(v.brandCode); rows.push({ brandCode: v.brandCode, bankName: v.bankName }); }
      }
      setBanks(rows.sort((a, b) => a.bankName.localeCompare(b.bankName)));
    }).catch(() => toast('Could not load banks', { accent: 'crimson' }));
  };
  useEffect(loadBanks, [toast]);

  // Integrity sweep across active policies.
  useEffect(() => {
    api.get('/bank-policies/integrity').then((res) => {
      const map: Record<string, boolean> = {};
      for (const r of res.data.results || []) map[r.brandCode] = r.ok;
      setIntegrity(map);
    }).catch(() => {});
  }, []);

  const triggerDownload = (data: BlobPart, filename: string, type: string) => {
    const url = window.URL.createObjectURL(new Blob([data], { type }));
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    window.URL.revokeObjectURL(url);
  };

  const downloadBank = async (brandCode: string) => {
    setBusy(`dl-${brandCode}`);
    try {
      const res = await api.get(`/bank-policies/${brandCode}/docx`, { responseType: 'blob' });
      triggerDownload(res.data, `${brandCode}-2026-lending-policy.docx`, DOCX_MIME);
    } catch { toast('Could not download the document', { accent: 'crimson' }); }
    finally { setBusy(null); }
  };

  const readBase64 = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

  // Step 1: dry-run preview (validation + impact), nothing saved.
  const previewUpload = async (brandCode: string, file: File) => {
    setBusy(`up-${brandCode}`);
    try {
      const dataBase64 = await readBase64(file);
      const res = await api.post(`/bank-policies/${brandCode}/docx`, { dataBase64, preview: true });
      setPreview((p) => ({ ...p, [brandCode]: { ...res.data, dataBase64 } }));
    } catch (e: any) {
      toast(e?.response?.data?.error || 'Preview failed', { accent: 'crimson' });
    } finally { setBusy(null); }
  };

  // Step 2: commit the previously-previewed document.
  const confirmUpload = async (brandCode: string) => {
    const pv = preview[brandCode];
    if (!pv) return;
    setBusy(`commit-${brandCode}`);
    try {
      const force = pv.validation && !pv.validation.valid;
      const res = await api.post(`/bank-policies/${brandCode}/docx`, { dataBase64: pv.dataBase64, activate: true, force });
      toast(`${brandCode}: applied ${res.data.applied} params${res.data.activated ? ' (active)' : ''}`, { accent: 'emerald' });
      setPreview((p) => ({ ...p, [brandCode]: undefined }));
      setTimeline((t) => ({ ...t, [brandCode]: null })); // force reload if open
      loadBanks();
    } catch (e: any) {
      toast(e?.response?.data?.error || 'Import failed', { accent: 'crimson' });
    } finally { setBusy(null); }
  };

  const toggleTimeline = async (brandCode: string) => {
    if (timeline[brandCode]) { setTimeline((t) => ({ ...t, [brandCode]: null })); return; }
    setBusy(`tl-${brandCode}`);
    try {
      const res = await api.get(`/bank-policies/${brandCode}/timeline`);
      setTimeline((t) => ({ ...t, [brandCode]: res.data.timeline || [] }));
    } catch { toast('Could not load history', { accent: 'crimson' }); }
    finally { setBusy(null); }
  };

  const rollback = async (brandCode: string, versionId: string) => {
    setBusy(`rb-${brandCode}`);
    try {
      await api.post(`/bank-policies/${brandCode}/rollback/${versionId}`);
      toast(`${brandCode}: rolled back`, { accent: 'emerald' });
      setTimeline((t) => ({ ...t, [brandCode]: null }));
      loadBanks();
    } catch (e: any) { toast(e?.response?.data?.error || 'Rollback failed', { accent: 'crimson' }); }
    finally { setBusy(null); }
  };

  const downloadLibrary = async () => {
    setBusy('dl-all');
    try { const res = await api.get('/bank-policies/docx', { responseType: 'blob' }); triggerDownload(res.data, '2026-bank-lending-policy-library.docx', DOCX_MIME); }
    catch { toast('Could not download the library', { accent: 'crimson' }); }
    finally { setBusy(null); }
  };
  const exportJson = async () => {
    setBusy('export');
    try { const res = await api.get('/bank-policies/export', { responseType: 'blob' }); triggerDownload(res.data, 'bank-policy-library-backup.json', 'application/json'); }
    catch { toast('Could not export the library', { accent: 'crimson' }); }
    finally { setBusy(null); }
  };
  const exportAuditCsv = async () => {
    setBusy('audit');
    try { const res = await api.get('/bank-policies/audit.csv', { responseType: 'blob' }); triggerDownload(res.data, 'bank-policy-audit.csv', 'text/csv'); }
    catch { toast('Could not export the audit log', { accent: 'crimson' }); }
    finally { setBusy(null); }
  };
  const restoreJson = async (file: File) => {
    setBusy('restore');
    try {
      const snapshot = JSON.parse(await file.text());
      const res = await api.post('/bank-policies/import', { snapshot });
      toast(`Restored ${res.data.restored} policies`, { accent: 'emerald' });
      loadBanks();
    } catch (e: any) { toast(e?.response?.data?.error || 'Restore failed', { accent: 'crimson' }); }
    finally { setBusy(null); }
  };

  return (
    <Card title="Edit policies in Word (.docx)">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-secondary">
          The Word document is the editable source of truth. Download a bank&rsquo;s <code className="rounded bg-white/10 px-1">.docx</code>, edit the
          <strong> Policy Parameters</strong> block, then upload it — you&rsquo;ll see a validation &amp; impact preview before anything goes live.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={downloadLibrary} disabled={busy === 'dl-all'} className="rounded-xl bg-gradient-to-br from-brand to-brand-dark px-3 py-2 text-xs font-semibold text-on-accent shadow-lg shadow-brand/30 hover:brightness-110 disabled:opacity-50">Full library (.docx)</button>
          <button type="button" onClick={exportJson} disabled={busy === 'export'} className="rounded-xl px-3 py-2 text-xs font-semibold text-secondary ring-1 ring-white/15 hover:bg-white/10 disabled:opacity-50">Backup (.json)</button>
          <button type="button" onClick={() => restoreInput.current?.click()} disabled={busy === 'restore'} className="rounded-xl px-3 py-2 text-xs font-semibold text-secondary ring-1 ring-white/15 hover:bg-white/10 disabled:opacity-50">{busy === 'restore' ? 'Restoring…' : 'Restore'}</button>
          <button type="button" onClick={exportAuditCsv} disabled={busy === 'audit'} className="rounded-xl px-3 py-2 text-xs font-semibold text-secondary ring-1 ring-white/15 hover:bg-white/10 disabled:opacity-50">Audit (.csv)</button>
          <input ref={restoreInput} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) restoreJson(f); e.target.value = ''; }} />
        </div>
      </div>

      <div className="mt-4 divide-y divide-white/8">
        {banks.map((b) => {
          const pv = preview[b.brandCode];
          const tl = timeline[b.brandCode];
          const intact = integrity[b.brandCode];
          return (
            <div key={b.brandCode} className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-primary">{b.bankName}</span>
                  <span className="text-xs text-muted">{b.brandCode}</span>
                  {intact === true && <span title="Integrity verified (SHA-256)" className="rounded-full bg-success-light px-2 py-0.5 text-[11px] font-semibold text-emerald ring-1 ring-emerald/40">✓ verified</span>}
                  {intact === false && <span title="Integrity check FAILED — possible tampering" className="rounded-full bg-crimson/15 px-2 py-0.5 text-[11px] font-semibold text-crimson ring-1 ring-crimson/40">⚠ integrity</span>}
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => toggleTimeline(b.brandCode)} disabled={busy === `tl-${b.brandCode}`} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-secondary ring-1 ring-white/15 hover:bg-white/10 disabled:opacity-50">{tl ? 'Hide history' : 'History'}</button>
                  <button type="button" onClick={() => downloadBank(b.brandCode)} disabled={busy === `dl-${b.brandCode}`} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-secondary ring-1 ring-white/15 hover:bg-white/10 disabled:opacity-50">Download .docx</button>
                  <input ref={(el) => { fileInputs.current[b.brandCode] = el; }} type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) previewUpload(b.brandCode, f); e.target.value = ''; }} />
                  <button type="button" onClick={() => fileInputs.current[b.brandCode]?.click()} disabled={busy === `up-${b.brandCode}`} className="rounded-lg bg-brand/15 px-3 py-1.5 text-xs font-semibold text-brand ring-1 ring-brand/40 hover:bg-brand/25 disabled:opacity-50">{busy === `up-${b.brandCode}` ? 'Analysing…' : 'Upload edited .docx'}</button>
                </div>
              </div>

              {/* Preview: validation + impact before committing */}
              {pv && (
                <div className="mt-3 rounded-xl border border-brand/30 bg-brand/5 p-3">
                  <p className="text-sm font-semibold text-primary">Review changes before activating — {pv.applied} parameters edited</p>

                  {pv.validation?.issues?.length > 0 && (
                    <ul className="mt-2 space-y-1 text-xs">
                      {pv.validation.issues.map((i: any, k: number) => (
                        <li key={k} className={i.level === 'error' ? 'text-crimson' : 'text-gold'}>
                          {i.level === 'error' ? '✕' : '⚠'} {i.message}
                        </li>
                      ))}
                    </ul>
                  )}
                  {pv.validation?.valid && (!pv.validation.issues || pv.validation.issues.length === 0) && (
                    <p className="mt-1 text-xs text-emerald">✓ Passes all guardrail checks.</p>
                  )}

                  {pv.impact?.scenarios && (
                    <table className="mt-3 w-full text-xs">
                      <thead>
                        <tr className="text-left text-muted">
                          <th className="px-2 py-1">Scenario</th>
                          <th className="px-2 py-1 text-right">Current</th>
                          <th className="px-2 py-1 text-right">After</th>
                          <th className="px-2 py-1 text-right">Change</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pv.impact.scenarios.map((s: any) => (
                          <tr key={s.scenarioId} className="border-t border-white/8">
                            <td className="px-2 py-1 text-secondary">{s.label}{s.passChanged && <span className="ml-1 text-gold">• pass change</span>}</td>
                            <td className="tnum px-2 py-1 text-right text-muted">{money(s.currentMaxBorrow)}</td>
                            <td className="tnum px-2 py-1 text-right text-primary">{money(s.candidateMaxBorrow)}</td>
                            <td className={`tnum px-2 py-1 text-right font-semibold ${s.deltaAmount < 0 ? 'text-crimson' : s.deltaAmount > 0 ? 'text-emerald' : 'text-muted'}`}>{signed(s.deltaAmount)} ({s.deltaPct}%)</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  <div className="mt-3 flex items-center gap-2">
                    <button type="button" onClick={() => confirmUpload(b.brandCode)} disabled={busy === `commit-${b.brandCode}`} className="rounded-lg bg-gradient-to-br from-brand to-brand-dark px-4 py-1.5 text-xs font-semibold text-on-accent hover:brightness-110 disabled:opacity-50">
                      {busy === `commit-${b.brandCode}` ? 'Activating…' : pv.validation?.valid ? 'Confirm & activate' : 'Override & activate'}
                    </button>
                    <button type="button" onClick={() => setPreview((p) => ({ ...p, [b.brandCode]: undefined }))} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-secondary ring-1 ring-white/15 hover:bg-white/10">Cancel</button>
                    {!pv.validation?.valid && <span className="text-[11px] text-crimson">Has errors — overriding is recorded in the audit log.</span>}
                  </div>
                </div>
              )}

              {/* Change history (timeline) */}
              {tl && (
                <div className="mt-3 space-y-2 rounded-xl bg-white/5 p-3">
                  {tl.length === 0 && <p className="text-xs text-muted">No history.</p>}
                  {tl.map((e: any) => (
                    <div key={e.id} className="border-l-2 border-white/15 pl-3">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-semibold text-primary">{e.policyVersion}</span>
                        {e.isActive && <span className="rounded-full bg-success-light px-1.5 text-[10px] font-semibold text-emerald">ACTIVE</span>}
                        {e.isSeed && <span className="rounded-full bg-white/10 px-1.5 text-[10px] text-muted">seed</span>}
                        <span className="text-muted">{new Date(e.createdAt).toLocaleString()}</span>
                        {e.createdByEmail && <span className="text-muted">· {e.createdByEmail}</span>}
                        <span className="text-muted">· {e.changeCount} change{e.changeCount === 1 ? '' : 's'}</span>
                        {!e.isActive && !e.isSeed && (
                          <button type="button" onClick={() => rollback(b.brandCode, e.id)} disabled={busy === `rb-${b.brandCode}`} className="ml-auto rounded px-2 py-0.5 text-[11px] font-semibold text-brand ring-1 ring-brand/40 hover:bg-brand/15 disabled:opacity-50">Roll back to this</button>
                        )}
                      </div>
                      {e.changes?.length > 0 && (
                        <ul className="mt-1 ml-1 text-[11px] text-secondary">
                          {e.changes.slice(0, 6).map((c: any, k: number) => (
                            <li key={k}>
                              <span className="text-muted">{c.key}:</span> {c.before} → <span className={c.direction === 'increase' ? 'text-emerald' : c.direction === 'decrease' ? 'text-crimson' : 'text-primary'}>{c.after}</span>
                            </li>
                          ))}
                          {e.changes.length > 6 && <li className="text-muted">+{e.changes.length - 6} more…</li>}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {banks.length === 0 && <p className="py-4 text-sm text-muted">Loading banks…</p>}
      </div>
    </Card>
  );
}

export default BankPolicyDocx;
