/**
 * 2026 Bank Policy Engine — guardrail validation, impact preview & sensitivity.
 *
 * Three senior-grade controls that run BEFORE a policy change goes live:
 *
 *  - validatePolicy(): sanity guardrails. ERRORS block activation (clearly
 *    broken / unsafe values); WARNINGS are advisory (unusual but allowed).
 *  - previewImpact(): runs a fixed set of canonical client scenarios through the
 *    deterministic engine for the CURRENT vs CANDIDATE policy, surfacing how
 *    borrowing capacity changes — so an admin sees real-world effect first.
 *  - sensitivity(): sweeps one scenario input (rate / deposit / loan) to show
 *    how max-borrow / pass-fail responds.
 *
 * All numeric work is deterministic (delegates to runBankCalc).
 */

import { BankPolicy, ProductPolicy, ScenarioInput, ProductType } from './types';
import { runBankCalc } from './engine';

// ---------------------------------------------------------------------------
// Guardrail validation
// ---------------------------------------------------------------------------

export interface PolicyIssue {
  level: 'error' | 'warning';
  code: string;
  message: string;
  path?: string;
}

const PRODUCTS: Array<[ProductType, keyof BankPolicy, string]> = [
  ['OWNER_OCC', 'residentialOwnerOcc', 'ownerOcc'],
  ['INVESTMENT', 'residentialInvestment', 'investment'],
  ['COMMERCIAL_PROPERTY_LIGHT', 'commercialPropertyLight', 'commercial'],
];

function checkProduct(p: ProductPolicy, prefix: string, issues: PolicyIssue[]): void {
  const err = (code: string, message: string, path: string) => issues.push({ level: 'error', code, message: `${prefix}: ${message}`, path: `${prefix}.${path}` });
  const warn = (code: string, message: string, path: string) => issues.push({ level: 'warning', code, message: `${prefix}: ${message}`, path: `${prefix}.${path}` });

  if (!(p.maxLvr > 0 && p.maxLvr <= 1.05)) err('LVR_RANGE', `maxLvr ${p.maxLvr} must be between 0 and 1.05`, 'maxLvr');
  else if (p.maxLvr > 0.98) warn('LVR_HIGH', `maxLvr ${p.maxLvr} is unusually high (>98%)`, 'maxLvr');

  if (!(p.maxDti >= 3 && p.maxDti <= 9)) err('DTI_RANGE', `maxDti ${p.maxDti} must be between 3 and 9`, 'maxDti');
  else if (p.maxDti < 5 || p.maxDti > 7.5) warn('DTI_UNUSUAL', `maxDti ${p.maxDti} is outside the typical 5–7.5x band`, 'maxDti');

  if (!(p.serviceabilityBufferBps >= 100 && p.serviceabilityBufferBps <= 600)) err('BUFFER_RANGE', `buffer ${p.serviceabilityBufferBps}bps must be between 100 and 600`, 'serviceabilityBufferBps');
  else if (p.serviceabilityBufferBps < 200) warn('BUFFER_LOW', `buffer ${p.serviceabilityBufferBps}bps is below the APRA-style 3% (300bps) norm`, 'serviceabilityBufferBps');

  if (!(p.baseRateAssumption >= 0.02 && p.baseRateAssumption <= 0.15)) err('BASE_RATE_RANGE', `baseRateAssumption ${p.baseRateAssumption} must be between 0.02 and 0.15`, 'baseRateAssumption');

  if (p.minLoanAmount >= p.maxLoanAmount) err('LOAN_BOUNDS', `minLoanAmount must be < maxLoanAmount`, 'minLoanAmount');
  if (p.minTermYears >= p.maxTermYears) err('TERM_BOUNDS', `minTermYears must be < maxTermYears`, 'minTermYears');

  const sh = p.incomeShadingRules;
  for (const [name, pct] of [
    ['salaryPrimary', sh.salaryPrimary.acceptPct], ['salarySecondary', sh.salarySecondary.acceptPct],
    ['rental', sh.rental.acceptPct], ['govBenefits', sh.govBenefits.acceptPct],
    ['businessIncome', sh.businessIncome.acceptPct], ['other', sh.other.acceptPct],
  ] as const) {
    if (!(pct >= 0 && pct <= 1)) err('ACCEPT_PCT_RANGE', `${name}.acceptPct ${pct} must be between 0 and 1`, `incomeShadingRules.${name}.acceptPct`);
  }
  if (!(sh.rental.vacancyFactorPct >= 0 && sh.rental.vacancyFactorPct <= 0.3)) warn('VACANCY_UNUSUAL', `rental vacancy factor ${sh.rental.vacancyFactorPct} is outside 0–0.3`, 'incomeShadingRules.rental.vacancyFactorPct');

  const cc = p.debtTreatmentRules.creditCardRepaymentPctOfLimit;
  if (!(cc >= 0 && cc <= 0.1)) err('CC_PCT_RANGE', `creditCard %-of-limit ${cc} must be between 0 and 0.1`, 'debtTreatmentRules.creditCardRepaymentPctOfLimit');

  if (p.interestOnlyTreatment?.allowed && (p.interestOnlyTreatment.maxIoYears ?? 0) > p.maxTermYears) {
    err('IO_TERM', `maxIoYears exceeds the maximum loan term`, 'interestOnlyTreatment.maxIoYears');
  }
  if (p.propertyTreatmentRules.maxPropertiesConsidered < 1) err('PROP_COUNT', `maxPropertiesConsidered must be ≥ 1`, 'propertyTreatmentRules.maxPropertiesConsidered');
}

