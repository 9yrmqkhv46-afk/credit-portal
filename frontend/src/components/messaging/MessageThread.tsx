'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Message, MessageType, SenderRole } from '@/types';
import { MessageCard } from './MessageCard';

interface ReplyTarget {
  id: string;
  author: string;
  text: string;
}

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
  /** Toggle pin state on a message (admin). */
  onPin?: (messageId: string, pinned: boolean) => void;
  /** Opens the Schedule Teams Meeting modal (owned by the page). */
  onScheduleMeeting?: () => void;
}

const REACTIONS = ['👍', '✅', '❓', '🏠', '📋'];

/** Mandate 5 §C — 10 MB attachment limit + allowed MIME types. */
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg', 'image/png', 'image/webp', 'image/heic',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',       // .xlsx
  'application/msword',
  'application/vnd.ms-excel',
  'text/csv',
];

/** Just the time portion in AEST, e.g. "3:42 PM AEST". */
function fmtAESTTime(date: Date): string {
  try {
    const parts = new Intl.DateTimeFormat('en-AU', {
      timeZone: 'Australia/Sydney',
      hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short',
    }).formatToParts(date);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    return `${get('hour')}:${get('minute')} ${(get('dayPeriod') || '').toUpperCase()} ${get('timeZoneName') || 'AEST'}`;
  } catch {
    return date.toLocaleTimeString();
  }
}

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
  const teal = status === 'read';
  const dbl = status === 'delivered' || status === 'read';
  return (
    <span className={`ml-1 inline-flex transition-colors duration-200 ${teal ? 'text-brand' : 'text-muted'}`} aria-label={`Status: ${status}`}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
        <path d="M3 13l4 4L15 7" strokeLinecap="round" strokeLinejoin="round" />
        {dbl && <path d="M9 13l4 4L21 7" strokeLinecap="round" strokeLinejoin="round" />}
      </svg>
    </span>
  );
}

