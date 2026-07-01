/**
 * 2026 Bank Lending Policy Engine — type definitions.
 *
 * These types model the policy logic that sits behind the major Australian
 * lenders' public "how much can I borrow?" calculators (income shading,
 * serviceability buffers, DTI/LVR caps, HEM expenses, property treatment).
 * They are deliberately decoupled from Prisma so the engine can run in unit
 * tests, the backend API, or a shared frontend module.
 *
 * DISCLAIMER: All numbers in the seed policy library are *modelled estimates*
 * for indicative comparison only — they are NOT official lender policy and
 * must not be represented as a credit decision.
 */

export type ProductType = 'OWNER_OCC' | 'INVESTMENT' | 'COMMERCIAL_PROPERTY_LIGHT';
export type RepaymentType = 'PI' | 'IO';
export type Frequency = 'WEEKLY' | 'FORTNIGHTLY' | 'MONTHLY' | 'ANNUAL';

// ---------------------------------------------------------------------------
// Policy library
// ---------------------------------------------------------------------------

export interface IncomeShadingRules {
  salaryPrimary: { acceptPct: number; minMonthsHistory: number };
  salarySecondary: { acceptPct: number; minMonthsHistory: number }; // bonus, overtime
  rental: { acceptPct: number; vacancyFactorPct: number };
  govBenefits: { acceptPct: number };
  businessIncome: { acceptPct: number; minYearsFinancials: number };
  other: { acceptPct: number; notes: string };
}

export interface ExpenseTreatmentRules {
  useHem: boolean;
  hemProvider?: 'CoreLogic' | 'Internal' | 'Other';
  hemScalingByDependants: boolean;
  hemScalingByIncomeBand: boolean;
  minLivingExpensePerAdult: number; // monthly
  minLivingExpensePerChild: number; // monthly
  treatClientDeclaredAsFloor: boolean; // true => max(declared, HEM)
}

export interface DebtTreatmentRules {
  creditCardRepaymentPctOfLimit: number; // e.g. 0.03 of limit per month
  personalLoanRepaymentCalc: 'actual' | 'assumedAmortising';
  carLoanRepaymentCalc: 'actual' | 'assumedAmortising';
  hecsHelpTreatment: 'actual' | 'taxTable' | 'ignoreBelowThreshold';
  otherLoanRepaymentCalc: 'actual' | 'buffered';
  maxInterestOnlyYears: number;
}

export interface PropertyTreatmentRules {
  maxPropertiesConsidered: number;
  selectionStrategy: 'topByEquity' | 'topByLoanBalance' | 'all';
  includeOwnerOccPropertyInCalc: boolean;
  includeInvestmentPropertiesInCalc: boolean;
  includeCommercialPropertiesInCalc: boolean;
  allowHidePerProperty: boolean;
  defaultIncludeCountResidential: number;
  defaultIncludeCountCommercial: number;
}

export interface NegativeGearingRules {
  allowNegativeGearingBenefit: boolean;
  maxBenefitPctOfRentalLoss: number;
}

export interface InterestOnlyRules {
  allowed: boolean;
  maxIoYears: number;
  ioAssessmentRateLoadingBps: number;
}

export interface SpecialSegmentRules {
  segment: 'SELF_EMPLOYED' | 'HNW' | 'PROFESSIONAL_PACKAGE' | 'FIRST_HOME_BUYER';
  dtiUpliftToCap?: number; // override maxDti for this segment
  lvrUpliftToCap?: number; // override maxLvr for this segment
  notes: string;
}

export interface ProductPolicy {
  maxLvr: number;
  maxDti: number;
  minLoanAmount: number;
  maxLoanAmount: number;
  minTermYears: number;
  maxTermYears: number;
  baseRateAssumption: number;      // annual decimal, e.g. 0.062
  serviceabilityBufferBps: number; // e.g. 300 (= +3.00%)
  incomeShadingRules: IncomeShadingRules;
  expenseTreatmentRules: ExpenseTreatmentRules;
  debtTreatmentRules: DebtTreatmentRules;
  propertyTreatmentRules: PropertyTreatmentRules;
  negativeGearingTreatment?: NegativeGearingRules;
  interestOnlyTreatment?: InterestOnlyRules;
  specialSegments?: SpecialSegmentRules[];
}

