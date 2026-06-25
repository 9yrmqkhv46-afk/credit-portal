'use client';

import React, { useState } from 'react';
import api from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';

/**
 * Admin read-only view of the Bluehive assessment extras (identity, address
 * history, credit history, company/trust, insurance & preferences, co-borrower,
 * employment, bank accounts, assets) + an editable Broker Details section.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyProfile = any;

function fmtDate(v?: string | null): string {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}
function val(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v);
}
function money(v: unknown): string {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isNaN(n) ? '—' : `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <span className="text-muted">{label}</span>
      <span className="text-right text-primary">{value}</span>
    </div>
  );
}

export function AdminAssessmentView({ clientId, profile }: { clientId: string; profile: AnyProfile }) {
  const { toast } = useToast();
  const bd = profile?.brokerDetails || {};
  const [broker, setBroker] = useState({
    conveyancerName: bd.conveyancerName || '',
    conveyancerAddress: bd.conveyancerAddress || '',
    conveyancerPhone: bd.conveyancerPhone || '',
    conveyancerEmail: bd.conveyancerEmail || '',
    lenderSelected: bd.lenderSelected || '',
  });
  const [saving, setSaving] = useState(false);

  if (!profile) return null;

  const co = profile.coBorrower;
  const employments = profile.employments || [];
  const bankAccounts = profile.bankAccounts || [];
  const assets = profile.nonPropertyAssets || [];

  const saveBroker = async () => {
    setSaving(true);
    try {
      await api.put(`/admin/clients/${clientId}/broker-details`, broker);
      toast('Broker details saved', { accent: 'emerald' });
    } catch {
      toast('Save failed', { accent: 'crimson' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Card title="Identity & Compliance">
        <div className="grid gap-x-8 gap-y-1 md:grid-cols-2">
          <Row label="Borrower type" value={val(profile.borrowerType)} />
          <Row label="Title" value={val(profile.title)} />
          <Row label="First home buyer" value={val(profile.isFirstHomeBuyer)} />
          <Row label="Country of citizenship" value={val(profile.countryOfCitizenship)} />
          <Row label="Driver licence" value={val(profile.driverLicenceNumber)} />
          <Row label="Licence expiry" value={fmtDate(profile.driverLicenceExpiry)} />
          <Row label="Passport" value={val(profile.passportNumber)} />
          <Row label="Passport expiry" value={fmtDate(profile.passportExpiry)} />
          <Row label="Has defaults/judgements" value={val(profile.hasDefaultsOrJudgements)} />
          <Row label="Mother's maiden name" value={val(profile.mothersMaidenName)} />
          <Row label="Nearest relative" value={val(profile.nearestRelativeName)} />
          <Row label="Relative phone" value={val(profile.nearestRelativePhone)} />
        </div>
        {profile.creditHistoryDetails && (
          <p className="mt-3 rounded-lg bg-white/5 p-3 text-sm text-secondary"><span className="text-muted">Credit notes: </span>{profile.creditHistoryDetails}</p>
        )}
      </Card>

      <Card title="Address History">
        <Row label="Current arrangement" value={val(profile.currentAddressLivingArrangement)} />
        <Row label="Moved in" value={fmtDate(profile.currentAddressDateMovedIn)} />
        <Row label="Previous address 1" value={`${val(profile.previousAddress1)} (${fmtDate(profile.previousAddress1DateMovedIn)})`} />
        <Row label="Previous address 2" value={`${val(profile.previousAddress2)} (${fmtDate(profile.previousAddress2DateMovedIn)})`} />
      </Card>

      {(profile.isCompanyTrustBorrower || profile.companyName || profile.trustName) && (
        <Card title="Company / Trust">
          <div className="grid gap-x-8 gap-y-1 md:grid-cols-2">
            <Row label="Company" value={val(profile.companyName)} />
            <Row label="Trust" value={val(profile.trustName)} />
            <Row label="ACN" value={val(profile.acn)} />
            <Row label="ABN" value={val(profile.abn)} />
            <Row label="Incorporated" value={fmtDate(profile.dateOfIncorporation)} />
            <Row label="Address" value={val(profile.companyAddress)} />
          </div>
        </Card>
      )}

      <Card title="Insurance & Loan Preferences">
        <div className="grid gap-x-8 gap-y-1 md:grid-cols-2">
          <Row label="Preferred interest type" value={val(profile.preferredInterestType)} />
          <Row label="Wants offset" value={val(profile.wantsOffsetAccount)} />
          <Row label="Car loans" value={val(profile.interestedInCarLoans)} />
          <Row label="Equipment finance" value={val(profile.interestedInEquipmentFinance)} />
          <Row label="Commercial finance" value={val(profile.interestedInCommercialFinance)} />
          <Row label="SMSF" value={val(profile.interestedInSMSF)} />
        </div>
        {profile.insuranceDetails && <p className="mt-2 text-sm text-secondary"><span className="text-muted">Insurance: </span>{profile.insuranceDetails}</p>}
        {profile.additionalNotes && <p className="mt-2 text-sm text-secondary"><span className="text-muted">Notes: </span>{profile.additionalNotes}</p>}
      </Card>

      {co && (
        <Card title="Co-Borrower (Borrower 2)">
          <div className="grid gap-x-8 gap-y-1 md:grid-cols-2">
            <Row label="Name" value={`${val(co.title)} ${val(co.firstName)} ${val(co.lastName)}`} />
            <Row label="Relationship" value={val(co.relationshipToBorrower1)} />
            <Row label="Date of birth" value={fmtDate(co.dateOfBirth)} />
            <Row label="Mobile" value={val(co.mobilePhone)} />
            <Row label="Email" value={val(co.email)} />
            <Row label="Residency" value={val(co.residencyStatus)} />
            <Row label="Driver licence" value={val(co.driverLicenceNumber)} />
            <Row label="Passport" value={val(co.passportNumber)} />
            <Row label="Has defaults/judgements" value={val(co.hasDefaultsOrJudgements)} />
          </div>
        </Card>
      )}

      {employments.length > 0 && (
        <Card title="Employment History">
          <div className="space-y-2">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {employments.map((e: any) => (
              <div key={e.id} className="rounded-xl border border-white/12 bg-white/5 p-3 text-sm">
                <div className="flex justify-between">
                  <span className="font-medium text-primary">{val(e.employerName)} — {val(e.jobTitle)}</span>
                  <span className="text-muted">{e.owner === 'PARTNER' ? 'Borrower 2' : 'Borrower 1'}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-6 gap-y-0.5 text-xs text-secondary">
                  <span>{val(e.employmentType)}</span>
                  <span>{fmtDate(e.dateStarted)} – {e.dateFinished ? fmtDate(e.dateFinished) : 'current'}</span>
                  <span>{money(e.annualSalaryExSuper)}/yr</span>
                  {e.isSelfEmployed && <span>Self-employed{e.abn ? ` · ABN ${e.abn}` : ''}</span>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {(bankAccounts.length > 0 || assets.length > 0) && (
        <Card title="Assets (non-property)">
          {bankAccounts.length > 0 && (
            <div className="mb-3">
              <h4 className="mb-1 text-sm font-semibold text-secondary">Bank accounts</h4>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {bankAccounts.map((b: any) => (
                <Row key={b.id} label={`${val(b.institution)} (${val(b.accountType)})`} value={money(b.balance)} />
              ))}
            </div>
          )}
          {assets.length > 0 && (
            <div>
              <h4 className="mb-1 text-sm font-semibold text-secondary">Other assets</h4>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {assets.map((a: any) => (
                <Row key={a.id} label={`${val(a.description) !== '—' ? a.description : a.assetType} (${val(a.owner)})`} value={money(a.value)} />
              ))}
            </div>
          )}
        </Card>
      )}

      <Card title="Broker Details">
        <div className="grid gap-4 md:grid-cols-2">
          <Input label="Conveyancer name" value={broker.conveyancerName} onChange={(e) => setBroker({ ...broker, conveyancerName: e.target.value })} />
          <Input label="Conveyancer phone" value={broker.conveyancerPhone} onChange={(e) => setBroker({ ...broker, conveyancerPhone: e.target.value })} />
          <Input label="Conveyancer email" value={broker.conveyancerEmail} onChange={(e) => setBroker({ ...broker, conveyancerEmail: e.target.value })} />
          <Input label="Lender selected" value={broker.lenderSelected} onChange={(e) => setBroker({ ...broker, lenderSelected: e.target.value })} />
          <Input label="Conveyancer address" className="md:col-span-2" value={broker.conveyancerAddress} onChange={(e) => setBroker({ ...broker, conveyancerAddress: e.target.value })} />
        </div>
        <div className="mt-4 flex justify-end">
          <button type="button" onClick={saveBroker} disabled={saving} className="rounded-xl bg-gradient-to-br from-brand to-brand-dark px-4 py-2 text-sm font-semibold text-on-accent hover:brightness-110 disabled:opacity-50">
            Save Broker Details
          </button>
        </div>
      </Card>
    </>
  );
}

export default AdminAssessmentView;
