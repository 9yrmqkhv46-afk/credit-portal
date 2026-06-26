/**
 * Tests for the buyer-side calculators, analytics, and the backtest harness:
 * affordability (stamp duty / LMI / max price), loan maths (amortization /
 * comparison rate / rate-shock / confidence band), advisory (optimizer /
 * comparison report), and the backtest invariants.
 */

import {
  BANK_POLICIES_2026, BankPolicy, ScenarioInput,
  estimateStampDuty, estimateLmi, estimateUpfrontCosts, maxPurchasePrice,
  buildAmortizationSchedule, comparisonRate, rateShockStress, borrowingConfidenceBand,
  suggestPathToApproval, buildComparisonReport,
  runBacktest, diffBacktest,
} from '../services/bankPolicy';

const cba = BANK_POLICIES_2026.find((p) => p.brandCode === 'CBA') as BankPolicy;

function strongScenario(): ScenarioInput {
  return {
    client: { numberOfAdults: 2, numberOfChildren: 0 },
    incomeSources: [
      { type: 'SALARY_PRIMARY', amount: 150_000, frequency: 'ANNUAL' },
      { type: 'SALARY_PRIMARY', amount: 110_000, frequency: 'ANNUAL' },
    ],
    expenses: { declaredMonthlyLiving: 3_500 },
    properties: [],
    debts: [{ id: 'cc', type: 'CREDIT_CARD', source: 'STANDALONE', creditLimit: 10_000 }],
    scenario: { purpose: 'OWNER_OCC', targetLoanAmount: 700_000, targetPropertyValue: 900_000, termYears: 30, interestRate: 0.062, repaymentType: 'PI' },
  };
}

function stretchedScenario(): ScenarioInput {
  const s = strongScenario();
  s.incomeSources = [{ type: 'SALARY_PRIMARY', amount: 95_000, frequency: 'ANNUAL' }];
  s.debts = [{ id: 'cc', type: 'CREDIT_CARD', source: 'STANDALONE', creditLimit: 40_000 }, { id: 'car', type: 'CAR_LOAN', source: 'STANDALONE', monthlyRepayment: 900 }];
  s.scenario.targetLoanAmount = 900_000;
  return s;
}

describe('affordability — stamp duty & LMI', () => {
  it('computes progressive stamp duty that rises with price', () => {
    const a = estimateStampDuty('NSW', 600_000);
    const b = estimateStampDuty('NSW', 1_200_000);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
  });

  it('charges no LMI at/under 80% LVR and a premium above it', () => {
    expect(estimateLmi(800_000, 1_000_000)).toBe(0);     // 80%
    expect(estimateLmi(900_000, 1_000_000)).toBeGreaterThan(0); // 90%
  });

  it('rolls duty + fees into total upfront costs', () => {
    const c = estimateUpfrontCosts('VIC', 800_000);
    expect(c.total).toBe(c.stampDuty + c.governmentFees + c.conveyancing);
  });
});

describe('affordability — max purchase price', () => {
  it('returns a coherent, bank-supported price within the LVR cap', () => {
    const r = maxPurchasePrice(strongScenario(), cba, { savings: 200_000, state: 'NSW' });
    expect(r.maxPropertyPrice).toBeGreaterThan(0);
    expect(r.lvr).toBeLessThanOrEqual(cba.residentialOwnerOcc.maxLvr + 1e-6);
    expect(r.loanRequired).toBeLessThanOrEqual(r.bankMaxBorrow + 1000);
    expect(['serviceability', 'lvr', 'deposit']).toContain(r.limitedBy);
  });

  it('allows a larger purchase with more savings', () => {
    const low = maxPurchasePrice(strongScenario(), cba, { savings: 100_000, state: 'NSW' });
    const high = maxPurchasePrice(strongScenario(), cba, { savings: 400_000, state: 'NSW' });
    expect(high.maxPropertyPrice).toBeGreaterThanOrEqual(low.maxPropertyPrice);
  });
});

describe('loanMath — amortization & comparison rate', () => {
  it('fully amortises a P&I loan to ~zero with positive total interest', () => {
    const r = buildAmortizationSchedule(500_000, 0.06, 30);
    expect(r.totalInterest).toBeGreaterThan(0);
    expect(r.schedule[r.schedule.length - 1].closingBalance).toBeLessThan(2);
  });

  it('charges only interest during an IO period', () => {
    const r = buildAmortizationSchedule(500_000, 0.06, 30, { ioYears: 5, sampleEvery: 1 });
    expect(r.schedule[0].phase).toBe('IO');
    expect(r.schedule[0].principal).toBe(0);
    expect(r.monthlyRepaymentIO).toBeLessThan(r.monthlyRepaymentPI);
  });

  it('comparison rate is >= the nominal rate when fees apply', () => {
    expect(comparisonRate(500_000, 0.06, 30, { upfront: 600, ongoingMonthly: 10 })).toBeGreaterThan(0.06);
  });
});

describe('loanMath — stress & confidence', () => {
  it('rate shock reduces serviceability surplus', () => {
    const r = rateShockStress(strongScenario(), cba, 300);
    expect(r.shockedSurplus).toBeLessThanOrEqual(r.baseSurplus);
    expect(r.shockedRepayment).toBeGreaterThan(0);
    expect(typeof r.survives).toBe('boolean');
  });

  it('confidence band brackets the expected figure', () => {
    const b = borrowingConfidenceBand(strongScenario(), cba, 0.1);
    expect(b.low).toBeLessThanOrEqual(b.expected);
    expect(b.high).toBeGreaterThanOrEqual(b.expected);
    expect(b.spreadPct).toBeGreaterThanOrEqual(0);
  });
});

describe('advisory — optimizer & comparison', () => {
  it('returns actionable suggestions for a shortfall scenario', () => {
    const r = suggestPathToApproval(stretchedScenario(), cba);
    if (!r.alreadyApproved) {
      expect(r.gap).toBeGreaterThan(0);
      expect(r.suggestions.length).toBeGreaterThan(0);
      expect(r.suggestions.some((s) => s.lever === 'reduce_loan')).toBe(true);
    }
  });

  it('builds a ranked multi-bank comparison with a best pick', () => {
    const report = buildComparisonReport(strongScenario(), BANK_POLICIES_2026);
    expect(report.rows.length).toBe(BANK_POLICIES_2026.length);
    // Sorted by capacity descending.
    for (let i = 1; i < report.rows.length; i++) {
      expect(report.rows[i - 1].finalMaxBorrow).toBeGreaterThanOrEqual(report.rows[i].finalMaxBorrow);
    }
    expect(report.bestPick).toBeTruthy();
  });
});

describe('backtest harness', () => {
  it('runs the full matrix with all invariants holding', () => {
    const report = runBacktest(BANK_POLICIES_2026);
    expect(report.cells.length).toBe(report.scenarioCount * report.bankCount);
    expect(report.summary.invariantsOk).toBe(true);
    expect(report.invariantViolations).toEqual([]);
    expect(Object.keys(report.topPickByScenario).length).toBe(report.scenarioCount);
  });

  it('detects regressions against a baseline', () => {
    const report = runBacktest(BANK_POLICIES_2026);
    const tampered = report.cells.map((c, i) => (i === 0 ? { ...c, finalMaxBorrow: c.finalMaxBorrow + 12345 } : c));
    const diff = diffBacktest(report.cells, tampered);
    expect(diff.length).toBe(1);
    expect(diff[0].field).toBe('finalMaxBorrow');
  });
});
