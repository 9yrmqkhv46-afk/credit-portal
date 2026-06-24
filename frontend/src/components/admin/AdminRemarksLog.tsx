'use client';

import React, { useMemo, useState } from 'react';
import api from '@/lib/api';
import { Note } from '@/types';
import { useToast } from '@/components/ui/Toast';

const TAG_OPTIONS = ['General', 'Follow Up', 'Urgent', 'Risk Flag', 'Lender Note', 'Legal Note', 'Client Callback'];

const TAG_TONE: Record<string, string> = {
  Urgent: 'bg-danger-light text-danger ring-danger/40',
  'Risk Flag': 'bg-danger-light text-danger ring-danger/40',
  'Follow Up': 'bg-warning-light text-warning ring-warning/40',
  'Client Callback': 'bg-warning-light text-warning ring-warning/40',
  'Lender Note': 'bg-brand-light text-brand ring-brand/40',
  'Legal Note': 'bg-accent-light text-sapphire ring-sapphire/40',
  General: 'bg-white/8 text-secondary ring-white/15',
};

function parseTags(tags: string | null): string[] {
  return (tags || '').split(',').map((t) => t.trim()).filter(Boolean);
}

/** Highlight search matches with a teal mark. */
function highlight(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const q = query.trim();
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded bg-brand/30 px-0.5 text-primary">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

interface Props {
  clientId: string;
  initialNotes: Note[];
}

/**
 * Admin Remarks Log (Mandate 4B). Admin-only — this component is only rendered
 * by the admin client-detail page (which is gated behind the admin layout's
 * role check), so the remarks DOM never reaches a client view.
 */
export function AdminRemarksLog({ clientId, initialNotes }: Props) {
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [draft, setDraft] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [posting, setPosting] = useState(false);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [menuId, setMenuId] = useState<string | null>(null);
  const { toast } = useToast();

  const toggleTag = (t: string) =>
    setSelectedTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const post = async () => {
    if (!draft.trim()) return;
    setPosting(true);
    try {
      const res = await api.post(`/admin/clients/${clientId}/notes`, {
        content: draft.trim(),
        visibility: 'ADMIN_ONLY',
        tags: selectedTags.join(','),
      });
      setNotes((n) => [res.data.note, ...n]);
      setDraft('');
      setSelectedTags([]);
      toast('Remark posted', { accent: 'teal' });
    } catch {
      toast('Failed to post remark', { accent: 'crimson' });
    } finally {
      setPosting(false);
    }
  };

  const patch = async (id: string, data: Record<string, unknown>) => {
    try {
      const res = await api.patch(`/admin/clients/${clientId}/notes/${id}`, data);
      setNotes((n) => n.map((x) => (x.id === id ? res.data.note : x)));
    } catch {
      toast('Update failed', { accent: 'crimson' });
    }
  };

  const remove = async (id: string) => {
    try {
      await api.delete(`/admin/clients/${clientId}/notes/${id}`);
      setNotes((n) => n.filter((x) => x.id !== id));
      toast('Remark deleted', { accent: 'gold' });
    } catch {
      toast('Delete failed', { accent: 'crimson' });
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matches = notes.filter((n) => !q || n.content.toLowerCase().includes(q) || (n.tags || '').toLowerCase().includes(q));
    // Pinned first, then newest.
    return [...matches].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [notes, search]);

  return (
    <div className="space-y-4">
      {/* Composer */}
      <div className="space-y-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          placeholder="Add a remark…"
          aria-label="New remark"
          className="glass-input w-full resize-none rounded-xl border border-white/15 px-3 py-2 text-sm text-primary focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
        <div className="flex flex-wrap gap-1.5">
          {TAG_OPTIONS.map((t) => {
            const on = selectedTags.includes(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => toggleTag(t)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 transition-colors ${on ? TAG_TONE[t] : 'bg-white/5 text-muted ring-white/12 hover:text-secondary'}`}
              >
                {t}
              </button>
            );
          })}
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={post}
            disabled={posting || !draft.trim()}
            className="rounded-xl bg-gradient-to-br from-brand to-brand-dark px-4 py-2 text-sm font-semibold text-on-accent shadow-lg shadow-brand/25 transition hover:brightness-110 disabled:opacity-40"
          >
            Post Remark
          </button>
        </div>
      </div>

      {/* Search */}
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search remarks…"
        aria-label="Search remarks"
        className="glass-input w-full rounded-xl border border-white/15 px-3 py-2 text-sm text-primary focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
      />

      {/* Feed */}
      <div className="space-y-3">
        {filtered.length === 0 && <p className="text-sm text-muted">No remarks{search ? ' match your search' : ' yet'}.</p>}
        {filtered.map((note) => {
          const tags = parseTags(note.tags);
          return (
            <div
              key={note.id}
              className={`glass-3 relative rounded-xl p-3 ${note.pinned ? 'ring-1 ring-gold/60' : ''}`}
              style={note.pinned ? { borderColor: 'rgba(240,180,41,0.6)' } : undefined}
            >
              <div className="flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand to-brand-dark text-xs font-bold text-on-accent">A</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="tnum text-xs text-muted">{new Date(note.createdAt).toLocaleString()}</span>
                    {note.pinned && <span className="text-[11px] font-semibold text-gold">📌 Pinned</span>}
                  </div>
                  {tags.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {tags.map((t) => (
                        <span key={t} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${TAG_TONE[t] || TAG_TONE.General}`}>{t}</span>
                      ))}
                    </div>
                  )}
                  {editingId === note.id ? (
                    <div className="mt-2 flex gap-2">
                      <input
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { patch(note.id, { content: editDraft }); setEditingId(null); } }}
                        className="glass-input flex-1 rounded-lg border border-white/15 px-2 py-1 text-sm text-primary focus:border-brand focus:outline-none"
                        autoFocus
                      />
                      <button type="button" onClick={() => { patch(note.id, { content: editDraft }); setEditingId(null); }} className="text-xs font-semibold text-brand">Save</button>
                    </div>
                  ) : (
                    <p className="mt-1.5 text-sm text-primary">{highlight(note.content, search)}</p>
                  )}
                </div>

                {/* Overflow menu */}
                <div className="relative">
                  <button type="button" aria-label="Remark actions" onClick={() => setMenuId(menuId === note.id ? null : note.id)} className="rounded-md px-2 py-1 text-muted hover:bg-white/10 hover:text-primary">⋯</button>
                  {menuId === note.id && (
                    <div className="absolute right-0 z-20 mt-1 w-32 rounded-xl glass-4 p-1 text-sm">
                      <button type="button" onClick={() => { setEditingId(note.id); setEditDraft(note.content); setMenuId(null); }} className="block w-full rounded-lg px-3 py-1.5 text-left text-secondary hover:bg-white/10 hover:text-primary">Edit</button>
                      <button type="button" onClick={() => { patch(note.id, { pinned: !note.pinned }); setMenuId(null); }} className="block w-full rounded-lg px-3 py-1.5 text-left text-secondary hover:bg-white/10 hover:text-primary">{note.pinned ? 'Unpin' : 'Pin'}</button>
                      <button type="button" onClick={() => { remove(note.id); setMenuId(null); }} className="block w-full rounded-lg px-3 py-1.5 text-left text-danger hover:bg-danger-light">Delete</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default AdminRemarksLog;
