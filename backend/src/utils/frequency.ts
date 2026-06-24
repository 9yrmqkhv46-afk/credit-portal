export type Frequency = 'WEEKLY' | 'FORTNIGHTLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';

const WEEKS_PER_YEAR = 52;
const FORTNIGHTS_PER_YEAR = 26;
const MONTHS_PER_YEAR = 12;
const QUARTERS_PER_YEAR = 4;

/**
 * Convert an amount from one frequency to monthly.
 *
 * QUARTERLY = 4 payments per year, so a quarterly amount converts to monthly
 * as amount * 4 / 12 (equivalently amount / 3).
 */
export function toMonthly(amount: number, frequency: Frequency): number {
  switch (frequency) {
    case 'WEEKLY':
      return (amount * WEEKS_PER_YEAR) / MONTHS_PER_YEAR;
    case 'FORTNIGHTLY':
      return (amount * FORTNIGHTS_PER_YEAR) / MONTHS_PER_YEAR;
    case 'MONTHLY':
      return amount;
    case 'QUARTERLY':
      return (amount * QUARTERS_PER_YEAR) / MONTHS_PER_YEAR;
    case 'ANNUAL':
      return amount / MONTHS_PER_YEAR;
    default:
      return amount;
  }
}

/**
 * Convert an amount from one frequency to annual.
 */
export function toAnnual(amount: number, frequency: Frequency): number {
  switch (frequency) {
    case 'WEEKLY':
      return amount * WEEKS_PER_YEAR;
    case 'FORTNIGHTLY':
      return amount * FORTNIGHTS_PER_YEAR;
    case 'MONTHLY':
      return amount * MONTHS_PER_YEAR;
    case 'QUARTERLY':
      return amount * QUARTERS_PER_YEAR;
    case 'ANNUAL':
      return amount;
    default:
      return amount;
  }
}

/**
 * Convert an amount between any two frequencies.
 */
export function convertFrequency(
  amount: number,
  from: Frequency,
  to: Frequency
): number {
  if (from === to) return amount;
  const annual = toAnnual(amount, from);
  switch (to) {
    case 'WEEKLY':
      return annual / WEEKS_PER_YEAR;
    case 'FORTNIGHTLY':
      return annual / FORTNIGHTS_PER_YEAR;
    case 'MONTHLY':
      return annual / MONTHS_PER_YEAR;
    case 'QUARTERLY':
      return annual / QUARTERS_PER_YEAR;
    case 'ANNUAL':
      return annual;
    default:
      return annual / MONTHS_PER_YEAR;
  }
}