export function MessageThread({
  messages, viewerRole, headerTitle, headerSubtitle, stageLabel, stageHref,
  admin = false, live = false, onSend, onReact, onResolve, onFlag, onPin, onScheduleMeeting,
}: Props) {
  const [draft, setDraft] = useState('');
  const [showAttach, setShowAttach] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [reactingId, setReactingId] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const [lightbox, setLightbox] = useState<{ src: string; name: string } | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [search, setSearch] = useState('');
  const [matchIdx, setMatchIdx] = useState(0);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [, setTick] = useState(0); // drives read-receipt re-render at transitions

  const feedRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const didInitialScroll = useRef(false);
  const msgRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const ordered = useMemo(
    () => [...messages].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [messages]
  );

  // Message search — ids of messages matching the query, in thread order.
  const matchIds = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [];
    return ordered
      .filter((m) => (m.body || '').toLowerCase().includes(term) || (m.cardData || '').toLowerCase().includes(term))
      .map((m) => m.id);
  }, [ordered, search]);

  const pinnedMessages = useMemo(() => ordered.filter((m) => m.pinned), [ordered]);

  const scrollToMessage = (id: string) => {
    const el = msgRefs.current[id];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  // When the match set changes, jump to the first match.
  useEffect(() => {
    if (matchIds.length === 0) return;
    setMatchIdx(0);
    scrollToMessage(matchIds[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchIds.length]);

  const gotoMatch = (dir: 1 | -1) => {
    if (matchIds.length === 0) return;
    const next = (matchIdx + dir + matchIds.length) % matchIds.length;
    setMatchIdx(next);
    scrollToMessage(matchIds[next]);
  };

  // Always start scrolled to the bottom; jump instantly on first render, then
  // smooth-scroll as new messages arrive.
  useEffect(() => {
    const el = feedRef.current;
    if (!el) return;
    if (!didInitialScroll.current) {
      el.scrollTop = el.scrollHeight;
      didInitialScroll.current = true;
    } else {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
  }, [ordered.length, typing]);

  useEffect(() => {
    if (!note) return;
    const t = window.setTimeout(() => setNote(null), 2600);
    return () => window.clearTimeout(t);
  }, [note]);

  // Close lightbox on Escape.
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

  const autosize = () => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
  };

  const send = (payload: { body?: string; type: MessageType; cardData?: unknown }) => {
    onSend(payload);
    setDraft('');
    setReplyTo(null);
    if (taRef.current) taRef.current.style.height = 'auto';
    // Read-receipt progression: nudge re-render at the sent→delivered→read points.
    window.setTimeout(() => setTick((x) => x + 1), 850);
    window.setTimeout(() => setTick((x) => x + 1), 2050);
    // Simulate the other party typing back (random 1.5–4s) then a reply arrives.
    setTyping(true);
    window.setTimeout(() => setTyping(false), 1500 + Math.random() * 2500);
  };

  const sendText = () => {
    const body = draft.trim();
    if (!body) return;
    const cardData = replyTo ? { quotedAuthor: replyTo.author, quotedText: replyTo.text } : undefined;
    send({ body, type: 'text', cardData });
  };

  const attach = (type: MessageType) => {
    setShowAttach(false);
    const samples: Record<string, { body: string; cardData: unknown }> = {
      document_request: { body: 'Documents required', cardData: { title: 'Documents required', items: ['Last 2 payslips', 'Bank statement', 'Photo ID'] } },
      borrowing_summary: { body: 'Borrowing summary', cardData: { maxBorrowing: 920000, rate: 6.49, termYears: 30, monthlyRepayment: 5805 } },
      stage_update: { body: 'Status update', cardData: { stage: 'Unconditional Pre-Approval Received', group: 'Pre-Approval', order: 6, total: 18 } },
    };
    const s = samples[type];
    if (s) send({ body: s.body, type, cardData: s.cardData });
  };

  const pickFile = () => {
    setShowAttach(false);
    setAttachError(null);
    fileRef.current?.click();
  };

  const validateFile = (file: File): string | null => {
    const okType = ALLOWED_TYPES.includes(file.type) ||
      /\.(pdf|jpe?g|png|webp|heic|docx?|xlsx?|csv)$/i.test(file.name);
    if (!okType) return 'Only PDF, DOCX, XLSX, images and CSV files are supported.';
    if (file.size > MAX_ATTACHMENT_BYTES) return 'This file exceeds the 10 MB limit. Please compress it and try again.';
    return null;
  };

  const handleFile = async (file: File) => {
    const err = validateFile(file);
    if (err) { setAttachError(err); return; }
    setAttachError(null);
    setUploading(true);
    setShowAttach(false);
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

  const onFileChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) handleFile(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const toggleReaction = (m: Message, emoji: string) => {
    let current: string[] = [];
    try { current = m.reactions ? JSON.parse(m.reactions) : []; } catch { current = []; }
    const next = current.includes(emoji) ? current.filter((r) => r !== emoji) : [...current, emoji];
    onReact?.(m.id, next);
    setReactingId(null);
  };

  const startReply = (m: Message) => {
    const author = m.senderRole === 'ADMIN' ? 'TransformBiz' : m.senderRole === 'CLIENT' ? (admin ? headerTitle : 'You') : 'System';
    const text = (m.body || (m.type !== 'text' ? m.type.replace('_', ' ') : '')).slice(0, 140);
    setReplyTo({ id: m.id, author, text });
    taRef.current?.focus();
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

  /** Read-receipt status: prefer server 'read', otherwise derive from age. */
  const deriveStatus = (m: Message): Message['status'] => {
    if (m.status === 'read') return 'read';
    const age = Date.now() - new Date(m.createdAt).getTime();
    if (age < 800) return 'sent';
    if (age < 2000) return 'delivered';
    return 'read';
  };

  const lastIncoming = ordered.length > 0 && ordered[ordered.length - 1].senderRole !== viewerRole && ordered[ordered.length - 1].senderRole !== 'SYSTEM';
  const quickReplies = viewerRole === 'CLIENT'
    ? ['Thanks!', 'Got it 👍', 'When is settlement?']
    : ['On it', 'Will update you shortly', 'Can you upload the docs?'];

  let lastDay = '';
  let prevSender: string | null = null;

  return (
    <div className="glass-2 relative flex h-[calc(100vh-12rem)] min-h-[420px] flex-col overflow-hidden rounded-2xl">
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
          <button
            type="button"
            aria-label="Search messages"
            onClick={() => { setShowSearch((s) => !s); if (showSearch) setSearch(''); }}
            className={`rounded-lg p-1.5 ring-1 ring-white/12 hover:bg-white/10 hover:text-primary ${showSearch ? 'bg-brand-light text-brand' : 'text-muted'}`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" strokeLinecap="round" />
            </svg>
          </button>
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

      {/* Search bar (slides down from header) */}
      {showSearch && (
        <div className="bubble-in flex items-center gap-2 border-b border-white/10 bg-white/4 px-4 py-2">
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') gotoMatch(e.shiftKey ? -1 : 1); if (e.key === 'Escape') { setShowSearch(false); setSearch(''); } }}
            placeholder="Search this conversation…"
            className="glass-input flex-1 rounded-lg border border-white/15 px-3 py-1.5 text-sm text-primary focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
          <span className="tnum whitespace-nowrap text-xs text-muted">
            {matchIds.length > 0 ? `${matchIdx + 1} of ${matchIds.length}` : search.trim() ? 'No matches' : ''}
          </span>
          <button type="button" aria-label="Previous match" onClick={() => gotoMatch(-1)} disabled={matchIds.length === 0} className="rounded-md px-1.5 text-muted hover:text-primary disabled:opacity-30">↑</button>
          <button type="button" aria-label="Next match" onClick={() => gotoMatch(1)} disabled={matchIds.length === 0} className="rounded-md px-1.5 text-muted hover:text-primary disabled:opacity-30">↓</button>
          <button type="button" aria-label="Close search" onClick={() => { setShowSearch(false); setSearch(''); }} className="rounded-md px-1.5 text-muted hover:text-primary">×</button>
        </div>
      )}

      {/* Pinned messages panel */}
      {pinnedMessages.length > 0 && (
        <div className="border-b border-white/10 bg-gold-light/40 px-4 py-2">
          <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-gold">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M14 2l8 8-4 1-3 7-2-6-6-2 7-3 1-4z" /></svg>
            {pinnedMessages.length} pinned
          </p>
          <div className="space-y-1">
            {pinnedMessages.map((m) => (
              <button key={m.id} type="button" onClick={() => scrollToMessage(m.id)} className="block w-full truncate rounded-md px-2 py-1 text-left text-xs text-secondary hover:bg-white/10 hover:text-primary">
                {m.body || (m.type !== 'text' ? m.type.replace('_', ' ') : 'Message')}
              </button>
            ))}
          </div>
        </div>
      )}

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
          const quoted: { quotedAuthor?: string; quotedText?: string } | null = (() => {
            if (m.type !== 'text' || !m.cardData) return null;
            try { return JSON.parse(m.cardData); } catch { return null; }
          })();
          const searching = search.trim().length > 0;
          const isMatch = matchIds.includes(m.id);
          const isCurrentMatch = matchIds[matchIdx] === m.id;
          const dimmed = searching && !isMatch;

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
                  <div ref={(el) => { msgRefs.current[m.id] = el; }} className={`group relative max-w-[78%] transition-opacity ${isOutgoing ? 'items-end' : 'items-start'} ${dimmed ? 'opacity-30' : ''}`}>
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
                        isCurrentMatch ? 'ring-2 ring-gold' : '',
                        m.pinned ? 'border-l-2 border-gold' : '',
                      ].join(' ')}
                    >
                      {quoted?.quotedText && (
                        <div className="mb-1.5 rounded-lg border-l-2 border-brand/60 bg-black/20 px-2 py-1">
                          <p className="text-[11px] font-semibold text-brand">{quoted.quotedAuthor}</p>
                          <p className="line-clamp-2 text-[11px] text-secondary">{quoted.quotedText}</p>
                        </div>
                      )}
                      {m.type !== 'text'
                        ? <MessageCard
                            message={m}
                            onUpload={pickFile}
                            onImageClick={(src, name) => setLightbox({ src, name })}
                            onMeetingAccept={() => send({ body: 'Sounds good — that time works for me. ✅', type: 'text' })}
                            onMeetingReschedule={() => { setDraft('Could we find another time? I was thinking…'); taRef.current?.focus(); }}
                          />
                        : m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                      <div className="mt-1 flex items-center justify-end gap-1">
                        <span className="tnum text-[10px] text-muted opacity-0 transition-opacity group-hover:opacity-100">
                          {fmtAESTTime(created)}
                        </span>
                        {isOutgoing && <Ticks status={deriveStatus(m)} />}
                      </div>
                    </div>

                    {/* Hover action buttons: reply + react */}
                    <div className={`absolute top-1 ${isOutgoing ? '-left-14' : '-right-14'} flex gap-1 opacity-0 transition-opacity group-hover:opacity-100`}>
                      <button type="button" aria-label="Reply" onClick={() => startReply(m)} className="rounded-full bg-white/8 p-1 text-muted ring-1 ring-white/12 hover:text-primary">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                          <path d="M9 17l-5-5 5-5M4 12h11a5 5 0 015 5v1" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                      <button type="button" aria-label="React" onClick={() => setReactingId(reactingId === m.id ? null : m.id)} className="rounded-full bg-white/8 p-1 text-muted ring-1 ring-white/12 hover:text-primary">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                          <circle cx="12" cy="12" r="9" /><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" strokeLinecap="round" />
                        </svg>
                      </button>
                      {admin && onPin && (
                        <button type="button" aria-label={m.pinned ? 'Unpin' : 'Pin'} onClick={() => onPin(m.id, !m.pinned)} className={`rounded-full bg-white/8 p-1 ring-1 ring-white/12 hover:text-primary ${m.pinned ? 'text-gold' : 'text-muted'}`}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M14 2l8 8-4 1-3 7-2-6-6-2 7-3 1-4z" /></svg>
                        </button>
                      )}
                    </div>

                    {reactions.length > 0 && (
                      <div className={`mt-0.5 flex gap-1 ${isOutgoing ? 'justify-end' : 'justify-start'}`}>
                        {reactions.map((r, i) => (
                          <button key={i} type="button" onClick={() => toggleReaction(m, r)} className="rounded-full bg-white/10 px-1.5 text-xs ring-1 ring-white/15 transition hover:bg-white/20">
                            {r}
                          </button>
                        ))}
                      </div>
                    )}

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
                          <button key={r} type="button" onClick={() => toggleReaction(m, r)} className="text-base transition-transform hover:scale-125">
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

      {/* Quick replies — INSERT into composer (do not auto-send) */}
      {lastIncoming && (
        <div className="flex gap-2 overflow-x-auto border-t border-white/10 px-4 py-2">
          {quickReplies.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => { setDraft((d) => (d ? `${d} ${q}` : q)); taRef.current?.focus(); setTimeout(autosize, 0); }}
              className="whitespace-nowrap rounded-full bg-white/8 px-3 py-1 text-xs text-secondary ring-1 ring-white/15 hover:bg-white/12 hover:text-primary"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Reply preview */}
      {replyTo && (
        <div className="flex items-center justify-between gap-2 border-t border-white/10 bg-white/4 px-4 py-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-brand">Replying to {replyTo.author}</p>
            <p className="truncate text-xs text-secondary">{replyTo.text}</p>
          </div>
          <button type="button" aria-label="Cancel reply" onClick={() => setReplyTo(null)} className="rounded-md px-1.5 text-muted hover:text-primary">×</button>
        </div>
      )}

      {/* Attach panel (rises above composer) */}
      {showAttach && (
        <div className="glass-4 absolute bottom-[76px] left-3 right-3 z-30 rounded-2xl p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-primary">Attach a file</p>
            <button type="button" aria-label="Close" onClick={() => { setShowAttach(false); setAttachError(null); }} className="rounded-md px-1.5 text-muted hover:text-primary">×</button>
          </div>
          <div
            onClick={pickFile}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition ${
              dragOver ? 'border-brand bg-brand-light/60 shadow-[0_0_24px_-4px_var(--accent-teal)]' : 'border-white/20 hover:border-brand/60'
            }`}
          >
            <p className="text-sm font-medium text-secondary">Drag &amp; drop files here, or click to browse</p>
            <p className="mt-1 text-xs text-muted">PDF · DOCX · XLSX · JPG · PNG · CSV — max 10 MB</p>
          </div>
          {attachError && <p className="mt-2 text-xs font-medium text-crimson">{attachError}</p>}
          <div className="my-3 flex items-center gap-2 text-[11px] uppercase tracking-wide text-faint">
            <span className="h-px flex-1 bg-white/10" />Or choose a quick attachment<span className="h-px flex-1 bg-white/10" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => attach('borrowing_summary')} className="rounded-lg bg-white/6 px-3 py-2 text-left text-sm text-secondary ring-1 ring-white/12 hover:bg-white/10 hover:text-primary">📊 Borrowing Summary</button>
            <button type="button" onClick={() => attach('document_request')} className="rounded-lg bg-white/6 px-3 py-2 text-left text-sm text-secondary ring-1 ring-white/12 hover:bg-white/10 hover:text-primary">📋 Document Checklist</button>
            <button type="button" onClick={() => attach('stage_update')} className="rounded-lg bg-white/6 px-3 py-2 text-left text-sm text-secondary ring-1 ring-white/12 hover:bg-white/10 hover:text-primary">🏠 Status Update</button>
            <button type="button" onClick={() => { setShowAttach(false); onScheduleMeeting?.(); }} className="rounded-lg bg-white/6 px-3 py-2 text-left text-sm text-secondary ring-1 ring-white/12 hover:bg-white/10 hover:text-primary disabled:opacity-50" disabled={!onScheduleMeeting}>📅 Meeting Invite</button>
          </div>
        </div>
      )}

      {/* Composer */}
      <div className="glass-3 relative border-t border-white/10 p-3">
        <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx,.xls,.xlsx,.csv,image/*,application/pdf" className="hidden" onChange={onFileChosen} />
        <div className="flex items-end gap-2">
          <button
            type="button"
            aria-label="Attach"
            onClick={() => { setShowAttach((s) => !s); setAttachError(null); }}
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
          <button
            type="button"
            aria-label="Record voice note"
            onClick={() => setVoiceOpen(true)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-secondary ring-1 ring-white/15 hover:bg-white/10 hover:text-primary"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0014 0M12 18v3" strokeLinecap="round" />
            </svg>
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

      {/* Image lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm" onClick={() => setLightbox(null)}>
          <div className="glass-5 relative max-h-[90vh] max-w-[90vw] overflow-hidden rounded-2xl p-3" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={lightbox.src} alt={lightbox.name} className="max-h-[78vh] max-w-full rounded-lg object-contain" />
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="truncate text-sm text-secondary">{lightbox.name}</span>
              <div className="flex gap-2">
                <a href={lightbox.src} download={lightbox.name} className="rounded-lg bg-brand px-3 py-1 text-xs font-semibold text-on-accent hover:brightness-110">Download</a>
                <button type="button" onClick={() => setLightbox(null)} className="rounded-lg px-3 py-1 text-xs font-semibold text-secondary ring-1 ring-white/20 hover:bg-white/10">Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Voice note placeholder modal */}
      {voiceOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={() => setVoiceOpen(false)}>
          <div className="glass-4 animate-pop relative w-full max-w-sm rounded-2xl p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand/20 text-brand">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0014 0M12 18v3" strokeLinecap="round" />
              </svg>
            </span>
            <h3 className="font-display text-lg font-semibold text-primary">Voice messages</h3>
            <p className="mt-1 text-sm text-secondary">Voice messages require backend storage integration. Contact your developer to enable.</p>
            <button type="button" onClick={() => setVoiceOpen(false)} className="mt-4 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-on-accent hover:brightness-110">Got it</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default MessageThread;
