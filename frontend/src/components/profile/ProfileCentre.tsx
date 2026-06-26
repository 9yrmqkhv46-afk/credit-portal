'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import api from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { uploadAttachment, downloadAttachment, formatBytes } from '@/lib/attachments';

/**
 * Profile Centre (Mandate 4A). Collapsible sections with per-section dirty
 * tracking and a spring-in "Save Changes" button that morphs to a check on
 * save. Fully implements Personal Information, Employment & Income, and the
 * Document Checklist (persisted to the extended ClientProfile columns).
 * Assets / Liabilities / Loan Preferences reuse the existing wizard sections
 * on this page (documented deferral for repeatable Asset rows).
 */

type Form = Record<string, string | boolean>;

interface DocItem {
  label: string;
  provided: boolean;
  attachmentId?: string | null;
  filename?: string | null;
  sizeBytes?: number | null;
  status?: string | null;
}

const GENDER_OPTIONS = [
  { value: '', label: 'Prefer not to say' },
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'NON_BINARY', label: 'Non-binary' },
  { value: 'OTHER', label: 'Other' },
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

const DEFAULT_DOCS = [
  'Photo ID (Driver Licence / Passport)',
  'Last 2 payslips',
  'Most recent bank statement',
  'Notice of Assessment / tax return',
  'Proof of deposit / savings',
  'Contract of Sale (if purchasing)',
];

interface SectionProps {
  title: string;
  subtitle?: string;
  dirty: boolean;
  saved: boolean;
  open: boolean;
  onToggle: () => void;
  onSave: () => void;
  children: React.ReactNode;
}