export interface BankPolicy {
  id: string;
  bankName: string;
  brandCode: string;
  policyVersion: string;     // e.g. "NAB_2026.04"
  effectiveFrom: string;     // ISO date
  effectiveTo?: string | null;
  isActive: boolean;
  notes: string;
  /** Algorithm B policy-fit tags, e.g. FHB_FRIENDLY, PORTFOLIO_INVESTOR_FRIENDLY. */
  tags?: string[];
  residentialOwnerOcc: ProductPolicy;
  residentialInvestment: ProductPolicy;
  commercialPropertyLight: ProductPolicy;
}

export type ScenarioPattern = 'FHB_PAYG' | 'UPGRADER_FAMILY' | 'PORTFOLIO_INVESTOR' | 'SELF_EMPLOYED_PRO' | 'COMMERCIAL_BUYER';

export interface PatternRankResult {
  patterns: ScenarioPattern[];
  desiredTags: string[];
  clusterBrandCodes: string[];
  recommendations: BankRecommendation[];
}

// ---------------------------------------------------------------------------
// Client scenario inputs (decoupled from Prisma)
// ---------------------------------------------------------------------------

export type IncomeType = 'SALARY_PRIMARY' | 'SALARY_SECONDARY' | 'RENTAL' | 'GOV' | 'BUSINESS' | 'OTHER';

export interface EngineIncomeSource {
  type: IncomeType;
  amount: number;
  frequency: Frequency;
  monthsHistory?: number;
  yearsFinancials?: number;
}

export interface EngineExpenseSummary {
  /** Declared monthly living expenses (excl. rent/loans counted elsewhere). */
  declaredMonthlyLiving: number;
  monthlyRent?: number; // if renting primary residence
}

export type LiabilitySource = 'PROPERTY_SECURED' | 'STANDALONE';
export type StandaloneDebtType = 'CREDIT_CARD' | 'PERSONAL_LOAN' | 'CAR_LOAN' | 'HECS_HELP' | 'BUSINESS_UNSECURED' | 'OTHER';

export interface EngineDebt {
  id: string;
  type: StandaloneDebtType;
  source: LiabilitySource; // engine only counts STANDALONE here
  lender?: string;
  creditLimit?: number;
  currentBalance?: number;
  monthlyRepayment?: number;
}

export type EnginePropertyType = 'OWNER_OCC' | 'INVESTMENT' | 'COMMERCIAL';

export interface EngineProperty {
  id: string;
  type: EnginePropertyType;
  estimatedValue: number;
  currentLoanBalance: number;
  currentRepaymentAmount: number; // monthly, property-secured loan
  grossRentalIncomeMonthly: number;
  lender?: string;
  isIncludedInCalc: boolean;
  /** Per-bank inclusion override keyed by brandCode. */
  includeOverrideForBank?: Record<string, boolean>;
}

export interface EngineClientProfile {
  numberOfAdults: number;   // borrowers + adult dependants
  numberOfChildren: number;
  isSelfEmployed?: boolean;
}

export interface EngineLoanScenario {
  purpose: ProductType;
  targetLoanAmount: number;
  targetPropertyValue: number; // value of the primary security for LVR
  termYears: number;
  interestRate: number;        // actual/quoted annual decimal
  repaymentType: RepaymentType;
}

export interface ScenarioInput {
  client: EngineClientProfile;
  incomeSources: EngineIncomeSource[];
  expenses: EngineExpenseSummary;
  properties: EngineProperty[];
  debts: EngineDebt[];
  scenario: EngineLoanScenario;
}

// ---------------------------------------------------------------------------
// Engine outputs
// ---------------------------------------------------------------------------

export type PassFail = 'PASS' | 'MARGINAL' | 'FAIL';

export interface BankCalcResult {
  bankName: string;
  brandCode: string;
  productType: ProductType;
  maxBorrowServiceability: number;
  maxBorrowDti: number;
  maxBorrowLvr: number;
  finalMaxBorrow: number;
  dtiRatio: number;
  lvrRatio: number;
  totalMonthlyIncome: number;
  totalMonthlyExpenses: number;
  totalMonthlyCommitments: number;
  netMonthlySurplus: number;
  stressRateUsed: number;
  passFail: PassFail;
  reasons: string[];
  policyVersion: string;
  propertiesConsidered: string[]; // ids included for this bank
}

export type RecommendationCategory = 'PRIMARY' | 'SECONDARY' | 'LONG_SHOT';

export interface BankRecommendation {
  bankName: string;
  brandCode: string;
  score: number;
  category: RecommendationCategory;
  reasonSummary: string;
  calcResult: BankCalcResult;
}

export interface DuplicateLoanWarning {
  propertyId: string;
  debtId: string;
  lender?: string;
  reason: string;
}
