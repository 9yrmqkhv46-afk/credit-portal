/**
 * 2026 Bank Policy Engine — Word-document parameter contract.
 *
 * The Word document is the editable SOURCE OF TRUTH for a bank's policy
 * (replacing hand-edited config). Because the deterministic engine needs exact
 * numbers, every editable parameter is serialised into a flat, loss-less
 * `key = value` block embedded in the .docx ("Policy Parameters"). On upload we
 * parse that block back into a BankPolicy.
 *
 * This module defines that contract: the whitelist of editable paths, how to
 * read/write them on a BankPolicy, and how to coerce/validate parsed values.
 * Non-scalar fields not listed here (e.g. specialSegments) are preserved from
 * the base policy on import.
 */

import { BankPolicy } from './types';

type ParamType = 'pct' | 'num' | 'int' | 'bool' | 'enum' | 'str';

interface ParamSpec {
  /** Dotted path relative to a product, e.g. "incomeShadingRules.rental.acceptPct". */
  path: string;
  label: string;
  type: ParamType;
  enumValues?: string[];
}

/** Editable parameters that exist on every ProductPolicy. */
const PRODUCT_PARAM_SPECS: ParamSpec[] = [
  { path: 'maxLvr', label: 'Maximum LVR (0-1)', type: 'pct' },
  { path: 'maxDti', label: 'Maximum DTI (x)', type: 'num' },
  { path: 'minLoanAmount', label: 'Minimum loan amount', type: 'int' },
  { path: 'maxLoanAmount', label: 'Maximum loan amount', type: 'int' },
  { path: 'minTermYears', label: 'Minimum term (years)', type: 'int' },
  { path: 'maxTermYears', label: 'Maximum term (years)', type: 'int' },
  { path: 'baseRateAssumption', label: 'Base assessment rate (0-1)', type: 'pct' },
  { path: 'serviceabilityBufferBps', label: 'Serviceability buffer (bps)', type: 'int' },

  { path: 'incomeShadingRules.salaryPrimary.acceptPct', label: 'Primary salary accepted (0-1)', type: 'pct' },
  { path: 'incomeShadingRules.salarySecondary.acceptPct', label: 'Secondary/bonus accepted (0-1)', type: 'pct' },
  { path: 'incomeShadingRules.rental.acceptPct', label: 'Rental income accepted (0-1)', type: 'pct' },
  { path: 'incomeShadingRules.rental.vacancyFactorPct', label: 'Rental vacancy factor (0-1)', type: 'pct' },
  { path: 'incomeShadingRules.govBenefits.acceptPct', label: 'Govt benefits accepted (0-1)', type: 'pct' },
  { path: 'incomeShadingRules.businessIncome.acceptPct', label: 'Business income accepted (0-1)', type: 'pct' },
  { path: 'incomeShadingRules.businessIncome.minYearsFinancials', label: 'Business min years financials', type: 'int' },
  { path: 'incomeShadingRules.other.acceptPct', label: 'Other income accepted (0-1)', type: 'pct' },

  { path: 'expenseTreatmentRules.useHem', label: 'Use HEM benchmark', type: 'bool' },
  { path: 'expenseTreatmentRules.minLivingExpensePerAdult', label: 'Min living expense / adult / mo', type: 'int' },
  { path: 'expenseTreatmentRules.minLivingExpensePerChild', label: 'Min living expense / child / mo', type: 'int' },
  { path: 'expenseTreatmentRules.treatClientDeclaredAsFloor', label: 'Treat declared expenses as floor', type: 'bool' },

  { path: 'debtTreatmentRules.creditCardRepaymentPctOfLimit', label: 'Credit card % of limit / mo', type: 'pct' },
  { path: 'debtTreatmentRules.personalLoanRepaymentCalc', label: 'Personal loan calc', type: 'enum', enumValues: ['actual', 'buffered'] },
  { path: 'debtTreatmentRules.carLoanRepaymentCalc', label: 'Car loan calc', type: 'enum', enumValues: ['actual', 'buffered'] },
  { path: 'debtTreatmentRules.hecsHelpTreatment', label: 'HECS/HELP treatment', type: 'enum', enumValues: ['actual', 'aboveThreshold', 'ignored'] },
  { path: 'debtTreatmentRules.otherLoanRepaymentCalc', label: 'Other loan calc', type: 'enum', enumValues: ['actual', 'buffered'] },
  { path: 'debtTreatmentRules.maxInterestOnlyYears', label: 'Max interest-only years', type: 'int' },

  { path: 'propertyTreatmentRules.maxPropertiesConsidered', label: 'Max properties considered', type: 'int' },
  { path: 'propertyTreatmentRules.selectionStrategy', label: 'Property selection strategy', type: 'enum', enumValues: ['topByEquity', 'topByLoanBalance', 'all'] },
  { path: 'propertyTreatmentRules.includeOwnerOccPropertyInCalc', label: 'Include owner-occ property', type: 'bool' },
  { path: 'propertyTreatmentRules.includeInvestmentPropertiesInCalc', label: 'Include investment properties', type: 'bool' },
  { path: 'propertyTreatmentRules.includeCommercialPropertiesInCalc', label: 'Include commercial properties', type: 'bool' },
  { path: 'propertyTreatmentRules.allowHidePerProperty', label: 'Allow hide per property', type: 'bool' },
  { path: 'propertyTreatmentRules.defaultIncludeCountResidential', label: 'Default included residential count', type: 'int' },
  { path: 'propertyTreatmentRules.defaultIncludeCountCommercial', label: 'Default included commercial count', type: 'int' },

  { path: 'negativeGearingTreatment.allowNegativeGearingBenefit', label: 'Allow negative gearing benefit', type: 'bool' },
  { path: 'negativeGearingTreatment.maxBenefitPctOfRentalLoss', label: 'Max negative-gearing benefit (0-1)', type: 'pct' },

  { path: 'interestOnlyTreatment.allowed', label: 'Interest-only allowed', type: 'bool' },
  { path: 'interestOnlyTreatment.maxIoYears', label: 'Max IO years', type: 'int' },
  { path: 'interestOnlyTreatment.ioAssessmentRateLoadingBps', label: 'IO assessment loading (bps)', type: 'int' },
];

