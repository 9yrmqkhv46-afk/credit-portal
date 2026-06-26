/**
 * 2026 Bank Policy Engine — loan mathematics & risk tooling.
 *
 *  - buildAmortizationSchedule(): full repayment schedule incl. an optional
 *    interest-only period, with totals (interest paid, etc.).
 *  - comparisonRate(): indicative comparison rate that folds fees into an APR.
 *  - rateShockStress(): APRA-style "what if rates rise X%?" serviceability test.
 *  - borrowingConfidenceBand(): low/expected/high borrowing capacity by sweeping
 *    income-shading uncertainty — a realistic range rather than a single number.
 *
 * DISCLAIMER: modelled estimates only — not a quote or credit decision.
 */

import { BankPolicy, ScenarioInput } from './types';
import { monthlyRepayment, runBankCalc } from './engine';

const MONTHS = 12;

export interface AmortRow {
  period: number;
  openingBalance: number;
  interest: number;
  principal: number;
  repayment: number;
  closingBalance: number;
  phase: 'IO' | 'PI';
}

export interface AmortizationResult {
  monthlyRepaymentPI: number;
  monthlyRepaymentIO: number;
  totalInterest: number;
  totalRepaid: number;
  ioMonths: number;
  schedule: AmortRow[];
}

/**
 * Build a monthly amortization schedule. During an optional interest-only
 * period only interest is charged; afterwards the residual amortises over the
 * remaining term. `sampleEvery` thins the returned rows (totals stay exact).
 */
export function buildAmortizationSchedule(
  principal: number, annualRate: number, termYears: number,
  opts: { ioYears?: number; sampleEvery?: number } = {},
): AmortizationResult {
  const n = Math.round(termYears * MONTHS);
  const ioMonths = Math.min(n - 1, Math.round((opts.ioYears ?? 0) * MONTHS));
  const r = annualRate / MONTHS;
  const sampleEvery = Math.max(1, opts.sampleEvery ?? 1);

  const ioPayment = principal * r;
  const piPayment = monthlyRepayment(principal, annualRate, termYears - ioMonths / MONTHS);

  let balance = principal;
  let totalInterest = 0;
  let totalRepaid = 0;
  const schedule: AmortRow[] = [];

  for (let period = 1; period <= n; period++) {
    const io = period <= ioMonths;
    const interest = balance * r;
    const repayment = io ? ioPayment : piPayment;
    const principalPaid = io ? 0 : Math.min(balance, repayment - interest);
    const closing = Math.max(0, balance - principalPaid);
    totalInterest += interest;
    totalRepaid += io ? interest : Math.min(repayment, interest + balance);
    if (period % sampleEvery === 0 || period === n || period === ioMonths) {
      schedule.push({
        period, openingBalance: Math.round(balance), interest: Math.round(interest),
        principal: Math.round(principalPaid), repayment: Math.round(repayment), closingBalance: Math.round(closing),
        phase: io ? 'IO' : 'PI',
      });
    }
    balance = closing;
  }

  return {
    monthlyRepaymentPI: Math.round(piPayment),
    monthlyRepaymentIO: Math.round(ioPayment),
    totalInterest: Math.round(totalInterest),
    totalRepaid: Math.round(totalRepaid),
    ioMonths,
    schedule,
  };
}

/**
 * Indicative comparison rate: the effective annual rate whose fee-free
 * repayment matches the actual repayment once upfront + ongoing fees are
 * spread across the loan. Solved by bisection.
 */
export function comparisonRate(
  principal: number, annualRate: number, termYears: number,
  fees: { upfront?: number; ongoingMonthly?: number } = {},
): number {
  if (principal <= 0) return annualRate;
  const upfront = fees.upfront ?? 0;
  const ongoing = fees.ongoingMonthly ?? 0;
  // Effective amount financed plus fees recovered through repayments.
  const targetPayment = monthlyRepayment(principal, annualRate, termYears) + ongoing + upfront / (termYears * MONTHS);

  let lo = annualRate, hi = annualRate + 0.05;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const pay = monthlyRepayment(principal, mid, termYears);
    if (pay < targetPayment) lo = mid; else hi = mid;
  }
  return Number(((lo + hi) / 2).toFixed(4));
}

export interface RateShockResult {
  shockBps: number;
  baseSurplus: number;
  shockedSurplus: number;
  baseStressRate: number;
  shockedRepayment: number;
  survives: boolean;
  maxBorrowAfterShock: number;
}

/**
 * Stress test: add `shockBps` to the scenario rate and re-run the engine.
 * Reports whether the borrower still services the requested loan.
 */
export function rateShockStress(input: ScenarioInput, policy: BankPolicy, shockBps = 300): RateShockResult {
  const base = runBankCalc(input, policy);
  const shockedInput: ScenarioInput = { ...input, scenario: { ...input.scenario, interestRate: input.scenario.interestRate + shockBps / 10000 } };
  const shocked = runBankCalc(shockedInput, policy);
  const shockedRepayment = monthlyRepayment(input.scenario.targetLoanAmount, input.scenario.interestRate + shockBps / 10000, input.scenario.termYears);

  return {
    shockBps,
    baseSurplus: base.netMonthlySurplus,
    shockedSurplus: shocked.netMonthlySurplus,
    baseStressRate: base.stressRateUsed,
    shockedRepayment: Math.round(shockedRepayment),
    survives: shocked.finalMaxBorrow >= input.scenario.targetLoanAmount,
    maxBorrowAfterShock: shocked.finalMaxBorrow,
  };
}

export interface ConfidenceBand {
  low: number;
  expected: number;
  high: number;
  spreadPct: number;
}

/**
 * Borrowing-capacity confidence band: re-runs the engine with income shaded
 * down (pessimistic) and up (optimistic) to express uncertainty as a range.
 */
export function borrowingConfidenceBand(input: ScenarioInput, policy: BankPolicy, swing = 0.1): ConfidenceBand {
  const scale = (factor: number): ScenarioInput => ({
    ...input,
    incomeSources: input.incomeSources.map((s) => ({ ...s, amount: s.amount * factor })),
    properties: input.properties.map((p) => ({ ...p, grossRentalIncomeMonthly: p.grossRentalIncomeMonthly * factor })),
  });
  const expected = runBankCalc(input, policy).finalMaxBorrow;
  const low = runBankCalc(scale(1 - swing), policy).finalMaxBorrow;
  const high = runBankCalc(scale(1 + swing), policy).finalMaxBorrow;
  const spreadPct = expected > 0 ? Number((((high - low) / expected) * 100).toFixed(1)) : 0;
  return { low, expected, high, spreadPct };
}
