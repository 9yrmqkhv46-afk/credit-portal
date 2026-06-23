export interface CalculatorParams {
  dtiCap: number;
  stressBuffer: number;
  salaryShading: number;
  variableIncomeShading: number;
  minExpensePerAdult: number;
  minExpensePerChild: number;
  creditCardRepaymentPercent: number;
}

export const defaultCalculatorParams: CalculatorParams = {
  dtiCap: 6,
  stressBuffer: 0.03,
  salaryShading: 1.0,
  variableIncomeShading: 0.8,
  minExpensePerAdult: 1200,
  minExpensePerChild: 600,
  creditCardRepaymentPercent: 0.03,
};
