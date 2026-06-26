/**
 * 2026 Bank Policy Library (hard-coded modelling policies).
 *
 * MODELLED ESTIMATES ONLY — these abstract the *logic* behind each lender's
 * public borrowing calculator (buffers, DTI/LVR caps, income shading, expense
 * floors, property treatment). They are NOT official lender policy, are not
 * scraped from any credit manual, and must not be presented as a credit
 * decision. Every value is a configurable parameter the broker can edit in the
 * admin "2026 Bank Policy Library". See POLICIES.md for the full per-bank table.
 *
 * Units note: rates/percentages are stored as DECIMALS (6.00% -> 0.06,
 * 80% accept -> 0.80, 3% buffer -> bufferBps 300). POLICIES.md shows the
 * human-readable percentages.
 */

import { BankPolicy, ProductPolicy, SpecialSegmentRules } from './types';

interface ProductParams {
  maxLvr: number;
  maxDti: number;
  bufferBps: number;
  base?: number;
  rentalAccept?: number;
  rentalVacancy?: number;
  businessAccept?: number;
  secondaryAccept?: number;
  otherAccept?: number;
  minLivingAdult?: number;
  minLivingChild?: number;
  maxProps?: number;
  selection?: 'topByEquity' | 'topByLoanBalance' | 'all';
  ccPct?: number;
  includeCommercial?: boolean;
  maxLoan?: number;
  ioAllowed?: boolean;
  segments?: SpecialSegmentRules[];
}

function product(p: ProductParams): ProductPolicy {
  return {
    maxLvr: p.maxLvr,
    maxDti: p.maxDti,
    minLoanAmount: 50_000,
    maxLoanAmount: p.maxLoan ?? 3_000_000,
    minTermYears: 5,
    maxTermYears: 30,
    baseRateAssumption: p.base ?? 0.06,
    serviceabilityBufferBps: p.bufferBps,
    incomeShadingRules: {
      salaryPrimary: { acceptPct: 1.0, minMonthsHistory: 3 },
      salarySecondary: { acceptPct: p.secondaryAccept ?? 0.8, minMonthsHistory: 6 },
      rental: { acceptPct: p.rentalAccept ?? 0.8, vacancyFactorPct: p.rentalVacancy ?? 0.05 },
      govBenefits: { acceptPct: 0.8 },
      businessIncome: { acceptPct: p.businessAccept ?? 0.7, minYearsFinancials: 2 },
      other: { acceptPct: p.otherAccept ?? 0.6, notes: 'Conservative shading for irregular income.' },
    },
    expenseTreatmentRules: {
      useHem: true,
      hemProvider: 'Internal',
      hemScalingByDependants: true,
      hemScalingByIncomeBand: true,
      minLivingExpensePerAdult: p.minLivingAdult ?? 1200,
      minLivingExpensePerChild: p.minLivingChild ?? 600,
      treatClientDeclaredAsFloor: true,
    },
    debtTreatmentRules: {
      creditCardRepaymentPctOfLimit: p.ccPct ?? 0.03,
      personalLoanRepaymentCalc: 'actual',
      carLoanRepaymentCalc: 'actual',
      hecsHelpTreatment: 'actual',
      otherLoanRepaymentCalc: 'buffered',
      maxInterestOnlyYears: 5,
    },
    propertyTreatmentRules: {
      maxPropertiesConsidered: p.maxProps ?? 4,
      selectionStrategy: p.selection ?? 'topByEquity',
      includeOwnerOccPropertyInCalc: true,
      includeInvestmentPropertiesInCalc: true,
      includeCommercialPropertiesInCalc: p.includeCommercial ?? false,
      allowHidePerProperty: true,
      defaultIncludeCountResidential: 3,
      defaultIncludeCountCommercial: 2,
    },
    negativeGearingTreatment: { allowNegativeGearingBenefit: true, maxBenefitPctOfRentalLoss: 0.8 },
    interestOnlyTreatment: { allowed: p.ioAllowed ?? true, maxIoYears: 5, ioAssessmentRateLoadingBps: 50 },
    specialSegments: p.segments,
  };
}

function bank(
  bankName: string, brandCode: string, policyVersion: string, notes: string,
  oo: ProductParams, inv: ProductParams, com: ProductParams,
): BankPolicy {
  return {
    id: `${brandCode}-${policyVersion}`,
    bankName, brandCode, policyVersion,
    effectiveFrom: '2026-01-01', effectiveTo: null, isActive: true, notes,
    residentialOwnerOcc: product(oo),
    residentialInvestment: product(inv),
    commercialPropertyLight: product({ ...com, includeCommercial: true }),
  };
}

const SELF_EMP_UPLIFT: SpecialSegmentRules[] = [
  { segment: 'SELF_EMPLOYED', dtiUpliftToCap: 7.0, notes: 'Self-employed with 2yrs financials — DTI uplift.' },
];

