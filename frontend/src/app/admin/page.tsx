'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { Alert } from '@/components/ui/Alert';
import api from '@/lib/api';
import { AdminClientListItem } from '@/types';

function getStatusVariant(status: string): 'success' | 'warning' | 'neutral' {
  switch (status) {
    case 'Active': return 'success';
    case 'Prospect': return 'warning';
    default: return 'neutral';
  }
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [clients, setClients] = useState<AdminClientListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const fetchClients = async () => {
      try {
        const res = await api.get('/admin/clients');
        const data = res.data.clients || res.data;
        // Map backend response shape to frontend expected shape
        const mapped = Array.isArray(data) ? data.map((c: any) => ({
          id: c.id,
          email: c.email,
          name: c.name,
          role: c.role || 'CLIENT',
          createdAt: c.createdAt,
          clientProfile: c.clientProfile || (c.status ? { status: c.status } : null),
          loanScenarios: c.loanScenarios || (c.latestScenario ? [c.latestScenario] : []),
        })) : [];
        setClients(mapped);
      } catch {
        setError('Failed to load clients.');
      } finally {
        setLoading(false);
      }
    };
    fetchClients();
  }, []);

  const filteredClients = useMemo(() => {
    if (!search) return clients;
    const term = search.toLowerCase();
    return clients.filter(c =>
      c.name.toLowerCase().includes(term) ||
      c.email.toLowerCase().includes(term) ||
      (c.clientProfile?.status || '').toLowerCase().includes(term)
    );
  }, [clients, search]);

  if (loading) return <Spinner size="lg" className="py-20" />;
  if (error) return <Alert variant="error">{error}</Alert>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-white">Client Management</h1>
          <p className="mt-1 text-secondary">{clients.length} total clients</p>
        </div>
        <div className="w-64">
          <Input
            placeholder="Search clients..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <Card variant="dark" hover={false} className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-white/10">
            <thead className="bg-white/5">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-secondary uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-secondary uppercase tracking-wider">Email</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-secondary uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-secondary uppercase tracking-wider">Last Scenario</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-secondary uppercase tracking-wider">Max Borrowing</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-secondary uppercase tracking-wider">DTI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {filteredClients.map((client) => {
                const latestScenario = client.loanScenarios?.length > 0 ? client.loanScenarios[0] : null;
                const status = client.clientProfile?.status || 'Prospect';
                return (
                  <tr
                    key={client.id}
                    onClick={() => router.push(`/admin/clients/${client.id}`)}
                    className="cursor-pointer hover:bg-white/10 transition-colors"
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">{client.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-secondary">{client.email}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant={getStatusVariant(status)}>{status}</Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-secondary">
                      {latestScenario ? new Date(latestScenario.createdAt).toLocaleDateString() : '--'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-white">
                      {latestScenario?.maxBorrowingCapacity != null
                        ? `$${latestScenario.maxBorrowingCapacity.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                        : '--'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-secondary">
                      {latestScenario?.dtiRatio != null ? `${latestScenario.dtiRatio.toFixed(2)}x` : '--'}
                    </td>
                  </tr>
                );
              })}
              {filteredClients.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-sm text-secondary">
                    No clients found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
