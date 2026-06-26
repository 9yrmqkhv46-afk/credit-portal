/**
 * 2026 Bank Lending Policy Engine — calculation core.
 *
 * Runs a single bank's active ProductPolicy against a client scenario and
 * returns a comparable BankCalcResult (serviceability max, DTI max, LVR cap,
 * final max borrow, pass/fail + human-readable reasons). Pure functions only.
 */

import {
  BankPolicy, ProductPolicy, ProductType, ScenarioInput, BankCalcResult,
  EngineProperty, EngineDebt, EngineIncomeSource, EngineClientProfile,
  EngineExpenseSummary, Frequency, DuplicateLoanWarning, PassFail,
} from './types';

const MONTHS = 12;

export function toMonthly(amount: number, frequency: Frequency): number {
  switch (frequency) {
    case 'WEEKLY': return (amount * 52) / 12;
    case 'FORTNIGHTLY': return (amount * 26) / 12;
    case 'ANNUAL': return amount / 12;
    case 'MONTHLY':
    default: return amount;
  }
}

/** Largest principal whose P&I monthly repayment equals `payment`. */
export function principalFromPayment(payment: number, annualRate: number, termYears: number): number {
  if (payment <= 0) return 0;
  const r = annualRate / MONTHS;
  const n = termYears * MONTHS;
  if (r <= 0) return payment * n;
  return (payment * (1 - Math.pow(1 + r, -n))) / r;
}

/** Standard monthly P&I repayment for a given principal. */
export function monthlyRepayment(principal: number, annualRate: number, termYears: number): number {
  const r = annualRate / MONTHS;
  const n = termYears * MONTHS;
  if (principal <= 0) return 0;
  if (r <= 0) return principal / n;
  return (principal * r) / (1 - Math.pow(1 + r, -n));
}

function chooseProductPolicy(policy: BankPolicy, purpose: ProductType): ProductPolicy {
  if (purpose === 'INVESTMENT') return policy.residentialInvestment;
  if (purpose === 'COMMERCIAL_PROPERTY_LIGHT') return policy.commercialPropertyLight;
  return policy.residentialOwnerOcc;
}

/**
 * Detect liabilities entered both as a property-secured loan and as a
 * STANDALONE debt (same lender + similar repayment/balance). Prevents double
 * counting in serviceability.
 */
export function detectDuplicateLoans(properties: EngineProperty[], debts: EngineDebt[]): DuplicateLoanWarning[] {
  const warnings: DuplicateLoanWarning[] = [];
  const near = (a: number | undefined, b: number | undefined) => {
    if (a == null || b == null) return false;
    if (a === 0 && b === 0) return false;
    return Math.abs(a - b) <= Math.max(50, 0.02 * Math.max(a, b)); // within 2% or $50
  };
  for (const p of properties) {
    for (const d of debts.filter((x) => x.source === 'STANDALONE')) {
      const sameLender = !!p.lender && !!d.lender && p.lender.trim().toLowerCase() === d.lender.trim().toLowerCase();
      const sameRepay = near(p.currentRepaymentAmount, d.monthlyRepayment);
      const sameBalance = near(p.currentLoanBalance, d.currentBalance);
      if (sameLender && (sameRepay || sameBalance)) {
        warnings.push({
          propertyId: p.id,
          debtId: d.id,
          lender: d.lender,
          reason: `Standalone debt appears to duplicate the loan secured against property ${p.id} (same lender + ${sameRepay ? 'repayment' : 'balance'}).`,
        });
      }
    }
  }
  return warnings;
}

