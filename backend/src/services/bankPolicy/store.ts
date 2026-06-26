/**
 * DB-backed persistence + versioning for the 2026 Bank Policy Library.
 *
 * Each BankPolicyVersion row stores one immutable policy version (full
 * BankPolicy serialised as JSON). One active version per brandCode is used for
 * new calculations; older versions are retained for audit. The library is
 * seeded from the in-code BANK_POLICIES_2026 on first use.
 */

import { prisma } from '../../lib/prisma';
import { BankPolicy } from './types';
import { BANK_POLICIES_2026, POLICY_SEED_VERSION } from './policies';
import { computePolicyHash, verifyIntegrity, IntegrityResult } from './integrity';
import { diffPolicies, PolicyChange } from './policyDiff';

// prisma client is untyped in this sandbox (no `prisma generate`); cast so the
// new models compile. Types are real once generated on deploy.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

async function audit(brandCode: string, action: string, detail: string, actorEmail?: string): Promise<void> {
  try {
    await db.bankPolicyAudit.create({ data: { brandCode, action, detail, actorEmail: actorEmail ?? null } });
  } catch { /* audit is best-effort */ }
}

// Re-sync guard: only re-check the DB once per process (reset on deploy).
let synced = false;

/**
 * Seed / re-sync the library from code. On first run it seeds every bank; on
 * later deploys, if POLICY_SEED_VERSION has changed, each bank gets a fresh
 * ACTIVE version from code (older versions are deactivated but kept as history).
 * Idempotent: a no-op once the current seed version is present for every bank.
 */
export async function ensureSeed(): Promise<void> {
  if (synced) return;
  for (const p of BANK_POLICIES_2026) {
    const rows: VersionRow[] = await db.bankPolicyVersion.findMany({ where: { brandCode: p.brandCode } });
    const hasCurrent = rows.some((r) => {
      try { return (JSON.parse(r.policyJson) as { seedVersion?: string }).seedVersion === POLICY_SEED_VERSION; }
      catch { return false; }
    });
    if (hasCurrent) continue;

    const firstSeed = rows.length === 0;
    if (!firstSeed) {
      await db.bankPolicyVersion.updateMany({ where: { brandCode: p.brandCode }, data: { isActive: false } });
    }
    await db.bankPolicyVersion.create({
      data: {
        brandCode: p.brandCode,
        bankName: p.bankName,
        policyVersion: p.policyVersion,
        isActive: true,
        effectiveFrom: new Date(p.effectiveFrom),
        notes: p.notes,
        policyJson: JSON.stringify({ ...p, seedVersion: POLICY_SEED_VERSION, _integrity: computePolicyHash(p) }),
      },
    });
    await audit(p.brandCode, firstSeed ? 'SEED' : 'RESYNC', `${firstSeed ? 'Seeded' : 'Re-synced to'} ${p.policyVersion} (${POLICY_SEED_VERSION})`);
  }
  synced = true;
}

interface VersionRow {
  id: string; brandCode: string; bankName: string; policyVersion: string;
  isActive: boolean; effectiveFrom: Date; notes: string | null; policyJson: string;
  createdByEmail: string | null; createdAt: Date; updatedAt: Date;
}

function parse(row: VersionRow): BankPolicy {
  const p = JSON.parse(row.policyJson) as BankPolicy;
  // Keep identity fields authoritative from the row.
  return { ...p, id: row.id, brandCode: row.brandCode, bankName: row.bankName, policyVersion: row.policyVersion, isActive: row.isActive, notes: row.notes ?? p.notes };
}

/** All active policies (one per brand) parsed for the engine. */
export async function getActivePolicies(): Promise<BankPolicy[]> {
  await ensureSeed();
  const rows: VersionRow[] = await db.bankPolicyVersion.findMany({ where: { isActive: true }, orderBy: { brandCode: 'asc' } });
  return rows.map(parse);
}

/** Library list view: every version, newest first, with active flag. */
export async function listVersions(): Promise<Array<{
  id: string; brandCode: string; bankName: string; policyVersion: string;
  isActive: boolean; effectiveFrom: Date; updatedAt: Date; notes: string | null;
}>> {
  await ensureSeed();
  const rows: VersionRow[] = await db.bankPolicyVersion.findMany({ orderBy: [{ brandCode: 'asc' }, { createdAt: 'desc' }] });
  return rows.map((r) => ({
    id: r.id, brandCode: r.brandCode, bankName: r.bankName, policyVersion: r.policyVersion,
    isActive: r.isActive, effectiveFrom: r.effectiveFrom, updatedAt: r.updatedAt, notes: r.notes,
  }));
}

