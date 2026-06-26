/**
 * Tests for the senior-grade governance features:
 *   - policyDiff (parameter-level change detection)
 *   - integrity (tamper-evident SHA-256 hashing)
 *   - policyImpact (guardrail validation, impact preview, sensitivity)
 *   - security (upload validation, input sanitization, rate limiting)
 *
 * These cover the pure/deterministic logic (no DB) so they run in CI.
 */

import {
  BANK_POLICIES_2026, BankPolicy, ScenarioInput,
  diffPolicies, summariseChanges,
  computePolicyHash, verifyIntegrity,
  validatePolicy, previewImpact, sensitivity, CANONICAL_SCENARIOS,
  validateDocxUpload, decodeBase64Upload, sanitizeScenarioInput, createRateLimiter,
} from '../services/bankPolicy';

const cba = BANK_POLICIES_2026.find((p) => p.brandCode === 'CBA') as BankPolicy;
const clone = (p: BankPolicy): BankPolicy => JSON.parse(JSON.stringify(p));

describe('policyDiff', () => {
  it('detects parameter-level changes with direction', () => {
    const next = clone(cba);
    next.residentialInvestment.maxDti = cba.residentialInvestment.maxDti + 0.5;
    next.residentialOwnerOcc.maxLvr = cba.residentialOwnerOcc.maxLvr - 0.05;
    const changes = diffPolicies(cba, next);
    const dti = changes.find((c) => c.key === 'investment.maxDti')!;
    const lvr = changes.find((c) => c.key === 'ownerOcc.maxLvr')!;
    expect(dti.direction).toBe('increase');
    expect(lvr.direction).toBe('decrease');
    expect(summariseChanges(changes)).toMatch(/investment.maxDti/);
  });

  it('returns no changes against a null predecessor or identical policy', () => {
    expect(diffPolicies(null, cba)).toEqual([]);
    expect(diffPolicies(cba, clone(cba))).toEqual([]);
  });

  it('ignores metadata-only changes (version label)', () => {
    const next = clone(cba);
    next.policyVersion = 'CBA_2099.99';
    expect(diffPolicies(cba, next)).toEqual([]);
  });
});

describe('integrity', () => {
  it('is stable regardless of key ordering and excludes volatile fields', () => {
    const a = clone(cba);
    // Same content but different volatile metadata — hash must be identical.
    const withVolatile = { ...a, id: 'different-id', isActive: !a.isActive, updatedAt: 'now', createdAt: 'then' };
    expect(computePolicyHash(a)).toBe(computePolicyHash(withVolatile as BankPolicy));
  });

  it('detects tampering', () => {
    const stored: Record<string, unknown> = { ...clone(cba) };
    stored._integrity = computePolicyHash(cba);
    expect(verifyIntegrity(stored).ok).toBe(true);

    // Tamper with a value after hashing.
    (stored as any).residentialInvestment.maxDti = 9;
    expect(verifyIntegrity(stored).ok).toBe(false);
  });
});

describe('policyImpact — validation guardrails', () => {
  it('passes a seed policy', () => {
    expect(validatePolicy(cba).valid).toBe(true);
  });

  it('flags an out-of-range DTI as an error (blocks activation)', () => {
    const bad = clone(cba);
    bad.residentialInvestment.maxDti = 15;
    const { valid, issues } = validatePolicy(bad);
    expect(valid).toBe(false);
    expect(issues.some((i) => i.level === 'error' && i.code === 'DTI_RANGE')).toBe(true);
  });

  it('warns (not errors) on an unusual but legal value', () => {
    const odd = clone(cba);
    odd.residentialInvestment.serviceabilityBufferBps = 150; // low but legal
    const { valid, issues } = validatePolicy(odd);
    expect(valid).toBe(true);
    expect(issues.some((i) => i.level === 'warning' && i.code === 'BUFFER_LOW')).toBe(true);
  });

  it('catches IO term exceeding loan term', () => {
    const bad = clone(cba);
    bad.residentialInvestment.interestOnlyTreatment = { allowed: true, maxIoYears: 99, ioAssessmentRateLoadingBps: 0 };
    expect(validatePolicy(bad).valid).toBe(false);
  });
});

