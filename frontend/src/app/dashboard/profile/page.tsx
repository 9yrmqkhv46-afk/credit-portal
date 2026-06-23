'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Alert } from '@/components/ui/Alert';
import { Spinner } from '@/components/ui/Spinner';
import api from '@/lib/api';
import {
  ClientProfile, ClientProfileInput, IncomeSource, IncomeSourceInput,
  ExistingDebt, ExistingDebtInput, Property, PropertyInput,
  ExpenseSummary, ExpenseSummaryInput, Frequency
} from '@/types';

const STEPS = ['Personal Details', 'Dependants', 'Income Sources', 'Existing Debts', 'Properties', 'Expenses'];

const FREQUENCY_OPTIONS = [
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'FORTNIGHTLY', label: 'Fortnightly' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'ANNUAL', label: 'Annual' },
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

const INCOME_TYPE_OPTIONS = [
  { value: 'SALARY', label: 'Salary' },
  { value: 'BONUS', label: 'Bonus' },
  { value: 'COMMISSION', label: 'Commission' },
  { value: 'RENTAL', label: 'Rental' },
  { value: 'INVESTMENT', label: 'Investment' },
  { value: 'GOVERNMENT', label: 'Government' },
  { value: 'OTHER', label: 'Other' },
];

const OWNER_OPTIONS = [
  { value: 'SELF', label: 'Self' },
  { value: 'PARTNER', label: 'Partner' },
];

const DEBT_TYPE_OPTIONS = [
  { value: 'HOME_LOAN', label: 'Home Loan' },
  { value: 'PERSONAL_LOAN', label: 'Personal Loan' },
  { value: 'CAR_LOAN', label: 'Car Loan' },
  { value: 'CREDIT_CARD', label: 'Credit Card' },
  { value: 'HECS', label: 'HECS' },
  { value: 'OTHER', label: 'Other' },
];

const PROPERTY_TYPE_OPTIONS = [
  { value: 'OWNER_OCCUPIED', label: 'Owner Occupied' },
  { value: 'INVESTMENT', label: 'Investment' },
  { value: 'RENTAL', label: 'Rental' },
];

