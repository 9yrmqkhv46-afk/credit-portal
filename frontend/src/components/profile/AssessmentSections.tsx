'use client';

import React, { useEffect, useMemo, useState } from 'react';
import api from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { ListEditor, FieldDef } from './ListEditor';

/**
 * Bluehive Home Loan Assessment — the personal / compliance sections that
 * extend the existing Profile Centre: identity documents, 3-year address
 * history, credit history + emergency contact, company/trust, insurance &
 * loan preferences, co-borrower (Borrower 2), employment history, bank
 * accounts and other assets.
 */

interface SectionProps {
  title: string; subtitle?: string; dirty?: boolean; open: boolean;
  onToggle: () => void; onSave?: () => void; children: React.ReactNode;
}
function Section({ title, subtitle, dirty, open, onToggle, onSave, children }: SectionProps) {
  return (
    <div className="glass-2 overflow-hidden rounded-2xl">
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left">
        <span className="flex items-center gap-2">
          <span className="font-display text-base font-semibold text-primary">{title}</span>
          {dirty && <span className="h-2 w-2 rounded-full bg-warning shadow-[0_0_8px_var(--accent-gold)]" aria-label="unsaved changes" />}
        </span>
        <span className="flex items-center gap-3">
          {subtitle && <span className="hidden text-xs text-muted sm:inline">{subtitle}</span>}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted transition-transform" style={{ transform: open ? 'rotate(180deg)' : 'none' }} aria-hidden="true"><path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
      </button>
      <div className={`collapsible ${open ? 'is-open' : ''}`}>
        <div className="collapsible-inner">
          <div className="space-y-4 px-5 pb-5">
            {children}
            {onSave && (
              <div className="flex justify-end">
                <button type="button" onClick={onSave} disabled={!dirty} className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${dirty ? 'bg-gradient-to-br from-brand to-brand-dark text-on-accent shadow-lg shadow-brand/25 hover:brightness-110' : 'bg-white/8 text-muted'}`}>
                  Save Changes
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const TITLE_OPTIONS = ['Mr', 'Mrs', 'Ms', 'Miss', 'Dr', 'Other'].map((v) => ({ value: v, label: v }));
const BORROWER_TYPE_OPTIONS = [{ value: 'Applicant', label: 'Applicant' }, { value: 'Guarantor', label: 'Guarantor' }];
const LIVING_OPTIONS = [{ value: 'Own', label: 'Own outright' }, { value: 'Mortgage', label: 'Mortgage' }, { value: 'Renting', label: 'Renting' }, { value: 'Boarding', label: 'Boarding' }];
const RESIDENCY_OPTIONS = [{ value: 'CITIZEN', label: 'Citizen' }, { value: 'PERMANENT_RESIDENT', label: 'Permanent Resident' }, { value: 'TEMPORARY_VISA', label: 'Temporary Visa' }];
const INTEREST_TYPE_OPTIONS = [{ value: 'Variable', label: 'Variable' }, { value: 'Fixed', label: 'Fixed' }, { value: 'Split', label: 'Split' }];
const MARITAL_OPTIONS = ['SINGLE', 'MARRIED', 'DE_FACTO', 'SEPARATED', 'DIVORCED', 'WIDOWED'].map((v) => ({ value: v, label: v.replace('_', ' ') }));

type F = Record<string, string | boolean>;

export function AssessmentSections() {
  const { toast } = useToast();
  const [open, setOpen] = useState<string | null>(null);
  const [exists, setExists] = useState(false);

  const [form, setForm] = useState<F>({});
  const [initial, setInitial] = useState<F>({});
  const [cb, setCb] = useState<F>({});
  const [cbInitial, setCbInitial] = useState<F>({});

  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));
  const setCbField = (k: string, v: string | boolean) => setCb((f) => ({ ...f, [k]: v }));

  const d = (v?: string | null) => (v ? v.split('T')[0] : '');

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/client/profile');
        const p = res.data?.profile;
        if (p) {
          setExists(true);
          const next: F = {
            borrowerType: p.borrowerType || '', title: p.title || '', isFirstHomeBuyer: !!p.isFirstHomeBuyer,
            driverLicenceNumber: p.driverLicenceNumber || '', driverLicenceExpiry: d(p.driverLicenceExpiry),
            passportNumber: p.passportNumber || '', passportExpiry: d(p.passportExpiry), countryOfCitizenship: p.countryOfCitizenship || '',
            currentAddressLivingArrangement: p.currentAddressLivingArrangement || '', currentAddressDateMovedIn: d(p.currentAddressDateMovedIn),
            previousAddress1: p.previousAddress1 || '', previousAddress1DateMovedIn: d(p.previousAddress1DateMovedIn), previousAddress1LivingArrangement: p.previousAddress1LivingArrangement || '',
            previousAddress2: p.previousAddress2 || '', previousAddress2DateMovedIn: d(p.previousAddress2DateMovedIn), previousAddress2LivingArrangement: p.previousAddress2LivingArrangement || '',
            hasDefaultsOrJudgements: !!p.hasDefaultsOrJudgements, creditHistoryDetails: p.creditHistoryDetails || '', mothersMaidenName: p.mothersMaidenName || '',
            nearestRelativeName: p.nearestRelativeName || '', nearestRelativeAddress: p.nearestRelativeAddress || '', nearestRelativePhone: p.nearestRelativePhone || '', nearestRelativeRelationship: p.nearestRelativeRelationship || '',
            isCompanyTrustBorrower: !!p.isCompanyTrustBorrower, companyName: p.companyName || '', trustName: p.trustName || '', companyAddress: p.companyAddress || '',
            acn: p.acn || '', abn: p.abn || '', dateOfIncorporation: d(p.dateOfIncorporation), specifiedBeneficiaries: p.specifiedBeneficiaries || '',
            insuranceDetails: p.insuranceDetails || '', preferredInterestType: p.preferredInterestType || '', wantsOffsetAccount: !!p.wantsOffsetAccount,
            interestedInCarLoans: !!p.interestedInCarLoans, interestedInEquipmentFinance: !!p.interestedInEquipmentFinance,
            interestedInCommercialFinance: !!p.interestedInCommercialFinance, interestedInSMSF: !!p.interestedInSMSF, additionalNotes: p.additionalNotes || '',
          };
          setForm(next); setInitial(next);
        }
      } catch { /* no profile yet */ }
      try {
        const res = await api.get('/client/co-borrower');
        const c = res.data?.coBorrower;
        if (c) {
          const next: F = {
            relationshipToBorrower1: c.relationshipToBorrower1 || '', borrowerType: c.borrowerType || '', title: c.title || '',
            firstName: c.firstName || '', middleName: c.middleName || '', lastName: c.lastName || '', dateOfBirth: d(c.dateOfBirth),
            maritalStatus: c.maritalStatus || '', mobilePhone: c.mobilePhone || '', email: c.email || '', currentAddress: c.currentAddress || '',
            driverLicenceNumber: c.driverLicenceNumber || '', passportNumber: c.passportNumber || '', countryOfCitizenship: c.countryOfCitizenship || '',
            residencyStatus: c.residencyStatus || '', visaSubclass: c.visaSubclass || '',
            hasDefaultsOrJudgements: !!c.hasDefaultsOrJudgements, creditHistoryDetails: c.creditHistoryDetails || '',
          };
          setCb(next); setCbInitial(next);
        }
      } catch { /* none */ }
    })();
  }, []);

  const dirtyOf = (keys: string[], a: F, b: F) => keys.some((k) => a[k] !== b[k]);

  const persist = async (keys: string[]) => {
    const payload: Record<string, unknown> = {};
    for (const k of keys) {
      const v = form[k];
      payload[k] = typeof v === 'boolean' ? v : (v === '' ? null : v);
    }
    try {
      if (exists) await api.put('/client/profile', payload);
      else { await api.post('/client/profile', payload); setExists(true); }
      setInitial((p) => ({ ...p, ...Object.fromEntries(keys.map((k) => [k, form[k]])) }));
      toast('Section saved', { accent: 'teal' });
    } catch {
      toast('Save failed', { accent: 'crimson' });
    }
  };

  const saveCoBorrower = async () => {
    const payload: Record<string, unknown> = {};
    Object.keys(cb).forEach((k) => { const v = cb[k]; payload[k] = typeof v === 'boolean' ? v : (v === '' ? null : v); });
    try {
      await api.put('/client/co-borrower', payload);
      setCbInitial(cb);
      toast('Co-borrower saved', { accent: 'teal' });
    } catch {
      toast('Save failed — save your profile first', { accent: 'crimson' });
    }
  };

  // Section key groups.
  const idKeys = ['borrowerType', 'title', 'isFirstHomeBuyer', 'driverLicenceNumber', 'driverLicenceExpiry', 'passportNumber', 'passportExpiry', 'countryOfCitizenship'];
  const addrKeys = ['currentAddressLivingArrangement', 'currentAddressDateMovedIn', 'previousAddress1', 'previousAddress1DateMovedIn', 'previousAddress1LivingArrangement', 'previousAddress2', 'previousAddress2DateMovedIn', 'previousAddress2LivingArrangement'];
  const creditKeys = ['hasDefaultsOrJudgements', 'creditHistoryDetails', 'mothersMaidenName', 'nearestRelativeName', 'nearestRelativeAddress', 'nearestRelativePhone', 'nearestRelativeRelationship'];
  const companyKeys = ['isCompanyTrustBorrower', 'companyName', 'trustName', 'companyAddress', 'acn', 'abn', 'dateOfIncorporation', 'specifiedBeneficiaries'];
  const prefKeys = ['insuranceDetails', 'preferredInterestType', 'wantsOffsetAccount', 'interestedInCarLoans', 'interestedInEquipmentFinance', 'interestedInCommercialFinance', 'interestedInSMSF', 'additionalNotes'];
  const cbKeys = Object.keys(cbInitial).length ? Object.keys(cbInitial) : ['relationshipToBorrower1', 'firstName', 'lastName', 'dateOfBirth', 'mobilePhone', 'email'];

  const dirtyId = useMemo(() => dirtyOf(idKeys, form, initial), [form, initial]);
  const dirtyAddr = useMemo(() => dirtyOf(addrKeys, form, initial), [form, initial]);
  const dirtyCredit = useMemo(() => dirtyOf(creditKeys, form, initial), [form, initial]);
  const dirtyCompany = useMemo(() => dirtyOf(companyKeys, form, initial), [form, initial]);
  const dirtyPref = useMemo(() => dirtyOf(prefKeys, form, initial), [form, initial]);
  const dirtyCb = useMemo(() => JSON.stringify(cb) !== JSON.stringify(cbInitial), [cb, cbInitial]);

  const check = (k: string, label: string) => (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-secondary">
      <input type="checkbox" checked={Boolean(form[k])} onChange={(e) => set(k, e.target.checked)} className="h-4 w-4 rounded text-brand focus:ring-brand" />
      {label}
    </label>
  );

  const EMPLOYMENT_FIELDS: FieldDef[] = [
    { key: 'owner', label: 'Borrower', type: 'select', options: [{ value: 'SELF', label: 'Borrower 1' }, { value: 'PARTNER', label: 'Borrower 2' }] },
    { key: 'employmentType', label: 'Type', type: 'select', options: ['FULL_TIME', 'PART_TIME', 'CASUAL', 'CONTRACT', 'SELF_EMPLOYED', 'RETIRED', 'UNEMPLOYED'].map((v) => ({ value: v, label: v.replace('_', ' ') })) },
    { key: 'employerName', label: 'Employer', type: 'text' },
    { key: 'jobTitle', label: 'Job title', type: 'text' },
    { key: 'employerPhone', label: 'Employer phone', type: 'text' },
    { key: 'abn', label: 'ABN (if self-employed)', type: 'text' },
    { key: 'dateStarted', label: 'Date started', type: 'date' },
    { key: 'dateFinished', label: 'Date finished (blank if current)', type: 'date' },
    { key: 'annualSalaryExSuper', label: 'Annual salary (ex super)', type: 'number' },
    { key: 'isSelfEmployed', label: 'Self-employed', type: 'checkbox' },
    { key: 'includesBonus', label: 'Includes bonus', type: 'checkbox' },
    { key: 'includesCommission', label: 'Includes commission', type: 'checkbox' },
    { key: 'includesOvertime', label: 'Includes overtime', type: 'checkbox' },
  ];
  const BANK_FIELDS: FieldDef[] = [
    { key: 'institution', label: 'Institution', type: 'text' },
    { key: 'accountType', label: 'Type', type: 'select', options: ['SAVINGS', 'TRANSACTION', 'TERM_DEPOSIT', 'OFFSET', 'OTHER'].map((v) => ({ value: v, label: v.replace('_', ' ') })) },
    { key: 'accountNumber', label: 'Account number', type: 'text' },
    { key: 'balance', label: 'Balance ($)', type: 'number' },
    { key: 'accountHolders', label: 'Account holders', type: 'text', full: true },
  ];
  const ASSET_FIELDS: FieldDef[] = [
    { key: 'assetType', label: 'Asset type', type: 'select', options: ['SHARES', 'INVESTMENT_FUNDS', 'SUPERANNUATION', 'HOME_CONTENTS', 'MOTOR_VEHICLE', 'BOAT', 'CARAVAN', 'OTHER'].map((v) => ({ value: v, label: v.replace('_', ' ') })) },
    { key: 'owner', label: 'Owner', type: 'select', options: [{ value: 'Borrower 1', label: 'Borrower 1' }, { value: 'Borrower 2', label: 'Borrower 2' }, { value: 'Joint', label: 'Joint' }] },
    { key: 'description', label: 'Description', type: 'text', full: true },
    { key: 'value', label: 'Value ($)', type: 'number' },
  ];

  const grid = 'grid gap-4 md:grid-cols-3';

  return (
    <div className="space-y-3">
      <Section title="Identity & Citizenship" subtitle="Licence, passport, citizenship" dirty={dirtyId} open={open === 'id'} onToggle={() => setOpen(open === 'id' ? null : 'id')} onSave={() => persist(idKeys)}>
        <div className={grid}>
          <Select label="Borrower Type" options={BORROWER_TYPE_OPTIONS} value={form.borrowerType as string || ''} onChange={(e) => set('borrowerType', e.target.value)} />
          <Select label="Title" options={TITLE_OPTIONS} value={form.title as string || ''} onChange={(e) => set('title', e.target.value)} />
          <Input label="Country of Citizenship" value={form.countryOfCitizenship as string || ''} onChange={(e) => set('countryOfCitizenship', e.target.value)} />
          <Input label="Driver Licence Number" value={form.driverLicenceNumber as string || ''} onChange={(e) => set('driverLicenceNumber', e.target.value)} />
          <Input label="Licence Expiry" type="date" value={form.driverLicenceExpiry as string || ''} onChange={(e) => set('driverLicenceExpiry', e.target.value)} />
          <Input label="Passport Number" value={form.passportNumber as string || ''} onChange={(e) => set('passportNumber', e.target.value)} />
          <Input label="Passport Expiry" type="date" value={form.passportExpiry as string || ''} onChange={(e) => set('passportExpiry', e.target.value)} />
        </div>
        {check('isFirstHomeBuyer', 'First home buyer')}
      </Section>

      <Section title="Address History" subtitle="3-year history" dirty={dirtyAddr} open={open === 'addr'} onToggle={() => setOpen(open === 'addr' ? null : 'addr')} onSave={() => persist(addrKeys)}>
        <div className={grid}>
          <Select label="Current — living arrangement" options={LIVING_OPTIONS} value={form.currentAddressLivingArrangement as string || ''} onChange={(e) => set('currentAddressLivingArrangement', e.target.value)} />
          <Input label="Current — date moved in" type="date" value={form.currentAddressDateMovedIn as string || ''} onChange={(e) => set('currentAddressDateMovedIn', e.target.value)} />
          <div />
          <Input label="Previous address 1" className="md:col-span-2" value={form.previousAddress1 as string || ''} onChange={(e) => set('previousAddress1', e.target.value)} />
          <Input label="Date moved in" type="date" value={form.previousAddress1DateMovedIn as string || ''} onChange={(e) => set('previousAddress1DateMovedIn', e.target.value)} />
          <Select label="Arrangement" options={LIVING_OPTIONS} value={form.previousAddress1LivingArrangement as string || ''} onChange={(e) => set('previousAddress1LivingArrangement', e.target.value)} />
          <Input label="Previous address 2" className="md:col-span-2" value={form.previousAddress2 as string || ''} onChange={(e) => set('previousAddress2', e.target.value)} />
          <Input label="Date moved in" type="date" value={form.previousAddress2DateMovedIn as string || ''} onChange={(e) => set('previousAddress2DateMovedIn', e.target.value)} />
          <Select label="Arrangement" options={LIVING_OPTIONS} value={form.previousAddress2LivingArrangement as string || ''} onChange={(e) => set('previousAddress2LivingArrangement', e.target.value)} />
        </div>
      </Section>

      <Section title="Credit History & Emergency Contact" dirty={dirtyCredit} open={open === 'credit'} onToggle={() => setOpen(open === 'credit' ? null : 'credit')} onSave={() => persist(creditKeys)}>
        {check('hasDefaultsOrJudgements', 'Has defaults, judgements or bankruptcy in the last 5 years')}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-secondary">Credit history details</label>
          <textarea className="glass-input min-h-[70px] w-full rounded-xl border border-white/15 px-3.5 py-2.5 text-sm text-primary focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30" value={form.creditHistoryDetails as string || ''} onChange={(e) => set('creditHistoryDetails', e.target.value)} />
        </div>
        <div className={grid}>
          <Input label="Mother's maiden name" value={form.mothersMaidenName as string || ''} onChange={(e) => set('mothersMaidenName', e.target.value)} />
          <Input label="Nearest relative — name" value={form.nearestRelativeName as string || ''} onChange={(e) => set('nearestRelativeName', e.target.value)} />
          <Input label="Relationship" value={form.nearestRelativeRelationship as string || ''} onChange={(e) => set('nearestRelativeRelationship', e.target.value)} />
          <Input label="Relative — phone" value={form.nearestRelativePhone as string || ''} onChange={(e) => set('nearestRelativePhone', e.target.value)} />
          <Input label="Relative — address" className="md:col-span-2" value={form.nearestRelativeAddress as string || ''} onChange={(e) => set('nearestRelativeAddress', e.target.value)} />
        </div>
      </Section>

      <Section title="Company / Trust" subtitle="If borrowing via an entity" dirty={dirtyCompany} open={open === 'company'} onToggle={() => setOpen(open === 'company' ? null : 'company')} onSave={() => persist(companyKeys)}>
        {check('isCompanyTrustBorrower', 'Borrowing through a company or trust')}
        <div className={grid}>
          <Input label="Company name" value={form.companyName as string || ''} onChange={(e) => set('companyName', e.target.value)} />
          <Input label="Trust name" value={form.trustName as string || ''} onChange={(e) => set('trustName', e.target.value)} />
          <Input label="ACN" value={form.acn as string || ''} onChange={(e) => set('acn', e.target.value)} />
          <Input label="ABN" value={form.abn as string || ''} onChange={(e) => set('abn', e.target.value)} />
          <Input label="Date of incorporation" type="date" value={form.dateOfIncorporation as string || ''} onChange={(e) => set('dateOfIncorporation', e.target.value)} />
          <Input label="Company address" className="md:col-span-3" value={form.companyAddress as string || ''} onChange={(e) => set('companyAddress', e.target.value)} />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-secondary">Specified beneficiaries</label>
          <textarea className="glass-input min-h-[60px] w-full rounded-xl border border-white/15 px-3.5 py-2.5 text-sm text-primary focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30" value={form.specifiedBeneficiaries as string || ''} onChange={(e) => set('specifiedBeneficiaries', e.target.value)} />
        </div>
      </Section>

      <Section title="Insurance & Loan Preferences" dirty={dirtyPref} open={open === 'pref'} onToggle={() => setOpen(open === 'pref' ? null : 'pref')} onSave={() => persist(prefKeys)}>
        <div className="grid gap-4 md:grid-cols-2">
          <Select label="Preferred interest type" options={INTEREST_TYPE_OPTIONS} value={form.preferredInterestType as string || ''} onChange={(e) => set('preferredInterestType', e.target.value)} />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-secondary">Current insurance details</label>
          <textarea className="glass-input min-h-[60px] w-full rounded-xl border border-white/15 px-3.5 py-2.5 text-sm text-primary focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30" value={form.insuranceDetails as string || ''} onChange={(e) => set('insuranceDetails', e.target.value)} />
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {check('wantsOffsetAccount', 'Wants an offset account')}
          {check('interestedInCarLoans', 'Interested in car loans')}
          {check('interestedInEquipmentFinance', 'Interested in equipment finance')}
          {check('interestedInCommercialFinance', 'Interested in commercial finance')}
          {check('interestedInSMSF', 'Interested in SMSF lending')}
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-secondary">Any other relevant information</label>
          <textarea className="glass-input min-h-[60px] w-full rounded-xl border border-white/15 px-3.5 py-2.5 text-sm text-primary focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30" value={form.additionalNotes as string || ''} onChange={(e) => set('additionalNotes', e.target.value)} />
        </div>
      </Section>

      <Section title="Co-Borrower (Borrower 2)" subtitle="Spouse / partner / co-applicant" dirty={dirtyCb} open={open === 'cb'} onToggle={() => setOpen(open === 'cb' ? null : 'cb')} onSave={saveCoBorrower}>
        <div className={grid}>
          <Input label="Relationship to Borrower 1" value={cb.relationshipToBorrower1 as string || ''} onChange={(e) => setCbField('relationshipToBorrower1', e.target.value)} />
          <Select label="Title" options={TITLE_OPTIONS} value={cb.title as string || ''} onChange={(e) => setCbField('title', e.target.value)} />
          <Select label="Borrower type" options={BORROWER_TYPE_OPTIONS} value={cb.borrowerType as string || ''} onChange={(e) => setCbField('borrowerType', e.target.value)} />
          <Input label="First name" value={cb.firstName as string || ''} onChange={(e) => setCbField('firstName', e.target.value)} />
          <Input label="Middle name" value={cb.middleName as string || ''} onChange={(e) => setCbField('middleName', e.target.value)} />
          <Input label="Last name" value={cb.lastName as string || ''} onChange={(e) => setCbField('lastName', e.target.value)} />
          <Input label="Date of birth" type="date" value={cb.dateOfBirth as string || ''} onChange={(e) => setCbField('dateOfBirth', e.target.value)} />
          <Select label="Marital status" options={MARITAL_OPTIONS} value={cb.maritalStatus as string || ''} onChange={(e) => setCbField('maritalStatus', e.target.value)} />
          <Input label="Mobile" value={cb.mobilePhone as string || ''} onChange={(e) => setCbField('mobilePhone', e.target.value)} />
          <Input label="Email" value={cb.email as string || ''} onChange={(e) => setCbField('email', e.target.value)} />
          <Input label="Residential address" className="md:col-span-2" value={cb.currentAddress as string || ''} onChange={(e) => setCbField('currentAddress', e.target.value)} />
          <Input label="Driver licence number" value={cb.driverLicenceNumber as string || ''} onChange={(e) => setCbField('driverLicenceNumber', e.target.value)} />
          <Input label="Passport number" value={cb.passportNumber as string || ''} onChange={(e) => setCbField('passportNumber', e.target.value)} />
          <Input label="Country of citizenship" value={cb.countryOfCitizenship as string || ''} onChange={(e) => setCbField('countryOfCitizenship', e.target.value)} />
          <Select label="Residency status" options={RESIDENCY_OPTIONS} value={cb.residencyStatus as string || ''} onChange={(e) => setCbField('residencyStatus', e.target.value)} />
          <Input label="Visa subclass" value={cb.visaSubclass as string || ''} onChange={(e) => setCbField('visaSubclass', e.target.value)} />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-secondary">
          <input type="checkbox" checked={Boolean(cb.hasDefaultsOrJudgements)} onChange={(e) => setCbField('hasDefaultsOrJudgements', e.target.checked)} className="h-4 w-4 rounded text-brand focus:ring-brand" />
          Has defaults / judgements / bankruptcy (last 5 years)
        </label>
      </Section>

      <Section title="Employment History" subtitle="Current + previous (3-year rule)" open={open === 'emp'} onToggle={() => setOpen(open === 'emp' ? null : 'emp')}>
        <ListEditor
          endpoint="/client/employments" responseKey="employments" fields={EMPLOYMENT_FIELDS}
          newItem={{ owner: 'SELF', sequence: 1, employmentType: 'FULL_TIME' }}
          rowTitle={(r) => (r.employerName as string) || 'New employer'}
          addLabel="Add employment" emptyLabel="No employment history added yet."
        />
      </Section>

      <Section title="Bank Accounts" subtitle="Cash & term deposits" open={open === 'bank'} onToggle={() => setOpen(open === 'bank' ? null : 'bank')}>
        <ListEditor
          endpoint="/client/bank-accounts" responseKey="bankAccounts" fields={BANK_FIELDS}
          newItem={{ accountType: 'SAVINGS' }}
          rowTitle={(r) => (r.institution as string) || 'New account'}
          addLabel="Add account" emptyLabel="No bank accounts added yet."
        />
      </Section>

      <Section title="Other Assets" subtitle="Shares, super, vehicles, etc." open={open === 'assets'} onToggle={() => setOpen(open === 'assets' ? null : 'assets')}>
        <ListEditor
          endpoint="/client/non-property-assets" responseKey="nonPropertyAssets" fields={ASSET_FIELDS}
          newItem={{ assetType: 'SHARES', owner: 'Borrower 1' }}
          rowTitle={(r) => (r.description as string) || (r.assetType as string) || 'New asset'}
          addLabel="Add asset" emptyLabel="No other assets added yet."
        />
      </Section>
    </div>
  );
}

export default AssessmentSections;
