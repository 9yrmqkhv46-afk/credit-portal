/**
 * 2026 Bank Lending Policy Engine — search & ranking.
 *
 * Runs every active bank policy against one client scenario and ranks the
 * lenders by a weighted suitability score, then buckets them into PRIMARY /
 * SECONDARY / LONG_SHOT with a short human-readable reason.
 */

import { BankPolicy, ScenarioInput, BankRecommendation, ProductPolicy, ProductType } from './types';
import { runBankCalc } from './engine';

const WEIGHTS = {
  serviceabilityMargin: 0.35,
  dtiComfort: 0.20,
  lvrComfort: 0.15,
  productFit: 0.15,
  propertyFlex: 0.10,
  incomeFriendliness: 0.05,
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function productFor(policy: BankPolicy, purpose: ProductType): ProductPolicy {
  if (purpose === 'INVESTMENT') return policy.residentialInvestment;
  if (purpose === 'COMMERCIAL_PROPERTY_LIGHT') return policy.commercialPropertyLight;
  return policy.residentialOwnerOcc;
}

export function rankBanksForScenario(input: ScenarioInput, policies: BankPolicy[]): BankRecommendation[] {
  const active = policies.filter((p) => p.isActive);
  const target = Math.max(1, input.scenario.targetLoanAmount);

  const recs: BankRecommendation[] = active.map((policy) => {
    const calc = runBankCalc(input, policy);
    const product = productFor(policy, input.scenario.purpose);

    // --- scoring dimensions, each normalised to 0..1 ---
    const ratio = calc.finalMaxBorrow / target;
    const serviceabilityMargin = clamp01((ratio - 0.8) / (1.3 - 0.8)); // 0.8x->0, 1.3x->1

    const dtiComfort = product.maxDti > 0 ? clamp01((product.maxDti - calc.dtiRatio) / product.maxDti) : 0;
    const lvrComfort = product.maxLvr > 0 ? clamp01((product.maxLvr - calc.lvrRatio) / product.maxLvr) : 0;

    let productFit = 1;
    if (input.scenario.repaymentType === 'IO' && !product.interestOnlyTreatment?.allowed) productFit = 0.4;

    const maxProps = product.propertyTreatmentRules.selectionStrategy === 'all'
      ? 6 : product.propertyTreatmentRules.maxPropertiesConsidered;
    const propertyFlex = clamp01(maxProps / 5);

    const incomeFriendliness = clamp01(
      (product.incomeShadingRules.rental.acceptPct + product.incomeShadingRules.businessIncome.acceptPct) / 2,
    );

    const score = clamp01(
      WEIGHTS.serviceabilityMargin * serviceabilityMargin +
      WEIGHTS.dtiComfort * dtiComfort +
      WEIGHTS.lvrComfort * lvrComfort +
      WEIGHTS.productFit * productFit +
      WEIGHTS.propertyFlex * propertyFlex +
      WEIGHTS.incomeFriendliness * incomeFriendliness,
    );

    let category: BankRecommendation['category'];
    if (calc.passFail === 'PASS' && score >= 0.75) category = 'PRIMARY';
    else if (calc.passFail !== 'FAIL' && (score >= 0.55 || calc.passFail === 'MARGINAL')) category = 'SECONDARY';
    else category = 'LONG_SHOT';

    const reasonSummary = buildSummary(policy.bankName, calc, product, category);

    return { bankName: policy.bankName, brandCode: policy.brandCode, score: Number(score.toFixed(3)), category, reasonSummary, calcResult: calc };
  });

  // Sort: PASS first, then by score desc.
  const passRank = { PASS: 0, MARGINAL: 1, FAIL: 2 } as const;
  recs.sort((a, b) => {
    const pr = passRank[a.calcResult.passFail] - passRank[b.calcResult.passFail];
    return pr !== 0 ? pr : b.score - a.score;
  });
  return recs;
}

function buildSummary(
  bankName: string,
  calc: ReturnType<typeof runBankCalc>,
  product: ProductPolicy,
  category: BankRecommendation['category'],
): string {
  const dtiHead = (product.maxDti - calc.dtiRatio).toFixed(1);
  const lvrHead = ((product.maxLvr - calc.lvrRatio) * 100).toFixed(0);
  if (category === 'PRIMARY') {
    return `${bankName} looks strongest: approves ~$${calc.finalMaxBorrow.toLocaleString()}, DTI ${dtiHead}x below cap and ~${lvrHead}% LVR headroom.`;
  }
  if (category === 'SECONDARY') {
    if (calc.passFail === 'MARGINAL') return `${bankName} marginal: max ~$${calc.finalMaxBorrow.toLocaleString()} is close to the request — consider trimming the loan or expenses.`;
    return `${bankName} is workable but tighter on serviceability/DTI than the primary options.`;
  }
  const breach = calc.reasons.find((r) => r.includes('exceeds') || r.includes('No serviceability') || r.includes('Falls short')) || 'limited serviceability/DTI for this scenario';
  return `${bankName} weak here: ${breach.toLowerCase()}`;
}
