import { toMonthly, Frequency } from '../utils/frequency';
import { CalculatorParams, defaultCalculatorParams } from './calculator.config';

export interface IncomeInput {
  type: string;
  amount: number;
  frequency: Frequency;
  owner: string;
}

export interface DebtInput {
  type: string;
  outstandingBalance: number;
  monthlyRepayment?: number | null;
  interestRate?: number | null;
  creditLimit?: number | null;
}

export interface ExpenseInput {
  amount: number;
  frequency: Frequency;
}

export interface CalculatorInput {
  incomeSources: IncomeInput[];
  existingDebts: DebtInput[];
  expenses: ExpenseInput[];
  numberOfAdultDependants: number;
  numberOfChildDependants: number;
  loanTermYears: number;
  interestRate: number; // as a decimal, e.g., 0.06 for 6%
  repaymentType: 'PI' | 'IO';
  params?: Partial<CalculatorParams>;
}

export interface CalculatorResult {
  totalMonthlyIncome: number;
  totalMonthlyExpenses: number;
  netMonthlySurplus: number;
  serviceabilityMax: number;
  dtiMax: number;
  maxBorrowingCapacity: number;
  monthlyRepayment: number;
  dtiRatio: number;
  passesServiceability: boolean;
  passesDti: boolean;
  messages: string[];
}

/**
 * Determine if an income type is variable (non-salary).
 */
function isVariableIncome(type: string): boolean {
  const variableTypes = ['BONUS', 'COMMISSION', 'RENTAL', 'INVESTMENT', 'GOVERNMENT', 'OTHER'];
  return variableTypes.includes(type.toUpperCase());
}

/**
 * Calculate the monthly repayment for a P&I loan using amortization formula.
 * Formula: M = P * [r(1+r)^n] / [(1+r)^n - 1]
 * where r = monthly rate, n = number of months
 */
export function calculateMonthlyRepayment(
  principal: number,
  annualRate: number,
  termYears: number,
  repaymentType: 'PI' | 'IO'
): number {
  if (principal <= 0) return 0;
  const monthlyRate = annualRate / 12;
  
  if (repaymentType === 'IO') {
    return principal * monthlyRate;
  }
  
  // P&I amortization
  if (monthlyRate === 0) {
    return principal / (termYears * 12);
  }
  
  const n = termYears * 12;
  const factor = Math.pow(1 + monthlyRate, n);
  return principal * (monthlyRate * factor) / (factor - 1);
}

/**
 * Calculate maximum loan amount given a monthly payment budget.
 * Inverse of the amortization formula for P&I:
 * P = M * [(1+r)^n - 1] / [r(1+r)^n]
 */
export function calculateMaxLoanFromPayment(
  monthlyPayment: number,
  annualRate: number,
  termYears: number,
  repaymentType: 'PI' | 'IO'
): number {
  if (monthlyPayment <= 0) return 0;
  const monthlyRate = annualRate / 12;
  
  if (repaymentType === 'IO') {
    if (monthlyRate === 0) return 0;
    return monthlyPayment / monthlyRate;
  }
  
  // P&I
  if (monthlyRate === 0) {
    return monthlyPayment * termYears * 12;
  }
  
  const n = termYears * 12;
  const factor = Math.pow(1 + monthlyRate, n);
  return monthlyPayment * (factor - 1) / (monthlyRate * factor);
}

/**
 * Main borrowing capacity calculation.
 */
