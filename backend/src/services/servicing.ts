/**
 * Servicing engine.
 *
 * Modular, configurable helpers that sit on top of the core amortization math in
 * ./calculator.ts. Responsibilities:
 *   - Per-property capital growth / ROI computation (done on the BACKEND so the
 *     frontend never recomputes).
 *   - Normalising detailed income entries to monthly with per-category shading.
 *   - Aggregating living expenses with a HEM-style floor.
 *   - Filtering properties / loans / liabilities by `includeInServicing`.
 *   - Bank-policy property presets (ALL / TOP_3 / TOP_4 / CUSTOM).
 *   - Producing the final serviceability + DTI outputs.
 *
 * Everything tunable comes from ./servicing.config.ts.
 */

import { Frequency, toMonthly, toAnnual } from '../utils/frequency';
import {
  ServicingConfig,
  defaultServicingConfig,
  shadingForCategory,
  BankPolicyPreset,
  DEDUCTION_CATEGORIES,
} from './servicing.config';
import {
  calculateMaxLoanFromPayment,
  calculateMonthlyRepayment,
  computeRepaymentBreakdown,
  RepaymentBreakdown,
} from './calculator';

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Property growth / ROI
// ---------------------------------------------------------------------------

export interface PropertyGrowthInput {
  estimatedValue: number; // current value
  purchasePrice?: number | null;
  purchaseDate?: Date | string | null;
  rentalIncomeAmount?: number | null;
  rentalIncomeFrequency?: string | null;
  /** Legacy single rental figure (treated as weekly if no amount/freq given). */
  rentalIncome?: number | null;
}

export interface PropertyGrowth {
  currentValue: number;
  purchasePrice: number | null;
  capitalGrowthDollars: number | null;
  capitalGrowthPercent: number | null;
  yearsHeld: number | null;
  cagrPercent: number | null;
  weeklyRent: number | null;
  totalGrossRent: number | null;
  grossYieldPercent: number | null;
}

function toDate(value?: Date | string | null): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Convert a rent amount at some frequency to a weekly figure. */
function toWeekly(amount: number, frequency: Frequency): number {
  return toAnnual(amount, frequency) / 52;
}

/**
 * Compute capital growth, CAGR, years held, gross rent and gross yield for a
 * single property. All divide-by-zero / missing-input cases return null for the
 * affected metric rather than NaN/Infinity.
 */
export function computePropertyGrowth(input: PropertyGrowthInput): PropertyGrowth {
  const currentValue = input.estimatedValue || 0;
  const purchasePrice =
    input.purchasePrice !== undefined && input.purchasePrice !== null
      ? input.purchasePrice
      : null;

  // Capital growth (needs a positive purchase price).
  let capitalGrowthDollars: number | null = null;
  let capitalGrowthPercent: number | null = null;
  if (purchasePrice !== null && purchasePrice > 0) {
    capitalGrowthDollars = currentValue - purchasePrice;
    capitalGrowthPercent = (capitalGrowthDollars / purchasePrice) * 100;
  }

  // Years held (needs a valid purchase date in the past).
  let yearsHeld: number | null = null;
  const pd = toDate(input.purchaseDate);
  if (pd) {
    const diff = (Date.now() - pd.getTime()) / MS_PER_YEAR;
    yearsHeld = diff > 0 ? diff : null;
  }

  // CAGR (needs positive purchase price, current value and years held > 0).
  let cagrPercent: number | null = null;
  if (
    purchasePrice !== null &&
    purchasePrice > 0 &&
    currentValue > 0 &&
    yearsHeld !== null &&
    yearsHeld > 0
  ) {
    cagrPercent = (Math.pow(currentValue / purchasePrice, 1 / yearsHeld) - 1) * 100;
  }

  // Weekly rent: prefer amount+frequency, else legacy weekly figure.
  let weeklyRent: number | null = null;
  if (input.rentalIncomeAmount !== undefined && input.rentalIncomeAmount !== null) {
    const freq = (input.rentalIncomeFrequency as Frequency) || 'WEEKLY';
    weeklyRent = toWeekly(input.rentalIncomeAmount, freq);
  } else if (input.rentalIncome !== undefined && input.rentalIncome !== null) {
    weeklyRent = input.rentalIncome; // legacy: assume already weekly
  }

  // Gross rent over the holding period and gross yield.
  let totalGrossRent: number | null = null;
  let grossYieldPercent: number | null = null;
  if (weeklyRent !== null && weeklyRent >= 0) {
    const annualRent = weeklyRent * 52;
    if (yearsHeld !== null && yearsHeld > 0) {
      totalGrossRent = annualRent * yearsHeld;
    }
    if (currentValue > 0) {
      grossYieldPercent = (annualRent / currentValue) * 100;
    }
  }

  return {
    currentValue,
    purchasePrice,
    capitalGrowthDollars,
    capitalGrowthPercent,
    yearsHeld,
    cagrPercent,
    weeklyRent,
    totalGrossRent,
    grossYieldPercent,
  };
}

