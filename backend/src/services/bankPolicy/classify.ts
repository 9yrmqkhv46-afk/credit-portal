/**
 * 2026 Bank Lending Policy Engine — qualitative classifiers & tags.
 *
 * Turns the *numeric* policy parameters in `policies.ts` into human-readable
 * stances ("conservative / normal / generous") and machine-readable TAGS.
 * This is the single source of truth shared by:
 *   - summaries.ts   (Word-style policy documents — feature A)
 *   - match.ts       (scenario pattern matching — feature D)
 * so the prose, the tags and the engine never drift apart: change a number in
 * `policies.ts` and every derived artefact updates automatically.
 *
 * DISCLAIMER: derived from modelled estimates only — not official lender policy.
 */

import { BankPolicy, ProductPolicy } from './types';

export type Stance = 'conservative' | 'normal' | 'generous';

/** Canonical bank capability tags (used by scenario-pattern matching). */
export type BankTag =
  | 'FHB_FRIENDLY'
  | 'PAYG_FRIENDLY'
  | 'PORTFOLIO_INVESTOR_FRIENDLY'
  | 'SELF_EMPLOYED_FRIENDLY'
  | 'COMMERCIAL_PROPERTY_FRIENDLY'
  | 'HIGH_DTI_TOLERANCE'
  | 'LOW_DTI_TOLERANCE'
  | 'RENTAL_GENEROUS'
  | 'RENTAL_CONSERVATIVE'
  | 'VARIABLE_INCOME_FRIENDLY'
  | 'CONSERVATIVE_EXPENSES'
  | 'INTEREST_ONLY_FRIENDLY';

// ---------------------------------------------------------------------------
// Per-dimension stance helpers (thresholds align with POLICIES.md narrative).
// ---------------------------------------------------------------------------

export function rentalStance(acceptPct: number): Stance {
  if (acceptPct >= 0.82) return 'generous';
  if (acceptPct < 0.78) return 'conservative';
  return 'normal';
}

export function businessIncomeStance(acceptPct: number): Stance {
  if (acceptPct >= 0.73) return 'generous';
  if (acceptPct < 0.65) return 'conservative';
  return 'normal';
}

export function variableIncomeStance(acceptPct: number): Stance {
  if (acceptPct >= 0.85) return 'generous';
  if (acceptPct < 0.7) return 'conservative';
  return 'normal';
}

export function bufferStance(bufferBps: number): 'standard' | 'higher' {
  return bufferBps > 300 ? 'higher' : 'standard';
}

/** DTI comfort band, phrased the way a credit analyst would describe it. */
export function dtiBand(maxDti: number): string {
  if (maxDti >= 7) return 'flexible (comfortable up to ~7x for strong profiles)';
  if (maxDti >= 6.5) return 'slightly above mainstream (mid-6s)';
  if (maxDti >= 6) return 'mainstream (~6x)';
  return `tighter than peers (~${maxDti.toFixed(2)}x)`;
}

export function expenseStrictness(minLivingPerAdult: number): Stance {
  if (minLivingPerAdult >= 1300) return 'conservative';
  if (minLivingPerAdult <= 1180) return 'generous';
  return 'normal';
}

export type PortfolioComfort = 'small' | 'moderate' | 'large';

export function portfolioComfort(product: ProductPolicy): PortfolioComfort {
  const rules = product.propertyTreatmentRules;
  if (rules.selectionStrategy === 'all') return 'large';
  if (rules.maxPropertiesConsidered >= 5) return 'moderate';
  if (rules.maxPropertiesConsidered <= 3) return 'small';
  return 'moderate';
}

/** A short phrase describing how many properties the bank will look through. */
export function portfolioPhrase(product: ProductPolicy): string {
  const rules = product.propertyTreatmentRules;
  if (rules.selectionStrategy === 'all') {
    return `considers the full included portfolio (up to ${rules.maxPropertiesConsidered} properties)`;
  }
  if (rules.selectionStrategy === 'topByEquity') {
    return `focuses on the top ${rules.maxPropertiesConsidered} properties by equity`;
  }
  return `focuses on the top ${rules.maxPropertiesConsidered} properties by loan balance`;
}

