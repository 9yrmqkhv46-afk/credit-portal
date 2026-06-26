import {
  runBankCalc, rankBanksForScenario, detectDuplicateLoans, BANK_POLICIES_2026,
  ScenarioInput, BankPolicy,
} from '../services/bankPolicy';

const cba = BANK_POLICIES_2026.find((p) => p.brandCode === 'CBA') as BankPolicy;

/** A solid PAYG couple buying a $1.0M owner-occupied home with a $700k loan. */
function baseScenario(): ScenarioInput {
  return {
    client: { numberOfAdults: 2, numberOfChildren: 1 },
    incomeSources: [
      { type: 'SALARY_PRIMARY', amount: 140_000, frequency: 'ANNUAL' },
      { type: 'SALARY_PRIMARY', amount: 95_000, frequency: 'ANNUAL' },
    ],
    expenses: { declaredMonthlyLiving: 4_000 },
    properties: [],
    debts: [
      { id: 'cc1', type: 'CREDIT_CARD', source: 'STANDALONE', creditLimit: 15_000 },
    ],
    scenario: {
      purpose: 'OWNER_OCC',
      targetLoanAmount: 700_000,
      targetPropertyValue: 1_000_000,
      termYears: 30,
      interestRate: 0.062,
      repaymentType: 'PI',
    },
  };
}

