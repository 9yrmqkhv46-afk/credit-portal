import api from '@/lib/api';

/** Format a number as AUD currency, or em-dash when null/undefined. */
export function money(n: number | null | undefined, fractionDigits = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return n.toLocaleString('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: fractionDigits,
  });
}

/** Format a number as a percentage, or em-dash when null/undefined. */
export function pct(n: number | null | undefined, fractionDigits = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return `${n.toFixed(fractionDigits)}%`;
}

/** Format decimal years (e.g. 8.48) as "X years Y months". */
export function yearsMonths(years: number | null | undefined): string {
  if (years === null || years === undefined || Number.isNaN(years) || years <= 0) return '—';
  const whole = Math.floor(years);
  const months = Math.round((years - whole) * 12);
  // Handle rounding up to 12 months.
  const y = months === 12 ? whole + 1 : whole;
  const m = months === 12 ? 0 : months;
  const yPart = `${y} year${y === 1 ? '' : 's'}`;
  const mPart = `${m} month${m === 1 ? '' : 's'}`;
  return `${yPart} ${mPart}`;
}

export const FREQUENCY_OPTIONS = [
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'FORTNIGHTLY', label: 'Fortnightly' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'ANNUAL', label: 'Annual' },
];

export interface ServicingCalcResult {
  maxBorrowingCapacity: number;
  totalMonthlyIncome: number;
  totalMonthlyExpenses: number;
  monthlyCommitments: number;
  netMonthlySurplus: number;
  monthlyRepayment: number;
  dtiRatio: number;
  passesServiceability: boolean;
  passesDti: boolean;
  messages: string[];
}

/**
 * Recompute borrowing capacity by creating a loan scenario. The backend
 * filters everything by includeInServicing and returns the result (including
 * the "Indicative estimate only - not a credit decision." disclaimer).
 */
export async function recalculateBorrowingCapacity(opts?: {
  interestRate?: number; // decimal, default 0.06
  loanTermYears?: number; // default 30
  repaymentType?: 'PI' | 'IO';
  purpose?: string;
}): Promise<ServicingCalcResult> {
  const res = await api.post('/loan-scenarios', {
    purpose: opts?.purpose || 'PURCHASE',
    repaymentType: opts?.repaymentType || 'PI',
    loanTermYears: opts?.loanTermYears ?? 30,
    interestRate: opts?.interestRate ?? 0.06,
  });
  return res.data.calculationResult as ServicingCalcResult;
}

/** Toggle a single row's includeInServicing flag via the bulk endpoint. */
export async function setIncludeInServicing(
  entity: 'property' | 'proposedLoan' | 'existingHomeLoan' | 'personalLiability',
  id: string,
  include: boolean
): Promise<void> {
  const key = {
    property: 'propertyIds',
    proposedLoan: 'proposedLoanIds',
    existingHomeLoan: 'existingHomeLoanIds',
    personalLiability: 'personalLiabilityIds',
  }[entity];
  await api.post('/client/servicing-selection', { include, [key]: [id] });
}
