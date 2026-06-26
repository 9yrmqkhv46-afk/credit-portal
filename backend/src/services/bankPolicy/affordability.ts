/**
 * 2026 Bank Policy Engine — affordability & purchase-cost calculators.
 *
 * Real-world buyer-side maths layered on the borrowing-power engine:
 *  - estimateStampDuty(): modelled AU transfer duty by state (owner-occ vs inv).
 *  - estimateLmi(): modelled Lenders Mortgage Insurance premium by LVR band.
 *  - estimateUpfrontCosts(): stamp duty + government + conveyancing fees.
 *  - maxPurchasePrice(): given savings + state, solves the highest property
 *    price a bank would support once deposit, costs, LMI, LVR and serviceability
 *    are all accounted for (a circular relationship solved by binary search).
 *
 * DISCLAIMER: all figures are modelled estimates for indicative comparison
 * only — not financial advice, official duty, or an LMI quote.
 */

import { BankPolicy, ScenarioInput, ProductType } from './types';
import { runBankCalc } from './engine';

export type AuState = 'NSW' | 'VIC' | 'QLD' | 'WA' | 'SA' | 'TAS' | 'ACT' | 'NT';

interface DutyBracket { upTo: number; base: number; rate: number; over: number }

// Modelled, simplified 2026 transfer-duty brackets (owner-occupier baseline).
const DUTY_BRACKETS: Record<AuState, DutyBracket[]> = {
  NSW: [{ upTo: 17000, base: 0, rate: 0.0125, over: 0 }, { upTo: 36000, base: 212, rate: 0.015, over: 17000 }, { upTo: 1168000, base: 497, rate: 0.035, over: 36000 }, { upTo: Infinity, base: 40090, rate: 0.045, over: 1168000 }],
  VIC: [{ upTo: 25000, base: 0, rate: 0.014, over: 0 }, { upTo: 130000, base: 350, rate: 0.024, over: 25000 }, { upTo: 960000, base: 2870, rate: 0.06, over: 130000 }, { upTo: Infinity, base: 0, rate: 0.055, over: 0 }],
  QLD: [{ upTo: 75000, base: 0, rate: 0.015, over: 0 }, { upTo: 540000, base: 1050, rate: 0.035, over: 75000 }, { upTo: 1000000, base: 17325, rate: 0.045, over: 540000 }, { upTo: Infinity, base: 38025, rate: 0.0575, over: 1000000 }],
  WA: [{ upTo: 120000, base: 0, rate: 0.019, over: 0 }, { upTo: 360000, base: 2280, rate: 0.0285, over: 120000 }, { upTo: 725000, base: 9120, rate: 0.0475, over: 360000 }, { upTo: Infinity, base: 26457, rate: 0.0515, over: 725000 }],
  SA: [{ upTo: 200000, base: 0, rate: 0.03, over: 0 }, { upTo: 500000, base: 6000, rate: 0.04, over: 200000 }, { upTo: Infinity, base: 18000, rate: 0.055, over: 500000 }],
  TAS: [{ upTo: 200000, base: 0, rate: 0.035, over: 0 }, { upTo: Infinity, base: 7000, rate: 0.045, over: 200000 }],
  ACT: [{ upTo: 200000, base: 0, rate: 0.0234, over: 0 }, { upTo: Infinity, base: 4680, rate: 0.05, over: 200000 }],
  NT: [{ upTo: Infinity, base: 0, rate: 0.0495, over: 0 }],
};

/** Modelled transfer (stamp) duty for a purchase. Investment adds a small loading. */
export function estimateStampDuty(state: AuState, price: number, opts: { isInvestment?: boolean } = {}): number {
  if (price <= 0) return 0;
  const brackets = DUTY_BRACKETS[state] ?? DUTY_BRACKETS.NSW;
  const b = brackets.find((x) => price <= x.upTo) ?? brackets[brackets.length - 1];
  const duty = b.base + Math.max(0, price - b.over) * b.rate;
  return Math.round(duty * (opts.isInvestment ? 1.05 : 1));
}

// Modelled LMI premium as a % of the loan, by LVR band (capitalised onto loan).
const LMI_BANDS: Array<{ maxLvr: number; rate: number }> = [
  { maxLvr: 0.8, rate: 0 },
  { maxLvr: 0.85, rate: 0.012 },
  { maxLvr: 0.9, rate: 0.021 },
  { maxLvr: 0.95, rate: 0.037 },
  { maxLvr: 1.0, rate: 0.046 },
];

