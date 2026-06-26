/**
 * 2026 Bank Lending Policy Engine — scenario matching (feature D, EXPERIMENTAL).
 *
 * Implements the two-stage selection described in the design spec:
 *
 *   Algorithm B — Scenario Pattern Matching (qualitative, low-numeric):
 *     1. Classify the client into canonical scenario patterns.
 *     2. Shortlist banks by (a) capability-tag overlap with the patterns and
 *        (b) semantic similarity between a generated scenario "query" and each
 *        bank's policy summary (local TF-IDF cosine — see semantic.ts).
 *
 *   Algorithm A — Policy-Weighted ranking (quantitative, deterministic):
 *     3. Run the existing deterministic engine (rankBanksForScenario) and use
 *        it as the AUTHORITATIVE final ordering. Algorithm B only contributes a
 *        transparent "match" annotation and a shortlist — it never overrides the
 *        numbers.
 *
 * IMPORTANT: this layer is experimental and additive. The deterministic engine
 * remains the source of truth for every borrowing figure and the final order.
 */

import { BankPolicy, ScenarioInput, BankRecommendation } from './types';
import { bankTags, BankTag, TAG_LABELS } from './classify';
import { rankBanksForScenario } from './ranking';
import { buildBankSummary, renderMarkdown } from './summaries';
import { buildIndex, search, SemanticIndex } from './semantic';
import { classifyScenario, preferredTagWeights, PatternMatch } from './scenarioPatterns';

export interface BankMatch {
  brandCode: string;
  bankName: string;
  tagScore: number;        // 0..1 — tag overlap with the scenario patterns
  semanticScore: number;   // 0..1 — cosine similarity of summary vs scenario query
  matchScore: number;      // 0..1 — blended Algorithm-B shortlist score
  matchedTags: string[];   // human-readable tags that drove the match
  engineScore: number;     // Algorithm A deterministic suitability score
  engineCategory: BankRecommendation['category'];
  finalMaxBorrow: number;
  passFail: BankCalcPass;
}

type BankCalcPass = BankRecommendation['calcResult']['passFail'];

export interface ScenarioMatchResult {
  experimental: true;
  disclaimer: string;
  patterns: PatternMatch[];
  queryText: string;
  /** Algorithm-B shortlist (cluster), ordered by match score. */
  cluster: BankMatch[];
  /** Final top-3, ordered by the DETERMINISTIC engine within the cluster. */
  top3: BankRecommendation[];
  /** Full deterministic ranking (Algorithm A) for transparency. */
  ranking: BankRecommendation[];
}

const DISCLAIMER =
  'Experimental: Algorithm B (pattern + semantic match) only shortlists lenders. ' +
  'All borrowing figures and the final ordering come from the deterministic engine (Algorithm A).';

/**
 * Build a free-text "query document" describing the client scenario, in the
 * same vocabulary as the bank summaries — this is what the semantic index
 * matches against.
 */
export function buildQueryText(input: ScenarioInput, patterns: PatternMatch[]): string {
  const { scenario, properties, client, incomeSources } = input;
  const parts: string[] = [];

  parts.push(`Loan purpose ${scenario.purpose.replace(/_/g, ' ').toLowerCase()}.`);
  parts.push(`${scenario.repaymentType === 'IO' ? 'interest-only' : 'principal and interest'} repayments over ${scenario.termYears} years.`);

  const lvr = scenario.targetPropertyValue > 0 ? scenario.targetLoanAmount / scenario.targetPropertyValue : 0;
  if (lvr >= 0.9) parts.push('high LVR deposit-light owner-occupied first home buyer.');
  else if (lvr <= 0.8) parts.push('lower LVR strong deposit equity.');

  const inv = properties.filter((p) => p.type === 'INVESTMENT').length;
  if (inv >= 2) parts.push(`portfolio investor with ${inv} investment properties and rental income.`);
  else if (inv === 1) parts.push('one investment property with rental income.');

  if (client.isSelfEmployed || incomeSources.some((i) => i.type === 'BUSINESS')) parts.push('self-employed business income professional.');
  if (incomeSources.some((i) => i.type === 'SALARY_SECONDARY')) parts.push('bonus overtime variable income.');
  if (client.numberOfChildren >= 1) parts.push(`family with ${client.numberOfChildren} child dependants living expenses.`);

  // Pattern labels add domain vocabulary that aligns with the summaries.
  for (const m of patterns) parts.push(`${m.pattern.label}. ${m.pattern.description}`);

  return parts.join(' ');
}

