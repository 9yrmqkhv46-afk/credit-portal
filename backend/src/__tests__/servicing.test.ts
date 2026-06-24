import {
  computePropertyGrowth,
  applyBankPolicyPreset,
  normaliseIncome,
  aggregateLivingExpenses,
  existingLoanCommitments,
  personalLiabilityCommitments,
  computeServicing,
  calculateServicing,
  CalculateServicingInput,
} from '../services/servicing';

describe('Property growth / ROI', () => {
  test('computes capital growth $ and % from purchase price', () => {
    const g = computePropertyGrowth({ estimatedValue: 850000, purchasePrice: 600000, purchaseDate: null });
    expect(g.capitalGrowthDollars).toBe(250000);
    expect(g.capitalGrowthPercent).toBeCloseTo((250000 / 600000) * 100, 4);
  });

  test('computes years held and CAGR from purchase date', () => {
    const fiveYearsAgo = new Date(Date.now() - 5 * 365.25 * 24 * 60 * 60 * 1000);
    const g = computePropertyGrowth({ estimatedValue: 800000, purchasePrice: 500000, purchaseDate: fiveYearsAgo });
    expect(g.yearsHeld).toBeCloseTo(5, 1);
    // CAGR = (800000/500000)^(1/5) - 1
    const expected = (Math.pow(800000 / 500000, 1 / 5) - 1) * 100;
    expect(g.cagrPercent).toBeCloseTo(expected, 2);
  });

  test('computes gross rent and gross yield (weekly rent)', () => {
    const oneYearAgo = new Date(Date.now() - 1 * 365.25 * 24 * 60 * 60 * 1000);
    const g = computePropertyGrowth({
      estimatedValue: 600000,
      purchasePrice: 600000,
      purchaseDate: oneYearAgo,
      rentalIncomeAmount: 600,
      rentalIncomeFrequency: 'WEEKLY',
    });
    expect(g.weeklyRent).toBeCloseTo(600, 4);
    // grossYield = (600*52/600000)*100
    expect(g.grossYieldPercent).toBeCloseTo((600 * 52 / 600000) * 100, 4);
    expect(g.totalGrossRent).toBeCloseTo(600 * 52 * (g.yearsHeld as number), 0);
  });

  test('guards divide-by-zero: missing purchase price and date', () => {
    const g = computePropertyGrowth({ estimatedValue: 500000, purchasePrice: null, purchaseDate: null });
    expect(g.capitalGrowthDollars).toBeNull();
    expect(g.capitalGrowthPercent).toBeNull();
    expect(g.cagrPercent).toBeNull();
    expect(g.yearsHeld).toBeNull();
  });

  test('guards zero purchase price (no NaN/Infinity)', () => {
    const g = computePropertyGrowth({ estimatedValue: 500000, purchasePrice: 0, purchaseDate: new Date() });
    expect(g.capitalGrowthPercent).toBeNull();
    expect(g.cagrPercent).toBeNull();
  });
});

describe('Bank-policy presets', () => {
  const props = [
    { id: 'a', estimatedValue: 300000 },
    { id: 'b', estimatedValue: 900000 },
    { id: 'c', estimatedValue: 600000 },
    { id: 'd', estimatedValue: 150000 },
    { id: 'e', estimatedValue: 750000 },
  ];

  test('ALL includes everything', () => {
    const set = applyBankPolicyPreset(props, 'ALL');
    expect(set.size).toBe(5);
  });

  test('TOP_3 selects the 3 highest-value properties', () => {
    const set = applyBankPolicyPreset(props, 'TOP_3', 'value');
    expect([...set].sort()).toEqual(['b', 'c', 'e']);
  });

  test('TOP_4 selects the 4 highest-value properties', () => {
    const set = applyBankPolicyPreset(props, 'TOP_4', 'value');
    expect(set.size).toBe(4);
    expect(set.has('d')).toBe(false);
  });
});

