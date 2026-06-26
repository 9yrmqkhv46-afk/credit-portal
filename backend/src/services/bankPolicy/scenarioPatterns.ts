/**
 * 2026 Bank Lending Policy Engine — canonical scenario patterns (feature D).
 *
 * Defines the "client patterns" used by Search Algorithm B (Scenario Pattern
 * Matching): each pattern carries the bank capability TAGS that suit it. A
 * client scenario is classified into one or more patterns, then banks are
 * shortlisted by tag overlap. This is the qualitative, low-numeric first pass
 * that feeds the deterministic engine (Algorithm A) for final ordering.
 */

import { BankTag } from './classify';
import { ScenarioInput } from './types';

export type PatternId =
  | 'FHB_PAYG'
  | 'UPGRADER_FAMILY'
  | 'PORTFOLIO_INVESTOR'
  | 'SELF_EMPLOYED_PRO'
  | 'COMMERCIAL_BUYER'
  | 'HIGH_LEVERAGE'
  | 'LOW_LEVERAGE_HIGH_SURPLUS';

export interface ScenarioPattern {
  id: PatternId;
  label: string;
  description: string;
  preferredTags: BankTag[];
}

export const SCENARIO_PATTERNS: ScenarioPattern[] = [
  {
    id: 'FHB_PAYG',
    label: 'First-home buyer (PAYG)',
    description: 'PAYG applicant(s), owner-occupied purchase, deposit-light (high LVR), few or no other properties.',
    preferredTags: ['FHB_FRIENDLY', 'PAYG_FRIENDLY'],
  },
  {
    id: 'UPGRADER_FAMILY',
    label: 'Upgrader family',
    description: 'PAYG household with dependants upgrading the owner-occupied home; sensitive to living-expense floors.',
    preferredTags: ['PAYG_FRIENDLY', 'FHB_FRIENDLY'],
  },
  {
    id: 'PORTFOLIO_INVESTOR',
    label: 'Portfolio investor',
    description: 'Multiple investment properties with material rental income; needs portfolio assessment and DTI tolerance.',
    preferredTags: ['PORTFOLIO_INVESTOR_FRIENDLY', 'RENTAL_GENEROUS', 'HIGH_DTI_TOLERANCE', 'INTEREST_ONLY_FRIENDLY'],
  },
  {
    id: 'SELF_EMPLOYED_PRO',
    label: 'Self-employed professional',
    description: 'Self-employed / business income; needs stronger business-income acceptance and DTI uplift.',
    preferredTags: ['SELF_EMPLOYED_FRIENDLY', 'HIGH_DTI_TOLERANCE'],
  },
  {
    id: 'COMMERCIAL_BUYER',
    label: 'Light-commercial buyer',
    description: 'Purchasing a light-commercial property; needs a workable commercial LVR overlay.',
    preferredTags: ['COMMERCIAL_PROPERTY_FRIENDLY'],
  },
  {
    id: 'HIGH_LEVERAGE',
    label: 'Highly geared borrower',
    description: 'Requested loan stretches DTI/LVR; needs the most flexible caps.',
    preferredTags: ['HIGH_DTI_TOLERANCE', 'PORTFOLIO_INVESTOR_FRIENDLY'],
  },
  {
    id: 'LOW_LEVERAGE_HIGH_SURPLUS',
    label: 'Low-leverage, high surplus',
    description: 'Modest loan vs income, strong surplus; nearly every lender fits — optimise on price/policy comfort.',
    preferredTags: ['PAYG_FRIENDLY', 'LOW_DTI_TOLERANCE'],
  },
];

export interface PatternMatch {
  pattern: ScenarioPattern;
  confidence: number; // 0..1
  signals: string[];
}

/**
 * Classify a client scenario into one or more canonical patterns. Heuristic and
 * deterministic — produces the tags used to shortlist banks.
 */
export function classifyScenario(input: ScenarioInput): PatternMatch[] {
  const matches: PatternMatch[] = [];
  const add = (id: PatternId, confidence: number, signals: string[]) => {
    const pattern = SCENARIO_PATTERNS.find((p) => p.id === id)!;
    matches.push({ pattern, confidence: Number(Math.min(1, confidence).toFixed(2)), signals });
  };

  const { scenario, properties, client, incomeSources } = input;
  const investmentProps = properties.filter((p) => p.type === 'INVESTMENT' && p.isIncludedInCalc);
  const grossAnnual = incomeSources.reduce((s, i) => s + i.amount * (i.frequency === 'ANNUAL' ? 1 : 12), 0)
    || incomeSources.reduce((s, i) => s + i.amount * 12, 0);
  const lvr = scenario.targetPropertyValue > 0 ? scenario.targetLoanAmount / scenario.targetPropertyValue : 0;
  const roughDti = grossAnnual > 0 ? scenario.targetLoanAmount / grossAnnual : 0;
  const hasBusinessIncome = client.isSelfEmployed || incomeSources.some((i) => i.type === 'BUSINESS');

  if (scenario.purpose === 'COMMERCIAL_PROPERTY_LIGHT') {
    add('COMMERCIAL_BUYER', 0.9, ['Loan purpose is light-commercial property.']);
  }

  if (hasBusinessIncome) {
    add('SELF_EMPLOYED_PRO', 0.85, ['Self-employed / business income present.']);
  }

  if (investmentProps.length >= 2 || (scenario.purpose === 'INVESTMENT' && investmentProps.length >= 1)) {
    add('PORTFOLIO_INVESTOR', Math.min(1, 0.5 + 0.15 * investmentProps.length), [`${investmentProps.length} included investment property(ies).`]);
  }

  if (scenario.purpose === 'OWNER_OCC') {
    if (lvr >= 0.85) add('FHB_PAYG', 0.75, [`High LVR (${Math.round(lvr * 100)}%) owner-occupied purchase.`]);
    if (client.numberOfChildren >= 1) add('UPGRADER_FAMILY', 0.6 + 0.1 * client.numberOfChildren, [`${client.numberOfChildren} child dependant(s).`]);
    else if (lvr < 0.85) add('FHB_PAYG', 0.55, ['Owner-occupied purchase with moderate LVR.']);
  }

  if (roughDti >= 6) add('HIGH_LEVERAGE', Math.min(1, (roughDti - 5) / 2), [`Loan ≈ ${roughDti.toFixed(1)}x gross income.`]);
  if (roughDti > 0 && roughDti <= 4 && lvr <= 0.8) add('LOW_LEVERAGE_HIGH_SURPLUS', 0.7, [`Loan ≈ ${roughDti.toFixed(1)}x income at ${Math.round(lvr * 100)}% LVR.`]);

  if (matches.length === 0) add('FHB_PAYG', 0.4, ['No strong signals — defaulting to mainstream PAYG.']);

  return matches.sort((a, b) => b.confidence - a.confidence);
}

/** The union of preferred tags across matched patterns, weighted by confidence. */
export function preferredTagWeights(matches: PatternMatch[]): Map<BankTag, number> {
  const weights = new Map<BankTag, number>();
  for (const m of matches) {
    for (const tag of m.pattern.preferredTags) {
      weights.set(tag, (weights.get(tag) ?? 0) + m.confidence);
    }
  }
  return weights;
}