// ---------------------------------------------------------------------------
// Bank-policy property presets
// ---------------------------------------------------------------------------

export interface ServicingPropertyLike {
  id?: string;
  estimatedValue: number;
  mortgageBalance?: number | null;
  includeInServicing?: boolean;
}

/**
 * Apply a bank-policy preset to a list of properties, returning the SET OF IDS
 * that should be included. TOP_N selects the N highest-value (or by equity)
 * properties. ALL includes everything. CUSTOM returns the current selection
 * (those already flagged includeInServicing).
 */
export function applyBankPolicyPreset<T extends ServicingPropertyLike>(
  properties: T[],
  preset: BankPolicyPreset,
  by: 'value' | 'equity' = 'value',
  config: ServicingConfig = defaultServicingConfig
): Set<string> {
  const limit = config.bankPolicyLimits[preset];
  if (preset === 'CUSTOM') {
    return new Set(
      properties.filter((p) => p.includeInServicing !== false && p.id).map((p) => p.id as string)
    );
  }
  if (limit === null) {
    // ALL
    return new Set(properties.filter((p) => p.id).map((p) => p.id as string));
  }
  const score = (p: T) =>
    by === 'equity' ? p.estimatedValue - (p.mortgageBalance || 0) : p.estimatedValue;
  const sorted = [...properties].sort((a, b) => score(b) - score(a));
  return new Set(sorted.slice(0, limit).filter((p) => p.id).map((p) => p.id as string));
}

// ---------------------------------------------------------------------------
// Income normalisation
// ---------------------------------------------------------------------------

export interface DetailedIncomeInput {
  category: string;
  amount: number;
  frequency: Frequency;
  shadingOverride?: number | null;
  hecsFlag?: boolean;
  hecsAmount?: number | null;
}

export interface NormalisedIncome {
  /** Total shaded income, monthly. */
  totalMonthlyIncome: number;
  /** Gross (un-shaded) income, monthly. */
  grossMonthlyIncome: number;
  /** Total monthly HECS/HELP commitment from flagged entries. */
  hecsMonthlyCommitment: number;
}

/**
 * Normalise detailed income entries to monthly, applying per-category shading
 * (or an explicit override). HECS/HELP amounts on flagged entries are summed as
 * a monthly commitment (the caller adds this to expenses).
 */
export function normaliseIncome(
  entries: DetailedIncomeInput[],
  config: ServicingConfig = defaultServicingConfig
): NormalisedIncome {
  let totalMonthlyIncome = 0;
  let grossMonthlyIncome = 0;
  let hecsMonthlyCommitment = 0;

  for (const e of entries) {
    const monthly = toMonthly(e.amount, e.frequency);

    // Deductions (pre/post-tax) REDUCE net income, un-shaded.
    if (DEDUCTION_CATEGORIES.includes(e.category)) {
      grossMonthlyIncome -= monthly;
      totalMonthlyIncome -= monthly;
      continue;
    }

    const shading = shadingForCategory(e.category, e.shadingOverride, config);
    grossMonthlyIncome += monthly;
    totalMonthlyIncome += monthly * shading;

    if (e.hecsFlag && e.hecsAmount && e.hecsAmount > 0) {
      // HECS amount is stored as a monthly commitment.
      hecsMonthlyCommitment += e.hecsAmount;
    }
  }

  return { totalMonthlyIncome, grossMonthlyIncome, hecsMonthlyCommitment };
}

// ---------------------------------------------------------------------------
// Living expenses aggregation
// ---------------------------------------------------------------------------

export interface LivingExpensesInput {
  basicExpenseAmount?: number | null;
  basicExpenseFrequency?: Frequency | null;
  propertyTax?: number | null;
  strataBodyCorp?: number | null;
  privateSchoolFees?: number | null;
  childSupportMaintenance?: number | null;
  privateHealthInsurance?: number | null;
  lifeInsurance?: number | null;
  secondaryResidenceCosts?: number | null;
  otherNonHem?: number | null;
  useNotionalRent?: boolean;
  rentBoardAmount?: number | null;
}

