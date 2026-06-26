/**
 * Tests for the 2026 Bank Policy enhancements:
 *   A. Word-style summaries (generated from configs)
 *   B. Broker-facing explanations
 *   D. Experimental scenario matching (pattern + semantic → deterministic engine)
 */

import {
  BANK_POLICIES_2026, BankPolicy, ScenarioInput,
  rankBanksForScenario,
  // A
  buildBankSummary, buildAllSummaries, renderMarkdown, renderWordHtml,
  bankTags,
  // B
  explainRecommendations,
  // D
  matchBanksForScenario, classifyScenario, buildIndex, search,
} from '../services/bankPolicy';

const cba = BANK_POLICIES_2026.find((p) => p.brandCode === 'CBA') as BankPolicy;
const ing = BANK_POLICIES_2026.find((p) => p.brandCode === 'ING') as BankPolicy;
const mqg = BANK_POLICIES_2026.find((p) => p.brandCode === 'MQG') as BankPolicy;

/** A solid PAYG couple buying a $1.0M owner-occupied home with a $700k loan. */
function paygScenario(): ScenarioInput {
  return {
    client: { numberOfAdults: 2, numberOfChildren: 1 },
    incomeSources: [
      { type: 'SALARY_PRIMARY', amount: 140_000, frequency: 'ANNUAL' },
      { type: 'SALARY_PRIMARY', amount: 95_000, frequency: 'ANNUAL' },
    ],
    expenses: { declaredMonthlyLiving: 4_000 },
    properties: [],
    debts: [{ id: 'cc1', type: 'CREDIT_CARD', source: 'STANDALONE', creditLimit: 15_000 }],
    scenario: {
      purpose: 'OWNER_OCC', targetLoanAmount: 700_000, targetPropertyValue: 1_000_000,
      termYears: 30, interestRate: 0.062, repaymentType: 'PI',
    },
  };
}

/** A self-employed portfolio investor with several rental properties. */
function investorScenario(): ScenarioInput {
  return {
    client: { numberOfAdults: 2, numberOfChildren: 0, isSelfEmployed: true },
    incomeSources: [
      { type: 'BUSINESS', amount: 220_000, frequency: 'ANNUAL', yearsFinancials: 3 },
    ],
    expenses: { declaredMonthlyLiving: 5_000 },
    properties: [
      { id: 'p1', type: 'INVESTMENT', estimatedValue: 800_000, currentLoanBalance: 400_000, currentRepaymentAmount: 2200, grossRentalIncomeMonthly: 2600, isIncludedInCalc: true },
      { id: 'p2', type: 'INVESTMENT', estimatedValue: 700_000, currentLoanBalance: 350_000, currentRepaymentAmount: 1900, grossRentalIncomeMonthly: 2300, isIncludedInCalc: true },
      { id: 'p3', type: 'INVESTMENT', estimatedValue: 600_000, currentLoanBalance: 300_000, currentRepaymentAmount: 1600, grossRentalIncomeMonthly: 2000, isIncludedInCalc: true },
    ],
    debts: [],
    scenario: {
      purpose: 'INVESTMENT', targetLoanAmount: 800_000, targetPropertyValue: 1_000_000,
      termYears: 30, interestRate: 0.062, repaymentType: 'IO',
    },
  };
}

describe('Feature A — Word-style summaries', () => {
  it('builds a structured doc for every bank with all five sections', () => {
    const { docs, comparison } = buildAllSummaries(BANK_POLICIES_2026);
    expect(docs.length).toBe(BANK_POLICIES_2026.length);
    const doc = docs[0];
    expect(doc.sections.length).toBe(5);
    expect(doc.sections.map((s) => s.heading)[0]).toMatch(/Core Lending Policy/);
    expect(comparison.table?.rows.length).toBe(BANK_POLICIES_2026.length);
  });

  it('derives prose from the actual config values (no drift)', () => {
    const md = renderMarkdown(buildBankSummary(cba));
    // CBA owner-occ max LVR is 95% and investment DTI cap 6.5x.
    expect(md).toMatch(/95%/);
    expect(md).toMatch(/6\.5x/);
    expect(md).toMatch(/not official lender policy/i);
  });

  it('reflects ING as tighter DTI and Macquarie as higher DTI', () => {
    expect(renderMarkdown(buildBankSummary(ing))).toMatch(/tighter than peers/i);
    expect(renderMarkdown(buildBankSummary(mqg))).toMatch(/flexible/i);
  });

  it('renders a Word-openable HTML document', () => {
    const html = renderWordHtml(BANK_POLICIES_2026);
    expect(html).toMatch(/schemas-microsoft-com:office:word/);
    expect(html).toMatch(/Cross-Bank Comparison/);
  });

  it('tags Macquarie as portfolio-investor friendly and ING as low DTI tolerance', () => {
    expect(bankTags(mqg)).toContain('PORTFOLIO_INVESTOR_FRIENDLY');
    expect(bankTags(ing)).toContain('LOW_DTI_TOLERANCE');
  });
});

