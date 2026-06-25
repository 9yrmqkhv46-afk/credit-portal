'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Alert } from '@/components/ui/Alert';
import { Spinner } from '@/components/ui/Spinner';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import api from '@/lib/api';
import { AxiosError } from 'axios';
import { ClientProfile, ClientProfileInput } from '@/types';
import { recalculateBorrowingCapacity, ServicingCalcResult, money } from '@/lib/servicingUi';

// Section components consolidated from the (now removed) financials page so all
// data entry lives in ONE place — the profile.
import { IncomeEntriesSection } from '@/components/income/IncomeEntriesSection';
import { PropertyPortfolioTable } from '@/components/properties/PropertyPortfolioTable';
import { ExistingHomeLoansTable } from '@/components/loans/ExistingHomeLoansTable';
import { ProposedHomeLoansTable } from '@/components/loans/ProposedHomeLoansTable';
import { OtherLiabilitiesTable } from '@/components/liabilities/OtherLiabilitiesTable';
import { LivingExpensesForm } from '@/components/expenses/LivingExpensesForm';
import { ProfileCentre } from '@/components/profile/ProfileCentre';
import { AssessmentSections } from '@/components/profile/AssessmentSections';

/** Inline SVG section icons (no icon-font / no network). */
const Icon = {
  user: (
    <path d="M12 12a5 5 0 100-10 5 5 0 000 10zm0 2c-5 0-9 2.5-9 6v2h18v-2c0-3.5-4-6-9-6z" />
  ),
  users: (
    <path d="M16 11a4 4 0 10-4-4 4 4 0 004 4zm-8 1a3.5 3.5 0 10-3.5-3.5A3.5 3.5 0 008 12zm0 2c-3 0-6 1.6-6 4v2h8v-2c0-1 .4-1.9 1-2.7A9.6 9.6 0 008 14zm8 0c-3.3 0-7 1.7-7 4.3V20h14v-1.7c0-2.6-3.7-4.3-7-4.3z" />
  ),
  income: (
    <path d="M3 5h18a1 1 0 011 1v12a1 1 0 01-1 1H3a1 1 0 01-1-1V6a1 1 0 011-1zm9 3a4 4 0 100 8 4 4 0 000-8z" />
  ),
  home: (
    <path d="M12 3l9 8h-3v9h-5v-6H11v6H6v-9H3l9-8z" />
  ),
  doc: (
    <path d="M6 2h8l6 6v14a0 0 0 010 0H6a0 0 0 010 0V2zm7 1.5V9h5.5L13 3.5z" />
  ),
  plus: (
    <path d="M11 11V4h2v7h7v2h-7v7h-2v-7H4v-2h7z" />
  ),
  card: (
    <path d="M3 6h18a1 1 0 011 1v10a1 1 0 01-1 1H3a1 1 0 01-1-1V7a1 1 0 011-1zm0 4v2h18v-2H3z" />
  ),
  receipt: (
    <path d="M5 2h14v20l-3-2-3 2-3-2-3 2V2zm3 5h8v2H8V7zm0 4h8v2H8v-2z" />
  ),
  check: (
    <path d="M9 16.2l-3.5-3.5L4 14.2 9 19l11-11-1.5-1.5z" />
  ),
};

function SectionIcon({ path, className = '' }: { path: React.ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      {path}
    </svg>
  );
}

interface StepDef {
  label: string;
  help: string;
  icon: React.ReactNode;
}

const STEPS: StepDef[] = [
  { label: 'Personal Details', help: 'Tell us a little about yourself so we can tailor your assessment.', icon: Icon.user },
  { label: 'Dependants', help: 'Dependants affect your minimum living expenses in the calculation.', icon: Icon.users },
  { label: 'Income', help: 'Add every income stream per applicant. Variable income is shaded automatically.', icon: Icon.income },
  { label: 'Properties', help: 'Manage your portfolio. Tick the items to include in the borrowing calculation, then recalculate.', icon: Icon.home },
  { label: 'Existing Loans', help: 'Existing home loans add monthly commitments when included in servicing.', icon: Icon.doc },
  { label: 'Proposed Loans', help: 'The proposed loan to assess. The first ticked loan is used by the calculator.', icon: Icon.plus },
  { label: 'Other Liabilities', help: 'Credit cards, car / personal loans and other liabilities used in serviceability.', icon: Icon.card },
  { label: 'Living Expenses', help: 'Declared monthly living expenses. A HEM-style floor still applies.', icon: Icon.receipt },
  { label: 'Summary & Notes', help: 'Review, jot a deal summary and recalculate your borrowing capacity.', icon: Icon.check },
];

