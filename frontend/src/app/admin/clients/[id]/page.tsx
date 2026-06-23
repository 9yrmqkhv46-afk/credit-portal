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
import { AdminClientDetail, Note, ClientStatus } from '@/types';
import { AxiosError } from 'axios';

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
  const [noteContent, setNoteContent] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

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

  const handleAddNote = async () => {
    if (!noteContent.trim()) return;
    setAddingNote(true);
    try {
      const res = await api.post(`/admin/clients/${clientId}/notes`, { content: noteContent, visibility: 'ADMIN_ONLY' });
      const note = res.data.note || res.data;
      if (client) {
        setClient({ ...client, notes: [note, ...client.notes] });
      }
      setNoteContent('');
    } catch (err) {
      const axiosError = err as AxiosError<{ error?: string }>;
      setError(axiosError.response?.data?.error || 'Failed to add note.');
    } finally {
      setAddingNote(false);
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

  return (
    <div className="space-y-6">
      {error && <Alert variant="error">{error}</Alert>}

      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <Link href="/admin" className="text-sm text-blue-600 hover:text-blue-700 mb-2 block">
            &larr; Back to Clients
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">{client.name}</h1>
          <p className="text-gray-600">{client.email}</p>
        </div>
        <div className="flex items-center gap-3">
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
            <div><span className="text-gray-500">Phone:</span> <span className="ml-2 text-gray-900">{profile.phone || '--'}</span></div>
            <div><span className="text-gray-500">DOB:</span> <span className="ml-2 text-gray-900">{profile.dateOfBirth ? new Date(profile.dateOfBirth).toLocaleDateString() : '--'}</span></div>
            <div><span className="text-gray-500">Residency:</span> <span className="ml-2 text-gray-900">{profile.residencyStatus}</span></div>
            <div><span className="text-gray-500">Marital:</span> <span className="ml-2 text-gray-900">{profile.maritalStatus}</span></div>
            <div><span className="text-gray-500">Employment:</span> <span className="ml-2 text-gray-900">{profile.employmentStatus}</span></div>
            <div><span className="text-gray-500">Dependants:</span> <span className="ml-2 text-gray-900">{profile.numberOfAdultDependants} adults, {profile.numberOfChildDependants} children</span></div>
          </div>

          {/* Income Sources */}
          {profile.incomeSources && profile.incomeSources.length > 0 && (
            <div className="mt-6">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Income Sources</h4>
              <div className="space-y-1">
                {profile.incomeSources.map((inc) => (
                  <div key={inc.id} className="flex justify-between text-sm">
                    <span className="text-gray-600">{inc.type} ({inc.owner})</span>
                    <span className="font-medium">${inc.amount.toLocaleString()} {inc.frequency.toLowerCase()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Existing Debts */}
          {profile.existingDebts && profile.existingDebts.length > 0 && (
            <div className="mt-6">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Existing Debts</h4>
              <div className="space-y-1">
                {profile.existingDebts.map((debt) => (
                  <div key={debt.id} className="flex justify-between text-sm">
                    <span className="text-gray-600">{debt.type}</span>
                    <span className="font-medium">Balance: ${debt.outstandingBalance.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Properties */}
          {profile.properties && profile.properties.length > 0 && (
            <div className="mt-6">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Properties</h4>
              <div className="space-y-1">
                {profile.properties.map((prop) => (
                  <div key={prop.id} className="flex justify-between text-sm">
                    <span className="text-gray-600">{prop.type} - {prop.address}</span>
                    <span className="font-medium">${prop.estimatedValue.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Loan Scenarios */}
      <Card title="Loan Scenarios">
        {client.loanScenarios.length > 0 ? (
          <div className="space-y-3">
            {client.loanScenarios.map((scenario) => (
              <div key={scenario.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="font-medium text-gray-900">{scenario.purpose}</span>
                    <span className="ml-3 text-sm text-gray-500">
                      {scenario.repaymentType === 'PI' ? 'P&I' : 'IO'} | {scenario.loanTermYears}yr | {(scenario.interestRate * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-gray-900">
                      {scenario.maxBorrowingCapacity != null
                        ? `$${scenario.maxBorrowingCapacity.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                        : 'Pending'}
                    </p>
                    <p className="text-xs text-gray-500">{new Date(scenario.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
                {scenario.dtiRatio != null && (
                  <div className="mt-2 flex gap-4 text-xs text-gray-500">
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
          <p className="text-gray-500 text-sm">No loan scenarios yet.</p>
        )}
      </Card>

      {/* Admin Notes */}
      <Card title="Admin Notes">
        <div className="space-y-4">
          {/* Add Note Form */}
          <div className="flex gap-2">
            <textarea
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none resize-none"
              rows={2}
              placeholder="Add a note..."
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
            />
            <Button onClick={handleAddNote} loading={addingNote} disabled={!noteContent.trim()}>
              Add
            </Button>
          </div>

          {/* Notes List */}
          {client.notes.length > 0 ? (
            <div className="space-y-3 border-t pt-4">
              {client.notes.map((note: Note) => (
                <div key={note.id} className="bg-gray-50 rounded-lg p-3">
                  <p className="text-sm text-gray-900">{note.content}</p>
                  <div className="mt-1 flex gap-3 text-xs text-gray-500">
                    <span>{new Date(note.createdAt).toLocaleString()}</span>
                    <Badge variant="neutral">{note.visibility}</Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm border-t pt-4">No notes yet.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
