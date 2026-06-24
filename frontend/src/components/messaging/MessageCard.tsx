'use client';

import React from 'react';
import { Message } from '@/types';

interface MessageCardProps {
  message: Message;
  /** Document-request "Upload documents" action. */
  onUpload?: () => void;
  /** Meeting-request actions. */
  onMeetingAccept?: () => void;
  onMeetingReschedule?: () => void;
}

/** Parse the JSON cardData string safely. */
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

/**
 * Renders the structured CARD message types (stage_update, document_request,
 * borrowing_summary, meeting_request, attachment) with their action affordances.
 * Returns null for plain text messages.
 */
export function MessageCard({ message, onUpload, onMeetingAccept, onMeetingReschedule }: MessageCardProps) {
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <a href={dataUrl} download={fileName} target="_blank" rel="noopener noreferrer">
            <img src={dataUrl} alt={fileName} className="max-h-64 w-full max-w-xs rounded-xl object-cover" />
          </a>
          <div className="mt-1 flex items-center justify-between gap-2 text-xs text-secondary">
            <span className="truncate">{fileName}</span>
            {sizeLabel && <span className="tnum shrink-0 text-muted">{sizeLabel}</span>}
          </div>
        </div>
      );
    }

    return (
      <a
        href={dataUrl || undefined}
        download={fileName}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 rounded-xl border border-white/12 bg-white/6 p-2.5 transition hover:bg-white/10"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand/20 text-brand">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M14 2v6h6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-primary">{fileName}</span>
          <span className="block text-xs text-muted">{sizeLabel ? `${sizeLabel} · ` : ''}Tap to download</span>
        </span>
      </a>
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
    return (
      <div className="rounded-xl border border-sapphire/30 bg-accent-light/60 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-sapphire">Meeting request</p>
        <p className="mt-0.5 text-sm font-semibold text-primary">{String(card?.title ?? 'Proposed meeting')}</p>
        <p className="tnum mt-0.5 text-xs text-secondary">
          {String(card?.proposed ?? 'TBC')}{card?.durationMins != null ? ` · ${String(card.durationMins)} min` : ''}
        </p>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={onMeetingAccept}
            disabled={!onMeetingAccept}
            className="rounded-lg px-2.5 py-1 text-xs font-semibold text-on-accent bg-sapphire/90 hover:brightness-110 disabled:opacity-50"
          >
            Accept
          </button>
          <button
            type="button"
            onClick={onMeetingReschedule}
            disabled={!onMeetingReschedule}
            className="rounded-lg px-2.5 py-1 text-xs font-semibold text-secondary ring-1 ring-white/20 hover:bg-white/10 disabled:opacity-50"
          >
            Reschedule
          </button>
        </div>
      </div>
    );
  }

  return null;
}

export default MessageCard;
