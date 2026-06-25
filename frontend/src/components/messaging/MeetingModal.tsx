'use client';

import React, { useState } from 'react';
import api from '@/lib/api';
import { useToast } from '@/components/ui/Toast';

export interface CreatedMeeting {
  id: string;
  subject: string;
  startDateTime: string;
  endDateTime: string;
  joinWebUrl: string;
  joinUrl: string;
  simulated: boolean;
  attendees: string[];
  durationMins: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  defaultSubject?: string;
  defaultAttendee?: string;
  /** Called with the created meeting so the caller can inject a Meeting Card. */
  onCreated: (meeting: CreatedMeeting) => void;
}

const DURATIONS = [30, 45, 60];

function defaultDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Schedule a Teams Meeting (Mandate 5 — Section D). Collects the meeting
 * details and calls POST /api/meetings/create, then hands the result back to
 * the caller to render a Meeting Card in the thread.
 */
export function MeetingModal({ open, onClose, defaultSubject = '', defaultAttendee = '', onCreated }: Props) {
  const { toast } = useToast();
  const [subject, setSubject] = useState(defaultSubject || 'Loan Review');
  const [date, setDate] = useState(defaultDate());
  const [time, setTime] = useState('10:00');
  const [duration, setDuration] = useState(30);
  const [kind, setKind] = useState<'teams' | 'video' | 'phone'>('teams');
  const [attendees, setAttendees] = useState<string[]>(defaultAttendee ? [defaultAttendee] : []);
  const [attendeeDraft, setAttendeeDraft] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const addAttendee = () => {
    const v = attendeeDraft.trim();
    if (v && !attendees.includes(v)) setAttendees((a) => [...a, v]);
    setAttendeeDraft('');
  };

  const submit = async () => {
    if (!subject.trim()) { toast('Please enter a meeting title', { accent: 'crimson' }); return; }
    const start = new Date(`${date}T${time}:00`);
    if (Number.isNaN(start.getTime())) { toast('Please pick a valid date and time', { accent: 'crimson' }); return; }
    const end = new Date(start.getTime() + duration * 60000);
    setSubmitting(true);
    try {
      const res = await api.post('/meetings/create', {
        subject: subject.trim(),
        startDateTime: start.toISOString(),
        endDateTime: end.toISOString(),
        attendeeEmails: attendees,
      });
      const m = res.data.meeting;
      onCreated({
        id: m.id,
        subject: subject.trim(),
        startDateTime: m.startDateTime,
        endDateTime: m.endDateTime,
        joinWebUrl: m.joinWebUrl,
        joinUrl: m.joinUrl,
        simulated: Boolean(m.simulated),
        attendees,
        durationMins: duration,
      });
      toast(m.simulated ? 'Meeting created (simulated — connect MS365 for live Teams links)' : 'Teams meeting created', { accent: m.simulated ? 'gold' : 'emerald' });
      onClose();
    } catch {
      toast('Could not create the meeting', { accent: 'crimson' });
    } finally {
      setSubmitting(false);
    }
  };

  const label = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-muted';
  const input = 'glass-input w-full rounded-xl border border-white/15 px-3 py-2 text-sm text-primary focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30';
  const notesField = notes; // referenced so the optional notes field is tracked

  return (
    <div className="fixed inset-0 z-[110] overflow-y-auto" role="dialog" aria-modal="true" aria-label="Schedule a Teams Meeting">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
        <div className="glass-4 animate-pop relative w-full max-w-lg rounded-2xl p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold text-primary">Schedule a Teams Meeting</h3>
            <button type="button" aria-label="Close" onClick={onClose} className="rounded-md px-2 text-muted hover:text-primary">×</button>
          </div>

          <div className="space-y-4">
            <div>
              <label className={label} htmlFor="m-subject">Meeting title</label>
              <input id="m-subject" className={input} value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label} htmlFor="m-date">Date</label>
                <input id="m-date" type="date" className={input} value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div>
                <label className={label} htmlFor="m-time">Start time</label>
                <input id="m-time" type="time" className={input} value={time} onChange={(e) => setTime(e.target.value)} />
              </div>
            </div>

            <div>
              <span className={label}>Duration</span>
              <div className="flex gap-2">
                {DURATIONS.map((d) => (
                  <button key={d} type="button" onClick={() => setDuration(d)} className={`rounded-lg px-3 py-1.5 text-sm font-medium ring-1 transition ${duration === d ? 'bg-brand/20 text-brand ring-brand/50' : 'text-secondary ring-white/15 hover:bg-white/10'}`}>
                    {d} min
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className={label}>Meeting type</span>
              <div className="flex gap-2">
                {([['teams', 'Teams'], ['video', '🎥 Video'], ['phone', '📞 Phone']] as [typeof kind, string][]).map(([k, lbl]) => (
                  <button key={k} type="button" onClick={() => setKind(k)} className={`rounded-lg px-3 py-1.5 text-sm font-medium ring-1 transition ${kind === k ? 'bg-brand/20 text-brand ring-brand/50' : 'text-secondary ring-white/15 hover:bg-white/10'}`}>
                    {lbl}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className={label} htmlFor="m-att">Attendees</label>
              <div className="flex gap-2">
                <input id="m-att" type="email" placeholder="name@example.com" className={input} value={attendeeDraft}
                  onChange={(e) => setAttendeeDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAttendee(); } }} />
                <button type="button" onClick={addAttendee} className="shrink-0 rounded-lg px-3 text-sm font-semibold text-brand ring-1 ring-brand/40 hover:bg-brand-light">+ Add</button>
              </div>
              {attendees.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {attendees.map((a) => (
                    <span key={a} className="flex items-center gap-1 rounded-full bg-white/8 px-2 py-0.5 text-xs text-secondary ring-1 ring-white/15">
                      {a}
                      <button type="button" aria-label={`Remove ${a}`} onClick={() => setAttendees((arr) => arr.filter((x) => x !== a))} className="text-muted hover:text-crimson">×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className={label} htmlFor="m-notes">Notes (optional)</label>
              <textarea id="m-notes" rows={2} className={`${input} resize-none`} value={notesField} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-semibold text-secondary ring-1 ring-white/15 hover:bg-white/10">Cancel</button>
            <button type="button" onClick={submit} disabled={submitting} className="ripple-btn flex items-center gap-2 rounded-xl bg-gradient-to-br from-brand to-brand-dark px-4 py-2 text-sm font-semibold text-on-accent shadow-lg shadow-brand/30 hover:brightness-110 disabled:opacity-50">
              {submitting && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-transparent" />}
              Create Teams Meeting ✦
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MeetingModal;