describe('Income normalisation with shading', () => {
  test('applies per-category shading', () => {
    const r = normaliseIncome([
      { category: 'BASE_SALARY_PAYG', amount: 120000, frequency: 'ANNUAL' }, // 100%
      { category: 'OVERTIME', amount: 12000, frequency: 'ANNUAL' }, // 80%
    ]);
    // monthly: 10000 + (1000 * 0.8) = 10800
    expect(r.totalMonthlyIncome).toBeCloseTo(10000 + 1000 * 0.8, 4);
    expect(r.grossMonthlyIncome).toBeCloseTo(11000, 4);
  });

  test('shadingOverride takes precedence', () => {
    const r = normaliseIncome([
      { category: 'OVERTIME', amount: 12000, frequency: 'ANNUAL', shadingOverride: 1.0 },
    ]);
    expect(r.totalMonthlyIncome).toBeCloseTo(1000, 4);
  });

  test('HECS flagged amount surfaces as a monthly commitment', () => {
    const r = normaliseIncome([
      { category: 'BASE_SALARY_PAYG', amount: 120000, frequency: 'ANNUAL', hecsFlag: true, hecsAmount: 500 },
    ]);
    expect(r.hecsMonthlyCommitment).toBe(500);
  });

  test('pre/post-tax deductions reduce net income (un-shaded)', () => {
    const r = normaliseIncome([
      { category: 'BASE_SALARY_PAYG', amount: 120000, frequency: 'ANNUAL' }, // +10000/mo
      { category: 'PRETAX_DEDUCTION', amount: 12000, frequency: 'ANNUAL' }, // -1000/mo
    ]);
    expect(r.totalMonthlyIncome).toBeCloseTo(9000, 4);
    expect(r.grossMonthlyIncome).toBeCloseTo(9000, 4);
  });
});

describe('Living expenses floor', () => {
  test('uses max(declared, HEM floor)', () => {
    // declared 500 < floor for 2 adults + 1 child = 2*1200 + 600 = 3000
    const total = aggregateLivingExpenses({ basicExpenseAmount: 500, basicExpenseFrequency: 'MONTHLY' }, 2, 1);
    expect(total).toBe(3000);
  });

  test('adds notional rent on top', () => {
    const total = aggregateLivingExpenses(
      { basicExpenseAmount: 5000, basicExpenseFrequency: 'MONTHLY', useNotionalRent: true, rentBoardAmount: 800 },
      1,
      0
    );
    expect(total).toBe(5800);
  });
});

describe('Servicing filtering by includeInServicing', () => {
  test('excluded existing loans are not counted', () => {
    const loans = [
      { loanAmount: 300000, interestRate: 0.06, termYears: 30, monthlyRepayment: 1800, includeInServicing: true },
      { loanAmount: 200000, interestRate: 0.06, termYears: 30, monthlyRepayment: 1200, includeInServicing: false },
    ];
    expect(existingLoanCommitments(loans)).toBe(1800);
  });

  test('excluded personal liabilities are not counted; credit card uses limit %', () => {
    const liabilities = [
      { type: 'CREDIT_CARD', limit: 20000, includeInServicing: true }, // 20000 * 0.03 = 600
      { type: 'CAR_LOAN', repaymentAmount: 500, includeInServicing: false }, // excluded
    ];
    expect(personalLiabilityCommitments(liabilities)).toBeCloseTo(600, 4);
  });

  test('computeServicing produces a numeric max borrowing capacity', () => {
    const result = computeServicing({
      incomeEntries: [{ category: 'BASE_SALARY_PAYG', amount: 150000, frequency: 'ANNUAL' }],
      livingExpenses: { basicExpenseAmount: 2500, basicExpenseFrequency: 'MONTHLY' },
      existingLoans: [],
      personalLiabilities: [],
      adults: 1,
      children: 0,
      proposedLoanAmount: 0,
      proposedInterestRate: 0.06,
      proposedTermYears: 30,
      repaymentType: 'PI',
    });
    expect(typeof result.maxBorrowingCapacity).toBe('number');
    expect(result.maxBorrowingCapacity).toBeGreaterThan(0);
    expect(result.messages).toContain('Indicative estimate only - not a credit decision.');
  });
});


