'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import api from '@/lib/api';
import { Property, ExistingHomeLoan, PropertyType, Frequency } from '@/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import {
  money, pct, yearsMonths, FREQUENCY_OPTIONS,
  recalculateBorrowingCapacity, setIncludeInServicing, ServicingCalcResult,
} from '@/lib/servicingUi';

const PROPERTY_TYPE_OPTIONS = [
  { value: 'OWNER_OCCUPIED', label: 'Owner Occupied' },
  { value: 'INVESTMENT', label: 'Investment' },
  { value: 'RENTAL', label: 'Rental' },
];

function extractApiError(err: unknown, fallback: string): string {
  const ax = err as AxiosError<{ error?: string; details?: { message: string }[] }>;
  return ax.response?.data?.details?.[0]?.message || ax.response?.data?.error || fallback;
}

function optNum(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : undefined;
}

type EditableProperty = Partial<Property> & { type: PropertyType; address: string; estimatedValue: number };

/** Normalized estimate returned by GET /api/valuation/estimate. */
interface RentalEstimateResult {
  provider: string;
  configured: boolean;
  source: string;
  estimatedValue?: number | null;
  rentalEstimateWeekly?: number | null;
  rentalRangeLow?: number | null;
  rentalRangeHigh?: number | null;
  confidence?: string | number | null;
  message?: string;
  error?: string;
}

const EMPTY_PROPERTY: EditableProperty = {
  type: 'INVESTMENT', address: '', estimatedValue: 0, postcode: '', purchasePrice: null,
  purchaseDate: null, rentalIncomeAmount: null, rentalIncomeFrequency: 'WEEKLY',
  mortgageBalance: null, existingHomeLoanId: null, loanAmount: null, remainingLoanAmount: null,
  loanTermRemainingYears: null, currentBank: null, loanInterestRate: null, loanMonthlyRepayment: null,
  includeInServicing: true,
};

interface Props {
  /** Read-only mode (e.g. admin client detail). No CRUD / toggles / recalc. */
  readOnly?: boolean;
  /** Pre-supplied properties (read-only mode). When omitted the component fetches. */
  initialProperties?: Property[];
  /** Pre-supplied existing home loans for resolving linked loan columns. */
  initialExistingLoans?: ExistingHomeLoan[];
}

/** Open the realestate.com.au valuation link for an address in a new tab. */
async function openValuationLink(address: string, postcode?: string | null) {
  try {
    const res = await api.get('/valuation/link', { params: { address, postcode: postcode || '' } });
    const url = res.data?.url as string;
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  } catch {
    // Fallback: build the link client-side so the button always works.
    const term = [address, postcode || ''].filter(Boolean).join(' ');
    window.open(
      `https://www.realestate.com.au/buy/in-${encodeURIComponent(term)}/list-1`,
      '_blank',
      'noopener,noreferrer'
    );
  }
}

/** Growth bar: purchase price (left) -> current value (right). Animates its
 * fill width from 0 on mount for a subtle reveal. */
function GrowthBar({ purchase, current }: { purchase: number | null | undefined; current: number }) {
  const ratio = purchase && purchase > 0 ? current / purchase : null;
  const growthPct = ratio !== null ? (ratio - 1) * 100 : 0;
  const targetFill = ratio !== null ? Math.max(4, Math.min(100, (ratio / 2) * 100)) : 0;
  const [fill, setFill] = useState(0);

  useEffect(() => {
    const id = requestAnimationFrame(() => setFill(targetFill));
    return () => cancelAnimationFrame(id);
  }, [targetFill]);

  if (ratio === null) {
    return <div className="h-2 w-full rounded-full bg-white/10" aria-hidden="true" />;
  }
  const color = growthPct >= 10 ? 'bg-emerald-500' : growthPct >= 0 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-white/10" role="img"
      aria-label={`Growth ${growthPct.toFixed(1)} percent`}>
      <div className={`bar-fill h-full ${color}`} style={{ width: `${fill}%` }} />
    </div>
  );
}

