import {
  calculateBorrowingCapacity,
  calculateMonthlyRepayment,
  calculateMaxLoanFromPayment,
  CalculatorInput,
} from '../services/calculator';
import { toMonthly, toAnnual, convertFrequency } from '../utils/frequency';

describe('Frequency Utility', () => {
  test('converts weekly to monthly correctly (52/12)', () => {
    const result = toMonthly(1000, 'WEEKLY');
    expect(result).toBeCloseTo(1000 * 52 / 12, 2);
  });

  test('converts fortnightly to monthly correctly (26/12)', () => {
    const result = toMonthly(2000, 'FORTNIGHTLY');
    expect(result).toBeCloseTo(2000 * 26 / 12, 2);
  });

  test('monthly stays the same', () => {
    expect(toMonthly(5000, 'MONTHLY')).toBe(5000);
  });

  test('converts annual to monthly correctly', () => {
    const result = toMonthly(120000, 'ANNUAL');
    expect(result).toBe(10000);
  });

  test('converts monthly to annual', () => {
    expect(toAnnual(5000, 'MONTHLY')).toBe(60000);
  });

  test('converts between frequencies', () => {
    const result = convertFrequency(1000, 'WEEKLY', 'ANNUAL');
    expect(result).toBe(52000);
  });

  test('same frequency returns same amount', () => {
    expect(convertFrequency(5000, 'MONTHLY', 'MONTHLY')).toBe(5000);
  });
});

describe('Calculator - Monthly Repayment', () => {
  test('calculates P&I repayment correctly', () => {
    // $500,000 at 6% over 30 years
    const repayment = calculateMonthlyRepayment(500000, 0.06, 30, 'PI');
    // Expected ~$2997.75
    expect(repayment).toBeCloseTo(2997.75, 0);
  });

  test('calculates IO repayment correctly', () => {
    // $500,000 at 6% IO
    const repayment = calculateMonthlyRepayment(500000, 0.06, 30, 'IO');
    expect(repayment).toBe(2500); // 500000 * 0.06 / 12
  });

  test('returns 0 for zero principal', () => {
    expect(calculateMonthlyRepayment(0, 0.06, 30, 'PI')).toBe(0);
  });

  test('handles zero interest rate for P&I', () => {
    const repayment = calculateMonthlyRepayment(360000, 0, 30, 'PI');
    expect(repayment).toBe(1000); // 360000 / 360 months
  });
});

describe('Calculator - Max Loan from Payment', () => {
  test('inverse of monthly repayment calculation for P&I', () => {
    // If the monthly payment is ~$2997.75 at 6% over 30 years, max loan is ~$500k
    const maxLoan = calculateMaxLoanFromPayment(2997.75, 0.06, 30, 'PI');
    expect(maxLoan).toBeCloseTo(500000, -2); // within ~$100 tolerance
  });

  test('inverse for IO', () => {
    // Monthly payment of $2500 at 6% IO
    const maxLoan = calculateMaxLoanFromPayment(2500, 0.06, 30, 'IO');
    expect(maxLoan).toBe(500000);
  });

  test('returns 0 for zero payment', () => {
    expect(calculateMaxLoanFromPayment(0, 0.06, 30, 'PI')).toBe(0);
  });
});

