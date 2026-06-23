/**
 * Shared loan-repayment maths for the CommBank-style "estimated repayments"
 * breakdown shown on the results page.
 *
 * This intentionally mirrors the backend amortization logic in
 * `backend/src/services/calculator.ts` (calculateMonthlyRepayment) so the
 * figures we surface to clients match the serviceability engine, but here we
 * compute at the ACTUAL interest rate (no stress buffer) for the final loan
 * amount.
 *
 * Standard P&I amortization:
 *   M = P * r * (1 + r)^n / ((1 + r)^n - 1)
 *   where r = annualRate / 12 (monthly rate) and n = termYears * 12 (months).
 *
 * Interest Only:
 *   M = P * annualRate / 12
 *
 * Fortnightly / weekly figures are derived from the monthly repayment using
 * the conventional conversion fortnightly = monthly * 12 / 26 and
 * weekly = monthly * 12 / 52. This is a deliberate, defensible approximation
 * (rather than re-solving the amortization at a per-fortnight/week period
 * rate); it keeps the annual repayment total identical across frequencies.
 */

export type RepaymentType = 'PI' | 'IO';

export interface RepaymentBreakdown {
  /** Repayment per month. */
  monthly: number;
  /** Repayment per fortnight (monthly * 12 / 26). */
  fortnightly: number;
  /** Repayment per week (monthly * 12 / 52). */
  weekly: number;
  /** Total interest paid over the full term. */
  totalInterest: number;
  /** Total amount repaid over the full term (principal + interest). */
  totalRepayments: number;
}

/**
 * Compute the repayment breakdown for a loan.
 *
 * @param principal  Loan amount (e.g. the max borrowing capacity).
 * @param annualRate Annual interest rate as a decimal, e.g. 0.065 for 6.5%.
 * @param termYears  Loan term in years.
 * @param repaymentType 'PI' (principal & interest) or 'IO' (interest only).
 */
export function computeRepayments(
  principal: number,
  annualRate: number,
  termYears: number,
  repaymentType: RepaymentType
): RepaymentBreakdown {
  if (!principal || principal <= 0 || !termYears || termYears <= 0) {
    return { monthly: 0, fortnightly: 0, weekly: 0, totalInterest: 0, totalRepayments: 0 };
  }

  const monthlyRate = annualRate / 12;
  const n = termYears * 12;

  let monthly: number;
  let totalInterest: number;
  let totalRepayments: number;

  if (repaymentType === 'IO') {
    monthly = principal * monthlyRate;
    // Interest only: interest accrues for the whole term, principal repaid at end.
    totalInterest = principal * annualRate * termYears;
    totalRepayments = totalInterest + principal;
  } else {
    // Principal & Interest amortization.
    if (monthlyRate === 0) {
      monthly = principal / n;
    } else {
      const factor = Math.pow(1 + monthlyRate, n);
      monthly = (principal * (monthlyRate * factor)) / (factor - 1);
    }
    totalRepayments = monthly * n;
    totalInterest = totalRepayments - principal;
  }

  return {
    monthly,
    fortnightly: (monthly * 12) / 26,
    weekly: (monthly * 12) / 52,
    totalInterest,
    totalRepayments,
  };
}

export default computeRepayments;
