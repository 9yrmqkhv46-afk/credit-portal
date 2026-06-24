'use client';

import React from 'react';
import { Message } from '@/types';

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

/**
 * Renders the structured CARD message types (stage_update, document_request,
 * borrowing_summary, meeting_request) with their action affordances.
 * Returns null for plain text messages.
 */
export function MessageCard({ message }: { message: Message }) {
  if (message.type === 'text') return null;
  const card = parseCard(message);

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
        <button type="button" className="mt-2 rounded-lg px-2.5 py-1 text-xs font-semibold text-gold ring-1 ring-gold/40 hover:bg-gold-light">
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
          <button type="button" className="rounded-lg px-2.5 py-1 text-xs font-semibold text-on-accent bg-sapphire/90 hover:brightness-110">Accept</button>
          <button type="button" className="rounded-lg px-2.5 py-1 text-xs font-semibold text-secondary ring-1 ring-white/20 hover:bg-white/10">Reschedule</button>
        </div>
      </div>
    );
  }

  return null;
}

export default MessageCard;
