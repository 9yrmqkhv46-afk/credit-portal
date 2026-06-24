'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import api from '@/lib/api';
import { ClientProfile, LoanScenario, ApplicationStage } from '@/types';

export default function DashboardPage() {
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [scenarios, setScenarios] = useState<LoanScenario[]>([]);
  const [stages, setStages] = useState<ApplicationStage[]>([]);
  const [totalStages, setTotalStages] = useState(18);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [profileRes, scenariosRes, timelineRes] = await Promise.all([
          api.get('/client/profile').catch(() => null),
          api.get('/loan-scenarios').catch(() => null),
          api.get('/timeline').catch(() => null),
        ]);
        if (profileRes?.data) setProfile(profileRes.data.profile || null);
        if (scenariosRes?.data) setScenarios(Array.isArray(scenariosRes.data.scenarios) ? scenariosRes.data.scenarios : []);
        if (timelineRes?.data) {
          setStages(timelineRes.data.stages || []);
          setTotalStages(timelineRes.data.totalStages || 18);
        }
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
  const completedStages = stages.filter((s) => s.status === 'completed').length;
  const activeStage = [...stages].sort((a, b) => a.orderIndex - b.orderIndex).find((s) => s.status === 'active');
  const progressPct = totalStages > 0 ? Math.round((completedStages / totalStages) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary">Dashboard</h1>
        <p className="mt-1 text-secondary">Welcome to your borrowing calculator portal.</p>
      </div>

      {/* Status Cards */}
      <div className="grid md:grid-cols-3 gap-6">
        <Card className="animate-enter" style={{ animationDelay: '40ms' }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-secondary">Profile Status</p>
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
            <p className="text-sm text-secondary">Loan Scenarios</p>
            <p className="text-3xl font-bold text-primary mt-1">{scenarios.length}</p>
          </div>
          <Link href="/dashboard/calculator" className="mt-4 block">
            <Button variant="primary" size="sm" className="w-full">
              Run New Scenario
            </Button>
          </Link>
        </Card>

        <Card className="animate-enter" style={{ animationDelay: '180ms' }}>
          <div>
            <p className="text-sm text-secondary">Latest Max Borrowing</p>
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

      {/* Application progress + messages */}
      {stages.length > 0 && (
        <Card title="Application Status" className="animate-enter" style={{ animationDelay: '220ms' }}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="tnum font-display text-xl font-bold text-primary">Stage {activeStage?.orderIndex ?? completedStages} of {totalStages}</p>
              <p className="mt-0.5 text-sm text-secondary">Current: <span className="font-medium text-primary">{activeStage?.label ?? 'Complete'}</span></p>
            </div>
            <p className="tnum font-display text-2xl font-bold text-brand">{progressPct}%</p>
          </div>
          <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-white/10">
            <div className="bar-fill h-full rounded-full" style={{ width: `${progressPct}%`, background: 'linear-gradient(90deg, var(--color-brand-dark), var(--accent-teal))', boxShadow: '0 0 14px -2px rgba(0,196,212,0.7)' }} />
          </div>
          <div className="mt-4 flex gap-3">
            <Link href="/dashboard/application" className="flex-1">
              <Button variant="secondary" size="sm" className="w-full">View Full Timeline</Button>
            </Link>
            <Link href="/dashboard/messages" className="flex-1">
              <Button variant="primary" size="sm" className="w-full">Messages</Button>
            </Link>
          </div>
        </Card>
      )}

      {/* Recent Scenarios */}
      {recentScenarios.length > 0 && (
        <Card title="Recent Scenarios">
          <div className="divide-y divide-white/10">
            {recentScenarios.map((scenario) => (
              <Link
                key={scenario.id}
                href={`/dashboard/calculator/results/${scenario.id}`}
                className="block py-3 hover:bg-white/5 -mx-6 px-6 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium text-primary">{scenario.purpose}</span>
                    <span className="ml-3 text-sm text-muted">
                      {scenario.repaymentType === 'PI' ? 'P&I' : 'Interest Only'} | {scenario.loanTermYears}yr
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="font-semibold text-primary">
                      {scenario.maxBorrowingCapacity != null
                        ? `$${scenario.maxBorrowingCapacity.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                        : 'Pending'}
                    </span>
                    <p className="text-xs text-muted">
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
