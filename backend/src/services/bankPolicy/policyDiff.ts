/**
 * 2026 Bank Policy Engine — parameter-level policy diffing.
 *
 * Computes a human-readable, parameter-level diff between two BankPolicy
 * versions, reusing the same flat serialization the editable Word document
 * exposes (docxFormat.serializePolicyParams). This powers the Policy Change
 * Timeline and the version-compare API.
 */

import { BankPolicy } from './types';
import { serializePolicyParams } from './docxFormat';

/** Identity/metadata keys that always differ between versions — excluded from diffs. */
const METADATA_KEYS = new Set(['brandCode', 'bankName', 'policyVersion', 'effectiveFrom']);

export interface PolicyChange {
  key: string;          // e.g. "investment.maxDti"
  label: string;        // e.g. "Residential investment — Maximum DTI (x)"
  product: string;      // "ownerOcc" | "investment" | "commercial" | "identity"
  before: string | null;
  after: string | null;
  direction: 'increase' | 'decrease' | 'changed';
}

function productOf(key: string): string {
  const head = key.split('.')[0];
  return head === 'ownerOcc' || head === 'investment' || head === 'commercial' ? head : 'identity';
}

function direction(before: string | null, after: string | null): PolicyChange['direction'] {
  const a = Number(before);
  const b = Number(after);
  if (Number.isFinite(a) && Number.isFinite(b)) {
    if (b > a) return 'increase';
    if (b < a) return 'decrease';
  }
  return 'changed';
}

/**
 * Diff two policies. Returns one entry per parameter whose value changed.
 * `prev` may be null (e.g. the first/seed version) — then there are no changes.
 */
export function diffPolicies(prev: BankPolicy | null, next: BankPolicy): PolicyChange[] {
  if (!prev) return [];
  const prevMap = new Map(serializePolicyParams(prev).map((l) => [l.key, l]));
  const nextLines = serializePolicyParams(next);
  const changes: PolicyChange[] = [];

  for (const line of nextLines) {
    if (METADATA_KEYS.has(line.key)) continue;
    const before = prevMap.get(line.key)?.value ?? null;
    const after = line.value ?? null;
    if (before !== after) {
      changes.push({ key: line.key, label: line.label, product: productOf(line.key), before, after, direction: direction(before, after) });
    }
  }
  return changes;
}

/** A compact one-line summary of a change list (for audit detail / tooltips). */
export function summariseChanges(changes: PolicyChange[]): string {
  if (changes.length === 0) return 'No parameter changes';
  const head = changes.slice(0, 3).map((c) => `${c.key}: ${c.before}→${c.after}`);
  const more = changes.length > 3 ? ` (+${changes.length - 3} more)` : '';
  return head.join(', ') + more;
}