const ADDITIONAL_EXPENSE_KEYS: (keyof LivingExpensesInput)[] = [
  'propertyTax',
  'strataBodyCorp',
  'privateSchoolFees',
  'childSupportMaintenance',
  'privateHealthInsurance',
  'lifeInsurance',
  'secondaryResidenceCosts',
  'otherNonHem',
];

/**
 * Aggregate declared living expenses to a monthly figure (additional category
 * fields are assumed monthly), then apply the HEM-style floor:
 * max(declared, floor). Notional rent / rent-board is added on top when enabled.
 */
export function aggregateLivingExpenses(
  expenses: LivingExpensesInput | null | undefined,
  adults: number,
  children: number,
  config: ServicingConfig = defaultServicingConfig
): number {
  let declaredMonthly = 0;

  if (expenses) {
    const basicFreq = (expenses.basicExpenseFrequency as Frequency) || 'MONTHLY';
    declaredMonthly += toMonthly(expenses.basicExpenseAmount || 0, basicFreq);
    for (const key of ADDITIONAL_EXPENSE_KEYS) {
      const v = expenses[key];
      if (typeof v === 'number' && v > 0) declaredMonthly += v;
    }
  }

  const floor =
    Math.max(adults, 1) * config.minExpensePerAdult +
    Math.max(children, 0) * config.minExpensePerChild;

  let total = Math.max(declaredMonthly, floor);

  if (expenses?.useNotionalRent && expenses.rentBoardAmount && expenses.rentBoardAmount > 0) {
    total += expenses.rentBoardAmount;
  }

  return total;
}

// ---------------------------------------------------------------------------
// Commitments (existing loans + personal liabilities), filtered by servicing
// ---------------------------------------------------------------------------

export interface ExistingLoanInput {
  loanAmount: number;
  interestRate: number;
  termYears: number;
  monthlyRepayment?: number | null;
  includeInServicing?: boolean;
}

export interface PersonalLiabilityInput {
  type: string;
  limit?: number | null;
  repaymentAmount?: number | null;
  includeInServicing?: boolean;
}

/** Sum monthly commitments from existing home loans that are included. */
export function existingLoanCommitments(
  loans: ExistingLoanInput[],
  config: ServicingConfig = defaultServicingConfig
): number {
  return loans
    .filter((l) => l.includeInServicing !== false)
    .reduce((sum, l) => {
      if (l.monthlyRepayment && l.monthlyRepayment > 0) return sum + l.monthlyRepayment;
      return sum + calculateMonthlyRepayment(l.loanAmount, l.interestRate, l.termYears, 'PI');
    }, 0);
}

/** Sum monthly commitments from personal liabilities that are included. */
export function personalLiabilityCommitments(
  liabilities: PersonalLiabilityInput[],
  config: ServicingConfig = defaultServicingConfig
): number {
  return liabilities
    .filter((l) => l.includeInServicing !== false)
    .reduce((sum, l) => {
      if (l.type === 'CREDIT_CARD') {
        const limit = l.limit || 0;
        // Assumed minimum repayment if none provided.
        const assumed = limit * config.creditCardRepaymentPercent;
        return sum + (l.repaymentAmount && l.repaymentAmount > 0 ? l.repaymentAmount : assumed);
      }
      return sum + (l.repaymentAmount && l.repaymentAmount > 0 ? l.repaymentAmount : 0);
    }, 0);
}

// ---------------------------------------------------------------------------
// Full servicing computation
// ---------------------------------------------------------------------------

export interface ServicingInput {
  incomeEntries: DetailedIncomeInput[];
  livingExpenses?: LivingExpensesInput | null;
  existingLoans?: ExistingLoanInput[];
  personalLiabilities?: PersonalLiabilityInput[];
  /** Net (shaded) rental income, monthly, from included investment properties. */
  rentalMonthlyIncome?: number;
  adults: number;
  children: number;
  proposedLoanAmount: number;
  proposedInterestRate: number; // decimal
  proposedTermYears: number;
  repaymentType: 'PI' | 'IO';
  config?: Partial<ServicingConfig>;
}

export interface ServicingResult {
  totalMonthlyIncome: number;
  totalMonthlyExpenses: number;
  monthlyCommitments: number;
  hecsMonthlyCommitment: number;
  netMonthlySurplus: number;
  serviceabilityMax: number;
  dtiMax: number;
  maxBorrowingCapacity: number;
  monthlyRepayment: number;
  dtiRatio: number;
  passesServiceability: boolean;
  passesDti: boolean;
  messages: string[];
  repaymentBreakdown: RepaymentBreakdown;
}