export const PRODUCT_KEYS = ['ownerOcc', 'investment', 'commercial'] as const;
export type ProductKey = (typeof PRODUCT_KEYS)[number];

const PRODUCT_FIELD: Record<ProductKey, keyof BankPolicy> = {
  ownerOcc: 'residentialOwnerOcc',
  investment: 'residentialInvestment',
  commercial: 'commercialPropertyLight',
};

export const PRODUCT_LABEL: Record<ProductKey, string> = {
  ownerOcc: 'Owner-occupied',
  investment: 'Residential investment',
  commercial: 'Light commercial',
};

// --- dotted-path get/set ----------------------------------------------------

function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, k) => (acc == null ? undefined : (acc as Record<string, unknown>)[k]), obj);
}

function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (typeof cur[k] !== 'object' || cur[k] == null) cur[k] = {};
    cur = cur[k] as Record<string, unknown>;
  }
  cur[keys[keys.length - 1]] = value;
}

// --- serialisation ----------------------------------------------------------

/** A single `key = value` line. Identity keys use no product prefix. */
export interface ParamLine {
  key: string;
  value: string;
  label: string;
}

function formatValue(v: unknown, type: ParamType): string {
  if (v == null) return '';
  if (type === 'bool') return v ? 'true' : 'false';
  return String(v);
}

/** Identity/header params that drive a new version on import. */
function identityLines(policy: BankPolicy): ParamLine[] {
  return [
    { key: 'brandCode', value: policy.brandCode, label: 'Brand code (do not change)' },
    { key: 'bankName', value: policy.bankName, label: 'Bank name' },
    { key: 'policyVersion', value: policy.policyVersion, label: 'Policy version label' },
    { key: 'effectiveFrom', value: policy.effectiveFrom, label: 'Effective from (YYYY-MM-DD)' },
  ];
}

