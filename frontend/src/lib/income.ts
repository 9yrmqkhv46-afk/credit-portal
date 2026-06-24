import { IncomeCategory, EmploymentType } from '@/types';

/**
 * Human-readable labels for the MAIN income categories. Kept in sync with the
 * backend `INCOME_CATEGORIES` list (backend/src/services/servicing.config.ts)
 * and the IncomeEntry Prisma model.
 */
export const INCOME_CATEGORY_OPTIONS: { value: IncomeCategory; label: string }[] = [
  { value: 'BASE_SALARY_PAYG', label: 'Base salary (PAYG)' },
  { value: 'SECOND_PAYG', label: 'Second job (PAYG)' },
  { value: 'CASUAL', label: 'Casual income' },
  { value: 'COMMISSION', label: 'Commission' },
  { value: 'OVERTIME', label: 'Overtime' },
  { value: 'ESSENTIAL_OVERTIME', label: 'Essential overtime' },
  { value: 'ALLOWANCES', label: 'Allowances' },
  { value: 'BONUS_RECENT', label: 'Bonus (most recent)' },
  { value: 'BONUS_PREVIOUS', label: 'Bonus (previous year)' },
  { value: 'FOREIGN_PAYG', label: 'Foreign PAYG income' },
  { value: 'NET_FOREIGN', label: 'Net foreign income' },
  { value: 'INVESTMENT', label: 'Investment income' },
  { value: 'INTEREST', label: 'Interest income' },
  { value: 'SUPER_ANNUITY', label: 'Superannuation / annuity' },
  { value: 'CARERS', label: "Carer's payment" },
  { value: 'GOVERNMENT_PENSION', label: 'Government pension' },
  { value: 'COMPANY_CAR', label: 'Company car ($ value)' },
  { value: 'CHILD_MAINTENANCE', label: 'Child maintenance' },
  { value: 'OTHER_TAXED', label: 'Other (taxed)' },
  { value: 'OTHER_TAX_FREE', label: 'Other (tax-free)' },
  { value: 'FAMILY_TAX_A', label: 'Family Tax Benefit A' },
  { value: 'FAMILY_TAX_B', label: 'Family Tax Benefit B' },
  { value: 'PARENTING_PAYMENT', label: 'Parenting payment' },
  { value: 'PRETAX_DEDUCTION', label: 'Pre-tax deductions (reduces income)' },
  { value: 'POSTTAX_DEDUCTION', label: 'Post-tax deductions (reduces income)' },
];

/**
 * Grouped MAIN categories for a clearer primary dropdown (Quickli-style). Each
 * group's options reference the flat category values above.
 */
export const INCOME_CATEGORY_GROUPS: {
  group: string;
  options: { value: IncomeCategory; label: string }[];
}[] = [
  {
    group: 'PAYG employment',
    options: [
      { value: 'BASE_SALARY_PAYG', label: 'Base salary (PAYG)' },
      { value: 'SECOND_PAYG', label: 'Second job (PAYG)' },
      { value: 'CASUAL', label: 'Casual income' },
      { value: 'FOREIGN_PAYG', label: 'Foreign PAYG income' },
      { value: 'NET_FOREIGN', label: 'Net foreign income' },
    ],
  },
  {
    group: 'Variable employment income',
    options: [
      { value: 'COMMISSION', label: 'Commission' },
      { value: 'OVERTIME', label: 'Overtime' },
      { value: 'ESSENTIAL_OVERTIME', label: 'Essential overtime' },
      { value: 'ALLOWANCES', label: 'Allowances' },
      { value: 'BONUS_RECENT', label: 'Bonus (most recent)' },
      { value: 'BONUS_PREVIOUS', label: 'Bonus (previous year)' },
      { value: 'COMPANY_CAR', label: 'Company car ($ value)' },
    ],
  },
  {
    group: 'Investment & other',
    options: [
      { value: 'INVESTMENT', label: 'Investment income' },
      { value: 'INTEREST', label: 'Interest income' },
      { value: 'SUPER_ANNUITY', label: 'Superannuation / annuity' },
      { value: 'OTHER_TAXED', label: 'Other (taxed)' },
      { value: 'OTHER_TAX_FREE', label: 'Other (tax-free)' },
    ],
  },
  {
    group: 'Government & family',
    options: [
      { value: 'CARERS', label: "Carer's payment" },
      { value: 'GOVERNMENT_PENSION', label: 'Government pension' },
      { value: 'CHILD_MAINTENANCE', label: 'Child maintenance' },
      { value: 'FAMILY_TAX_A', label: 'Family Tax Benefit A' },
      { value: 'FAMILY_TAX_B', label: 'Family Tax Benefit B' },
      { value: 'PARENTING_PAYMENT', label: 'Parenting payment' },
    ],
  },
  {
    group: 'Deductions (reduce income)',
    options: [
      { value: 'PRETAX_DEDUCTION', label: 'Pre-tax deductions' },
      { value: 'POSTTAX_DEDUCTION', label: 'Post-tax deductions' },
    ],
  },
];