export async function getActiveByBrand(brandCode: string): Promise<BankPolicy | null> {
  await ensureSeed();
  const row: VersionRow | null = await db.bankPolicyVersion.findFirst({ where: { brandCode: { equals: brandCode }, isActive: true } });
  return row ? parse(row) : null;
}

export async function getVersionById(id: string): Promise<BankPolicy | null> {
  const row: VersionRow | null = await db.bankPolicyVersion.findUnique({ where: { id } });
  return row ? parse(row) : null;
}

export async function listVersionsForBrand(brandCode: string): Promise<VersionRow[]> {
  return db.bankPolicyVersion.findMany({ where: { brandCode }, orderBy: { createdAt: 'desc' } });
}

/** Persist an edited policy as a NEW version (optionally activated). */
export async function createVersion(policy: BankPolicy, opts: { activate?: boolean; actorEmail?: string } = {}): Promise<BankPolicy> {
  await ensureSeed();
  if (opts.activate) {
    await db.bankPolicyVersion.updateMany({ where: { brandCode: policy.brandCode }, data: { isActive: false } });
  }
  const row: VersionRow = await db.bankPolicyVersion.create({
    data: {
      brandCode: policy.brandCode,
      bankName: policy.bankName,
      policyVersion: policy.policyVersion,
      isActive: !!opts.activate,
      effectiveFrom: new Date(policy.effectiveFrom || new Date().toISOString()),
      notes: policy.notes ?? null,
      policyJson: JSON.stringify({ ...policy, _integrity: computePolicyHash(policy) }),
      createdByEmail: opts.actorEmail ?? null,
    },
  });
  await audit(policy.brandCode, 'CREATE_VERSION', `Saved ${policy.policyVersion}${opts.activate ? ' (activated)' : ''}`, opts.actorEmail);
  return parse(row);
}

export async function activateVersion(id: string, actorEmail?: string): Promise<BankPolicy | null> {
  const row: VersionRow | null = await db.bankPolicyVersion.findUnique({ where: { id } });
  if (!row) return null;
  await db.bankPolicyVersion.updateMany({ where: { brandCode: row.brandCode }, data: { isActive: false } });
  const updated: VersionRow = await db.bankPolicyVersion.update({ where: { id }, data: { isActive: true } });
  await audit(row.brandCode, 'ACTIVATE', `Activated ${row.policyVersion}`, actorEmail);
  return parse(updated);
}

export async function cloneVersion(id: string, newVersionLabel: string, actorEmail?: string): Promise<BankPolicy | null> {
  const row: VersionRow | null = await db.bankPolicyVersion.findUnique({ where: { id } });
  if (!row) return null;
  const base = parse(row);
  const clone: BankPolicy = { ...base, policyVersion: newVersionLabel, isActive: false };
  return createVersion(clone, { activate: false, actorEmail });
}