/** Run all guardrail checks. `valid` is false only when there are ERROR issues. */
export function validatePolicy(policy: BankPolicy): { valid: boolean; issues: PolicyIssue[] } {
  const issues: PolicyIssue[] = [];
  for (const [, field, prefix] of PRODUCTS) checkProduct(policy[field] as ProductPolicy, prefix, issues);

  // Cross-product sanity: investment/commercial LVR usually ≤ owner-occ.
  const oo = policy.residentialOwnerOcc, inv = policy.residentialInvestment, com = policy.commercialPropertyLight;
  if (inv.maxLvr > oo.maxLvr) issues.push({ level: 'warning', code: 'LVR_INV_GT_OO', message: `Investment maxLvr (${inv.maxLvr}) exceeds owner-occ (${oo.maxLvr}) — unusual`, path: 'investment.maxLvr' });
  if (com.maxLvr > inv.maxLvr) issues.push({ level: 'warning', code: 'LVR_COM_GT_INV', message: `Commercial maxLvr (${com.maxLvr}) exceeds investment (${inv.maxLvr}) — unusual`, path: 'commercial.maxLvr' });

  return { valid: !issues.some((i) => i.level === 'error'), issues };
}

// ---------------------------------------------------------------------------
// Canonical scenarios (representative client profiles)
// ---------------------------------------------------------------------------

export interface CanonicalScenario { id: string; label: string; input: ScenarioInput }

export const CANONICAL_SCENARIOS: CanonicalScenario[] = [
  {
    id: 'fhb_payg',
    label: 'First-home buyer (PAYG couple)',
    input: {
      client: { numberOfAdults: 2, numberOfChildren: 0 },
      incomeSources: [
        { type: 'SALARY_PRIMARY', amount: 120_000, frequency: 'ANNUAL' },
        { type: 'SALARY_PRIMARY', amount: 85_000, frequency: 'ANNUAL' },
      ],
      expenses: { declaredMonthlyLiving: 3_500 },
      properties: [],
      debts: [{ id: 'cc', type: 'CREDIT_CARD', source: 'STANDALONE', creditLimit: 10_000 }],
      scenario: { purpose: 'OWNER_OCC', targetLoanAmount: 650_000, targetPropertyValue: 800_000, termYears: 30, interestRate: 0.062, repaymentType: 'PI' },
    },
  },
  {
    id: 'upgrader_family',
    label: 'Upgrader family (2 kids)',
    input: {
      client: { numberOfAdults: 2, numberOfChildren: 2 },
      incomeSources: [
        { type: 'SALARY_PRIMARY', amount: 160_000, frequency: 'ANNUAL' },
        { type: 'SALARY_SECONDARY', amount: 40_000, frequency: 'ANNUAL' },
      ],
      expenses: { declaredMonthlyLiving: 5_500 },
      properties: [{ id: 'home', type: 'OWNER_OCC', estimatedValue: 900_000, currentLoanBalance: 400_000, currentRepaymentAmount: 2400, grossRentalIncomeMonthly: 0, isIncludedInCalc: true }],
      debts: [{ id: 'car', type: 'CAR_LOAN', source: 'STANDALONE', creditLimit: 0 }],
      scenario: { purpose: 'OWNER_OCC', targetLoanAmount: 850_000, targetPropertyValue: 1_200_000, termYears: 30, interestRate: 0.062, repaymentType: 'PI' },
    },
  },
  {
    id: 'portfolio_investor',
    label: 'Portfolio investor (3 properties)',
    input: {
      client: { numberOfAdults: 2, numberOfChildren: 0 },
      incomeSources: [{ type: 'SALARY_PRIMARY', amount: 180_000, frequency: 'ANNUAL' }],
      expenses: { declaredMonthlyLiving: 5_000 },
      properties: [
        { id: 'p1', type: 'INVESTMENT', estimatedValue: 800_000, currentLoanBalance: 400_000, currentRepaymentAmount: 2200, grossRentalIncomeMonthly: 2600, isIncludedInCalc: true },
        { id: 'p2', type: 'INVESTMENT', estimatedValue: 700_000, currentLoanBalance: 350_000, currentRepaymentAmount: 1900, grossRentalIncomeMonthly: 2300, isIncludedInCalc: true },
        { id: 'p3', type: 'INVESTMENT', estimatedValue: 600_000, currentLoanBalance: 300_000, currentRepaymentAmount: 1600, grossRentalIncomeMonthly: 2000, isIncludedInCalc: true },
      ],
      debts: [],
      scenario: { purpose: 'INVESTMENT', targetLoanAmount: 800_000, targetPropertyValue: 1_000_000, termYears: 30, interestRate: 0.062, repaymentType: 'IO' },
    },
  },
  {
    id: 'self_employed',
    label: 'Self-employed professional',
    input: {
      client: { numberOfAdults: 2, numberOfChildren: 1, isSelfEmployed: true },
      incomeSources: [{ type: 'BUSINESS', amount: 220_000, frequency: 'ANNUAL', yearsFinancials: 3 }],
      expenses: { declaredMonthlyLiving: 5_000 },
      properties: [],
      debts: [{ id: 'cc', type: 'CREDIT_CARD', source: 'STANDALONE', creditLimit: 20_000 }],
      scenario: { purpose: 'OWNER_OCC', targetLoanAmount: 900_000, targetPropertyValue: 1_150_000, termYears: 30, interestRate: 0.062, repaymentType: 'PI' },
    },
  },
];