describe('BankPolicyEngine — single bank (CBA-like)', () => {
  const result = runBankCalc(baseScenario(), cba);

  it('uses an APRA-style stress rate (base + buffer)', () => {
    expect(result.stressRateUsed).toBeCloseTo(0.062 + 0.03, 4);
  });

  it('computes a positive monthly surplus and serviceability max', () => {
    expect(result.netMonthlySurplus).toBeGreaterThan(0);
    expect(result.maxBorrowServiceability).toBeGreaterThan(0);
  });

  it('respects the LVR cap (final borrow <= maxLvr * value)', () => {
    expect(result.finalMaxBorrow).toBeLessThanOrEqual(cba.residentialOwnerOcc.maxLvr * 1_000_000 + 1);
  });

  it('returns a defensible pass/fail with reasons', () => {
    expect(['PASS', 'MARGINAL', 'FAIL']).toContain(result.passFail);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it('finalMaxBorrow is the min of the three caps', () => {
    const expected = Math.min(result.maxBorrowServiceability, result.maxBorrowDti, result.maxBorrowLvr);
    expect(result.finalMaxBorrow).toBeLessThanOrEqual(Math.round(expected / 1000) * 1000 + 1);
  });
});

describe('BankPolicyEngine — DTI cap binds for high leverage', () => {
  it('flags a DTI breach when the requested loan is very large vs income', () => {
    const s = baseScenario();
    s.scenario.targetLoanAmount = 2_500_000;
    s.scenario.targetPropertyValue = 3_000_000;
    const r = runBankCalc(s, cba);
    // Gross income ~235k; 2.5M + existing well above 6x.
    expect(r.dtiRatio).toBeGreaterThan(cba.residentialOwnerOcc.maxDti);
    expect(r.passFail).toBe('FAIL');
    expect(r.reasons.join(' ')).toMatch(/DTI/i);
  });
});

describe('Multi-bank ranking', () => {
  const recs = rankBanksForScenario(baseScenario(), BANK_POLICIES_2026);

  it('returns one recommendation per active policy', () => {
    expect(recs.length).toBe(BANK_POLICIES_2026.filter((p) => p.isActive).length);
  });

  it('is sorted with PASS lenders ahead of FAIL lenders', () => {
    const rank = { PASS: 0, MARGINAL: 1, FAIL: 2 } as const;
    for (let i = 1; i < recs.length; i++) {
      expect(rank[recs[i].calcResult.passFail]).toBeGreaterThanOrEqual(rank[recs[i - 1].calcResult.passFail]);
    }
  });

  it('higher-DTI lenders (NAB/ANZ) score at least as well as a tighter one (Bendigo) for a stretched loan', () => {
    const s = baseScenario();
    s.scenario.targetLoanAmount = 1_300_000;
    s.scenario.targetPropertyValue = 1_600_000;
    const r = rankBanksForScenario(s, BANK_POLICIES_2026);
    const nab = r.find((x) => x.brandCode === 'NAB')!;
    const ben = r.find((x) => x.brandCode === 'BEN')!;
    expect(nab.score).toBeGreaterThanOrEqual(ben.score);
  });

  it('categorises into PRIMARY / SECONDARY / LONG_SHOT', () => {
    recs.forEach((r) => expect(['PRIMARY', 'SECONDARY', 'LONG_SHOT']).toContain(r.category));
  });

  it('HSBC considers the full portfolio (selectionStrategy: all)', () => {
    const s = baseScenario();
    s.properties = [
      { id: 'p1', type: 'INVESTMENT', estimatedValue: 800_000, currentLoanBalance: 400_000, currentRepaymentAmount: 2200, grossRentalIncomeMonthly: 2600, isIncludedInCalc: true },
      { id: 'p2', type: 'INVESTMENT', estimatedValue: 700_000, currentLoanBalance: 350_000, currentRepaymentAmount: 1900, grossRentalIncomeMonthly: 2300, isIncludedInCalc: true },
      { id: 'p3', type: 'INVESTMENT', estimatedValue: 600_000, currentLoanBalance: 300_000, currentRepaymentAmount: 1600, grossRentalIncomeMonthly: 2000, isIncludedInCalc: true },
      { id: 'p4', type: 'INVESTMENT', estimatedValue: 500_000, currentLoanBalance: 250_000, currentRepaymentAmount: 1400, grossRentalIncomeMonthly: 1800, isIncludedInCalc: true },
      { id: 'p5', type: 'INVESTMENT', estimatedValue: 450_000, currentLoanBalance: 200_000, currentRepaymentAmount: 1200, grossRentalIncomeMonthly: 1600, isIncludedInCalc: true },
    ];
    const r = rankBanksForScenario(s, BANK_POLICIES_2026);
    const hsbc = r.find((x) => x.brandCode === 'HSBC')!;
    expect(hsbc.calcResult.propertiesConsidered.length).toBe(5);
    const cbaRec = r.find((x) => x.brandCode === 'CBA')!;
    expect(cbaRec.calcResult.propertiesConsidered.length).toBeLessThanOrEqual(4);
  });
});

describe('Duplicate loan detection (property vs standalone)', () => {
  it('flags a standalone debt that duplicates a property loan and excludes it', () => {
    const s = baseScenario();
    s.properties = [
      { id: 'home', type: 'OWNER_OCC', estimatedValue: 900_000, currentLoanBalance: 500_000, currentRepaymentAmount: 3000, grossRentalIncomeMonthly: 0, lender: 'CBA', isIncludedInCalc: true },
    ];
    s.debts = [
      { id: 'dupe', type: 'OTHER', source: 'STANDALONE', lender: 'CBA', currentBalance: 500_000, monthlyRepayment: 3000 },
    ];
    const warnings = detectDuplicateLoans(s.properties, s.debts);
    expect(warnings.length).toBe(1);
    expect(warnings[0].debtId).toBe('dupe');

    const r = runBankCalc(s, cba);
    expect(r.reasons.join(' ')).toMatch(/duplicate/i);
  });

  it('does not flag genuinely separate debts', () => {
    const s = baseScenario();
    s.properties = [
      { id: 'home', type: 'OWNER_OCC', estimatedValue: 900_000, currentLoanBalance: 500_000, currentRepaymentAmount: 3000, grossRentalIncomeMonthly: 0, lender: 'CBA', isIncludedInCalc: true },
    ];
    s.debts = [
      { id: 'car', type: 'CAR_LOAN', source: 'STANDALONE', lender: 'Toyota Finance', currentBalance: 25_000, monthlyRepayment: 600 },
    ];
    expect(detectDuplicateLoans(s.properties, s.debts).length).toBe(0);
  });
});
