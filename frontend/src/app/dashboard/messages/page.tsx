'use client';

import React, { useEffect, useState } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { MessageThread } from '@/components/messaging/MessageThread';
import { useToast } from '@/components/ui/Toast';
import api from '@/lib/api';
import { Message, MessageType } from '@/types';
import { uploadAttachment, formatBytes } from '@/lib/attachments';

export default function ClientMessagesPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const load = async () => {
    try {
      const res = await api.get('/messages');
      setMessages(res.data.messages || []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

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
      await load();
    } catch {
      toast('Could not send message', { accent: 'crimson' });
    }
  };

  const handleReact = async (id: string, emoji: string) => {
    if (id.startsWith('tmp-')) return;
    try {
      await api.patch(`/messages/${id}`, { reactions: [emoji] });
      await load();
    } catch { /* ignore */ }
  };

  // Real document upload: store the file (base64) then post a downloadable
  // document card into the thread.
  const handleAttachFile = async (file: File) => {
    try {
      const att = await uploadAttachment(file);
      await api.post('/messages', {
        body: `Sent a document: ${att.filename} (${formatBytes(att.sizeBytes)})`,
        type: 'document',
        cardData: { attachmentId: att.id, filename: att.filename, sizeBytes: att.sizeBytes, mimeType: att.mimeType },
      });
      await load();
      toast('Document uploaded', { accent: 'teal' });
    } catch {
      toast('Could not upload document (max 5MB)', { accent: 'crimson' });
    }
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
        contactName="TransformBiz Specialist"
        stageLabel="View status"
        stageHref="/dashboard/application"
        onSend={handleSend}
        onAttachFile={handleAttachFile}
        onReact={handleReact}
      />
    </div>
  );
}
