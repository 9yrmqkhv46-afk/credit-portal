'use client';

import React, { useEffect, useState } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { MessageThread } from '@/components/messaging/MessageThread';
import { useToast } from '@/components/ui/Toast';
import api from '@/lib/api';
import { Message, MessageType, AdminClientListItem } from '@/types';

export default function AdminMessagesPage() {
  const [clients, setClients] = useState<AdminClientListItem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/admin/clients');
        const list: AdminClientListItem[] = res.data.clients || [];
        setClients(list);
        if (list.length > 0) setSelected(list[0].id);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const loadThread = async (id: string) => {
    setLoadingThread(true);
    try {
      const res = await api.get(`/admin/clients/${id}/messages`);
      setMessages(res.data.messages || []);
    } finally {
      setLoadingThread(false);
    }
  };

  useEffect(() => { if (selected) loadThread(selected); }, [selected]);

  const selectedClient = clients.find((c) => c.id === selected);

  const handleSend = async (payload: { body?: string; type: MessageType; cardData?: unknown }) => {
    if (!selected) return;
    try {
      await api.post(`/admin/clients/${selected}/messages`, payload);
      await loadThread(selected);
    } catch {
      toast('Could not send message', { accent: 'crimson' });
    }
  };

  const patchMsg = async (id: string, data: Record<string, unknown>) => {
    if (!selected) return;
    try {
      await api.patch(`/admin/clients/${selected}/messages/${id}`, data);
      await loadThread(selected);
    } catch { /* ignore */ }
  };

  if (loading) return <Spinner size="lg" className="py-20" />;

  return (
    <div className="space-y-4">
      <div className="animate-enter">
        <h1 className="text-2xl font-bold text-primary">Messaging Hub</h1>
        <p className="mt-1 text-secondary">All client conversations in one place.</p>
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
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-primary">{c.name}</span>
                <span className="block truncate text-xs text-muted">{c.email}</span>
              </span>
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
              onReact={(id, emoji) => patchMsg(id, { reactions: [emoji] })}
              onResolve={(id, resolved) => patchMsg(id, { resolved })}
              onFlag={(id, flagged) => patchMsg(id, { flagged })}
            />
          ) : (
            <p className="text-muted">Select a conversation.</p>
          )}
        </section>
      </div>
    </div>
  );
}
