/**
 * 2026 Bank Policy Library (seed).
 *
 * MODELLED ESTIMATES ONLY — these values abstract the *logic* behind each
 * lender's public borrowing calculator (buffers, DTI/LVR caps, income shading,
 * property treatment). They are NOT official lender policy and must not be
 * presented as a credit decision. A broker can edit/version these in the admin
 * "2026 Bank Policy Library".
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
    baseRateAssumption: p.base ?? 0.062,
    serviceabilityBufferBps: p.bufferBps,
    incomeShadingRules: {
      salaryPrimary: { acceptPct: 1.0, minMonthsHistory: 3 },
      salarySecondary: { acceptPct: 0.8, minMonthsHistory: 6 },
      rental: { acceptPct: p.rentalAccept ?? 0.8, vacancyFactorPct: p.rentalVacancy ?? 0.0 },
      govBenefits: { acceptPct: 1.0 },
      businessIncome: { acceptPct: p.businessAccept ?? 0.8, minYearsFinancials: 2 },
      other: { acceptPct: 0.5, notes: 'Conservative shading for irregular income.' },
    },
    expenseTreatmentRules: {
      useHem: true,
      hemProvider: 'Internal',
      hemScalingByDependants: true,
      hemScalingByIncomeBand: true,
      minLivingExpensePerAdult: 1500,
      minLivingExpensePerChild: 400,
      treatClientDeclaredAsFloor: true,
    },
    debtTreatmentRules: {
      creditCardRepaymentPctOfLimit: p.ccPct ?? 0.038,
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
    interestOnlyTreatment: { allowed: p.ioAllowed ?? true, maxIoYears: 5, ioAssessmentRateLoadingBps: 25 },
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

export const BANK_POLICIES_2026: BankPolicy[] = [
  bank('Commonwealth Bank of Australia', 'CBA', 'CBA_2026.06', 'Major bank baseline.',
    { maxLvr: 0.95, maxDti: 6.0, bufferBps: 300, maxProps: 4, selection: 'topByEquity' },
    { maxLvr: 0.90, maxDti: 6.0, bufferBps: 300, rentalAccept: 0.80, maxProps: 4 },
    { maxLvr: 0.65, maxDti: 5.0, bufferBps: 350, base: 0.072, maxLoan: 5_000_000 }),

  bank('National Australia Bank', 'NAB', 'NAB_2026.04', 'Generally generous DTI for strong PAYG profiles.',
    { maxLvr: 0.95, maxDti: 7.0, bufferBps: 300, maxProps: 5, selection: 'topByEquity', segments: SELF_EMP_UPLIFT },
    { maxLvr: 0.90, maxDti: 7.0, bufferBps: 300, rentalAccept: 0.80, maxProps: 5 },
    { maxLvr: 0.65, maxDti: 5.0, bufferBps: 350, base: 0.072, maxLoan: 5_000_000 }),

  bank('Westpac', 'WBC', 'WBC_2026.05', 'Major bank baseline.',
    { maxLvr: 0.95, maxDti: 6.0, bufferBps: 300, maxProps: 4 },
    { maxLvr: 0.90, maxDti: 6.0, bufferBps: 300, rentalAccept: 0.80, maxProps: 4 },
    { maxLvr: 0.65, maxDti: 5.0, bufferBps: 350, base: 0.072 }),

  bank('ANZ', 'ANZ', 'ANZ_2026.05', 'Higher DTI tolerance for select profiles.',
    { maxLvr: 0.95, maxDti: 7.5, bufferBps: 300, maxProps: 5 },
    { maxLvr: 0.90, maxDti: 7.5, bufferBps: 300, rentalAccept: 0.80, maxProps: 5 },
    { maxLvr: 0.65, maxDti: 5.0, bufferBps: 350, base: 0.072 }),

  bank('Suncorp Bank', 'SUN', 'SUN_2026.03', 'Regional major; standard buffers.',
    { maxLvr: 0.95, maxDti: 6.0, bufferBps: 300, maxProps: 4 },
    { maxLvr: 0.90, maxDti: 6.0, bufferBps: 300, rentalAccept: 0.80, maxProps: 4 },
    { maxLvr: 0.65, maxDti: 5.0, bufferBps: 350, base: 0.073 }),

  bank('ING', 'ING', 'ING_2026.02', 'Tighter on rental shading and credit cards.',
    { maxLvr: 0.90, maxDti: 6.0, bufferBps: 300, maxProps: 3, ccPct: 0.04 },
    { maxLvr: 0.90, maxDti: 6.0, bufferBps: 300, rentalAccept: 0.75, maxProps: 3, ccPct: 0.04 },
    { maxLvr: 0.60, maxDti: 4.5, bufferBps: 375, base: 0.075 }),

  bank('HSBC Australia', 'HSBC', 'HSBC_2026.02', 'Considers the full property portfolio; conservative rental.',
    { maxLvr: 0.90, maxDti: 6.0, bufferBps: 300, selection: 'all' },
    { maxLvr: 0.90, maxDti: 6.0, bufferBps: 300, rentalAccept: 0.70, selection: 'all' },
    { maxLvr: 0.60, maxDti: 4.5, bufferBps: 375, base: 0.075, selection: 'all' }),

  bank('BankSA / St.George', 'BSA', 'BSA_2026.04', 'Westpac group; standard buffers.',
    { maxLvr: 0.95, maxDti: 6.0, bufferBps: 300, maxProps: 4 },
    { maxLvr: 0.90, maxDti: 6.0, bufferBps: 300, rentalAccept: 0.80, maxProps: 4 },
    { maxLvr: 0.65, maxDti: 5.0, bufferBps: 350, base: 0.072 }),

  bank('Macquarie Bank', 'MQG', 'MQG_2026.05', 'Investor-friendly; considers more properties.',
    { maxLvr: 0.95, maxDti: 6.5, bufferBps: 300, maxProps: 6, segments: SELF_EMP_UPLIFT },
    { maxLvr: 0.90, maxDti: 6.5, bufferBps: 300, rentalAccept: 0.85, maxProps: 6 },
    { maxLvr: 0.65, maxDti: 5.0, bufferBps: 350, base: 0.071 }),

  bank('Bendigo Bank', 'BEN', 'BEN_2026.02', 'Alt/common lender template; higher buffer.',
    { maxLvr: 0.90, maxDti: 5.5, bufferBps: 350, maxProps: 3 },
    { maxLvr: 0.88, maxDti: 5.5, bufferBps: 350, rentalAccept: 0.75, maxProps: 3 },
    { maxLvr: 0.60, maxDti: 4.5, bufferBps: 400, base: 0.076 }),
];

export function getActivePolicies(): BankPolicy[] {
  return BANK_POLICIES_2026.filter((p) => p.isActive);
}
