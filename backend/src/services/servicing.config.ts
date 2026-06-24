/**
 * Central servicing configuration.
 *
 * ALL tunables for the servicing engine live here (or in calculator.config.ts).
 * Nothing in the engine should hard-code a shading %, DTI cap, buffer, floor,
 * or bank-policy limit — change the numbers here and the engine follows.
 *
 * Many of these can be overridden at runtime via environment variables (see the
 * `envOverrides()` helper at the bottom) so a deployment can tune policy without
 * a code change.
 */

import { Frequency } from '../utils/frequency';

// ---------------------------------------------------------------------------
// Income categories
// ---------------------------------------------------------------------------
// MAIN income categories supported by the detailed income module. Keep this in
// sync with the `category` field documented on the IncomeEntry Prisma model and
// the frontend dropdown (frontend/src/lib/income.ts).
export const INCOME_CATEGORIES = [
  'BASE_SALARY_PAYG',
  'SECOND_PAYG',
  'CASUAL',
  'COMMISSION',
  'OVERTIME',
  'ESSENTIAL_OVERTIME',
  'ALLOWANCES',
  'BONUS_RECENT',
  'BONUS_PREVIOUS',
  'FOREIGN_PAYG',
  'NET_FOREIGN',
  'INVESTMENT',
  'INTEREST',
  'SUPER_ANNUITY',
  'CARERS',
  'GOVERNMENT_PENSION',
  'COMPANY_CAR',
  'CHILD_MAINTENANCE',
  'OTHER_TAXED',
  'OTHER_TAX_FREE',
  'FAMILY_TAX_A',
  'FAMILY_TAX_B',
  'PARENTING_PAYMENT',
  // Deductions REDUCE assessable income (handled specially in normaliseIncome).
  'PRETAX_DEDUCTION',
  'POSTTAX_DEDUCTION',
] as const;

export type IncomeCategory = (typeof INCOME_CATEGORIES)[number];

/**
 * Categories that REDUCE net income rather than add to it. Their (positive)
 * amount is subtracted, un-shaded, in normaliseIncome.
 */
export const DEDUCTION_CATEGORIES: readonly string[] = ['PRETAX_DEDUCTION', 'POSTTAX_DEDUCTION'];

/**
 * Per-category income shading (the fraction of declared income counted toward
 * serviceability). 1.0 = 100% counted, 0.8 = 80% counted. A `shadingOverride`
 * on an individual IncomeEntry takes precedence over these defaults.
 *
 * These are representative lender-style assumptions, not advice — tune freely.
 */
export const INCOME_SHADING: Record<IncomeCategory, number> = {
  BASE_SALARY_PAYG: 1.0,
  SECOND_PAYG: 1.0,
  CASUAL: 0.8,
  COMMISSION: 0.8,
  OVERTIME: 0.8,
  ESSENTIAL_OVERTIME: 0.9,
  ALLOWANCES: 0.8,
  BONUS_RECENT: 0.8,
  BONUS_PREVIOUS: 0.5,
  FOREIGN_PAYG: 0.8,
  NET_FOREIGN: 0.8,
  INVESTMENT: 0.8,
  INTEREST: 0.8,
  SUPER_ANNUITY: 0.8,
  CARERS: 1.0,
  GOVERNMENT_PENSION: 1.0,
  COMPANY_CAR: 0.8,
  CHILD_MAINTENANCE: 0.8,
  OTHER_TAXED: 0.8,
  OTHER_TAX_FREE: 0.8,
  FAMILY_TAX_A: 1.0,
  FAMILY_TAX_B: 1.0,
  PARENTING_PAYMENT: 1.0,
  // Deductions are subtracted un-shaded; the value here is unused for them.
  PRETAX_DEDUCTION: 1.0,
  POSTTAX_DEDUCTION: 1.0,
};

/** Default shading for an unknown / unmapped category. */
export const DEFAULT_INCOME_SHADING = 0.8;

/** Rental income shading (applied to investment property rent). */
export const RENTAL_INCOME_SHADING = 0.8;

// ---------------------------------------------------------------------------
// Bank-policy property presets
// ---------------------------------------------------------------------------
export type BankPolicyPreset = 'ALL' | 'TOP_3' | 'TOP_4' | 'CUSTOM';

/** How many properties each preset includes (null = all). */
export const BANK_POLICY_LIMITS: Record<BankPolicyPreset, number | null> = {
  ALL: null,
  TOP_3: 3,
  TOP_4: 4,
  CUSTOM: null,
};

// ---------------------------------------------------------------------------
// Servicing parameters
// ---------------------------------------------------------------------------
export interface ServicingConfig {
  dtiCap: number;
  stressBuffer: number;
  /** Assumed minimum monthly repayment on a credit card as a % of its limit. */
  creditCardRepaymentPercent: number;
  /** HEM-style minimum living-expense floor per adult (monthly). */
  minExpensePerAdult: number;
  /** HEM-style minimum living-expense floor per child (monthly). */
  minExpensePerChild: number;
  incomeShading: Record<string, number>;
  defaultIncomeShading: number;
  rentalIncomeShading: number;
  bankPolicyLimits: Record<BankPolicyPreset, number | null>;
}

function num(envKey: string, fallback: number): number {
  const raw = process.env[envKey];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Build the active servicing config, applying any environment overrides.
 * Documented env vars (all optional):
 *   SERVICING_DTI_CAP, SERVICING_STRESS_BUFFER,
 *   SERVICING_CC_REPAYMENT_PCT, SERVICING_MIN_EXPENSE_ADULT,
 *   SERVICING_MIN_EXPENSE_CHILD, SERVICING_RENTAL_SHADING
 */
export function getServicingConfig(): ServicingConfig {
  return {
    dtiCap: num('SERVICING_DTI_CAP', 6),
    stressBuffer: num('SERVICING_STRESS_BUFFER', 0.03),
    creditCardRepaymentPercent: num('SERVICING_CC_REPAYMENT_PCT', 0.03),
    minExpensePerAdult: num('SERVICING_MIN_EXPENSE_ADULT', 1200),
    minExpensePerChild: num('SERVICING_MIN_EXPENSE_CHILD', 600),
    incomeShading: INCOME_SHADING,
    defaultIncomeShading: DEFAULT_INCOME_SHADING,
    rentalIncomeShading: num('SERVICING_RENTAL_SHADING', RENTAL_INCOME_SHADING),
    bankPolicyLimits: BANK_POLICY_LIMITS,
  };
}

export const defaultServicingConfig: ServicingConfig = getServicingConfig();

/** Resolve the shading for a category (override > category default > fallback). */
export function shadingForCategory(
  category: string,
  override?: number | null,
  config: ServicingConfig = defaultServicingConfig
): number {
  if (override !== undefined && override !== null && Number.isFinite(override)) {
    return override;
  }
  const mapped = config.incomeShading[category];
  return mapped !== undefined ? mapped : config.defaultIncomeShading;
}

/** Default conversion frequencies for documentation/reference. */
export const FREQUENCY_PER_YEAR: Record<Frequency, number> = {
  WEEKLY: 52,
  FORTNIGHTLY: 26,
  MONTHLY: 12,
  QUARTERLY: 4,
  ANNUAL: 1,
};
