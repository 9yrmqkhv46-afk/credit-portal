'use client';

import React, { useEffect, useState } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { MessageThread } from '@/components/messaging/MessageThread';
import { MeetingModal, CreatedMeeting } from '@/components/messaging/MeetingModal';
import { BroadcastModal } from '@/components/messaging/BroadcastModal';
import { useToast } from '@/components/ui/Toast';
import api from '@/lib/api';
import { Message, MessageType, AdminClientListItem } from '@/types';

/** Recency dot colour for the conversation list (green/amber/grey). */
function recencyDot(lastMessageAt?: string | null): string {
  if (!lastMessageAt) return 'bg-white/20';
  const ageH = (Date.now() - new Date(lastMessageAt).getTime()) / 3_600_000;
  if (ageH < 1) return 'bg-emerald shadow-[0_0_8px_var(--accent-emerald)]';
  if (ageH < 24) return 'bg-gold';
  return 'bg-white/25';
}

export default function AdminMessagesPage() {
  const [clients, setClients] = useState<AdminClientListItem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [meetingOpen, setMeetingOpen] = useState(false);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/admin/clients');
        const raw = res.data.clients || [];
        const list: AdminClientListItem[] = raw.map((c: any) => ({
          id: c.id,
          email: c.email,
          name: c.name,
          role: c.role || 'CLIENT',
          createdAt: c.createdAt,
          clientProfile: c.clientProfile || (c.status ? { status: c.status } : null),
          loanScenarios: c.loanScenarios || (c.latestScenario ? [c.latestScenario] : []),
          lastMessageAt: c.lastMessageAt ?? null,
        }));
        setClients(list);
        if (list.length > 0) setSelected(list[0].id);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const loadThread = async (id: string, silent = false) => {
    if (!silent) setLoadingThread(true);
    try {
      const res = await api.get(`/admin/clients/${id}/messages`);
      setMessages(res.data.messages || []);
    } finally {
      if (!silent) setLoadingThread(false);
    }
  };

  useEffect(() => { if (selected) loadThread(selected); }, [selected]);

  // Live updates: silently re-poll the active thread every few seconds so new
  // messages from the client appear without a manual refresh.
  useEffect(() => {
    if (!selected) return;
    const interval = window.setInterval(() => {
      loadThread(selected, true).catch(() => {});
    }, 4000);
    return () => window.clearInterval(interval);
  }, [selected]);

  const selectedClient = clients.find((c) => c.id === selected);

  const handleSend = async (payload: { body?: string; type: MessageType; cardData?: unknown }) => {
    if (!selected) return;
    try {
      await api.post(`/admin/clients/${selected}/messages`, payload);
      await loadThread(selected, true);
    } catch {
      toast('Could not send message', { accent: 'crimson' });
    }
  };

  const patchMsg = async (id: string, data: Record<string, unknown>) => {
    if (!selected) return;
    try {
      await api.patch(`/admin/clients/${selected}/messages/${id}`, data);
      await loadThread(selected, true);
    } catch { /* ignore */ }
  };

  const handleMeetingCreated = (m: CreatedMeeting) => {
    handleSend({
      type: 'meeting_request',
      body: m.subject,
      cardData: {
        subject: m.subject,
        startDateTime: m.startDateTime,
        endDateTime: m.endDateTime,
        joinWebUrl: m.joinWebUrl,
        joinUrl: m.joinUrl,
        durationMins: m.durationMins,
        attendees: m.attendees,
      },
    });
  };

  if (loading) return <Spinner size="lg" className="py-20" />;

  return (
    <div className="space-y-4">
      <div className="animate-enter flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary">Messaging Hub</h1>
          <p className="mt-1 text-secondary">All client conversations in one place.</p>
        </div>
        <button
          type="button"
          onClick={() => setBroadcastOpen(true)}
          className="rounded-xl bg-gradient-to-br from-brand to-brand-dark px-4 py-2 text-sm font-semibold text-on-accent shadow-lg shadow-brand/30 hover:brightness-110"
        >
          📢 Broadcast Message
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        {/* Conversation list */}
        <aside className="glass-2 max-h-[calc(100vh-12rem)] overflow-y-auto rounded-2xl p-2">
          {clients.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelected(c.id)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${selected === c.id ? 'bg-brand-light ring-1 ring-brand/40' : 'hover:bg-white/8'}`}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand to-brand-dark text-sm font-bold text-on-accent">
                {c.name.charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-primary">{c.name}</span>
                <span className="block truncate text-xs text-muted">{c.email}</span>
              </span>
              <span className={`h-2 w-2 shrink-0 rounded-full ${recencyDot(c.lastMessageAt)}`} aria-hidden="true" />
            </button>
          ))}
          {clients.length === 0 && <p className="p-4 text-sm text-muted">No clients yet.</p>}
        </aside>

        {/* Thread */}
        <section>
          {loadingThread ? (
            <Spinner size="lg" className="py-20" />
          ) : selectedClient ? (
            <MessageThread
              messages={messages}
              viewerRole="ADMIN"
              admin
              headerTitle={selectedClient.name}
              headerSubtitle={selectedClient.email}
              stageLabel="View timeline"
              stageHref={`/admin/clients/${selectedClient.id}`}
              onSend={handleSend}
              live
              onScheduleMeeting={() => setMeetingOpen(true)}
              onReact={(id, reactions) => patchMsg(id, { reactions })}
              onResolve={(id, resolved) => patchMsg(id, { resolved })}
              onFlag={(id, flagged) => patchMsg(id, { flagged })}
              onPin={(id, pinned) => patchMsg(id, { pinned })}
            />
          ) : (
            <p className="text-muted">Select a conversation.</p>
          )}
        </section>
      </div>

      {selectedClient && (
        <MeetingModal
          open={meetingOpen}
          onClose={() => setMeetingOpen(false)}
          defaultSubject={`Loan Review — ${selectedClient.name}`}
          defaultAttendee={selectedClient.email}
          onCreated={handleMeetingCreated}
        />
      )}

      <BroadcastModal
        open={broadcastOpen}
        onClose={() => setBroadcastOpen(false)}
        clients={clients}
        onSent={() => { if (selected) loadThread(selected, true); }}
      />
    </div>
  );
}