export default function ProfilePage() {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Profile data
  const [profileData, setProfileData] = useState<ClientProfileInput>({
    phone: '', address: '', dateOfBirth: '',
    residencyStatus: 'CITIZEN', numberOfAdultDependants: 0,
    numberOfChildDependants: 0, privateSchoolingFlag: false,
    maritalStatus: 'SINGLE', employmentStatus: 'FULL_TIME',
  });
  const [profileExists, setProfileExists] = useState(false);

  // Income sources
  const [incomeSources, setIncomeSources] = useState<(IncomeSource | IncomeSourceInput & { id?: string })[]>([]);
  // Existing debts
  const [existingDebts, setExistingDebts] = useState<(ExistingDebt | ExistingDebtInput & { id?: string })[]>([]);
  // Properties
  const [properties, setProperties] = useState<(Property | PropertyInput & { id?: string })[]>([]);
  // Expenses
  const [expenses, setExpenses] = useState<ExpenseSummaryInput>({
    groceries: 0, groceriesFreq: 'MONTHLY',
    utilities: 0, utilitiesFreq: 'MONTHLY',
    transport: 0, transportFreq: 'MONTHLY',
    insurance: 0, insuranceFreq: 'MONTHLY',
    education: 0, educationFreq: 'MONTHLY',
    childcare: 0, childcareFreq: 'MONTHLY',
    entertainment: 0, entertainmentFreq: 'MONTHLY',
    otherExpenses: 0, otherExpensesFreq: 'MONTHLY',
  });
  const [expensesExist, setExpensesExist] = useState(false);

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

  const fetchIncomeSources = useCallback(async () => {
    try {
      const res = await api.get('/client/income-sources');
      const sources = res.data?.incomeSources;
      setIncomeSources(Array.isArray(sources) ? sources : []);
    } catch { /* no data */ }
  }, []);

  const fetchDebts = useCallback(async () => {
    try {
      const res = await api.get('/client/existing-debts');
      const debts = res.data?.existingDebts;
      setExistingDebts(Array.isArray(debts) ? debts : []);
    } catch { /* no data */ }
  }, []);

  const fetchProperties = useCallback(async () => {
    try {
      const res = await api.get('/client/properties');
      const props = res.data?.properties;
      setProperties(Array.isArray(props) ? props : []);
    } catch { /* no data */ }
  }, []);

  const fetchExpenses = useCallback(async () => {
    try {
      const res = await api.get('/client/expense-summary');
      if (res.data?.expenseSummary) {
        const e = res.data.expenseSummary as ExpenseSummary;
        setExpenses({
          groceries: e.groceries, groceriesFreq: e.groceriesFreq,
          utilities: e.utilities, utilitiesFreq: e.utilitiesFreq,
          transport: e.transport, transportFreq: e.transportFreq,
          insurance: e.insurance, insuranceFreq: e.insuranceFreq,
          education: e.education, educationFreq: e.educationFreq,
          childcare: e.childcare, childcareFreq: e.childcareFreq,
          entertainment: e.entertainment, entertainmentFreq: e.entertainmentFreq,
          otherExpenses: e.otherExpenses, otherExpensesFreq: e.otherExpensesFreq,
        });
        setExpensesExist(true);
      }
    } catch { /* no data */ }
  }, []);

  useEffect(() => {
    const loadAll = async () => {
      await Promise.all([fetchProfile(), fetchIncomeSources(), fetchDebts(), fetchProperties(), fetchExpenses()]);
      setLoading(false);
    };
    loadAll();
  }, [fetchProfile, fetchIncomeSources, fetchDebts, fetchProperties, fetchExpenses]);

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
    } catch { setError('Failed to save personal details.'); }
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
    } catch { setError('Failed to save dependant information.'); }
    finally { setSaving(false); }
  };

  const addIncomeSource = () => {
    setIncomeSources([...incomeSources, { owner: 'SELF', type: 'SALARY', amount: 0, frequency: 'ANNUAL' as Frequency }]);
  };

  const removeIncomeSource = async (index: number) => {
    const item = incomeSources[index];
    if ('id' in item && item.id) {
      try { await api.delete(`/client/income-sources/${item.id}`); } catch { /* ignore */ }
    }
    setIncomeSources(incomeSources.filter((_, i) => i !== index));
  };

  const saveIncomeSources = async () => {
    setSaving(true); setError(''); setSuccess('');
    try {
      for (const source of incomeSources) {
        if ('id' in source && source.id) {
          await api.put(`/client/income-sources/${source.id}`, {
            owner: source.owner, type: source.type,
            amount: Number(source.amount), frequency: source.frequency,
          });
        } else {
          const res = await api.post('/client/income-sources', {
            owner: source.owner, type: source.type,
            amount: Number(source.amount), frequency: source.frequency,
          });
          source.id = res.data.incomeSource.id;
        }
      }
      await fetchIncomeSources();
      setSuccess('Income sources saved successfully.');
    } catch { setError('Failed to save income sources.'); }
    finally { setSaving(false); }
  };

  const addDebt = () => {
    setExistingDebts([...existingDebts, { type: 'HOME_LOAN', outstandingBalance: 0, monthlyRepayment: null, interestRate: null, creditLimit: null }]);
  };

  const removeDebt = async (index: number) => {
    const item = existingDebts[index];
    if ('id' in item && item.id) {
      try { await api.delete(`/client/existing-debts/${item.id}`); } catch { /* ignore */ }
    }
    setExistingDebts(existingDebts.filter((_, i) => i !== index));
  };

  const saveDebts = async () => {
    setSaving(true); setError(''); setSuccess('');
    try {
      for (const debt of existingDebts) {
        const payload = {
          type: debt.type, outstandingBalance: Number(debt.outstandingBalance),
          monthlyRepayment: debt.monthlyRepayment ? Number(debt.monthlyRepayment) : null,
          interestRate: debt.interestRate ? Number(debt.interestRate) : null,
          creditLimit: debt.creditLimit ? Number(debt.creditLimit) : null,
        };
        if ('id' in debt && debt.id) {
          await api.put(`/client/existing-debts/${debt.id}`, payload);
        } else {
          const res = await api.post('/client/existing-debts', payload);
          debt.id = res.data.debt.id;
        }
      }
      await fetchDebts();
      setSuccess('Existing debts saved successfully.');
    } catch { setError('Failed to save existing debts.'); }
    finally { setSaving(false); }
  };

  const addProperty = () => {
    setProperties([...properties, { type: 'OWNER_OCCUPIED', address: '', estimatedValue: 0, mortgageBalance: null, rentalIncome: null }]);
  };

  const removeProperty = async (index: number) => {
    const item = properties[index];
    if ('id' in item && item.id) {
      try { await api.delete(`/client/properties/${item.id}`); } catch { /* ignore */ }
    }
    setProperties(properties.filter((_, i) => i !== index));
  };

  const saveProperties = async () => {
    setSaving(true); setError(''); setSuccess('');
    try {
      for (const prop of properties) {
        const payload = {
          type: prop.type, address: prop.address,
          estimatedValue: Number(prop.estimatedValue),
          mortgageBalance: prop.mortgageBalance ? Number(prop.mortgageBalance) : null,
          rentalIncome: prop.rentalIncome ? Number(prop.rentalIncome) : null,
        };
        if ('id' in prop && prop.id) {
          await api.put(`/client/properties/${prop.id}`, payload);
        } else {
          const res = await api.post('/client/properties', payload);
          prop.id = res.data.property.id;
        }
      }
      await fetchProperties();
      setSuccess('Properties saved successfully.');
    } catch { setError('Failed to save properties.'); }
    finally { setSaving(false); }
  };

  const saveExpenses = async () => {
    setSaving(true); setError(''); setSuccess('');
    try {
      const payload = {
        groceries: Number(expenses.groceries), groceriesFreq: expenses.groceriesFreq,
        utilities: Number(expenses.utilities), utilitiesFreq: expenses.utilitiesFreq,
        transport: Number(expenses.transport), transportFreq: expenses.transportFreq,
        insurance: Number(expenses.insurance), insuranceFreq: expenses.insuranceFreq,
        education: Number(expenses.education), educationFreq: expenses.educationFreq,
        childcare: Number(expenses.childcare), childcareFreq: expenses.childcareFreq,
        entertainment: Number(expenses.entertainment), entertainmentFreq: expenses.entertainmentFreq,
        otherExpenses: Number(expenses.otherExpenses), otherExpensesFreq: expenses.otherExpensesFreq,
      };
      if (expensesExist) {
        await api.put('/client/expense-summary', payload);
      } else {
        await api.post('/client/expense-summary', payload);
        setExpensesExist(true);
      }
      setSuccess('Expenses saved successfully.');
    } catch { setError('Failed to save expenses.'); }
    finally { setSaving(false); }
  };

  const handleNext = async () => {
    if (step === 0) await savePersonalDetails();
    else if (step === 1) await saveDependants();
    else if (step === 2) await saveIncomeSources();
    else if (step === 3) await saveDebts();
    else if (step === 4) await saveProperties();
    else if (step === 5) await saveExpenses();
    if (step < STEPS.length - 1) setStep(step + 1);
  };

  if (loading) return <Spinner size="lg" className="py-20" />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Financial Profile</h1>
        <p className="mt-1 text-gray-600">Complete your profile to get accurate borrowing calculations.</p>
      </div>

      {/* Step Tabs */}
      <div className="flex flex-wrap gap-2">
        {STEPS.map((s, i) => (
          <button key={s} onClick={() => setStep(i)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${i === step ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'}`}>
            {i + 1}. {s}
          </button>
        ))}
      </div>

      {error && <Alert variant="error">{error}</Alert>}
      {success && <Alert variant="success">{success}</Alert>}

      {/* Step Content */}
      <Card>
        {step === 0 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Personal Details</h3>
            <div className="grid md:grid-cols-2 gap-4">
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
            <h3 className="text-lg font-semibold">Dependants</h3>
            <div className="grid md:grid-cols-2 gap-4">
              <Input label="Number of Adult Dependants" type="number" min="0" value={String(profileData.numberOfAdultDependants)} onChange={(e) => setProfileData({ ...profileData, numberOfAdultDependants: parseInt(e.target.value) || 0 })} />
              <Input label="Number of Child Dependants" type="number" min="0" value={String(profileData.numberOfChildDependants)} onChange={(e) => setProfileData({ ...profileData, numberOfChildDependants: parseInt(e.target.value) || 0 })} />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={profileData.privateSchoolingFlag} onChange={(e) => setProfileData({ ...profileData, privateSchoolingFlag: e.target.checked })} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
              <span className="text-sm text-gray-700">Private schooling</span>
            </label>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Income Sources</h3>
              <Button variant="secondary" size="sm" onClick={addIncomeSource}>Add Income</Button>
            </div>
            {incomeSources.map((source, idx) => (
              <div key={idx} className="border border-gray-200 rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-700">Income #{idx + 1}</span>
                  <Button variant="danger" size="sm" onClick={() => removeIncomeSource(idx)}>Remove</Button>
                </div>
                <div className="grid md:grid-cols-2 gap-3">
                  <Select label="Owner" options={OWNER_OPTIONS} value={source.owner} onChange={(e) => { const arr = [...incomeSources]; arr[idx] = { ...arr[idx], owner: e.target.value as IncomeSourceInput['owner'] }; setIncomeSources(arr); }} />
                  <Select label="Type" options={INCOME_TYPE_OPTIONS} value={source.type} onChange={(e) => { const arr = [...incomeSources]; arr[idx] = { ...arr[idx], type: e.target.value as IncomeSourceInput['type'] }; setIncomeSources(arr); }} />
                  <Input label="Amount" type="number" min="0" value={String(source.amount)} onChange={(e) => { const arr = [...incomeSources]; arr[idx] = { ...arr[idx], amount: parseFloat(e.target.value) || 0 }; setIncomeSources(arr); }} />
                  <Select label="Frequency" options={FREQUENCY_OPTIONS} value={source.frequency} onChange={(e) => { const arr = [...incomeSources]; arr[idx] = { ...arr[idx], frequency: e.target.value as Frequency }; setIncomeSources(arr); }} />
                </div>
              </div>
            ))}
            {incomeSources.length === 0 && <p className="text-gray-500 text-sm">No income sources added. Click &quot;Add Income&quot; to get started.</p>}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Existing Debts</h3>
              <Button variant="secondary" size="sm" onClick={addDebt}>Add Debt</Button>
            </div>
            {existingDebts.map((debt, idx) => (
              <div key={idx} className="border border-gray-200 rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-700">Debt #{idx + 1}</span>
                  <Button variant="danger" size="sm" onClick={() => removeDebt(idx)}>Remove</Button>
                </div>
                <div className="grid md:grid-cols-2 gap-3">
                  <Select label="Type" options={DEBT_TYPE_OPTIONS} value={debt.type} onChange={(e) => { const arr = [...existingDebts]; arr[idx] = { ...arr[idx], type: e.target.value as ExistingDebtInput['type'] }; setExistingDebts(arr); }} />
                  <Input label="Outstanding Balance" type="number" min="0" value={String(debt.outstandingBalance)} onChange={(e) => { const arr = [...existingDebts]; arr[idx] = { ...arr[idx], outstandingBalance: parseFloat(e.target.value) || 0 }; setExistingDebts(arr); }} />
                  <Input label="Monthly Repayment" type="number" min="0" value={String(debt.monthlyRepayment || '')} onChange={(e) => { const arr = [...existingDebts]; arr[idx] = { ...arr[idx], monthlyRepayment: parseFloat(e.target.value) || null }; setExistingDebts(arr); }} />
                  <Input label="Credit Limit" type="number" min="0" value={String(debt.creditLimit || '')} onChange={(e) => { const arr = [...existingDebts]; arr[idx] = { ...arr[idx], creditLimit: parseFloat(e.target.value) || null }; setExistingDebts(arr); }} />
                </div>
              </div>
            ))}
            {existingDebts.length === 0 && <p className="text-gray-500 text-sm">No existing debts. Click &quot;Add Debt&quot; if applicable.</p>}
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Properties</h3>
              <Button variant="secondary" size="sm" onClick={addProperty}>Add Property</Button>
            </div>
            {properties.map((prop, idx) => (
              <div key={idx} className="border border-gray-200 rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-700">Property #{idx + 1}</span>
                  <Button variant="danger" size="sm" onClick={() => removeProperty(idx)}>Remove</Button>
                </div>
                <div className="grid md:grid-cols-2 gap-3">
                  <Select label="Type" options={PROPERTY_TYPE_OPTIONS} value={prop.type} onChange={(e) => { const arr = [...properties]; arr[idx] = { ...arr[idx], type: e.target.value as PropertyInput['type'] }; setProperties(arr); }} />
                  <Input label="Address" value={prop.address} onChange={(e) => { const arr = [...properties]; arr[idx] = { ...arr[idx], address: e.target.value }; setProperties(arr); }} />
                  <Input label="Estimated Value" type="number" min="0" value={String(prop.estimatedValue)} onChange={(e) => { const arr = [...properties]; arr[idx] = { ...arr[idx], estimatedValue: parseFloat(e.target.value) || 0 }; setProperties(arr); }} />
                  <Input label="Mortgage Balance" type="number" min="0" value={String(prop.mortgageBalance || '')} onChange={(e) => { const arr = [...properties]; arr[idx] = { ...arr[idx], mortgageBalance: parseFloat(e.target.value) || null }; setProperties(arr); }} />
                  <Input label="Rental Income (monthly)" type="number" min="0" value={String(prop.rentalIncome || '')} onChange={(e) => { const arr = [...properties]; arr[idx] = { ...arr[idx], rentalIncome: parseFloat(e.target.value) || null }; setProperties(arr); }} />
                </div>
              </div>
            ))}
            {properties.length === 0 && <p className="text-gray-500 text-sm">No properties. Click &quot;Add Property&quot; if applicable.</p>}
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Monthly Expenses</h3>
            <div className="grid md:grid-cols-2 gap-4">
              {([
                ['groceries', 'groceriesFreq', 'Groceries'],
                ['utilities', 'utilitiesFreq', 'Utilities'],
                ['transport', 'transportFreq', 'Transport'],
                ['insurance', 'insuranceFreq', 'Insurance'],
                ['education', 'educationFreq', 'Education'],
                ['childcare', 'childcareFreq', 'Childcare'],
                ['entertainment', 'entertainmentFreq', 'Entertainment'],
                ['otherExpenses', 'otherExpensesFreq', 'Other Expenses'],
              ] as [keyof ExpenseSummaryInput, keyof ExpenseSummaryInput, string][]).map(([amtKey, freqKey, label]) => (
                <div key={amtKey} className="flex gap-2 items-end">
                  <Input label={label} type="number" min="0" value={String(expenses[amtKey])} onChange={(e) => setExpenses({ ...expenses, [amtKey]: parseFloat(e.target.value) || 0 })} />
                  <Select options={FREQUENCY_OPTIONS} value={expenses[freqKey] as string} onChange={(e) => setExpenses({ ...expenses, [freqKey]: e.target.value })} className="w-36" />
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="secondary" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>
          Previous
        </Button>
        <Button onClick={handleNext} loading={saving}>
          {step === STEPS.length - 1 ? 'Save & Finish' : 'Save & Next'}
        </Button>
      </div>
    </div>
  );
}