/** Build (or reuse) a semantic index over the active bank policy summaries. */
export function buildPolicyIndex(policies: BankPolicy[]): SemanticIndex {
  return buildIndex(policies.map((p) => ({ id: p.brandCode, text: renderMarkdown(buildBankSummary(p)) })));
}

/**
 * Run the experimental scenario-matching pipeline (Algorithm B → Algorithm A).
 */
export function matchBanksForScenario(input: ScenarioInput, policies: BankPolicy[]): ScenarioMatchResult {
  const active = policies.filter((p) => p.isActive);

  // --- Algorithm B: classify + shortlist -----------------------------------
  const patterns = classifyScenario(input);
  const tagWeights = preferredTagWeights(patterns);
  const maxTagWeight = [...tagWeights.values()].reduce((a, b) => a + b, 0) || 1;

  const queryText = buildQueryText(input, patterns);
  const index = buildPolicyIndex(active);
  const semanticHits = new Map(search(queryText, index).map((h) => [h.id, h.similarity]));
  const maxSim = Math.max(1e-6, ...semanticHits.values());

  // --- Algorithm A: deterministic ranking (authoritative) -------------------
  const ranking = rankBanksForScenario(input, active);
  const engineByBrand = new Map(ranking.map((r) => [r.brandCode, r]));

  const cluster: BankMatch[] = active.map((policy) => {
    const tags = bankTags(policy);
    let tagScore = 0;
    const matchedTags: string[] = [];
    for (const t of tags) {
      const w = tagWeights.get(t as BankTag);
      if (w) {
        tagScore += w;
        matchedTags.push(TAG_LABELS[t]);
      }
    }
    tagScore = Math.min(1, tagScore / maxTagWeight);
    const semanticScore = Number(((semanticHits.get(policy.brandCode) ?? 0) / maxSim).toFixed(3));
    // Blend: tags dominate (explicit policy fit), semantic adds nuance.
    const matchScore = Number((0.7 * tagScore + 0.3 * semanticScore).toFixed(3));

    const eng = engineByBrand.get(policy.brandCode)!;
    return {
      brandCode: policy.brandCode,
      bankName: policy.bankName,
      tagScore: Number(tagScore.toFixed(3)),
      semanticScore,
      matchScore,
      matchedTags,
      engineScore: eng.score,
      engineCategory: eng.category,
      finalMaxBorrow: eng.calcResult.finalMaxBorrow,
      passFail: eng.calcResult.passFail,
    };
  }).sort((a, b) => b.matchScore - a.matchScore);

  // Cluster = top matches by Algorithm B (those with any policy-fit signal,
  // capped at 6). Within the cluster, defer to the deterministic ordering.
  const clusterBrands = new Set(
    cluster.filter((c) => c.matchScore > 0).slice(0, 6).map((c) => c.brandCode),
  );
  // Guarantee a non-empty cluster.
  if (clusterBrands.size === 0) cluster.slice(0, 3).forEach((c) => clusterBrands.add(c.brandCode));

  const top3 = ranking.filter((r) => clusterBrands.has(r.brandCode)).slice(0, 3);

  return {
    experimental: true,
    disclaimer: DISCLAIMER,
    patterns,
    queryText,
    cluster,
    top3,
    ranking,
  };
}