const RESIDENCY_OPTIONS = [
  { value: 'CITIZEN', label: 'Citizen' },
  { value: 'PERMANENT_RESIDENT', label: 'Permanent Resident' },
  { value: 'TEMPORARY_VISA', label: 'Temporary Visa' },
];

const MARITAL_OPTIONS = [
  { value: 'SINGLE', label: 'Single' },
  { value: 'MARRIED', label: 'Married' },
  { value: 'DE_FACTO', label: 'De Facto' },
  { value: 'DIVORCED', label: 'Divorced' },
  { value: 'WIDOWED', label: 'Widowed' },
];

const EMPLOYMENT_OPTIONS = [
  { value: 'FULL_TIME', label: 'Full Time' },
  { value: 'PART_TIME', label: 'Part Time' },
  { value: 'CASUAL', label: 'Casual' },
  { value: 'SELF_EMPLOYED', label: 'Self Employed' },
  { value: 'UNEMPLOYED', label: 'Unemployed' },
  { value: 'RETIRED', label: 'Retired' },
];

const NOTES_STORAGE_KEY = 'transformbiz.dealSummaryNotes';

/** Pull the most specific human-readable message out of an Axios error. */
function extractApiError(err: unknown, fallback: string): string {
  const ax = err as AxiosError<{ error?: string; details?: { message: string }[] }>;
  return ax.response?.data?.details?.[0]?.message || ax.response?.data?.error || fallback;
}