export function PropertyPortfolioTable({ readOnly = false, initialProperties, initialExistingLoans }: Props) {
  const [properties, setProperties] = useState<Property[]>(initialProperties || []);
  const [existingLoans, setExistingLoans] = useState<ExistingHomeLoan[]>(initialExistingLoans || []);
  const [loading, setLoading] = useState(!initialProperties);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<EditableProperty>(EMPTY_PROPERTY);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Automated rental-estimate state (Domain AVM / Apify, via /valuation/estimate).
  const [estimate, setEstimate] = useState<RentalEstimateResult | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [estimateMsg, setEstimateMsg] = useState('');

  // Recalc state
  const [ratePct, setRatePct] = useState('6');
  const [recalcResult, setRecalcResult] = useState<ServicingCalcResult | null>(null);
  const [recalcing, setRecalcing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [pRes, lRes] = await Promise.all([
        api.get('/client/properties'),
        api.get('/client/existing-home-loans').catch(() => ({ data: { existingHomeLoans: [] } })),
      ]);
      setProperties(Array.isArray(pRes.data?.properties) ? pRes.data.properties : []);
      setExistingLoans(Array.isArray(lRes.data?.existingHomeLoans) ? lRes.data.existingHomeLoans : []);
    } catch {
      setError('Unable to load properties.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initialProperties) fetchData();
  }, [initialProperties, fetchData]);

  const includedCount = properties.filter((p) => p.includeInServicing !== false).length;

  /** Resolve loan-related display values: prefer linked ExistingHomeLoan. */
  function loanColumns(p: Property) {
    const linked = p.existingHomeLoanId
      ? existingLoans.find((l) => l.id === p.existingHomeLoanId)
      : undefined;
    return {
      loanAmount: linked?.loanAmount ?? p.loanAmount ?? null,
      remaining: p.remainingLoanAmount ?? linked?.loanAmount ?? p.mortgageBalance ?? null,
      remTerm: linked?.termYears ?? p.loanTermRemainingYears ?? null,
      bank: linked?.lender ?? p.currentBank ?? null,
      rate: linked?.interestRate ?? p.loanInterestRate ?? null,
      repayment: linked?.monthlyRepayment ?? p.loanMonthlyRepayment ?? null,
      linked: !!linked,
    };
  }

  function yearOfPurchase(p: Property): string {
    if (!p.purchaseDate) return '—';
    const d = new Date(p.purchaseDate);
    return Number.isNaN(d.getTime()) ? '—' : String(d.getFullYear());
  }

  async function toggleInclude(p: Property) {
    if (readOnly) return;
    const next = !(p.includeInServicing !== false);
    // Optimistic update
    setProperties((prev) => prev.map((x) => (x.id === p.id ? { ...x, includeInServicing: next } : x)));
    try {
      await setIncludeInServicing('property', p.id, next);
    } catch {
      // Revert on failure
      setProperties((prev) => prev.map((x) => (x.id === p.id ? { ...x, includeInServicing: !next } : x)));
      setError('Failed to update servicing selection.');
    }
  }

  function openAdd() {
    setEditing({ ...EMPTY_PROPERTY });
    setEditId(null);
    setError('');
    setEstimate(null);
    setEstimateMsg('');
    setModalOpen(true);
  }

  function openEdit(p: Property) {
    setEditing({
      type: p.type, address: p.address, estimatedValue: p.estimatedValue, postcode: p.postcode ?? '',
      purchasePrice: p.purchasePrice ?? null,
      purchaseDate: p.purchaseDate ? p.purchaseDate.split('T')[0] : null,
      rentalIncomeAmount: p.rentalIncomeAmount ?? null,
      rentalIncomeFrequency: (p.rentalIncomeFrequency as Frequency) ?? 'WEEKLY',
      mortgageBalance: p.mortgageBalance ?? null,
      existingHomeLoanId: p.existingHomeLoanId ?? null,
      loanAmount: p.loanAmount ?? null, remainingLoanAmount: p.remainingLoanAmount ?? null,
      loanTermRemainingYears: p.loanTermRemainingYears ?? null, currentBank: p.currentBank ?? null,
      loanInterestRate: p.loanInterestRate ?? null, loanMonthlyRepayment: p.loanMonthlyRepayment ?? null,
      includeInServicing: p.includeInServicing !== false,
    });
    setEditId(p.id);
    setError('');
    setEstimate(null);
    setEstimateMsg('');
    setModalOpen(true);
  }

  /** Fetch an automated rental estimate from the configured provider (Domain
   * AVM / Apify) for the address+postcode currently in the form. Falls back
   * gracefully to a message when the provider is not configured or errors. */
  async function fetchRentalEstimate() {
    setEstimating(true);
    setEstimate(null);
    setEstimateMsg('');
    try {
      const res = await api.get('/valuation/estimate', {
        params: {
          address: editing.address,
          postcode: editing.postcode || '',
          propertyType: editing.type,
        },
      });
      const data = res.data as RentalEstimateResult;
      if (!data || data.configured === false) {
        setEstimateMsg(
          data?.message ||
            'Automated estimate not configured. Use the realestate.com.au link and enter the rent manually.'
        );
        return;
      }
      if (data.error) {
        setEstimateMsg(data.error);
        return;
      }
      if (data.rentalEstimateWeekly == null && data.estimatedValue == null) {
        setEstimateMsg('No estimate returned for this address. Enter the rent manually.');
        return;
      }
      setEstimate(data);
    } catch {
      setEstimateMsg(
        'Unable to fetch an estimate right now. Use the realestate.com.au link and enter the rent manually.'
      );
    } finally {
      setEstimating(false);
    }
  }

  /** Apply the fetched estimate into the form fields (broker can still edit). */
  function applyEstimate() {
    if (!estimate) return;
    setEditing((e) => {
      const next = { ...e };
      if (estimate.rentalEstimateWeekly != null) {
        next.rentalIncomeAmount = estimate.rentalEstimateWeekly;
        next.rentalIncomeFrequency = 'WEEKLY';
      }
      if (estimate.estimatedValue != null) {
        next.estimatedValue = estimate.estimatedValue;
      }
      return next;
    });
  }

  async function saveProperty() {
    setSaving(true); setError('');
    const address = (editing.address || '').trim();
    if (!address) { setError('Address is required.'); setSaving(false); return; }
    const estimatedValue = optNum(editing.estimatedValue);
    if (estimatedValue === undefined || estimatedValue <= 0) {
      setError('Estimated value must be greater than 0.'); setSaving(false); return;
    }
    // Interest rate entered as a percent -> stored as decimal.
    const rateDecimal = optNum(editing.loanInterestRate);
    const payload: Record<string, unknown> = {
      type: editing.type,
      address,
      estimatedValue,
      postcode: editing.postcode || undefined,
      purchasePrice: optNum(editing.purchasePrice) ?? null,
      purchaseDate: editing.purchaseDate || null,
      rentalIncomeAmount: optNum(editing.rentalIncomeAmount) ?? null,
      rentalIncomeFrequency: editing.rentalIncomeFrequency || null,
      mortgageBalance: optNum(editing.mortgageBalance) ?? null,
      existingHomeLoanId: editing.existingHomeLoanId || null,
      loanAmount: optNum(editing.loanAmount) ?? null,
      remainingLoanAmount: optNum(editing.remainingLoanAmount) ?? null,
      loanTermRemainingYears: optNum(editing.loanTermRemainingYears) ?? null,
      currentBank: editing.currentBank || null,
      loanInterestRate: rateDecimal ?? null,
      loanMonthlyRepayment: optNum(editing.loanMonthlyRepayment) ?? null,
      includeInServicing: editing.includeInServicing !== false,
    };
    try {
      if (editId) await api.put(`/client/properties/${editId}`, payload);
      else await api.post('/client/properties', payload);
      setModalOpen(false);
      await fetchData();
    } catch (err) {
      setError(extractApiError(err, 'Failed to save property.'));
    } finally {
      setSaving(false);
    }
  }

  async function deleteProperty(p: Property) {
    if (!confirm(`Delete property "${p.address}"?`)) return;
    try { await api.delete(`/client/properties/${p.id}`); await fetchData(); }
    catch { setError('Failed to delete property.'); }
  }

  async function handleRecalc() {
    setRecalcing(true); setError('');
    try {
      const r = await recalculateBorrowingCapacity({ interestRate: (parseFloat(ratePct) || 6) / 100 });
      setRecalcResult(r);
    } catch (err) {
      setError(extractApiError(err, 'Unable to recalculate borrowing capacity.'));
    } finally {
      setRecalcing(false);
    }
  }

  if (loading) return <p className="text-sm text-muted">Loading properties…</p>;

  return (
    <div className="space-y-4">
      {error && <Alert variant="error">{error}</Alert>}

      {/* Summary + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium text-secondary">
          {properties.length} propert{properties.length === 1 ? 'y' : 'ies'} total,{' '}
          <span className="text-brand">{includedCount} included in servicing</span>
        </p>
        {!readOnly && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted">Rate %</span>
              <input type="number" step="0.1" value={ratePct} onChange={(e) => setRatePct(e.target.value)}
                className="glass-input w-16 rounded-lg border border-white/15 px-2 py-1 text-sm" />
            </div>
            <Button variant="secondary" size="sm" onClick={handleRecalc} loading={recalcing}>
              Recalculate borrowing capacity
            </Button>
            <Button size="sm" onClick={openAdd}>+ Add property</Button>
          </div>
        )}
      </div>
      {!readOnly && (
        <p className="text-xs text-muted">Tick the items to include in the borrowing calculation.</p>
      )}

      {recalcResult && (
        <Alert variant="info">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
            <span className="font-semibold">
              Max borrowing capacity:{' '}
              <AnimatedNumber value={recalcResult.maxBorrowingCapacity} prefix="$" />
            </span>
            <span>Monthly surplus: {money(recalcResult.netMonthlySurplus)}</span>
            <span>DTI: {recalcResult.dtiRatio.toFixed(2)}x</span>
          </div>
          <p className="mt-1 text-xs">Indicative estimate only - not a credit decision.</p>
        </Alert>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-white/12 bg-white/5 backdrop-blur-sm">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-white/15 text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-3 py-2">Sr No.</th>
              <th className="px-3 py-2">Property Type</th>
              <th className="px-3 py-2">Address</th>
              <th className="px-3 py-2">Loan amount</th>
              <th className="px-3 py-2">Remaining amount</th>
              <th className="px-3 py-2">Rem Term</th>
              <th className="px-3 py-2">Est. valuation</th>
              <th className="px-3 py-2">Current bank</th>
              <th className="px-3 py-2">Interest rate</th>
              <th className="px-3 py-2">Monthly repayment</th>
              <th className="px-3 py-2">Rent p.w</th>
              <th className="px-3 py-2">Year of purchase</th>
              <th className="px-3 py-2">Include in servicing</th>
              {!readOnly && <th className="px-3 py-2">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {properties.map((p, idx) => {
              const lc = loanColumns(p);
              const g = p.growth;
              const isOpen = !!expanded[p.id];
              return (
                <React.Fragment key={p.id}>
                  <tr className="row-hover border-b border-white/30 text-primary">
                    <td className="px-3 py-2">{idx + 1}</td>
                    <td className="px-3 py-2">{p.type.replace(/_/g, ' ')}</td>
                    <td className="px-3 py-2">
                      {p.address}
                      {lc.linked && <Badge variant="info" className="ml-1">linked loan</Badge>}
                    </td>
                    <td className="px-3 py-2">{money(lc.loanAmount)}</td>
                    <td className="px-3 py-2">{money(lc.remaining)}</td>
                    <td className="px-3 py-2">{lc.remTerm != null ? `${lc.remTerm} yr` : '—'}</td>
                    <td className="px-3 py-2 font-medium">{money(p.estimatedValue)}</td>
                    <td className="px-3 py-2">{lc.bank || '—'}</td>
                    <td className="px-3 py-2">{lc.rate != null ? pct(lc.rate * 100) : '—'}</td>
                    <td className="px-3 py-2">{money(lc.repayment)}</td>
                    <td className="px-3 py-2">{g?.weeklyRent != null ? money(g.weeklyRent) : '—'}</td>
                    <td className="px-3 py-2">{yearOfPurchase(p)}</td>
                    <td className="px-3 py-2">
                      <ToggleSwitch
                        checked={p.includeInServicing !== false}
                        disabled={readOnly}
                        onChange={() => toggleInclude(p)}
                        label={`Include ${p.address} in servicing`}
                      />
                    </td>
                    {!readOnly && (
                      <td className="px-3 py-2 whitespace-nowrap">
                        <button onClick={() => openEdit(p)} className="mr-2 text-xs font-medium text-brand hover:underline">Edit</button>
                        <button onClick={() => deleteProperty(p)} className="text-xs font-medium text-crimson hover:underline">Delete</button>
                      </td>
                    )}
                  </tr>
                  <tr className="border-b border-white/30 bg-white/5">
                    <td colSpan={readOnly ? 13 : 14} className="px-3 py-1">
                      <button onClick={() => setExpanded((s) => ({ ...s, [p.id]: !s[p.id] }))}
                        className="text-xs font-medium text-secondary transition-colors hover:text-brand"
                        aria-expanded={isOpen}>
                        <span className={`mr-1 inline-block transition-transform duration-300 ${isOpen ? 'rotate-90' : ''}`}>▸</span>
                        {isOpen ? 'Hide property performance' : 'View property performance'}
                      </button>
                      <div className={`collapsible ${isOpen ? 'is-open' : ''}`}>
                        <div className="collapsible-inner">
                          <div className="py-3">
                            <div className="mb-2 flex justify-between text-xs text-muted">
                              <span>Purchase {money(g?.purchasePrice ?? p.purchasePrice ?? null)}</span>
                              <span>Now {money(p.estimatedValue)}</span>
                            </div>
                            <GrowthBar purchase={g?.purchasePrice ?? p.purchasePrice ?? null} current={p.estimatedValue} />
                            <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
                              <div>
                                <p className="text-xs text-muted">Capital growth</p>
                                <p className="font-semibold">{money(g?.capitalGrowthDollars)}</p>
                                <p className="text-xs text-muted">{pct(g?.capitalGrowthPercent)}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted">Years held</p>
                                <p className="font-semibold">{yearsMonths(g?.yearsHeld)}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted">CAGR</p>
                                <p className="font-semibold">{pct(g?.cagrPercent)}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted">Total gross rent</p>
                                <p className="font-semibold">{money(g?.totalGrossRent)}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted">Gross yield</p>
                                <p className="font-semibold">{pct(g?.grossYieldPercent)}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                </React.Fragment>
              );
            })}
            {properties.length === 0 && (
              <tr><td colSpan={readOnly ? 13 : 14} className="px-3 py-6 text-center text-sm text-muted">No properties yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add / Edit modal */}
      {modalOpen && (
        <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editId ? 'Edit property' : 'Add property'}>
          <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
            {error && <Alert variant="error">{error}</Alert>}
            <div className="grid grid-cols-2 gap-3">
              <Select label="Type" options={PROPERTY_TYPE_OPTIONS} value={editing.type}
                onChange={(e) => setEditing({ ...editing, type: e.target.value as PropertyType })} />
              <Input label="Estimated value" type="number" min="0" value={String(editing.estimatedValue ?? '')}
                onChange={(e) => setEditing({ ...editing, estimatedValue: parseFloat(e.target.value) || 0 })} />
              <Input label="Address" className="col-span-2" value={editing.address}
                onChange={(e) => setEditing({ ...editing, address: e.target.value })} />
              <Input label="Postcode" value={editing.postcode || ''}
                onChange={(e) => setEditing({ ...editing, postcode: e.target.value })} />
              <div className="col-span-2 flex flex-wrap items-end gap-2">
                <Button variant="secondary" size="sm" type="button"
                  onClick={() => openValuationLink(editing.address, editing.postcode)}
                  disabled={!editing.address}>
                  Find valuation on realestate.com.au
                </Button>
                <Button variant="secondary" size="sm" type="button"
                  onClick={fetchRentalEstimate} loading={estimating}
                  disabled={!editing.address && !editing.postcode}>
                  Get valuation (realestate.com.au via Apify)
                </Button>
              </div>
              {(estimate || estimateMsg) && (
                <div className="col-span-2">
                  {estimate ? (
                    <Alert variant="info">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm">
                          {estimate.rentalEstimateWeekly != null && (
                            <p className="font-semibold">
                              Estimated rent: {money(estimate.rentalEstimateWeekly)} p.w
                              {(estimate.rentalRangeLow != null || estimate.rentalRangeHigh != null) && (
                                <span className="font-normal text-secondary">
                                  {' '}(range {money(estimate.rentalRangeLow)} – {money(estimate.rentalRangeHigh)})
                                </span>
                              )}
                            </p>
                          )}
                          {estimate.estimatedValue != null && (
                            <p className="font-semibold">Estimated value: {money(estimate.estimatedValue)}</p>
                          )}
                          <p className="text-xs text-muted">
                            Source: {estimate.source}
                            {estimate.confidence != null && ` · confidence: ${estimate.confidence}`}
                            {' '}· an estimate only; you can edit before saving.
                          </p>
                        </div>
                        <Button variant="primary" size="sm" type="button" onClick={applyEstimate}>
                          Use this
                        </Button>
                      </div>
                    </Alert>
                  ) : (
                    <p className="text-xs text-muted">{estimateMsg}</p>
                  )}
                </div>
              )}
              <Input label="Purchase price" type="number" min="0" value={String(editing.purchasePrice ?? '')}
                onChange={(e) => setEditing({ ...editing, purchasePrice: e.target.value === '' ? null : parseFloat(e.target.value) })} />
              <Input label="Purchase date" type="date" value={editing.purchaseDate || ''}
                onChange={(e) => setEditing({ ...editing, purchaseDate: e.target.value || null })} />
              <Input label="Rent (amount)" type="number" min="0" value={String(editing.rentalIncomeAmount ?? '')}
                onChange={(e) => setEditing({ ...editing, rentalIncomeAmount: e.target.value === '' ? null : parseFloat(e.target.value) })} />
              <Select label="Rent frequency" options={FREQUENCY_OPTIONS} value={editing.rentalIncomeFrequency || 'WEEKLY'}
                onChange={(e) => setEditing({ ...editing, rentalIncomeFrequency: e.target.value as Frequency })} />
            </div>

            <div className="border-t border-white/10 pt-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Linked / inline loan</p>
              {existingLoans.length > 0 && (
                <Select label="Link existing home loan (preferred)" className="mb-3"
                  options={[{ value: '', label: '— none —' }, ...existingLoans.map((l) => ({
                    value: l.id, label: `${l.lender || 'Loan'} · ${money(l.loanAmount)}`,
                  }))]}
                  value={editing.existingHomeLoanId || ''}
                  onChange={(e) => setEditing({ ...editing, existingHomeLoanId: e.target.value || null })} />
              )}
              <div className="grid grid-cols-2 gap-3">
                <Input label="Loan amount" type="number" min="0" value={String(editing.loanAmount ?? '')}
                  onChange={(e) => setEditing({ ...editing, loanAmount: e.target.value === '' ? null : parseFloat(e.target.value) })} />
                <Input label="Remaining amount" type="number" min="0" value={String(editing.remainingLoanAmount ?? '')}
                  onChange={(e) => setEditing({ ...editing, remainingLoanAmount: e.target.value === '' ? null : parseFloat(e.target.value) })} />
                <Input label="Remaining term (yrs)" type="number" min="0" value={String(editing.loanTermRemainingYears ?? '')}
                  onChange={(e) => setEditing({ ...editing, loanTermRemainingYears: e.target.value === '' ? null : parseFloat(e.target.value) })} />
                <Input label="Current bank" value={editing.currentBank || ''}
                  onChange={(e) => setEditing({ ...editing, currentBank: e.target.value })} />
                <Input label="Interest rate (%)" type="number" step="0.01" min="0"
                  value={editing.loanInterestRate != null ? String(editing.loanInterestRate * 100) : ''}
                  onChange={(e) => setEditing({ ...editing, loanInterestRate: e.target.value === '' ? null : parseFloat(e.target.value) / 100 })} />
                <Input label="Monthly repayment" type="number" min="0" value={String(editing.loanMonthlyRepayment ?? '')}
                  onChange={(e) => setEditing({ ...editing, loanMonthlyRepayment: e.target.value === '' ? null : parseFloat(e.target.value) })} />
              </div>
            </div>

            <label className="flex items-center gap-2">
              <input type="checkbox" checked={editing.includeInServicing !== false}
                onChange={(e) => setEditing({ ...editing, includeInServicing: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand" />
              <span className="text-sm text-secondary">Include in servicing</span>
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button onClick={saveProperty} loading={saving}>{editId ? 'Save' : 'Add'}</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default PropertyPortfolioTable;
