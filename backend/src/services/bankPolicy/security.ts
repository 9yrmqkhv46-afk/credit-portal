/**
 * 2026 Bank Policy Engine — security hardening utilities.
 *
 * Defence-in-depth helpers for the policy admin surface:
 *  - validateDocxUpload(): size cap + ZIP/OOXML magic-byte check so only real
 *    .docx files are parsed (rejects spoofed/oversized payloads before unzip).
 *  - sanitizeScenarioInput(): bounds array sizes and numeric ranges on
 *    engine inputs to prevent resource-exhaustion / absurd-value abuse.
 *  - createRateLimiter(): lightweight per-actor in-memory limiter middleware
 *    for mutating endpoints (complements the global auth limiter).
 */

import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { ScenarioInput } from './types';

// --- .docx upload validation ------------------------------------------------

export const MAX_DOCX_BYTES = 3 * 1024 * 1024; // 3 MB — policy docs are tiny
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // "PK\x03\x04" — all OOXML/.docx files

/** Throws if the buffer is not a plausible .docx (wrong size or not a ZIP). */
export function validateDocxUpload(buffer: Buffer): void {
  if (!buffer || buffer.length === 0) throw new Error('Empty upload.');
  if (buffer.length > MAX_DOCX_BYTES) throw new Error(`File too large (max ${Math.round(MAX_DOCX_BYTES / 1024 / 1024)}MB).`);
  if (buffer.length < 4 || !ZIP_MAGIC.every((b, i) => buffer[i] === b)) {
    throw new Error('Not a valid .docx file (bad file signature).');
  }
}

/** Decode a base64 (or data-URL) string to a Buffer, guarding decoded size. */
export function decodeBase64Upload(dataBase64: string): Buffer {
  const cleaned = dataBase64.replace(/^data:[^,]*,/, '');
  // base64 expands ~33%; cap the encoded length too to bound work.
  if (cleaned.length > MAX_DOCX_BYTES * 1.4) throw new Error('Upload exceeds the size limit.');
  const buffer = Buffer.from(cleaned, 'base64');
  validateDocxUpload(buffer);
  return buffer;
}

// --- scenario input sanitization -------------------------------------------

const MAX_ARRAY = 50;
const MAX_MONEY = 1_000_000_000; // $1B ceiling on any single amount

const clampNum = (n: unknown, min: number, max: number, fallback = 0): number => {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : fallback;
  return Math.min(max, Math.max(min, v));
};

/**
 * Return a defensively-bounded copy of a scenario input. Caps array lengths and
 * clamps numeric values so a malicious/huge payload cannot exhaust resources or
 * produce nonsensical results. Throws only when the core scenario is missing.
 */
export function sanitizeScenarioInput(input: ScenarioInput): ScenarioInput {
  if (!input || !input.scenario) throw new Error('A scenario is required.');

  const s = input.scenario;
  return {
    client: {
      numberOfAdults: clampNum(input.client?.numberOfAdults, 0, 20, 1),
      numberOfChildren: clampNum(input.client?.numberOfChildren, 0, 20, 0),
      isSelfEmployed: !!input.client?.isSelfEmployed,
    },
    incomeSources: (input.incomeSources || []).slice(0, MAX_ARRAY).map((i) => ({
      ...i, amount: clampNum(i.amount, 0, MAX_MONEY),
    })),
    expenses: {
      declaredMonthlyLiving: clampNum(input.expenses?.declaredMonthlyLiving, 0, MAX_MONEY),
      monthlyRent: input.expenses?.monthlyRent != null ? clampNum(input.expenses.monthlyRent, 0, MAX_MONEY) : undefined,
    },
    properties: (input.properties || []).slice(0, MAX_ARRAY).map((p) => ({
      ...p,
      estimatedValue: clampNum(p.estimatedValue, 0, MAX_MONEY),
      currentLoanBalance: clampNum(p.currentLoanBalance, 0, MAX_MONEY),
      currentRepaymentAmount: clampNum(p.currentRepaymentAmount, 0, MAX_MONEY),
      grossRentalIncomeMonthly: clampNum(p.grossRentalIncomeMonthly, 0, MAX_MONEY),
    })),
    debts: (input.debts || []).slice(0, MAX_ARRAY).map((d) => ({
      ...d,
      creditLimit: d.creditLimit != null ? clampNum(d.creditLimit, 0, MAX_MONEY) : undefined,
      currentBalance: d.currentBalance != null ? clampNum(d.currentBalance, 0, MAX_MONEY) : undefined,
      monthlyRepayment: d.monthlyRepayment != null ? clampNum(d.monthlyRepayment, 0, MAX_MONEY) : undefined,
    })),
    scenario: {
      ...s,
      targetLoanAmount: clampNum(s.targetLoanAmount, 0, MAX_MONEY),
      targetPropertyValue: clampNum(s.targetPropertyValue, 0, MAX_MONEY),
      termYears: clampNum(s.termYears, 1, 40, 30),
      interestRate: clampNum(s.interestRate, 0, 1, 0.06),
    },
  };
}

// --- rate limiting middleware ----------------------------------------------

interface Bucket { count: number; resetAt: number }

/**
 * Per-actor (email or IP) fixed-window rate limiter for mutating endpoints.
 * In-memory by design (mirrors the existing auth limiter) — suitable for a
 * single-node deployment; swap for a shared store when horizontally scaled.
 */
export function createRateLimiter(maxPerWindow: number, windowMs: number) {
  const buckets = new Map<string, Bucket>();
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    const key = req.user?.email || req.ip || 'unknown';
    const now = Date.now();
    const b = buckets.get(key);
    if (!b || now > b.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    if (b.count >= maxPerWindow) {
      res.status(429).json({ error: 'Too many policy changes in a short period. Please slow down.' });
      return;
    }
    b.count++;
    next();
  };
}