describe('policyImpact — preview', () => {
  it('shows reduced borrowing capacity when the buffer rises', () => {
    const tighter = clone(cba);
    tighter.residentialOwnerOcc.serviceabilityBufferBps += 200;
    tighter.residentialInvestment.serviceabilityBufferBps += 200;
    const preview = previewImpact(cba, tighter);
    expect(preview.scenarios.length).toBe(CANONICAL_SCENARIOS.length);
    // A higher buffer should not increase capacity for any scenario.
    expect(preview.scenarios.every((s) => s.deltaAmount <= 0)).toBe(true);
    expect(preview.summary.looser).toBe(0);
  });

  it('reports zero delta when the policy is unchanged', () => {
    const preview = previewImpact(cba, clone(cba));
    expect(preview.scenarios.every((s) => s.deltaAmount === 0)).toBe(true);
    expect(preview.summary.avgDeltaPct).toBe(0);
  });
});

describe('policyImpact — sensitivity', () => {
  it('produces monotonically non-increasing capacity as the rate rises', () => {
    const { points } = sensitivity(CANONICAL_SCENARIOS[0].input, cba, 'interestRate', 7);
    expect(points.length).toBe(7);
    for (let i = 1; i < points.length; i++) {
      expect(points[i].maxBorrow).toBeLessThanOrEqual(points[i - 1].maxBorrow);
    }
  });
});

describe('security', () => {
  it('rejects non-zip uploads and oversized payloads', () => {
    expect(() => validateDocxUpload(Buffer.from('not a zip'))).toThrow(/signature/i);
    expect(() => validateDocxUpload(Buffer.alloc(0))).toThrow(/empty/i);
    const big = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(4 * 1024 * 1024)]);
    expect(() => validateDocxUpload(big)).toThrow(/too large/i);
  });

  it('accepts a real zip signature via base64', () => {
    const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x01, 0x02]);
    expect(() => decodeBase64Upload(zip.toString('base64'))).not.toThrow();
  });

  it('clamps oversized arrays and absurd numbers', () => {
    const huge: ScenarioInput = {
      client: { numberOfAdults: 999, numberOfChildren: -5 },
      incomeSources: Array.from({ length: 200 }, () => ({ type: 'SALARY_PRIMARY', amount: 1e15, frequency: 'ANNUAL' })),
      expenses: { declaredMonthlyLiving: -100 },
      properties: Array.from({ length: 200 }, (_, i) => ({ id: `p${i}`, type: 'INVESTMENT', estimatedValue: 1e15, currentLoanBalance: 0, currentRepaymentAmount: 0, grossRentalIncomeMonthly: 0, isIncludedInCalc: true })),
      debts: [],
      scenario: { purpose: 'INVESTMENT', targetLoanAmount: 1e15, targetPropertyValue: 1e15, termYears: 999, interestRate: 5, repaymentType: 'IO' },
    };
    const safe = sanitizeScenarioInput(huge);
    expect(safe.client.numberOfAdults).toBeLessThanOrEqual(20);
    expect(safe.client.numberOfChildren).toBe(0);
    expect(safe.incomeSources.length).toBe(50);
    expect(safe.properties.length).toBe(50);
    expect(safe.scenario.termYears).toBeLessThanOrEqual(40);
    expect(safe.scenario.interestRate).toBeLessThanOrEqual(1);
    expect(safe.expenses.declaredMonthlyLiving).toBe(0);
  });

  it('rate limiter blocks after the configured number of calls', () => {
    const limiter = createRateLimiter(2, 60_000);
    const req: any = { user: { email: 'a@b.com' } };
    let blocked = 0;
    const res: any = { status: () => ({ json: () => { blocked++; } }) };
    let passed = 0;
    const next = () => { passed++; };
    limiter(req, res, next); limiter(req, res, next); limiter(req, res, next);
    expect(passed).toBe(2);
    expect(blocked).toBe(1);
  });
});