function Section({ title, subtitle, dirty, saved, open, onToggle, onSave, children }: SectionProps) {
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
            <div className="flex justify-end">
              {(dirty || saved) && (
                <button
                  type="button"
                  onClick={onSave}
                  disabled={!dirty}
                  className={`animate-pop inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${saved ? 'bg-success-light text-success ring-1 ring-success/40' : 'bg-gradient-to-br from-brand to-brand-dark text-on-accent shadow-lg shadow-brand/25 hover:brightness-110'}`}
                >
                  {saved ? (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true"><path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      Saved
                    </>
                  ) : 'Save Changes'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProfileCentre() {
  const { toast } = useToast();
  const [exists, setExists] = useState(false);
  const [open, setOpen] = useState<string | null>('personal');
  const [savedFlags, setSavedFlags] = useState<Record<string, boolean>>({});

  const [form, setForm] = useState<Form>({
    legalFirstName: '', legalMiddleName: '', legalLastName: '', preferredName: '',
    dateOfBirth: '', gender: '', maritalStatus: 'SINGLE', residencyStatus: 'CITIZEN', visaSubclass: '',
    mobile: '', address: '', mailingAddress: '', sameAsResidential: false,
    employmentStatus: 'FULL_TIME', employerName: '', jobTitle: '', employmentStartDate: '', annualIncome: '',
  });
  const [initial, setInitial] = useState<Form>(form);
  const [docs, setDocs] = useState<DocItem[]>(DEFAULT_DOCS.map((label) => ({ label, provided: false })));
  const [initialDocs, setInitialDocs] = useState<DocItem[]>(docs);

  // Spouse / partner (Co-Borrower / Borrower 2) — shown when married / de facto.
  const SPOUSE_BLANK: Form = {
    relationshipToBorrower1: 'Spouse', borrowerType: 'Applicant', title: '', firstName: '', middleName: '', lastName: '',
    dateOfBirth: '', mobilePhone: '', email: '', currentAddress: '',
    driverLicenceNumber: '', passportNumber: '', countryOfCitizenship: '', residencyStatus: '',
  };
  const [cb, setCb] = useState<Form>(SPOUSE_BLANK);
  const [cbInitial, setCbInitial] = useState<Form>(SPOUSE_BLANK);
  const setC = (k: string, v: string | boolean) => setCb((f) => ({ ...f, [k]: v }));
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const docFileRef = useRef<HTMLInputElement>(null);
  const pendingUploadIdx = useRef<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/client/profile');
        const p = res.data?.profile;
        if (p) {
          setExists(true);
          const next: Form = {
            legalFirstName: p.legalFirstName || '', legalMiddleName: p.legalMiddleName || '', legalLastName: p.legalLastName || '',
            preferredName: p.preferredName || '', dateOfBirth: p.dateOfBirth ? p.dateOfBirth.split('T')[0] : '',
            gender: p.gender || '', maritalStatus: p.maritalStatus || 'SINGLE', residencyStatus: p.residencyStatus || 'CITIZEN',
            visaSubclass: p.visaSubclass || '', mobile: p.mobile || '', address: p.address || '', mailingAddress: p.mailingAddress || '',
            sameAsResidential: !!p.sameAsResidential, employmentStatus: p.employmentStatus || 'FULL_TIME',
            employerName: p.employerName || '', jobTitle: p.jobTitle || '', employmentStartDate: p.employmentStartDate ? p.employmentStartDate.split('T')[0] : '',
            annualIncome: p.annualIncome != null ? String(p.annualIncome) : '',
          };
          setForm(next);
          setInitial(next);
          if (p.documentChecklist) {
            try {
              const parsed = JSON.parse(p.documentChecklist);
              if (Array.isArray(parsed) && parsed.length) { setDocs(parsed); setInitialDocs(parsed); }
            } catch { /* ignore */ }
          }
        }
        // Merge live attachment status (e.g. admin-marked "Verified") so the
        // checklist reflects persisted server state on reload.
        try {
          const aRes = await api.get('/attachments');
          const list = (aRes.data?.attachments || []) as { id: string; status?: string; filename?: string; sizeBytes?: number }[];
          const byId = new Map(list.map((a) => [a.id, a]));
          setDocs((prev) => {
            const merged = prev.map((d) => (d.attachmentId && byId.has(d.attachmentId)
              ? { ...d, status: byId.get(d.attachmentId)!.status ?? d.status, filename: byId.get(d.attachmentId)!.filename ?? d.filename, sizeBytes: byId.get(d.attachmentId)!.sizeBytes ?? d.sizeBytes }
              : d));
            setInitialDocs(merged);
            return merged;
          });
        } catch { /* attachments are optional */ }
      } catch { /* no profile yet */ }
      try {
        const cRes = await api.get('/client/co-borrower');
        const c = cRes.data?.coBorrower;
        if (c) {
          const next: Form = {
            relationshipToBorrower1: c.relationshipToBorrower1 || 'Spouse', borrowerType: c.borrowerType || 'Applicant',
            title: c.title || '', firstName: c.firstName || '', middleName: c.middleName || '', lastName: c.lastName || '',
            dateOfBirth: c.dateOfBirth ? c.dateOfBirth.split('T')[0] : '', mobilePhone: c.mobilePhone || '', email: c.email || '',
            currentAddress: c.currentAddress || '', driverLicenceNumber: c.driverLicenceNumber || '', passportNumber: c.passportNumber || '',
            countryOfCitizenship: c.countryOfCitizenship || '', residencyStatus: c.residencyStatus || '',
          };
          setCb(next); setCbInitial(next);
        }
      } catch { /* none */ }
    })();
  }, []);

  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const sectionKeys: Record<string, string[]> = {
    personal: ['legalFirstName', 'legalMiddleName', 'legalLastName', 'preferredName', 'dateOfBirth', 'gender', 'maritalStatus', 'residencyStatus', 'visaSubclass', 'mobile', 'address', 'mailingAddress', 'sameAsResidential'],
    employment: ['employmentStatus', 'employerName', 'jobTitle', 'employmentStartDate', 'annualIncome'],
  };

  const isPartnered = form.maritalStatus === 'MARRIED' || form.maritalStatus === 'DE_FACTO';
  const dirtyPersonal = useMemo(
    () => sectionKeys.personal.some((k) => form[k] !== initial[k]) || (isPartnered && JSON.stringify(cb) !== JSON.stringify(cbInitial)),
    [form, initial, isPartnered, cb, cbInitial]
  );
  const dirtyEmployment = useMemo(() => sectionKeys.employment.some((k) => form[k] !== initial[k]), [form, initial]);
  const dirtyDocs = useMemo(() => JSON.stringify(docs) !== JSON.stringify(initialDocs), [docs, initialDocs]);

  const flashSaved = (key: string) => {
    setSavedFlags((s) => ({ ...s, [key]: true }));
    window.setTimeout(() => setSavedFlags((s) => ({ ...s, [key]: false })), 1600);
  };

  const persist = async (payload: Record<string, unknown>, key: string) => {
    try {
      if (exists) {
        await api.put('/client/profile', payload);
      } else {
        await api.post('/client/profile', payload);
        setExists(true);
      }
      flashSaved(key);
      toast('Section saved', { accent: 'teal' });
      return true;
    } catch {
      toast('Save failed — check required fields', { accent: 'crimson' });
      return false;
    }
  };

  const savePersonal = async () => {
    const payload = {
      legalFirstName: form.legalFirstName || null, legalMiddleName: form.legalMiddleName || null,
      legalLastName: form.legalLastName || null, preferredName: form.preferredName || null,
      dateOfBirth: form.dateOfBirth || null, gender: (form.gender as string) || null,
      maritalStatus: form.maritalStatus, residencyStatus: form.residencyStatus,
      visaSubclass: form.residencyStatus === 'TEMPORARY_VISA' ? (form.visaSubclass || null) : null,
      mobile: form.mobile || null, address: (form.address as string) || undefined,
      mailingAddress: form.sameAsResidential ? null : (form.mailingAddress || null),
      sameAsResidential: form.sameAsResidential,
    };
    if (await persist(payload, 'personal')) {
      setInitial((p) => ({ ...p, ...Object.fromEntries(sectionKeys.personal.map((k) => [k, form[k]])) }));
      if (isPartnered) {
        const cbPayload: Record<string, unknown> = {};
        Object.keys(cb).forEach((k) => { const v = cb[k]; cbPayload[k] = typeof v === 'boolean' ? v : (v === '' ? null : v); });
        try { await api.put('/client/co-borrower', cbPayload); setCbInitial(cb); }
        catch { toast('Spouse details could not be saved', { accent: 'crimson' }); }
      }
    }
  };

  const saveEmployment = async () => {
    const payload = {
      employmentStatus: form.employmentStatus, employerName: form.employerName || null,
      jobTitle: form.jobTitle || null, employmentStartDate: form.employmentStartDate || null,
      annualIncome: form.annualIncome ? Number(form.annualIncome) : null,
    };
    if (await persist(payload, 'employment')) setInitial((p) => ({ ...p, ...Object.fromEntries(sectionKeys.employment.map((k) => [k, form[k]])) }));
  };

  const saveDocs = async () => {
    if (await persist({ documentChecklist: JSON.stringify(docs) }, 'docs')) setInitialDocs(docs);
  };

  // Open the OS file picker for a specific checklist row.
  const triggerUpload = (idx: number) => {
    pendingUploadIdx.current = idx;
    docFileRef.current?.click();
  };

  const onDocFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const idx = pendingUploadIdx.current;
    e.target.value = '';
    pendingUploadIdx.current = null;
    if (!file || idx == null) return;
    setUploadingIdx(idx);
    try {
      const att = await uploadAttachment(file, { profileDocumentKey: docs[idx].label });
      const nextDocs = docs.map((d, j) => (j === idx
        ? { ...d, provided: true, attachmentId: att.id, filename: att.filename, sizeBytes: att.sizeBytes, status: att.status || 'Uploaded' }
        : d));
      setDocs(nextDocs);
      // Persist immediately so the uploaded state survives a reload.
      if (await persist({ documentChecklist: JSON.stringify(nextDocs) }, 'docs')) setInitialDocs(nextDocs);
    } catch {
      toast('Upload failed (max 5MB)', { accent: 'crimson' });
    } finally {
      setUploadingIdx(null);
    }
  };

  const handleDocDownload = async (d: DocItem) => {
    if (!d.attachmentId) return;
    try {
      await downloadAttachment(d.attachmentId, d.filename || d.label);
    } catch {
      toast('Download failed', { accent: 'crimson' });
    }
  };

  return (
    <div className="space-y-3">
      <Section title="Personal Information" subtitle="Legal name, contact & residency" dirty={dirtyPersonal} saved={!!savedFlags.personal} open={open === 'personal'} onToggle={() => setOpen(open === 'personal' ? null : 'personal')} onSave={savePersonal}>
        <div className="grid gap-4 md:grid-cols-3">
          <Input label="Legal First Name" value={form.legalFirstName as string} onChange={(e) => set('legalFirstName', e.target.value)} />
          <Input label="Middle Name" value={form.legalMiddleName as string} onChange={(e) => set('legalMiddleName', e.target.value)} />
          <Input label="Legal Last Name" value={form.legalLastName as string} onChange={(e) => set('legalLastName', e.target.value)} />
          <Input label="Preferred Name" value={form.preferredName as string} onChange={(e) => set('preferredName', e.target.value)} />
          <Input label="Date of Birth" type="date" value={form.dateOfBirth as string} onChange={(e) => set('dateOfBirth', e.target.value)} />
          <Select label="Gender" options={GENDER_OPTIONS} value={form.gender as string} onChange={(e) => set('gender', e.target.value)} />
          <Select label="Marital Status" options={MARITAL_OPTIONS} value={form.maritalStatus as string} onChange={(e) => set('maritalStatus', e.target.value)} />
          <Select label="Residency Status" options={RESIDENCY_OPTIONS} value={form.residencyStatus as string} onChange={(e) => set('residencyStatus', e.target.value)} />
          {form.residencyStatus === 'TEMPORARY_VISA' && (
            <Input label="Visa Subclass" value={form.visaSubclass as string} onChange={(e) => set('visaSubclass', e.target.value)} />
          )}
          <Input label="Mobile" type="tel" placeholder="+61 4XX XXX XXX" value={form.mobile as string} onChange={(e) => set('mobile', e.target.value)} />
          <Input label="Residential Address" className="md:col-span-3" value={form.address as string} onChange={(e) => set('address', e.target.value)} />
        </div>
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" checked={form.sameAsResidential as boolean} onChange={(e) => set('sameAsResidential', e.target.checked)} className="h-4 w-4 rounded text-brand focus:ring-brand" />
          <span className="text-sm text-secondary">Mailing address same as residential</span>
        </label>
        {!form.sameAsResidential && (
          <Input label="Mailing Address" value={form.mailingAddress as string} onChange={(e) => set('mailingAddress', e.target.value)} />
        )}

        {/* Spouse / partner pops down when married or de facto. */}
        {isPartnered && (
          <div className="animate-enter mt-2 rounded-2xl border border-brand/25 bg-brand-light/40 p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand/20 text-brand">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16 11a4 4 0 10-4-4 4 4 0 004 4zm-8 1a3.5 3.5 0 10-3.5-3.5A3.5 3.5 0 008 12zm0 2c-3 0-6 1.6-6 4v2h8v-2c0-1 .4-1.9 1-2.7A9.6 9.6 0 008 14zm8 0c-3.3 0-7 1.7-7 4.3V20h14v-1.7c0-2.6-3.7-4.3-7-4.3z" /></svg>
              </span>
              <div>
                <p className="text-sm font-semibold text-primary">Spouse / Partner Details (Borrower 2)</p>
                <p className="text-xs text-muted">Saved with your personal information.</p>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <Select label="Relationship" options={[{ value: 'Spouse', label: 'Spouse' }, { value: 'De Facto', label: 'De Facto' }, { value: 'Partner', label: 'Partner' }]} value={cb.relationshipToBorrower1 as string} onChange={(e) => setC('relationshipToBorrower1', e.target.value)} />
              <Select label="Title" options={[{ value: '', label: '—' }, { value: 'Mr', label: 'Mr' }, { value: 'Mrs', label: 'Mrs' }, { value: 'Ms', label: 'Ms' }, { value: 'Miss', label: 'Miss' }, { value: 'Dr', label: 'Dr' }]} value={cb.title as string} onChange={(e) => setC('title', e.target.value)} />
              <Select label="Borrower Type" options={[{ value: 'Applicant', label: 'Applicant' }, { value: 'Guarantor', label: 'Guarantor' }]} value={cb.borrowerType as string} onChange={(e) => setC('borrowerType', e.target.value)} />
              <Input label="First Name" value={cb.firstName as string} onChange={(e) => setC('firstName', e.target.value)} />
              <Input label="Middle Name" value={cb.middleName as string} onChange={(e) => setC('middleName', e.target.value)} />
              <Input label="Last Name" value={cb.lastName as string} onChange={(e) => setC('lastName', e.target.value)} />
              <Input label="Date of Birth" type="date" value={cb.dateOfBirth as string} onChange={(e) => setC('dateOfBirth', e.target.value)} />
              <Input label="Mobile" type="tel" placeholder="+61 4XX XXX XXX" value={cb.mobilePhone as string} onChange={(e) => setC('mobilePhone', e.target.value)} />
              <Input label="Email" type="email" value={cb.email as string} onChange={(e) => setC('email', e.target.value)} />
              <Select label="Residency Status" options={RESIDENCY_OPTIONS} value={cb.residencyStatus as string} onChange={(e) => setC('residencyStatus', e.target.value)} />
              <Input label="Country of Citizenship" value={cb.countryOfCitizenship as string} onChange={(e) => setC('countryOfCitizenship', e.target.value)} />
              <Input label="Residential Address" className="md:col-span-3" value={cb.currentAddress as string} onChange={(e) => setC('currentAddress', e.target.value)} />
              <Input label="Driver Licence Number" value={cb.driverLicenceNumber as string} onChange={(e) => setC('driverLicenceNumber', e.target.value)} />
              <Input label="Passport Number" value={cb.passportNumber as string} onChange={(e) => setC('passportNumber', e.target.value)} />
            </div>
            <p className="mt-2 text-xs text-muted">Further co-borrower details (address history, credit history, employment, assets) are in the Detailed Assessment below.</p>
          </div>
        )}
      </Section>

      <Section title="Employment & Income" subtitle="Your current role" dirty={dirtyEmployment} saved={!!savedFlags.employment} open={open === 'employment'} onToggle={() => setOpen(open === 'employment' ? null : 'employment')} onSave={saveEmployment}>
        <div className="grid gap-4 md:grid-cols-2">
          <Select label="Employment Status" options={EMPLOYMENT_OPTIONS} value={form.employmentStatus as string} onChange={(e) => set('employmentStatus', e.target.value)} />
          <Input label="Employer Name" value={form.employerName as string} onChange={(e) => set('employerName', e.target.value)} />
          <Input label="Job Title" value={form.jobTitle as string} onChange={(e) => set('jobTitle', e.target.value)} />
          <Input label="Employment Start Date" type="date" value={form.employmentStartDate as string} onChange={(e) => set('employmentStartDate', e.target.value)} />
          <Input label="Gross Annual Income ($)" type="number" value={form.annualIncome as string} onChange={(e) => set('annualIncome', e.target.value)} />
        </div>
      </Section>

      <Section title="Document Checklist" subtitle={`${docs.filter((d) => d.provided).length}/${docs.length} provided`} dirty={dirtyDocs} saved={!!savedFlags.docs} open={open === 'docs'} onToggle={() => setOpen(open === 'docs' ? null : 'docs')} onSave={saveDocs}>
        <input ref={docFileRef} type="file" className="hidden" onChange={onDocFileChange} aria-hidden="true" />
        <ul className="space-y-2">
          {docs.map((d, i) => (
            <li key={i} className="rounded-xl bg-white/4 px-3 py-2 ring-1 ring-white/8">
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex flex-1 cursor-pointer items-center gap-3">
                  <input type="checkbox" checked={d.provided} onChange={(e) => setDocs((prev) => prev.map((x, j) => (j === i ? { ...x, provided: e.target.checked } : x)))} className="h-4 w-4 rounded text-brand focus:ring-brand" />
                  <span className={`text-sm ${d.provided ? 'text-primary' : 'text-secondary'}`}>{d.label}</span>
                </label>
                {d.status === 'Verified' && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-success-light px-2 py-0.5 text-[11px] font-semibold text-success ring-1 ring-success/40">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true"><path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    Verified
                  </span>
                )}
                {d.attachmentId && d.status !== 'Verified' && (
                  <span className="rounded-full bg-brand-light px-2 py-0.5 text-[11px] font-semibold text-brand ring-1 ring-brand/40">Uploaded</span>
                )}
                <button
                  type="button"
                  onClick={() => triggerUpload(i)}
                  disabled={uploadingIdx === i}
                  className="rounded-lg px-2.5 py-1 text-xs font-semibold text-brand ring-1 ring-brand/40 hover:bg-brand-light disabled:opacity-50"
                >
                  {uploadingIdx === i ? 'Uploading…' : d.attachmentId ? 'Replace' : 'Upload'}
                </button>
              </div>
              {d.attachmentId && (
                <div className="mt-1.5 flex items-center gap-2 pl-7 text-xs text-muted">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="shrink-0 text-brand"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" strokeLinecap="round" strokeLinejoin="round" /><path d="M14 2v6h6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  <span className="truncate text-secondary">{d.filename}</span>
                  {d.sizeBytes != null && <span className="tnum">· {formatBytes(d.sizeBytes)}</span>}
                  <button type="button" onClick={() => handleDocDownload(d)} className="font-semibold text-brand hover:underline">Download</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

export default ProfileCentre;