export function hasSelfEmployedUplift(product: ProductPolicy): boolean {
  return !!product.specialSegments?.some((s) => s.segment === 'SELF_EMPLOYED' && (s.dtiUpliftToCap || s.lvrUpliftToCap));
}

// ---------------------------------------------------------------------------
// Tag derivation
// ---------------------------------------------------------------------------

/**
 * Derive the capability tags for a bank from its product policies. Tags are
 * deterministic functions of the configured parameters.
 */
export function bankTags(policy: BankPolicy): BankTag[] {
  const oo = policy.residentialOwnerOcc;
  const inv = policy.residentialInvestment;
  const com = policy.commercialPropertyLight;
  const tags = new Set<BankTag>();

  // Owner-occ / first-home appetite (high LVR = deposit-light friendly).
  if (oo.maxLvr >= 0.95) {
    tags.add('FHB_FRIENDLY');
    tags.add('PAYG_FRIENDLY');
  }

  // Portfolio investor friendliness: sees many properties AND tolerates DTI.
  const comfort = portfolioComfort(inv);
  if ((comfort === 'large' || comfort === 'moderate') && inv.maxDti >= 6.5) {
    tags.add('PORTFOLIO_INVESTOR_FRIENDLY');
  }

  // Self-employed / business income.
  if (hasSelfEmployedUplift(inv) || hasSelfEmployedUplift(oo) || businessIncomeStance(inv.incomeShadingRules.businessIncome.acceptPct) === 'generous') {
    tags.add('SELF_EMPLOYED_FRIENDLY');
  }

  // Commercial-property overlay.
  if (com.maxLvr >= 0.7) tags.add('COMMERCIAL_PROPERTY_FRIENDLY');

  // DTI tolerance (use the investment band — the most stretched product).
  if (inv.maxDti >= 7) tags.add('HIGH_DTI_TOLERANCE');
  if (inv.maxDti <= 5.75) tags.add('LOW_DTI_TOLERANCE');

  // Rental income stance.
  const rental = rentalStance(inv.incomeShadingRules.rental.acceptPct);
  if (rental === 'generous') tags.add('RENTAL_GENEROUS');
  if (rental === 'conservative') tags.add('RENTAL_CONSERVATIVE');

  // Variable income (bonus/overtime/secondary).
  if (variableIncomeStance(oo.incomeShadingRules.salarySecondary.acceptPct) === 'generous') {
    tags.add('VARIABLE_INCOME_FRIENDLY');
  }

  // Living-expense strictness.
  if (expenseStrictness(oo.expenseTreatmentRules.minLivingExpensePerAdult) === 'conservative') {
    tags.add('CONSERVATIVE_EXPENSES');
  }

  // Interest-only friendliness (investment IO allowed for a decent term).
  if (inv.interestOnlyTreatment?.allowed && (inv.interestOnlyTreatment.maxIoYears ?? 0) >= 5) {
    tags.add('INTEREST_ONLY_FRIENDLY');
  }

  return [...tags];
}

/** Human-readable label for a tag (used in prose + UI). */
export const TAG_LABELS: Record<BankTag, string> = {
  FHB_FRIENDLY: 'First-home-buyer friendly',
  PAYG_FRIENDLY: 'Strong for PAYG borrowers',
  PORTFOLIO_INVESTOR_FRIENDLY: 'Portfolio-investor friendly',
  SELF_EMPLOYED_FRIENDLY: 'Self-employed friendly',
  COMMERCIAL_PROPERTY_FRIENDLY: 'Light-commercial friendly',
  HIGH_DTI_TOLERANCE: 'Higher DTI tolerance',
  LOW_DTI_TOLERANCE: 'Tighter DTI tolerance',
  RENTAL_GENEROUS: 'Generous on rental income',
  RENTAL_CONSERVATIVE: 'Conservative on rental income',
  VARIABLE_INCOME_FRIENDLY: 'Generous on bonus/overtime',
  CONSERVATIVE_EXPENSES: 'Conservative living-expense floors',
  INTEREST_ONLY_FRIENDLY: 'Interest-only friendly',
};
