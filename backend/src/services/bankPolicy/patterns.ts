/**
 * Search Algorithm B — Scenario Pattern Matching.
 *
 * Classifies a client scenario into canonical patterns, maps those patterns to
 * the policy-fit tags each bank carries, and narrows the field to a candidate
 * cluster. Algorithm A (the quantitative ranker) then scores within that
 * cluster. This is the "tags + policy fit" pre-filter, not the numeric engine.
 */

import { BankPolicy, ScenarioInput, ScenarioPattern } from './types';

/** Classify the scenario into one or more canonical client patterns. */
export function classifyScenario(input: ScenarioInput): ScenarioPattern[] {
  const { client, properties, scenario } = input;
  const patterns: ScenarioPattern[] = [];
  const investmentProps = properties.filter((p) => p.type === 'INVESTMENT').length;
  const ownsAny = properties.length > 0;

  if (scenario.purpose === 'COMMERCIAL_PROPERTY_LIGHT' || properties.some((p) => p.type === 'COMMERCIAL')) {
    patterns.push('COMMERCIAL_BUYER');
  }
  if (client.isSelfEmployed) patterns.push('SELF_EMPLOYED_PRO');
  if (investmentProps >= 2 || (scenario.purpose === 'INVESTMENT' && investmentProps >= 1)) {
    patterns.push('PORTFOLIO_INVESTOR');
  }
  if (scenario.purpose !== 'INVESTMENT' && client.numberOfChildren > 0 && ownsAny) {
    patterns.push('UPGRADER_FAMILY');
  }
  if (!ownsAny && scenario.purpose === 'OWNER_OCC' && !client.isSelfEmployed) {
    patterns.push('FHB_PAYG');
  }
  if (patterns.length === 0) patterns.push('FHB_PAYG'); // sensible default
  return patterns;
}

const PATTERN_TAGS: Record<ScenarioPattern, string[]> = {
  FHB_PAYG: ['FHB_FRIENDLY', 'PAYG_FRIENDLY'],
  UPGRADER_FAMILY: ['PAYG_FRIENDLY', 'CONSERVATIVE_BASELINE'],
  PORTFOLIO_INVESTOR: ['PORTFOLIO_INVESTOR_FRIENDLY', 'INVESTOR_FRIENDLY'],
  SELF_EMPLOYED_PRO: ['SELF_EMPLOYED_FRIENDLY', 'PROFESSIONAL_FRIENDLY'],
  COMMERCIAL_BUYER: ['COMMERCIAL_FRIENDLY'],
};

/** The set of tags we want banks to carry for the detected patterns. */
export function desiredTags(patterns: ScenarioPattern[]): string[] {
  const set = new Set<string>();
  for (const p of patterns) for (const t of PATTERN_TAGS[p]) set.add(t);
  return [...set];
}

/**
 * Narrow to banks whose tags overlap the desired tags. If fewer than 4 match
 * (too tight to rank meaningfully), fall back to all banks so Algorithm A still
 * has room to work.
 */
export function selectCluster(patterns: ScenarioPattern[], policies: BankPolicy[]): { cluster: BankPolicy[]; tags: string[] } {
  const want = desiredTags(patterns);
  const matched = policies.filter((p) => (p.tags || []).some((t) => want.includes(t)));
  return { cluster: matched.length >= 4 ? matched : policies, tags: want };
}
