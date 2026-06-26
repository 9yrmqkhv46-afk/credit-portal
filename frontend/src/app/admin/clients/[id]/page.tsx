'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { Alert } from '@/components/ui/Alert';
import api from '@/lib/api';
import { AdminClientDetail, ClientStatus, ApplicationStage } from '@/types';
import { AxiosError } from 'axios';
import { PropertyPortfolioTable } from '@/components/properties/PropertyPortfolioTable';
import { OtherLiabilitiesTable } from '@/components/liabilities/OtherLiabilitiesTable';
import { ExistingHomeLoansTable } from '@/components/loans/ExistingHomeLoansTable';
import { ApplicationTimeline } from '@/components/timeline/ApplicationTimeline';
import { AdminRemarksLog } from '@/components/admin/AdminRemarksLog';
import { AdminAssessmentView } from '@/components/admin/AdminAssessmentView';
import { AdminBankRecommendations } from '@/components/admin/AdminBankRecommendations';
import { useToast } from '@/components/ui/Toast';

const STATUS_OPTIONS = [
  { value: 'Prospect', label: 'Prospect' },
  { value: 'Active', label: 'Active' },
  { value: 'Inactive', label: 'Inactive' },
];

function getStatusVariant(status: string): 'success' | 'warning' | 'neutral' {
  switch (status) {
    case 'Active': return 'success';
    case 'Prospect': return 'warning';
    default: return 'neutral';
  }
}