export function computeServicing(input: ServicingInput): ServicingResult {
  const config: ServicingConfig = { ...defaultServicingConfig, ...input.config };
  const messages: string[] = [];

  const income = normaliseIncome(input.incomeEntries, config);
  const rentalIncome = input.rentalMonthlyIncome || 0;
  const totalMonthlyIncome = income.totalMonthlyIncome + rentalIncome;

  const livingExpenses = aggregateLivingExpenses(
    input.livingExpenses,
    input.adults,
    input.children,
    config
  );

  const loanCommitments = existingLoanCommitments(input.existingLoans || [], config);
  const liabilityCommitments = personalLiabilityCommitments(
    input.personalLiabilities || [],
    config
  );
  const monthlyCommitments =
    loanCommitments + liabilityCommitments + income.hecsMonthlyCommitment;

  const totalMonthlyExpenses = livingExpenses + monthlyCommitments;
  const netMonthlySurplus = totalMonthlyIncome - totalMonthlyExpenses;

  if (netMonthlySurplus <= 0) {
    messages.push('Monthly expenses exceed income. No borrowing capacity available.');
    return {
      totalMonthlyIncome,
      totalMonthlyExpenses,
      monthlyCommitments,
      hecsMonthlyCommitment: income.hecsMonthlyCommitment,
      netMonthlySurplus,
      serviceabilityMax: 0,
      dtiMax: 0,
      maxBorrowingCapacity: 0,
      monthlyRepayment: 0,
      dtiRatio: 0,
      passesServiceability: false,
      passesDti: false,
      messages,
      repaymentBreakdown: { monthly: 0, fortnightly: 0, weekly: 0, totalInterest: 0, totalRepayments: 0 },
    };
  }

  const stressRate = input.proposedInterestRate + config.stressBuffer;
  const serviceabilityMax = calculateMaxLoanFromPayment(
    netMonthlySurplus,
    stressRate,
    input.proposedTermYears,
    input.repaymentType
  );

  const annualIncome = totalMonthlyIncome * 12;
  const dtiMax = annualIncome * config.dtiCap;
  const maxBorrowingCapacity = Math.min(serviceabilityMax, dtiMax);

  const monthlyRepayment = calculateMonthlyRepayment(
    maxBorrowingCapacity,
    stressRate,
    input.proposedTermYears,
    input.repaymentType
  );

  const dtiRatio = annualIncome > 0 ? maxBorrowingCapacity / annualIncome : 0;
  const passesServiceability = maxBorrowingCapacity > 0;
  const passesDti = dtiRatio <= config.dtiCap;

  if (maxBorrowingCapacity === dtiMax && dtiMax < serviceabilityMax) {
    messages.push(`Borrowing limited by DTI cap (${config.dtiCap}x annual income).`);
  }
  if (maxBorrowingCapacity === serviceabilityMax && serviceabilityMax < dtiMax) {
    messages.push('Borrowing limited by serviceability (net surplus at stress rate).');
  }
  if (passesServiceability && passesDti) {
    messages.push('Passes both serviceability and DTI checks.');
  }
  messages.push('Indicative estimate only - not a credit decision.');

  const repaymentBreakdown = computeRepaymentBreakdown(
    maxBorrowingCapacity,
    input.proposedInterestRate,
    input.proposedTermYears,
    input.repaymentType
  );

  return {
    totalMonthlyIncome,
    totalMonthlyExpenses,
    monthlyCommitments,
    hecsMonthlyCommitment: income.hecsMonthlyCommitment,
    netMonthlySurplus,
    serviceabilityMax,
    dtiMax,
    maxBorrowingCapacity,
    monthlyRepayment,
    dtiRatio,
    passesServiceability,
    passesDti,
    messages,
    repaymentBreakdown,
  };
}


// ---------------------------------------------------------------------------
// Clean single entry point: calculateServicing
// ---------------------------------------------------------------------------
//
// This is the canonical way to run the servicing engine. It accepts the raw
// per-applicant lists (as loaded from the profile) and is responsible for:
//   1. Filtering properties / liabilities / existingLoans / proposedLoans to
//      ONLY those with includeInServicing === true BEFORE any computation.
//      (Legacy rows missing the flag default to INCLUDED.)
//   2. Normalising income to monthly with per-category shading + HECS/HELP.
//   3. Deriving shaded rental income from the INCLUDED investment properties.
//   4. Resolving the proposed loan being assessed (first included proposed
//      loan, else the loan scenario parameters) for stress rate + term.
//   5. Delegating the core serviceability / DTI / max-loan math to
//      computeServicing, returning the standard ServicingResult (with the
//      "Indicative estimate only - not a credit decision." disclaimer).