// ---------------------------------------------------------------------------
// Impact preview (candidate vs current)
// ---------------------------------------------------------------------------

export interface ScenarioImpact {
  scenarioId: string;
  label: string;
  currentMaxBorrow: number;
  candidateMaxBorrow: number;
  deltaAmount: number;
  deltaPct: number;
  currentPass: string;
  candidatePass: string;
  passChanged: boolean;
}

export interface ImpactPreview {
  scenarios: ScenarioImpact[];
  summary: { avgDeltaPct: number; anyPassFlip: boolean; tighter: number; looser: number };
}

/** Compare borrowing outcomes for the candidate policy vs the current one. */
export function previewImpact(current: BankPolicy, candidate: BankPolicy): ImpactPreview {
  const scenarios: ScenarioImpact[] = CANONICAL_SCENARIOS.map(({ id, label, input }) => {
    const a = runBankCalc(input, current);
    const b = runBankCalc(input, candidate);
    const deltaAmount = Math.round(b.finalMaxBorrow - a.finalMaxBorrow);
    const deltaPct = a.finalMaxBorrow > 0 ? Number(((deltaAmount / a.finalMaxBorrow) * 100).toFixed(1)) : 0;
    return {
      scenarioId: id, label,
      currentMaxBorrow: Math.round(a.finalMaxBorrow), candidateMaxBorrow: Math.round(b.finalMaxBorrow),
      deltaAmount, deltaPct, currentPass: a.passFail, candidatePass: b.passFail, passChanged: a.passFail !== b.passFail,
    };
  });

  const avgDeltaPct = Number((scenarios.reduce((s, x) => s + x.deltaPct, 0) / (scenarios.length || 1)).toFixed(1));
  return {
    scenarios,
    summary: {
      avgDeltaPct,
      anyPassFlip: scenarios.some((s) => s.passChanged),
      tighter: scenarios.filter((s) => s.deltaAmount < 0).length,
      looser: scenarios.filter((s) => s.deltaAmount > 0).length,
    },
  };
}

// ---------------------------------------------------------------------------
// Sensitivity analysis
// ---------------------------------------------------------------------------

export type SensitivityVariable = 'interestRate' | 'deposit' | 'targetLoanAmount';

export interface SensitivityPoint { value: number; maxBorrow: number; dti: number; lvr: number; passFail: string }

/** Sweep one scenario input across a range and report the engine's response. */
export function sensitivity(
  input: ScenarioInput, policy: BankPolicy, variable: SensitivityVariable, steps = 7,
): { variable: SensitivityVariable; points: SensitivityPoint[] } {
  const points: SensitivityPoint[] = [];
  const base = input.scenario;

  const ranges: Record<SensitivityVariable, number[]> = {
    interestRate: linspace(Math.max(0.03, base.interestRate - 0.02), base.interestRate + 0.02, steps),
    deposit: linspace(0, base.targetPropertyValue * 0.4, steps),
    targetLoanAmount: linspace(base.targetLoanAmount * 0.6, base.targetLoanAmount * 1.2, steps),
  };

  for (const v of ranges[variable]) {
    const scenario = { ...base };
    if (variable === 'interestRate') scenario.interestRate = Number(v.toFixed(4));
    else if (variable === 'deposit') { scenario.targetLoanAmount = Math.max(0, Math.round(base.targetPropertyValue - v)); }
    else scenario.targetLoanAmount = Math.round(v);

    const r = runBankCalc({ ...input, scenario }, policy);
    points.push({ value: Number(v.toFixed(variable === 'interestRate' ? 4 : 0)), maxBorrow: Math.round(r.finalMaxBorrow), dti: r.dtiRatio, lvr: Number(r.lvrRatio.toFixed(3)), passFail: r.passFail });
  }
  return { variable, points };
}

function linspace(min: number, max: number, n: number): number[] {
  if (n <= 1) return [min];
  const step = (max - min) / (n - 1);
  return Array.from({ length: n }, (_, i) => min + i * step);
}