describe('Feature B — explanations', () => {
  it('produces one explanation per recommendation, with binding constraint + next steps', () => {
    const input = paygScenario();
    const recs = rankBanksForScenario(input, BANK_POLICIES_2026);
    const explanations = explainRecommendations(recs, input.scenario, BANK_POLICIES_2026);
    expect(explanations.length).toBe(recs.length);
    const top = explanations[0];
    expect(top.narrative).toMatch(/\$/);
    expect(top.bindingConstraint.length).toBeGreaterThan(0);
    expect(top.nextSteps.length).toBeGreaterThan(0);
    expect(['PRIMARY', 'SECONDARY', 'LONG_SHOT']).toContain(top.category);
  });

  it('flags conservative rental acceptance as a watch-out for an investor at a conservative lender', () => {
    const input = investorScenario();
    const recs = rankBanksForScenario(input, BANK_POLICIES_2026);
    const explanations = explainRecommendations(recs, input.scenario, BANK_POLICIES_2026);
    const wbc = explanations.find((e) => e.brandCode === 'WBC')!;
    expect(wbc.watchOuts.join(' ')).toMatch(/rental/i);
  });
});

describe('Feature D — semantic index', () => {
  it('ranks the most lexically similar document highest', () => {
    const index = buildIndex([
      { id: 'investor', text: 'portfolio investor rental income many properties high dti tolerance' },
      { id: 'fhb', text: 'first home buyer payg high lvr deposit owner occupied' },
    ]);
    const hits = search('portfolio investor with rental income and multiple properties', index);
    expect(hits[0].id).toBe('investor');
    expect(hits[0].similarity).toBeGreaterThan(hits[1].similarity);
  });
});

describe('Feature D — scenario matching (Algorithm B → A)', () => {
  it('classifies a self-employed investor into portfolio + self-employed patterns', () => {
    const patterns = classifyScenario(investorScenario());
    const ids = patterns.map((p) => p.pattern.id);
    expect(ids).toContain('PORTFOLIO_INVESTOR');
    expect(ids).toContain('SELF_EMPLOYED_PRO');
  });

  it('shortlists a cluster and defers final order to the deterministic engine', () => {
    const input = investorScenario();
    const result = matchBanksForScenario(input, BANK_POLICIES_2026);
    expect(result.experimental).toBe(true);
    expect(result.cluster.length).toBe(BANK_POLICIES_2026.length);
    expect(result.top3.length).toBeGreaterThan(0);
    expect(result.top3.length).toBeLessThanOrEqual(3);

    // The match top3 must equal the deterministic ranking restricted to the cluster
    // (i.e. the engine is authoritative — Algorithm B only shortlists).
    const clusterBrands = new Set(result.cluster.filter((c) => c.matchScore > 0).slice(0, 6).map((c) => c.brandCode));
    const expectedTop = result.ranking.filter((r) => clusterBrands.has(r.brandCode)).slice(0, 3).map((r) => r.brandCode);
    expect(result.top3.map((r) => r.brandCode)).toEqual(expectedTop);
  });

  it('ranks investor-friendly lenders into the cluster for a portfolio investor', () => {
    const result = matchBanksForScenario(investorScenario(), BANK_POLICIES_2026);
    const topMatch = result.cluster[0];
    // Macquarie / NAB / HSBC are the portfolio-friendly cluster.
    expect(['MQG', 'NAB', 'HSBC', 'BEN']).toContain(topMatch.brandCode);
    expect(topMatch.matchedTags.length).toBeGreaterThan(0);
  });

  it('is deterministic — same input gives identical match scores', () => {
    const a = matchBanksForScenario(investorScenario(), BANK_POLICIES_2026);
    const b = matchBanksForScenario(investorScenario(), BANK_POLICIES_2026);
    expect(a.cluster.map((c) => c.matchScore)).toEqual(b.cluster.map((c) => c.matchScore));
  });
});
