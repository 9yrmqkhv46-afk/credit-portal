'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import api from '@/lib/api';
import { ClientProfile, LoanScenario } from '@/types';

export default function DashboardPage() {
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [scenarios, setScenarios] = useState<LoanScenario[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [profileRes, scenariosRes] = await Promise.all([
          api.get('/client/profile').catch(() => null),
          api.get('/loan-scenarios').catch(() => null),
        ]);
        if (profileRes?.data) setProfile(profileRes.data.profile || null);
        if (scenariosRes?.data) setScenarios(Array.isArray(scenariosRes.data.scenarios) ? scenariosRes.data.scenarios : []);
      } catch {
        // ignore errors on initial load
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return <Spinner size="lg" className="py-20" />;
  }

  const profileComplete = profile !== null;
  const hasScenarios = scenarios.length > 0;
  const recentScenarios = scenarios.slice(0, 5);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="mt-1 text-slate-600">Welcome to your borrowing calculator portal.</p>
      </div>

      {/* Status Cards */}
      <div className="grid md:grid-cols-3 gap-6">
        <Card className="animate-enter" style={{ animationDelay: '40ms' }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600">Profile Status</p>
              <p className="text-lg font-semibold mt-1">
                {profileComplete ? (
                  <Badge variant="success">Complete</Badge>
                ) : (
                  <Badge variant="warning">Incomplete</Badge>
                )}
              </p>
            </div>
          </div>
          <Link href="/dashboard/profile" className="mt-4 block">
            <Button variant="secondary" size="sm" className="w-full">
              {profileComplete ? 'Edit Profile' : 'Complete Profile'}
            </Button>
          </Link>
        </Card>

        <Card className="animate-enter" style={{ animationDelay: '110ms' }}>
          <div>
            <p className="text-sm text-slate-600">Loan Scenarios</p>
            <p className="text-3xl font-bold text-slate-900 mt-1">{scenarios.length}</p>
          </div>
          <Link href="/dashboard/calculator" className="mt-4 block">
            <Button variant="primary" size="sm" className="w-full">
              Run New Scenario
            </Button>
          </Link>
        </Card>

        <Card className="animate-enter" style={{ animationDelay: '180ms' }}>
          <div>
            <p className="text-sm text-slate-600">Latest Max Borrowing</p>
            <p className="text-3xl font-bold text-brand mt-1">
              {hasScenarios && scenarios[0].maxBorrowingCapacity != null
                ? <AnimatedNumber value={scenarios[0].maxBorrowingCapacity} prefix="$" />
                : '--'}
            </p>
          </div>
          {hasScenarios && scenarios[0].id && (
            <Link href={`/dashboard/calculator/results/${scenarios[0].id}`} className="mt-4 block">
              <Button variant="secondary" size="sm" className="w-full">
                View Details
              </Button>
            </Link>
          )}
        </Card>
      </div>

      {/* Recent Scenarios */}
      {recentScenarios.length > 0 && (
        <Card title="Recent Scenarios">
          <div className="divide-y divide-white/40">
            {recentScenarios.map((scenario) => (
              <Link
                key={scenario.id}
                href={`/dashboard/calculator/results/${scenario.id}`}
                className="block py-3 hover:bg-white/40 -mx-6 px-6 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium text-slate-900">{scenario.purpose}</span>
                    <span className="ml-3 text-sm text-slate-500">
                      {scenario.repaymentType === 'PI' ? 'P&I' : 'Interest Only'} | {scenario.loanTermYears}yr
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="font-semibold text-slate-900">
                      {scenario.maxBorrowingCapacity != null
                        ? `$${scenario.maxBorrowingCapacity.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                        : 'Pending'}
                    </span>
                    <p className="text-xs text-slate-500">
                      {new Date(scenario.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
