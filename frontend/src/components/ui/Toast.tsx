'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

type ToastAccent = 'teal' | 'gold' | 'emerald' | 'crimson';

interface ToastItem {
  id: number;
  message: string;
  accent: ToastAccent;
  durationMs: number;
}

interface ToastContextValue {
  toast: (message: string, opts?: { accent?: ToastAccent; durationMs?: number }) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const ACCENT_VAR: Record<ToastAccent, string> = {
  teal: 'var(--accent-teal)',
  gold: 'var(--accent-gold)',
  emerald: 'var(--accent-emerald)',
  crimson: 'var(--accent-crimson)',
};

/**
 * Glass toast system (Mandate design consistency): glass-4 panel with an accent
 * left bar and an auto-dismiss countdown progress bar. Stacks bottom-right.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const remove = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const toast = useCallback<ToastContextValue['toast']>((message, opts) => {
    const id = ++idRef.current;
    const item: ToastItem = {
      id,
      message,
      accent: opts?.accent ?? 'teal',
      durationMs: opts?.durationMs ?? 4000,
    };
    setToasts((t) => [...t, item]);
    window.setTimeout(() => remove(id), item.durationMs + 400);
  }, [remove]);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(92vw,360px)] flex-col gap-2"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className="toast glass-4 pointer-events-auto overflow-hidden rounded-xl p-3 pl-4 text-sm text-primary shadow-xl"
            style={{ borderLeft: `3px solid ${ACCENT_VAR[t.accent]}` }}
          >
            <p className="pr-6">{t.message}</p>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => remove(t.id)}
              className="absolute right-2 top-2 rounded-md px-1.5 text-muted hover:text-primary"
            >
              ×
            </button>
            <span
              className="toast-progress absolute bottom-0 left-0 h-0.5 w-full"
              style={{ background: ACCENT_VAR[t.accent], animationDuration: `${t.durationMs}ms` }}
            />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  // Graceful no-op fallback so components never crash if used outside provider.
  if (!ctx) {
    return { toast: () => { /* no-op */ } };
  }
  return ctx;
}

export default ToastProvider;
