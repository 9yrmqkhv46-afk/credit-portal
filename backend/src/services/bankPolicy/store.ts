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
import { BANK_POLICIES_2026 } from './policies';

// prisma client is untyped in this sandbox (no `prisma generate`); cast so the
// new models compile. Types are real once generated on deploy.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

async function audit(brandCode: string, action: string, detail: string, actorEmail?: string): Promise<void> {
  try {
    await db.bankPolicyAudit.create({ data: { brandCode, action, detail, actorEmail: actorEmail ?? null } });
  } catch { /* audit is best-effort */ }
}

/** Seed the library from code on first use (idempotent). */
export async function ensureSeed(): Promise<void> {
  const count = await db.bankPolicyVersion.count();
  if (count > 0) return;
  for (const p of BANK_POLICIES_2026) {
    await db.bankPolicyVersion.create({
      data: {
        brandCode: p.brandCode,
        bankName: p.bankName,
        policyVersion: p.policyVersion,
        isActive: true,
        effectiveFrom: new Date(p.effectiveFrom),
        notes: p.notes,
        policyJson: JSON.stringify(p),
      },
    });
    await audit(p.brandCode, 'SEED', `Seeded ${p.policyVersion}`);
  }
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
      policyJson: JSON.stringify(policy),
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