/**
 * Representative per-category income shading used ONLY for the optional
 * frontend "shaded monthly income" hint. The backend is the source of truth
 * (backend/src/services/servicing.config.ts). Deductions are shown un-shaded
 * and as a reduction.
 */
export const INCOME_SHADING_HINT: Record<string, number> = {
  BASE_SALARY_PAYG: 1.0, SECOND_PAYG: 1.0, CASUAL: 0.8, COMMISSION: 0.8,
  OVERTIME: 0.8, ESSENTIAL_OVERTIME: 0.9, ALLOWANCES: 0.8, BONUS_RECENT: 0.8,
  BONUS_PREVIOUS: 0.5, FOREIGN_PAYG: 0.8, NET_FOREIGN: 0.8, INVESTMENT: 0.8,
  INTEREST: 0.8, SUPER_ANNUITY: 0.8, CARERS: 1.0, GOVERNMENT_PENSION: 1.0,
  COMPANY_CAR: 0.8, CHILD_MAINTENANCE: 0.8, OTHER_TAXED: 0.8, OTHER_TAX_FREE: 0.8,
  FAMILY_TAX_A: 1.0, FAMILY_TAX_B: 1.0, PARENTING_PAYMENT: 1.0,
};

export const DEDUCTION_CATEGORIES = ['PRETAX_DEDUCTION', 'POSTTAX_DEDUCTION'];

const PER_YEAR: Record<string, number> = { WEEKLY: 52, FORTNIGHTLY: 26, MONTHLY: 12, QUARTERLY: 4, ANNUAL: 1 };

/** Convert an amount at a frequency to a monthly figure. */
export function toMonthlyAmount(amount: number, frequency: string): number {
  const perYear = PER_YEAR[frequency] ?? 12;
  return (amount * perYear) / 12;
}

/**
 * Optional UI hint: the shaded monthly contribution of an income row. Deductions
 * return a negative figure (a reduction). The backend remains authoritative.
 */
export function shadedMonthly(category: string, amount: number, frequency: string): number {
  const monthly = toMonthlyAmount(amount || 0, frequency);
  if (DEDUCTION_CATEGORIES.includes(category)) return -monthly;
  const shading = INCOME_SHADING_HINT[category] ?? 0.8;
  return monthly * shading;
}

export const EMPLOYMENT_TYPE_OPTIONS: { value: EmploymentType; label: string }[] = [
  { value: 'FULL_TIME_PERMANENT', label: 'Full-time permanent' },
  { value: 'PART_TIME', label: 'Part-time' },
  { value: 'CASUAL', label: 'Casual' },
  { value: 'CONTRACT', label: 'Contract' },
];

export function incomeCategoryLabel(value: string): string {
  return INCOME_CATEGORY_OPTIONS.find((o) => o.value === value)?.label ?? value;
}
