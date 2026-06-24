'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ApplicationStage } from '@/types';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';

interface Props {
  stages: ApplicationStage[];
  totalStages: number;
  admin?: boolean;
  onComplete?: (stageId: string) => void;
  onSkip?: (stageId: string) => void;
  onReset?: (stageId: string) => void;
  onSaveNote?: (stageId: string, note: string) => void;
  onSaveDueDate?: (stageId: string, dueDate: string) => void;
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Inline check icon (no icon deps). */
const CheckIcon = (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
    <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function dueDateTone(dueDate: string | null): { tone: 'amber' | 'teal' | 'crimson'; label: string } | null {
  if (!dueDate) return null;
  const d = new Date(dueDate);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = startOfDay(d) - startOfDay(today);
  const fmt = d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
  if (diff < 0) return { tone: 'crimson', label: `Overdue · ${fmt}` };
  if (diff === 0) return { tone: 'teal', label: `Today · ${fmt}` };
  return { tone: 'amber', label: `Due · ${fmt}` };
}

const TONE_STYLE: Record<string, string> = {
  amber: 'bg-warning-light text-warning ring-1 ring-warning/40',
  teal: 'bg-brand-light text-brand ring-1 ring-brand/40',
  crimson: 'bg-danger-light text-danger ring-1 ring-danger/40',
};

function StatusBadge({ status }: { status: ApplicationStage['status'] }) {
  const map: Record<string, string> = {
    completed: 'bg-success-light text-success ring-1 ring-success/40',
    active: 'bg-brand-light text-brand ring-1 ring-brand/40',
    upcoming: 'bg-white/8 text-muted ring-1 ring-white/15',
    skipped: 'bg-warning-light text-warning ring-1 ring-warning/40',
  };
  return (
    <span className={`tnum inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${map[status]}`}>
      {status}
    </span>
  );
}

/** Lightweight confetti burst on a transient canvas. Respects reduced motion. */
function fireConfetti() {
  if (prefersReducedMotion()) return;
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:120';
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) { canvas.remove(); return; }
  const colors = ['#00c4d4', '#f0b429', '#00e587', '#3d8eff'];
  const parts = Array.from({ length: 140 }, () => ({
    x: window.innerWidth / 2,
    y: window.innerHeight / 3,
    vx: (Math.random() - 0.5) * 12,
    vy: Math.random() * -12 - 4,
    s: Math.random() * 6 + 3,
    c: colors[Math.floor(Math.random() * colors.length)],
    rot: Math.random() * Math.PI,
  }));
  let frame = 0;
  const tick = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    parts.forEach((p) => {
      p.vy += 0.4;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += 0.2;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s);
      ctx.restore();
    });
    frame++;
    if (frame < 130) requestAnimationFrame(tick);
    else canvas.remove();
  };
  requestAnimationFrame(tick);
}

