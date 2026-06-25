'use client';

import React, { useEffect, useState } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { MessageThread } from '@/components/messaging/MessageThread';
import { useToast } from '@/components/ui/Toast';
import api from '@/lib/api';
import { Message, MessageType } from '@/types';

export default function ClientMessagesPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const load = async (silent = false) => {
    try {
      const res = await api.get('/messages');
      setMessages(res.data.messages || []);
    } catch {
      /* ignore */
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Live updates: silently re-poll the thread so replies from the specialist
  // appear without a manual refresh.
  useEffect(() => {
    const interval = window.setInterval(() => { load(true).catch(() => {}); }, 4000);
    return () => window.clearInterval(interval);
  }, []);

  const handleSend = async (payload: { body?: string; type: MessageType; cardData?: unknown }) => {
    // Optimistic append.
    const optimistic: Message = {
      id: `tmp-${Date.now()}`,
      clientUserId: 'me',
      senderRole: 'CLIENT',
      body: payload.body ?? null,
      type: payload.type,
      cardData: payload.cardData ? JSON.stringify(payload.cardData) : null,
      status: 'sent',
      resolved: false,
      flagged: false,
      reactions: null,
      createdAt: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimistic]);
    try {
      await api.post('/messages', payload);
      await load(true);
    } catch {
      toast('Could not send message', { accent: 'crimson' });
    }
  };

  const handleReact = async (id: string, reactions: string[]) => {
    if (id.startsWith('tmp-')) return;
    try {
      await api.patch(`/messages/${id}`, { reactions });
      await load(true);
    } catch { /* ignore */ }
  };

  if (loading) return <Spinner size="lg" className="py-20" />;

  return (
    <div className="space-y-4">
      <div className="animate-enter">
        <h1 className="text-2xl font-bold text-primary">Messages</h1>
        <p className="mt-1 text-secondary">Chat directly with your TransformBiz lending specialist.</p>
      </div>
      <MessageThread
        messages={messages}
        viewerRole="CLIENT"
        headerTitle="TransformBiz"
        headerSubtitle="Your lending specialist"
        stageLabel="View status"
        stageHref="/dashboard/application"
        live
        onSend={handleSend}
        onReact={handleReact}
      />
    </div>
  );
}
