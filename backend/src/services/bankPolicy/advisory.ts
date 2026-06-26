/**
 * 2026 Bank Policy Engine — advisory tooling.
 *
 *  - suggestPathToApproval(): when a scenario falls short at a bank, computes
 *    actionable, ranked levers (trim loan, add deposit, cut card limits, clear
 *    small debts) and the smallest change to each that reaches approval.
 *  - buildComparisonReport(): a single scenario across every bank, side by side,
 *    with the binding constraint and the best pick — exportable for clients.
 *
 * DISCLAIMER: modelled estimates only — not financial advice.
 */

import { BankPolicy, ScenarioInput, BankCalcResult } from './types';
import { runBankCalc } from './engine';

export interface ApprovalSuggestion {
  lever: 'reduce_loan' | 'increase_deposit' | 'reduce_card_limits' | 'clear_debt';
  description: string;
  estimatedChange: number; // $ (or $ of limit) required
  resultingPass: boolean;
}

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

/**
 * Suggest the smallest changes that would get a shortfall scenario to PASS at
 * the given bank. Each lever is evaluated independently against the engine.
 */
export function suggestPathToApproval(input: ScenarioInput, policy: BankPolicy): {
  alreadyApproved: boolean;
  gap: number;
  suggestions: ApprovalSuggestion[];
} {
  const base = runBankCalc(input, policy);
  const target = input.scenario.targetLoanAmount;
  if (base.passFail === 'PASS') return { alreadyApproved: true, gap: 0, suggestions: [] };

  const gap = Math.max(0, target - base.finalMaxBorrow);
  const suggestions: ApprovalSuggestion[] = [];

  // Lever 1: reduce the requested loan to the bank's max.
  if (base.finalMaxBorrow > 0) {
    const reduced: ScenarioInput = { ...input, scenario: { ...input.scenario, targetLoanAmount: base.finalMaxBorrow } };
    suggestions.push({
      lever: 'reduce_loan',
      description: `Reduce the loan to ${money(base.finalMaxBorrow)} (borrow ${money(gap)} less).`,
      estimatedChange: -gap,
      resultingPass: runBankCalc(reduced, policy).passFail === 'PASS',
    });
  }

  // Lever 2: increase deposit (keep price, lower loan + LVR) — search the amount.
  let depositNeeded = 0;
  for (let add = 5000; add <= gap + 200000; add += 5000) {
    const s: ScenarioInput = { ...input, scenario: { ...input.scenario, targetLoanAmount: Math.max(0, target - add) } };
    if (runBankCalc(s, policy).passFail === 'PASS') { depositNeeded = add; break; }
  }
  if (depositNeeded > 0) {
    suggestions.push({ lever: 'increase_deposit', description: `Add ${money(depositNeeded)} deposit (lower the loan and LVR).`, estimatedChange: depositNeeded, resultingPass: true });
  }

  // Lever 3: cut total credit-card limits.
  const cards = input.debts.filter((d) => d.source === 'STANDALONE' && d.type === 'CREDIT_CARD' && (d.creditLimit ?? 0) > 0);
  const totalLimit = cards.reduce((s, c) => s + (c.creditLimit ?? 0), 0);
  if (totalLimit > 0) {
    let cutNeeded = 0;
    for (let cut = 2000; cut <= totalLimit; cut += 2000) {
      const remaining = Math.max(0, totalLimit - cut);
      const scaled = totalLimit > 0 ? remaining / totalLimit : 0;
      const s: ScenarioInput = { ...input, debts: input.debts.map((d) => (d.type === 'CREDIT_CARD' && d.source === 'STANDALONE') ? { ...d, creditLimit: (d.creditLimit ?? 0) * scaled } : d) };
      if (runBankCalc(s, policy).passFail === 'PASS') { cutNeeded = cut; break; }
    }
    if (cutNeeded > 0) suggestions.push({ lever: 'reduce_card_limits', description: `Reduce credit-card limits by ${money(cutNeeded)} of ${money(totalLimit)}.`, estimatedChange: cutNeeded, resultingPass: true });
  }

  // Lever 4: clear the largest small standalone debt.
  const clearable = input.debts.filter((d) => d.source === 'STANDALONE' && d.type !== 'CREDIT_CARD' && (d.monthlyRepayment ?? 0) > 0)
    .sort((a, b) => (b.monthlyRepayment ?? 0) - (a.monthlyRepayment ?? 0))[0];
  if (clearable) {
    const s: ScenarioInput = { ...input, debts: input.debts.filter((d) => d.id !== clearable.id) };
    if (runBankCalc(s, policy).passFail === 'PASS') {
      suggestions.push({ lever: 'clear_debt', description: `Clear the ${clearable.type.toLowerCase().replace(/_/g, ' ')} (${money((clearable.monthlyRepayment ?? 0))}/mo).`, estimatedChange: clearable.currentBalance ?? 0, resultingPass: true });
    }
  }

  return { alreadyApproved: false, gap, suggestions };
}

export interface ComparisonRow {
  brandCode: string;
  bankName: string;
  finalMaxBorrow: number;
  passFail: string;
  dti: number;
  lvr: number;
  surplus: number;
  bindingConstraint: string;
}

export interface ComparisonReport {
  scenario: ScenarioInput['scenario'];
  rows: ComparisonRow[];
  bestPick: string | null;
  generatedAt: string;
}

function bindingConstraint(c: BankCalcResult): string {
  const caps: Array<[string, number]> = [
    ['serviceability', c.maxBorrowServiceability],
    ['DTI', c.maxBorrowDti],
    ['LVR', c.maxBorrowLvr],
  ];
  return caps.sort((a, b) => a[1] - b[1])[0][0];
}

/** Run one scenario across all banks and assemble a side-by-side report. */
export function buildComparisonReport(input: ScenarioInput, policies: BankPolicy[]): ComparisonReport {
  const rows: ComparisonRow[] = policies.map((p) => {
    const c = runBankCalc(input, p);
    return {
      brandCode: p.brandCode, bankName: p.bankName,
      finalMaxBorrow: c.finalMaxBorrow, passFail: c.passFail,
      dti: c.dtiRatio, lvr: c.lvrRatio, surplus: c.netMonthlySurplus,
      bindingConstraint: bindingConstraint(c),
    };
  }).sort((a, b) => b.finalMaxBorrow - a.finalMaxBorrow);

  const best = rows.find((r) => r.passFail === 'PASS') ?? rows[0];
  return { scenario: input.scenario, rows, bestPick: best?.brandCode ?? null, generatedAt: new Date().toISOString() };
}