export async function listAudit(brandCode?: string, limit = 100): Promise<Array<{ brandCode: string; action: string; detail: string | null; actorEmail: string | null; createdAt: Date }>> {
  return db.bankPolicyAudit.findMany({
    where: brandCode ? { brandCode } : {},
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

// ---------------------------------------------------------------------------
// Feature: Policy change timeline (parameter-level diffs between versions)
// ---------------------------------------------------------------------------

export interface PolicyTimelineEntry {
  id: string;
  policyVersion: string;
  effectiveFrom: Date;
  createdAt: Date;
  createdByEmail: string | null;
  isActive: boolean;
  isSeed: boolean;
  changeCount: number;
  changes: PolicyChange[];
}

/**
 * Chronological history for a bank (newest first). Each entry lists the
 * parameter-level changes vs the immediately preceding version, so reviewers
 * can see exactly what moved, when, and by whom.
 */
export async function getPolicyTimeline(brandCode: string): Promise<PolicyTimelineEntry[]> {
  await ensureSeed();
  const rows: VersionRow[] = await db.bankPolicyVersion.findMany({ where: { brandCode }, orderBy: { createdAt: 'asc' } });
  const parsed = rows.map(parse);
  const entries: PolicyTimelineEntry[] = rows.map((row, i) => {
    const changes = diffPolicies(i > 0 ? parsed[i - 1] : null, parsed[i]);
    return {
      id: row.id,
      policyVersion: row.policyVersion,
      effectiveFrom: row.effectiveFrom,
      createdAt: row.createdAt,
      createdByEmail: row.createdByEmail,
      isActive: row.isActive,
      isSeed: i === 0,
      changeCount: changes.length,
      changes,
    };
  });
  return entries.reverse(); // newest first
}

/** Diff any two versions by id (order-independent: returns from -> to). */
export async function diffVersions(fromId: string, toId: string): Promise<{ from: BankPolicy; to: BankPolicy; changes: PolicyChange[] } | null> {
  const [from, to] = await Promise.all([getVersionById(fromId), getVersionById(toId)]);
  if (!from || !to) return null;
  return { from, to, changes: diffPolicies(from, to) };
}

// ---------------------------------------------------------------------------
// Feature: tamper-evident integrity verification
// ---------------------------------------------------------------------------

export interface VersionIntegrity extends IntegrityResult { id: string; brandCode: string; policyVersion: string }

/** Recompute the stored version's hash and compare to the embedded one. */
export async function verifyVersionIntegrity(id: string): Promise<VersionIntegrity | null> {
  const row: VersionRow | null = await db.bankPolicyVersion.findUnique({ where: { id } });
  if (!row) return null;
  const raw = JSON.parse(row.policyJson) as Record<string, unknown>;
  return { id: row.id, brandCode: row.brandCode, policyVersion: row.policyVersion, ...verifyIntegrity(raw) };
}

/** Verify integrity across all active policies (compliance sweep). */
export async function verifyActiveIntegrity(): Promise<VersionIntegrity[]> {
  await ensureSeed();
  const rows: VersionRow[] = await db.bankPolicyVersion.findMany({ where: { isActive: true } });
  return rows.map((row) => {
    const raw = JSON.parse(row.policyJson) as Record<string, unknown>;
    return { id: row.id, brandCode: row.brandCode, policyVersion: row.policyVersion, ...verifyIntegrity(raw) };
  });
}

// ---------------------------------------------------------------------------
// Feature: rollback + library backup / restore
// ---------------------------------------------------------------------------

/** Activate a prior version, recorded distinctly as a ROLLBACK in the audit log. */
export async function rollbackToVersion(id: string, actorEmail?: string): Promise<BankPolicy | null> {
  const row: VersionRow | null = await db.bankPolicyVersion.findUnique({ where: { id } });
  if (!row) return null;
  await db.bankPolicyVersion.updateMany({ where: { brandCode: row.brandCode }, data: { isActive: false } });
  const updated: VersionRow = await db.bankPolicyVersion.update({ where: { id }, data: { isActive: true } });
  await audit(row.brandCode, 'ROLLBACK', `Rolled back to ${row.policyVersion}`, actorEmail);
  return parse(updated);
}

export interface LibrarySnapshot {
  exportedAt: string;
  seedVersion: string;
  policies: BankPolicy[];
}

/** Full point-in-time snapshot of all active policies (for backup / DR). */
export async function exportLibrary(): Promise<LibrarySnapshot> {
  const policies = await getActivePolicies();
  return { exportedAt: new Date().toISOString(), seedVersion: POLICY_SEED_VERSION, policies };
}

/** Restore policies from a snapshot, each saved as a new ACTIVE version. */
export async function restoreLibrary(snapshot: LibrarySnapshot, actorEmail?: string): Promise<{ restored: number }> {
  await ensureSeed();
  let restored = 0;
  for (const policy of snapshot.policies || []) {
    if (!policy?.brandCode) continue;
    await createVersion({ ...policy, policyVersion: `${policy.policyVersion}+restore-${new Date().toISOString().slice(0, 10)}` }, { activate: true, actorEmail });
    await audit(policy.brandCode, 'RESTORE', `Restored from snapshot ${snapshot.exportedAt}`, actorEmail);
    restored++;
  }
  return { restored };
}