/** Modelled LMI premium (0 at/under 80% LVR). */
export function estimateLmi(loanAmount: number, propertyValue: number): number {
  if (propertyValue <= 0 || loanAmount <= 0) return 0;
  const lvr = loanAmount / propertyValue;
  if (lvr <= 0.8) return 0;
  const band = LMI_BANDS.find((b) => lvr <= b.maxLvr) ?? LMI_BANDS[LMI_BANDS.length - 1];
  return Math.round(loanAmount * band.rate);
}

export interface UpfrontCosts {
  stampDuty: number;
  governmentFees: number;
  conveyancing: number;
  total: number;
}

/** Stamp duty + fixed government registration + conveyancing (modelled). */
export function estimateUpfrontCosts(state: AuState, price: number, opts: { isInvestment?: boolean } = {}): UpfrontCosts {
  const stampDuty = estimateStampDuty(state, price, opts);
  const governmentFees = 350; // transfer + mortgage registration (modelled flat)
  const conveyancing = 1800;  // solicitor / conveyancer (modelled flat)
  return { stampDuty, governmentFees, conveyancing, total: stampDuty + governmentFees + conveyancing };
}

export interface MaxPurchaseResult {
  maxPropertyPrice: number;
  loanRequired: number;
  depositTowardsProperty: number;
  upfrontCosts: UpfrontCosts;
  lmiPremium: number;
  lvr: number;
  bankMaxBorrow: number;
  limitedBy: 'serviceability' | 'lvr' | 'deposit';
}

/**
 * Highest property price this bank would support given the buyer's savings and
 * state. Binary-searches price because costs/LMI depend on it. `savings` is the
 * buyer's total available funds (deposit + costs).
 */
export function maxPurchasePrice(
  input: ScenarioInput,
  policy: BankPolicy,
  opts: { savings: number; state: AuState; purpose?: ProductType },
): MaxPurchaseResult {
  const purpose = opts.purpose ?? input.scenario.purpose;
  const isInvestment = purpose === 'INVESTMENT';
  const maxLvr = purpose === 'INVESTMENT' ? policy.residentialInvestment.maxLvr
    : purpose === 'COMMERCIAL_PROPERTY_LIGHT' ? policy.commercialPropertyLight.maxLvr
    : policy.residentialOwnerOcc.maxLvr;

  // For a candidate price, compute the loan needed and whether the bank supports it.
  const evaluate = (price: number) => {
    const costs = estimateUpfrontCosts(opts.state, price, { isInvestment });
    const depositTowardsProperty = Math.max(0, opts.savings - costs.total);
    const baseLoan = Math.max(0, price - depositTowardsProperty);
    const lmiPremium = estimateLmi(baseLoan, price);
    const loanRequired = baseLoan + lmiPremium; // LMI capitalised
    const lvr = price > 0 ? baseLoan / price : 0;
    const calc = runBankCalc({ ...input, scenario: { ...input.scenario, purpose, targetPropertyValue: price, targetLoanAmount: loanRequired } }, policy);
    const feasible = lvr <= maxLvr + 1e-9 && calc.finalMaxBorrow >= loanRequired;
    return { costs, depositTowardsProperty, loanRequired, lmiPremium, lvr, calc, feasible };
  };

  // Binary search for the max feasible price.
  let lo = 0;
  let hi = Math.max(opts.savings * 20, 5_000_000);
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (evaluate(mid).feasible) lo = mid; else hi = mid;
  }
  const price = Math.floor(lo / 1000) * 1000;
  const r = evaluate(price);

  // Identify the binding constraint at the solved price.
  let limitedBy: MaxPurchaseResult['limitedBy'] = 'serviceability';
  if (r.lvr >= maxLvr - 1e-6) limitedBy = 'lvr';
  if (opts.savings <= r.costs.total + 1) limitedBy = 'deposit';

  return {
    maxPropertyPrice: price,
    loanRequired: Math.round(r.loanRequired),
    depositTowardsProperty: Math.round(r.depositTowardsProperty),
    upfrontCosts: r.costs,
    lmiPremium: r.lmiPremium,
    lvr: Number(r.lvr.toFixed(4)),
    bankMaxBorrow: r.calc.finalMaxBorrow,
    limitedBy,
  };
}
