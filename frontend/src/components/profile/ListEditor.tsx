'use client';

import React, { useEffect, useState } from 'react';
import api from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';

export interface FieldDef {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select' | 'checkbox';
  options?: { value: string; label: string }[];
  /** Span full width of the grid row. */
  full?: boolean;
}

interface Props {
  /** API base for the collection, e.g. '/client/employments'. */
  endpoint: string;
  /** Key of the array in the GET response, e.g. 'employments'. */
  responseKey: string;
  fields: FieldDef[];
  /** Default body for a newly-created row. */
  newItem: Record<string, unknown>;
  /** Build a short heading for each row. */
  rowTitle: (item: Record<string, unknown>, index: number) => string;
  addLabel: string;
  emptyLabel?: string;
}

type Row = Record<string, unknown> & { id: string };

/**
 * Generic CRUD list editor for a collection of records (employment history,
 * bank accounts, non-property assets). Each row is editable inline and saved
 * independently; the list re-fetches after create/delete.
 */
export function ListEditor({ endpoint, responseKey, fields, newItem, rowTitle, addLabel, emptyLabel }: Props) {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const res = await api.get(endpoint);
      setRows((res.data[responseKey] || []) as Row[]);
    } catch { /* profile may not exist yet */ }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [endpoint]);

  const setField = (id: string, key: string, value: unknown) => {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [key]: value } : r)));
  };

  /** Strip server-managed fields and coerce blanks for the API. */
  const cleanPayload = (row: Row) => {
    const out: Record<string, unknown> = {};
    for (const f of fields) {
      const v = row[f.key];
      if (f.type === 'number') out[f.key] = v === '' || v === undefined || v === null ? null : Number(v);
      else if (f.type === 'checkbox') out[f.key] = Boolean(v);
      else out[f.key] = v === '' || v === undefined ? null : v;
    }
    return out;
  };

  const add = async () => {
    setBusy(true);
    try {
      await api.post(endpoint, newItem);
      await load();
    } catch {
      toast('Could not add row — save your profile first', { accent: 'crimson' });
    } finally {
      setBusy(false);
    }
  };

  const save = async (row: Row) => {
    try {
      await api.put(`${endpoint}/${row.id}`, cleanPayload(row));
      toast('Saved', { accent: 'teal' });
    } catch {
      toast('Save failed — check the fields', { accent: 'crimson' });
    }
  };

  const remove = async (row: Row) => {
    try {
      await api.delete(`${endpoint}/${row.id}`);
      await load();
    } catch {
      toast('Could not remove row', { accent: 'crimson' });
    }
  };

  return (
    <div className="space-y-3">
      {rows.length === 0 && (
        <p className="text-sm text-muted">{emptyLabel || 'None added yet.'}</p>
      )}
      {rows.map((row, i) => (
        <div key={row.id} className="rounded-xl border border-white/12 bg-white/4 p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-primary">{rowTitle(row, i)}</p>
            <button type="button" onClick={() => remove(row)} className="text-xs font-medium text-crimson hover:underline">Remove</button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {fields.map((f) => {
              const val = row[f.key];
              if (f.type === 'checkbox') {
                return (
                  <label key={f.key} className="flex cursor-pointer items-center gap-2 text-sm text-secondary">
                    <input type="checkbox" checked={Boolean(val)} onChange={(e) => setField(row.id, f.key, e.target.checked)} className="h-4 w-4 rounded text-brand focus:ring-brand" />
                    {f.label}
                  </label>
                );
              }
              if (f.type === 'select') {
                return (
                  <Select key={f.key} label={f.label} options={f.options || []} value={(val as string) || ''} onChange={(e) => setField(row.id, f.key, e.target.value)} className={f.full ? 'md:col-span-2' : ''} />
                );
              }
              return (
                <Input
                  key={f.key}
                  label={f.label}
                  type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                  value={f.type === 'date' && typeof val === 'string' ? val.split('T')[0] : (val as string | number | undefined) ?? ''}
                  onChange={(e) => setField(row.id, f.key, e.target.value)}
                  className={f.full ? 'md:col-span-2' : ''}
                />
              );
            })}
          </div>
          <div className="mt-3 flex justify-end">
            <button type="button" onClick={() => save(row)} className="rounded-lg bg-gradient-to-br from-brand to-brand-dark px-3 py-1.5 text-xs font-semibold text-on-accent hover:brightness-110">Save</button>
          </div>
        </div>
      ))}
      <button type="button" onClick={add} disabled={busy} className="rounded-xl px-3 py-2 text-sm font-semibold text-brand ring-1 ring-brand/40 hover:bg-brand-light disabled:opacity-50">
        + {addLabel}
      </button>
    </div>
  );
}

export default ListEditor;