export default function AdminClientDetailPage() {
  const params = useParams();
  const clientId = params.id as string;
  const [client, setClient] = useState<AdminClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [stages, setStages] = useState<ApplicationStage[]>([]);
  const [totalStages, setTotalStages] = useState(18);
  const { toast } = useToast();

  useEffect(() => {
    const fetchClient = async () => {
      try {
        const res = await api.get(`/admin/clients/${clientId}`);
        const data = res.data.client || res.data;
        // Map backend response shape to frontend expected shape
        const mapped: AdminClientDetail = {
          id: data.id,
          email: data.email,
          name: data.name,
          role: data.role,
          createdAt: data.createdAt,
          clientProfile: data.profile || data.clientProfile || null,
          loanScenarios: data.scenarios || data.loanScenarios || [],
          notes: data.notes || [],
        };
        setClient(mapped);
      } catch {
        setError('Failed to load client details.');
      } finally {
        setLoading(false);
      }
    };
    fetchClient();
  }, [clientId]);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get(`/admin/clients/${clientId}/timeline`);
        setStages(res.data.stages || []);
        setTotalStages(res.data.totalStages || 18);
      } catch { /* ignore */ }
    })();
  }, [clientId]);

  const patchStage = async (stageId: string, payload: Record<string, unknown>, successMsg?: string) => {
    try {
      const res = await api.patch(`/admin/clients/${clientId}/timeline/${stageId}`, payload);
      setStages(res.data.stages || []);
      if (successMsg) toast(successMsg, { accent: 'teal' });
    } catch {
      toast('Timeline update failed', { accent: 'crimson' });
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    setUpdatingStatus(true);
    try {
      await api.patch(`/admin/clients/${clientId}/status`, { status: newStatus as ClientStatus });
      if (client && client.clientProfile) {
        setClient({ ...client, clientProfile: { ...client.clientProfile, status: newStatus as ClientStatus } });
      }
    } catch (err) {
      const axiosError = err as AxiosError<{ error?: string }>;
      setError(axiosError.response?.data?.error || 'Failed to update status.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  if (loading) return <Spinner size="lg" className="py-20" />;
  if (error && !client) return <Alert variant="error">{error}</Alert>;
  if (!client) return <Alert variant="error">Client not found.</Alert>;

  const profile = client.clientProfile;
  // The admin GET returns the full Quickli-style profile; surface the extended
  // collections (typed loosely as they extend the base AdminClientDetail shape).
  const fullProfile = profile as unknown as {
    properties?: import('@/types').Property[];
    personalLiabilities?: import('@/types').PersonalLiability[];
    existingHomeLoans?: import('@/types').ExistingHomeLoan[];
  } | null;

  return (
    <div className="space-y-6">
      {error && <Alert variant="error">{error}</Alert>}

      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <Link href="/admin" className="text-sm text-emerald-300 hover:text-emerald-200 mb-2 block">
            &larr; Back to Clients
          </Link>
          <h1 className="text-2xl font-bold text-white">{client.name}</h1>
          <p className="text-secondary">{client.email}</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/admin/messages">
            <Button variant="secondary" size="sm">Open Messages</Button>
          </Link>
          <Badge variant={getStatusVariant(profile?.status || 'Prospect')}>
            {profile?.status || 'Prospect'}
          </Badge>
          <Select
            options={STATUS_OPTIONS}
            value={profile?.status || 'Prospect'}
            onChange={(e) => handleStatusChange(e.target.value)}
            disabled={updatingStatus}
            className="w-32"
          />
        </div>
      </div>

      {/* Profile Data */}
      {profile && (
        <Card title="Profile Information">
          <div className="grid md:grid-cols-3 gap-4 text-sm">
            <div><span className="text-muted">Phone:</span> <span className="ml-2 text-primary">{profile.phone || '--'}</span></div>
            <div><span className="text-muted">DOB:</span> <span className="ml-2 text-primary">{profile.dateOfBirth ? new Date(profile.dateOfBirth).toLocaleDateString() : '--'}</span></div>
            <div><span className="text-muted">Residency:</span> <span className="ml-2 text-primary">{profile.residencyStatus}</span></div>
            <div><span className="text-muted">Marital:</span> <span className="ml-2 text-primary">{profile.maritalStatus}</span></div>
            <div><span className="text-muted">Employment:</span> <span className="ml-2 text-primary">{profile.employmentStatus}</span></div>
            <div><span className="text-muted">Dependants:</span> <span className="ml-2 text-primary">{profile.numberOfAdultDependants} adults, {profile.numberOfChildDependants} children</span></div>
          </div>

          {/* Income Sources */}
          {profile.incomeSources && profile.incomeSources.length > 0 && (
            <div className="mt-6">
              <h4 className="text-sm font-semibold text-secondary mb-2">Income Sources</h4>
              <div className="space-y-1">
                {profile.incomeSources.map((inc) => (
                  <div key={inc.id} className="flex justify-between text-sm">
                    <span className="text-secondary">{inc.type} ({inc.owner})</span>
                    <span className="font-medium">${inc.amount.toLocaleString()} {inc.frequency.toLowerCase()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Existing Debts */}
          {profile.existingDebts && profile.existingDebts.length > 0 && (
            <div className="mt-6">
              <h4 className="text-sm font-semibold text-secondary mb-2">Existing Debts</h4>
              <div className="space-y-1">
                {profile.existingDebts.map((debt) => (
                  <div key={debt.id} className="flex justify-between text-sm">
                    <span className="text-secondary">{debt.type}</span>
                    <span className="font-medium">Balance: ${debt.outstandingBalance.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Properties */}
          {profile.properties && profile.properties.length > 0 && (
            <div className="mt-6">
              <h4 className="text-sm font-semibold text-secondary mb-2">Properties</h4>
              <div className="space-y-1">
                {profile.properties.map((prop) => (
                  <div key={prop.id} className="flex justify-between text-sm">
                    <span className="text-secondary">{prop.type} - {prop.address}</span>
                    <span className="font-medium">${prop.estimatedValue.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Quickli-style portfolio / liabilities / loans (read-only) */}
      {fullProfile && (
        <>
          <Card title="Property Portfolio">
            <PropertyPortfolioTable readOnly initialProperties={fullProfile.properties || []}
              initialExistingLoans={fullProfile.existingHomeLoans || []} />
          </Card>
          <Card title="Other Liabilities">
            <OtherLiabilitiesTable readOnly initialLiabilities={fullProfile.personalLiabilities || []} />
          </Card>
          <Card title="Existing Home Loans">
            <ExistingHomeLoansTable readOnly initialLoans={fullProfile.existingHomeLoans || []} />
          </Card>
        </>
      )}

      {/* Top-3 bank recommendations from this client's data */}
      <AdminBankRecommendations clientId={clientId} />

      {/* Bluehive assessment extras + broker details */}
      {client.clientProfile && (
        <AdminAssessmentView clientId={clientId} profile={client.clientProfile} />
      )}

      {/* Loan Scenarios */}
      <Card title="Loan Scenarios">
        {client.loanScenarios.length > 0 ? (
          <div className="space-y-3">
            {client.loanScenarios.map((scenario) => (
              <div key={scenario.id} className="rounded-xl border border-white/12 bg-white/5 p-4">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="font-medium text-primary">{scenario.purpose}</span>
                    <span className="ml-3 text-sm text-muted">
                      {scenario.repaymentType === 'PI' ? 'P&I' : 'IO'} | {scenario.loanTermYears}yr | {(scenario.interestRate * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-primary">
                      {scenario.maxBorrowingCapacity != null
                        ? `$${scenario.maxBorrowingCapacity.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                        : 'Pending'}
                    </p>
                    <p className="text-xs text-muted">{new Date(scenario.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
                {scenario.dtiRatio != null && (
                  <div className="mt-2 flex gap-4 text-xs text-muted items-center">
                    <span>DTI: {scenario.dtiRatio.toFixed(2)}x</span>
                    <span>Monthly Repayment: ${scenario.monthlyRepayment?.toLocaleString(undefined, { maximumFractionDigits: 0 }) || '--'}</span>
                    {scenario.passesServiceability && scenario.passesDti ? (
                      <Badge variant="success">Pass</Badge>
                    ) : (
                      <Badge variant="danger">Limited</Badge>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted text-sm">No loan scenarios yet.</p>
        )}
      </Card>

      {/* Application Status Timeline (Mandate 2) */}
      <Card title="Application Status Timeline">
        {stages.length > 0 ? (
          <ApplicationTimeline
            stages={stages}
            totalStages={totalStages}
            admin
            onComplete={(id) => patchStage(id, { action: 'complete' }, 'Stage marked complete')}
            onSkip={(id) => patchStage(id, { action: 'skip' }, 'Stage skipped')}
            onReset={(id) => patchStage(id, { action: 'reset' }, 'Stage reset')}
            onSaveNote={(id, note) => patchStage(id, { note }, 'Note saved')}
            onSaveDueDate={(id, dueDate) => patchStage(id, { dueDate }, 'Date saved')}
          />
        ) : (
          <Spinner size="md" className="py-8" />
        )}
      </Card>

      {/* Admin Remarks Log (Mandate 4B) */}
      <Card title="Admin Remarks Log">
        <AdminRemarksLog clientId={clientId} initialNotes={client.notes} />
      </Card>
    </div>
  );
}
