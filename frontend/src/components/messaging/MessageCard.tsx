'use client';

import React from 'react';
import { Message } from '@/types';
import { downloadICS } from '@/lib/ics';

interface MessageCardProps {
  message: Message;
  /** Document-request "Upload documents" action. */
  onUpload?: () => void;
  /** Open an image attachment in the lightbox. */
  onImageClick?: (src: string, name: string) => void;
  /** Meeting-request actions. */
  onMeetingAccept?: () => void;
  onMeetingReschedule?: () => void;
}

function parseCard(message: Message): Record<string, unknown> | null {
  if (!message.cardData) return null;
  try {
    return JSON.parse(message.cardData) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function money(n: unknown): string {
  const v = typeof n === 'number' ? n : Number(n);
  if (Number.isNaN(v)) return '—';
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function fileSize(bytes: unknown): string {
  const b = typeof bytes === 'number' ? bytes : Number(bytes);
  if (Number.isNaN(b) || b <= 0) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

/** Format an ISO datetime in AEST, e.g. "Thu 26 Jun · 10:00 AM AEST". */
function fmtMeeting(iso: unknown): string {
  if (typeof iso !== 'string') return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-AU', {
      timeZone: 'Australia/Sydney',
      weekday: 'short', day: '2-digit', month: 'short',
      hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short',
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

export function MessageCard({ message, onUpload, onImageClick, onMeetingAccept, onMeetingReschedule }: MessageCardProps) {
  if (message.type === 'text') return null;
  const card = parseCard(message);

  if (message.type === 'attachment') {
    const fileName = String(card?.fileName ?? 'attachment');
    const mimeType = String(card?.mimeType ?? '');
    const dataUrl = typeof card?.dataUrl === 'string' ? (card.dataUrl as string) : '';
    const isImage = mimeType.startsWith('image/');
    const sizeLabel = fileSize(card?.size);

    if (isImage && dataUrl) {
      return (
        <div className="overflow-hidden rounded-xl">
          <button type="button" onClick={() => onImageClick?.(dataUrl, fileName)} className="block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={dataUrl} alt={fileName} className="h-[100px] w-[150px] cursor-zoom-in rounded-xl object-cover" />
          </button>
          <div className="mt-1 flex items-center justify-between gap-2 text-xs text-secondary">
            <span className="truncate">{fileName}</span>
            {sizeLabel && <span className="tnum shrink-0 text-muted">{sizeLabel}</span>}
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-3 rounded-xl border border-white/12 bg-white/6 p-2.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand/20 text-brand">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M14 2v6h6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-primary">{fileName}</span>
          <span className="block text-xs text-muted">{sizeLabel ? `${sizeLabel} · ` : ''}{(mimeType.split('/')[1] || 'file').toUpperCase()}</span>
        </span>
        <a href={dataUrl || undefined} download={fileName} className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold text-brand ring-1 ring-brand/40 hover:bg-brand-light">Download</a>
      </div>
    );
  }

  if (message.type === 'stage_update') {
    return (
      <div className="rounded-xl border border-brand/30 bg-brand-light/60 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-brand">Status update</p>
        <p className="mt-0.5 text-sm font-semibold text-primary">{String(card?.stage ?? 'Stage updated')}</p>
        {card?.group != null && <p className="text-xs text-muted">{String(card.group)}</p>}
        {card?.order != null && card?.total != null && (
          <p className="tnum mt-1 text-xs text-secondary">Stage {String(card.order)} of {String(card.total)}</p>
        )}
      </div>
    );
  }

  if (message.type === 'document_request') {
    const items = Array.isArray(card?.items) ? (card!.items as unknown[]) : [];
    return (
      <div className="rounded-xl border border-gold/30 bg-gold-light/60 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gold">Document request</p>
        <p className="mt-0.5 text-sm font-semibold text-primary">{String(card?.title ?? 'Documents required')}</p>
        <ul className="mt-1.5 space-y-1">
          {items.map((it, i) => (
            <li key={i} className="flex items-center gap-2 text-xs text-secondary">
              <span className="h-1.5 w-1.5 rounded-full bg-gold" /> {String(it)}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={onUpload}
          className="mt-2 rounded-lg px-2.5 py-1 text-xs font-semibold text-gold ring-1 ring-gold/40 hover:bg-gold-light disabled:opacity-50"
          disabled={!onUpload}
        >
          Upload documents
        </button>
      </div>
    );
  }

  if (message.type === 'borrowing_summary') {
    return (
      <div className="rounded-xl border border-emerald/30 bg-success-light/60 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald">Borrowing summary</p>
        <p className="tnum mt-0.5 font-display text-xl font-bold text-primary">{money(card?.maxBorrowing)}</p>
        <div className="tnum mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-secondary">
          {card?.rate != null && <span>Rate {String(card.rate)}%</span>}
          {card?.termYears != null && <span>{String(card.termYears)}yr term</span>}
          {card?.monthlyRepayment != null && <span>{money(card.monthlyRepayment)}/mo</span>}
        </div>
      </div>
    );
  }

  if (message.type === 'meeting_request') {
    const joinUrl = typeof card?.joinWebUrl === 'string' ? (card.joinWebUrl as string)
      : typeof card?.joinUrl === 'string' ? (card.joinUrl as string) : '';
    const startISO = typeof card?.startDateTime === 'string' ? (card.startDateTime as string) : '';
    const endISO = typeof card?.endDateTime === 'string' ? (card.endDateTime as string) : '';
    const when = startISO ? fmtMeeting(startISO) : String(card?.proposed ?? 'TBC');
    const title = String(card?.subject ?? card?.title ?? 'Proposed meeting');
    const attendees = Array.isArray(card?.attendees) ? (card!.attendees as unknown[]).map(String) : [];
    const isScheduled = Boolean(joinUrl || startISO);

    const addToCalendar = () => {
      const start = startISO ? new Date(startISO) : new Date();
      const end = endISO ? new Date(endISO) : new Date(start.getTime() + 30 * 60000);
      downloadICS({
        title,
        start,
        end,
        description: joinUrl ? `Join Teams meeting: ${joinUrl}` : 'LendVision meeting',
        location: joinUrl || 'Microsoft Teams',
        url: joinUrl || undefined,
      }, 'meeting.ics');
    };

    return (
      <div className="rounded-xl border border-sapphire/30 bg-accent-light/60 p-3">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-sapphire">
          🎥 {isScheduled ? 'Teams meeting scheduled' : 'Meeting request'}
        </p>
        <p className="mt-0.5 text-sm font-semibold text-primary">{title}</p>
        <p className="tnum mt-0.5 text-xs text-secondary">
          {when}{card?.durationMins != null ? ` · ${String(card.durationMins)} min` : ''}
        </p>

        {isScheduled ? (
          <>
            <div className="mt-2 flex flex-wrap gap-2">
              {joinUrl && (
                <a href={joinUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-sapphire/90 px-2.5 py-1 text-xs font-semibold text-on-accent hover:brightness-110">
                  Join Teams Meeting ↗
                </a>
              )}
              <button type="button" onClick={addToCalendar} className="rounded-lg px-2.5 py-1 text-xs font-semibold text-secondary ring-1 ring-white/20 hover:bg-white/10">
                Add to Calendar
              </button>
            </div>
            {attendees.length > 0 && (
              <p className="mt-2 border-t border-white/10 pt-1.5 text-[11px] text-muted">Attendees: {attendees.join(', ')}</p>
            )}
          </>
        ) : (
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={onMeetingAccept} disabled={!onMeetingAccept} className="rounded-lg bg-sapphire/90 px-2.5 py-1 text-xs font-semibold text-on-accent hover:brightness-110 disabled:opacity-50">Accept</button>
            <button type="button" onClick={onMeetingReschedule} disabled={!onMeetingReschedule} className="rounded-lg px-2.5 py-1 text-xs font-semibold text-secondary ring-1 ring-white/20 hover:bg-white/10 disabled:opacity-50">Reschedule</button>
          </div>
        )}
      </div>
    );
  }

  return null;
}

export default MessageCard;
