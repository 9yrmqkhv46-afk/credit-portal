/**
 * 2026 Bank Lending Policy Engine — "Explain the recommendation" (feature B).
 *
 * Turns a deterministic BankRecommendation (score + BankCalcResult + reasons)
 * into a plain-English, broker-facing rationale: a headline, a short narrative,
 * concrete strengths/watch-outs for THIS client, the binding constraint, and
 * suggested next steps.
 *
 * This is a NARRATION layer over deterministic results — it never changes the
 * numbers or the ranking. Same inputs always produce the same explanation.
 *
 * DISCLAIMER: derived from modelled estimates only — not official lender policy.
 */

import { BankPolicy, BankRecommendation, EngineLoanScenario, ProductPolicy, ProductType } from './types';
import {
  rentalStance, businessIncomeStance, variableIncomeStance, bufferStance,
  expenseStrictness, portfolioComfort, portfolioPhrase, hasSelfEmployedUplift,
} from './classify';

export interface RecommendationExplanation {
  brandCode: string;
  bankName: string;
  category: BankRecommendation['category'];
  headline: string;
  narrative: string;
  strengths: string[];
  watchOuts: string[];
  bindingConstraint: string;
  nextSteps: string[];
}

const money = (n: number) => `$${Math.round(n || 0).toLocaleString()}`;

function productFor(policy: BankPolicy, purpose: ProductType): ProductPolicy {
  if (purpose === 'INVESTMENT') return policy.residentialInvestment;
  if (purpose === 'COMMERCIAL_PROPERTY_LIGHT') return policy.commercialPropertyLight;
  return policy.residentialOwnerOcc;
}

/** Identify which of the three caps is binding for this result. */
function bindingConstraint(rec: BankRecommendation): string {
  const c = rec.calcResult;
  const caps: Array<[string, number]> = [
    ['serviceability', c.maxBorrowServiceability],
    ['DTI', c.maxBorrowDti],
    ['LVR', c.maxBorrowLvr],
  ];
  caps.sort((a, b) => a[1] - b[1]);
  const [name, value] = caps[0];
  if (name === 'serviceability') return `Serviceability is the binding limit (~${money(value)}) at a stress rate of ${(c.stressRateUsed * 100).toFixed(2)}%.`;
  if (name === 'DTI') return `The DTI cap is the binding limit (~${money(value)}) — borrowing capacity is constrained by income, not cash flow.`;
  return `The LVR cap is the binding limit (~${money(value)}) — capacity is constrained by deposit/equity, not income.`;
}

/**
 * Build the broker-facing explanation. `policy` is optional; when supplied it
 * enables the bank-specific strengths/watch-outs (otherwise they're omitted).
 */
