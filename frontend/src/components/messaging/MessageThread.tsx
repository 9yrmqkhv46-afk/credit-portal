'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Message, MessageType, SenderRole } from '@/types';
import { MessageCard } from './MessageCard';

interface Props {
  messages: Message[];
  /** The role of the person using this thread (determines outgoing side). */
  viewerRole: SenderRole;
  headerTitle: string;
  headerSubtitle?: string;
  stageLabel?: string;
  stageHref?: string;
  admin?: boolean;
  /** True while a background refetch (live polling) is in flight. */
  live?: boolean;
  onSend: (payload: { body?: string; type: MessageType; cardData?: unknown }) => void;
  /** Receives the FULL new reactions array (toggled), not a single emoji. */
  onReact?: (messageId: string, reactions: string[]) => void;
  onResolve?: (messageId: string, resolved: boolean) => void;
  onFlag?: (messageId: string, flagged: boolean) => void;
}

const REACTIONS = ['👍', '✅', '❓', '🏠', '📋'];

/** Max attachment size — base64 inflates by ~33%, keep under the 12mb API limit. */
const MAX_ATTACHMENT_BYTES = 7 * 1024 * 1024;

function dayLabel(date: Date): string {
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(date, today)) return 'Today';
  if (same(date, yest)) return 'Yesterday';
  return date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

function Ticks({ status }: { status: Message['status'] }) {
  // single (sent) / double (delivered) / teal double (read)
  const teal = status === 'read';
  const dbl = status === 'delivered' || status === 'read';
  return (
    <span className={`ml-1 inline-flex ${teal ? 'text-brand' : 'text-muted'}`} aria-label={`Status: ${status}`}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
        <path d="M3 13l4 4L15 7" strokeLinecap="round" strokeLinejoin="round" />
        {dbl && <path d="M9 13l4 4L21 7" strokeLinecap="round" strokeLinejoin="round" />}
      </svg>
    </span>
  );
}