/** Select which properties a given bank considers, per its PropertyTreatmentRules. */
export function selectPropertiesForBank(properties: EngineProperty[], policy: ProductPolicy, brandCode: string): EngineProperty[] {
  const rules = policy.propertyTreatmentRules;
  let pool = properties.filter((p) => {
    const included = p.includeOverrideForBank?.[brandCode] ?? p.isIncludedInCalc;
    if (!included) return false;
    if (p.type === 'OWNER_OCC') return rules.includeOwnerOccPropertyInCalc;
    if (p.type === 'INVESTMENT') return rules.includeInvestmentPropertiesInCalc;
    if (p.type === 'COMMERCIAL') return rules.includeCommercialPropertiesInCalc;
    return false;
  });

  if (rules.selectionStrategy === 'topByEquity') {
    pool = [...pool].sort((a, b) => (b.estimatedValue - b.currentLoanBalance) - (a.estimatedValue - a.currentLoanBalance));
  } else if (rules.selectionStrategy === 'topByLoanBalance') {
    pool = [...pool].sort((a, b) => b.currentLoanBalance - a.currentLoanBalance);
  }

  if (rules.selectionStrategy !== 'all') {
    pool = pool.slice(0, Math.max(0, rules.maxPropertiesConsidered));
  }
  return pool;
}

function shadedIncomeMonthly(
  sources: EngineIncomeSource[],
  includedProperties: EngineProperty[],
  policy: ProductPolicy,
): { shadedMonthly: number; grossMonthly: number } {
  const sh = policy.incomeShadingRules;
  let shaded = 0;
  let gross = 0;

  for (const s of sources) {
    const m = toMonthly(s.amount, s.frequency);
    gross += m;
    switch (s.type) {
      case 'SALARY_PRIMARY': shaded += m * sh.salaryPrimary.acceptPct; break;
      case 'SALARY_SECONDARY': shaded += m * sh.salarySecondary.acceptPct; break;
      case 'GOV': shaded += m * sh.govBenefits.acceptPct; break;
      case 'BUSINESS': shaded += m * sh.businessIncome.acceptPct; break;
      case 'RENTAL': shaded += m * sh.rental.acceptPct * (1 - sh.rental.vacancyFactorPct); break;
      case 'OTHER':
      default: shaded += m * sh.other.acceptPct; break;
    }
  }

  // Auto-aggregate rental from included investment / commercial properties.
  for (const p of includedProperties) {
    if (p.type === 'INVESTMENT' || p.type === 'COMMERCIAL') {
      gross += p.grossRentalIncomeMonthly;
      shaded += p.grossRentalIncomeMonthly * sh.rental.acceptPct * (1 - sh.rental.vacancyFactorPct);
    }
  }

  return { shadedMonthly: shaded, grossMonthly: gross };
}

function expensesMonthly(client: EngineClientProfile, expenses: EngineExpenseSummary, policy: ProductPolicy): number {
  const er = policy.expenseTreatmentRules;
  const declared = (expenses.declaredMonthlyLiving || 0) + (expenses.monthlyRent || 0);
  if (!er.useHem) return declared;
  const hem = client.numberOfAdults * er.minLivingExpensePerAdult + client.numberOfChildren * er.minLivingExpensePerChild;
  return er.treatClientDeclaredAsFloor ? Math.max(declared, hem + (expenses.monthlyRent || 0)) : declared;
}

function commitmentsMonthly(
  includedProperties: EngineProperty[],
  debts: EngineDebt[],
  policy: ProductPolicy,
  duplicateDebtIds: Set<string>,
): number {
  const dr = policy.debtTreatmentRules;
  let total = 0;

  // Property-secured loans on included properties.
  for (const p of includedProperties) total += p.currentRepaymentAmount || 0;

  // Standalone debts (skip duplicates of property loans).
  for (const d of debts) {
    if (d.source !== 'STANDALONE') continue;
    if (duplicateDebtIds.has(d.id)) continue;
    switch (d.type) {
      case 'CREDIT_CARD':
        total += (d.creditLimit ?? d.currentBalance ?? 0) * dr.creditCardRepaymentPctOfLimit;
        break;
      case 'PERSONAL_LOAN':
        total += dr.personalLoanRepaymentCalc === 'actual'
          ? (d.monthlyRepayment ?? 0)
          : (d.currentBalance ?? 0) * 0.03;
        break;
      case 'CAR_LOAN':
        total += dr.carLoanRepaymentCalc === 'actual'
          ? (d.monthlyRepayment ?? 0)
          : (d.currentBalance ?? 0) * 0.03;
        break;
      case 'HECS_HELP':
        total += dr.hecsHelpTreatment === 'ignoreBelowThreshold' ? 0 : (d.monthlyRepayment ?? 0);
        break;
      default:
        total += dr.otherLoanRepaymentCalc === 'buffered'
          ? (d.monthlyRepayment ?? 0) * 1.2
          : (d.monthlyRepayment ?? 0);
    }
  }
  return total;
}