export function ApplicationTimeline({
  stages, totalStages, admin = false,
  onComplete, onSkip, onReset, onSaveNote, onSaveDueDate,
}: Props) {
  const ordered = useMemo(() => [...stages].sort((a, b) => a.orderIndex - b.orderIndex), [stages]);
  const completedCount = ordered.filter((s) => s.status === 'completed').length;
  const activeStage = ordered.find((s) => s.status === 'active');
  const nextStage = activeStage
    ? ordered.find((s) => s.orderIndex > activeStage.orderIndex && s.status === 'upcoming')
    : ordered.find((s) => s.status === 'upcoming');
  const pct = totalStages > 0 ? Math.round((completedCount / totalStages) * 100) : 0;
  const currentNumber = activeStage ? activeStage.orderIndex : completedCount;

  // Confetti when stage 18 (complete) becomes completed.
  const prevCompleteStatus = useRef<string | null>(null);
  useEffect(() => {
    const last = ordered.find((s) => s.key === 'complete');
    if (last) {
      if (prevCompleteStatus.current && prevCompleteStatus.current !== 'completed' && last.status === 'completed') {
        fireConfetti();
      }
      prevCompleteStatus.current = last.status;
    }
  }, [ordered]);

  // Admin: 5s undo countdown after a mark action.
  const [undo, setUndo] = useState<{ stageId: string; secs: number } | null>(null);
  const undoTimer = useRef<number | null>(null);
  useEffect(() => {
    if (!undo) return;
    if (undo.secs <= 0) { setUndo(null); return; }
    undoTimer.current = window.setTimeout(() => setUndo((u) => (u ? { ...u, secs: u.secs - 1 } : null)), 1000);
    return () => { if (undoTimer.current) window.clearTimeout(undoTimer.current); };
  }, [undo]);

  const doComplete = (id: string) => { onComplete?.(id); setUndo({ stageId: id, secs: 5 }); };
  const doSkip = (id: string) => { onSkip?.(id); setUndo({ stageId: id, secs: 5 }); };
  const doUndo = (id: string) => { onReset?.(id); setUndo(null); };

  return (
    <div className="gpu-layer">
      {/* Progress summary */}
      <div className="glass-3 mb-6 rounded-2xl p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand">Application progress</p>
            <p className="tnum mt-1 font-display text-2xl font-bold text-primary">
              Stage {currentNumber} of {totalStages}
            </p>
          </div>
          <p className="tnum font-display text-3xl font-bold text-brand">
            <AnimatedNumber value={pct} suffix="%" />
          </p>
        </div>
        <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="bar-fill h-full rounded-full"
            style={{ width: `${pct}%`, background: 'linear-gradient(90deg, var(--color-brand-dark), var(--accent-teal))', boxShadow: '0 0 14px -2px rgba(0,196,212,0.7)' }}
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span className="text-secondary">Current: <span className="font-medium text-primary">{activeStage?.label ?? '—'}</span></span>
          <span className="text-secondary">Next: <span className="font-medium text-primary">{nextStage?.label ?? '—'}</span></span>
        </div>
      </div>

      {/* Rail */}
      <ol className="relative ml-1">
        {ordered.map((stage, i) => {
          const prev = ordered[i - 1];
          const showGroupHeader = !prev || prev.group !== stage.group;
          const due = stage.hasDate ? dueDateTone(stage.dueDate) : null;
          const isCompleted = stage.status === 'completed';
          const isActive = stage.status === 'active';
          const isSkipped = stage.status === 'skipped';
          // Connector fill: full teal when this stage is completed.
          return (
            <li key={stage.id} className="stagger-in" style={{ animationDelay: `${Math.min(i * 80, 1200)}ms` }}>
              {showGroupHeader && (
                <div className="mb-2 mt-4 flex items-center gap-2 pl-9 first:mt-0">
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-muted">{stage.group}</span>
                  <span className="h-px flex-1 bg-white/10" />
                </div>
              )}
              <div className="relative flex gap-4 pb-4">
                {/* Connector + node column */}
                <div className="relative flex w-7 shrink-0 flex-col items-center">
                  {i < ordered.length - 1 && (
                    <span className="absolute top-7 bottom-[-16px] w-0.5 bg-white/10">
                      <span
                        className="rail-fill absolute left-0 top-0 w-full"
                        style={{ height: isCompleted ? '100%' : '0%', background: 'var(--accent-teal)', boxShadow: '0 0 8px rgba(0,196,212,0.7)' }}
                      />
                    </span>
                  )}
                  <span
                    className={[
                      'relative z-10 flex h-7 w-7 items-center justify-center rounded-full border-2 transition-all',
                      isCompleted ? 'border-brand bg-brand text-on-accent stage-glow' : '',
                      isActive ? 'stage-pulse border-brand bg-brand-light text-brand' : '',
                      isSkipped ? 'border-warning bg-warning-light text-warning' : '',
                      !isCompleted && !isActive && !isSkipped ? 'border-white/20 bg-white/5 text-muted' : '',
                    ].join(' ')}
                  >
                    {isCompleted ? CheckIcon : isSkipped ? '✕' : <span className="tnum text-[11px] font-bold">{stage.orderIndex}</span>}
                  </span>
                </div>

                {/* Card */}
                <div className="glass-2 min-w-0 flex-1 rounded-xl p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <h4 className={`text-sm font-semibold ${isCompleted || isActive ? 'text-primary' : 'text-secondary'}`}>{stage.label}</h4>
                      <span className="rounded-full bg-white/8 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted ring-1 ring-white/12">{stage.group}</span>
                    </div>
                    <StatusBadge status={stage.status} />
                  </div>

                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    {stage.completedAt && (
                      <span className="tnum text-xs text-muted">
                        Completed {new Date(stage.completedAt).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })}
                      </span>
                    )}
                    {due && (
                      <span className={`tnum rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONE_STYLE[due.tone]}`}>{due.label}</span>
                    )}
                  </div>

                  {stage.note && (
                    <p className="mt-1.5 text-xs italic text-muted">“{stage.note}”</p>
                  )}

                  {admin && (
                    <AdminStageControls
                      stage={stage}
                      undoActive={undo?.stageId === stage.id}
                      undoSecs={undo?.secs ?? 0}
                      onComplete={() => doComplete(stage.id)}
                      onSkip={() => doSkip(stage.id)}
                      onUndo={() => doUndo(stage.id)}
                      onSaveNote={(n) => onSaveNote?.(stage.id, n)}
                      onSaveDueDate={(d) => onSaveDueDate?.(stage.id, d)}
                    />
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function AdminStageControls({
  stage, undoActive, undoSecs, onComplete, onSkip, onUndo, onSaveNote, onSaveDueDate,
}: {
  stage: ApplicationStage;
  undoActive: boolean;
  undoSecs: number;
  onComplete: () => void;
  onSkip: () => void;
  onUndo: () => void;
  onSaveNote: (note: string) => void;
  onSaveDueDate: (dueDate: string) => void;
}) {
  const [noteDraft, setNoteDraft] = useState(stage.note ?? '');
  const [showNote, setShowNote] = useState(false);
  const [showDate, setShowDate] = useState(false);
  const [dateDraft, setDateDraft] = useState(stage.dueDate ? stage.dueDate.split('T')[0] : '');

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/10 pt-2.5">
      {undoActive ? (
        <button
          type="button"
          onClick={onUndo}
          className="tnum rounded-lg px-2.5 py-1 text-xs font-semibold text-secondary ring-1 ring-white/20 hover:bg-white/10"
        >
          Undo ({undoSecs}s)
        </button>
      ) : (
        <>
          <button
            type="button"
            onClick={onComplete}
            className="rounded-lg px-2.5 py-1 text-xs font-semibold text-brand ring-1 ring-brand/40 hover:bg-brand-light"
          >
            Mark Complete
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="rounded-lg px-2.5 py-1 text-xs font-semibold text-warning ring-1 ring-warning/40 hover:bg-warning-light"
          >
            Mark Skipped
          </button>
          <button
            type="button"
            onClick={() => setShowNote((s) => !s)}
            className="rounded-lg px-2.5 py-1 text-xs font-semibold text-secondary ring-1 ring-white/20 hover:bg-white/10"
          >
            Add Note
          </button>
          {stage.hasDate && (
            <button
              type="button"
              onClick={() => setShowDate((s) => !s)}
              className="rounded-lg px-2.5 py-1 text-xs font-semibold text-secondary ring-1 ring-white/20 hover:bg-white/10"
            >
              Set Date
            </button>
          )}
        </>
      )}

      {showNote && (
        <input
          autoFocus
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { onSaveNote(noteDraft); setShowNote(false); } }}
          placeholder="Note… (Enter to save)"
          aria-label={`Note for ${stage.label}`}
          className="glass-input mt-1 w-full rounded-lg border border-white/15 px-2.5 py-1.5 text-xs text-primary focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
      )}
      {showDate && stage.hasDate && (
        <input
          type="date"
          value={dateDraft}
          onChange={(e) => { setDateDraft(e.target.value); onSaveDueDate(e.target.value); setShowDate(false); }}
          aria-label={`Due date for ${stage.label}`}
          className="glass-input mt-1 rounded-lg border border-white/15 px-2.5 py-1.5 text-xs text-primary focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
      )}
    </div>
  );
}

export default ApplicationTimeline;