export function MessageThread({
  messages, viewerRole, headerTitle, headerSubtitle, stageLabel, stageHref,
  admin = false, live = false, onSend, onReact, onResolve, onFlag,
}: Props) {
  const [draft, setDraft] = useState('');
  const [showAttach, setShowAttach] = useState(false);
  const [reactingId, setReactingId] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const ordered = useMemo(
    () => [...messages].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [messages]
  );

  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [ordered.length, typing]);

  // Auto-dismiss the transient inline note (used by header call/profile buttons).
  useEffect(() => {
    if (!note) return;
    const t = window.setTimeout(() => setNote(null), 2600);
    return () => window.clearTimeout(t);
  }, [note]);

  const autosize = () => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
  };

  const send = (payload: { body?: string; type: MessageType; cardData?: unknown }) => {
    onSend(payload);
    setDraft('');
    if (taRef.current) taRef.current.style.height = 'auto';
    // Tasteful: show a brief typing indicator from the other side.
    setTyping(true);
    window.setTimeout(() => setTyping(false), 1600);
  };

  const sendText = () => {
    const body = draft.trim();
    if (!body) return;
    send({ body, type: 'text' });
  };

  const attach = (type: MessageType) => {
    setShowAttach(false);
    const samples: Record<string, { body: string; cardData: unknown }> = {
      document_request: { body: 'Documents required', cardData: { title: 'Documents required', items: ['Last 2 payslips', 'Bank statement', 'Photo ID'] } },
      borrowing_summary: { body: 'Borrowing summary', cardData: { maxBorrowing: 920000, rate: 6.49, termYears: 30, monthlyRepayment: 5805 } },
      meeting_request: { body: 'Meeting request', cardData: { title: 'Quick catch-up call', proposed: 'Thu 2:30pm', durationMins: 15 } },
      stage_update: { body: 'Status update', cardData: { stage: 'Unconditional Pre-Approval Received', group: 'Pre-Approval', order: 6, total: 18 } },
    };
    const s = samples[type];
    send({ body: s.body, type, cardData: s.cardData });
  };

  /** Open the OS file picker for a real attachment upload. */
  const pickFile = () => {
    setShowAttach(false);
    fileRef.current?.click();
  };

  /** Read the chosen file as a base64 data URL and send it as an attachment. */
  const onFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so picking the same file again re-fires change.
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setNote(`"${file.name}" is too large (max 7 MB).`);
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      send({
        type: 'attachment',
        body: file.name,
        cardData: { fileName: file.name, mimeType: file.type || 'application/octet-stream', size: file.size, dataUrl },
      });
    } catch {
      setNote('Could not read that file. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  /** Toggle a reaction on a message and emit the FULL resulting array. */
  const toggleReaction = (m: Message, emoji: string) => {
    let current: string[] = [];
    try { current = m.reactions ? JSON.parse(m.reactions) : []; } catch { current = []; }
    const next = current.includes(emoji) ? current.filter((r) => r !== emoji) : [...current, emoji];
    onReact?.(m.id, next);
    setReactingId(null);
  };

  const headerAction = (kind: string) => {
    if (kind === 'profile' && admin && stageHref) { window.location.href = stageHref; return; }
    const labels: Record<string, string> = {
      phone: `Calling ${headerTitle}…`,
      video: `Starting video call with ${headerTitle}…`,
      profile: 'Opening profile…',
    };
    setNote(labels[kind] ?? null);
  };

  const lastIncoming = ordered.length > 0 && ordered[ordered.length - 1].senderRole !== viewerRole && ordered[ordered.length - 1].senderRole !== 'SYSTEM';
  const quickReplies = viewerRole === 'CLIENT'
    ? ['Thanks!', 'Got it 👍', 'When is settlement?']
    : ['On it', 'Will update you shortly', 'Can you upload the docs?'];

  let lastDay = '';
  let prevSender: string | null = null;

  return (
    <div className="glass-2 flex h-[calc(100vh-12rem)] min-h-[420px] flex-col overflow-hidden rounded-2xl">
      {/* Sticky header */}
      <div className="glass-3 flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand to-brand-dark text-sm font-bold text-on-accent">
            {headerTitle.charAt(0).toUpperCase()}
          </span>
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-primary">
              {headerTitle}
              <span className={`inline-flex h-2 w-2 rounded-full bg-emerald shadow-[0_0_8px_var(--accent-emerald)] ${live ? 'animate-ping-slow' : ''}`} aria-label="online" />
            </p>
            {headerSubtitle && <p className="text-xs text-muted">{headerSubtitle}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {stageLabel && (
            <a href={stageHref} className="rounded-full bg-brand-light px-2.5 py-1 text-[11px] font-semibold text-brand ring-1 ring-brand/40 hover:brightness-110">
              {stageLabel}
            </a>
          )}
          {['phone', 'video', 'profile'].map((k) => (
            <button key={k} type="button" aria-label={k} onClick={() => headerAction(k)} className="rounded-lg p-1.5 text-muted ring-1 ring-white/12 hover:bg-white/10 hover:text-primary">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                {k === 'phone' && <path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3 19.5 19.5 0 01-6-6 19.8 19.8 0 01-3-8.6A2 2 0 014.1 2h3a2 2 0 012 1.7c.1.9.3 1.8.6 2.6a2 2 0 01-.5 2.1L8 9.6a16 16 0 006 6l1.2-1.2a2 2 0 012.1-.5c.8.3 1.7.5 2.6.6a2 2 0 011.7 2z" strokeLinecap="round" strokeLinejoin="round" />}
                {k === 'video' && <path d="M23 7l-7 5 7 5V7zM1 5h13a2 2 0 012 2v10a2 2 0 01-2 2H1z" strokeLinecap="round" strokeLinejoin="round" />}
                {k === 'profile' && <path d="M12 12a5 5 0 100-10 5 5 0 000 10zm0 2c-5 0-9 2.5-9 6v1h18v-1c0-3.5-4-6-9-6z" strokeLinecap="round" strokeLinejoin="round" />}
              </svg>
            </button>
          ))}
        </div>
      </div>

      {/* Transient inline note (call/profile actions, upload errors) */}
      {note && (
        <div className="bubble-in border-b border-white/10 bg-brand-light/60 px-4 py-2 text-center text-xs font-medium text-brand">
          {note}
        </div>
      )}

      {/* Feed */}
      <div ref={feedRef} className="flex-1 space-y-1 overflow-y-auto px-4 py-4">
        {ordered.map((m) => {
          const created = new Date(m.createdAt);
          const dl = dayLabel(created);
          const showDay = dl !== lastDay;
          lastDay = dl;
          const isSystem = m.senderRole === 'SYSTEM';
          const isOutgoing = m.senderRole === viewerRole;
          const showSender = !isSystem && m.senderRole !== prevSender;
          prevSender = m.senderRole;
          const reactions: string[] = (() => { try { return m.reactions ? JSON.parse(m.reactions) : []; } catch { return []; } })();

          return (
            <React.Fragment key={m.id}>
              {showDay && (
                <div className="my-3 flex justify-center">
                  <span className="tnum rounded-full bg-white/8 px-3 py-0.5 text-[11px] text-muted ring-1 ring-white/12">{dl}</span>
                </div>
              )}
              {isSystem ? (
                <div className="my-2 flex justify-center">
                  <div className="bubble-in max-w-[80%] rounded-full bg-white/6 px-3 py-1 text-center text-xs text-secondary ring-1 ring-white/12">
                    {m.type !== 'text' ? <MessageCard message={m} /> : m.body}
                  </div>
                </div>
              ) : (
                <div className={`flex ${isOutgoing ? 'justify-end' : 'justify-start'}`}>
                  <div className={`group relative max-w-[78%] ${isOutgoing ? 'items-end' : 'items-start'}`}>
                    {showSender && (
                      <p className={`mb-0.5 text-[11px] font-medium text-muted ${isOutgoing ? 'text-right' : 'text-left'}`}>
                        {m.senderRole === 'ADMIN' ? 'TransformBiz' : m.senderRole === 'CLIENT' ? (admin ? headerTitle : 'You') : ''}
                      </p>
                    )}
                    <div
                      onContextMenu={(e) => { e.preventDefault(); setReactingId(reactingId === m.id ? null : m.id); }}
                      className={[
                        'bubble-in px-3 py-2 text-sm',
                        isOutgoing
                          ? 'rounded-[18px_18px_4px_18px] bg-brand/20 text-primary ring-1 ring-brand/30'
                          : 'glass-2 rounded-[18px_18px_18px_4px] text-primary',
                      ].join(' ')}
                    >
                      {m.type !== 'text'
                        ? <MessageCard
                            message={m}
                            onUpload={pickFile}
                            onMeetingAccept={() => send({ body: 'Sounds good — that time works for me. ✅', type: 'text' })}
                            onMeetingReschedule={() => { setDraft('Could we find another time? I was thinking…'); taRef.current?.focus(); }}
                          />
                        : <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                      <div className="mt-1 flex items-center justify-end gap-1">
                        <span className="tnum text-[10px] text-muted opacity-0 transition-opacity group-hover:opacity-100">
                          {created.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {isOutgoing && admin && <Ticks status={m.status} />}
                        {isOutgoing && !admin && viewerRole === 'CLIENT' && <Ticks status={m.status} />}
                      </div>
                    </div>

                    {/* Reaction button (always available on hover) */}
                    <button
                      type="button"
                      aria-label="React"
                      onClick={() => setReactingId(reactingId === m.id ? null : m.id)}
                      className={`absolute top-1 ${isOutgoing ? '-left-7' : '-right-7'} rounded-full bg-white/8 p-1 text-muted opacity-0 ring-1 ring-white/12 transition-opacity hover:text-primary group-hover:opacity-100`}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <circle cx="12" cy="12" r="9" /><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" strokeLinecap="round" />
                      </svg>
                    </button>

                    {reactions.length > 0 && (
                      <div className={`mt-0.5 flex gap-1 ${isOutgoing ? 'justify-end' : 'justify-start'}`}>
                        {reactions.map((r, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => toggleReaction(m, r)}
                            className="rounded-full bg-white/10 px-1.5 text-xs ring-1 ring-white/15 transition hover:bg-white/20"
                          >
                            {r}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Admin resolve / flag */}
                    {admin && !isOutgoing && (
                      <div className="mt-0.5 flex gap-2">
                        <button type="button" onClick={() => onResolve?.(m.id, !m.resolved)} className={`text-[11px] font-medium ${m.resolved ? 'text-emerald underline' : 'text-muted hover:text-emerald'}`}>
                          {m.resolved ? 'Resolved' : 'Resolve'}
                        </button>
                        <button type="button" onClick={() => onFlag?.(m.id, !m.flagged)} className={`text-[11px] font-medium ${m.flagged ? 'text-warning' : 'text-muted hover:text-warning'}`}>
                          {m.flagged ? '● Flagged' : 'Flag'}
                        </button>
                      </div>
                    )}

                    {reactingId === m.id && (
                      <div className={`absolute z-20 mt-1 flex gap-1 rounded-full glass-4 px-2 py-1 ${isOutgoing ? 'right-0' : 'left-0'}`}>
                        {REACTIONS.map((r) => (
                          <button key={r} type="button" onClick={() => toggleReaction(m, r)} className="text-base hover:scale-125 transition-transform">
                            {r}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </React.Fragment>
          );
        })}

        {typing && (
          <div className="flex justify-start">
            <div className="glass-2 flex items-center gap-1 rounded-full px-3 py-2">
              {[0, 1, 2].map((i) => (
                <span key={i} className="typing-dot h-1.5 w-1.5 rounded-full bg-secondary" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Quick replies */}
      {lastIncoming && (
        <div className="flex gap-2 overflow-x-auto border-t border-white/10 px-4 py-2">
          {quickReplies.map((q) => (
            <button key={q} type="button" onClick={() => send({ body: q, type: 'text' })} className="whitespace-nowrap rounded-full bg-white/8 px-3 py-1 text-xs text-secondary ring-1 ring-white/15 hover:bg-white/12 hover:text-primary">
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Composer */}
      <div className="glass-3 relative border-t border-white/10 p-3">
        {showAttach && (
          <div className="absolute bottom-16 left-3 z-20 w-56 rounded-xl glass-4 p-2">
            <button type="button" onClick={pickFile} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-secondary hover:bg-white/10 hover:text-primary">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M12 5v14M5 12h14" strokeLinecap="round" />
              </svg>
              Upload file / photo
            </button>
            <div className="my-1 border-t border-white/10" />
            {([
              ['document_request', 'Document request'],
              ['borrowing_summary', 'Borrowing summary'],
              ['meeting_request', 'Meeting request'],
              ['stage_update', 'Status update'],
            ] as [MessageType, string][]).map(([type, label], i) => (
              <button key={i} type="button" onClick={() => attach(type)} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-secondary hover:bg-white/10 hover:text-primary">
                {label}
              </button>
            ))}
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
          className="hidden"
          onChange={onFileChosen}
        />
        <div className="flex items-end gap-2">
          <button
            type="button"
            aria-label="Attach"
            onClick={() => setShowAttach((s) => !s)}
            disabled={uploading}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-secondary ring-1 ring-white/15 hover:bg-white/10 hover:text-primary disabled:opacity-50"
          >
            {uploading ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-brand" />
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M21 12.8l-8.5 8.5a5 5 0 01-7-7l8.5-8.5a3.3 3.3 0 014.7 4.7L10 18a1.6 1.6 0 01-2.3-2.3l7.8-7.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
          <textarea
            ref={taRef}
            value={draft}
            onChange={(e) => { setDraft(e.target.value); autosize(); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(); } }}
            rows={1}
            placeholder="Type a message…  (Enter to send, Shift+Enter for newline)"
            aria-label="Message"
            className="glass-input max-h-[140px] flex-1 resize-none rounded-xl border border-white/15 px-3.5 py-2.5 text-sm text-primary focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
          <button
            type="button"
            onClick={sendText}
            disabled={!draft.trim()}
            aria-label="Send"
            className="ripple-btn flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-brand-dark text-on-accent shadow-lg shadow-brand/30 transition hover:brightness-110 disabled:opacity-40"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

export default MessageThread;
