/**
 * 2026 Bank Policy Engine — tamper-evident integrity hashing.
 *
 * Banking-grade control: every stored policy version carries a SHA-256 hash of
 * its canonical content. Re-computing the hash on read detects any out-of-band
 * tampering with the persisted policy JSON (e.g. a direct DB edit).
 *
 * The hash is computed over a CANONICAL JSON form (keys sorted, volatile/
 * identity fields excluded) so logically-identical policies hash identically
 * regardless of property ordering or storage metadata.
 */

import { createHash } from 'crypto';
import { BankPolicy } from './types';

/** Fields excluded from the integrity hash (storage metadata / volatile). */
const EXCLUDED = new Set(['id', 'isActive', '_integrity', 'seedVersion', 'updatedAt', 'createdAt']);

/** Deterministically stringify an object with sorted keys. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      if (EXCLUDED.has(key)) continue;
      out[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/** Compute the canonical SHA-256 hex digest for a policy's content. */
export function computePolicyHash(policy: BankPolicy | Record<string, unknown>): string {
  const canonical = JSON.stringify(canonicalize(policy));
  return createHash('sha256').update(canonical).digest('hex');
}

export interface IntegrityResult {
  ok: boolean;
  expected: string | null; // hash stored at creation
  actual: string;          // hash recomputed now
}

/**
 * Verify a stored policy object (parsed from its row JSON, including the
 * embedded `_integrity` field) against a freshly computed hash.
 */
export function verifyIntegrity(stored: Record<string, unknown>): IntegrityResult {
  const expected = typeof stored._integrity === 'string' ? stored._integrity : null;
  const actual = computePolicyHash(stored);
  return { ok: expected != null && expected === actual, expected, actual };
}