describe('calculateServicing entry point', () => {
  // A reusable baseline input. Strong salary so there is always capacity.
  function baseInput(overrides: Partial<CalculateServicingInput> = {}): CalculateServicingInput {
    return {
      clientProfile: { numberOfAdultDependants: 0, numberOfChildDependants: 0 },
      incomes: [{ category: 'BASE_SALARY_PAYG', amount: 180000, frequency: 'ANNUAL' }],
      properties: [],
      liabilities: [],
      existingLoans: [],
      proposedLoans: [],
      livingExpenses: { basicExpenseAmount: 8000, basicExpenseFrequency: 'MONTHLY' },
      loanScenario: { interestRate: 0.06, loanTermYears: 30, repaymentType: 'PI' },
      ...overrides,
    };
  }

  test('produces a numeric max borrowing capacity + disclaimer', () => {
    const r = calculateServicing(baseInput());
    expect(typeof r.maxBorrowingCapacity).toBe('number');
    expect(r.maxBorrowingCapacity).toBeGreaterThan(0);
    expect(r.messages).toContain('Indicative estimate only - not a credit decision.');
  });

  test('excluding an existing loan changes (increases) the result', () => {
    const withLoan = calculateServicing(
      baseInput({
        existingLoans: [
          { loanAmount: 400000, interestRate: 0.06, termYears: 30, monthlyRepayment: 2500, includeInServicing: true },
        ],
      })
    );
    const excluded = calculateServicing(
      baseInput({
        existingLoans: [
          { loanAmount: 400000, interestRate: 0.06, termYears: 30, monthlyRepayment: 2500, includeInServicing: false },
        ],
      })
    );
    // Excluding the loan removes a commitment -> higher surplus -> bigger capacity.
    expect(excluded.maxBorrowingCapacity).toBeGreaterThan(withLoan.maxBorrowingCapacity);
    expect(excluded.monthlyCommitments).toBeLessThan(withLoan.monthlyCommitments);
  });

  test('excluding an investment property removes its rental income', () => {
    const prop = {
      type: 'INVESTMENT' as const,
      estimatedValue: 700000,
      rentalIncomeAmount: 700,
      rentalIncomeFrequency: 'WEEKLY',
    };
    const included = calculateServicing(baseInput({ properties: [{ ...prop, includeInServicing: true }] }));
    const excluded = calculateServicing(baseInput({ properties: [{ ...prop, includeInServicing: false }] }));
    expect(included.totalMonthlyIncome).toBeGreaterThan(excluded.totalMonthlyIncome);
    expect(included.maxBorrowingCapacity).toBeGreaterThan(excluded.maxBorrowingCapacity);
  });

  test('legacy property missing includeInServicing defaults to INCLUDED', () => {
    const prop = { type: 'INVESTMENT' as const, estimatedValue: 700000, rentalIncomeAmount: 700, rentalIncomeFrequency: 'WEEKLY' };
    const legacy = calculateServicing(baseInput({ properties: [{ ...prop }] })); // no flag
    const noProp = calculateServicing(baseInput({ properties: [] }));
    expect(legacy.totalMonthlyIncome).toBeGreaterThan(noProp.totalMonthlyIncome);
  });

  test('HECS/HELP flag adds a monthly commitment', () => {
    const noHecs = calculateServicing(baseInput());
    const withHecs = calculateServicing(
      baseInput({
        incomes: [
          { category: 'BASE_SALARY_PAYG', amount: 180000, frequency: 'ANNUAL', hecsFlag: true, hecsAmount: 700 },
        ],
      })
    );
    expect(withHecs.hecsMonthlyCommitment).toBe(700);
    expect(withHecs.monthlyCommitments - noHecs.monthlyCommitments).toBeCloseTo(700, 4);
    expect(withHecs.maxBorrowingCapacity).toBeLessThan(noHecs.maxBorrowingCapacity);
  });

  test('income shading is applied (variable income counted < gross)', () => {
    // Same gross via salary (100%) vs investment (80% shaded) -> different income.
    const salary = calculateServicing(
      baseInput({ incomes: [{ category: 'BASE_SALARY_PAYG', amount: 120000, frequency: 'ANNUAL' }] })
    );
    const investment = calculateServicing(
      baseInput({ incomes: [{ category: 'INVESTMENT', amount: 120000, frequency: 'ANNUAL' }] })
    );
    expect(investment.totalMonthlyIncome).toBeLessThan(salary.totalMonthlyIncome);
    // 80% of 10000/month = 8000
    expect(investment.totalMonthlyIncome).toBeCloseTo(8000, 4);
  });

  test('excluding a personal liability increases capacity; credit card uses limit %', () => {
    const withCc = calculateServicing(
      baseInput({ liabilities: [{ type: 'CREDIT_CARD', limit: 30000, includeInServicing: true }] })
    );
    const excluded = calculateServicing(
      baseInput({ liabilities: [{ type: 'CREDIT_CARD', limit: 30000, includeInServicing: false }] })
    );
    // 30000 * 0.03 = 900 assumed monthly repayment when included.
    expect(withCc.monthlyCommitments - excluded.monthlyCommitments).toBeCloseTo(900, 4);
    expect(excluded.maxBorrowingCapacity).toBeGreaterThan(withCc.maxBorrowingCapacity);
  });

  test('an included proposed loan with an override rate drives the stress rate', () => {
    const fromScenario = calculateServicing(baseInput());
    const fromProposed = calculateServicing(
      baseInput({
        proposedLoans: [
          { loanAmount: 500000, termYears: 30, ioTermYears: 0, interestRate: 0.09, includeInServicing: true },
        ],
      })
    );
    // Higher proposed rate => higher stress rate => lower serviceability max.
    expect(fromProposed.serviceabilityMax).toBeLessThan(fromScenario.serviceabilityMax);
  });
});