/** Produce every editable `key = value` line for a policy (loss-less). */
export function serializePolicyParams(policy: BankPolicy): ParamLine[] {
  const lines: ParamLine[] = identityLines(policy);
  for (const pk of PRODUCT_KEYS) {
    const product = policy[PRODUCT_FIELD[pk]];
    for (const spec of PRODUCT_PARAM_SPECS) {
      lines.push({
        key: `${pk}.${spec.path}`,
        value: formatValue(getPath(product, spec.path), spec.type),
        label: `${PRODUCT_LABEL[pk]} — ${spec.label}`,
      });
    }
  }
  return lines;
}

// --- parsing / application --------------------------------------------------

const SPEC_BY_PATH = new Map(PRODUCT_PARAM_SPECS.map((s) => [s.path, s]));

export interface ApplyResult {
  policy: BankPolicy;
  applied: number;
  warnings: string[];
}

function coerce(raw: string, spec: ParamSpec, warnings: string[], keyForMsg: string): unknown | undefined {
  const v = raw.trim();
  switch (spec.type) {
    case 'pct':
    case 'num': {
      const n = Number(v);
      if (!Number.isFinite(n)) { warnings.push(`${keyForMsg}: "${v}" is not a number — kept previous value.`); return undefined; }
      if (spec.type === 'pct' && (n < 0 || n > 1)) warnings.push(`${keyForMsg}: ${n} is outside 0-1 (stored as a decimal).`);
      return n;
    }
    case 'int': {
      const n = Number(v);
      if (!Number.isInteger(n)) { warnings.push(`${keyForMsg}: "${v}" is not a whole number — kept previous value.`); return undefined; }
      return n;
    }
    case 'bool': {
      if (/^(true|false)$/i.test(v)) return /^true$/i.test(v);
      warnings.push(`${keyForMsg}: "${v}" is not true/false — kept previous value.`);
      return undefined;
    }
    case 'enum': {
      if (spec.enumValues?.includes(v)) return v;
      warnings.push(`${keyForMsg}: "${v}" is not one of ${spec.enumValues?.join(', ')} — kept previous value.`);
      return undefined;
    }
    default:
      return v;
  }
}

/**
 * Apply parsed `key = value` pairs onto a base policy (typically the current
 * active version, so any field not present in the document is preserved).
 * Returns a NEW policy plus a count of applied fields and validation warnings.
 */
export function applyParamsToPolicy(base: BankPolicy, kv: Map<string, string>): ApplyResult {
  const warnings: string[] = [];
  let applied = 0;
  // Deep clone so the base is never mutated.
  const policy: BankPolicy = JSON.parse(JSON.stringify(base));

  // Identity fields.
  if (kv.has('bankName') && kv.get('bankName')!.trim()) { policy.bankName = kv.get('bankName')!.trim(); applied++; }
  if (kv.has('policyVersion') && kv.get('policyVersion')!.trim()) { policy.policyVersion = kv.get('policyVersion')!.trim(); applied++; }
  if (kv.has('effectiveFrom') && /^\d{4}-\d{2}-\d{2}$/.test(kv.get('effectiveFrom')!.trim())) { policy.effectiveFrom = kv.get('effectiveFrom')!.trim(); applied++; }

  for (const pk of PRODUCT_KEYS) {
    const product = policy[PRODUCT_FIELD[pk]] as unknown as Record<string, unknown>;
    for (const spec of PRODUCT_PARAM_SPECS) {
      const fullKey = `${pk}.${spec.path}`;
      if (!kv.has(fullKey)) continue;
      const coerced = coerce(kv.get(fullKey)!, spec, warnings, fullKey);
      if (coerced !== undefined) { setPath(product, spec.path, coerced); applied++; }
    }
  }

  return { policy, applied, warnings };
}

/** Used by the export to show editors the allowed enum values inline. */
export function enumHint(productKeyDotPath: string): string | undefined {
  const path = productKeyDotPath.split('.').slice(1).join('.');
  return SPEC_BY_PATH.get(path)?.enumValues?.join(' | ');
}
