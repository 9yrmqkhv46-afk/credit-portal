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
  { value: 'COMPANY_CAR', label: 'Company car allowance' },
  { value: 'CHILD_MAINTENANCE', label: 'Child maintenance' },
  { value: 'OTHER_TAXED', label: 'Other (taxed)' },
  { value: 'OTHER_TAX_FREE', label: 'Other (tax-free)' },
  { value: 'FAMILY_TAX_A', label: 'Family Tax Benefit A' },
  { value: 'FAMILY_TAX_B', label: 'Family Tax Benefit B' },
  { value: 'PARENTING_PAYMENT', label: 'Parenting payment' },
];

export const EMPLOYMENT_TYPE_OPTIONS: { value: EmploymentType; label: string }[] = [
  { value: 'FULL_TIME_PERMANENT', label: 'Full-time permanent' },
  { value: 'PART_TIME', label: 'Part-time' },
  { value: 'CASUAL', label: 'Casual' },
  { value: 'CONTRACT', label: 'Contract' },
];

export function incomeCategoryLabel(value: string): string {
  return INCOME_CATEGORY_OPTIONS.find((o) => o.value === value)?.label ?? value;
}