describe('Calculator - Borrowing Capacity', () => {
  test('basic salary-only scenario', () => {
    const input: CalculatorInput = {
      incomeSources: [
        { type: 'SALARY', amount: 120000, frequency: 'ANNUAL', owner: 'SELF' },
      ],
      existingDebts: [],
      expenses: [
        { amount: 2000, frequency: 'MONTHLY' },
      ],
      numberOfAdultDependants: 0,
      numberOfChildDependants: 0,
      loanTermYears: 30,
      interestRate: 0.06,
      repaymentType: 'PI',
    };

    const result = calculateBorrowingCapacity(input);

    // Monthly income: 10000 (100% salary shading)
    expect(result.totalMonthlyIncome).toBe(10000);
    // Expenses: max(2000, 1200 for 1 adult) = 2000
    expect(result.totalMonthlyExpenses).toBe(2000);
    // Surplus: 8000
    expect(result.netMonthlySurplus).toBe(8000);
    // Should have positive borrowing capacity
    expect(result.maxBorrowingCapacity).toBeGreaterThan(0);
    expect(result.passesServiceability).toBe(true);
    expect(result.passesDti).toBe(true);
  });

  test('scenario with multiple income types and shading', () => {
    const input: CalculatorInput = {
      incomeSources: [
        { type: 'SALARY', amount: 8000, frequency: 'MONTHLY', owner: 'SELF' },
        { type: 'BONUS', amount: 20000, frequency: 'ANNUAL', owner: 'SELF' },
        { type: 'RENTAL', amount: 500, frequency: 'WEEKLY', owner: 'SELF' },
      ],
      existingDebts: [],
      expenses: [
        { amount: 3000, frequency: 'MONTHLY' },
      ],
      numberOfAdultDependants: 0,
      numberOfChildDependants: 0,
      loanTermYears: 30,
      interestRate: 0.06,
      repaymentType: 'PI',
    };

    const result = calculateBorrowingCapacity(input);

    // Salary: 8000 * 1.0 = 8000
    // Bonus: (20000/12) * 0.8 = 1333.33
    // Rental: (500 * 52/12) * 0.8 = 1733.33
    const expectedIncome = 8000 + (20000 / 12) * 0.8 + (500 * 52 / 12) * 0.8;
    expect(result.totalMonthlyIncome).toBeCloseTo(expectedIncome, 2);
    expect(result.maxBorrowingCapacity).toBeGreaterThan(0);
  });

  test('credit card limit conversion', () => {
    const input: CalculatorInput = {
      incomeSources: [
        { type: 'SALARY', amount: 10000, frequency: 'MONTHLY', owner: 'SELF' },
      ],
      existingDebts: [
        {
          type: 'CREDIT_CARD',
          outstandingBalance: 5000,
          creditLimit: 20000,
          monthlyRepayment: null,
          interestRate: null,
        },
      ],
      expenses: [
        { amount: 2000, frequency: 'MONTHLY' },
      ],
      numberOfAdultDependants: 0,
      numberOfChildDependants: 0,
      loanTermYears: 30,
      interestRate: 0.06,
      repaymentType: 'PI',
    };

    const result = calculateBorrowingCapacity(input);

    // Debt repayment: 20000 * 0.03 = 600
    // Total expenses: 2000 + 600 = 2600
    expect(result.totalMonthlyExpenses).toBe(2600);
    expect(result.netMonthlySurplus).toBe(7400);
  });

  test('DTI cap limiting borrow amount', () => {
    const input: CalculatorInput = {
      incomeSources: [
        { type: 'SALARY', amount: 50000, frequency: 'ANNUAL', owner: 'SELF' },
      ],
      existingDebts: [],
      expenses: [
        { amount: 500, frequency: 'MONTHLY' },
      ],
      numberOfAdultDependants: 0,
      numberOfChildDependants: 0,
      loanTermYears: 30,
      interestRate: 0.02, // very low rate = high serviceability
      repaymentType: 'PI',
      params: {
        dtiCap: 6,
      },
    };

    const result = calculateBorrowingCapacity(input);

    // DTI max = 50000 * 6 = 300000
    expect(result.dtiMax).toBe(300000);
    // When serviceability allows more than DTI, max should be capped at DTI
    if (result.serviceabilityMax > result.dtiMax) {
      expect(result.maxBorrowingCapacity).toBe(result.dtiMax);
      expect(result.messages).toContain('Borrowing limited by DTI cap (6x annual income).');
    }
  });

  test('net surplus calculation with dependants', () => {
    const input: CalculatorInput = {
      incomeSources: [
        { type: 'SALARY', amount: 8000, frequency: 'MONTHLY', owner: 'SELF' },
      ],
      existingDebts: [],
      expenses: [
        { amount: 500, frequency: 'MONTHLY' }, // Below minimum floor
      ],
      numberOfAdultDependants: 1,
      numberOfChildDependants: 2,
      loanTermYears: 30,
      interestRate: 0.06,
      repaymentType: 'PI',
    };

    const result = calculateBorrowingCapacity(input);

    // Minimum living expenses: (1 + 1) adults * 1200 + 2 children * 600 = 3600
    // Declared expenses: 500 < 3600, so use floor
    expect(result.totalMonthlyExpenses).toBe(3600);
    expect(result.netMonthlySurplus).toBe(4400);
  });

  test('negative surplus returns zero capacity', () => {
    const input: CalculatorInput = {
      incomeSources: [
        { type: 'SALARY', amount: 2000, frequency: 'MONTHLY', owner: 'SELF' },
      ],
      existingDebts: [
        {
          type: 'HOME_LOAN',
          outstandingBalance: 300000,
          monthlyRepayment: 2500,
          interestRate: null,
          creditLimit: null,
        },
      ],
      expenses: [
        { amount: 1500, frequency: 'MONTHLY' },
      ],
      numberOfAdultDependants: 0,
      numberOfChildDependants: 0,
      loanTermYears: 30,
      interestRate: 0.06,
      repaymentType: 'PI',
    };

    const result = calculateBorrowingCapacity(input);

    expect(result.maxBorrowingCapacity).toBe(0);
    expect(result.passesServiceability).toBe(false);
    expect(result.messages).toContain('Monthly expenses exceed income. No borrowing capacity available.');
  });
});