export interface ServicingClientProfile {
  numberOfAdultDependants?: number | null;
  numberOfChildDependants?: number | null;
}

/** A property as consumed by the engine (superset of PropertyGrowthInput). */
export interface ServicingPropertyInput extends PropertyGrowthInput {
  id?: string;
  type?: string | null;
  mortgageBalance?: number | null;
  includeInServicing?: boolean | null;
}

export interface ServicingProposedLoanInput {
  loanAmount: number;
  termYears?: number | null;
  ioTermYears?: number | null;
  interestRate?: number | null;
  investmentFlag?: boolean | null;
  includeInServicing?: boolean | null;
}

export interface ServicingLoanScenario {
  interestRate: number; // decimal, e.g. 0.06
  loanTermYears?: number | null;
  repaymentType?: 'PI' | 'IO' | null;
}

export interface CalculateServicingInput {
  clientProfile: ServicingClientProfile;
  incomes: DetailedIncomeInput[];
  properties: ServicingPropertyInput[];
  liabilities: PersonalLiabilityInput[];
  existingLoans: ExistingLoanInput[];
  proposedLoans: ServicingProposedLoanInput[];
  livingExpenses?: LivingExpensesInput | null;
  loanScenario: ServicingLoanScenario;
  params?: Partial<ServicingConfig>;
}

/** Default-true include flag: legacy rows missing the flag are INCLUDED. */
function isIncludedInServicing(v: { includeInServicing?: boolean | null }): boolean {
  return v.includeInServicing !== false;
}

/**
 * Canonical servicing entry point. See block comment above for the contract.
 */
export function calculateServicing(input: CalculateServicingInput): ServicingResult {
  const config: ServicingConfig = { ...defaultServicingConfig, ...input.params };

  // 1) Filter every list to ONLY included entities BEFORE any computation.
  const includedProperties = (input.properties || []).filter(isIncludedInServicing);
  const includedLiabilities = (input.liabilities || []).filter(isIncludedInServicing);
  const includedExistingLoans = (input.existingLoans || []).filter(isIncludedInServicing);
  const includedProposedLoans = (input.proposedLoans || []).filter(isIncludedInServicing);

  // 2) Net (shaded) rental income from INCLUDED non-owner-occupied properties.
  //    Reuse computePropertyGrowth to normalise the weekly rent.
  let rentalMonthlyIncome = 0;
  for (const p of includedProperties) {
    if ((p.type || '').toUpperCase() === 'OWNER_OCCUPIED') continue;
    const g = computePropertyGrowth(p);
    if (g.weeklyRent && g.weeklyRent > 0) {
      rentalMonthlyIncome += ((g.weeklyRent * 52) / 12) * config.rentalIncomeShading;
    }
  }

  // 3) Resolve the proposed loan being assessed: the first INCLUDED proposed
  //    loan, else fall back to the loan scenario parameters.
  const assessed = includedProposedLoans[0];
  const proposedInterestRate =
    assessed && assessed.interestRate != null
      ? assessed.interestRate
      : input.loanScenario.interestRate;
  const proposedTermYears =
    (assessed && assessed.termYears != null
      ? assessed.termYears
      : input.loanScenario.loanTermYears) ?? 30;
  const repaymentType: 'PI' | 'IO' =
    assessed && (assessed.ioTermYears || 0) > 0
      ? 'IO'
      : input.loanScenario.repaymentType || 'PI';
  const proposedLoanAmount = assessed ? assessed.loanAmount : 0;

  const adults = 1 + (input.clientProfile.numberOfAdultDependants || 0);
  const children = input.clientProfile.numberOfChildDependants || 0;

  // 4) Delegate the core math to computeServicing with the FILTERED lists.
  return computeServicing({
    incomeEntries: input.incomes,
    livingExpenses: input.livingExpenses,
    existingLoans: includedExistingLoans,
    personalLiabilities: includedLiabilities,
    rentalMonthlyIncome,
    adults,
    children,
    proposedLoanAmount,
    proposedInterestRate,
    proposedTermYears,
    repaymentType,
    config: input.params,
  });
}