/** Run a single bank's policy against the scenario. */
export function runBankCalc(input: ScenarioInput, policy: BankPolicy): BankCalcResult {
  const { client, incomeSources, expenses, properties, debts, scenario } = input;
  const product = chooseProductPolicy(policy, scenario.purpose);
  const reasons: string[] = [];

  // Special-segment cap uplift (e.g. self-employed / HNW).
  let maxDti = product.maxDti;
  let maxLvr = product.maxLvr;
  if (client.isSelfEmployed && product.specialSegments) {
    const seg = product.specialSegments.find((s) => s.segment === 'SELF_EMPLOYED');
    if (seg?.dtiUpliftToCap) maxDti = seg.dtiUpliftToCap;
    if (seg?.lvrUpliftToCap) maxLvr = seg.lvrUpliftToCap;
  }

  // Duplicate detection -> set of standalone debt ids to ignore.
  const duplicates = detectDuplicateLoans(properties, debts);
  const duplicateDebtIds = new Set(duplicates.map((d) => d.debtId));
  if (duplicates.length) reasons.push(`${duplicates.length} duplicate loan(s) detected and excluded to avoid double counting.`);

  const included = selectPropertiesForBank(properties, product, policy.brandCode);
  if (properties.length > included.length) {
    reasons.push(`Considered ${included.length} of ${properties.length} properties (strategy: ${product.propertyTreatmentRules.selectionStrategy}, cap ${product.propertyTreatmentRules.maxPropertiesConsidered}).`);
  }

  const { shadedMonthly: totalMonthlyIncome, grossMonthly } = shadedIncomeMonthly(incomeSources, included, product);
  const grossAnnualIncome = grossMonthly * MONTHS;
  const totalMonthlyExpenses = expensesMonthly(client, expenses, product);
  const totalMonthlyCommitments = commitmentsMonthly(included, debts, product, duplicateDebtIds);
  const netMonthlySurplus = totalMonthlyIncome - (totalMonthlyExpenses + totalMonthlyCommitments);

  // Stress rate (APRA-style buffer; extra IO loading if applicable).
  let stressRateUsed = product.baseRateAssumption + product.serviceabilityBufferBps / 10000;
  if (scenario.repaymentType === 'IO' && product.interestOnlyTreatment?.allowed) {
    stressRateUsed += product.interestOnlyTreatment.ioAssessmentRateLoadingBps / 10000;
  }

  const maxBorrowServiceability = netMonthlySurplus > 0
    ? principalFromPayment(netMonthlySurplus, stressRateUsed, scenario.termYears)
    : 0;
  if (netMonthlySurplus <= 0) reasons.push('Monthly expenses + commitments exceed shaded income — no serviceability headroom.');

  // DTI cap.
  const existingDebtTotal =
    included.reduce((s, p) => s + (p.currentLoanBalance || 0), 0) +
    debts.filter((d) => d.source === 'STANDALONE' && !duplicateDebtIds.has(d.id)).reduce((s, d) => s + (d.currentBalance || 0), 0);
  const maxBorrowDti = grossAnnualIncome > 0 ? Math.max(0, maxDti * grossAnnualIncome - existingDebtTotal) : 0;

  // LVR cap.
  const maxBorrowLvr = maxLvr * scenario.targetPropertyValue;

  let finalMaxBorrow = Math.min(maxBorrowServiceability, maxBorrowDti, maxBorrowLvr);
  finalMaxBorrow = Math.min(finalMaxBorrow, product.maxLoanAmount);
  finalMaxBorrow = Math.max(0, Math.round(finalMaxBorrow / 1000) * 1000);

  const lvrRatio = scenario.targetPropertyValue > 0 ? scenario.targetLoanAmount / scenario.targetPropertyValue : 0;
  const dtiRatio = grossAnnualIncome > 0 ? (existingDebtTotal + scenario.targetLoanAmount) / grossAnnualIncome : 0;

  // Binding constraint explanation.
  if (finalMaxBorrow === Math.round(maxBorrowServiceability / 1000) * 1000 && maxBorrowServiceability < maxBorrowDti && maxBorrowServiceability < maxBorrowLvr) {
    reasons.push(`Limited by serviceability at a stress rate of ${(stressRateUsed * 100).toFixed(2)}%.`);
  }
  if (maxBorrowDti < maxBorrowServiceability && maxBorrowDti <= maxBorrowLvr) {
    reasons.push(`Limited by DTI cap of ${maxDti.toFixed(1)}x gross income.`);
  }
  if (maxBorrowLvr < maxBorrowServiceability && maxBorrowLvr < maxBorrowDti) {
    reasons.push(`Limited by max LVR of ${(maxLvr * 100).toFixed(0)}%.`);
  }

  // Hard breaches.
  const breaches: string[] = [];
  if (lvrRatio > maxLvr + 1e-9) breaches.push(`Requested LVR ${(lvrRatio * 100).toFixed(1)}% exceeds the ${(maxLvr * 100).toFixed(0)}% cap.`);
  if (dtiRatio > maxDti + 1e-9) breaches.push(`Requested DTI ${dtiRatio.toFixed(1)}x exceeds the ${maxDti.toFixed(1)}x cap.`);
  if (scenario.targetLoanAmount < product.minLoanAmount) breaches.push(`Below minimum loan of $${product.minLoanAmount.toLocaleString()}.`);
  if (scenario.targetLoanAmount > product.maxLoanAmount) breaches.push(`Above maximum retail loan of $${product.maxLoanAmount.toLocaleString()}.`);
  reasons.push(...breaches);

  let passFail: PassFail;
  if (breaches.length === 0 && finalMaxBorrow >= scenario.targetLoanAmount) passFail = 'PASS';
  else if (breaches.length === 0 && finalMaxBorrow >= scenario.targetLoanAmount * 0.9) passFail = 'MARGINAL';
  else passFail = 'FAIL';

  if (passFail === 'PASS') reasons.unshift(`Approves up to $${finalMaxBorrow.toLocaleString()} — covers the $${scenario.targetLoanAmount.toLocaleString()} requested.`);
  else if (passFail === 'MARGINAL') reasons.unshift(`Marginal: max ~$${finalMaxBorrow.toLocaleString()} vs $${scenario.targetLoanAmount.toLocaleString()} requested.`);
  else reasons.unshift(`Falls short: max ~$${finalMaxBorrow.toLocaleString()} vs $${scenario.targetLoanAmount.toLocaleString()} requested.`);

  return {
    bankName: policy.bankName,
    brandCode: policy.brandCode,
    productType: scenario.purpose,
    maxBorrowServiceability: Math.round(maxBorrowServiceability),
    maxBorrowDti: Math.round(maxBorrowDti),
    maxBorrowLvr: Math.round(maxBorrowLvr),
    finalMaxBorrow,
    dtiRatio: Number(dtiRatio.toFixed(2)),
    lvrRatio: Number(lvrRatio.toFixed(4)),
    totalMonthlyIncome: Math.round(totalMonthlyIncome),
    totalMonthlyExpenses: Math.round(totalMonthlyExpenses),
    totalMonthlyCommitments: Math.round(totalMonthlyCommitments),
    netMonthlySurplus: Math.round(netMonthlySurplus),
    stressRateUsed: Number(stressRateUsed.toFixed(4)),
    passFail,
    reasons,
    policyVersion: policy.policyVersion,
    propertiesConsidered: included.map((p) => p.id),
  };
}