/**
 * Hard-coded 2026 modelling policies for the top-10 Australian lenders.
 * Differentiators (per the agreed modelling table):
 *  - NAB / ANZ: higher DTI tolerance for strong PAYG.
 *  - Macquarie / HSBC: consider the FULL portfolio (ALL_INCLUDED, up to 6).
 *  - ING / Bendigo: tighter DTI + lower acceptance on variable income.
 *  - Bendigo: most generous investor DTI (7.0) but higher buffer.
 */
export const BANK_POLICIES_2026: BankPolicy[] = [
  bank('Commonwealth Bank of Australia', 'CBA', 'CBA_2026.06', 'Major bank baseline; P&I only on owner-occ.',
    { maxLvr: 0.95, maxDti: 6.0, bufferBps: 300, base: 0.06, rentalAccept: 0.80, rentalVacancy: 0.05, businessAccept: 0.70, secondaryAccept: 0.80, otherAccept: 0.60, minLivingAdult: 1200, minLivingChild: 600, maxProps: 4, selection: 'topByEquity', ioAllowed: false },
    { maxLvr: 0.90, maxDti: 6.5, bufferBps: 300, base: 0.062, rentalAccept: 0.80, rentalVacancy: 0.08, businessAccept: 0.65, otherAccept: 0.60, minLivingAdult: 1300, minLivingChild: 650, maxProps: 5, selection: 'topByEquity' },
    { maxLvr: 0.70, maxDti: 6.0, bufferBps: 300, base: 0.07, rentalAccept: 0.75, rentalVacancy: 0.10, businessAccept: 0.65, maxProps: 3, selection: 'topByLoanBalance', maxLoan: 3_000_000 }),

  bank('National Australia Bank', 'NAB', 'NAB_2026.04', 'Generous DTI for strong PAYG; ALL_INCLUDED property view.',
    { maxLvr: 0.95, maxDti: 6.5, bufferBps: 300, base: 0.059, rentalAccept: 0.80, rentalVacancy: 0.05, secondaryAccept: 0.85, businessAccept: 0.70, otherAccept: 0.65, minLivingAdult: 1150, minLivingChild: 580, maxProps: 4, selection: 'all', ioAllowed: false, segments: SELF_EMP_UPLIFT },
    { maxLvr: 0.90, maxDti: 7.0, bufferBps: 300, base: 0.061, rentalAccept: 0.82, rentalVacancy: 0.06, secondaryAccept: 0.85, businessAccept: 0.70, minLivingAdult: 1150, minLivingChild: 580, maxProps: 5, selection: 'all' },
    { maxLvr: 0.70, maxDti: 6.0, bufferBps: 300, base: 0.07, rentalAccept: 0.75, rentalVacancy: 0.10, maxProps: 3, selection: 'topByLoanBalance' }),

  bank('Westpac', 'WBC', 'WBC_2026.05', 'Conservative on rental + business income.',
    { maxLvr: 0.95, maxDti: 6.0, bufferBps: 300, base: 0.06, businessAccept: 0.60, otherAccept: 0.50, maxProps: 4, ioAllowed: false },
    { maxLvr: 0.90, maxDti: 6.5, bufferBps: 300, base: 0.062, rentalAccept: 0.75, rentalVacancy: 0.10, businessAccept: 0.60, otherAccept: 0.50, maxProps: 4 },
    { maxLvr: 0.70, maxDti: 6.0, bufferBps: 300, base: 0.072, rentalAccept: 0.70, rentalVacancy: 0.10, maxProps: 3, selection: 'topByLoanBalance' }),

  bank('ANZ', 'ANZ', 'ANZ_2026.05', 'More generous on bonus/overtime; standard buffer.',
    { maxLvr: 0.95, maxDti: 6.5, bufferBps: 300, base: 0.06, secondaryAccept: 0.80, rentalAccept: 0.80, rentalVacancy: 0.05, maxProps: 5, ioAllowed: false },
    { maxLvr: 0.90, maxDti: 6.5, bufferBps: 300, base: 0.062, secondaryAccept: 0.80, rentalAccept: 0.80, rentalVacancy: 0.08, maxProps: 5 },
    { maxLvr: 0.70, maxDti: 6.0, bufferBps: 300, base: 0.072, rentalAccept: 0.75, rentalVacancy: 0.10, maxProps: 3, selection: 'topByLoanBalance' }),

  bank('Macquarie Bank', 'MQG', 'MQG_2026.05', 'Investor/professional-friendly; full portfolio, DTI up to 7.',
    { maxLvr: 0.95, maxDti: 7.0, bufferBps: 300, base: 0.06, businessAccept: 0.75, rentalAccept: 0.80, rentalVacancy: 0.05, maxProps: 6, selection: 'all', ioAllowed: false, segments: SELF_EMP_UPLIFT },
    { maxLvr: 0.90, maxDti: 7.0, bufferBps: 300, base: 0.062, businessAccept: 0.75, rentalAccept: 0.85, rentalVacancy: 0.06, maxProps: 6, selection: 'all' },
    { maxLvr: 0.70, maxDti: 6.0, bufferBps: 300, base: 0.071, rentalAccept: 0.78, rentalVacancy: 0.08, maxProps: 4, selection: 'all' }),

  bank('Suncorp Bank', 'SUN', 'SUN_2026.03', 'Regionally conservative; higher minimum living expenses.',
    { maxLvr: 0.95, maxDti: 6.0, bufferBps: 300, base: 0.061, minLivingAdult: 1350, minLivingChild: 680, maxProps: 4, selection: 'topByEquity', ioAllowed: false },
    { maxLvr: 0.90, maxDti: 6.0, bufferBps: 300, base: 0.063, rentalAccept: 0.78, rentalVacancy: 0.08, minLivingAdult: 1350, minLivingChild: 680, maxProps: 4 },
    { maxLvr: 0.70, maxDti: 6.0, bufferBps: 300, base: 0.073, rentalAccept: 0.72, rentalVacancy: 0.10, maxProps: 3, selection: 'topByLoanBalance' }),

  bank('ING', 'ING', 'ING_2026.02', 'Stricter DTI; lower acceptance on variable income.',
    { maxLvr: 0.90, maxDti: 5.75, bufferBps: 300, base: 0.062, secondaryAccept: 0.65, businessAccept: 0.60, otherAccept: 0.45, rentalAccept: 0.75, rentalVacancy: 0.10, ccPct: 0.04, maxProps: 3, ioAllowed: false },
    { maxLvr: 0.90, maxDti: 5.75, bufferBps: 300, base: 0.064, secondaryAccept: 0.65, businessAccept: 0.60, otherAccept: 0.45, rentalAccept: 0.75, rentalVacancy: 0.10, ccPct: 0.04, maxProps: 3 },
    { maxLvr: 0.65, maxDti: 5.0, bufferBps: 350, base: 0.075, rentalAccept: 0.70, rentalVacancy: 0.12, ccPct: 0.04, maxProps: 2, selection: 'topByLoanBalance' }),

  bank('HSBC Australia', 'HSBC', 'HSBC_2026.02', 'Open to large portfolios — considers all included properties.',
    { maxLvr: 0.95, maxDti: 6.5, bufferBps: 300, base: 0.06, rentalAccept: 0.78, rentalVacancy: 0.08, maxProps: 6, selection: 'all', ioAllowed: false },
    { maxLvr: 0.90, maxDti: 6.5, bufferBps: 300, base: 0.062, rentalAccept: 0.78, rentalVacancy: 0.08, maxProps: 6, selection: 'all' },
    { maxLvr: 0.70, maxDti: 6.0, bufferBps: 300, base: 0.072, rentalAccept: 0.72, rentalVacancy: 0.10, maxProps: 4, selection: 'all' }),

  bank('St.George / BankSA', 'SGB', 'SGB_2026.04', 'Westpac group; higher minimum living for dependants.',
    { maxLvr: 0.95, maxDti: 6.0, bufferBps: 300, base: 0.06, minLivingAdult: 1300, minLivingChild: 680, businessAccept: 0.62, otherAccept: 0.52, maxProps: 4, ioAllowed: false },
    { maxLvr: 0.90, maxDti: 6.5, bufferBps: 300, base: 0.062, rentalAccept: 0.76, rentalVacancy: 0.10, minLivingAdult: 1300, minLivingChild: 680, maxProps: 4 },
    { maxLvr: 0.70, maxDti: 6.0, bufferBps: 300, base: 0.072, rentalAccept: 0.70, rentalVacancy: 0.10, maxProps: 3, selection: 'topByLoanBalance' }),

  bank('Bendigo Bank', 'BEN', 'BEN_2026.02', 'Alt lender; flexible investor DTI but higher buffer + lower commercial LVR.',
    { maxLvr: 0.90, maxDti: 6.0, bufferBps: 350, base: 0.063, businessAccept: 0.75, otherAccept: 0.65, maxProps: 4, ioAllowed: false },
    { maxLvr: 0.88, maxDti: 7.0, bufferBps: 350, base: 0.065, businessAccept: 0.75, otherAccept: 0.65, rentalAccept: 0.80, rentalVacancy: 0.08, maxProps: 5, selection: 'all' },
    { maxLvr: 0.65, maxDti: 6.0, bufferBps: 375, base: 0.076, rentalAccept: 0.72, rentalVacancy: 0.10, maxProps: 3, selection: 'topByLoanBalance' }),
];

export function getActivePolicies(): BankPolicy[] {
  return BANK_POLICIES_2026.filter((p) => p.isActive);
}

/**
 * Bump this whenever the hard-coded policy VALUES change. On deploy, the
 * DB-backed library re-syncs each bank to a fresh active version when its
 * stored seedVersion differs from this — older versions are kept as history.
 */
export const POLICY_SEED_VERSION = '2026.2';