export function calculateBorrowingCapacity(input: CalculatorInput): CalculatorResult {
  const params: CalculatorParams = { ...defaultCalculatorParams, ...input.params };
  const messages: string[] = [];

  // Step 1: Normalize all income to monthly with shading
  let totalMonthlyIncome = 0;
  for (const income of input.incomeSources) {
    const monthlyAmount = toMonthly(income.amount, income.frequency);
    if (isVariableIncome(income.type)) {
      totalMonthlyIncome += monthlyAmount * params.variableIncomeShading;
    } else {
      totalMonthlyIncome += monthlyAmount * params.salaryShading;
    }
  }

  // Step 2: Calculate total monthly expenses
  let totalDeclaredExpenses = 0;
  for (const expense of input.expenses) {
    totalDeclaredExpenses += toMonthly(expense.amount, expense.frequency);
  }

  // Step 3: Add debt repayments to expenses
  let totalDebtRepayments = 0;
  for (const debt of input.existingDebts) {
    if (debt.type === 'CREDIT_CARD') {
      // Use 3% of credit limit as repayment if no explicit repayment given
      const creditLimit = debt.creditLimit || debt.outstandingBalance;
      totalDebtRepayments += creditLimit * params.creditCardRepaymentPercent;
    } else if (debt.monthlyRepayment) {
      totalDebtRepayments += debt.monthlyRepayment;
    }
  }

  // Step 4: Apply minimum living expense floor
  // Count the primary applicant as 1 adult plus any additional adult dependants
  const totalAdults = 1 + input.numberOfAdultDependants;
  const minimumLivingExpenses =
    totalAdults * params.minExpensePerAdult +
    input.numberOfChildDependants * params.minExpensePerChild;

  const totalMonthlyExpenses = Math.max(totalDeclaredExpenses, minimumLivingExpenses) + totalDebtRepayments;

  // Step 5: Net monthly surplus
  const netMonthlySurplus = totalMonthlyIncome - totalMonthlyExpenses;

  if (netMonthlySurplus <= 0) {
    messages.push('Monthly expenses exceed income. No borrowing capacity available.');
    return {
      totalMonthlyIncome,
      totalMonthlyExpenses,
      netMonthlySurplus,
      serviceabilityMax: 0,
      dtiMax: 0,
      maxBorrowingCapacity: 0,
      monthlyRepayment: 0,
      dtiRatio: 0,
      passesServiceability: false,
      passesDti: false,
      messages,
    };
  }

  // Step 6: Serviceability-based max loan using stress rate
  const stressRate = input.interestRate + params.stressBuffer;
  const serviceabilityMax = calculateMaxLoanFromPayment(
    netMonthlySurplus,
    stressRate,
    input.loanTermYears,
    input.repaymentType
  );

  // Step 7: DTI check
  const annualIncome = totalMonthlyIncome * 12;
  const dtiMax = annualIncome * params.dtiCap;

  // Step 8: Final max borrow = min(serviceability max, DTI max)
  const maxBorrowingCapacity = Math.min(serviceabilityMax, dtiMax);

  // Calculate monthly repayment at stress rate for the final amount
  const monthlyRepayment = calculateMonthlyRepayment(
    maxBorrowingCapacity,
    stressRate,
    input.loanTermYears,
    input.repaymentType
  );

  // Calculate DTI ratio
  const dtiRatio = annualIncome > 0 ? maxBorrowingCapacity / annualIncome : 0;

  const passesServiceability = maxBorrowingCapacity > 0;
  const passesDti = dtiRatio <= params.dtiCap;

  // Step 9: Generate messages
  if (maxBorrowingCapacity === dtiMax && dtiMax < serviceabilityMax) {
    messages.push(`Borrowing limited by DTI cap (${params.dtiCap}x annual income).`);
  }
  if (maxBorrowingCapacity === serviceabilityMax && serviceabilityMax < dtiMax) {
    messages.push('Borrowing limited by serviceability (net surplus at stress rate).');
  }
  if (passesServiceability && passesDti) {
    messages.push('Passes both serviceability and DTI checks.');
  }

  return {
    totalMonthlyIncome,
    totalMonthlyExpenses,
    netMonthlySurplus,
    serviceabilityMax,
    dtiMax,
    maxBorrowingCapacity,
    monthlyRepayment,
    dtiRatio,
    passesServiceability,
    passesDti,
    messages,
  };
}