/** Animated numbered step indicator with a connecting line that fills smoothly. */
function StepProgress({
  steps, current, onSelect,
}: { steps: StepDef[]; current: number; onSelect: (i: number) => void }) {
  return (
    <nav aria-label="Profile progress" className="overflow-x-auto">
      <ol className="flex min-w-max items-center gap-0 sm:min-w-0">
        {steps.map((s, i) => {
          const isComplete = i < current;
          const isCurrent = i === current;
          return (
            <li key={s.label} className="flex flex-1 items-center">
              <button
                type="button"
                onClick={() => onSelect(i)}
                className="group flex flex-col items-center gap-1.5 px-2 focus:outline-none"
                aria-current={isCurrent ? 'step' : undefined}
              >
                <span
                  className={[
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold transition-all duration-300',
                    isCurrent
                      ? 'border-brand bg-brand text-white shadow-md shadow-brand/30 scale-110'
                      : isComplete
                        ? 'border-brand bg-brand-light text-brand'
                        : 'border-slate-300 bg-white text-faint group-hover:border-slate-400',
                  ].join(' ')}
                >
                  {isComplete ? (
                    <svg className="h-5 w-5 animate-pop" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0L3.3 9.7a1 1 0 011.4-1.4l3.3 3.29 6.8-6.8a1 1 0 011.4 0z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <span className="flex h-5 w-5 items-center justify-center">
                      <SectionIcon path={s.icon} className="h-4 w-4" />
                    </span>
                  )}
                </span>
                <span
                  className={[
                    'hidden text-xs font-medium transition-colors sm:block',
                    isCurrent ? 'text-brand' : isComplete ? 'text-secondary' : 'text-faint',
                  ].join(' ')}
                >
                  {s.label}
                </span>
              </button>
              {i < steps.length - 1 && (
                <span className="relative h-0.5 flex-1 overflow-hidden rounded-full bg-white/10">
                  <span
                    className="bar-fill absolute inset-y-0 left-0 rounded-full bg-brand"
                    style={{ width: i < current ? '100%' : '0%' }}
                  />
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export default function ProfilePage() {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [profileData, setProfileData] = useState<ClientProfileInput>({
    phone: '', address: '', dateOfBirth: '',
    residencyStatus: 'CITIZEN', numberOfAdultDependants: 0,
    numberOfChildDependants: 0, privateSchoolingFlag: false,
    maritalStatus: 'SINGLE', employmentStatus: 'FULL_TIME',
  });
  const [profileExists, setProfileExists] = useState(false);

  // Deal summary / notes (client-side only, persisted to localStorage).
  const [notes, setNotes] = useState('');
  // Summary recalculation result.
  const [recalc, setRecalc] = useState<ServicingCalcResult | null>(null);
  const [recalcing, setRecalcing] = useState(false);

  const fetchProfile = useCallback(async () => {
    try {
      const res = await api.get('/client/profile');
      if (res.data?.profile) {
        const p = res.data.profile as ClientProfile;
        setProfileData({
          phone: p.phone || '', address: p.address || '',
          dateOfBirth: p.dateOfBirth ? p.dateOfBirth.split('T')[0] : '',
          residencyStatus: p.residencyStatus, numberOfAdultDependants: p.numberOfAdultDependants,
          numberOfChildDependants: p.numberOfChildDependants,
          privateSchoolingFlag: p.privateSchoolingFlag,
          maritalStatus: p.maritalStatus, employmentStatus: p.employmentStatus,
        });
        setProfileExists(true);
      }
    } catch { /* profile doesn't exist yet */ }
  }, []);

  useEffect(() => {
    const loadAll = async () => {
      await fetchProfile();
      try {
        const stored = typeof window !== 'undefined' ? window.localStorage.getItem(NOTES_STORAGE_KEY) : null;
        if (stored) setNotes(stored);
      } catch { /* ignore storage errors */ }
      setLoading(false);
    };
    loadAll();
  }, [fetchProfile]);

  // Clear transient banners when changing steps.
  useEffect(() => { setError(''); setSuccess(''); }, [step]);

  const savePersonalDetails = async () => {
    setSaving(true); setError(''); setSuccess('');
    try {
      if (profileExists) {
        await api.put('/client/profile', profileData);
      } else {
        await api.post('/client/profile', profileData);
        setProfileExists(true);
      }
      setSuccess('Personal details saved successfully.');
    } catch (err) { setError(extractApiError(err, 'Failed to save personal details.')); }
    finally { setSaving(false); }
  };

  const saveDependants = async () => {
    setSaving(true); setError(''); setSuccess('');
    try {
      await api.put('/client/profile', {
        numberOfAdultDependants: profileData.numberOfAdultDependants,
        numberOfChildDependants: profileData.numberOfChildDependants,
        privateSchoolingFlag: profileData.privateSchoolingFlag,
      });
      setSuccess('Dependants saved successfully.');
    } catch (err) { setError(extractApiError(err, 'Failed to save dependant information.')); }
    finally { setSaving(false); }
  };

  const saveNotes = (value: string) => {
    setNotes(value);
    try { window.localStorage.setItem(NOTES_STORAGE_KEY, value); } catch { /* ignore */ }
  };

  const handleRecalc = async () => {
    setRecalcing(true); setError('');
    try {
      setRecalc(await recalculateBorrowingCapacity());
    } catch (err) { setError(extractApiError(err, 'Unable to recalculate borrowing capacity.')); }
    finally { setRecalcing(false); }
  };

  const handleNext = async () => {
    if (step === 0) await savePersonalDetails();
    else if (step === 1) await saveDependants();
    if (step < STEPS.length - 1) setStep(step + 1);
  };

  // Steps 0 & 1 are profile forms that save here; the rest are self-saving
  // section components, so the primary button is a plain navigation control.
  const isProfileFormStep = step === 0 || step === 1;
  const isLastStep = step === STEPS.length - 1;

  if (loading) return <Spinner size="lg" className="py-20" />;

  return (
    <div className="space-y-6">
      <div className="animate-enter">
        <h1 className="text-2xl font-bold text-primary">Financial Profile</h1>
        <p className="mt-1 text-secondary">
          Everything we need for your borrowing assessment lives here — personal details, income,
          properties, loans, liabilities and expenses, all in one place.
        </p>
        <p className="mt-1 text-sm text-muted">
          Tick the items to include in the borrowing calculation as you go.
        </p>
      </div>

      {/* Profile Centre — collapsible sections (Mandate 4A) */}
      <div className="animate-enter" style={{ animationDelay: '30ms' }}>
        <h2 className="mb-3 font-display text-lg font-semibold text-primary">Profile Centre</h2>
        <ProfileCentre />
      </div>

      <div className="animate-enter mt-6" style={{ animationDelay: '60ms' }}>
        <h2 className="mb-1 font-display text-lg font-semibold text-primary">Detailed Assessment</h2>
        <p className="mb-3 text-sm text-muted">Identity, address history, credit history, co-borrower, employment, and assets — as required on the full home-loan assessment.</p>
        <AssessmentSections />
      </div>

      <div className="animate-enter" style={{ animationDelay: '50ms' }}>
        <h2 className="font-display text-lg font-semibold text-primary">Servicing Assessment</h2>
        <p className="mt-1 text-sm text-muted">Income, properties, loans, liabilities and expenses for your borrowing calculation.</p>
      </div>

      {/* Step progress indicator */}
      <Card className="animate-enter py-5" style={{ animationDelay: '60ms' }}>
        <StepProgress steps={STEPS} current={step} onSelect={setStep} />
      </Card>

      {error && <Alert variant="error">{error}</Alert>}
      {success && <Alert variant="success">{success}</Alert>}

      {/* Step Content — re-keyed so it re-animates on each step change. */}
      <Card key={step} className="animate-enter">
        <div className="mb-5 flex items-start gap-3 border-b border-white/10 pb-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-light text-brand">
            <SectionIcon path={STEPS[step].icon} className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand">Step {step + 1} of {STEPS.length}</p>
            <h3 className="mt-0.5 text-lg font-semibold text-primary">{STEPS[step].label}</h3>
            <p className="mt-1 text-sm text-muted">{STEPS[step].help}</p>
          </div>
        </div>

        {step === 0 && (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Input label="Phone" type="tel" value={profileData.phone || ''} onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })} />
              <Input label="Date of Birth" type="date" value={profileData.dateOfBirth || ''} onChange={(e) => setProfileData({ ...profileData, dateOfBirth: e.target.value })} />
              <Input label="Address" value={profileData.address || ''} onChange={(e) => setProfileData({ ...profileData, address: e.target.value })} className="md:col-span-2" />
              <Select label="Residency Status" options={RESIDENCY_OPTIONS} value={profileData.residencyStatus} onChange={(e) => setProfileData({ ...profileData, residencyStatus: e.target.value as ClientProfileInput['residencyStatus'] })} />
              <Select label="Marital Status" options={MARITAL_OPTIONS} value={profileData.maritalStatus} onChange={(e) => setProfileData({ ...profileData, maritalStatus: e.target.value as ClientProfileInput['maritalStatus'] })} />
              <Select label="Employment Status" options={EMPLOYMENT_OPTIONS} value={profileData.employmentStatus} onChange={(e) => setProfileData({ ...profileData, employmentStatus: e.target.value as ClientProfileInput['employmentStatus'] })} />
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Input label="Number of Adult Dependants" type="number" min="0" value={String(profileData.numberOfAdultDependants)} onChange={(e) => setProfileData({ ...profileData, numberOfAdultDependants: parseInt(e.target.value) || 0 })} />
              <Input label="Number of Child Dependants" type="number" min="0" value={String(profileData.numberOfChildDependants)} onChange={(e) => setProfileData({ ...profileData, numberOfChildDependants: parseInt(e.target.value) || 0 })} />
            </div>
            <label className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" checked={profileData.privateSchoolingFlag} onChange={(e) => setProfileData({ ...profileData, privateSchoolingFlag: e.target.checked })} className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand" />
              <span className="text-sm text-secondary">Private schooling</span>
            </label>
          </div>
        )}

        {step === 2 && <IncomeEntriesSection />}
        {step === 3 && <PropertyPortfolioTable />}
        {step === 4 && <ExistingHomeLoansTable />}
        {step === 5 && <ProposedHomeLoansTable />}
        {step === 6 && <OtherLiabilitiesTable />}
        {step === 7 && <LivingExpensesForm />}

        {step === 8 && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-brand/15 bg-gradient-to-br from-brand-light/70 to-accent-light/50 p-5">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-brand">Estimated max borrowing capacity</p>
                  <p className="mt-1 text-4xl font-bold text-primary">
                    {recalc
                      ? <AnimatedNumber value={recalc.maxBorrowingCapacity} prefix="$" />
                      : <span className="text-faint">$0</span>}
                  </p>
                  {recalc && (
                    <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-secondary">
                      <span>Monthly surplus: {money(recalc.netMonthlySurplus)}</span>
                      <span>Monthly commitments: {money(recalc.monthlyCommitments)}</span>
                      <span>DTI: {recalc.dtiRatio.toFixed(2)}x</span>
                    </div>
                  )}
                </div>
                <Button onClick={handleRecalc} loading={recalcing}>Recalculate borrowing capacity</Button>
              </div>
              <p className="mt-3 text-xs text-muted">Indicative estimate only - not a credit decision.</p>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-secondary">Deal summary / notes</label>
              <textarea
                className="glass-input min-h-[120px] w-full resize-y rounded-xl border border-white/15 px-3.5 py-2.5 text-sm text-primary shadow-sm transition-shadow focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
                placeholder="Notes about this deal, goals, or anything your broker should know…"
                value={notes}
                onChange={(e) => saveNotes(e.target.value)}
              />
              <p className="mt-1 text-xs text-muted">Saved to this device automatically.</p>
            </div>
          </div>
        )}
      </Card>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="secondary" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>
          Previous
        </Button>
        {!isLastStep ? (
          <Button onClick={handleNext} loading={saving}>
            {isProfileFormStep ? 'Save & Next' : 'Next'}
          </Button>
        ) : (
          <Button onClick={handleRecalc} loading={recalcing}>
            Recalculate borrowing capacity
          </Button>
        )}
      </div>
    </div>
  );
}
