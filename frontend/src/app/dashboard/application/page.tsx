'use client';

import React, { useEffect, useState } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { Alert } from '@/components/ui/Alert';
import { ApplicationTimeline } from '@/components/timeline/ApplicationTimeline';
import api from '@/lib/api';
import { ApplicationStage } from '@/types';

export default function ApplicationTimelinePage() {
  const [stages, setStages] = useState<ApplicationStage[]>([]);
  const [total, setTotal] = useState(18);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/timeline');
        setStages(res.data.stages || []);
        setTotal(res.data.totalStages || 18);
      } catch {
        setError('Unable to load your application timeline.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <Spinner size="lg" className="py-20" />;

  return (
    <div className="space-y-6">
      <div className="animate-enter">
        <h1 className="text-2xl font-bold text-primary">Application Status</h1>
        <p className="mt-1 text-secondary">Track every step of your loan application in real time.</p>
      </div>
      {error && <Alert variant="error">{error}</Alert>}
      <ApplicationTimeline stages={stages} totalStages={total} />
    </div>
  );
}