export function explainRecommendation(
  rec: BankRecommendation,
  scenario: EngineLoanScenario,
  policy?: BankPolicy,
): RecommendationExplanation {
  const c = rec.calcResult;
  const target = scenario.targetLoanAmount;
  const ratio = target > 0 ? c.finalMaxBorrow / target : 0;

  // Headline by category.
  let headline: string;
  if (rec.category === 'PRIMARY') headline = `${rec.bankName} is the strongest fit for this client.`;
  else if (rec.category === 'SECONDARY') headline = `${rec.bankName} is a workable back-up option.`;
  else headline = `${rec.bankName} is a stretch for this scenario.`;

  // Narrative.
  const surplusNote = c.netMonthlySurplus > 0
    ? `a modelled monthly surplus of ${money(c.netMonthlySurplus)}`
    : `no monthly surplus (expenses and commitments exceed shaded income)`;
  const coverNote = c.passFail === 'PASS'
    ? `comfortably covering the ${money(target)} requested (${Math.round(ratio * 100)}% of target).`
    : c.passFail === 'MARGINAL'
      ? `just short of the ${money(target)} requested (${Math.round(ratio * 100)}% of target) — close enough to revisit.`
      : `well short of the ${money(target)} requested (${Math.round(ratio * 100)}% of target).`;
  const narrative = `On this client's saved data, ${rec.bankName} models a maximum of ${money(c.finalMaxBorrow)}, ${coverNote} It assesses ${surplusNote}, a DTI of ${c.dtiRatio}x and an LVR of ${(c.lvrRatio * 100).toFixed(0)}%. Suitability score: ${(rec.score * 100).toFixed(0)}/100.`;

  // Strengths / watch-outs specific to this client + bank.
  const strengths: string[] = [];
  const watchOuts: string[] = [];

  if (policy) {
    const product = productFor(policy, scenario.purpose);
    const dtiHead = product.maxDti - c.dtiRatio;
    const lvrHead = product.maxLvr - c.lvrRatio;

    if (dtiHead >= 0.75) strengths.push(`Comfortable DTI headroom (${dtiHead.toFixed(1)}x below the ${product.maxDti.toFixed(1)}x cap).`);
    else if (dtiHead < 0) watchOuts.push(`DTI is over this bank's ${product.maxDti.toFixed(1)}x cap.`);
    else watchOuts.push(`Limited DTI headroom (only ${dtiHead.toFixed(1)}x below the ${product.maxDti.toFixed(1)}x cap).`);

    if (lvrHead >= 0.05) strengths.push(`LVR headroom of ~${(lvrHead * 100).toFixed(0)}% below the ${(product.maxLvr * 100).toFixed(0)}% cap.`);
    else if (lvrHead < 0) watchOuts.push(`Requested LVR exceeds this bank's ${(product.maxLvr * 100).toFixed(0)}% cap.`);

    if (bufferStance(product.serviceabilityBufferBps) === 'higher') watchOuts.push(`Uses a higher serviceability buffer (+${(product.serviceabilityBufferBps / 100).toFixed(2)}%), which lowers capacity.`);

    if (scenario.purpose === 'INVESTMENT') {
      if (rentalStance(product.incomeShadingRules.rental.acceptPct) === 'generous') strengths.push('Generous rental-income acceptance helps this investment scenario.');
      if (rentalStance(product.incomeShadingRules.rental.acceptPct) === 'conservative') watchOuts.push('Conservative rental-income acceptance limits this investment scenario.');
      if (portfolioComfort(product) === 'large') strengths.push(`Assesses the full portfolio — ${portfolioPhrase(product)}.`);
      if (portfolioComfort(product) === 'small' && c.propertiesConsidered.length >= product.propertyTreatmentRules.maxPropertiesConsidered) {
        watchOuts.push(`Only ${portfolioPhrase(product)} — extra properties are ignored.`);
      }
    }

    if (hasSelfEmployedUplift(product) || businessIncomeStance(product.incomeShadingRules.businessIncome.acceptPct) === 'generous') {
      strengths.push('Stronger treatment of self-employed / business income.');
    }
    if (variableIncomeStance(product.incomeShadingRules.salarySecondary.acceptPct) === 'generous') {
      strengths.push('More generous on bonus / overtime income.');
    }
    if (expenseStrictness(product.expenseTreatmentRules.minLivingExpensePerAdult) === 'conservative') {
      watchOuts.push('Higher minimum living-expense floors reduce assessed surplus.');
    }
    if (scenario.repaymentType === 'IO' && !product.interestOnlyTreatment?.allowed) {
      watchOuts.push('Interest-only is not supported here for this purpose.');
    }
  }

  // Pull any engine-flagged hard breaches / duplicates into watch-outs.
  for (const r of c.reasons) {
    if (/exceeds|duplicate|no serviceability/i.test(r) && !watchOuts.some((w) => w.toLowerCase() === r.toLowerCase())) {
      watchOuts.push(r);
    }
  }

  // Next steps.
  const nextSteps: string[] = [];
  if (c.passFail === 'PASS') nextSteps.push('Proceed: prepare a full application and request a formal assessment.');
  else if (c.passFail === 'MARGINAL') {
    const gap = target - c.finalMaxBorrow;
    nextSteps.push(`Bridge the ~${money(Math.max(0, gap))} gap: trim the loan, increase deposit, or reduce assessed commitments (e.g. lower card limits).`);
  } else {
    nextSteps.push('Treat as a long shot — focus on the higher-ranked lenders, or restructure the scenario (deposit, loan size, debts).');
  }
  if (bindingConstraint(rec).startsWith('Serviceability')) nextSteps.push('Reducing credit-card limits or clearing small debts directly lifts serviceability.');

  return {
    brandCode: rec.brandCode,
    bankName: rec.bankName,
    category: rec.category,
    headline,
    narrative,
    strengths,
    watchOuts,
    bindingConstraint: bindingConstraint(rec),
    nextSteps,
  };
}

/** Convenience: explain a list of recommendations, matching policies by brandCode. */
export function explainRecommendations(
  recs: BankRecommendation[],
  scenario: EngineLoanScenario,
  policies: BankPolicy[],
): RecommendationExplanation[] {
  const byBrand = new Map(policies.map((p) => [p.brandCode, p]));
  return recs.map((r) => explainRecommendation(r, scenario, byBrand.get(r.brandCode)));
}
